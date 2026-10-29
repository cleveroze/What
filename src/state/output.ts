import { createStore } from "../lib/store";

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  id: number;
  time: number;
  level: LogLevel;
  message: string;
}

const MAX_ENTRIES = 2000;
let seq = 0;

export const outputStore = createStore<{ entries: LogEntry[] }>({ entries: [] });

export function log(message: string, level: LogLevel = "info") {
  const entry = { id: ++seq, time: Date.now(), level, message };
  outputStore.set((s) => ({ entries: [...s.entries.slice(-(MAX_ENTRIES - 1)), entry] }));
}

export function clearOutput() {
  outputStore.set({ entries: [] });
}
