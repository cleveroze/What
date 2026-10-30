/** API keys are kept out of settings.json (so they are never exported with
 * settings) in a separate file in the per-user config folder. */
import { createStore } from "../lib/store";
import { load, persist } from "./persist";

export interface Secrets {
  anthropicKey: string;
  openrouterKey: string;
  customKey: string;
}

export const secretsStore = createStore<Secrets>({ anthropicKey: "", openrouterKey: "", customKey: "" });

export async function initSecrets() {
  const saved = await load<Partial<Secrets>>("secrets");
  if (saved) secretsStore.set({ ...secretsStore.get(), ...saved });
}

export function setSecret(key: keyof Secrets, value: string) {
  secretsStore.set((s) => ({ ...s, [key]: value.trim() }));
  persist("secrets", secretsStore.get());
}
