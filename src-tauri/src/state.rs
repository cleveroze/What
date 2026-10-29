//! Persistence of settings, workspace layout and recent projects as JSON files
//! inside the per-user application config directory.

use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn state_file(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let valid = !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if !valid {
        return Err(format!("Invalid state name '{name}'"));
    }
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Cannot create config folder: {e}"))?;
    Ok(dir.join(format!("{name}.json")))
}

#[tauri::command]
pub fn state_read(app: AppHandle, name: String) -> Result<Option<String>, String> {
    let path = state_file(&app, &name)?;
    match std::fs::read_to_string(&path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Cannot read {}: {e}", path.display())),
    }
}

/// Atomically replaces a state file (write to a temp file, then rename) so a
/// crash mid-write never leaves corrupt settings behind.
#[tauri::command]
pub fn state_write(app: AppHandle, name: String, content: String) -> Result<(), String> {
    let path = state_file(&app, &name)?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, content).map_err(|e| format!("Cannot write {}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("Cannot write {}: {e}", path.display()))
}

#[tauri::command]
pub fn state_dir(app: AppHandle) -> Result<String, String> {
    app.path()
        .app_config_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}
