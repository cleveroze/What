/** Keyboard shortcut normalisation. A binding is a space separated sequence
 * of chords, each chord like "ctrl+shift+p". */

const CODE_MAP: Record<string, string> = {
  Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]",
  Backslash: "\\", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/",
  Space: "space", Enter: "enter", NumpadEnter: "enter", Escape: "escape", Tab: "tab",
  Backspace: "backspace", Delete: "delete", Insert: "insert", Home: "home", End: "end",
  PageUp: "pageup", PageDown: "pagedown", ArrowUp: "up", ArrowDown: "down",
  ArrowLeft: "left", ArrowRight: "right", NumpadAdd: "numpad_add", NumpadSubtract: "numpad_subtract",
};

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "AltGraph", "OS"]);

export function keyFromEvent(e: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  let key: string | undefined;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3).toLowerCase();
  else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5);
  else if (/^Numpad[0-9]$/.test(e.code)) key = "numpad" + e.code.slice(6);
  else if (/^F([1-9]|1[0-9])$/.test(e.code)) key = e.code.toLowerCase();
  else key = CODE_MAP[e.code];
  if (!key) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("ctrl");
  if (e.shiftKey) parts.push("shift");
  if (e.altKey) parts.push("alt");
  if (e.metaKey) parts.push("meta");
  parts.push(key);
  return parts.join("+");
}

const LABELS: Record<string, string> = {
  ctrl: "Ctrl", shift: "Shift", alt: "Alt", meta: "Win", escape: "Esc", enter: "Enter",
  space: "Space", tab: "Tab", backspace: "Backspace", delete: "Delete", up: "↑", down: "↓",
  left: "←", right: "→", pageup: "PgUp", pagedown: "PgDn", home: "Home", end: "End",
  insert: "Ins", numpad_add: "Num +", numpad_subtract: "Num -",
};

export function chordParts(chord: string): string[] {
  return chord.split("+").map((p) => LABELS[p] ?? (p.length === 1 ? p.toUpperCase() : p.toUpperCase()));
}

export function formatBinding(binding: string | null | undefined): string {
  if (!binding) return "";
  return binding.split(" ").map((c) => chordParts(c).join("+")).join(" ");
}
