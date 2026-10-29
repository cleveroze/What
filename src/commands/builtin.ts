import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { languageName, monaco } from "../editor/monaco";
import { ENCODING_LABELS, fs, state as nativeState, type Encoding } from "../ipc/native";
import { dirname } from "../lib/path";
import { clamp } from "../lib/util";
import {
  activeDoc,
  activeTab,
  closeAllTabs,
  closeOtherTabs,
  closeTab,
  cycleTab,
  editorStore,
  getActiveEditor,
  newUntitled,
  openFile,
  openSettingsTab,
  reloadDoc,
  reopenClosed,
  saveAll,
  saveDoc,
  setDocEncoding,
  setDocEol,
  setDocIndentation,
  setDocLanguage,
} from "../state/editors";
import { requestExit } from "../state/lifecycle";
import { clearOutput } from "../state/output";
import { getSetting, setSetting, type Density, type ThemeMode } from "../state/settings";
import {
  clearTerminal,
  closeTerminal,
  createTerminal,
  ensureTerminal,
  loadShells,
  requestTerminalFocus,
  sendToTerminal,
  terminalStore,
} from "../state/terminals";
import { confirm, openPalette, quickPick } from "../state/ui";
import {
  closeFolder,
  collapseAll,
  explorerStore,
  openFolder,
  refreshExplorer,
  revealInExplorer,
  setInlineEdit,
  setLayout,
  showPanel,
  showSidebarView,
  workspaceStore,
} from "../state/workspace";
import { PRESETS } from "../theme/presets";
import { registerCommands, type Command } from "./registry";
import { focusSearchInput } from "../state/search";

/** Runs a Monaco action on the active editor, focusing it first. */
function editorAction(actionId: string) {
  return () => {
    const editor = getActiveEditor();
    if (!editor || !editor.getModel()) return;
    editor.focus();
    const action = editor.getAction(actionId);
    if (action) action.run();
    else editor.trigger("menu", actionId, null);
  };
}

function editorNative(id: string, title: string, category: string, actionId: string, keybinding?: string): Command {
  return { id, title, category, keybinding, editorNative: true, run: editorAction(actionId) };
}

export async function pickOpenFiles() {
  const root = workspaceStore.get().root;
  const picked = await openDialog({ multiple: true, directory: false, defaultPath: root ?? undefined, title: "Open File" });
  const paths = Array.isArray(picked) ? picked : picked ? [picked] : [];
  for (const p of paths) await openFile(p);
}

export async function pickOpenFolder() {
  const picked = await openDialog({ directory: true, multiple: false, title: "Open Folder" });
  if (typeof picked === "string") await openFolder(picked);
}

export async function pickRecent() {
  const recent = workspaceStore.get().recent;
  if (!recent.length) {
    await pickOpenFolder();
    return;
  }
  const path = await quickPick(
    recent.map((r) => ({ label: r.name, description: r.path, value: r.path, icon: "folder" })),
    "Open a recent folder",
  );
  if (path) await openFolder(path);
}

function explorerTargetDir(): string | null {
  const root = workspaceStore.get().root;
  if (!root) return null;
  const sel = explorerStore.get().selected;
  if (!sel) return root;
  const entries = Object.values(explorerStore.get().dirs).flat();
  const entry = entries.find((e) => e.path === sel);
  return entry?.isDir ? sel : dirname(sel);
}

async function setZoom(z: number) {
  const zoom = Math.round(clamp(z, 0.5, 2) * 100) / 100;
  setSetting("window.zoom", zoom);
}

export async function applyZoom() {
  await getCurrentWebview().setZoom(getSetting("window.zoom")).catch(() => {});
}

async function changeLanguage() {
  const doc = activeDoc();
  if (!doc) return;
  const langs = monaco.languages
    .getLanguages()
    .map((l) => ({ label: l.aliases?.[0] ?? l.id, description: l.id, value: l.id }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const id = await quickPick(langs, `Select language mode (current: ${languageName(doc.language)})`);
  if (id) setDocLanguage(doc.id, id);
}

async function changeEncoding() {
  const doc = activeDoc();
  if (!doc) return;
  const enc = await quickPick(
    (Object.keys(ENCODING_LABELS) as Encoding[]).map((e) => ({
      label: ENCODING_LABELS[e],
      description: e === doc.encoding ? "current" : undefined,
      value: e,
    })),
    "Save with encoding",
  );
  if (enc) setDocEncoding(doc.id, enc);
}

async function changeEol() {
  const doc = activeDoc();
  if (!doc) return;
  const eol = await quickPick(
    [
      { label: "LF", description: "Unix, macOS", value: "LF" as const },
      { label: "CRLF", description: "Windows", value: "CRLF" as const },
    ],
    "Select end of line sequence",
  );
  if (eol) setDocEol(doc.id, eol);
}

async function changeIndentation() {
  const doc = activeDoc();
  if (!doc) return;
  const kind = await quickPick(
    [
      { label: "Indent Using Spaces", value: true },
      { label: "Indent Using Tabs", value: false },
    ],
    "Select indentation",
  );
  if (kind === undefined) return;
  const size = await quickPick(
    [1, 2, 3, 4, 6, 8].map((n) => ({ label: String(n), description: kind ? "spaces" : "tab size", value: n })),
    "Select tab size",
  );
  if (size) setDocIndentation(doc.id, kind, size);
}

async function selectPreset() {
  const id = await quickPick(
    PRESETS.map((p) => ({
      label: p.name,
      description: p.id === getSetting("theme.preset") ? "current" : p.description,
      value: p.id,
      icon: "palette",
    })),
    "Select color preset",
  );
  if (id) setSetting("theme.preset", id);
}

async function selectThemeMode() {
  const mode = await quickPick<ThemeMode>(
    [
      { label: "System", description: "Follow Windows", value: "system" },
      { label: "Light", value: "light" },
      { label: "Dark", value: "dark" },
    ],
    "Select theme mode",
  );
  if (mode) setSetting("theme.mode", mode);
}

async function selectDensity() {
  const d = await quickPick<Density>(
    [
      { label: "Compact", value: "compact" },
      { label: "Default", value: "default" },
      { label: "Comfortable", value: "comfortable" },
    ],
    "Select UI density",
  );
  if (d) setSetting("ui.density", d);
}

export async function selectDefaultShell() {
  const shells = await loadShells();
  const id = await quickPick(
    shells.map((s) => ({ label: s.name, description: s.path, value: s.id, icon: "terminal" })),
    "Select default terminal shell",
  );
  if (id) setSetting("terminal.shell", id);
}

async function newTerminalWithShell() {
  const shells = await loadShells();
  const id = await quickPick(
    shells.map((s) => ({ label: s.name, description: s.path, value: s.id, icon: "terminal" })),
    "Select shell for new terminal",
  );
  if (id) await createTerminal(id);
}

async function toggleTerminal() {
  const { layout } = workspaceStore.get();
  if (layout.panelVisible && layout.panelTab === "terminal") {
    setLayout({ panelVisible: false });
    getActiveEditor()?.focus();
    return;
  }
  showPanel("terminal");
  await ensureTerminal();
  requestTerminalFocus();
}

async function revertFile() {
  const doc = activeDoc();
  if (!doc?.path) return;
  if (doc.dirty && !(await confirm("Revert file", `Discard unsaved changes to '${doc.name}'?`, "Revert", true))) return;
  await reloadDoc(doc.id, true);
}

function runSelectionInTerminal() {
  const editor = getActiveEditor();
  const model = editor?.getModel();
  if (!editor || !model) return;
  const sel = editor.getSelection();
  const text = sel && !sel.isEmpty() ? model.getValueInRange(sel) : model.getLineContent(editor.getPosition()?.lineNumber ?? 1);
  if (!terminalStore.get().sessions.length) return;
  showPanel("terminal");
  sendToTerminal(text.replace(/\r?\n/g, "\r") + "\r");
}

export function registerBuiltinCommands() {
  const toggle = (key: Parameters<typeof getSetting>[0]) => () =>
    setSetting(key, !getSetting(key) as never);
  registerCommands([
    // ----- File -----
    { id: "file.newFile", title: "New Text File", category: "File", keybinding: "ctrl+n", run: () => newUntitled() },
    {
      id: "file.newFileInFolder",
      title: "New File in Explorer…",
      category: "File",
      keybinding: "ctrl+alt+n",
      enabled: () => !!workspaceStore.get().root,
      run: () => {
        const dir = explorerTargetDir();
        if (dir) {
          showSidebarView("explorer");
          setInlineEdit({ kind: "new-file", parent: dir });
        }
      },
    },
    {
      id: "file.newFolder",
      title: "New Folder…",
      category: "File",
      enabled: () => !!workspaceStore.get().root,
      run: () => {
        const dir = explorerTargetDir();
        if (dir) {
          showSidebarView("explorer");
          setInlineEdit({ kind: "new-folder", parent: dir });
        }
      },
    },
    { id: "file.open", title: "Open File…", category: "File", keybinding: "ctrl+o", run: pickOpenFiles },
    { id: "file.openFolder", title: "Open Folder…", category: "File", keybinding: "ctrl+k ctrl+o", run: pickOpenFolder },
    { id: "file.openRecent", title: "Open Recent…", category: "File", keybinding: "ctrl+r", run: pickRecent },
    {
      id: "file.save",
      title: "Save",
      category: "File",
      keybinding: "ctrl+s",
      run: () => {
        const doc = activeDoc();
        if (doc) return saveDoc(doc.id);
      },
    },
    {
      id: "file.saveAs",
      title: "Save As…",
      category: "File",
      keybinding: "ctrl+shift+s",
      run: () => {
        const doc = activeDoc();
        if (doc) return saveDoc(doc.id, { saveAs: true });
      },
    },
    { id: "file.saveAll", title: "Save All", category: "File", keybinding: "ctrl+k s", run: () => saveAll() },
    { id: "file.revert", title: "Revert File", category: "File", run: revertFile },
    {
      id: "file.closeEditor",
      title: "Close Editor",
      category: "File",
      keybinding: "ctrl+w",
      run: () => {
        const t = activeTab();
        if (t) return closeTab(t.id);
      },
    },
    {
      id: "file.closeOthers",
      title: "Close Other Editors",
      category: "File",
      run: () => {
        const t = activeTab();
        if (t) return closeOtherTabs(t.id);
      },
    },
    { id: "file.closeAll", title: "Close All Editors", category: "File", keybinding: "ctrl+k ctrl+w", run: () => closeAllTabs() },
    { id: "file.reopenClosed", title: "Reopen Closed Editor", category: "File", keybinding: "ctrl+shift+t", run: reopenClosed },
    { id: "file.closeFolder", title: "Close Folder", category: "File", keybinding: "ctrl+k f", enabled: () => !!workspaceStore.get().root, run: closeFolder },
    {
      id: "file.revealActive",
      title: "Reveal Active File in Explorer",
      category: "File",
      run: () => {
        const d = activeDoc();
        if (d?.path) revealInExplorer(d.path);
      },
    },
    {
      id: "file.revealInOS",
      title: "Reveal Active File in File Explorer",
      category: "File",
      keybinding: "shift+alt+r",
      run: () => {
        const d = activeDoc();
        if (d?.path) return fs.reveal(d.path);
      },
    },
    {
      id: "file.copyPath",
      title: "Copy Path of Active File",
      category: "File",
      keybinding: "shift+alt+c",
      run: () => {
        const d = activeDoc();
        if (d?.path) return navigator.clipboard.writeText(d.path);
      },
    },
    { id: "explorer.refresh", title: "Refresh Explorer", category: "Explorer", run: refreshExplorer },
    { id: "explorer.collapseAll", title: "Collapse Folders in Explorer", category: "Explorer", run: collapseAll },
    { id: "app.exit", title: "Exit", category: "File", run: requestExit },

    // ----- Edit (handled by Monaco) -----
    editorNative("edit.undo", "Undo", "Edit", "undo", "ctrl+z"),
    editorNative("edit.redo", "Redo", "Edit", "redo", "ctrl+y"),
    editorNative("edit.cut", "Cut", "Edit", "editor.action.clipboardCutAction", "ctrl+x"),
    editorNative("edit.copy", "Copy", "Edit", "editor.action.clipboardCopyAction", "ctrl+c"),
    editorNative("edit.paste", "Paste", "Edit", "editor.action.clipboardPasteAction", "ctrl+v"),
    editorNative("edit.find", "Find", "Edit", "actions.find", "ctrl+f"),
    editorNative("edit.replace", "Replace", "Edit", "editor.action.startFindReplaceAction", "ctrl+h"),
    editorNative("edit.toggleComment", "Toggle Line Comment", "Edit", "editor.action.commentLine", "ctrl+/"),
    editorNative("edit.blockComment", "Toggle Block Comment", "Edit", "editor.action.blockComment", "shift+alt+a"),
    editorNative("edit.format", "Format Document", "Edit", "editor.action.formatDocument", "shift+alt+f"),
    editorNative("edit.gotoLine", "Go to Line…", "Go", "editor.action.gotoLine", "ctrl+g"),
    editorNative("edit.gotoDefinition", "Go to Definition", "Go", "editor.action.revealDefinition", "f12"),
    editorNative("edit.peekDefinition", "Peek Definition", "Go", "editor.action.peekDefinition", "alt+f12"),
    editorNative("edit.findReferences", "Find All References", "Go", "editor.action.referenceSearch.trigger", "shift+f12"),
    editorNative("edit.gotoSymbol", "Go to Symbol in Editor…", "Go", "editor.action.quickOutline", "ctrl+shift+o"),
    editorNative("edit.rename", "Rename Symbol", "Edit", "editor.action.rename", "f2"),
    editorNative("edit.quickFix", "Quick Fix…", "Edit", "editor.action.quickFix", "ctrl+."),
    editorNative("edit.suggest", "Trigger Suggest", "Edit", "editor.action.triggerSuggest", "ctrl+space"),
    editorNative("edit.selectAll", "Select All", "Selection", "editor.action.selectAll", "ctrl+a"),
    editorNative("edit.expandSelection", "Expand Selection", "Selection", "editor.action.smartSelect.expand", "shift+alt+right"),
    editorNative("edit.shrinkSelection", "Shrink Selection", "Selection", "editor.action.smartSelect.shrink", "shift+alt+left"),
    editorNative("edit.cursorAbove", "Add Cursor Above", "Selection", "editor.action.insertCursorAbove", "ctrl+alt+up"),
    editorNative("edit.cursorBelow", "Add Cursor Below", "Selection", "editor.action.insertCursorBelow", "ctrl+alt+down"),
    editorNative("edit.cursorsLineEnds", "Add Cursors to Line Ends", "Selection", "editor.action.insertCursorAtEndOfEachLineSelected", "shift+alt+i"),
    editorNative("edit.addNextOccurrence", "Add Next Occurrence", "Selection", "editor.action.addSelectionToNextFindMatch", "ctrl+d"),
    editorNative("edit.selectAllOccurrences", "Select All Occurrences", "Selection", "editor.action.selectHighlights", "ctrl+shift+l"),
    editorNative("edit.moveLineUp", "Move Line Up", "Selection", "editor.action.moveLinesUpAction", "alt+up"),
    editorNative("edit.moveLineDown", "Move Line Down", "Selection", "editor.action.moveLinesDownAction", "alt+down"),
    editorNative("edit.copyLineUp", "Copy Line Up", "Selection", "editor.action.copyLinesUpAction", "shift+alt+up"),
    editorNative("edit.copyLineDown", "Copy Line Down", "Selection", "editor.action.copyLinesDownAction", "shift+alt+down"),
    editorNative("edit.deleteLine", "Delete Line", "Edit", "editor.action.deleteLines", "ctrl+shift+k"),
    editorNative("edit.fold", "Fold", "View", "editor.fold", "ctrl+shift+["),
    editorNative("edit.unfold", "Unfold", "View", "editor.unfold", "ctrl+shift+]"),
    editorNative("edit.foldAll", "Fold All", "View", "editor.foldAll", "ctrl+k ctrl+0"),
    editorNative("edit.unfoldAll", "Unfold All", "View", "editor.unfoldAll", "ctrl+k ctrl+j"),
    editorNative("edit.addLineComment", "Add Line Comment", "Edit", "editor.action.addCommentLine", "ctrl+k ctrl+c"),
    editorNative("edit.removeLineComment", "Remove Line Comment", "Edit", "editor.action.removeCommentLine", "ctrl+k ctrl+u"),
    editorNative("edit.formatSelection", "Format Selection", "Edit", "editor.action.formatSelection", "ctrl+k ctrl+f"),
    editorNative("edit.foldRecursively", "Fold Recursively", "View", "editor.foldRecursively", "ctrl+k ctrl+["),
    editorNative("edit.unfoldRecursively", "Unfold Recursively", "View", "editor.unfoldRecursively", "ctrl+k ctrl+]"),
    editorNative("edit.foldAllComments", "Fold All Block Comments", "View", "editor.foldAllBlockComments", "ctrl+k ctrl+/"),
    editorNative("edit.transformUpper", "Transform to Uppercase", "Edit", "editor.action.transformToUppercase"),
    editorNative("edit.transformLower", "Transform to Lowercase", "Edit", "editor.action.transformToLowercase"),
    editorNative("edit.sortLines", "Sort Lines Ascending", "Edit", "editor.action.sortLinesAscending"),
    editorNative("edit.trimWhitespace", "Trim Trailing Whitespace", "Edit", "editor.action.trimTrailingWhitespace", "ctrl+k ctrl+x"),
    {
      id: "edit.findInFiles",
      title: "Find in Files",
      category: "Edit",
      keybinding: "ctrl+shift+f",
      run: () => {
        const editor = getActiveEditor();
        const sel = editor?.getSelection();
        const text = sel && !sel.isEmpty() && sel.startLineNumber === sel.endLineNumber ? editor!.getModel()?.getValueInRange(sel) : undefined;
        showSidebarView("search");
        focusSearchInput(text, false);
      },
    },
    {
      id: "edit.replaceInFiles",
      title: "Replace in Files",
      category: "Edit",
      keybinding: "ctrl+shift+h",
      run: () => {
        showSidebarView("search");
        focusSearchInput(undefined, true);
      },
    },

    // ----- View -----
    { id: "workbench.commandPalette", title: "Show All Commands", category: "View", keybinding: "ctrl+shift+p", run: () => openPalette("commands") },
    { id: "workbench.commandPaletteF1", title: "Show All Commands (F1)", category: "View", keybinding: "f1", hidden: true, run: () => openPalette("commands") },
    { id: "workbench.quickOpen", title: "Go to File…", category: "Go", keybinding: "ctrl+p", run: () => openPalette("files") },
    { id: "workbench.gotoLinePalette", title: "Go to Line/Column…", category: "Go", run: () => openPalette("line") },
    { id: "view.explorer", title: "Show Explorer", category: "View", keybinding: "ctrl+shift+e", run: () => showSidebarView("explorer") },
    { id: "view.search", title: "Show Search", category: "View", run: () => showSidebarView("search") },
    {
      id: "view.toggleSidebar",
      title: "Toggle Primary Side Bar",
      category: "View",
      keybinding: "ctrl+b",
      run: () => setLayout({ sidebarVisible: !workspaceStore.get().layout.sidebarVisible }),
    },
    {
      id: "view.togglePanel",
      title: "Toggle Panel",
      category: "View",
      keybinding: "ctrl+j",
      run: () => setLayout({ panelVisible: !workspaceStore.get().layout.panelVisible }),
    },
    {
      id: "view.maximizePanel",
      title: "Toggle Maximized Panel",
      category: "View",
      run: () => {
        const l = workspaceStore.get().layout;
        setLayout({ panelVisible: true, panelMaximized: !l.panelMaximized });
      },
    },
    { id: "view.problems", title: "Show Problems", category: "View", keybinding: "ctrl+shift+m", run: () => showPanel("problems") },
    { id: "view.output", title: "Show Output", category: "View", keybinding: "ctrl+shift+u", run: () => showPanel("output") },
    { id: "view.clearOutput", title: "Clear Output", category: "View", run: clearOutput },
    { id: "view.toggleStatusBar", title: "Toggle Status Bar", category: "View", run: toggle("layout.statusBarVisible") },
    { id: "view.toggleActivityBar", title: "Toggle Activity Bar", category: "View", run: toggle("layout.activityBarVisible") },
    { id: "view.toggleBreadcrumbs", title: "Toggle Breadcrumbs", category: "View", run: toggle("layout.breadcrumbs") },
    { id: "view.toggleMinimap", title: "Toggle Minimap", category: "View", run: toggle("editor.minimap") },
    {
      id: "view.toggleWordWrap",
      title: "Toggle Word Wrap",
      category: "View",
      keybinding: "alt+z",
      run: () => setSetting("editor.wordWrap", getSetting("editor.wordWrap") === "off" ? "on" : "off"),
    },
    {
      id: "view.toggleSidebarPosition",
      title: "Toggle Side Bar Position",
      category: "View",
      run: () => setSetting("layout.sidebarPosition", getSetting("layout.sidebarPosition") === "left" ? "right" : "left"),
    },
    { id: "view.zoomIn", title: "Zoom In", category: "View", keybinding: "ctrl+=", run: () => setZoom(getSetting("window.zoom") + 0.1) },
    { id: "view.zoomInNumpad", title: "Zoom In (Numpad)", category: "View", keybinding: "ctrl+numpad_add", hidden: true, run: () => setZoom(getSetting("window.zoom") + 0.1) },
    { id: "view.zoomOut", title: "Zoom Out", category: "View", keybinding: "ctrl+-", run: () => setZoom(getSetting("window.zoom") - 0.1) },
    { id: "view.zoomOutNumpad", title: "Zoom Out (Numpad)", category: "View", keybinding: "ctrl+numpad_subtract", hidden: true, run: () => setZoom(getSetting("window.zoom") - 0.1) },
    { id: "view.zoomReset", title: "Reset Zoom", category: "View", keybinding: "ctrl+numpad0", run: () => setZoom(1) },
    {
      id: "view.fullscreen",
      title: "Toggle Full Screen",
      category: "View",
      keybinding: "f11",
      run: async () => {
        const w = getCurrentWindow();
        await w.setFullscreen(!(await w.isFullscreen()));
      },
    },
    { id: "view.nextEditor", title: "Next Editor", category: "View", keybinding: "ctrl+tab", run: () => cycleTab(1) },
    { id: "view.prevEditor", title: "Previous Editor", category: "View", keybinding: "ctrl+shift+tab", run: () => cycleTab(-1) },
    { id: "view.nextEditorPg", title: "Next Editor (PgDn)", category: "View", keybinding: "ctrl+pagedown", hidden: true, run: () => cycleTab(1) },
    { id: "view.prevEditorPg", title: "Previous Editor (PgUp)", category: "View", keybinding: "ctrl+pageup", hidden: true, run: () => cycleTab(-1) },

    // ----- Preferences -----
    { id: "settings.open", title: "Open Settings", category: "Preferences", keybinding: "ctrl+,", run: () => openSettingsTab() },
    { id: "settings.appearance", title: "Appearance & Customization", category: "Preferences", run: () => openSettingsTab("appearance") },
    { id: "settings.themes", title: "Browse Color Themes", category: "Preferences", run: () => openSettingsTab("themes") },
    { id: "settings.shortcuts", title: "Keyboard Shortcuts", category: "Preferences", keybinding: "ctrl+k ctrl+s", run: () => openSettingsTab("shortcuts") },
    { id: "theme.selectPreset", title: "Select Color Preset…", category: "Preferences", keybinding: "ctrl+k ctrl+t", run: selectPreset },
    { id: "theme.selectMode", title: "Select Theme Mode (Light / Dark / System)…", category: "Preferences", run: selectThemeMode },
    {
      id: "theme.toggleDark",
      title: "Toggle Light / Dark Theme",
      category: "Preferences",
      run: () => {
        const dark = document.documentElement.dataset.theme === "dark";
        setSetting("theme.mode", dark ? "light" : "dark");
      },
    },
    { id: "ui.selectDensity", title: "Select UI Density…", category: "Preferences", run: selectDensity },
    { id: "editor.changeLanguage", title: "Change Language Mode…", category: "Editor", keybinding: "ctrl+k m", run: changeLanguage },
    { id: "editor.changeEncoding", title: "Change File Encoding…", category: "Editor", run: changeEncoding },
    { id: "editor.changeEol", title: "Change End of Line Sequence…", category: "Editor", run: changeEol },
    { id: "editor.changeIndentation", title: "Change Indentation…", category: "Editor", run: changeIndentation },

    // ----- Terminal -----
    { id: "terminal.toggle", title: "Toggle Terminal", category: "Terminal", keybinding: "ctrl+`", run: toggleTerminal },
    { id: "terminal.new", title: "New Terminal", category: "Terminal", keybinding: "ctrl+shift+`", run: () => createTerminal() },
    { id: "terminal.newWithShell", title: "New Terminal with Shell…", category: "Terminal", run: newTerminalWithShell },
    {
      id: "terminal.kill",
      title: "Kill Active Terminal",
      category: "Terminal",
      enabled: () => !!terminalStore.get().activeId,
      run: () => {
        const id = terminalStore.get().activeId;
        if (id) return closeTerminal(id);
      },
    },
    { id: "terminal.clear", title: "Clear Terminal", category: "Terminal", run: () => clearTerminal() },
    { id: "terminal.runSelection", title: "Run Selected Text in Active Terminal", category: "Terminal", run: runSelectionInTerminal },
    { id: "terminal.selectDefaultShell", title: "Select Default Shell…", category: "Terminal", run: selectDefaultShell },

    // ----- Help -----
    {
      id: "help.about",
      title: "About Verso",
      category: "Help",
      run: async () => {
        const { getVersion, getTauriVersion } = await import("@tauri-apps/api/app");
        const { showDialog } = await import("../state/ui");
        const [v, tv] = await Promise.all([getVersion(), getTauriVersion()]);
        await showDialog({
          title: "Verso",
          message: `Version ${v}`,
          detail: `Tauri ${tv} · Monaco Editor · xterm.js\n${navigator.userAgent}`,
          buttons: [{ label: "OK", value: true, primary: true }],
          cancelValue: true,
        });
      },
    },
    {
      id: "help.openConfigFolder",
      title: "Reveal Settings Folder",
      category: "Help",
      run: async () => fs.reveal(await nativeState.dir()),
    },
    { id: "help.showLog", title: "Show Log", category: "Help", run: () => showPanel("output") },
  ]);
}

/** Tabs that can be closed with the same "close editor" key in the terminal panel etc. */
export const hasEditors = () => editorStore.get().tabs.length > 0;
