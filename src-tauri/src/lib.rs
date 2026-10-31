mod fs;
mod preview;
mod search;
mod state;
mod terminal;
mod watcher;

use tauri::{Emitter, Manager, RunEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        // Must be first: a second launch (a file opened from Explorer or a
        // stride:// link from the Workshop website) is forwarded to this window.
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            let paths = fs::resolve_launch_args(argv.into_iter().skip(1), std::path::Path::new(&cwd));
            if !paths.is_empty() {
                let _ = app.emit("open-paths", paths);
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|_app| {
            // Installers register stride:// themselves; this also covers the
            // portable build and development runs.
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = _app.deep_link().register_all();
            }
            Ok(())
        })
        .manage(terminal::TerminalState::default())
        .manage(watcher::WatcherState::default())
        .manage(preview::PreviewState::default())
        .invoke_handler(tauri::generate_handler![
            fs::fs_read_dir,
            fs::fs_stat,
            fs::fs_read_text,
            fs::fs_write_text,
            fs::fs_create_file,
            fs::fs_create_dir,
            fs::fs_rename,
            fs::fs_copy,
            fs::fs_delete,
            fs::fs_list_files,
            fs::fs_reveal,
            fs::app_launch_paths,
            search::search_workspace,
            search::search_cancel,
            search::replace_in_files,
            state::state_read,
            state::state_write,
            state::state_dir,
            terminal::terminal_shells,
            terminal::terminal_spawn,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_kill,
            watcher::watch_start,
            watcher::watch_stop,
            preview::preview_start,
            preview::open_external,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Stride");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            handle.state::<terminal::TerminalState>().kill_all();
        }
    });
}
