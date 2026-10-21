//! Windows: the main window (label `main`, from tauri.conf.json) and the Settings window (label `settings`).
//!
//! Settings is a second web view on the same bundle at `index.html#/settings`. The two share no Rust state:
//! settings sync between them in JS through global Tauri events (`emit` from `@tauri-apps/api/event`, received by
//! every window's `listen`); `NativeApi.broadcast` / `onBroadcast` wrap that.

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, Window, WindowEvent};

use crate::error::{Error, Result};

pub const MAIN: &str = "main";
pub const SETTINGS: &str = "settings";
pub const SETTINGS_URL: &str = "index.html#/settings";
pub const SETTINGS_SIZE: (f64, f64) = (1100.0, 800.0);
pub const SETTINGS_MIN_SIZE: (f64, f64) = (900.0, 600.0);

/// "Keep playing from the menu bar": when set, closing the main window hides it (the web view and its
/// AudioContext stay alive) instead of quitting.
#[derive(Default)]
pub struct KeepRunning(AtomicBool);

impl KeepRunning {
    pub fn set(&self, keep: bool) {
        self.0.store(keep, Ordering::SeqCst);
    }

    pub fn get(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
}

fn window_err(e: tauri::Error) -> Error {
    Error::Window(e.to_string())
}

/// Bring the main window back (after "close" hid it, or from the tray / Dock / an opened file).
pub fn show_main(app: &AppHandle) {
    if let Some(main) = app.get_webview_window(MAIN) {
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_focus();
    }
}

/// Focus the Settings window, creating it on first use.
pub fn open_settings(app: &AppHandle) -> Result<()> {
    if let Some(existing) = app.get_webview_window(SETTINGS) {
        existing.show().map_err(window_err)?;
        let _ = existing.unminimize();
        existing.set_focus().map_err(window_err)?;
        return Ok(());
    }
    let builder = WebviewWindowBuilder::new(app, SETTINGS, WebviewUrl::App(SETTINGS_URL.into()))
        .title("Phyllo Settings")
        .inner_size(SETTINGS_SIZE.0, SETTINGS_SIZE.1)
        .min_inner_size(SETTINGS_MIN_SIZE.0, SETTINGS_MIN_SIZE.1)
        .focused(true);
    // Same chrome as the main window (SPEC §2.7): content under a transparent title bar, traffic lights kept.
    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true);
    builder.build().map_err(window_err)?;
    Ok(())
}

/// Main-window close: hide when "keep running" is on; otherwise let it close and take Settings with it so the app
/// quits instead of lingering with only a Settings window.
pub fn on_window_event(window: &Window, event: &WindowEvent) {
    if window.label() != MAIN {
        return;
    }
    if let WindowEvent::CloseRequested { api, .. } = event {
        let app = window.app_handle();
        if app.state::<KeepRunning>().get() {
            api.prevent_close();
            let _ = window.hide();
        } else if let Some(settings) = app.get_webview_window(SETTINGS) {
            let _ = settings.close();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_window_matches_the_design() {
        // design-system/components/screens.md: Settings is a separate 1100x800 window.
        assert_eq!(SETTINGS_SIZE, (1100.0, 800.0));
        assert!(SETTINGS_MIN_SIZE.0 <= SETTINGS_SIZE.0 && SETTINGS_MIN_SIZE.1 <= SETTINGS_SIZE.1);
        assert!(SETTINGS_URL.ends_with("#/settings"));
        assert_ne!(MAIN, SETTINGS);
    }

    #[test]
    fn keep_running_defaults_off() {
        let k = KeepRunning::default();
        assert!(!k.get());
        k.set(true);
        assert!(k.get());
    }
}
