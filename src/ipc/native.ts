/** Typed wrappers around the Rust commands in `src-tauri/src`. */
import { Channel, invoke } from "@tauri-apps/api/core";

export type Encoding = "utf8" | "utf8bom" | "utf16le" | "utf16be" | "windows1252";
export type Eol = "LF" | "CRLF";

export const ENCODING_LABELS: Record<Encoding, string> = {
  utf8: "UTF-8",
  utf8bom: "UTF-8 with BOM",
  utf16le: "UTF-16 LE",
  utf16be: "UTF-16 BE",
  windows1252: "Windows 1252",
};

export interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
  isSymlink: boolean;
  size: number;
  modified: number;
}

export interface FileStat {
  exists: boolean;
  isDir: boolean;
  size: number;
  modified: number;
}

export interface TextFile {
  content: string;
  encoding: Encoding;
  eol: Eol;
  modified: number;
  size: number;
}

export const fs = {
  readDir: (path: string) => invoke<DirEntry[]>("fs_read_dir", { path }),
  stat: (path: string) => invoke<FileStat>("fs_stat", { path }),
  readText: (path: string) => invoke<TextFile>("fs_read_text", { path }),
  writeText: (path: string, content: string, encoding: Encoding) =>
    invoke<number>("fs_write_text", { path, content, encoding }),
  createFile: (path: string) => invoke<void>("fs_create_file", { path }),
  createDir: (path: string) => invoke<void>("fs_create_dir", { path }),
  rename: (from: string, to: string) => invoke<void>("fs_rename", { from, to }),
  copy: (from: string, to: string) => invoke<string>("fs_copy", { from, to }),
  delete: (path: string, useTrash: boolean) => invoke<void>("fs_delete", { path, useTrash }),
  listFiles: (root: string, max: number) => invoke<string[]>("fs_list_files", { root, max }),
  reveal: (path: string) => invoke<void>("fs_reveal", { path }),
  launchPaths: () => invoke<string[]>("app_launch_paths"),
};

export interface SearchQuery {
  root: string;
  pattern: string;
  isRegex: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
  include: string;
  exclude: string;
  maxResults: number;
}

export interface LineMatch {
  line: number;
  preview: string;
  ranges: [number, number][];
}

export interface FileMatches {
  path: string;
  matches: LineMatch[];
}

export interface SearchResult {
  files: FileMatches[];
  totalMatches: number;
  searchedFiles: number;
  truncated: boolean;
  cancelled: boolean;
}

export interface ReplaceResult {
  filesChanged: number;
  replacements: number;
  errors: string[];
}

export const search = {
  run: (query: SearchQuery) => invoke<SearchResult>("search_workspace", { query }),
  cancel: () => invoke<void>("search_cancel"),
  replace: (query: SearchQuery, replacement: string, paths: string[]) =>
    invoke<ReplaceResult>("replace_in_files", { query, replacement, paths }),
};

export const state = {
  read: (name: string) => invoke<string | null>("state_read", { name }),
  write: (name: string, content: string) => invoke<void>("state_write", { name, content }),
  dir: () => invoke<string>("state_dir"),
};

export interface ShellInfo {
  id: string;
  name: string;
  path: string;
  args: string[];
}

export type TermEvent = { kind: "data"; data: string } | { kind: "exit"; code: number | null };

export const terminal = {
  shells: () => invoke<ShellInfo[]>("terminal_shells"),
  spawn(shell: ShellInfo, cwd: string | null, cols: number, rows: number, onEvent: (e: TermEvent) => void) {
    const channel = new Channel<TermEvent>();
    channel.onmessage = onEvent;
    return invoke<number>("terminal_spawn", {
      shell: shell.path,
      args: shell.args,
      cwd,
      cols,
      rows,
      onEvent: channel,
    });
  },
  write: (id: number, data: string) => invoke<void>("terminal_write", { id, data }),
  resize: (id: number, cols: number, rows: number) => invoke<void>("terminal_resize", { id, cols, rows }),
  kill: (id: number) => invoke<void>("terminal_kill", { id }),
};

export const watcher = {
  start: (root: string) => invoke<void>("watch_start", { root }),
  stop: () => invoke<void>("watch_stop"),
};
