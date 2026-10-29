/** Path helpers that work with both Windows (`\`) and POSIX (`/`) paths as
 * returned by the native backend. */

export function sep(path: string): string {
  return path.includes("\\") ? "\\" : "/";
}

export function basename(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const i = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return i < 0 ? trimmed : trimmed.slice(i + 1);
}

export function dirname(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const i = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (i < 0) return "";
  const dir = trimmed.slice(0, i);
  // Keep drive roots ("C:\") and POSIX root intact.
  if (/^[A-Za-z]:$/.test(dir)) return dir + "\\";
  return dir || "/";
}

export function join(dir: string, name: string): string {
  const s = sep(dir);
  return dir.endsWith("/") || dir.endsWith("\\") ? dir + name : dir + s + name;
}

export function extname(path: string): string {
  const base = basename(path);
  const i = base.lastIndexOf(".");
  return i <= 0 ? "" : base.slice(i).toLowerCase();
}

function norm(path: string): string {
  const p = path.replace(/\\/g, "/").replace(/\/+$/, "");
  return /^[A-Za-z]:/.test(p) ? p.toLowerCase() : p;
}

export function samePath(a: string, b: string): boolean {
  return norm(a) === norm(b);
}

/** True when `child` is `parent` or lives inside it. */
export function isWithin(child: string, parent: string): boolean {
  const c = norm(child);
  const p = norm(parent);
  return c === p || c.startsWith(p + "/");
}

export function relative(root: string, path: string): string {
  if (!isWithin(path, root)) return path;
  return path.slice(root.replace(/[\\/]+$/, "").length).replace(/^[\\/]+/, "");
}

/** Re-roots `path` from `oldBase` onto `newBase` (used after renames/moves). */
export function rebase(path: string, oldBase: string, newBase: string): string {
  return newBase + path.slice(oldBase.replace(/[\\/]+$/, "").length);
}

export function segments(path: string): string[] {
  return path.split(/[\\/]+/).filter(Boolean);
}
