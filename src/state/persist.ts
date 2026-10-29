import { state as nativeState } from "../ipc/native";
import { debounce, errorMessage } from "../lib/util";

type Writer = ReturnType<typeof debounce<[string]>>;
const writers = new Map<string, Writer>();
const inFlight = new Set<Promise<void>>();

/** Debounced, atomic persistence of a JSON document in the config folder. */
export function persist(name: string, value: unknown) {
  let writer = writers.get(name);
  if (!writer) {
    writer = debounce((json: string) => {
      const p = nativeState
        .write(name, json)
        .catch((e) => console.error(`persist ${name}:`, errorMessage(e)))
        .finally(() => inFlight.delete(p));
      inFlight.add(p);
    }, 350);
    writers.set(name, writer);
  }
  writer(JSON.stringify(value, null, 2));
}

/** Writes all pending state immediately; resolves once it reached disk. */
export async function flushPersistence() {
  writers.forEach((w) => w.flush());
  await Promise.all([...inFlight]);
}

export async function load<T>(name: string): Promise<T | null> {
  try {
    const raw = await nativeState.read(name);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (e) {
    console.error(`load ${name}:`, errorMessage(e));
    return null;
  }
}
