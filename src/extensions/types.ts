import type { ShapeName } from "../lib/shapes";

export type ExtensionPermission = "ai" | "network" | "clipboard";
export type ExtensionCategory = "Themes" | "Snippets" | "Tools" | "AI" | "Formatters" | "Fun";

export interface ThemeContribution {
  id: string;
  name: string;
  description?: string;
  /** OKLCH hue (0–360) and chroma (0–0.04) of backgrounds and panels. */
  neutralHue: number;
  neutralChroma: number;
  /** OKLCH hue (0–360) and chroma (0–0.2) of the accent color. */
  accentHue: number;
  accentChroma: number;
  /** How colorful code highlighting is (0 = greyscale, ~0.11 = normal). */
  syntaxChroma?: number;
}

export interface SnippetContribution {
  /** Monaco language id, e.g. "html", "python", "javascript". */
  language: string;
  prefix: string;
  /** Snippet body; use $1, $2 for tab stops and $0 for the final cursor. */
  body: string | string[];
  description?: string;
}

export interface CommandContribution {
  id: string;
  title: string;
  keybinding?: string;
}

export interface ExtensionManifest {
  /** Unique id: lowercase letters, digits and dashes, e.g. "word-count". */
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  icon?: ShapeName;
  categories?: ExtensionCategory[];
  permissions?: ExtensionPermission[];
  /** File with the extension's code (runs in a sandbox). */
  main?: string;
  contributes?: {
    themes?: ThemeContribution[];
    snippets?: SnippetContribution[];
    commands?: CommandContribution[];
  };
}

/** Single-file distribution format (`*.stride-ext.json`). */
export interface ExtensionBundle {
  manifest: ExtensionManifest;
  files: Record<string, string>;
}

export interface InstalledExtension {
  manifest: ExtensionManifest;
  /** Code of `main`, if any. */
  code: string | null;
  builtin: boolean;
  /** Folder on disk (null for built-ins). */
  path: string | null;
}

export interface RegistryEntry {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  icon?: ShapeName;
  categories?: ExtensionCategory[];
  permissions?: ExtensionPermission[];
  builtin?: boolean;
  summary?: { commands: string[]; themes: string[]; snippets: string[] };
  /** Bundle URL, relative to the registry file. */
  bundle: string;
}

const ID = /^[a-z0-9][a-z0-9-]{1,48}$/;

/** Validates untrusted manifest JSON; returns an error message or null. */
export function validateManifest(m: unknown): string | null {
  if (!m || typeof m !== "object") return "extension.json is not an object";
  const x = m as Record<string, unknown>;
  if (typeof x.id !== "string" || !ID.test(x.id)) return "“id” must be lowercase letters, digits and dashes";
  for (const k of ["name", "version", "description", "author"]) {
    if (typeof x[k] !== "string" || !(x[k] as string).trim()) return `“${k}” is required`;
  }
  if (x.main !== undefined && (typeof x.main !== "string" || /[\\/]/.test(x.main))) return "“main” must be a file name in the extension folder";
  if (x.permissions !== undefined && !Array.isArray(x.permissions)) return "“permissions” must be a list";
  return null;
}
