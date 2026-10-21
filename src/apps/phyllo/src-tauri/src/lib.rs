mod commands;
mod error;
mod fsutil;
mod history;
mod library;
mod paths;
mod project;
mod samples;
mod trash;
mod watch;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .manage(commands::Watchers::default());

    // Global shortcuts exist on desktop only.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_global_shortcut::Builder::new().build());

    builder
        .invoke_handler(tauri::generate_handler![
            commands::paths_get,
            commands::project_read,
            commands::project_write,
            commands::project_new_path,
            commands::strudel_read,
            commands::strudel_write,
            commands::library_scan,
            commands::library_mark_opened,
            commands::library_watch,
            commands::history_snapshot,
            commands::history_list,
            commands::history_read,
            commands::move_to_trash,
            commands::sample_folder_scan,
            commands::sample_folders_watch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
