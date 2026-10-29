import { createStore } from "../lib/store";
import { persist } from "./persist";

export type ThemeMode = "system" | "light" | "dark";
export type PresetId = "cream" | "graphite" | "ocean" | "forest" | "monochrome";
export type Density = "compact" | "default" | "comfortable";
export type Animation = "off" | "reduced" | "normal";
export type IconTheme = "color" | "mono" | "minimal";
export type ActivityItemId = "explorer" | "search" | "terminal" | "problems" | "settings";

export interface Settings {
  // General
  "workbench.restoreWorkspace": boolean;
  "workbench.confirmClose": boolean;
  "workbench.showWelcome": boolean;
  "workbench.onboarded": boolean;
  "workbench.tips": boolean;
  "workbench.checklist": boolean;
  "window.zoom": number;
  // Appearance
  "theme.mode": ThemeMode;
  "theme.preset": PresetId;
  "theme.accent": string;
  "theme.background": string;
  "theme.surface": string;
  "ui.radius": number;
  "ui.density": Density;
  "ui.fontFamily": string;
  "ui.fontSize": number;
  "ui.iconTheme": IconTheme;
  "ui.animation": Animation;
  "layout.sidebarPosition": "left" | "right";
  "layout.activityBarVisible": boolean;
  "layout.activityBarPosition": "side" | "top";
  "layout.activityItems": ActivityItemId[];
  "layout.hiddenActivityItems": ActivityItemId[];
  "layout.statusBarVisible": boolean;
  "layout.breadcrumbs": boolean;
  "advanced.customCss": string;
  // Editor
  "editor.fontFamily": string;
  "editor.fontSize": number;
  "editor.lineHeight": number;
  "editor.fontLigatures": boolean;
  "editor.tabSize": number;
  "editor.insertSpaces": boolean;
  "editor.detectIndentation": boolean;
  "editor.wordWrap": "off" | "on" | "bounded";
  "editor.minimap": boolean;
  "editor.lineNumbers": "on" | "off" | "relative";
  "editor.renderWhitespace": "none" | "boundary" | "selection" | "all";
  "editor.cursorStyle": "line" | "block" | "underline";
  "editor.cursorBlinking": "blink" | "smooth" | "phase" | "expand" | "solid";
  "editor.smoothCaret": boolean;
  "editor.smoothScrolling": boolean;
  "editor.bracketPairColorization": boolean;
  "editor.guides": boolean;
  "editor.stickyScroll": boolean;
  "editor.folding": boolean;
  "editor.autoClosingBrackets": boolean;
  "editor.quickSuggestions": boolean;
  "editor.formatOnSave": boolean;
  "editor.renderLineHighlight": "none" | "line" | "gutter" | "all";
  "editor.rulers": string;
  // Files
  "files.autoSave": "off" | "afterDelay" | "onFocusChange";
  "files.autoSaveDelay": number;
  "files.trimTrailingWhitespace": boolean;
  "files.insertFinalNewline": boolean;
  "files.eol": "auto" | "LF" | "CRLF";
  "files.exclude": string;
  "files.confirmDelete": boolean;
  "files.useTrash": boolean;
  "files.confirmDragAndDrop": boolean;
  // Search
  "search.exclude": string;
  "search.maxResults": number;
  // Terminal
  "terminal.shell": string;
  "terminal.fontFamily": string;
  "terminal.fontSize": number;
  "terminal.lineHeight": number;
  "terminal.cursorStyle": "block" | "underline" | "bar";
  "terminal.cursorBlink": boolean;
  "terminal.scrollback": number;
  "terminal.copyOnSelect": boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  "workbench.restoreWorkspace": true,
  "workbench.confirmClose": true,
  "workbench.showWelcome": true,
  "workbench.onboarded": false,
  "workbench.tips": true,
  "workbench.checklist": true,
  "window.zoom": 1,
  "theme.mode": "system",
  "theme.preset": "cream",
  "theme.accent": "",
  "theme.background": "",
  "theme.surface": "",
  "ui.radius": 10,
  "ui.density": "default",
  "ui.fontFamily": '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif',
  "ui.fontSize": 13,
  "ui.iconTheme": "color",
  "ui.animation": "normal",
  "layout.sidebarPosition": "left",
  "layout.activityBarVisible": true,
  "layout.activityBarPosition": "side",
  "layout.activityItems": ["explorer", "search", "terminal", "problems", "settings"],
  "layout.hiddenActivityItems": [],
  "layout.statusBarVisible": true,
  "layout.breadcrumbs": true,
  "advanced.customCss": "",
  "editor.fontFamily": '"Cascadia Code", "Cascadia Mono", Consolas, "Courier New", monospace',
  "editor.fontSize": 14,
  "editor.lineHeight": 1.55,
  "editor.fontLigatures": true,
  "editor.tabSize": 4,
  "editor.insertSpaces": true,
  "editor.detectIndentation": true,
  "editor.wordWrap": "off",
  "editor.minimap": true,
  "editor.lineNumbers": "on",
  "editor.renderWhitespace": "selection",
  "editor.cursorStyle": "line",
  "editor.cursorBlinking": "smooth",
  "editor.smoothCaret": true,
  "editor.smoothScrolling": true,
  "editor.bracketPairColorization": true,
  "editor.guides": true,
  "editor.stickyScroll": true,
  "editor.folding": true,
  "editor.autoClosingBrackets": true,
  "editor.quickSuggestions": true,
  "editor.formatOnSave": false,
  "editor.renderLineHighlight": "all",
  "editor.rulers": "",
  "files.autoSave": "off",
  "files.autoSaveDelay": 1000,
  "files.trimTrailingWhitespace": false,
  "files.insertFinalNewline": false,
  "files.eol": "auto",
  "files.exclude": ".git, .svn, .hg, .DS_Store, Thumbs.db",
  "files.confirmDelete": true,
  "files.useTrash": true,
  "files.confirmDragAndDrop": true,
  "search.exclude": "node_modules, dist, build, target, *.min.js, *.lock",
  "search.maxResults": 5000,
  "terminal.shell": "",
  "terminal.fontFamily": '"Cascadia Mono", "Cascadia Code", Consolas, monospace',
  "terminal.fontSize": 13,
  "terminal.lineHeight": 1.15,
  "terminal.cursorStyle": "bar",
  "terminal.cursorBlink": true,
  "terminal.scrollback": 5000,
  "terminal.copyOnSelect": false,
};

export type SettingKey = keyof Settings;

export const settingsStore = createStore<Settings>({ ...DEFAULT_SETTINGS });

/** Merges a loaded/imported object over defaults, keeping only known keys
 * whose value type matches the default. */
export function sanitizeSettings(raw: unknown): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!(key in DEFAULT_SETTINGS)) continue;
    const def = DEFAULT_SETTINGS[key as SettingKey];
    const ok = Array.isArray(def) ? Array.isArray(value) : typeof value === typeof def;
    if (ok) (out as unknown as Record<string, unknown>)[key] = value;
  }
  // Keep activity items complete even if new ones were added in an update.
  const items = out["layout.activityItems"].filter((i) => DEFAULT_SETTINGS["layout.activityItems"].includes(i));
  for (const i of DEFAULT_SETTINGS["layout.activityItems"]) if (!items.includes(i)) items.push(i);
  out["layout.activityItems"] = items;
  return out;
}

export function getSetting<K extends SettingKey>(key: K): Settings[K] {
  return settingsStore.get()[key];
}

export function setSetting<K extends SettingKey>(key: K, value: Settings[K]) {
  settingsStore.set((s) => ({ ...s, [key]: value }));
}

export function resetSetting(key: SettingKey) {
  setSetting(key, DEFAULT_SETTINGS[key]);
}

export function replaceSettings(next: Settings) {
  settingsStore.set(next);
}

/** Only non-default values are written, so future default changes apply. */
function diffFromDefaults(s: Settings): Partial<Settings> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(s) as SettingKey[]) {
    if (JSON.stringify(s[key]) !== JSON.stringify(DEFAULT_SETTINGS[key])) out[key] = s[key];
  }
  return out as Partial<Settings>;
}

export function exportSettings(): string {
  return JSON.stringify(diffFromDefaults(settingsStore.get()), null, 2);
}

settingsStore.subscribe(() => persist("settings", diffFromDefaults(settingsStore.get())));
