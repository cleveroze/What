/** "Run" for beginners: runs the active file with the right tool in the
 * integrated terminal, or opens HTML in a live preview. */
import { preview as nativePreview } from "../ipc/native";
import { basename, dirname, extname, isWithin, join, relative } from "../lib/path";
import { createStore } from "../lib/store";
import { isWindows } from "../lib/util";
import { activeDoc, editorStore, saveDoc, savedStore, type DocMeta } from "./editors";
import { log } from "./output";
import { runInTerminal, type ShellKind } from "./terminals";
import { notify, reportError } from "./ui";
import { workspaceStore } from "./workspace";

const q = (p: string) => `"${p}"`;

/** Runs `a`, then `b` only if `a` succeeded, in the given shell's syntax. */
function chain(kind: ShellKind, a: string, b: string) {
  return kind === "ps" ? `${a}; if ($?) { ${b} }` : `${a} && ${b}`;
}

function execPath(kind: ShellKind, p: string) {
  return kind === "ps" ? `& ${q(p)}` : q(p);
}

function cdThen(kind: ShellKind, dir: string, cmd: string) {
  if (kind === "ps") return `Set-Location -LiteralPath ${q(dir)}; ${cmd}`;
  if (kind === "cmd") return `cd /d ${q(dir)} && ${cmd}`;
  return `cd ${q(dir)} && ${cmd}`;
}

type Runner = { label: string; build: (kind: ShellKind, file: string) => string };

function compiled(compiler: string): Runner["build"] {
  return (kind, file) => {
    const out = join(dirname(file), basename(file).replace(/\.[^.]+$/, "") + (isWindows ? ".exe" : ""));
    return chain(kind, `${compiler} ${q(file)} -o ${q(out)}`, execPath(kind, out));
  };
}

const simple = (tool: string): Runner["build"] => (_kind, file) => `${tool} ${q(file)}`;

const RUNNERS: Record<string, Runner> = {
  ".py": { label: "Python", build: simple(isWindows ? "python" : "python3") },
  ".js": { label: "Node.js", build: simple("node") },
  ".mjs": { label: "Node.js", build: simple("node") },
  ".cjs": { label: "Node.js", build: simple("node") },
  ".ts": { label: "TypeScript (tsx)", build: simple("npx --yes tsx") },
  ".mts": { label: "TypeScript (tsx)", build: simple("npx --yes tsx") },
  ".rb": { label: "Ruby", build: simple("ruby") },
  ".php": { label: "PHP", build: simple("php") },
  ".lua": { label: "Lua", build: simple("lua") },
  ".pl": { label: "Perl", build: simple("perl") },
  ".r": { label: "R", build: simple("Rscript") },
  ".jl": { label: "Julia", build: simple("julia") },
  ".dart": { label: "Dart", build: simple("dart run") },
  ".go": { label: "Go", build: simple("go run") },
  ".java": { label: "Java", build: simple("java") },
  ".swift": { label: "Swift", build: simple("swift") },
  ".sh": { label: "Bash", build: simple("bash") },
  ".ps1": { label: "PowerShell", build: simple("powershell -NoProfile -ExecutionPolicy Bypass -File") },
  ".bat": { label: "Batch", build: (kind, f) => (kind === "ps" ? `& ${q(f)}` : kind === "cmd" ? `call ${q(f)}` : `cmd //c ${q(f)}`) },
  ".cmd": { label: "Batch", build: (kind, f) => (kind === "ps" ? `& ${q(f)}` : kind === "cmd" ? `call ${q(f)}` : `cmd //c ${q(f)}`) },
  ".c": { label: "C (gcc)", build: compiled("gcc") },
  ".cpp": { label: "C++ (g++)", build: compiled("g++") },
  ".cc": { label: "C++ (g++)", build: compiled("g++") },
  ".cxx": { label: "C++ (g++)", build: compiled("g++") },
  ".rs": { label: "Rust (rustc)", build: compiled("rustc") },
};

const PREVIEWABLE = new Set([".html", ".htm", ".svg"]);

export function runKind(doc: DocMeta | null): "terminal" | "preview" | null {
  if (!doc) return null;
  const ext = doc.path ? extname(doc.path) : doc.language === "html" ? ".html" : "";
  if (PREVIEWABLE.has(ext) || doc.language === "html") return "preview";
  if (RUNNERS[ext]) return "terminal";
  const byLang: Record<string, string> = { python: ".py", javascript: ".js", typescript: ".ts", go: ".go", rust: ".rs", c: ".c", cpp: ".cpp", java: ".java", ruby: ".rb", php: ".php", powershell: ".ps1", shell: ".sh", lua: ".lua" };
  return byLang[doc.language] && !doc.path ? "terminal" : null;
}

export function runnerLabel(doc: DocMeta | null): string | null {
  if (!doc?.path) return null;
  const ext = extname(doc.path);
  return PREVIEWABLE.has(ext) ? "Live preview" : RUNNERS[ext]?.label ?? null;
}

// ---------- Live preview ----------

export interface PreviewState {
  open: boolean;
  path: string | null;
  url: string | null;
  nonce: number;
  width: number;
}

export const previewStore = createStore<PreviewState>({ open: false, path: null, url: null, nonce: 0, width: 0.45 });

export async function openPreview(path: string) {
  const root = workspaceStore.get().root;
  const base = root && isWithin(path, root) ? root : dirname(path);
  try {
    const port = await nativePreview.start(base);
    const rel = relative(base, path).split(/[\\/]+/).map(encodeURIComponent).join("/");
    const url = `http://127.0.0.1:${port}/${rel}`;
    previewStore.set((s) => ({ ...s, open: true, path, url, nonce: s.nonce + 1 }));
    log(`Live preview: ${url}`);
  } catch (e) {
    reportError("Cannot start the live preview", e);
  }
}

export const closePreview = () => previewStore.set((s) => ({ ...s, open: false }));
export const reloadPreview = () => previewStore.set((s) => ({ ...s, nonce: s.nonce + 1 }));

export async function openInBrowser() {
  const { url, open } = previewStore.get();
  if (open && url) {
    await nativePreview.openExternal(url).catch((e) => reportError("Cannot open the browser", e));
    return;
  }
  const doc = activeDoc();
  if (!doc?.path) return;
  await openPreview(doc.path);
  const next = previewStore.get().url;
  if (next) await nativePreview.openExternal(next).catch((e) => reportError("Cannot open the browser", e));
}

// Saving any file refreshes the preview, so CSS/JS edits show up too.
let lastSave = 0;
savedStore.subscribe(() => {
  const { at } = savedStore.get();
  if (at !== lastSave) {
    lastSave = at;
    if (previewStore.get().open) reloadPreview();
  }
});

// ---------- Run ----------

export async function runActiveFile() {
  let doc = activeDoc();
  if (!doc) {
    notify("info", "Nothing to run", "Open a file first, then press Run (F5).");
    return;
  }
  const kind = runKind(doc);
  if (!kind) {
    notify("warning", `Stride doesn't know how to run ${doc.path ? extname(doc.path) || doc.name : "this file"}`, "Save it with an extension like .py, .js, .html, .c or .go, or run it from the terminal yourself.");
    return;
  }
  // Running always uses the saved file on disk.
  if (doc.dirty || !doc.path) {
    if (!(await saveDoc(doc.id))) return;
    doc = editorStore.get().docs[doc.id];
    if (!doc?.path) return;
  }
  const path = doc.path!;
  if (kind === "preview") {
    await openPreview(path);
    return;
  }
  const runner = RUNNERS[extname(path)];
  if (!runner) {
    notify("warning", "Save the file with a proper extension to run it", "For example main.py, app.js or hello.c.");
    return;
  }
  const dir = dirname(path);
  log(`Running ${path} with ${runner.label}`);
  await runInTerminal((shell) => cdThen(shell, dir, runner.build(shell, path)), dir);
}
