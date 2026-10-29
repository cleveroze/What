import { createStore } from "../lib/store";
import { keyFromEvent } from "../lib/keys";
import { load, persist } from "../state/persist";

export interface Command {
  id: string;
  title: string;
  category: string;
  run: () => unknown;
  /** Default keybinding, e.g. "ctrl+shift+p" or chord "ctrl+k ctrl+o". */
  keybinding?: string;
  /** Handled natively by Monaco while the editor has focus; shown read-only. */
  editorNative?: boolean;
  /** Hidden from the command palette. */
  hidden?: boolean;
  enabled?: () => boolean;
}

const commands = new Map<string, Command>();

/** User overrides: command id → binding (null removes the default). */
export const keybindingStore = createStore<{ overrides: Record<string, string | null>; recording: boolean }>({
  overrides: {},
  recording: false,
});

export function registerCommands(list: Command[]) {
  for (const c of list) commands.set(c.id, c);
}

export const getCommand = (id: string) => commands.get(id);
export const allCommands = () => [...commands.values()];

export function bindingFor(id: string): string | undefined {
  const cmd = commands.get(id);
  if (!cmd) return undefined;
  const overrides = keybindingStore.get().overrides;
  if (!cmd.editorNative && id in overrides) return overrides[id] ?? undefined;
  return cmd.keybinding;
}

export function setKeybinding(id: string, binding: string | null) {
  keybindingStore.set((s) => ({ ...s, overrides: { ...s.overrides, [id]: binding } }));
  persist("keybindings", keybindingStore.get().overrides);
}

export function resetKeybinding(id: string) {
  keybindingStore.set((s) => {
    const overrides = { ...s.overrides };
    delete overrides[id];
    return { ...s, overrides };
  });
  persist("keybindings", keybindingStore.get().overrides);
}

export function resetAllKeybindings() {
  keybindingStore.set((s) => ({ ...s, overrides: {} }));
  persist("keybindings", {});
}

export function commandsForBinding(binding: string): Command[] {
  return allCommands().filter((c) => bindingFor(c.id) === binding);
}

const recentCommands: string[] = [];
export const recentCommandIds = () => recentCommands;

export async function runCommand(id: string) {
  const cmd = commands.get(id);
  if (!cmd || (cmd.enabled && !cmd.enabled())) return;
  const i = recentCommands.indexOf(id);
  if (i >= 0) recentCommands.splice(i, 1);
  recentCommands.unshift(id);
  recentCommands.length = Math.min(recentCommands.length, 12);
  try {
    await cmd.run();
  } catch (e) {
    console.error(`Command ${id} failed`, e);
  }
}

// ---------- Global dispatcher ----------

let pendingChord: string | null = null;
let chordTimer: ReturnType<typeof setTimeout> | undefined;
export const chordStore = createStore<{ pending: string | null }>({ pending: null });

function setPending(chord: string | null) {
  pendingChord = chord;
  chordStore.set({ pending: chord });
  clearTimeout(chordTimer);
  if (chord) chordTimer = setTimeout(() => setPending(null), 2000);
}

function inMonaco(target: EventTarget | null) {
  return target instanceof Element && !!target.closest(".monaco-editor");
}

function inTerminal(target: EventTarget | null) {
  return target instanceof Element && !!target.closest(".xterm");
}

/** Workbench commands that still work while the terminal has focus; every
 * other key goes to the shell (so e.g. Ctrl+R reaches its history search). */
const TERMINAL_COMMANDS = /^(terminal\.|workbench\.(commandPalette|quickOpen)|view\.(toggle(Panel|Sidebar)|nextEditor|prevEditor|fullscreen|zoom|maximizePanel)|settings\.open$)/;

function onKeyDown(e: KeyboardEvent) {
  if (keybindingStore.get().recording || e.isComposing) return;
  const chord = keyFromEvent(e);
  if (!chord) return;
  const terminal = inTerminal(e.target);
  const candidates = allCommands().filter((c) => {
    const binding = bindingFor(c.id);
    if (!binding) return false;
    if (terminal && !TERMINAL_COMMANDS.test(c.id)) return false;
    // Monaco handles its single-key bindings itself, but chords starting with
    // a prefix we also use (Ctrl+K …) must be dispatched here.
    if (c.editorNative) return binding.includes(" ");
    return true;
  });
  const full = pendingChord ? `${pendingChord} ${chord}` : chord;
  const match = candidates.find((c) => bindingFor(c.id) === full);
  if (match) {
    e.preventDefault();
    e.stopPropagation();
    setPending(null);
    runCommand(match.id);
    return;
  }
  if (!pendingChord && candidates.some((c) => bindingFor(c.id)!.startsWith(chord + " "))) {
    e.preventDefault();
    e.stopPropagation();
    setPending(chord);
    return;
  }
  if (pendingChord) {
    e.preventDefault();
    setPending(null);
    return;
  }
  // Block WebView accelerators that would break the desktop illusion
  // (print, reload, browser find) when nothing else handles them.
  if (!inMonaco(e.target) && !terminal && ["ctrl+p", "ctrl+r", "f5", "ctrl+shift+r", "ctrl+f", "ctrl+g", "ctrl+u"].includes(chord)) {
    e.preventDefault();
  }
}

export async function initKeybindings() {
  const overrides = await load<Record<string, string | null>>("keybindings");
  if (overrides && typeof overrides === "object") keybindingStore.set((s) => ({ ...s, overrides }));
  window.addEventListener("keydown", onKeyDown, true);
}
