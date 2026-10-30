/** Extension host: loads extensions (built-in and from the user's extensions
 * folder), applies their declarative contributions (themes, snippets), runs
 * their code in sandboxed Web Workers and serves the `stride` API. */
import { streamChat } from "../ai/providers";
import { registerCommands, unregisterCommands } from "../commands/registry";
import { monaco } from "../editor/monaco";
import { fs, preview, state as nativeState } from "../ipc/native";
import { join } from "../lib/path";
import { createStore } from "../lib/store";
import { debounce, errorMessage } from "../lib/util";
import { activeDoc, editorStore, getActiveEditor, getModel, savedStore } from "../state/editors";
import { log } from "../state/output";
import { load, persist } from "../state/persist";
import { getSetting, setSetting, settingsStore } from "../state/settings";
import { notify, quickPick, reportError, showDialog } from "../state/ui";
import { setExtensionPresets } from "../theme/presets";
import { BUILTIN_EXTENSIONS } from "./builtin";
import { sandboxPrelude } from "./sandbox";
import { validateManifest, type ExtensionBundle, type ExtensionManifest, type InstalledExtension, type RegistryEntry } from "./types";

export const REGISTRY_URL = "https://raw.githubusercontent.com/cleveroze/What/HEAD/site/workshop/registry.json";
export const WORKSHOP_URL = "https://cleveroze.github.io/What/workshop.html";

export interface ExtensionsState {
  installed: InstalledExtension[];
  running: Record<string, boolean>;
  errors: Record<string, string>;
  status: Record<string, { text: string; tooltip: string }>;
  registry: RegistryEntry[] | null;
  registryError: string | null;
  registryLoading: boolean;
  busy: Record<string, boolean>;
}

export const extensionsStore = createStore<ExtensionsState>({
  installed: [],
  running: {},
  errors: {},
  status: {},
  registry: null,
  registryError: null,
  registryLoading: false,
  busy: {},
});

interface Runtime {
  worker: Worker | null;
  url: string | null;
  commandIds: string[];
  disposables: monaco.IDisposable[];
  pendingCommands: Map<number, { resolve: () => void; reject: (e: Error) => void }>;
}

const runtimes = new Map<string, Runtime>();
let storage: Record<string, Record<string, unknown>> = {};
let extensionsDir = "";
let commandSeq = 0;

const isEnabled = (id: string) => !getSetting("extensions.disabled").includes(id);

// ---------- Loading ----------

async function readInstalled(): Promise<InstalledExtension[]> {
  const out: InstalledExtension[] = [];
  let entries: Awaited<ReturnType<typeof fs.readDir>> = [];
  try {
    entries = await fs.readDir(extensionsDir);
  } catch {
    return out; // folder does not exist yet
  }
  for (const e of entries.filter((x) => x.isDir)) {
    try {
      const raw = JSON.parse((await fs.readText(join(e.path, "extension.json"))).content);
      const problem = validateManifest(raw);
      if (problem) throw new Error(problem);
      const manifest = raw as ExtensionManifest;
      const code = manifest.main ? (await fs.readText(join(e.path, manifest.main))).content : null;
      out.push({ manifest, code, builtin: false, path: e.path });
    } catch (err) {
      log(`Extension in ${e.path} could not be loaded: ${errorMessage(err)}`, "warn");
    }
  }
  return out;
}

export async function initExtensions() {
  extensionsDir = join(await nativeState.dir(), "extensions");
  storage = (await load<Record<string, Record<string, unknown>>>("extension-storage")) ?? {};
  await reloadExtensions();
  // Forward editor events to running extensions.
  let lastSave = 0;
  savedStore.subscribe(() => {
    const s = savedStore.get();
    if (s.at === lastSave) return;
    lastSave = s.at;
    broadcast("save", { fileName: s.name });
  });
  let lastDoc: string | null = null;
  let textListener: monaco.IDisposable | null = null;
  const textChanged = debounce(() => broadcast("textChange", null), 250);
  editorStore.subscribe(() => {
    const doc = activeDoc();
    if ((doc?.id ?? null) === lastDoc) return;
    lastDoc = doc?.id ?? null;
    textListener?.dispose();
    const model = doc ? getModel(doc.id) : null;
    textListener = model ? model.onDidChangeContent(() => textChanged()) : null;
    broadcast("activeEditor", doc ? { fileName: doc.name, language: doc.language } : null);
  });
  let lastDisabled = getSetting("extensions.disabled").join(",");
  settingsStore.subscribe(() => {
    const now = getSetting("extensions.disabled").join(",");
    if (now !== lastDisabled) {
      lastDisabled = now;
      syncRunning();
    }
  });
}

export async function reloadExtensions() {
  for (const id of [...runtimes.keys()]) stop(id);
  const userExts = await readInstalled();
  const builtins: InstalledExtension[] = BUILTIN_EXTENSIONS.filter((b) => !userExts.some((u) => u.manifest.id === b.manifest.id));
  extensionsStore.set((s) => ({ ...s, installed: [...builtins, ...userExts], running: {}, errors: {} }));
  syncRunning();
}

function syncRunning() {
  for (const ext of extensionsStore.get().installed) {
    const on = isEnabled(ext.manifest.id);
    if (on && !runtimes.has(ext.manifest.id)) start(ext);
    if (!on && runtimes.has(ext.manifest.id)) stop(ext.manifest.id);
  }
}

// ---------- Contributions ----------

function applyContributions(ext: InstalledExtension, rt: Runtime) {
  const { manifest } = ext;
  const c = manifest.contributes ?? {};
  if (c.themes?.length) {
    setExtensionPresets(
      manifest.id,
      c.themes.map((t) => ({
        id: `${manifest.id}/${t.id}`,
        name: t.name,
        description: t.description ?? `From the ${manifest.name} extension`,
        neutralHue: Number(t.neutralHue) || 0,
        neutralChroma: Math.min(0.06, Math.max(0, Number(t.neutralChroma) || 0)),
        accentHue: Number(t.accentHue) || 0,
        accentChroma: Math.min(0.25, Math.max(0, Number(t.accentChroma) || 0)),
        syntaxChroma: t.syntaxChroma === undefined ? 0.11 : Math.min(0.2, Math.max(0, Number(t.syntaxChroma))),
      })),
    );
  }
  const byLanguage = new Map<string, typeof c.snippets>();
  for (const sn of c.snippets ?? []) {
    byLanguage.set(sn.language, [...(byLanguage.get(sn.language) ?? []), sn]);
  }
  byLanguage.forEach((snippets, language) => {
    rt.disposables.push(
      monaco.languages.registerCompletionItemProvider(language, {
        provideCompletionItems(model, position) {
          const word = model.getWordUntilPosition(position);
          const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
          return {
            suggestions: snippets!.map((sn) => ({
              label: sn.prefix,
              kind: monaco.languages.CompletionItemKind.Snippet,
              detail: `${sn.description ?? "Snippet"} · ${manifest.name}`,
              insertText: Array.isArray(sn.body) ? sn.body.join("\n") : sn.body,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range,
            })),
          };
        },
      }),
    );
  });
  // Commands appear in the palette even before the code registers handlers.
  const cmds = c.commands ?? [];
  rt.commandIds = cmds.map((cmd) => `ext.${manifest.id}.${cmd.id}`);
  registerCommands(
    cmds.map((cmd) => ({
      id: `ext.${manifest.id}.${cmd.id}`,
      title: cmd.title,
      category: manifest.name,
      keybinding: cmd.keybinding,
      run: () => runExtensionCommand(manifest.id, cmd.id),
    })),
  );
}

// ---------- Sandboxed code ----------

function start(ext: InstalledExtension) {
  const id = ext.manifest.id;
  const rt: Runtime = { worker: null, url: null, commandIds: [], disposables: [], pendingCommands: new Map() };
  runtimes.set(id, rt);
  try {
    applyContributions(ext, rt);
    if (ext.code) {
      const source = sandboxPrelude(ext.manifest.permissions ?? []) + "\n" + ext.code + `\n//# sourceURL=stride-extension/${id}.js`;
      rt.url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
      rt.worker = new Worker(rt.url, { name: `extension:${id}` });
      rt.worker.onmessage = (e) => handleMessage(ext, rt, e.data);
      rt.worker.onerror = (e) => {
        e.preventDefault();
        setError(id, e.message || "The extension crashed.");
        log(`[${ext.manifest.name}] ${e.message}`, "error");
      };
    }
    extensionsStore.set((s) => ({ ...s, running: { ...s.running, [id]: true } }));
  } catch (e) {
    setError(id, errorMessage(e));
  }
}

function stop(id: string) {
  const rt = runtimes.get(id);
  if (!rt) return;
  rt.worker?.terminate();
  if (rt.url) URL.revokeObjectURL(rt.url);
  rt.disposables.forEach((d) => d.dispose());
  unregisterCommands(rt.commandIds);
  rt.pendingCommands.forEach((p) => p.reject(new Error("The extension was stopped.")));
  setExtensionPresets(id, []);
  runtimes.delete(id);
  extensionsStore.set((s) => {
    const running = { ...s.running };
    const status = { ...s.status };
    delete running[id];
    delete status[id];
    return { ...s, running, status };
  });
}

function setError(id: string, message: string) {
  extensionsStore.set((s) => ({ ...s, errors: { ...s.errors, [id]: message } }));
}

function broadcast(event: string, payload: unknown) {
  runtimes.forEach((rt) => rt.worker?.postMessage({ type: "event", event, payload }));
}

async function runExtensionCommand(extId: string, commandId: string) {
  const rt = runtimes.get(extId);
  if (!rt?.worker) {
    notify("warning", "This command's extension has no code to run.");
    return;
  }
  const id = ++commandSeq;
  try {
    await new Promise<void>((resolve, reject) => {
      rt.pendingCommands.set(id, { resolve, reject });
      rt.worker!.postMessage({ type: "command", id, command: commandId });
    });
  } catch (e) {
    const ext = extensionsStore.get().installed.find((x) => x.manifest.id === extId);
    reportError(`${ext?.manifest.name ?? extId}: command failed`, e);
  }
}

function requirePermission(ext: InstalledExtension, perm: string) {
  if (!(ext.manifest.permissions ?? []).includes(perm as never)) {
    throw new Error(`This extension needs the "${perm}" permission in its extension.json.`);
  }
}

/** The `stride.*` API, executed on behalf of an extension. */
async function callApi(ext: InstalledExtension, method: string, args: unknown[]): Promise<unknown> {
  const id = ext.manifest.id;
  const editor = getActiveEditor();
  const model = editor?.getModel() ?? null;
  const needEditor = () => {
    if (!editor || !model) throw new Error("No file is open in the editor.");
    return { editor, model };
  };
  switch (method) {
    case "editor.getText":
      return model?.getValue() ?? "";
    case "editor.getSelectedText": {
      const sel = editor?.getSelection();
      return model && sel ? model.getValueInRange(sel) : "";
    }
    case "editor.getLanguage":
      return activeDoc()?.language ?? null;
    case "editor.getFileName":
      return activeDoc()?.name ?? null;
    case "editor.replaceSelection": {
      const { editor: ed } = needEditor();
      ed.executeEdits(`ext:${id}`, [{ range: ed.getSelection()!, text: String(args[0]), forceMoveMarkers: true }]);
      ed.pushUndoStop();
      return null;
    }
    case "editor.insertText": {
      const { editor: ed } = needEditor();
      const p = ed.getPosition()!;
      ed.executeEdits(`ext:${id}`, [{ range: new monaco.Range(p.lineNumber, p.column, p.lineNumber, p.column), text: String(args[0]), forceMoveMarkers: true }]);
      ed.pushUndoStop();
      return null;
    }
    case "editor.setText": {
      const { editor: ed, model: m } = needEditor();
      ed.executeEdits(`ext:${id}`, [{ range: m.getFullModelRange(), text: String(args[0]) }]);
      ed.pushUndoStop();
      return null;
    }
    case "window.showMessage": {
      const kind = ["info", "success", "warning", "error"].includes(String(args[1])) ? (args[1] as "info") : "info";
      notify(kind, `${ext.manifest.name}: ${String(args[0]).slice(0, 400)}`);
      return null;
    }
    case "window.showQuickPick": {
      const items = Array.isArray(args[0]) ? args[0].slice(0, 500) : [];
      return quickPick(
        items.map((it) =>
          typeof it === "string" ? { label: it, value: it } : { label: String(it?.label ?? ""), description: it?.description ? String(it.description) : undefined, value: it?.value ?? it?.label },
        ),
        String(args[1] ?? ""),
      );
    }
    case "window.showInput":
      return showInputBox(ext.manifest.name, String(args[0]), String(args[1] ?? ""));
    case "statusBar.set":
      extensionsStore.set((s) => ({ ...s, status: { ...s.status, [id]: { text: String(args[0]).slice(0, 60), tooltip: String(args[1] ?? "").slice(0, 200) } } }));
      return null;
    case "statusBar.clear":
      extensionsStore.set((s) => {
        const status = { ...s.status };
        delete status[id];
        return { ...s, status };
      });
      return null;
    case "storage.get":
      return storage[id]?.[String(args[0])] ?? null;
    case "storage.set": {
      const json = JSON.stringify(args[1] ?? null);
      if (json.length > 100_000) throw new Error("Stored value is too large (100 KB max).");
      storage = { ...storage, [id]: { ...(storage[id] ?? {}), [String(args[0])]: JSON.parse(json) } };
      persist("extension-storage", storage);
      return null;
    }
    case "clipboard.writeText":
      requirePermission(ext, "clipboard");
      await navigator.clipboard.writeText(String(args[0]));
      return null;
    case "ai.complete": {
      requirePermission(ext, "ai");
      let text = "";
      await streamChat({
        system: String(args[1] || "You are a helpful coding assistant inside the Stride editor. Answer concisely."),
        messages: [{ role: "user", content: String(args[0]) }],
        signal: new AbortController().signal,
        onText: (d) => (text += d),
      });
      return text;
    }
    default:
      throw new Error(`Unknown API: ${method}`);
  }
}

function handleMessage(ext: InstalledExtension, rt: Runtime, msg: { type: string; id: number; method?: string; args?: unknown[]; error?: string }) {
  if (msg?.type === "call" && typeof msg.method === "string") {
    callApi(ext, msg.method, Array.isArray(msg.args) ? msg.args : [])
      .then((value) => rt.worker?.postMessage({ type: "result", id: msg.id, value }))
      .catch((e) => rt.worker?.postMessage({ type: "result", id: msg.id, error: errorMessage(e) }));
  } else if (msg?.type === "commandDone") {
    const p = rt.pendingCommands.get(msg.id);
    rt.pendingCommands.delete(msg.id);
    if (msg.error) p?.reject(new Error(msg.error));
    else p?.resolve();
  }
}

// ---------- Input box ----------

export const inputBoxStore = createStore<{ box: { title: string; prompt: string; value: string; resolve: (v: string | null) => void } | null }>({ box: null });

function showInputBox(title: string, prompt: string, value: string): Promise<string | null> {
  return new Promise((resolve) => {
    inputBoxStore.set({
      box: {
        title,
        prompt,
        value,
        resolve: (v) => {
          inputBoxStore.set({ box: null });
          resolve(v);
        },
      },
    });
  });
}

// ---------- Enable / install / uninstall ----------

export function setExtensionEnabled(id: string, enabled: boolean) {
  const disabled = getSetting("extensions.disabled").filter((x) => x !== id);
  setSetting("extensions.disabled", enabled ? disabled : [...disabled, id]);
}

export async function installBundle(bundle: ExtensionBundle) {
  const problem = validateManifest(bundle?.manifest);
  if (problem) throw new Error(`Invalid extension: ${problem}`);
  const { manifest, files } = bundle;
  const perms = manifest.permissions ?? [];
  if (perms.length) {
    const labels: Record<string, string> = { ai: "use your AI assistant (and your AI provider credits)", network: "access the internet", clipboard: "write to your clipboard" };
    const ok = await showDialog({
      title: `Install “${manifest.name}”?`,
      message: `This extension asks to: ${perms.map((p) => labels[p] ?? p).join(", ")}.`,
      detail: "Extensions run in a sandbox and can't touch your files, but only install ones you trust.",
      buttons: [
        { label: "Cancel", value: false },
        { label: "Install", value: true, primary: true },
      ],
      cancelValue: false,
    });
    if (!ok) return false;
  }
  const dir = join(extensionsDir, manifest.id);
  await fs.writeText(join(dir, "extension.json"), JSON.stringify(manifest, null, 2), "utf8");
  for (const [name, content] of Object.entries(files ?? {})) {
    if (/[\\/]|^\.\.?$/.test(name)) continue; // flat folder only
    await fs.writeText(join(dir, name), content, "utf8");
  }
  setExtensionEnabled(manifest.id, true);
  await reloadExtensions();
  log(`Installed extension ${manifest.name} ${manifest.version}`);
  return true;
}

export async function installFromWorkshop(entry: RegistryEntry) {
  extensionsStore.set((s) => ({ ...s, busy: { ...s.busy, [entry.id]: true } }));
  try {
    const res = await fetch(new URL(entry.bundle, REGISTRY_URL));
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    if (await installBundle(await res.json())) notify("success", `Installed ${entry.name}`);
  } catch (e) {
    reportError(`Cannot install ${entry.name}`, e);
  } finally {
    extensionsStore.set((s) => ({ ...s, busy: { ...s.busy, [entry.id]: false } }));
  }
}

export async function installFromFile(path: string) {
  try {
    const bundle = JSON.parse((await fs.readText(path)).content);
    if (await installBundle(bundle)) notify("success", `Installed ${bundle.manifest.name}`);
  } catch (e) {
    reportError("Cannot install extension", e);
  }
}

export async function uninstallExtension(ext: InstalledExtension) {
  if (!ext.path) return;
  stop(ext.manifest.id);
  try {
    await fs.delete(ext.path, true);
    log(`Uninstalled extension ${ext.manifest.name}`);
  } catch (e) {
    reportError("Cannot uninstall", e);
  }
  await reloadExtensions();
}

export async function fetchRegistry(force = false) {
  const s = extensionsStore.get();
  if (s.registryLoading || (s.registry && !force)) return;
  extensionsStore.update({ registryLoading: true, registryError: null });
  try {
    const res = await fetch(`${REGISTRY_URL}?t=${Date.now()}`);
    if (!res.ok) throw new Error(`The Workshop answered ${res.status}`);
    const json = await res.json();
    extensionsStore.update({ registry: Array.isArray(json.extensions) ? json.extensions : [], registryLoading: false });
  } catch (e) {
    extensionsStore.update({ registryError: errorMessage(e), registryLoading: false });
  }
}

/** Creates a working starter extension in the extensions folder and opens it. */
export async function createExtension(name: string): Promise<string | null> {
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "my-extension";
  const dir = join(extensionsDir, id);
  if ((await fs.stat(dir)).exists) {
    reportError("Cannot create extension", `An extension called “${id}” already exists.`);
    return null;
  }
  const manifest: ExtensionManifest = {
    id,
    name,
    version: "0.1.0",
    description: "My first Stride extension.",
    author: "Me",
    icon: "flower",
    categories: ["Tools"],
    main: "main.js",
    contributes: { commands: [{ id: "hello", title: "Say Hello" }] },
  };
  const code = `// ${name} — runs in a sandbox. Everything you need is on the \`stride\` object.
// Reload extensions (Extensions panel → ⟳) after editing this file.

stride.commands.register("hello", async () => {
  const name = await stride.window.showInput("What's your name?", "friend");
  if (name) await stride.window.showMessage(\`Hello, \${name}! 👋\`, "success");
});

// Show the length of the open file in the status bar.
async function update() {
  const text = await stride.editor.getText();
  await stride.statusBar.set(\`\${text.length} chars\`, "Characters in this file — from ${name}");
}
stride.events.onDidChangeActiveEditor(update);
stride.events.onDidChangeText(update);
update();
`;
  await fs.writeText(join(dir, "extension.json"), JSON.stringify(manifest, null, 2), "utf8");
  await fs.writeText(join(dir, "main.js"), code, "utf8");
  await reloadExtensions();
  return dir;
}

export async function openExtensionsFolder() {
  try {
    if (!(await fs.stat(extensionsDir)).exists) await fs.createDir(extensionsDir);
    await fs.reveal(extensionsDir);
  } catch (e) {
    reportError("Cannot open the extensions folder", e);
  }
}

export const openWorkshopSite = () => preview.openExternal(WORKSHOP_URL);
export const getExtensionsDir = () => extensionsDir;
