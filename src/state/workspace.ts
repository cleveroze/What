import { getCurrentWindow } from "@tauri-apps/api/window";
import { fs, watcher, type DirEntry } from "../ipc/native";
import { basename, dirname, isWithin, join, relative, samePath } from "../lib/path";
import { createStore } from "../lib/store";
import { errorMessage } from "../lib/util";
import { compileGlobs } from "../lib/glob";
import {
  activeTab,
  closeAllTabs,
  confirmAllDirty,
  editorStore,
  getViewState,
  handleExternalChanges,
  openFile,
  setViewState,
} from "./editors";
import { log } from "./output";
import { completeStep } from "./progress";
import { load, persist } from "./persist";
import { getSetting, settingsStore } from "./settings";
import { reportError } from "./ui";

export type SidebarView = "explorer" | "search";
export type PanelTab = "terminal" | "output" | "problems";

export interface Layout {
  sidebarVisible: boolean;
  sidebarWidth: number;
  sidebarView: SidebarView;
  panelVisible: boolean;
  panelHeight: number;
  panelMaximized: boolean;
  panelTab: PanelTab;
}

export interface RecentEntry {
  path: string;
  name: string;
  openedAt: number;
}

export const DEFAULT_LAYOUT: Layout = {
  sidebarVisible: true,
  sidebarWidth: 260,
  sidebarView: "explorer",
  panelVisible: false,
  panelHeight: 260,
  panelMaximized: false,
  panelTab: "terminal",
};

export const workspaceStore = createStore<{ root: string | null; layout: Layout; recent: RecentEntry[]; ready: boolean }>({
  root: null,
  layout: DEFAULT_LAYOUT,
  recent: [],
  ready: false,
});

interface FolderState {
  openFiles: { path: string; viewState?: unknown }[];
  active: string | null;
  expanded: string[];
}

let folderStates: Record<string, FolderState> = {};

// ---------- Layout ----------

export function setLayout(patch: Partial<Layout>) {
  workspaceStore.set((s) => ({ ...s, layout: { ...s.layout, ...patch } }));
}

export function showSidebarView(view: SidebarView, toggle = false) {
  const { layout } = workspaceStore.get();
  if (toggle && layout.sidebarVisible && layout.sidebarView === view) setLayout({ sidebarVisible: false });
  else setLayout({ sidebarVisible: true, sidebarView: view });
}

export function showPanel(tab: PanelTab, toggle = false) {
  const { layout } = workspaceStore.get();
  if (toggle && layout.panelVisible && layout.panelTab === tab) setLayout({ panelVisible: false });
  else setLayout({ panelVisible: true, panelTab: tab });
}

// ---------- Explorer tree ----------

export type InlineEdit =
  | { kind: "new-file" | "new-folder"; parent: string }
  | { kind: "rename"; target: string };

export interface ExplorerState {
  dirs: Record<string, DirEntry[]>;
  expanded: Record<string, boolean>;
  selected: string | null;
  edit: InlineEdit | null;
  clipboard: { paths: string[]; cut: boolean } | null;
  errors: Record<string, string>;
  /** Folder most recently expanded, for the staggered reveal animation. */
  lastExpanded?: { key: string; at: number };
}

export const explorerStore = createStore<ExplorerState>({
  dirs: {},
  expanded: {},
  selected: null,
  edit: null,
  clipboard: null,
  errors: {},
});

const dirKey = (p: string) => p.replace(/\\/g, "/").toLowerCase();

export function getDirEntries(path: string): DirEntry[] | undefined {
  return explorerStore.get().dirs[dirKey(path)];
}

let excludeMatcher = compileGlobs(getSetting("files.exclude"));
settingsStore.subscribe(() => {
  const next = getSetting("files.exclude");
  if (next !== lastExclude) {
    lastExclude = next;
    excludeMatcher = compileGlobs(next);
    explorerStore.set((s) => ({ ...s, dirs: { ...s.dirs } }));
  }
});
let lastExclude = getSetting("files.exclude");

export function isExcluded(entry: DirEntry): boolean {
  const root = workspaceStore.get().root;
  return excludeMatcher(entry.name, root ? relative(root, entry.path) : entry.name);
}

export async function loadDir(path: string) {
  try {
    const entries = await fs.readDir(path);
    explorerStore.set((s) => {
      const errors = { ...s.errors };
      delete errors[dirKey(path)];
      return { ...s, dirs: { ...s.dirs, [dirKey(path)]: entries }, errors };
    });
  } catch (e) {
    explorerStore.set((s) => ({ ...s, errors: { ...s.errors, [dirKey(path)]: errorMessage(e) } }));
  }
}

export async function toggleDir(path: string, expand?: boolean) {
  const key = dirKey(path);
  const isOpen = !!explorerStore.get().expanded[key];
  const next = expand ?? !isOpen;
  explorerStore.set((s) => ({
    ...s,
    expanded: { ...s.expanded, [key]: next },
    lastExpanded: next ? { key, at: Date.now() } : s.lastExpanded,
  }));
  if (next && !explorerStore.get().dirs[key]) await loadDir(path);
  saveFolderState();
}

export const isExpanded = (path: string) => !!explorerStore.get().expanded[dirKey(path)];

export function collapseAll() {
  explorerStore.set((s) => ({ ...s, expanded: {} }));
  saveFolderState();
}

export function selectInExplorer(path: string | null) {
  explorerStore.update({ selected: path });
}

/** Expands all ancestors of `path`, selects it and shows the explorer. */
export async function revealInExplorer(path: string, show = true) {
  const root = workspaceStore.get().root;
  if (!root || !isWithin(path, root)) return;
  if (show) showSidebarView("explorer");
  const chain: string[] = [];
  let dir = dirname(path);
  while (dir && isWithin(dir, root) && !samePath(dir, root)) {
    chain.unshift(dir);
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const d of chain) await toggleDir(d, true);
  selectInExplorer(path);
}

export async function refreshExplorer() {
  const { root } = workspaceStore.get();
  if (!root) return;
  const s = explorerStore.get();
  const open = Object.keys(s.dirs).filter((k) => k === dirKey(root) || s.expanded[k]);
  // Reload using the real path from the parent listing where possible.
  const paths = new Set<string>([root]);
  for (const entries of Object.values(s.dirs)) {
    for (const e of entries) if (e.isDir && open.includes(dirKey(e.path))) paths.add(e.path);
  }
  await Promise.all([...paths].map(loadDir));
}

export function setInlineEdit(edit: InlineEdit | null) {
  explorerStore.update({ edit });
  if (edit && edit.kind !== "rename") toggleDir(edit.parent, true);
}

export function setExplorerClipboard(paths: string[], cut: boolean) {
  explorerStore.update({ clipboard: { paths, cut } });
}

// ---------- File watching ----------

async function onFsChanged(paths: string[], overflow: boolean) {
  const s = explorerStore.get();
  const dirsToReload = new Set<string>();
  if (overflow) {
    await refreshExplorer();
  } else {
    for (const p of paths) {
      const parent = dirname(p);
      if (s.dirs[dirKey(parent)]) dirsToReload.add(parent);
      if (s.dirs[dirKey(p)]) dirsToReload.add(p);
    }
    await Promise.all([...dirsToReload].map(loadDir));
  }
  await handleExternalChanges(overflow ? null : paths);
}

let unlistenFs: (() => void) | null = null;

async function startWatching(root: string) {
  try {
    await watcher.start(root);
    if (!unlistenFs) {
      const { listen } = await import("@tauri-apps/api/event");
      unlistenFs = await listen<{ paths: string[]; overflow: boolean }>("fs://changed", (e) =>
        onFsChanged(e.payload.paths, e.payload.overflow),
      );
    }
  } catch (e) {
    log(`File watching unavailable: ${errorMessage(e)}`, "warn");
  }
}

// ---------- Folders ----------

function addRecent(path: string) {
  workspaceStore.set((s) => {
    const recent = [
      { path, name: basename(path), openedAt: Date.now() },
      ...s.recent.filter((r) => !samePath(r.path, path)),
    ].slice(0, 20);
    return { ...s, recent };
  });
  persist("recent", workspaceStore.get().recent);
}

export function removeRecent(path: string) {
  workspaceStore.set((s) => ({ ...s, recent: s.recent.filter((r) => !samePath(r.path, path)) }));
  persist("recent", workspaceStore.get().recent);
}

export function clearRecent() {
  workspaceStore.set((s) => ({ ...s, recent: [] }));
  persist("recent", []);
}

function updateTitle() {
  const { root } = workspaceStore.get();
  const tab = activeTab();
  const doc = tab?.kind === "doc" ? editorStore.get().docs[tab.docId] : null;
  const parts = [doc?.name ?? (tab?.kind === "settings" ? "Settings" : null), root ? basename(root) : null, "Stride"];
  const title = parts.filter(Boolean).join(" — ");
  document.title = title;
  getCurrentWindow().setTitle(title).catch(() => {});
}

export async function openFolder(path: string, opts: { restoreTabs?: boolean; skipConfirm?: boolean } = {}) {
  const stat = await fs.stat(path);
  if (!stat.exists || !stat.isDir) {
    reportError("Cannot open folder", `'${path}' does not exist or is not a folder`);
    removeRecent(path);
    return false;
  }
  const current = workspaceStore.get().root;
  if (current && samePath(current, path)) return true;
  if (!opts.skipConfirm && !(await confirmAllDirty())) return false;
  saveFolderState();
  await closeAllTabs({ skipConfirm: true });
  explorerStore.set({ dirs: {}, expanded: {}, selected: null, edit: null, clipboard: null, errors: {} });
  workspaceStore.set((s) => ({ ...s, root: path }));
  addRecent(path);
  await loadDir(path);
  const saved = folderStates[dirKey(path)];
  if (saved) {
    for (const d of saved.expanded) {
      explorerStore.set((s) => ({ ...s, expanded: { ...s.expanded, [dirKey(d)]: true } }));
      loadDir(d);
    }
    if (opts.restoreTabs !== false) {
      for (const f of saved.openFiles) {
        const doc = await openFile(f.path, { background: true });
        if (doc && f.viewState) setViewState(doc.id, f.viewState as never);
      }
      const active = saved.active && Object.values(editorStore.get().docs).find((d) => d.path && samePath(d.path, saved.active!));
      if (active) editorStore.update({ activeTabId: `tab-${active.id}` });
    }
  }
  startWatching(path);
  persistSession();
  updateTitle();
  log(`Opened folder ${path}`);
  completeStep("folder");
  return true;
}

export async function closeFolder() {
  if (!(await confirmAllDirty())) return;
  saveFolderState();
  await closeAllTabs({ skipConfirm: true });
  await watcher.stop().catch(() => {});
  explorerStore.set({ dirs: {}, expanded: {}, selected: null, edit: null, clipboard: null, errors: {} });
  workspaceStore.set((s) => ({ ...s, root: null }));
  persistSession();
  updateTitle();
}

// ---------- Persistence ----------

function saveFolderState() {
  const { root } = workspaceStore.get();
  if (!root) return;
  const s = editorStore.get();
  const ex = explorerStore.get();
  const openFiles = s.tabs.flatMap((t) => {
    if (t.kind !== "doc") return [];
    const d = s.docs[t.docId];
    return d?.path ? [{ path: d.path, viewState: getViewState(d.id) ?? undefined }] : [];
  });
  const activeDocPath = (() => {
    const t = s.tabs.find((x) => x.id === s.activeTabId);
    return t?.kind === "doc" ? s.docs[t.docId]?.path ?? null : null;
  })();
  // Map expanded keys back to real paths using known listings.
  const expanded: string[] = [];
  for (const entries of Object.values(ex.dirs)) {
    for (const e of entries) if (e.isDir && ex.expanded[dirKey(e.path)]) expanded.push(e.path);
  }
  folderStates[dirKey(root)] = { openFiles, active: activeDocPath, expanded };
  const keys = Object.keys(folderStates);
  if (keys.length > 40) for (const k of keys.slice(0, keys.length - 40)) delete folderStates[k];
  persist("folders", folderStates);
}

function persistSession() {
  const { root, layout } = workspaceStore.get();
  persist("session", { root, layout });
}

/** Called by the editor layer whenever the tab set or active tab changes. */
export function onTabsChanged() {
  saveFolderState();
  updateTitle();
}

let lastLayout = workspaceStore.get().layout;
workspaceStore.subscribe(() => {
  const { layout } = workspaceStore.get();
  if (layout !== lastLayout) {
    lastLayout = layout;
    persistSession();
  }
});

let lastTabsKey = "";

export async function initWorkspace(): Promise<string | null> {
  // Subscribed here rather than at module level: editors.ts and this module
  // import each other.
  editorStore.subscribe(() => {
    const s = editorStore.get();
    const key = s.activeTabId + "|" + s.tabs.map((t) => t.id).join(",");
    if (key !== lastTabsKey) {
      lastTabsKey = key;
      onTabsChanged();
    }
  });
  const [session, recent, folders] = await Promise.all([
    load<{ root: string | null; layout: Partial<Layout> }>("session"),
    load<RecentEntry[]>("recent"),
    load<Record<string, FolderState>>("folders"),
  ]);
  folderStates = folders ?? {};
  workspaceStore.set((s) => ({
    ...s,
    layout: { ...DEFAULT_LAYOUT, ...(session?.layout ?? {}) },
    recent: Array.isArray(recent) ? recent : [],
  }));
  lastLayout = workspaceStore.get().layout;
  return session?.root ?? null;
}

export function markReady() {
  workspaceStore.update({ ready: true });
  updateTitle();
}

export const flushWorkspaceState = () => {
  saveFolderState();
  persistSession();
};

export const joinPath = join;
