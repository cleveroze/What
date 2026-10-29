import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { languageForPath, monaco } from "../editor/monaco";
import { fs, type Encoding, type Eol } from "../ipc/native";
import { basename, dirname, isWithin, rebase, samePath } from "../lib/path";
import { createStore } from "../lib/store";
import { errorMessage, isWindows, uid } from "../lib/util";
import { log } from "./output";
import { getSetting, settingsStore } from "./settings";
import { notify, reportError, showDialog } from "./ui";
import { onTabsChanged, workspaceStore } from "./workspace";

export interface DocMeta {
  id: string;
  path: string | null;
  name: string;
  language: string;
  dirty: boolean;
  encoding: Encoding;
  eol: Eol;
  mtime: number;
  /** The file was deleted or moved away on disk while open. */
  orphaned: boolean;
  /** Bumped whenever the backing Monaco model is replaced. */
  modelRev: number;
}

export type Tab = { id: string; kind: "doc"; docId: string } | { id: "settings"; kind: "settings" };

export interface EditorState {
  docs: Record<string, DocMeta>;
  tabs: Tab[];
  activeTabId: string | null;
  settingsSection: string;
}

export const editorStore = createStore<EditorState>({
  docs: {},
  tabs: [],
  activeTabId: null,
  settingsSection: "general",
});

export interface CursorState {
  line: number;
  column: number;
  selections: number;
  selectedChars: number;
  tabSize: number;
  insertSpaces: boolean;
}

export const cursorStore = createStore<CursorState>({
  line: 1,
  column: 1,
  selections: 1,
  selectedChars: 0,
  tabSize: 4,
  insertSpaces: true,
});

interface DocRuntime {
  model: monaco.editor.ITextModel;
  savedVersion: number;
  encodingChanged: boolean;
  viewState: monaco.editor.ICodeEditorViewState | null;
  listener: monaco.IDisposable;
  autoSaveTimer?: ReturnType<typeof setTimeout>;
}

const runtime = new Map<string, DocRuntime>();
const closedStack: string[] = [];
let untitledCounter = 0;
let activeEditor: monaco.editor.IStandaloneCodeEditor | null = null;
let pendingReveal: { docId: string; range: monaco.IRange; focus: boolean } | null = null;
/** Whether activating a document should move keyboard focus into the editor. */
const focusRequests = new Map<string, boolean>();

export function takeFocusRequest(docId: string): boolean {
  const f = focusRequests.get(docId);
  focusRequests.delete(docId);
  return f ?? true;
}

// ---------- Accessors ----------

export const getModel = (docId: string) => runtime.get(docId)?.model ?? null;
export const getViewState = (docId: string) => runtime.get(docId)?.viewState ?? null;
export function setViewState(docId: string, vs: monaco.editor.ICodeEditorViewState | null) {
  const rt = runtime.get(docId);
  if (rt) rt.viewState = vs;
}
export const setActiveEditor = (e: monaco.editor.IStandaloneCodeEditor | null) => (activeEditor = e);
export const getActiveEditor = () => activeEditor;

export function activeTab(): Tab | null {
  const s = editorStore.get();
  return s.tabs.find((t) => t.id === s.activeTabId) ?? null;
}

export function activeDoc(): DocMeta | null {
  const tab = activeTab();
  return tab?.kind === "doc" ? editorStore.get().docs[tab.docId] ?? null : null;
}

export function findDocByPath(path: string): DocMeta | null {
  return Object.values(editorStore.get().docs).find((d) => d.path && samePath(d.path, path)) ?? null;
}

export const allDocs = () => Object.values(editorStore.get().docs);
export const dirtyDocs = () => allDocs().filter((d) => d.dirty);

export function takePendingReveal(docId: string) {
  if (pendingReveal?.docId !== docId) return null;
  const r = pendingReveal;
  pendingReveal = null;
  return r;
}

// ---------- Internal helpers ----------

function patchDoc(id: string, patch: Partial<DocMeta>) {
  editorStore.set((s) => {
    const doc = s.docs[id];
    if (!doc) return s;
    const changed = (Object.keys(patch) as (keyof DocMeta)[]).some((k) => doc[k] !== patch[k]);
    return changed ? { ...s, docs: { ...s.docs, [id]: { ...doc, ...patch } } } : s;
  });
}

function computeDirty(rt: DocRuntime) {
  return rt.model.getAlternativeVersionId() !== rt.savedVersion || rt.encodingChanged;
}

function applyIndentation(model: monaco.editor.ITextModel) {
  const tabSize = getSetting("editor.tabSize");
  const insertSpaces = getSetting("editor.insertSpaces");
  model.updateOptions({ tabSize, indentSize: tabSize, insertSpaces });
  if (getSetting("editor.detectIndentation")) model.detectIndentation(insertSpaces, tabSize);
}

function uriFor(path: string | null, name: string) {
  return path ? monaco.Uri.file(path) : monaco.Uri.from({ scheme: "untitled", path: name });
}

function attachModel(docId: string, model: monaco.editor.ITextModel, savedVersion: number, viewState: DocRuntime["viewState"] = null) {
  const listener = model.onDidChangeContent(() => {
    const rt = runtime.get(docId);
    if (!rt) return;
    patchDoc(docId, { dirty: computeDirty(rt) });
    scheduleAutoSave(docId);
  });
  runtime.set(docId, { model, savedVersion, encodingChanged: false, viewState, listener });
}

function createModel(content: string, language: string, path: string | null, name: string) {
  const uri = uriFor(path, name);
  monaco.editor.getModel(uri)?.dispose();
  const model = monaco.editor.createModel(content, language, uri);
  applyIndentation(model);
  return model;
}

/** Replaces a document's model (needed when its URI changes). */
function replaceModel(docId: string, path: string | null, name: string, language: string) {
  const rt = runtime.get(docId);
  if (!rt) return;
  const wasDirty = computeDirty(rt);
  const content = rt.model.getValue();
  const eol = rt.model.getEOL();
  const viewState = activeEditor?.getModel() === rt.model ? activeEditor.saveViewState() : rt.viewState;
  rt.listener.dispose();
  const old = rt.model;
  const model = createModel(content, language, path, name);
  model.setEOL(eol === "\r\n" ? monaco.editor.EndOfLineSequence.CRLF : monaco.editor.EndOfLineSequence.LF);
  attachModel(docId, model, wasDirty ? -1 : model.getAlternativeVersionId(), viewState);
  runtime.get(docId)!.encodingChanged = rt.encodingChanged;
  const doc = editorStore.get().docs[docId];
  patchDoc(docId, { modelRev: (doc?.modelRev ?? 0) + 1 });
  // Dispose after the editor has switched to the new model.
  queueMicrotask(() => old.dispose());
}

function insertTab(tab: Tab) {
  editorStore.set((s) => {
    const idx = s.tabs.findIndex((t) => t.id === s.activeTabId);
    const tabs = [...s.tabs];
    tabs.splice(idx < 0 ? tabs.length : idx + 1, 0, tab);
    return { ...s, tabs, activeTabId: tab.id };
  });
}

export function activateTab(tabId: string) {
  if (editorStore.get().activeTabId === tabId) return;
  editorStore.update({ activeTabId: tabId });
}

// ---------- Opening ----------

export interface OpenOptions {
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  focus?: boolean;
  background?: boolean;
}

export function revealInDoc(docId: string, opts: OpenOptions) {
  if (!opts.line) return;
  const range = {
    startLineNumber: opts.line,
    startColumn: opts.column ?? 1,
    endLineNumber: opts.endLine ?? opts.line,
    endColumn: opts.endColumn ?? opts.column ?? 1,
  };
  const focus = opts.focus ?? true;
  if (activeEditor && activeEditor.getModel() === getModel(docId)) {
    activeEditor.setSelection(range);
    activeEditor.revealRangeInCenterIfOutsideViewport(range, monaco.editor.ScrollType.Smooth);
    if (focus) activeEditor.focus();
  } else {
    pendingReveal = { docId, range, focus };
  }
}

const opening = new Map<string, Promise<DocMeta | null>>();

export async function openFile(path: string, opts: OpenOptions = {}): Promise<DocMeta | null> {
  const existing = findDocByPath(path);
  if (existing) {
    if (opts.focus === false) focusRequests.set(existing.id, false);
    if (!opts.background) activateTab(tabIdForDoc(existing.id));
    revealInDoc(existing.id, opts);
    return existing;
  }
  const key = path.toLowerCase();
  const inFlight = opening.get(key);
  if (inFlight) return inFlight;
  const task = (async () => {
    try {
      const file = await fs.readText(path);
      const name = basename(path);
      const language = languageForPath(path);
      const model = createModel(file.content, language, path, name);
      const id = uid("doc");
      attachModel(id, model, model.getAlternativeVersionId());
      const doc: DocMeta = {
        id,
        path,
        name,
        language,
        dirty: false,
        encoding: file.encoding,
        eol: file.eol,
        mtime: file.modified,
        orphaned: false,
        modelRev: 0,
      };
      editorStore.set((s) => ({ ...s, docs: { ...s.docs, [id]: doc } }));
      if (opts.focus === false) focusRequests.set(id, false);
      const tab: Tab = { id: `tab-${id}`, kind: "doc", docId: id };
      if (opts.background) {
        editorStore.set((s) => ({ ...s, tabs: [...s.tabs, tab], activeTabId: s.activeTabId ?? tab.id }));
      } else {
        insertTab(tab);
      }
      revealInDoc(id, opts);
      log(`Opened ${path} (${file.encoding.toUpperCase()}, ${file.eol})`);
      return doc;
    } catch (e) {
      reportError(`Cannot open ${basename(path)}`, e);
      return null;
    } finally {
      opening.delete(key);
    }
  })();
  opening.set(key, task);
  return task;
}

export const tabIdForDoc = (docId: string) => `tab-${docId}`;

export function newUntitled(language = "plaintext", content = "") {
  untitledCounter += 1;
  const name = `Untitled-${untitledCounter}`;
  const model = createModel(content, language, null, name);
  const eolSetting = getSetting("files.eol");
  const eol: Eol = eolSetting === "auto" ? (isWindows ? "CRLF" : "LF") : eolSetting;
  model.setEOL(eol === "CRLF" ? monaco.editor.EndOfLineSequence.CRLF : monaco.editor.EndOfLineSequence.LF);
  const id = uid("doc");
  attachModel(id, model, model.getAlternativeVersionId());
  editorStore.set((s) => ({
    ...s,
    docs: {
      ...s.docs,
      [id]: { id, path: null, name, language, dirty: false, encoding: "utf8", eol, mtime: 0, orphaned: false, modelRev: 0 },
    },
  }));
  insertTab({ id: tabIdForDoc(id), kind: "doc", docId: id });
  return id;
}

export function openSettingsTab(section?: string) {
  const s = editorStore.get();
  if (section) editorStore.update({ settingsSection: section });
  if (s.tabs.some((t) => t.id === "settings")) activateTab("settings");
  else insertTab({ id: "settings", kind: "settings" });
}

// ---------- Saving ----------

async function prepareForSave(docId: string) {
  const rt = runtime.get(docId);
  if (!rt) return;
  const model = rt.model;
  if (getSetting("editor.formatOnSave") && activeEditor?.getModel() === model) {
    const action = activeEditor.getAction("editor.action.formatDocument");
    if (action?.isSupported()) {
      try {
        await action.run();
      } catch (e) {
        log(`Format on save failed: ${errorMessage(e)}`, "warn");
      }
    }
  }
  const edits: monaco.editor.IIdentifiedSingleEditOperation[] = [];
  if (getSetting("files.trimTrailingWhitespace")) {
    for (let line = 1; line <= model.getLineCount(); line++) {
      const text = model.getLineContent(line);
      const trimmed = text.replace(/[ \t]+$/, "");
      if (trimmed.length !== text.length) {
        edits.push({ range: new monaco.Range(line, trimmed.length + 1, line, text.length + 1), text: "" });
      }
    }
  }
  if (getSetting("files.insertFinalNewline")) {
    const last = model.getLineCount();
    if (model.getLineContent(last).length > 0) {
      const col = model.getLineMaxColumn(last);
      edits.push({ range: new monaco.Range(last, col, last, col), text: model.getEOL() });
    }
  }
  if (edits.length) model.pushEditOperations(activeEditor?.getModel() === model ? activeEditor.getSelections() : [], edits, () => null);
}

export async function saveDoc(docId: string, opts: { saveAs?: boolean; silent?: boolean } = {}): Promise<boolean> {
  const doc = editorStore.get().docs[docId];
  const rt = runtime.get(docId);
  if (!doc || !rt) return false;
  let path = doc.path;
  if (!path || opts.saveAs) {
    const root = workspaceStore.get().root;
    const suggested = doc.path ?? (root ? `${root}${root.includes("\\") ? "\\" : "/"}${doc.name}` : doc.name);
    const chosen = await saveDialog({ defaultPath: suggested, title: opts.saveAs ? "Save As" : "Save" });
    if (!chosen) return false;
    path = chosen;
  }
  try {
    // Detect external modifications since we loaded the file.
    if (doc.path && path === doc.path && !doc.orphaned && !opts.silent) {
      const stat = await fs.stat(path);
      if (stat.exists && doc.mtime && stat.modified > doc.mtime + 1) {
        const choice = await showDialog({
          title: `'${doc.name}' was changed on disk`,
          message: "The file has been modified by another program since it was opened.",
          detail: "Overwrite it with your version, or reload the version on disk and discard your changes?",
          buttons: [
            { label: "Cancel", value: "cancel" },
            { label: "Reload from Disk", value: "reload" },
            { label: "Overwrite", value: "overwrite", primary: true, danger: true },
          ],
          cancelValue: "cancel",
        });
        if (choice === "cancel") return false;
        if (choice === "reload") {
          await reloadDoc(docId, true);
          return false;
        }
      }
    } else if (opts.silent && doc.path) {
      const stat = await fs.stat(doc.path);
      if (stat.exists && doc.mtime && stat.modified > doc.mtime + 1) return false;
    }
    await prepareForSave(docId);
    const content = rt.model.getValue();
    const mtime = await fs.writeText(path, content, doc.encoding);
    const pathChanged = !doc.path || !samePath(doc.path, path);
    if (pathChanged) {
      const name = basename(path);
      const language = doc.path ? doc.language : languageForPath(path);
      replaceModel(docId, path, name, language);
      patchDoc(docId, { path, name, language });
    }
    const current = runtime.get(docId)!;
    current.savedVersion = current.model.getAlternativeVersionId();
    current.encodingChanged = false;
    patchDoc(docId, { dirty: false, mtime, orphaned: false });
    if (!opts.silent) log(`Saved ${path}`);
    if (pathChanged) onTabsChanged();
    return true;
  } catch (e) {
    reportError(`Cannot save ${doc.name}`, e);
    return false;
  }
}

export async function saveAll(silent = false) {
  for (const doc of dirtyDocs()) {
    if (silent && (!doc.path || doc.orphaned)) continue;
    await saveDoc(doc.id, { silent });
  }
}

function scheduleAutoSave(docId: string) {
  if (getSetting("files.autoSave") !== "afterDelay") return;
  const rt = runtime.get(docId);
  const doc = editorStore.get().docs[docId];
  if (!rt || !doc?.path || doc.orphaned) return;
  clearTimeout(rt.autoSaveTimer);
  rt.autoSaveTimer = setTimeout(() => {
    if (editorStore.get().docs[docId]?.dirty) saveDoc(docId, { silent: true });
  }, Math.max(100, getSetting("files.autoSaveDelay")));
}

export function autoSaveOnFocusChange() {
  if (getSetting("files.autoSave") === "onFocusChange") saveAll(true);
}

// ---------- Reload / external changes ----------

export async function reloadDoc(docId: string, force = false) {
  const doc = editorStore.get().docs[docId];
  const rt = runtime.get(docId);
  if (!doc?.path || !rt) return;
  if (doc.dirty && !force) return;
  try {
    const file = await fs.readText(doc.path);
    const model = rt.model;
    if (model.getValue() !== file.content) {
      model.pushEditOperations([], [{ range: model.getFullModelRange(), text: file.content }], () => null);
    }
    rt.savedVersion = model.getAlternativeVersionId();
    rt.encodingChanged = false;
    patchDoc(docId, { dirty: false, mtime: file.modified, encoding: file.encoding, eol: file.eol, orphaned: false });
  } catch (e) {
    log(`Reload failed for ${doc.path}: ${errorMessage(e)}`, "warn");
  }
}

/** Reacts to file-system watcher batches for open documents. */
export async function handleExternalChanges(paths: string[] | null) {
  const docs = allDocs().filter((d) => d.path);
  const affected = paths ? docs.filter((d) => paths.some((p) => samePath(p, d.path!) || isWithin(d.path!, p))) : docs;
  for (const doc of affected) {
    const stat = await fs.stat(doc.path!);
    if (!stat.exists) {
      if (!doc.orphaned) patchDoc(doc.id, { orphaned: true });
      continue;
    }
    if (doc.orphaned) patchDoc(doc.id, { orphaned: false });
    if (stat.modified !== doc.mtime) {
      if (doc.dirty) {
        notify("warning", `'${doc.name}' changed on disk`, "Your unsaved edits are kept. Saving will ask before overwriting.");
      } else {
        await reloadDoc(doc.id);
      }
    }
  }
}

/** Keeps open documents pointing at the right file after a rename/move. */
export function handlePathRenamed(oldPath: string, newPath: string) {
  for (const doc of allDocs()) {
    if (doc.path && isWithin(doc.path, oldPath)) {
      const path = rebase(doc.path, oldPath, newPath);
      const name = basename(path);
      const language = languageForPath(path);
      replaceModel(doc.id, path, name, language);
      patchDoc(doc.id, { path, name, language, orphaned: false });
    }
  }
  onTabsChanged();
}

export function handlePathDeleted(path: string) {
  for (const doc of allDocs()) {
    if (doc.path && isWithin(doc.path, path)) patchDoc(doc.id, { orphaned: true });
  }
}

// ---------- Closing ----------

async function confirmDirty(docs: DocMeta[]): Promise<boolean> {
  if (!docs.length) return true;
  const single = docs.length === 1;
  const choice = await showDialog({
    title: single ? `Save changes to '${docs[0].name}'?` : `Save changes to ${docs.length} files?`,
    message: single ? undefined : docs.map((d) => d.name).join(", "),
    detail: "Your changes will be lost if you don't save them.",
    buttons: [
      { label: "Cancel", value: "cancel" },
      { label: "Don't Save", value: "discard" },
      { label: single ? "Save" : "Save All", value: "save", primary: true },
    ],
    cancelValue: "cancel",
  });
  if (choice === "cancel") return false;
  if (choice === "save") {
    for (const d of docs) if (!(await saveDoc(d.id))) return false;
  }
  return true;
}

function disposeDoc(docId: string) {
  const rt = runtime.get(docId);
  if (rt) {
    clearTimeout(rt.autoSaveTimer);
    rt.listener.dispose();
    rt.model.dispose();
    runtime.delete(docId);
  }
}

export async function closeTabs(tabIds: string[], { skipConfirm = false } = {}): Promise<boolean> {
  const s = editorStore.get();
  const tabs = s.tabs.filter((t) => tabIds.includes(t.id));
  const docs = tabs.flatMap((t) => (t.kind === "doc" && s.docs[t.docId] ? [s.docs[t.docId]] : []));
  if (!skipConfirm && !(await confirmDirty(docs.filter((d) => d.dirty)))) return false;
  for (const d of docs) if (d.path) closedStack.push(d.path);
  if (closedStack.length > 30) closedStack.splice(0, closedStack.length - 30);
  editorStore.set((st) => {
    const remaining = st.tabs.filter((t) => !tabIds.includes(t.id));
    let activeTabId = st.activeTabId;
    if (activeTabId && tabIds.includes(activeTabId)) {
      const oldIdx = st.tabs.findIndex((t) => t.id === activeTabId);
      const candidates = st.tabs.slice(oldIdx + 1).concat(st.tabs.slice(0, oldIdx).reverse());
      activeTabId = candidates.find((t) => !tabIds.includes(t.id))?.id ?? null;
    }
    const docsLeft = { ...st.docs };
    for (const d of docs) delete docsLeft[d.id];
    return { ...st, tabs: remaining, activeTabId, docs: docsLeft };
  });
  for (const d of docs) disposeDoc(d.id);
  return true;
}

export const closeTab = (tabId: string) => closeTabs([tabId]);

export function closeOtherTabs(tabId: string) {
  return closeTabs(editorStore.get().tabs.filter((t) => t.id !== tabId).map((t) => t.id));
}

export function closeTabsToRight(tabId: string) {
  const tabs = editorStore.get().tabs;
  const idx = tabs.findIndex((t) => t.id === tabId);
  return closeTabs(tabs.slice(idx + 1).map((t) => t.id));
}

export function closeSavedTabs() {
  const s = editorStore.get();
  return closeTabs(s.tabs.filter((t) => t.kind !== "doc" || !s.docs[t.docId]?.dirty).map((t) => t.id));
}

export const closeAllTabs = (opts?: { skipConfirm?: boolean }) =>
  closeTabs(editorStore.get().tabs.map((t) => t.id), opts);

/** Asks to save every dirty document; resolves false if the user cancels. */
export const confirmAllDirty = () => confirmDirty(dirtyDocs());

export async function reopenClosed() {
  const path = closedStack.pop();
  if (path) await openFile(path);
}

export function moveTab(fromIdx: number, toIdx: number) {
  editorStore.set((s) => {
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= s.tabs.length) return s;
    const tabs = [...s.tabs];
    const [t] = tabs.splice(fromIdx, 1);
    tabs.splice(Math.min(toIdx, tabs.length), 0, t);
    return { ...s, tabs };
  });
}

export function cycleTab(delta: number) {
  const s = editorStore.get();
  if (s.tabs.length < 2) return;
  const idx = s.tabs.findIndex((t) => t.id === s.activeTabId);
  const next = (idx + delta + s.tabs.length) % s.tabs.length;
  activateTab(s.tabs[next].id);
}

// ---------- Document properties ----------

export function setDocLanguage(docId: string, language: string) {
  const model = getModel(docId);
  if (!model) return;
  monaco.editor.setModelLanguage(model, language);
  patchDoc(docId, { language });
}

export function setDocEol(docId: string, eol: Eol) {
  const model = getModel(docId);
  if (!model) return;
  model.pushEOL(eol === "CRLF" ? monaco.editor.EndOfLineSequence.CRLF : monaco.editor.EndOfLineSequence.LF);
  patchDoc(docId, { eol });
}

export function setDocEncoding(docId: string, encoding: Encoding) {
  const rt = runtime.get(docId);
  const doc = editorStore.get().docs[docId];
  if (!rt || !doc || doc.encoding === encoding) return;
  rt.encodingChanged = true;
  patchDoc(docId, { encoding, dirty: true });
}

export function setDocIndentation(docId: string, insertSpaces: boolean, tabSize: number) {
  const model = getModel(docId);
  if (!model) return;
  model.updateOptions({ insertSpaces, tabSize, indentSize: tabSize });
  cursorStore.update({ insertSpaces, tabSize });
}

/** Applies new default indentation to open models when settings change. */
let lastIndent = "";
settingsStore.subscribe(() => {
  const s = settingsStore.get();
  const key = `${s["editor.tabSize"]}|${s["editor.insertSpaces"]}|${s["editor.detectIndentation"]}`;
  if (key === lastIndent) return;
  const first = lastIndent === "";
  lastIndent = key;
  if (first) return;
  runtime.forEach((rt) => applyIndentation(rt.model));
  const m = activeEditor?.getModel();
  if (m) cursorStore.update({ tabSize: m.getOptions().tabSize, insertSpaces: m.getOptions().insertSpaces });
});

export function dirnameOfActive(): string | null {
  const doc = activeDoc();
  return doc?.path ? dirname(doc.path) : null;
}
