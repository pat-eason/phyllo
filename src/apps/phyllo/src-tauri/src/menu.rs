//! The native menu bar (SPEC §7, design-system screens.md "Navigation").
//!
//! Every custom item is listed once in [`ACTIONS`]; the menu is assembled from that table. A click (or its
//! accelerator) emits `menu://action` `{ id }` to the main window, where the stores live; the few app-level items
//! (`app.settings`, `app.quit`, `window.main`, the tray's `tray.*`) are handled here in Rust. JS keeps labels and
//! check marks in sync through `menu_set_state` and fills File › Open Recent through `menu_set_recent`.
//!
//! Text editing: Edit uses the *predefined* Undo/Redo/Cut/Copy/Paste/Select All items. On macOS those send the
//! standard `undo:`/`copy:`… selectors down the responder chain, which is the only way inputs, textareas and
//! CodeMirror inside WKWebView get the clipboard and native undo. App-level undo (arrangement edits) is decided in
//! JS: WKWebView offers key equivalents to the page before the menu, so a `keydown` handler for ⌘Z / ⇧⌘Z that
//! finds focus outside an editable element calls `preventDefault()` and runs the app's undo; inside a text field it
//! does nothing and the predefined item performs the native undo. Choosing Edit › Undo with the mouse always
//! performs the native (text) undo.
//!
//! Transport items have no single-key accelerators (Space, Enter, L, R): those keys must keep working in text
//! inputs, so JS handles them with focus checks (SPEC §7).

use std::collections::HashMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::menu::{
    AboutMetadata, CheckMenuItemBuilder, IsMenuItem, Menu, MenuItem, MenuItemBuilder, MenuItemKind,
    PredefinedMenuItem, Submenu, SubmenuBuilder,
};
use tauri::{AppHandle, Emitter, EventTarget, Wry};

use crate::error::{Error, Result};
use crate::windows;

pub const EVENT_MENU_ACTION: &str = "menu://action";

/// Ids of the Open Recent entries: `file.recent.0`, `file.recent.1`, …
pub const RECENT_PREFIX: &str = "file.recent.";
pub const RECENT_CLEAR: &str = "file.recent.clear";
/// The `menu://action` id sent for a click on a recent entry (with its `path`).
pub const OPEN_RECENT: &str = "file.openRecent";
pub const MAX_RECENT: usize = 10;

/// Handled in Rust; never reach JS.
pub const APP_SETTINGS: &str = "app.settings";
pub const APP_QUIT: &str = "app.quit";
pub const WINDOW_MAIN: &str = "window.main";
pub const TRAY_SHOW: &str = "tray.show";
pub const TRAY_QUIT: &str = "tray.quit";

pub const TRANSPORT_PLAY_PAUSE: &str = "transport.playPause";
pub const TRANSPORT_STOP: &str = "transport.stop";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Normal,
    Check,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Route {
    /// Emit to the main window and leave window order alone (transport, theme: they also come from the tray).
    Main,
    /// Emit to the main window and bring it to the front (file, view, help: their UI lives there).
    MainReveal,
    /// Handled in Rust.
    Native,
}

#[derive(Clone, Copy, Debug)]
pub struct Action {
    pub id: &'static str,
    pub label: &'static str,
    /// muda accelerator syntax; `CmdOrCtrl` is ⌘ on macOS and Ctrl elsewhere.
    pub accelerator: Option<&'static str>,
    pub kind: Kind,
    pub route: Route,
}

const fn item(
    id: &'static str,
    label: &'static str,
    accelerator: Option<&'static str>,
    route: Route,
) -> Action {
    Action {
        id,
        label,
        accelerator,
        kind: Kind::Normal,
        route,
    }
}

const fn check(id: &'static str, label: &'static str, route: Route) -> Action {
    Action {
        id,
        label,
        accelerator: None,
        kind: Kind::Check,
        route,
    }
}

use Route::{Main, MainReveal, Native};

/// Every custom menu item. Mirrored by `MENU_ACTIONS` in `src/native/types.ts` (a test keeps the two in sync).
pub const ACTIONS: &[Action] = &[
    // App
    item(APP_SETTINGS, "Settings…", Some("CmdOrCtrl+,"), Native),
    item(APP_QUIT, "Quit Phyllo", Some("CmdOrCtrl+Q"), Native),
    // File
    item("file.new", "New Groove", Some("CmdOrCtrl+N"), MainReveal),
    item("file.open", "Open…", Some("CmdOrCtrl+O"), MainReveal),
    item("file.save", "Save", Some("CmdOrCtrl+S"), MainReveal),
    item(
        "file.saveAs",
        "Save As…",
        Some("Shift+CmdOrCtrl+S"),
        MainReveal,
    ),
    item("file.history", "Version History…", None, MainReveal),
    item("file.import", "Import…", None, MainReveal),
    item("file.export", "Export…", Some("CmdOrCtrl+E"), MainReveal),
    item(RECENT_CLEAR, "Clear Menu", None, Main),
    // View
    item("view.arrange", "Arrange", Some("CmdOrCtrl+1"), MainReveal),
    item("view.pattern", "Pattern", Some("CmdOrCtrl+2"), MainReveal),
    item("view.mixer", "Mixer", Some("CmdOrCtrl+3"), MainReveal),
    item(
        "view.library",
        "Library",
        Some("Shift+CmdOrCtrl+L"),
        MainReveal,
    ),
    item(
        "view.codeDrawer",
        "Toggle Code Drawer",
        Some("CmdOrCtrl+/"),
        MainReveal,
    ),
    item(
        "view.uiMode",
        "Toggle Guided / Pro",
        Some("Shift+CmdOrCtrl+G"),
        MainReveal,
    ),
    check("view.theme.dark", "Dark", Main),
    check("view.theme.light", "Light", Main),
    check("view.theme.system", "Match System", Main),
    // Transport (no accelerators: Space/Enter/L/R stay with JS so text inputs keep them)
    item(TRANSPORT_PLAY_PAUSE, "Play", None, Main),
    item(TRANSPORT_STOP, "Stop", None, Main),
    item("transport.backToStart", "Back to Start", None, Main),
    check("transport.loop", "Loop", Main),
    check("transport.record", "Record", Main),
    // Window
    item(WINDOW_MAIN, "Phyllo", None, Native),
    // Help
    item("help.shortcuts", "Keyboard Shortcuts", None, MainReveal),
    item("help.strudel", "Strudel Reference", None, MainReveal),
];

pub fn action(id: &str) -> Option<&'static Action> {
    ACTIONS.iter().find(|a| a.id == id)
}

/// `file.recent.3` -> `Some(3)`; anything else (including `file.recent.clear`) -> `None`.
pub fn parse_recent_id(id: &str) -> Option<usize> {
    id.strip_prefix(RECENT_PREFIX)?.parse().ok()
}

pub fn recent_id(index: usize) -> String {
    format!("{RECENT_PREFIX}{index}")
}

// ── Wire types ──────────────────────────────────────────────────────────────

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MenuActionEvent {
    pub id: String,
    /// Set for `file.openRecent`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MenuItemState {
    pub id: String,
    pub enabled: Option<bool>,
    pub checked: Option<bool>,
    pub text: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RecentItem {
    pub path: String,
    pub name: String,
}

// ── Live menu ───────────────────────────────────────────────────────────────

/// Handles to the custom items (by id) and the Open Recent submenu, so commands can change them later.
#[derive(Default)]
pub struct MenuState {
    items: Mutex<HashMap<String, MenuItemKind<Wry>>>,
    recent_menu: Mutex<Option<Submenu<Wry>>>,
    recent_items: Mutex<Vec<RecentItem>>,
}

fn menu_err(e: tauri::Error) -> Error {
    Error::Menu(e.to_string())
}

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

impl MenuState {
    fn custom(&self, app: &AppHandle, id: &str) -> Result<MenuItemKind<Wry>> {
        let a = action(id).ok_or_else(|| Error::Menu(format!("unknown menu action {id}")))?;
        let kind = match a.kind {
            Kind::Normal => {
                let mut b = MenuItemBuilder::with_id(a.id, a.label);
                if let Some(acc) = a.accelerator {
                    b = b.accelerator(acc);
                }
                MenuItemKind::MenuItem(b.build(app).map_err(menu_err)?)
            }
            Kind::Check => MenuItemKind::Check(
                CheckMenuItemBuilder::with_id(a.id, a.label)
                    .build(app)
                    .map_err(menu_err)?,
            ),
        };
        lock(&self.items).insert(a.id.to_string(), kind.clone());
        Ok(kind)
    }

    /// Apply `enabled` / `checked` / `text` to a custom item. `checked` on a plain item is rejected.
    pub fn set_state(&self, state: &MenuItemState) -> Result<()> {
        let items = lock(&self.items);
        let Some(item) = items.get(&state.id) else {
            return Err(Error::NotFound(format!("menu item {}", state.id)));
        };
        match item {
            MenuItemKind::MenuItem(i) => {
                if state.checked.is_some() {
                    return Err(Error::InvalidArgument(format!(
                        "{} is not a check item",
                        state.id
                    )));
                }
                if let Some(e) = state.enabled {
                    i.set_enabled(e).map_err(menu_err)?;
                }
                if let Some(t) = &state.text {
                    i.set_text(t).map_err(menu_err)?;
                }
            }
            MenuItemKind::Check(i) => {
                if let Some(e) = state.enabled {
                    i.set_enabled(e).map_err(menu_err)?;
                }
                if let Some(c) = state.checked {
                    i.set_checked(c).map_err(menu_err)?;
                }
                if let Some(t) = &state.text {
                    i.set_text(t).map_err(menu_err)?;
                }
            }
            _ => return Err(Error::Menu(format!("{} cannot be changed", state.id))),
        }
        Ok(())
    }

    /// Replace File › Open Recent (at most [`MAX_RECENT`] entries, most recent first as given).
    pub fn set_recent(&self, app: &AppHandle, items: Vec<RecentItem>) -> Result<()> {
        let items: Vec<RecentItem> = items.into_iter().take(MAX_RECENT).collect();
        let submenu = lock(&self.recent_menu)
            .clone()
            .ok_or_else(|| Error::Menu("menu not built".into()))?;
        fill_recent(app, &submenu, &items)?;
        *lock(&self.recent_items) = items;
        Ok(())
    }

    fn recent_path(&self, index: usize) -> Option<String> {
        lock(&self.recent_items).get(index).map(|r| r.path.clone())
    }
}

fn fill_recent(app: &AppHandle, submenu: &Submenu<Wry>, items: &[RecentItem]) -> Result<()> {
    for existing in submenu.items().map_err(menu_err)? {
        submenu.remove(&existing).map_err(menu_err)?;
    }
    for (i, r) in items.iter().enumerate() {
        let entry =
            MenuItem::with_id(app, recent_id(i), &r.name, true, None::<&str>).map_err(menu_err)?;
        submenu.append(&entry).map_err(menu_err)?;
    }
    if !items.is_empty() {
        submenu
            .append(&PredefinedMenuItem::separator(app).map_err(menu_err)?)
            .map_err(menu_err)?;
    }
    let a = action(RECENT_CLEAR).expect("clear action in table");
    let clear =
        MenuItem::with_id(app, a.id, a.label, !items.is_empty(), None::<&str>).map_err(menu_err)?;
    submenu.append(&clear).map_err(menu_err)?;
    Ok(())
}

/// Build the menu bar and register its handles in `state`.
pub fn build(app: &AppHandle, state: &MenuState) -> Result<Menu<Wry>> {
    let c = |id: &str| state.custom(app, id);
    let sep = || PredefinedMenuItem::separator(app).map_err(menu_err);
    let pre = |r: tauri::Result<PredefinedMenuItem<Wry>>| r.map_err(menu_err);

    let about = AboutMetadata {
        name: Some("Phyllo".into()),
        version: Some(app.package_info().version.to_string()),
        comments: Some("A DAW-style home for Strudel".into()),
        ..Default::default()
    };

    // File › Open Recent, filled from JS.
    let recent = SubmenuBuilder::with_id(app, "file.recent", "Open Recent")
        .build()
        .map_err(menu_err)?;
    fill_recent(app, &recent, &[])?;
    *lock(&state.recent_menu) = Some(recent.clone());

    let mut file: Vec<MenuItemKind<Wry>> = vec![
        c("file.new")?,
        c("file.open")?,
        MenuItemKind::Submenu(recent),
        MenuItemKind::Predefined(sep()?),
        c("file.save")?,
        c("file.saveAs")?,
        c("file.history")?,
        MenuItemKind::Predefined(sep()?),
        c("file.import")?,
        c("file.export")?,
    ];
    #[cfg(target_os = "macos")]
    {
        file.push(MenuItemKind::Predefined(sep()?));
        file.push(MenuItemKind::Predefined(pre(
            PredefinedMenuItem::close_window(app, None),
        )?));
    }
    #[cfg(not(target_os = "macos"))]
    {
        // No app menu outside macOS: Settings and Quit live in File.
        file.push(MenuItemKind::Predefined(sep()?));
        file.push(c(APP_SETTINGS)?);
        file.push(MenuItemKind::Predefined(sep()?));
        file.push(c(APP_QUIT)?);
    }

    let edit = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()
        .map_err(menu_err)?;

    let theme = SubmenuBuilder::new(app, "Theme")
        .items(&[
            &c("view.theme.dark")?,
            &c("view.theme.light")?,
            &c("view.theme.system")?,
        ])
        .build()
        .map_err(menu_err)?;
    let mut view: Vec<MenuItemKind<Wry>> = vec![
        c("view.arrange")?,
        c("view.pattern")?,
        c("view.mixer")?,
        c("view.library")?,
        MenuItemKind::Predefined(sep()?),
        c("view.codeDrawer")?,
        c("view.uiMode")?,
        MenuItemKind::Predefined(sep()?),
        MenuItemKind::Submenu(theme),
    ];
    #[cfg(target_os = "macos")]
    {
        view.push(MenuItemKind::Predefined(sep()?));
        view.push(MenuItemKind::Predefined(pre(
            PredefinedMenuItem::fullscreen(app, None),
        )?));
    }

    let transport: Vec<MenuItemKind<Wry>> = vec![
        c(TRANSPORT_PLAY_PAUSE)?,
        c(TRANSPORT_STOP)?,
        c("transport.backToStart")?,
        MenuItemKind::Predefined(sep()?),
        c("transport.loop")?,
        c("transport.record")?,
    ];

    let window_items: Vec<MenuItemKind<Wry>> = vec![
        MenuItemKind::Predefined(pre(PredefinedMenuItem::minimize(app, None))?),
        MenuItemKind::Predefined(pre(PredefinedMenuItem::maximize(app, None))?),
        MenuItemKind::Predefined(sep()?),
        c(WINDOW_MAIN)?,
        #[cfg(target_os = "macos")]
        MenuItemKind::Predefined(sep()?),
        #[cfg(target_os = "macos")]
        MenuItemKind::Predefined(pre(PredefinedMenuItem::bring_all_to_front(app, None))?),
    ];

    #[cfg_attr(target_os = "macos", allow(unused_mut))]
    let mut help: Vec<MenuItemKind<Wry>> = vec![c("help.shortcuts")?, c("help.strudel")?];
    #[cfg(not(target_os = "macos"))]
    {
        help.push(MenuItemKind::Predefined(sep()?));
        help.push(MenuItemKind::Predefined(pre(PredefinedMenuItem::about(
            app,
            Some("About Phyllo"),
            Some(about.clone()),
        ))?));
    }

    let submenu = |title: &str, items: &[MenuItemKind<Wry>]| -> Result<Submenu<Wry>> {
        let refs: Vec<&dyn IsMenuItem<Wry>> =
            items.iter().map(|i| i as &dyn IsMenuItem<Wry>).collect();
        Submenu::with_items(app, title, true, &refs).map_err(menu_err)
    };

    let file = submenu("File", &file)?;
    let view = submenu("View", &view)?;
    let transport = submenu("Transport", &transport)?;
    let window = Submenu::with_id_and_items(
        app,
        tauri::menu::WINDOW_SUBMENU_ID,
        "Window",
        true,
        &window_items
            .iter()
            .map(|i| i as &dyn IsMenuItem<Wry>)
            .collect::<Vec<_>>(),
    )
    .map_err(menu_err)?;
    let help = Submenu::with_id_and_items(
        app,
        tauri::menu::HELP_SUBMENU_ID,
        "Help",
        true,
        &help
            .iter()
            .map(|i| i as &dyn IsMenuItem<Wry>)
            .collect::<Vec<_>>(),
    )
    .map_err(menu_err)?;

    let menu = Menu::new(app).map_err(menu_err)?;
    #[cfg(target_os = "macos")]
    {
        let app_menu = SubmenuBuilder::new(app, "Phyllo")
            .about(Some(about))
            .separator()
            .item(&c(APP_SETTINGS)?)
            .separator()
            .services()
            .separator()
            .hide()
            .hide_others()
            .show_all()
            .separator()
            .quit()
            .build()
            .map_err(menu_err)?;
        menu.append(&app_menu).map_err(menu_err)?;
    }
    #[cfg(not(target_os = "macos"))]
    let _ = about;
    for sub in [&file, &edit, &view, &transport, &window, &help] {
        menu.append(sub).map_err(menu_err)?;
    }
    Ok(menu)
}

/// Where a `menu://action` goes: always the main window (it owns the project, transport and views). The Settings
/// window has nothing to act on, and tray clicks have no focused window at all.
fn emit_action(app: &AppHandle, event: MenuActionEvent) {
    let _ = app.emit_to(
        EventTarget::webview_window(windows::MAIN),
        EVENT_MENU_ACTION,
        event,
    );
}

/// Global menu-event handler for the menu bar and the tray menu.
pub fn handle_event(app: &AppHandle, id: &str) {
    match id {
        APP_SETTINGS => {
            if let Err(e) = windows::open_settings(app) {
                eprintln!("phyllo: settings window: {e}");
            }
            return;
        }
        APP_QUIT | TRAY_QUIT => {
            app.exit(0);
            return;
        }
        WINDOW_MAIN | TRAY_SHOW => {
            windows::show_main(app);
            return;
        }
        _ => {}
    }
    if let Some(index) = parse_recent_id(id) {
        let state = tauri::Manager::state::<MenuState>(app);
        if let Some(path) = state.recent_path(index) {
            windows::show_main(app);
            emit_action(
                app,
                MenuActionEvent {
                    id: OPEN_RECENT.into(),
                    path: Some(path),
                },
            );
        }
        return;
    }
    // Predefined items carry generated ids and are not in the table; ignore them.
    let Some(a) = action(id) else { return };
    if a.route == MainReveal {
        windows::show_main(app);
    }
    if a.route != Native {
        emit_action(
            app,
            MenuActionEvent {
                id: a.id.into(),
                path: None,
            },
        );
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;
    use std::str::FromStr;

    use super::*;

    #[test]
    fn ids_are_unique_and_namespaced() {
        let mut seen = HashSet::new();
        for a in ACTIONS {
            assert!(seen.insert(a.id), "duplicate id {}", a.id);
            assert!(
                a.id.split('.').count() >= 2
                    && a.id.chars().all(|c| c.is_ascii_alphanumeric() || c == '.'),
                "id {} should be `area.name`",
                a.id
            );
            assert!(!a.label.is_empty());
        }
    }

    #[test]
    fn accelerators_parse_and_do_not_collide() {
        let mut seen: HashMap<u32, &str> = HashMap::new();
        for a in ACTIONS {
            let Some(acc) = a.accelerator else { continue };
            let parsed = muda::accelerator::Accelerator::from_str(acc)
                .unwrap_or_else(|e| panic!("{}: bad accelerator {acc}: {e}", a.id));
            if let Some(other) = seen.insert(parsed.id(), a.id) {
                panic!("{} and {} share accelerator {acc}", a.id, other);
            }
        }
        // Predefined Edit items own these; a custom item must not take them.
        for taken in [
            "CmdOrCtrl+Z",
            "Shift+CmdOrCtrl+Z",
            "CmdOrCtrl+X",
            "CmdOrCtrl+C",
            "CmdOrCtrl+V",
            "CmdOrCtrl+A",
            "CmdOrCtrl+W",
            "CmdOrCtrl+M",
            "CmdOrCtrl+H",
        ] {
            let id = muda::accelerator::Accelerator::from_str(taken)
                .unwrap()
                .id();
            assert!(
                !seen.contains_key(&id),
                "{taken} is reserved for a predefined item"
            );
        }
    }

    #[test]
    fn shortcuts_follow_spec_section_7() {
        let acc = |id: &str| action(id).and_then(|a| a.accelerator);
        assert_eq!(acc("app.settings"), Some("CmdOrCtrl+,"));
        assert_eq!(acc("file.export"), Some("CmdOrCtrl+E"));
        assert_eq!(acc("view.arrange"), Some("CmdOrCtrl+1"));
        assert_eq!(acc("view.pattern"), Some("CmdOrCtrl+2"));
        assert_eq!(acc("view.mixer"), Some("CmdOrCtrl+3"));
        assert_eq!(acc("view.library"), Some("Shift+CmdOrCtrl+L"));
        assert_eq!(acc("view.codeDrawer"), Some("CmdOrCtrl+/"));
        assert_eq!(acc("view.uiMode"), Some("Shift+CmdOrCtrl+G"));
    }

    #[test]
    fn transport_has_no_accelerators() {
        // Space/Enter/L/R are single keys that text inputs need; JS binds them with focus checks.
        for a in ACTIONS.iter().filter(|a| a.id.starts_with("transport.")) {
            assert_eq!(a.accelerator, None, "{} must not have an accelerator", a.id);
            assert_ne!(
                a.route,
                Route::MainReveal,
                "{} comes from the tray too; don't raise the window",
                a.id
            );
        }
    }

    #[test]
    fn every_accelerator_has_a_modifier() {
        for a in ACTIONS {
            if let Some(acc) = a.accelerator {
                assert!(
                    acc.contains("CmdOrCtrl"),
                    "{}: {acc} would steal a key from text inputs",
                    a.id
                );
            }
        }
    }

    #[test]
    fn native_routes_are_the_app_level_items() {
        let native: HashSet<&str> = ACTIONS
            .iter()
            .filter(|a| a.route == Route::Native)
            .map(|a| a.id)
            .collect();
        assert_eq!(native, HashSet::from([APP_SETTINGS, APP_QUIT, WINDOW_MAIN]));
    }

    #[test]
    fn recent_ids_round_trip() {
        assert_eq!(parse_recent_id(&recent_id(0)), Some(0));
        assert_eq!(parse_recent_id(&recent_id(9)), Some(9));
        assert_eq!(parse_recent_id(RECENT_CLEAR), None);
        assert_eq!(parse_recent_id("file.recentx.1"), None);
        assert_eq!(parse_recent_id("file.open"), None);
        assert!(action(RECENT_CLEAR).is_some());
        assert!(action(&recent_id(0)).is_none());
    }

    #[test]
    fn action_event_serializes_without_empty_path() {
        let v = serde_json::to_value(MenuActionEvent {
            id: "file.save".into(),
            path: None,
        })
        .unwrap();
        assert_eq!(v, serde_json::json!({ "id": "file.save" }));
        let v = serde_json::to_value(MenuActionEvent {
            id: OPEN_RECENT.into(),
            path: Some("/a.phyllo".into()),
        })
        .unwrap();
        assert_eq!(
            v,
            serde_json::json!({ "id": "file.openRecent", "path": "/a.phyllo" })
        );
    }

    #[test]
    fn item_state_accepts_partial_updates() {
        let s: MenuItemState =
            serde_json::from_value(serde_json::json!({ "id": "transport.loop", "checked": true }))
                .unwrap();
        assert_eq!(s.checked, Some(true));
        assert_eq!(s.enabled, None);
        assert_eq!(s.text, None);
    }
}
