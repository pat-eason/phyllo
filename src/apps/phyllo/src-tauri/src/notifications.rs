//! "Export finished" notification with a Reveal action (SPEC §5).
//!
//! tauri-plugin-notification 2.7 reports desktop clicks: once an `on_action` handler exists, notifications that name
//! a registered action type get its buttons, and a click on a button (its id) or on the body (`tap`) is reported
//! (macOS/Windows through notify-rust's `wait_for_response`, on a thread per shown notification; Linux through the
//! D-Bus server). Reveal shows the file in Finder/Explorer; a click on the body brings Phyllo to the front.
//!
//! The handler is registered on first use, because from then on every notification of the app (also the plain
//! ones sent from JS) is tracked on its own thread until it is dismissed.
//!
//! Caveats: under `tauri dev` on macOS the plugin posts as Terminal (`com.apple.Terminal`), so buttons may not show
//! until the app is bundled; Windows only reports clicks while the toast is on screen. The in-app Toast keeps its own
//! Reveal button either way.

use std::sync::Once;

use serde::Deserialize;
use tauri::AppHandle;
use tauri_plugin_notification::{Action, ActionType, NotificationExt};

use crate::error::{Error, Result};
use crate::windows;

pub const ACTION_TYPE_EXPORT: &str = "phyllo-export-finished";
pub const ACTION_REVEAL: &str = "reveal";
/// What the plugin reports for a click on the notification body.
pub const ACTION_TAP: &str = "tap";
const EXTRA_PATH: &str = "path";

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportFinished {
    pub title: String,
    pub body: String,
    pub path: String,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Response {
    Reveal(String),
    ShowApp,
    Ignore,
}

/// Map a reported action to what Phyllo does.
pub fn respond(action_id: &str, path: Option<&str>) -> Response {
    match (action_id, path) {
        (ACTION_REVEAL, Some(p)) if !p.is_empty() => Response::Reveal(p.to_string()),
        (ACTION_TAP, _) => Response::ShowApp,
        _ => Response::Ignore,
    }
}

static REGISTER: Once = Once::new();

fn register(app: &AppHandle) -> Result<()> {
    let mut result = Ok(());
    REGISTER.call_once(|| {
        let n = app.notification();
        let reveal_title = if cfg!(target_os = "macos") {
            "Reveal in Finder"
        } else {
            "Show in Folder"
        };
        let types = vec![
            ActionType::builder(ACTION_TYPE_EXPORT)
                .actions(vec![Action::builder(ACTION_REVEAL, reveal_title).build()])
                .build(),
        ];
        if let Err(e) = n.register_action_types(types) {
            result = Err(Error::Notification(e.to_string()));
            return;
        }
        let handle = app.clone();
        let registered = n.on_action(move |performed| {
            let path = performed
                .notification()
                .and_then(|n| n.extra().get(EXTRA_PATH))
                .and_then(|v| v.as_str());
            match respond(performed.action_id(), path) {
                Response::Reveal(p) => {
                    if let Err(e) = tauri_plugin_opener::reveal_item_in_dir(&p) {
                        eprintln!("phyllo: reveal {p}: {e}");
                    }
                }
                Response::ShowApp => windows::show_main(&handle),
                Response::Ignore => {}
            }
        });
        if let Err(e) = registered {
            result = Err(Error::Notification(e.to_string()));
        }
    });
    result
}

/// Show the native notification. Resolves `true` once it was handed to the OS (desktop needs no permission).
pub fn export_finished(app: &AppHandle, n: ExportFinished) -> Result<bool> {
    register(app)?;
    app.notification()
        .builder()
        .title(n.title)
        .body(n.body)
        .action_type_id(ACTION_TYPE_EXPORT)
        .extra(EXTRA_PATH, n.path)
        .show()
        .map_err(|e| Error::Notification(e.to_string()))?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reveal_needs_a_path() {
        assert_eq!(
            respond(ACTION_REVEAL, Some("/x/mix.wav")),
            Response::Reveal("/x/mix.wav".into())
        );
        assert_eq!(respond(ACTION_REVEAL, None), Response::Ignore);
        assert_eq!(respond(ACTION_REVEAL, Some("")), Response::Ignore);
    }

    #[test]
    fn body_click_shows_the_app_and_others_are_ignored() {
        assert_eq!(respond(ACTION_TAP, Some("/x/mix.wav")), Response::ShowApp);
        assert_eq!(respond(ACTION_TAP, None), Response::ShowApp);
        assert_eq!(respond("dismiss", Some("/x")), Response::Ignore);
    }

    #[test]
    fn export_finished_reads_camel_case() {
        let n: ExportFinished =
            serde_json::from_value(serde_json::json!({ "title": "Export finished", "body": "mix.wav", "path": "/m/mix.wav" }))
                .unwrap();
        assert_eq!(n.path, "/m/mix.wav");
    }
}
