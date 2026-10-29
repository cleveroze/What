import type { SettingKey } from "../../state/settings";

export type SectionId = "general" | "editor" | "appearance" | "themes" | "terminal" | "files" | "shortcuts" | "advanced";

export const SECTIONS: { id: SectionId; label: string; icon: string; description: string }[] = [
  { id: "general", label: "General", icon: "general", description: "Startup, windows and session behaviour" },
  { id: "editor", label: "Editor", icon: "code", description: "Typography, cursor, indentation and editing aids" },
  { id: "appearance", label: "Appearance", icon: "layout", description: "Layout, density, shape, motion and icons" },
  { id: "themes", label: "Themes", icon: "palette", description: "Color presets, accent and surface colors" },
  { id: "terminal", label: "Terminal", icon: "terminal", description: "Shell, font and cursor of the integrated terminal" },
  { id: "files", label: "Files", icon: "files", description: "Saving, encoding, deletion and exclusions" },
  { id: "shortcuts", label: "Keyboard Shortcuts", icon: "keyboard", description: "View and customize key bindings" },
  { id: "advanced", label: "Advanced", icon: "wrench", description: "Custom CSS, import, export and reset" },
];

type Opt<T> = { value: T; label: string }[];

export type Control =
  | { type: "toggle" }
  | { type: "select"; options: Opt<string> }
  | { type: "segmented"; options: Opt<string> }
  | { type: "number"; min: number; max: number; step?: number }
  | { type: "slider"; min: number; max: number; step?: number; unit?: string; decimals?: number }
  | { type: "text"; placeholder?: string; monospace?: boolean }
  | { type: "color"; role: "accent" | "background" | "surface" }
  | { type: "shell" }
  | { type: "activityItems" };

export interface SettingDef {
  key: SettingKey;
  section: SectionId;
  group?: string;
  label: string;
  description: string;
  control: Control;
  /** Wide controls render below the label instead of beside it. */
  wide?: boolean;
}

export const SETTINGS: SettingDef[] = [
  // General
  { key: "workbench.restoreWorkspace", section: "general", group: "Startup", label: "Restore previous session", description: "Reopen the last folder and its editors when Stride starts.", control: { type: "toggle" } },
  { key: "workbench.showWelcome", section: "general", group: "Startup", label: "Show welcome page", description: "Show the welcome page with recent folders when no editor is open.", control: { type: "toggle" } },
  { key: "workbench.tips", section: "general", group: "Help", label: "Beginner hints", description: "Explain buttons in tooltips and show tips on the welcome page.", control: { type: "toggle" } },
  { key: "workbench.checklist", section: "general", group: "Help", label: "First steps checklist", description: "Show the “First steps” checklist on the welcome page.", control: { type: "toggle" } },
  { key: "workbench.confirmClose", section: "general", group: "Window", label: "Confirm before closing", description: "Ask to save unsaved changes when closing the window.", control: { type: "toggle" } },
  { key: "window.zoom", section: "general", group: "Window", label: "Zoom level", description: "Scales the entire interface (Ctrl+= / Ctrl+-). Windows display scaling is applied on top automatically.", control: { type: "slider", min: 0.5, max: 2, step: 0.05, decimals: 2, unit: "×" } },
  { key: "search.maxResults", section: "general", group: "Search", label: "Maximum search results", description: "Stop a workspace search after this many matches.", control: { type: "number", min: 100, max: 100000, step: 500 } },
  { key: "search.exclude", section: "general", group: "Search", label: "Search exclude patterns", description: "Comma separated globs skipped by Find in Files, in addition to .gitignore.", control: { type: "text", monospace: true }, wide: true },

  // Editor
  { key: "editor.fontFamily", section: "editor", group: "Typography", label: "Font family", description: "Comma separated list of font families, first available wins.", control: { type: "text", monospace: true }, wide: true },
  { key: "editor.fontSize", section: "editor", group: "Typography", label: "Font size", description: "Editor font size in pixels.", control: { type: "slider", min: 8, max: 32, step: 1, unit: "px" } },
  { key: "editor.lineHeight", section: "editor", group: "Typography", label: "Line height", description: "Line height as a multiple of the font size.", control: { type: "slider", min: 1, max: 2.4, step: 0.05, decimals: 2, unit: "×" } },
  { key: "editor.fontLigatures", section: "editor", group: "Typography", label: "Font ligatures", description: "Render programming ligatures such as => and != when the font supports them.", control: { type: "toggle" } },
  { key: "editor.tabSize", section: "editor", group: "Indentation", label: "Tab size", description: "Number of spaces a tab is equal to.", control: { type: "number", min: 1, max: 12 } },
  { key: "editor.insertSpaces", section: "editor", group: "Indentation", label: "Insert spaces", description: "Insert spaces when pressing Tab.", control: { type: "toggle" } },
  { key: "editor.detectIndentation", section: "editor", group: "Indentation", label: "Detect indentation", description: "Detect tab size and spaces vs. tabs from the file contents.", control: { type: "toggle" } },
  { key: "editor.wordWrap", section: "editor", group: "Display", label: "Word wrap", description: "Wrap long lines at the viewport (On) or at 120 columns (Bounded).", control: { type: "segmented", options: [{ value: "off", label: "Off" }, { value: "on", label: "On" }, { value: "bounded", label: "Bounded" }] } },
  { key: "editor.minimap", section: "editor", group: "Display", label: "Minimap", description: "Show a zoomed-out overview of the file.", control: { type: "toggle" } },
  { key: "editor.lineNumbers", section: "editor", group: "Display", label: "Line numbers", description: "How line numbers are rendered.", control: { type: "segmented", options: [{ value: "on", label: "On" }, { value: "relative", label: "Relative" }, { value: "off", label: "Off" }] } },
  { key: "editor.renderWhitespace", section: "editor", group: "Display", label: "Render whitespace", description: "When to draw whitespace characters.", control: { type: "select", options: [{ value: "none", label: "None" }, { value: "boundary", label: "Boundary" }, { value: "selection", label: "Selection" }, { value: "all", label: "All" }] } },
  { key: "editor.renderLineHighlight", section: "editor", group: "Display", label: "Current line highlight", description: "How the current line is highlighted.", control: { type: "select", options: [{ value: "none", label: "None" }, { value: "gutter", label: "Gutter" }, { value: "line", label: "Line" }, { value: "all", label: "Gutter and line" }] } },
  { key: "editor.rulers", section: "editor", group: "Display", label: "Rulers", description: "Comma separated column numbers for vertical rulers, e.g. 80, 120.", control: { type: "text", placeholder: "80, 120", monospace: true } },
  { key: "editor.stickyScroll", section: "editor", group: "Display", label: "Sticky scroll", description: "Keep the enclosing scopes visible at the top while scrolling.", control: { type: "toggle" } },
  { key: "editor.bracketPairColorization", section: "editor", group: "Display", label: "Bracket pair colorization", description: "Color matching brackets by nesting level.", control: { type: "toggle" } },
  { key: "editor.guides", section: "editor", group: "Display", label: "Indent and bracket guides", description: "Draw indentation guides and highlight the active bracket pair.", control: { type: "toggle" } },
  { key: "editor.folding", section: "editor", group: "Display", label: "Code folding", description: "Allow collapsing regions of code from the gutter.", control: { type: "toggle" } },
  { key: "editor.cursorStyle", section: "editor", group: "Cursor", label: "Cursor style", description: "Shape of the text cursor.", control: { type: "segmented", options: [{ value: "line", label: "Line" }, { value: "block", label: "Block" }, { value: "underline", label: "Underline" }] } },
  { key: "editor.cursorBlinking", section: "editor", group: "Cursor", label: "Cursor blinking", description: "Animation style of the cursor.", control: { type: "select", options: [{ value: "blink", label: "Blink" }, { value: "smooth", label: "Smooth" }, { value: "phase", label: "Phase" }, { value: "expand", label: "Expand" }, { value: "solid", label: "Solid" }] } },
  { key: "editor.smoothCaret", section: "editor", group: "Cursor", label: "Smooth caret animation", description: "Animate the cursor between positions.", control: { type: "toggle" } },
  { key: "editor.smoothScrolling", section: "editor", group: "Cursor", label: "Smooth scrolling", description: "Animate scrolling in the editor.", control: { type: "toggle" } },
  { key: "editor.autoClosingBrackets", section: "editor", group: "Editing", label: "Auto close brackets and quotes", description: "Insert the closing bracket or quote automatically.", control: { type: "toggle" } },
  { key: "editor.quickSuggestions", section: "editor", group: "Editing", label: "Suggestions while typing", description: "Show autocomplete suggestions automatically.", control: { type: "toggle" } },
  { key: "editor.formatOnSave", section: "editor", group: "Editing", label: "Format on save", description: "Format the document when saving (for languages with a built-in formatter: JS, TS, JSON, CSS, HTML).", control: { type: "toggle" } },

  // Appearance
  { key: "theme.mode", section: "appearance", group: "Theme", label: "Theme mode", description: "Light, dark, or follow the Windows app mode.", control: { type: "segmented", options: [{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }] } },
  { key: "ui.density", section: "appearance", group: "Shape & density", label: "UI density", description: "Row heights and spacing across the workbench.", control: { type: "segmented", options: [{ value: "compact", label: "Compact" }, { value: "default", label: "Default" }, { value: "comfortable", label: "Comfortable" }] } },
  { key: "ui.radius", section: "appearance", group: "Shape & density", label: "Corner radius", description: "Roundness of surfaces, menus and controls. 0 gives a strict, square look.", control: { type: "slider", min: 0, max: 16, step: 1, unit: "px" } },
  { key: "ui.animation", section: "appearance", group: "Motion", label: "Animations", description: "Lively uses springy, shape-morphing Material 3 Expressive motion; Calm keeps it short and gentle; Off disables motion entirely.", control: { type: "segmented", options: [{ value: "off", label: "Off" }, { value: "reduced", label: "Calm" }, { value: "normal", label: "Lively" }] } },
  { key: "ui.fontFamily", section: "appearance", group: "Typography", label: "Interface font", description: "Font used by menus, panels and the explorer.", control: { type: "text" }, wide: true },
  { key: "ui.fontSize", section: "appearance", group: "Typography", label: "Interface font size", description: "Base size of interface text.", control: { type: "slider", min: 11, max: 16, step: 1, unit: "px" } },
  { key: "ui.iconTheme", section: "appearance", group: "Icons", label: "File icon theme", description: "How files are represented in the explorer, tabs and search.", control: { type: "segmented", options: [{ value: "color", label: "Stride Color" }, { value: "mono", label: "Stride Mono" }, { value: "minimal", label: "Minimal" }] } },
  { key: "layout.sidebarPosition", section: "appearance", group: "Layout", label: "Side bar position", description: "Place the side bar on the left or right of the editor.", control: { type: "segmented", options: [{ value: "left", label: "Left" }, { value: "right", label: "Right" }] } },
  { key: "layout.activityBarVisible", section: "appearance", group: "Layout", label: "Show activity bar", description: "Show the bar with view switchers.", control: { type: "toggle" } },
  { key: "layout.activityBarPosition", section: "appearance", group: "Layout", label: "Activity bar placement", description: "Vertical rail beside the side bar, or a compact row on top of it.", control: { type: "segmented", options: [{ value: "side", label: "Side" }, { value: "top", label: "Top" }] } },
  { key: "layout.activityItems", section: "appearance", group: "Layout", label: "Activity bar items", description: "Choose which items are shown and in what order.", control: { type: "activityItems" }, wide: true },
  { key: "layout.statusBarVisible", section: "appearance", group: "Layout", label: "Show status bar", description: "Show the bar with cursor position, encoding and language.", control: { type: "toggle" } },
  { key: "layout.breadcrumbs", section: "appearance", group: "Layout", label: "Show breadcrumbs", description: "Show the file path above the editor.", control: { type: "toggle" } },

  // Themes (preset gallery is rendered separately)
  { key: "theme.accent", section: "themes", group: "Custom colors", label: "Accent color", description: "Cursor, selection, focus and highlights. Leave empty to use the preset's accent.", control: { type: "color", role: "accent" }, wide: true },
  { key: "theme.background", section: "themes", group: "Custom colors", label: "Background color", description: "The window frame behind panels; surfaces are derived from it.", control: { type: "color", role: "background" }, wide: true },
  { key: "theme.surface", section: "themes", group: "Custom colors", label: "Surface color", description: "Side bar and panel surfaces; the editor is derived from it.", control: { type: "color", role: "surface" }, wide: true },

  // Terminal
  { key: "terminal.shell", section: "terminal", group: "Shell", label: "Default shell", description: "Shell started by New Terminal. Detected from this machine.", control: { type: "shell" } },
  { key: "terminal.fontFamily", section: "terminal", group: "Appearance", label: "Font family", description: "Font of the integrated terminal.", control: { type: "text", monospace: true }, wide: true },
  { key: "terminal.fontSize", section: "terminal", group: "Appearance", label: "Font size", description: "Terminal font size in pixels.", control: { type: "slider", min: 8, max: 28, step: 1, unit: "px" } },
  { key: "terminal.lineHeight", section: "terminal", group: "Appearance", label: "Line height", description: "Terminal line height multiplier.", control: { type: "slider", min: 1, max: 2, step: 0.05, decimals: 2, unit: "×" } },
  { key: "terminal.cursorStyle", section: "terminal", group: "Appearance", label: "Cursor style", description: "Shape of the terminal cursor.", control: { type: "segmented", options: [{ value: "bar", label: "Bar" }, { value: "block", label: "Block" }, { value: "underline", label: "Underline" }] } },
  { key: "terminal.cursorBlink", section: "terminal", group: "Appearance", label: "Cursor blinking", description: "Blink the terminal cursor.", control: { type: "toggle" } },
  { key: "terminal.scrollback", section: "terminal", group: "Behaviour", label: "Scrollback", description: "Lines kept in the terminal buffer.", control: { type: "number", min: 500, max: 100000, step: 500 } },
  { key: "terminal.copyOnSelect", section: "terminal", group: "Behaviour", label: "Copy on selection", description: "Copy selected terminal text to the clipboard automatically.", control: { type: "toggle" } },

  // Files
  { key: "files.autoSave", section: "files", group: "Saving", label: "Auto save", description: "Save dirty files automatically after a delay or when the editor loses focus.", control: { type: "segmented", options: [{ value: "off", label: "Off" }, { value: "afterDelay", label: "After delay" }, { value: "onFocusChange", label: "On focus change" }] } },
  { key: "files.autoSaveDelay", section: "files", group: "Saving", label: "Auto save delay", description: "Milliseconds after the last edit before saving (After delay mode).", control: { type: "number", min: 100, max: 60000, step: 100 } },
  { key: "files.trimTrailingWhitespace", section: "files", group: "Saving", label: "Trim trailing whitespace", description: "Remove trailing spaces and tabs when saving.", control: { type: "toggle" } },
  { key: "files.insertFinalNewline", section: "files", group: "Saving", label: "Insert final newline", description: "Ensure files end with a newline when saving.", control: { type: "toggle" } },
  { key: "files.eol", section: "files", group: "Saving", label: "Default end of line", description: "Line ending for new files. Existing files keep theirs.", control: { type: "segmented", options: [{ value: "auto", label: "Auto" }, { value: "LF", label: "LF" }, { value: "CRLF", label: "CRLF" }] } },
  { key: "files.useTrash", section: "files", group: "Deleting", label: "Delete to Recycle Bin", description: "Move deleted files to the Recycle Bin instead of deleting permanently.", control: { type: "toggle" } },
  { key: "files.confirmDelete", section: "files", group: "Deleting", label: "Confirm delete", description: "Ask before deleting files and folders.", control: { type: "toggle" } },
  { key: "files.confirmDragAndDrop", section: "files", group: "Explorer", label: "Confirm drag and drop", description: "Ask before moving files by dragging them in the explorer.", control: { type: "toggle" } },
  { key: "files.exclude", section: "files", group: "Explorer", label: "Exclude patterns", description: "Comma separated globs hidden from the explorer (e.g. .git, **/dist).", control: { type: "text", monospace: true }, wide: true },
];
