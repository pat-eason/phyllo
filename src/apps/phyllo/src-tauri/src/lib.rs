mod commands;
mod encode;
mod error;
mod export;
mod fsutil;
mod history;
mod library;
mod media;
mod menu;
mod midi;
mod midifile;
mod notifications;
mod open_files;
mod osc;
mod paths;
mod project;
mod samples;
mod selftest;
mod sound_cache;
mod trash;
mod tray;
mod watch;
mod windows;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let selftest = selftest::SelftestConfig::from_env();
    let builder = tauri::Builder::default();
    // Must be the first plugin (D96). A self-test run is a separate throwaway instance: it must not hand itself to a
    // Phyllo the user already has open.
    #[cfg(desktop)]
    let builder = if selftest.enabled {
        builder
    } else {
        builder.plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            commands::on_second_instance(app, argv, &cwd)
        }))
    };
    let builder = builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .manage(commands::Watchers::default())
        .manage(commands::SoundCacheState::default())
        .manage(midi::MidiHub::default())
        .manage(osc::OscState::default())
        .manage(export::ExportSessions::default())
        .manage(menu::MenuState::default())
        .manage(tray::TrayState::default())
        .manage(media::MediaState::default())
        .manage(windows::KeepRunning::default())
        .manage(open_files::OpenFileQueue::default())
        .manage(selftest);

    // Global shortcuts exist on desktop only.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_global_shortcut::Builder::new().build());

    let app = builder
        .on_menu_event(|app, event| menu::handle_event(app, event.id().as_ref()))
        .on_window_event(windows::on_window_event)
        .setup(|app| {
            let menu = menu::build(app.handle(), &app.state::<menu::MenuState>())?;
            app.set_menu(menu)?;
            commands::start_midi(app.handle());
            // Windows/Linux file associations launch `phyllo <file>`; macOS delivers files through `Opened` instead.
            commands::deliver_open_files(
                app.handle(),
                open_files::paths_from_args(std::env::args_os()),
            );
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
            commands::export_begin,
            commands::export_chunk,
            commands::export_finish,
            commands::export_cancel,
            commands::export_unique_path,
            commands::midi_file_write,
            commands::menu_set_state,
            commands::menu_set_recent,
            commands::tray_set_enabled,
            commands::tray_set_playing,
            commands::app_set_keep_running,
            commands::media_set_enabled,
            commands::media_set_now_playing,
            commands::take_pending_open_files,
            commands::notify_export_finished,
            commands::sound_cache_fetch,
            commands::sound_cache_status,
            commands::sound_cache_clear,
            commands::sound_cache_prefetch,
            selftest::selftest_config,
            selftest::selftest_write_report,
            selftest::selftest_inspect_wav,
            selftest::selftest_file_info,
            selftest::selftest_exit,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app, event| match event {
        // Finder "Open With" / double-click, including the one that launched the app (buffered until JS asks).
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Opened { urls } => {
            commands::deliver_open_files(app, open_files::paths_from_urls(&urls));
        }
        // Dock icon clicked while the main window is hidden ("keep running" hid it on close).
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen {
            has_visible_windows: false,
            ..
        } => windows::show_main(app),
        _ => {
            let _ = app;
        }
    });
}
