//! Menu-bar mini transport (Settings › System "Keep playing from the menu bar", off by default).
//!
//! The tray menu reuses the Transport ids (`transport.playPause`, `transport.stop`), so its clicks reach JS as the
//! same `menu://action` events as the menu bar (the global `on_menu_event` handler sees tray menus too). "Show
//! Phyllo" and "Quit Phyllo" are handled in Rust.

use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Wry};

use crate::error::{Error, Result};
use crate::menu::{TRANSPORT_PLAY_PAUSE, TRANSPORT_STOP, TRAY_QUIT, TRAY_SHOW};

pub const TRAY_ID: &str = "phyllo-tray";

#[derive(Default)]
pub struct TrayState {
    play_item: Mutex<Option<MenuItem<Wry>>>,
    playing: AtomicBool,
}

pub fn play_label(playing: bool) -> &'static str {
    if playing { "Pause" } else { "Play" }
}

pub fn tooltip(playing: bool) -> &'static str {
    if playing {
        "Phyllo — playing"
    } else {
        "Phyllo"
    }
}

fn tray_err(e: tauri::Error) -> Error {
    Error::Tray(e.to_string())
}

/// macOS gets a monochrome template image (tinted by the system for light/dark menu bars); elsewhere the app icon.
fn icon(app: &AppHandle) -> Option<Image<'static>> {
    #[cfg(target_os = "macos")]
    {
        let _ = app;
        Some(tauri::include_image!("icons/tray-template.png"))
    }
    #[cfg(not(target_os = "macos"))]
    {
        app.default_window_icon().map(|i| i.clone().to_owned())
    }
}

/// Create or remove the tray icon. Returns whether a tray icon exists afterwards.
pub fn set_enabled(app: &AppHandle, state: &TrayState, enabled: bool) -> Result<bool> {
    if !enabled {
        app.remove_tray_by_id(TRAY_ID);
        *state.play_item.lock().unwrap_or_else(|e| e.into_inner()) = None;
        return Ok(false);
    }
    if app.tray_by_id(TRAY_ID).is_some() {
        return Ok(true);
    }
    let playing = state.playing.load(Ordering::SeqCst);
    let play = MenuItem::with_id(
        app,
        TRANSPORT_PLAY_PAUSE,
        play_label(playing),
        true,
        None::<&str>,
    )
    .map_err(tray_err)?;
    let stop =
        MenuItem::with_id(app, TRANSPORT_STOP, "Stop", true, None::<&str>).map_err(tray_err)?;
    let show =
        MenuItem::with_id(app, TRAY_SHOW, "Show Phyllo", true, None::<&str>).map_err(tray_err)?;
    let quit =
        MenuItem::with_id(app, TRAY_QUIT, "Quit Phyllo", true, None::<&str>).map_err(tray_err)?;
    let sep = PredefinedMenuItem::separator(app).map_err(tray_err)?;
    let menu = Menu::with_items(app, &[&play, &stop, &sep, &show, &quit]).map_err(tray_err)?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .tooltip(tooltip(playing))
        .show_menu_on_left_click(true);
    if let Some(image) = icon(app) {
        builder = builder.icon(image);
    }
    #[cfg(target_os = "macos")]
    {
        builder = builder.icon_as_template(true);
    }
    builder.build(app).map_err(tray_err)?;
    *state.play_item.lock().unwrap_or_else(|e| e.into_inner()) = Some(play);
    Ok(true)
}

/// Update the Play/Pause label and tooltip. Remembered for the next `set_enabled(true)` when no tray exists.
pub fn set_playing(app: &AppHandle, state: &TrayState, playing: bool) -> Result<()> {
    state.playing.store(playing, Ordering::SeqCst);
    if let Some(item) = state
        .play_item
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .as_ref()
    {
        item.set_text(play_label(playing)).map_err(tray_err)?;
    }
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_tooltip(Some(tooltip(playing))).map_err(tray_err)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::menu::{Route, action};

    #[test]
    fn labels_follow_playing_state() {
        assert_eq!(play_label(false), "Play");
        assert_eq!(play_label(true), "Pause");
        assert_ne!(tooltip(true), tooltip(false));
    }

    #[test]
    fn tray_transport_ids_are_menu_actions_routed_to_main() {
        for id in [TRANSPORT_PLAY_PAUSE, TRANSPORT_STOP] {
            let a = action(id).expect("tray id must be in the menu table");
            assert_eq!(a.route, Route::Main);
        }
        // tray.* ids are handled in Rust and are deliberately not in the table.
        assert!(action(TRAY_SHOW).is_none() && action(TRAY_QUIT).is_none());
    }
}
