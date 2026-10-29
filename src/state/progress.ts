/** "First steps" checklist for newcomers. Steps are completed by actually
 * doing the thing (opening a folder, saving a file, ...), never by clicking
 * the checklist itself. */
import { createStore } from "../lib/store";
import { load, persist } from "./persist";
import { settingsStore } from "./settings";

export type StepId = "folder" | "file" | "save" | "palette" | "terminal" | "theme";

export const STEPS: { id: StepId; title: string; hint: string; command: string; shape: import("../lib/shapes").ShapeName }[] = [
  { id: "folder", title: "Open a project folder", hint: "Your files appear in the Explorer on the left.", command: "file.openFolder", shape: "cookie9" },
  { id: "file", title: "Create or open a file", hint: "Click a file in the Explorer, or press Ctrl+N for a new one.", command: "file.newFile", shape: "clover4" },
  { id: "save", title: "Save your work", hint: "Press Ctrl+S. A dot on the tab means unsaved changes.", command: "file.save", shape: "pentagon" },
  { id: "palette", title: "Run a command from the palette", hint: "Ctrl+Shift+P finds every action by name.", command: "workbench.commandPalette", shape: "softBurst" },
  { id: "terminal", title: "Open the terminal", hint: "Ctrl+` runs PowerShell or CMD right inside Stride.", command: "terminal.toggle", shape: "pill" },
  { id: "theme", title: "Make it yours", hint: "Pick colors, shapes and motion in Settings → Themes.", command: "settings.themes", shape: "flower" },
];

export const progressStore = createStore<{ done: Partial<Record<StepId, number>> }>({ done: {} });

export async function initProgress() {
  const saved = await load<{ done: Partial<Record<StepId, number>> }>("progress");
  if (saved?.done) progressStore.set({ done: saved.done });
  // Any change to the look counts as personalising Stride.
  const look = () => {
    const s = settingsStore.get();
    return [s["theme.mode"], s["theme.preset"], s["theme.accent"], s["ui.radius"], s["ui.density"]].join("|");
  };
  let last = look();
  settingsStore.subscribe(() => {
    const next = look();
    if (next !== last) {
      last = next;
      completeStep("theme");
    }
  });
}

export function completeStep(id: StepId) {
  if (progressStore.get().done[id]) return;
  progressStore.set((s) => ({ done: { ...s.done, [id]: Date.now() } }));
  persist("progress", progressStore.get());
}
