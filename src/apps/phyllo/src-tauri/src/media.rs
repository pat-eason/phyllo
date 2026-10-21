//! Media keys and Now Playing (Settings › System "Media keys control playback", on by default; JS turns it on).
//!
//! macOS: handlers on `MPRemoteCommandCenter` (play, pause, toggle, stop, next, previous) emit `media://command`
//! `{ command }` to the main window, and `MPNowPlayingInfoCenter` carries the project name and playback state.
//! macOS has no AVAudioSession, so none is set up. On macOS `MPNowPlayingInfoCenter.playbackState` is the switch
//! Apple documents for becoming the Now Playing app, so `set_now_playing` sets it as well as the info dictionary.
//! Not verified here (no UI session): whether macOS routes the hardware key to Phyllo when the audible output
//! comes from WKWebView's separate WebContent process rather than this one, and whether WebKit's own media-session
//! integration competes for the same keys. If keys don't arrive, the JS fallback below is the next thing to try.
//!
//! Elsewhere the commands are no-ops returning `false`; the web view's `navigator.mediaSession` is the JS fallback.
//!
//! All MediaPlayer calls run on the main thread (`run_on_main_thread`); the command targets are main-thread-only
//! Objective-C objects, so they live in a thread-local there.

use std::sync::atomic::{AtomicBool, Ordering};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::error::Result;

pub const EVENT_MEDIA_COMMAND: &str = "media://command";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MediaCommand {
    Play,
    Pause,
    Toggle,
    Stop,
    Next,
    Previous,
}

#[derive(Clone, Debug, Serialize)]
pub struct MediaCommandEvent {
    pub command: MediaCommand,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NowPlaying {
    pub title: String,
    pub playing: bool,
}

/// Whether remote-command handlers are registered.
#[derive(Default)]
pub struct MediaState(AtomicBool);

impl MediaState {
    pub fn enabled(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
}

/// Register (or remove) the remote-command handlers. Returns whether native media keys are active.
pub fn set_enabled(app: &AppHandle, state: &MediaState, enabled: bool) -> Result<bool> {
    #[cfg(target_os = "macos")]
    {
        let handle = app.clone();
        app.run_on_main_thread(move || {
            if enabled {
                mac::enable(handle);
            } else {
                mac::disable();
            }
        })
        .map_err(|e| crate::error::Error::Internal(e.to_string()))?;
        state.0.store(enabled, Ordering::SeqCst);
        Ok(enabled)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, enabled);
        state.0.store(false, Ordering::SeqCst);
        Ok(false)
    }
}

/// Publish the project name and play state. Returns `false` (and does nothing) unless native media keys are on.
pub fn set_now_playing(app: &AppHandle, state: &MediaState, info: NowPlaying) -> Result<bool> {
    if !state.enabled() {
        return Ok(false);
    }
    #[cfg(target_os = "macos")]
    {
        app.run_on_main_thread(move || mac::set_now_playing(&info.title, info.playing))
            .map_err(|e| crate::error::Error::Internal(e.to_string()))?;
        Ok(true)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, info);
        Ok(false)
    }
}

#[cfg(target_os = "macos")]
mod mac {
    use std::cell::RefCell;
    use std::ptr::NonNull;

    use block2::RcBlock;
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2_foundation::{NSDictionary, NSNumber, NSString};
    use objc2_media_player::{
        MPMediaItemPropertyTitle, MPNowPlayingInfoCenter, MPNowPlayingInfoPropertyPlaybackRate,
        MPNowPlayingPlaybackState, MPRemoteCommand, MPRemoteCommandCenter, MPRemoteCommandEvent,
        MPRemoteCommandHandlerStatus,
    };
    use tauri::{AppHandle, Emitter, EventTarget};

    use super::{EVENT_MEDIA_COMMAND, MediaCommand, MediaCommandEvent};
    use crate::windows;

    thread_local! {
        /// (command, opaque target returned by `addTargetWithHandler:`), main thread only.
        static TARGETS: RefCell<Vec<(Retained<MPRemoteCommand>, Retained<AnyObject>)>> = const { RefCell::new(Vec::new()) };
    }

    fn commands() -> Vec<(Retained<MPRemoteCommand>, MediaCommand)> {
        // SAFETY: plain getters on the process-wide command center; called on the main thread.
        unsafe {
            let center = MPRemoteCommandCenter::sharedCommandCenter();
            vec![
                (center.playCommand(), MediaCommand::Play),
                (center.pauseCommand(), MediaCommand::Pause),
                (center.togglePlayPauseCommand(), MediaCommand::Toggle),
                (center.stopCommand(), MediaCommand::Stop),
                (center.nextTrackCommand(), MediaCommand::Next),
                (center.previousTrackCommand(), MediaCommand::Previous),
            ]
        }
    }

    pub fn enable(app: AppHandle) {
        disable();
        for (command, kind) in commands() {
            let app = app.clone();
            let handler = RcBlock::new(move |_event: NonNull<MPRemoteCommandEvent>| {
                let _ = app.emit_to(
                    EventTarget::webview_window(windows::MAIN),
                    EVENT_MEDIA_COMMAND,
                    MediaCommandEvent { command: kind },
                );
                MPRemoteCommandHandlerStatus::Success
            });
            // SAFETY: the block is 'static and returns the status the API expects; MediaPlayer copies it.
            let target = unsafe {
                command.setEnabled(true);
                command.addTargetWithHandler(&handler)
            };
            TARGETS.with(|t| t.borrow_mut().push((command, target)));
        }
    }

    pub fn disable() {
        let targets = TARGETS.with(|t| std::mem::take(&mut *t.borrow_mut()));
        for (command, target) in targets {
            // SAFETY: removing a target this module added, on the main thread.
            unsafe {
                command.removeTarget(Some(&target));
                command.setEnabled(false);
            }
        }
        // SAFETY: main-thread call on the default center; `None` clears the published info.
        unsafe {
            let center = MPNowPlayingInfoCenter::defaultCenter();
            center.setNowPlayingInfo(None);
            center.setPlaybackState(MPNowPlayingPlaybackState::Stopped);
        }
    }

    pub fn set_now_playing(title: &str, playing: bool) {
        let title = NSString::from_str(title);
        let rate = NSNumber::new_f64(if playing { 1.0 } else { 0.0 });
        // SAFETY: the key constants are immutable NSStrings exported by MediaPlayer.framework.
        let keys: [&NSString; 2] = unsafe {
            [
                MPMediaItemPropertyTitle,
                MPNowPlayingInfoPropertyPlaybackRate,
            ]
        };
        let values: [&AnyObject; 2] = [&title, &rate];
        let info = NSDictionary::from_slices(&keys, &values);
        // SAFETY: main-thread call on the default center with a dictionary of plist-compatible values.
        unsafe {
            let center = MPNowPlayingInfoCenter::defaultCenter();
            center.setNowPlayingInfo(Some(&info));
            center.setPlaybackState(if playing {
                MPNowPlayingPlaybackState::Playing
            } else {
                MPNowPlayingPlaybackState::Paused
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn command_event_wire_shape() {
        let all = [
            (MediaCommand::Play, "play"),
            (MediaCommand::Pause, "pause"),
            (MediaCommand::Toggle, "toggle"),
            (MediaCommand::Stop, "stop"),
            (MediaCommand::Next, "next"),
            (MediaCommand::Previous, "previous"),
        ];
        for (command, name) in all {
            let v = serde_json::to_value(MediaCommandEvent { command }).unwrap();
            assert_eq!(v, serde_json::json!({ "command": name }));
        }
    }

    #[test]
    fn now_playing_reads_camel_case() {
        let n: NowPlaying =
            serde_json::from_value(serde_json::json!({ "title": "Groove", "playing": true }))
                .unwrap();
        assert_eq!(n.title, "Groove");
        assert!(n.playing);
    }

    #[test]
    fn starts_disabled() {
        assert!(!MediaState::default().enabled());
    }
}
