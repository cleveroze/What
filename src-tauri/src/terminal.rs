//! Integrated terminal: real shells (PowerShell, CMD, ...) running in a
//! pseudo-console (ConPTY on Windows) and streamed to xterm.js over IPC channels.

use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;

struct Session {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

#[derive(Default)]
pub struct TerminalState {
    sessions: Arc<Mutex<HashMap<u32, Session>>>,
    next_id: AtomicU32,
}

#[derive(Serialize, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TermEvent {
    Data { data: String },
    Exit { code: Option<u32> },
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ShellInfo {
    id: String,
    name: String,
    path: String,
    args: Vec<String>,
}

fn find_in_path(exe: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .map(|dir| dir.join(exe))
        .find(|candidate| candidate.is_file())
}

/// Shells available on this machine, default first.
#[tauri::command]
pub fn terminal_shells() -> Vec<ShellInfo> {
    let mut shells: Vec<ShellInfo> = Vec::new();
    fn push(shells: &mut Vec<ShellInfo>, id: &str, name: &str, path: PathBuf, args: &[&str]) {
        shells.push(ShellInfo {
            id: id.into(),
            name: name.into(),
            path: path.to_string_lossy().into_owned(),
            args: args.iter().map(|s| s.to_string()).collect(),
        });
    }
    #[cfg(windows)]
    {
        let system_root = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into());
        let winps = PathBuf::from(&system_root).join(r"System32\WindowsPowerShell\v1.0\powershell.exe");
        if winps.is_file() {
            push(&mut shells, "powershell", "Windows PowerShell", winps, &["-NoLogo"]);
        } else if let Some(p) = find_in_path("powershell.exe") {
            push(&mut shells, "powershell", "Windows PowerShell", p, &["-NoLogo"]);
        }
        if let Some(p) = find_in_path("pwsh.exe") {
            push(&mut shells, "pwsh", "PowerShell 7", p, &["-NoLogo"]);
        }
        let cmd = std::env::var("ComSpec")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from(&system_root).join(r"System32\cmd.exe"));
        push(&mut shells, "cmd", "Command Prompt", cmd, &[]);
        for candidate in [
            r"C:\Program Files\Git\bin\bash.exe",
            r"C:\Program Files (x86)\Git\bin\bash.exe",
        ] {
            let p = PathBuf::from(candidate);
            if p.is_file() {
                push(&mut shells, "gitbash", "Git Bash", p, &["--login", "-i"]);
                break;
            }
        }
        let wsl = PathBuf::from(&system_root).join(r"System32\wsl.exe");
        if wsl.is_file() {
            push(&mut shells, "wsl", "WSL", wsl, &[]);
        }
    }
    #[cfg(not(windows))]
    {
        if let Ok(sh) = std::env::var("SHELL") {
            let p = PathBuf::from(&sh);
            let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or(sh.clone());
            push(&mut shells, &name, &name, p, &["-l"]);
        }
        for exe in ["bash", "zsh", "fish", "sh"] {
            if shells.iter().any(|s| s.id == exe) {
                continue;
            }
            if let Some(p) = find_in_path(exe) {
                push(&mut shells, exe, exe, p, &[]);
            }
        }
    }
    shells
}

/// Incrementally decodes UTF-8, holding back incomplete trailing sequences so
/// multi-byte characters split across reads are not corrupted.
fn drain_utf8(pending: &mut Vec<u8>) -> String {
    let mut out = String::new();
    loop {
        match std::str::from_utf8(pending) {
            Ok(s) => {
                out.push_str(s);
                pending.clear();
                return out;
            }
            Err(e) => {
                let valid = e.valid_up_to();
                out.push_str(std::str::from_utf8(&pending[..valid]).unwrap());
                match e.error_len() {
                    None => {
                        pending.drain(..valid);
                        return out;
                    }
                    Some(len) => {
                        out.push('\u{FFFD}');
                        pending.drain(..valid + len);
                    }
                }
            }
        }
    }
}

#[tauri::command]
pub fn terminal_spawn(
    state: tauri::State<'_, TerminalState>,
    shell: String,
    args: Vec<String>,
    cwd: Option<String>,
    cols: u16,
    rows: u16,
    on_event: Channel<TermEvent>,
) -> Result<u32, String> {
    let pair = native_pty_system()
        .openpty(PtySize {
            rows: rows.max(2),
            cols: cols.max(2),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Cannot open pseudo-terminal: {e}"))?;

    let mut cmd = CommandBuilder::new(&shell);
    cmd.args(&args);
    if let Some(dir) = cwd.filter(|d| PathBuf::from(d).is_dir()) {
        cmd.cwd(dir);
    } else if let Some(home) = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }) {
        cmd.cwd(home);
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("TERM_PROGRAM", "Stride");

    let mut child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Cannot start '{shell}': {e}"))?;
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let killer = child.clone_killer();

    let id = state.next_id.fetch_add(1, Ordering::SeqCst) + 1;
    state.sessions.lock().unwrap().insert(
        id,
        Session {
            writer,
            master: pair.master,
            killer,
        },
    );

    let data_channel = on_event.clone();
    let reader_thread = std::thread::spawn(move || {
        let mut buf = vec![0u8; 64 * 1024];
        let mut pending = Vec::new();
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    pending.extend_from_slice(&buf[..n]);
                    let text = drain_utf8(&mut pending);
                    if !text.is_empty() && data_channel.send(TermEvent::Data { data: text }).is_err() {
                        break;
                    }
                }
            }
        }
    });

    // Wait for the shell to exit, then close the pty (on Windows ConPTY the
    // reader only sees EOF after the pseudo-console is closed).
    let sessions = state.sessions.clone();
    std::thread::spawn(move || {
        let code = child.wait().ok().map(|s| s.exit_code());
        sessions.lock().unwrap().remove(&id);
        let _ = reader_thread.join();
        let _ = on_event.send(TermEvent::Exit { code });
    });

    Ok(id)
}

#[tauri::command]
pub fn terminal_write(state: tauri::State<'_, TerminalState>, id: u32, data: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    let session = sessions.get_mut(&id).ok_or("Terminal session has ended")?;
    session
        .writer
        .write_all(data.as_bytes())
        .and_then(|_| session.writer.flush())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn terminal_resize(state: tauri::State<'_, TerminalState>, id: u32, cols: u16, rows: u16) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.get(&id) {
        session
            .master
            .resize(PtySize {
                rows: rows.max(2),
                cols: cols.max(2),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn terminal_kill(state: tauri::State<'_, TerminalState>, id: u32) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.get_mut(&id) {
        session.killer.kill().map_err(|e| e.to_string())?;
    }
    Ok(())
}

impl TerminalState {
    /// Kills every shell; called when the app exits.
    pub fn kill_all(&self) {
        let mut sessions = self.sessions.lock().unwrap();
        for session in sessions.values_mut() {
            let _ = session.killer.kill();
        }
        sessions.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::drain_utf8;

    #[test]
    fn holds_back_split_sequences() {
        let euro = "€".as_bytes();
        let mut pending = vec![b'a', euro[0], euro[1]];
        assert_eq!(drain_utf8(&mut pending), "a");
        pending.push(euro[2]);
        assert_eq!(drain_utf8(&mut pending), "€");
        assert!(pending.is_empty());
    }

    #[test]
    fn replaces_invalid_bytes() {
        let mut pending = vec![b'x', 0xFF, b'y'];
        assert_eq!(drain_utf8(&mut pending), "x\u{FFFD}y");
    }
}
