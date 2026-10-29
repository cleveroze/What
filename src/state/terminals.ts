import { FitAddon } from "@xterm/addon-fit";
import { Terminal, type ITheme } from "@xterm/xterm";
import { terminal as nativeTerminal, type ShellInfo } from "../ipc/native";
import { withAlpha } from "../lib/color";
import { createStore } from "../lib/store";
import { errorMessage, uid } from "../lib/util";
import { themeStore } from "../theme/engine";
import type { ThemeTokens } from "../theme/tokens";
import { log } from "./output";
import { getSetting, settingsStore } from "./settings";
import { reportError } from "./ui";
import { showPanel, workspaceStore } from "./workspace";

export interface TermSession {
  id: string;
  title: string;
  shell: ShellInfo;
  cwd: string | null;
  ptyId: number | null;
  exited: boolean;
  exitCode: number | null;
}

export const terminalStore = createStore<{ sessions: TermSession[]; activeId: string | null; shells: ShellInfo[] }>({
  sessions: [],
  activeId: null,
  shells: [],
});

interface TermRuntime {
  term: Terminal;
  fit: FitAddon;
  el: HTMLDivElement;
  opened: boolean;
  starting: boolean;
}

const runtimes = new Map<string, TermRuntime>();

function xtermTheme(t: ThemeTokens): ITheme {
  const [black, red, green, yellow, blue, magenta, cyan, white, bBlack, bRed, bGreen, bYellow, bBlue, bMagenta, bCyan, bWhite] = t.ansi;
  return {
    background: t.surface,
    foreground: t.text,
    cursor: t.accent,
    cursorAccent: t.surface,
    selectionBackground: withAlpha(t.accent, 0.3),
    scrollbarSliderBackground: withAlpha(t.text, 0.12),
    scrollbarSliderHoverBackground: withAlpha(t.text, 0.2),
    scrollbarSliderActiveBackground: withAlpha(t.text, 0.28),
    black, red, green, yellow, blue, magenta, cyan, white,
    brightBlack: bBlack, brightRed: bRed, brightGreen: bGreen, brightYellow: bYellow,
    brightBlue: bBlue, brightMagenta: bMagenta, brightCyan: bCyan, brightWhite: bWhite,
  };
}

function termOptions() {
  return {
    fontFamily: getSetting("terminal.fontFamily"),
    fontSize: getSetting("terminal.fontSize"),
    lineHeight: getSetting("terminal.lineHeight"),
    cursorStyle: getSetting("terminal.cursorStyle"),
    cursorBlink: getSetting("terminal.cursorBlink"),
    scrollback: getSetting("terminal.scrollback"),
  } as const;
}

export async function loadShells(): Promise<ShellInfo[]> {
  const cached = terminalStore.get().shells;
  if (cached.length) return cached;
  try {
    const shells = await nativeTerminal.shells();
    terminalStore.update({ shells });
    return shells;
  } catch (e) {
    reportError("Cannot list shells", e);
    return [];
  }
}

export function defaultShell(shells: ShellInfo[]): ShellInfo | undefined {
  const pref = getSetting("terminal.shell");
  return shells.find((s) => s.id === pref) ?? shells[0];
}

let ensuring: Promise<void> | null = null;

/** Creates a terminal only if none exists (idempotent while one is starting). */
export function ensureTerminal(): Promise<void> {
  if (terminalStore.get().sessions.length) return Promise.resolve();
  ensuring ??= createTerminal().finally(() => (ensuring = null));
  return ensuring;
}

export async function createTerminal(shellId?: string, cwd?: string | null) {
  const shells = await loadShells();
  const shell = (shellId && shells.find((s) => s.id === shellId)) || defaultShell(shells);
  if (!shell) {
    reportError("No shell available", "Could not find PowerShell, CMD or another shell on this system.");
    return;
  }
  const id = uid("term");
  const sameKind = terminalStore.get().sessions.filter((s) => s.shell.id === shell.id).length;
  const session: TermSession = {
    id,
    title: sameKind ? `${shell.name} ${sameKind + 1}` : shell.name,
    shell,
    cwd: cwd ?? workspaceStore.get().root,
    ptyId: null,
    exited: false,
    exitCode: null,
  };

  const term = new Terminal({ ...termOptions(), theme: xtermTheme(themeStore.get().tokens), allowProposedApi: false, convertEol: false });
  const fit = new FitAddon();
  term.loadAddon(fit);
  const el = document.createElement("div");
  el.className = "terminal-host";
  runtimes.set(id, { term, fit, el, opened: false, starting: false });

  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== "keydown") return true;
    const key = e.key.toLowerCase();
    if (e.ctrlKey && key === "c" && (e.shiftKey || term.hasSelection())) {
      if (term.hasSelection()) navigator.clipboard.writeText(term.getSelection()).catch(() => {});
      term.clearSelection();
      return false;
    }
    // Let the browser fire a native paste event, which xterm handles.
    if (e.ctrlKey && key === "v") return false;
    return true;
  });
  term.onSelectionChange(() => {
    if (getSetting("terminal.copyOnSelect") && term.hasSelection()) {
      navigator.clipboard.writeText(term.getSelection()).catch(() => {});
    }
  });
  term.onData((data) => {
    const s = getSession(id);
    if (!s) return;
    if (s.exited) {
      closeTerminal(id);
      return;
    }
    if (s.ptyId !== null) nativeTerminal.write(s.ptyId, data).catch(() => {});
  });
  term.onResize(({ cols, rows }) => {
    const s = getSession(id);
    if (s?.ptyId != null && !s.exited) nativeTerminal.resize(s.ptyId, cols, rows).catch(() => {});
  });

  terminalStore.set((st) => ({ ...st, sessions: [...st.sessions, session], activeId: id }));
  showPanel("terminal");
}

const getSession = (id: string) => terminalStore.get().sessions.find((s) => s.id === id);

function patchSession(id: string, patch: Partial<TermSession>) {
  terminalStore.set((st) => ({ ...st, sessions: st.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
}

/** Attaches a session's terminal to a container and starts the shell once
 * the terminal has real dimensions. */
export function mountTerminal(id: string, container: HTMLElement) {
  const rt = runtimes.get(id);
  if (!rt) return;
  if (rt.el.parentElement !== container) container.appendChild(rt.el);
  if (!rt.opened) {
    rt.term.open(rt.el);
    rt.opened = true;
  }
  fitTerminal(id);
  const session = getSession(id);
  if (session && session.ptyId === null && !session.exited && !rt.starting) {
    rt.starting = true;
    nativeTerminal
      .spawn(session.shell, session.cwd, rt.term.cols, rt.term.rows, (ev) => {
        if (!runtimes.has(id)) return; // closed while output was in flight
        if (ev.kind === "data") {
          rt.term.write(ev.data);
        } else {
          patchSession(id, { exited: true, exitCode: ev.code });
          rt.term.write(`\r\n\x1b[2m[Process exited with code ${ev.code ?? "unknown"}. Press any key to close.]\x1b[0m\r\n`);
          log(`Terminal '${session.title}' exited with code ${ev.code ?? "unknown"}`);
        }
      })
      .then((ptyId) => {
        patchSession(id, { ptyId });
        log(`Started ${session.shell.path} ${session.shell.args.join(" ")} in ${session.cwd ?? "home folder"}`);
      })
      .catch((e) => {
        patchSession(id, { exited: true });
        rt.term.write(`\x1b[31mFailed to start ${session.shell.name}: ${errorMessage(e)}\x1b[0m\r\n`);
        reportError(`Cannot start ${session.shell.name}`, e);
      })
      .finally(() => (rt.starting = false));
  }
}

export function fitTerminal(id: string) {
  const rt = runtimes.get(id);
  if (!rt?.opened || !rt.el.isConnected || rt.el.clientWidth === 0) return;
  try {
    rt.fit.fit();
  } catch {
    /* container not measurable yet */
  }
}

export function focusTerminal(id: string | null = terminalStore.get().activeId) {
  if (id) runtimes.get(id)?.term.focus();
}

export function setActiveTerminal(id: string) {
  terminalStore.update({ activeId: id });
}

export async function killTerminal(id: string) {
  const s = getSession(id);
  if (s?.ptyId != null && !s.exited) await nativeTerminal.kill(s.ptyId).catch(() => {});
}

export async function closeTerminal(id: string) {
  await killTerminal(id);
  const rt = runtimes.get(id);
  rt?.term.dispose();
  rt?.el.remove();
  runtimes.delete(id);
  terminalStore.set((st) => {
    const idx = st.sessions.findIndex((s) => s.id === id);
    const sessions = st.sessions.filter((s) => s.id !== id);
    const activeId = st.activeId === id ? (sessions[Math.max(0, idx - 1)]?.id ?? null) : st.activeId;
    return { ...st, sessions, activeId };
  });
}

export function clearTerminal(id: string | null = terminalStore.get().activeId) {
  if (id) runtimes.get(id)?.term.clear();
}

export function selectAllTerminal(id: string | null = terminalStore.get().activeId) {
  if (id) runtimes.get(id)?.term.selectAll();
}

/** Sends text (e.g. a command line) to the active terminal. */
export function sendToTerminal(text: string) {
  const s = getSession(terminalStore.get().activeId ?? "");
  if (s?.ptyId != null && !s.exited) nativeTerminal.write(s.ptyId, text).catch(() => {});
}

themeStore.subscribe(() => {
  const theme = xtermTheme(themeStore.get().tokens);
  runtimes.forEach((rt) => (rt.term.options.theme = theme));
});

let lastOpts = JSON.stringify(termOptions());
settingsStore.subscribe(() => {
  const opts = termOptions();
  const key = JSON.stringify(opts);
  if (key === lastOpts) return;
  lastOpts = key;
  runtimes.forEach((rt, id) => {
    Object.assign(rt.term.options, opts);
    fitTerminal(id);
  });
});
