//! Local static file server for live HTML preview ("live server"). Serves
//! the workspace folder on 127.0.0.1 so relative CSS/JS/images and fetch()
//! work exactly as they would on a real web server.

use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex, RwLock};

#[derive(Default)]
pub struct PreviewState {
    root: Arc<RwLock<PathBuf>>,
    port: Mutex<Option<u16>>,
}

fn content_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .as_deref()
    {
        Some("html" | "htm") => "text/html; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("js" | "mjs" | "cjs") => "text/javascript; charset=utf-8",
        Some("json" | "map") => "application/json; charset=utf-8",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("avif") => "image/avif",
        Some("ico") => "image/x-icon",
        Some("bmp") => "image/bmp",
        Some("woff") => "font/woff",
        Some("woff2") => "font/woff2",
        Some("ttf") => "font/ttf",
        Some("otf") => "font/otf",
        Some("mp3") => "audio/mpeg",
        Some("wav") => "audio/wav",
        Some("ogg") => "audio/ogg",
        Some("mp4") => "video/mp4",
        Some("webm") => "video/webm",
        Some("wasm") => "application/wasm",
        Some("pdf") => "application/pdf",
        Some("xml") => "application/xml; charset=utf-8",
        Some("txt" | "md" | "csv") => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Maps a URL path onto the root folder, rejecting anything that would
/// escape it (`..`, absolute paths, drive prefixes).
fn resolve(root: &Path, url_path: &str) -> Option<PathBuf> {
    let clean = url_path.split(['?', '#']).next().unwrap_or("");
    let decoded = percent_decode(clean);
    let mut path = root.to_path_buf();
    for comp in Path::new(decoded.trim_start_matches('/')).components() {
        match comp {
            Component::Normal(c) => path.push(c),
            Component::CurDir => {}
            _ => return None,
        }
    }
    if path.is_dir() {
        path.push("index.html");
    }
    Some(path)
}

fn respond(stream: &mut TcpStream, status: &str, ctype: &str, body: &[u8], head_only: bool) {
    let header = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {ctype}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(header.as_bytes());
    if !head_only {
        let _ = stream.write_all(body);
    }
    let _ = stream.flush();
}

fn handle(mut stream: TcpStream, root: &Path) {
    let mut reader = BufReader::new(match stream.try_clone() {
        Ok(s) => s,
        Err(_) => return,
    });
    let mut request_line = String::new();
    if reader.read_line(&mut request_line).is_err() {
        return;
    }
    // Drain headers.
    let mut line = String::new();
    while reader.read_line(&mut line).map(|n| n > 2).unwrap_or(false) {
        line.clear();
    }
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let target = parts.next().unwrap_or("/");
    if method != "GET" && method != "HEAD" {
        respond(&mut stream, "405 Method Not Allowed", "text/plain", b"Method not allowed", false);
        return;
    }
    let head_only = method == "HEAD";
    match resolve(root, target) {
        Some(path) => match std::fs::read(&path) {
            Ok(bytes) => respond(&mut stream, "200 OK", content_type(&path), &bytes, head_only),
            Err(_) => {
                let msg = format!("404 — {} was not found in the project folder", target);
                respond(&mut stream, "404 Not Found", "text/plain; charset=utf-8", msg.as_bytes(), head_only);
            }
        },
        None => respond(&mut stream, "403 Forbidden", "text/plain", b"Forbidden", head_only),
    }
}

/// Starts the preview server (once) and points it at `root`. Returns the port.
#[tauri::command]
pub fn preview_start(state: tauri::State<'_, PreviewState>, root: String) -> Result<u16, String> {
    *state.root.write().unwrap() = PathBuf::from(&root);
    let mut port = state.port.lock().unwrap();
    if let Some(p) = *port {
        return Ok(p);
    }
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| format!("Cannot start preview server: {e}"))?;
    let p = listener.local_addr().map_err(|e| e.to_string())?.port();
    let root_ref = state.root.clone();
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let root = root_ref.read().unwrap().clone();
            std::thread::spawn(move || handle(stream, &root));
        }
    });
    *port = Some(p);
    Ok(p)
}

/// Opens a URL or file in the user's default application (e.g. the browser).
#[tauri::command]
pub fn open_external(target: String) -> Result<(), String> {
    #[cfg(windows)]
    let result = std::process::Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", &target])
        .spawn();
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(&target).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let result = std::process::Command::new("xdg-open").arg(&target).spawn();
    result.map(|_| ()).map_err(|e| format!("Cannot open '{target}': {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_inside_root_only() {
        let root = Path::new("/srv/site");
        assert_eq!(resolve(root, "/css/a%20b.css?v=1"), Some(PathBuf::from("/srv/site/css/a b.css")));
        assert_eq!(resolve(root, "/../etc/passwd"), None);
        assert_eq!(resolve(root, "/a/../../x"), None);
    }

    #[test]
    fn decodes_percent_escapes() {
        assert_eq!(percent_decode("%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82.html"), "привет.html");
        assert_eq!(percent_decode("100%"), "100%");
    }
}
