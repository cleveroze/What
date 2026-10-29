//! Native filesystem commands. Every operation here touches the real disk;
//! errors are surfaced to the UI as human-readable strings.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

/// Files larger than this are refused by the text editor.
const MAX_TEXT_FILE: u64 = 64 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    name: String,
    path: String,
    is_dir: bool,
    is_symlink: bool,
    size: u64,
    modified: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileStat {
    exists: bool,
    is_dir: bool,
    size: u64,
    modified: u64,
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum TextEncoding {
    Utf8,
    Utf8bom,
    Utf16le,
    Utf16be,
    Windows1252,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextFile {
    content: String,
    encoding: TextEncoding,
    eol: &'static str,
    modified: u64,
    size: u64,
}

fn err<'a, E: std::fmt::Display>(context: &str, path: &'a Path) -> impl FnOnce(E) -> String + 'a {
    let context = context.to_string();
    move |e| format!("{context} '{}': {e}", path.display())
}

pub fn modified_ms(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Decodes raw bytes into text, detecting BOMs and falling back to
/// Windows-1252 for legacy files that are not valid UTF-8.
/// Returns `None` when the content looks binary.
pub fn decode(bytes: &[u8]) -> Option<(String, TextEncoding)> {
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        let (text, _) = encoding_rs::UTF_8.decode_without_bom_handling(&bytes[3..]);
        return Some((text.into_owned(), TextEncoding::Utf8bom));
    }
    if bytes.starts_with(&[0xFF, 0xFE]) {
        let (text, _) = encoding_rs::UTF_16LE.decode_without_bom_handling(&bytes[2..]);
        return Some((text.into_owned(), TextEncoding::Utf16le));
    }
    if bytes.starts_with(&[0xFE, 0xFF]) {
        let (text, _) = encoding_rs::UTF_16BE.decode_without_bom_handling(&bytes[2..]);
        return Some((text.into_owned(), TextEncoding::Utf16be));
    }
    let probe = &bytes[..bytes.len().min(8192)];
    if probe.contains(&0) {
        return None;
    }
    match std::str::from_utf8(bytes) {
        Ok(s) => Some((s.to_owned(), TextEncoding::Utf8)),
        Err(_) => {
            let (text, _) = encoding_rs::WINDOWS_1252.decode_without_bom_handling(bytes);
            Some((text.into_owned(), TextEncoding::Windows1252))
        }
    }
}

pub fn encode(text: &str, encoding: TextEncoding) -> Vec<u8> {
    match encoding {
        TextEncoding::Utf8 => text.as_bytes().to_vec(),
        TextEncoding::Utf8bom => {
            let mut out = vec![0xEF, 0xBB, 0xBF];
            out.extend_from_slice(text.as_bytes());
            out
        }
        TextEncoding::Utf16le => {
            let mut out = vec![0xFF, 0xFE];
            for unit in text.encode_utf16() {
                out.extend_from_slice(&unit.to_le_bytes());
            }
            out
        }
        TextEncoding::Utf16be => {
            let mut out = vec![0xFE, 0xFF];
            for unit in text.encode_utf16() {
                out.extend_from_slice(&unit.to_be_bytes());
            }
            out
        }
        TextEncoding::Windows1252 => {
            let (bytes, _, _) = encoding_rs::WINDOWS_1252.encode(text);
            bytes.into_owned()
        }
    }
}

fn detect_eol(text: &str) -> &'static str {
    match text.find('\n') {
        Some(i) if i > 0 && text.as_bytes()[i - 1] == b'\r' => "CRLF",
        Some(_) => "LF",
        None => {
            if cfg!(windows) {
                "CRLF"
            } else {
                "LF"
            }
        }
    }
}

fn sort_entries(entries: &mut [DirEntry]) {
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
}

#[tauri::command]
pub fn fs_read_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let dir = PathBuf::from(&path);
    let reader = fs::read_dir(&dir).map_err(err("Cannot read folder", &dir))?;
    let mut entries = Vec::new();
    for item in reader.flatten() {
        let file_type = match item.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        let is_symlink = file_type.is_symlink();
        // Follow symlinks for metadata so linked folders behave like folders.
        let meta = fs::metadata(item.path()).or_else(|_| item.metadata());
        let (is_dir, size, modified) = match &meta {
            Ok(m) => (m.is_dir(), m.len(), modified_ms(m)),
            Err(_) => (file_type.is_dir(), 0, 0),
        };
        entries.push(DirEntry {
            name: item.file_name().to_string_lossy().into_owned(),
            path: item.path().to_string_lossy().into_owned(),
            is_dir,
            is_symlink,
            size: if is_dir { 0 } else { size },
            modified,
        });
    }
    sort_entries(&mut entries);
    Ok(entries)
}

#[tauri::command]
pub fn fs_stat(path: String) -> FileStat {
    match fs::metadata(&path) {
        Ok(m) => FileStat {
            exists: true,
            is_dir: m.is_dir(),
            size: m.len(),
            modified: modified_ms(&m),
        },
        Err(_) => FileStat {
            exists: false,
            is_dir: false,
            size: 0,
            modified: 0,
        },
    }
}

#[tauri::command]
pub fn fs_read_text(path: String) -> Result<TextFile, String> {
    let p = PathBuf::from(&path);
    let meta = fs::metadata(&p).map_err(err("Cannot open", &p))?;
    if meta.is_dir() {
        return Err(format!("'{}' is a folder", p.display()));
    }
    if meta.len() > MAX_TEXT_FILE {
        return Err(format!(
            "'{}' is too large to open in the editor ({} MB)",
            p.display(),
            meta.len() / (1024 * 1024)
        ));
    }
    let bytes = fs::read(&p).map_err(err("Cannot read", &p))?;
    let (content, encoding) = decode(&bytes)
        .ok_or_else(|| format!("'{}' appears to be a binary file", p.display()))?;
    Ok(TextFile {
        eol: detect_eol(&content),
        content,
        encoding,
        modified: modified_ms(&meta),
        size: meta.len(),
    })
}

/// Writes text to disk using the requested encoding. Returns the new mtime.
#[tauri::command]
pub fn fs_write_text(path: String, content: String, encoding: TextEncoding) -> Result<u64, String> {
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            fs::create_dir_all(parent).map_err(err("Cannot create folder", parent))?;
        }
    }
    let bytes = encode(&content, encoding);
    let mut file = fs::File::create(&p).map_err(err("Cannot write", &p))?;
    file.write_all(&bytes).map_err(err("Cannot write", &p))?;
    file.sync_all().map_err(err("Cannot flush", &p))?;
    drop(file);
    let meta = fs::metadata(&p).map_err(err("Cannot stat", &p))?;
    Ok(modified_ms(&meta))
}

#[tauri::command]
pub fn fs_create_file(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&p)
        .map(|_| ())
        .map_err(err("Cannot create file", &p))
}

#[tauri::command]
pub fn fs_create_dir(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if p.exists() {
        return Err(format!("'{}' already exists", p.display()));
    }
    fs::create_dir_all(&p).map_err(err("Cannot create folder", &p))
}

#[tauri::command]
pub fn fs_rename(from: String, to: String) -> Result<(), String> {
    let src = PathBuf::from(&from);
    let dst = PathBuf::from(&to);
    if src == dst {
        return Ok(());
    }
    // Allow case-only renames on case-insensitive filesystems (Windows).
    let case_only = from.to_lowercase() == to.to_lowercase();
    if dst.exists() && !case_only {
        return Err(format!("'{}' already exists", dst.display()));
    }
    if dst.starts_with(&src) {
        return Err("Cannot move a folder into itself".into());
    }
    match fs::rename(&src, &dst) {
        Ok(()) => Ok(()),
        Err(_) if !case_only => {
            // Cross-volume move: copy, then remove the original.
            copy_recursive(&src, &dst).map_err(err("Cannot move", &src))?;
            remove_path(&src).map_err(err("Moved, but cannot remove original", &src))
        }
        Err(e) => Err(format!("Cannot rename '{}': {e}", src.display())),
    }
}

fn copy_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    if fs::metadata(src)?.is_dir() {
        fs::create_dir_all(dst)?;
        for entry in fs::read_dir(src)? {
            let entry = entry?;
            copy_recursive(&entry.path(), &dst.join(entry.file_name()))?;
        }
        Ok(())
    } else {
        fs::copy(src, dst).map(|_| ())
    }
}

fn remove_path(p: &Path) -> std::io::Result<()> {
    if fs::symlink_metadata(p)?.is_dir() {
        fs::remove_dir_all(p)
    } else {
        fs::remove_file(p)
    }
}

/// Copies a file or folder. Returns the destination path actually used
/// (a " copy" suffix is added when the target already exists).
#[tauri::command]
pub fn fs_copy(from: String, to: String) -> Result<String, String> {
    let src = PathBuf::from(&from);
    let mut dst = PathBuf::from(&to);
    if dst.starts_with(&src) && dst != src {
        return Err("Cannot copy a folder into itself".into());
    }
    if dst.exists() {
        let parent = dst.parent().map(Path::to_path_buf).unwrap_or_default();
        let stem = dst
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default();
        let ext = dst
            .extension()
            .map(|e| format!(".{}", e.to_string_lossy()))
            .unwrap_or_default();
        let is_dir = src.is_dir();
        let mut n = 1;
        loop {
            let suffix = if n == 1 { " copy".to_string() } else { format!(" copy {n}") };
            let name = if is_dir {
                format!("{}{suffix}", dst.file_name().unwrap_or_default().to_string_lossy())
            } else {
                format!("{stem}{suffix}{ext}")
            };
            let candidate = parent.join(name);
            if !candidate.exists() {
                dst = candidate;
                break;
            }
            n += 1;
        }
    }
    copy_recursive(&src, &dst).map_err(err("Cannot copy", &src))?;
    Ok(dst.to_string_lossy().into_owned())
}

/// Deletes a path, by default moving it to the Recycle Bin.
#[tauri::command]
pub fn fs_delete(path: String, use_trash: bool) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if use_trash {
        match trash::delete(&p) {
            Ok(()) => return Ok(()),
            Err(e) => return Err(format!("Cannot move '{}' to the Recycle Bin: {e}", p.display())),
        }
    }
    remove_path(&p).map_err(err("Cannot delete", &p))
}

/// Lists files below `root` (respecting .gitignore) for Quick Open.
#[tauri::command]
pub async fn fs_list_files(root: String, max: usize) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let base = PathBuf::from(&root);
        let mut out = Vec::new();
        let walker = ignore::WalkBuilder::new(&base)
            .hidden(false)
            .git_ignore(true)
            .git_global(false)
            .require_git(false)
            .filter_entry(|e| e.file_name() != ".git")
            .build();
        for entry in walker.flatten() {
            if entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
                out.push(entry.path().to_string_lossy().into_owned());
                if out.len() >= max {
                    break;
                }
            }
        }
        out
    })
    .await
    .map_err(|e| e.to_string())
}

/// Opens the system file manager with the item selected.
#[tauri::command]
pub fn fs_reveal(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("explorer")
        .arg(format!("/select,{}", p.display()))
        .spawn();
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg("-R").arg(&p).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let result = std::process::Command::new("xdg-open")
        .arg(p.parent().unwrap_or(&p))
        .spawn();
    result.map(|_| ()).map_err(|e| format!("Cannot open file manager: {e}"))
}

/// Paths passed on the command line (e.g. "Open with Stride").
#[tauri::command]
pub fn app_launch_paths() -> Vec<String> {
    std::env::args()
        .skip(1)
        .filter(|a| !a.starts_with('-'))
        .filter_map(|a| fs::canonicalize(&a).ok().map(|p| strip_unc(&p)))
        .collect()
}

/// `canonicalize` on Windows yields `\\?\C:\...`; strip that prefix for display.
pub fn strip_unc(p: &Path) -> String {
    let s = p.to_string_lossy();
    s.strip_prefix(r"\\?\").unwrap_or(&s).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_encodings() {
        let text = "héllo\r\nwörld €";
        for enc in [
            TextEncoding::Utf8,
            TextEncoding::Utf8bom,
            TextEncoding::Utf16le,
            TextEncoding::Utf16be,
        ] {
            let bytes = encode(text, enc);
            let (decoded, detected) = decode(&bytes).unwrap();
            assert_eq!(decoded, text);
            assert_eq!(detected, enc);
        }
    }

    #[test]
    fn detects_binary_and_legacy() {
        assert!(decode(&[0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]).is_none());
        let (text, enc) = decode(&[0x63, 0x61, 0x66, 0xE9]).unwrap();
        assert_eq!(text, "café");
        assert_eq!(enc, TextEncoding::Windows1252);
    }

    #[test]
    fn eol_detection() {
        assert_eq!(detect_eol("a\r\nb"), "CRLF");
        assert_eq!(detect_eol("a\nb"), "LF");
    }
}
