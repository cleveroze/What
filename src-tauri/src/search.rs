//! Workspace-wide text search and replace, backed by `ignore` (gitignore-aware
//! directory walking) and `regex`.

use crate::fs::{decode, encode};
use ignore::overrides::OverrideBuilder;
use regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

const MAX_SEARCH_FILE: u64 = 8 * 1024 * 1024;
const MAX_PREVIEW_CHARS: usize = 400;

static GENERATION: AtomicU64 = AtomicU64::new(0);

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SearchQuery {
    root: String,
    pattern: String,
    is_regex: bool,
    case_sensitive: bool,
    whole_word: bool,
    #[serde(default)]
    include: String,
    #[serde(default)]
    exclude: String,
    max_results: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LineMatch {
    /// 1-based line number.
    line: u32,
    /// Line text (possibly truncated to MAX_PREVIEW_CHARS chars).
    preview: String,
    /// Match ranges within the line as UTF-16 offsets [start, end).
    ranges: Vec<(u32, u32)>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMatches {
    path: String,
    matches: Vec<LineMatch>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    files: Vec<FileMatches>,
    total_matches: usize,
    searched_files: usize,
    truncated: bool,
    cancelled: bool,
}

fn build_regex(q: &SearchQuery) -> Result<Regex, String> {
    let mut source = if q.is_regex {
        q.pattern.clone()
    } else {
        regex::escape(&q.pattern)
    };
    if q.whole_word {
        source = format!(r"\b(?:{source})\b");
    }
    RegexBuilder::new(&source)
        .case_insensitive(!q.case_sensitive)
        .multi_line(true)
        .build()
        .map_err(|e| format!("Invalid search pattern: {e}"))
}

fn split_globs(s: &str) -> impl Iterator<Item = &str> {
    s.split(',').map(str::trim).filter(|g| !g.is_empty())
}

fn walker(q: &SearchQuery) -> Result<ignore::Walk, String> {
    let root = PathBuf::from(&q.root);
    let mut overrides = OverrideBuilder::new(&root);
    for g in split_globs(&q.include) {
        overrides.add(g).map_err(|e| format!("Invalid include pattern: {e}"))?;
    }
    for g in split_globs(&q.exclude) {
        overrides
            .add(&format!("!{g}"))
            .map_err(|e| format!("Invalid exclude pattern: {e}"))?;
    }
    let overrides = overrides.build().map_err(|e| e.to_string())?;
    Ok(ignore::WalkBuilder::new(&root)
        .hidden(false)
        .git_ignore(true)
        .git_global(false)
        .require_git(false)
        .overrides(overrides)
        .filter_entry(|e| e.file_name() != ".git")
        .build())
}

fn utf16_len(s: &str) -> u32 {
    s.encode_utf16().count() as u32
}

fn truncate_chars(s: &str, max: usize) -> &str {
    match s.char_indices().nth(max) {
        Some((i, _)) => &s[..i],
        None => s,
    }
}

fn run_search(q: SearchQuery, generation: u64) -> Result<SearchResult, String> {
    let re = build_regex(&q)?;
    let mut result = SearchResult {
        files: Vec::new(),
        total_matches: 0,
        searched_files: 0,
        truncated: false,
        cancelled: false,
    };
    'walk: for entry in walker(&q)?.flatten() {
        if GENERATION.load(Ordering::Relaxed) != generation {
            result.cancelled = true;
            break;
        }
        if !entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
            continue;
        }
        let path = entry.path();
        match entry.metadata() {
            Ok(m) if m.len() <= MAX_SEARCH_FILE => {}
            _ => continue,
        }
        let Ok(bytes) = std::fs::read(path) else { continue };
        let Some((text, _)) = decode(&bytes) else { continue };
        result.searched_files += 1;

        let mut matches: Vec<LineMatch> = Vec::new();
        for (idx, line) in text.lines().enumerate() {
            let mut ranges = Vec::new();
            for m in re.find_iter(line) {
                if m.start() == m.end() {
                    continue;
                }
                let start = utf16_len(&line[..m.start()]);
                let end = start + utf16_len(m.as_str());
                ranges.push((start, end));
            }
            if ranges.is_empty() {
                continue;
            }
            result.total_matches += ranges.len();
            matches.push(LineMatch {
                line: idx as u32 + 1,
                preview: truncate_chars(line, MAX_PREVIEW_CHARS).to_string(),
                ranges,
            });
            if result.total_matches >= q.max_results {
                result.truncated = true;
                result.files.push(FileMatches {
                    path: path.to_string_lossy().into_owned(),
                    matches,
                });
                break 'walk;
            }
        }
        if !matches.is_empty() {
            result.files.push(FileMatches {
                path: path.to_string_lossy().into_owned(),
                matches,
            });
        }
    }
    Ok(result)
}

#[tauri::command]
pub async fn search_workspace(query: SearchQuery) -> Result<SearchResult, String> {
    if query.pattern.is_empty() {
        return Err("Empty search pattern".into());
    }
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    tauri::async_runtime::spawn_blocking(move || run_search(query, generation))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn search_cancel() {
    GENERATION.fetch_add(1, Ordering::SeqCst);
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceResult {
    files_changed: usize,
    replacements: usize,
    errors: Vec<String>,
}

/// Replaces every match of `query` in the given files, preserving each file's
/// encoding. In regex mode `$1`-style capture references are expanded.
#[tauri::command]
pub async fn replace_in_files(
    query: SearchQuery,
    replacement: String,
    paths: Vec<String>,
) -> Result<ReplaceResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let re = build_regex(&query)?;
        let mut out = ReplaceResult {
            files_changed: 0,
            replacements: 0,
            errors: Vec::new(),
        };
        for path in paths {
            let bytes = match std::fs::read(&path) {
                Ok(b) => b,
                Err(e) => {
                    out.errors.push(format!("{path}: {e}"));
                    continue;
                }
            };
            let Some((text, encoding)) = decode(&bytes) else { continue };
            let count = re.find_iter(&text).filter(|m| m.start() != m.end()).count();
            if count == 0 {
                continue;
            }
            let replaced = if query.is_regex {
                re.replace_all(&text, replacement.as_str())
            } else {
                re.replace_all(&text, regex::NoExpand(&replacement))
            };
            match std::fs::write(&path, encode(&replaced, encoding)) {
                Ok(()) => {
                    out.files_changed += 1;
                    out.replacements += count;
                }
                Err(e) => out.errors.push(format!("{path}: {e}")),
            }
        }
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn q(root: &str, pattern: &str) -> SearchQuery {
        SearchQuery {
            root: root.into(),
            pattern: pattern.into(),
            is_regex: false,
            case_sensitive: false,
            whole_word: false,
            include: String::new(),
            exclude: String::new(),
            max_results: 1000,
        }
    }

    #[test]
    fn finds_matches_with_utf16_ranges() {
        let dir = std::env::temp_dir().join(format!("verso-search-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("a.txt"), "😀 Hello\nnothing\nhello hello\n").unwrap();
        let gen = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
        let r = run_search(q(dir.to_str().unwrap(), "hello"), gen).unwrap();
        assert_eq!(r.total_matches, 3);
        let f = &r.files[0];
        assert_eq!(f.matches[0].line, 1);
        // The emoji is two UTF-16 units, followed by a space.
        assert_eq!(f.matches[0].ranges[0], (3, 8));
        assert_eq!(f.matches[1].ranges, vec![(0, 5), (6, 11)]);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
