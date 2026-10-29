import { createStore } from "../lib/store";
import { errorMessage } from "../lib/util";
import { log } from "./output";

// ---------- Notifications ----------

export interface Toast {
  id: number;
  kind: "info" | "error" | "success" | "warning";
  message: string;
  detail?: string;
  leaving?: boolean;
}

let toastSeq = 0;
export const toastStore = createStore<{ toasts: Toast[] }>({ toasts: [] });

export function notify(kind: Toast["kind"], message: string, detail?: string) {
  const id = ++toastSeq;
  toastStore.set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, message, detail }] }));
  log(detail ? `${message} — ${detail}` : message, kind === "error" ? "error" : kind === "warning" ? "warn" : "info");
  setTimeout(() => dismissToast(id), kind === "error" ? 8000 : 4000);
}

export function dismissToast(id: number) {
  // Play the exit animation, then remove.
  toastStore.set((s) => ({ toasts: s.toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t)) }));
  setTimeout(() => toastStore.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 240);
}

export function reportError(context: string, e: unknown) {
  notify("error", context, errorMessage(e));
}

// ---------- Welcome tour ----------

export const onboardingStore = createStore<{ open: boolean }>({ open: false });
export const openOnboarding = () => onboardingStore.set({ open: true });

// ---------- Modal dialogs ----------

export interface DialogButton<T> {
  label: string;
  value: T;
  primary?: boolean;
  danger?: boolean;
}

export interface DialogState {
  title: string;
  message?: string;
  detail?: string;
  buttons: DialogButton<unknown>[];
  cancelValue: unknown;
  resolve: (v: unknown) => void;
}

export const dialogStore = createStore<{ dialog: DialogState | null }>({ dialog: null });

export function showDialog<T>(opts: {
  title: string;
  message?: string;
  detail?: string;
  buttons: DialogButton<T>[];
  cancelValue: T;
}): Promise<T> {
  return new Promise<T>((resolve) => {
    dialogStore.set({
      dialog: {
        ...opts,
        buttons: opts.buttons as DialogButton<unknown>[],
        resolve: (v) => {
          dialogStore.set({ dialog: null });
          resolve(v as T);
        },
      },
    });
  });
}

export async function confirm(title: string, message: string, confirmLabel = "OK", danger = false) {
  return showDialog({
    title,
    message,
    buttons: [
      { label: "Cancel", value: false },
      { label: confirmLabel, value: true, primary: true, danger },
    ],
    cancelValue: false,
  });
}

// ---------- Context menus ----------

export interface MenuItem {
  id?: string;
  label: string;
  keybinding?: string;
  disabled?: boolean;
  checked?: boolean;
  danger?: boolean;
  run?: () => void;
  submenu?: MenuEntry[];
}

export type MenuEntry = MenuItem | "separator";

export const contextMenuStore = createStore<{ menu: { x: number; y: number; items: MenuEntry[] } | null }>({
  menu: null,
});

export function openContextMenu(e: { clientX: number; clientY: number; preventDefault(): void }, items: MenuEntry[]) {
  e.preventDefault();
  contextMenuStore.set({ menu: { x: e.clientX, y: e.clientY, items } });
}

export function openMenuAt(x: number, y: number, items: MenuEntry[]) {
  contextMenuStore.set({ menu: { x, y, items } });
}

export const closeContextMenu = () => contextMenuStore.set({ menu: null });

// ---------- Quick input (command palette / pickers) ----------

export type PaletteMode = "commands" | "files" | "line" | "pick";

export interface PickItem<T = unknown> {
  label: string;
  description?: string;
  detail?: string;
  value: T;
  icon?: string;
  keybinding?: string;
}

export interface PaletteState {
  open: boolean;
  mode: PaletteMode;
  initial: string;
  placeholder?: string;
  items?: PickItem[];
  resolve?: (v: unknown) => void;
}

export const paletteStore = createStore<PaletteState>({ open: false, mode: "commands", initial: "" });

export function openPalette(mode: Exclude<PaletteMode, "pick">, initial = "") {
  const prev = paletteStore.get();
  prev.resolve?.(undefined);
  paletteStore.set({ open: true, mode, initial });
}

export function closePalette() {
  const prev = paletteStore.get();
  prev.resolve?.(undefined);
  paletteStore.set({ open: false, mode: "commands", initial: "" });
}

export function quickPick<T>(items: PickItem<T>[], placeholder: string): Promise<T | undefined> {
  const prev = paletteStore.get();
  prev.resolve?.(undefined);
  return new Promise((resolve) => {
    paletteStore.set({
      open: true,
      mode: "pick",
      initial: "",
      placeholder,
      items: items as PickItem[],
      resolve: (v) => {
        resolve(v as T | undefined);
      },
    });
  });
}
