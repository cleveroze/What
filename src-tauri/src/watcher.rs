//! Watches the open workspace folder and notifies the UI about changes so the
//! explorer and open editors stay in sync with the disk.

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::BTreeSet;
use std::path::PathBuf;
use std::sync::mpsc;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const MAX_PATHS_PER_BATCH: usize = 400;

#[derive(Default)]
pub struct WatcherState {
    current: Mutex<Option<RecommendedWatcher>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct FsChanged {
    paths: Vec<String>,
    overflow: bool,
}

fn is_noise(path: &std::path::Path) -> bool {
    path.components().any(|c| {
        let s = c.as_os_str();
        s == ".git" || s == "node_modules" || s == "target"
    })
}

#[tauri::command]
pub fn watch_start(app: AppHandle, state: tauri::State<'_, WatcherState>, root: String) -> Result<(), String> {
    let (tx, rx) = mpsc::channel::<PathBuf>();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            if matches!(event.kind, notify::EventKind::Access(_)) {
                return;
            }
            for p in event.paths {
                let _ = tx.send(p);
            }
        }
    })
    .map_err(|e| format!("Cannot watch folder: {e}"))?;
    watcher
        .watch(&PathBuf::from(&root), RecursiveMode::Recursive)
        .map_err(|e| format!("Cannot watch '{root}': {e}"))?;

    // Debounce: collect paths for a short quiet period, then emit one batch.
    // The thread ends when the watcher (and thus `tx`) is dropped.
    std::thread::spawn(move || {
        while let Ok(first) = rx.recv() {
            let mut batch = BTreeSet::new();
            let mut overflow = false;
            let mut add = |p: PathBuf, batch: &mut BTreeSet<String>| {
                if is_noise(&p) {
                    return;
                }
                if batch.len() < MAX_PATHS_PER_BATCH {
                    batch.insert(p.to_string_lossy().into_owned());
                } else {
                    overflow = true;
                }
            };
            add(first, &mut batch);
            while let Ok(p) = rx.recv_timeout(Duration::from_millis(120)) {
                add(p, &mut batch);
            }
            if !batch.is_empty() || overflow {
                let _ = app.emit(
                    "fs://changed",
                    FsChanged {
                        paths: batch.into_iter().collect(),
                        overflow,
                    },
                );
            }
        }
    });

    *state.current.lock().unwrap() = Some(watcher);
    Ok(())
}

#[tauri::command]
pub fn watch_stop(state: tauri::State<'_, WatcherState>) {
    *state.current.lock().unwrap() = None;
}
