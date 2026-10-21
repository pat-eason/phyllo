mod commands;
mod error;
mod fsutil;
mod history;
mod library;
mod midi;
mod osc;
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
        .manage(commands::Watchers::default())
        .manage(midi::MidiHub::default())
        .manage(osc::OscState::default());

    // Global shortcuts exist on desktop only.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_global_shortcut::Builder::new().build());

    builder
        .setup(|app| {
            commands::start_midi(app.handle());
            Ok(())
        })
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
            commands::midi_list_ports,
            commands::midi_rescan,
            commands::midi_open_input,
            commands::midi_close_input,
            commands::midi_open_output,
            commands::midi_close_output,
            commands::midi_send,
            commands::midi_panic,
            commands::osc_configure,
            commands::osc_send,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
