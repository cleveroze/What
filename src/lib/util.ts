export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: A | undefined;
  const run = (...args: A) => {
    lastArgs = args;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn(...(lastArgs as A));
    }, ms);
  };
  run.flush = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
      fn(...(lastArgs as A));
    }
  };
  run.cancel = () => clearTimeout(timer);
  return run;
}

let counter = 0;
export const uid = (prefix = "id") => `${prefix}-${Date.now().toString(36)}-${(++counter).toString(36)}`;

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function errorMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return JSON.stringify(e);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const isWindows = navigator.userAgent.includes("Windows");
