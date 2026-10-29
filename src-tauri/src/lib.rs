mod fs;
mod search;
mod state;
mod terminal;
mod watcher;

use tauri::{Manager, RunEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(terminal::TerminalState::default())
        .manage(watcher::WatcherState::default())
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
        ])
        .build(tauri::generate_context!())
        .expect("error while building Verso");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            handle.state::<terminal::TerminalState>().kill_all();
        }
    });
}
