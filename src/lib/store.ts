import { useSyncExternalStore } from "react";

export interface Store<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  update(patch: Partial<T>): void;
  subscribe(listener: () => void): () => void;
}

/** Minimal observable store, consumed from React via `useStore`. */
export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  return {
    get: () => state,
    set(next) {
      const value = typeof next === "function" ? (next as (p: T) => T)(state) : next;
      if (value !== state) {
        state = value;
        emit();
      }
    },
    update(patch) {
      state = { ...state, ...patch };
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useStore<T extends object, S>(store: Store<T>, selector: (s: T) => S): S {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()));
}
