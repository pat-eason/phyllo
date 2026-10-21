//! Windows: the single main window (label `main`, from tauri.conf.json). Settings is a route (`#/settings`) inside
//! it, not a window of its own.

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Manager, Window, WindowEvent};

pub const MAIN: &str = "main";

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

/// Bring the main window back (after "close" hid it, or from the tray / Dock / an opened file).
pub fn show_main(app: &AppHandle) {
    if let Some(main) = app.get_webview_window(MAIN) {
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_focus();
    }
}

/// Main-window close: hide when "keep running" is on; otherwise let it close (and the app quit).
pub fn on_window_event(window: &Window, event: &WindowEvent) {
    if window.label() != MAIN {
        return;
    }
    if let WindowEvent::CloseRequested { api, .. } = event {
        let app = window.app_handle();
        if app.state::<KeepRunning>().get() {
            api.prevent_close();
            let _ = window.hide();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keep_running_defaults_off() {
        let k = KeepRunning::default();
        assert!(!k.get());
        k.set(true);
        assert!(k.get());
    }
}
