/** Example extensions shipped with Stride. They live in /extensions (the same
 * sources the Workshop publishes), so they double as documentation. */
import type { ExtensionManifest, InstalledExtension } from "./types";

export const BUILTIN_IDS = ["word-count", "case-converter", "sakura-theme", "html-snippets", "ai-commenter"];

const manifests = import.meta.glob<ExtensionManifest>("/extensions/*/extension.json", { eager: true, import: "default" });
const sources = import.meta.glob<string>("/extensions/*/*.js", { eager: true, query: "?raw", import: "default" });

export const BUILTIN_EXTENSIONS: InstalledExtension[] = BUILTIN_IDS.flatMap((id) => {
  const manifest = manifests[`/extensions/${id}/extension.json`];
  if (!manifest) return [];
  const code = manifest.main ? sources[`/extensions/${id}/${manifest.main}`] ?? null : null;
  return [{ manifest, code, builtin: true, path: null }];
});

/** Source files of a built-in extension, for "View source" / "Copy to edit". */
export function builtinFiles(id: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const [path, src] of Object.entries(sources)) {
    const m = /^\/extensions\/([^/]+)\/([^/]+)$/.exec(path);
    if (m && m[1] === id) files[m[2]] = src;
  }
  return files;
}
