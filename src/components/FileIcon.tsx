import { useStore } from "../lib/store";
import { extname, basename } from "../lib/path";
import { settingsStore } from "../state/settings";
import { Icon } from "./Icon";

interface Glyph {
  label: string;
  hue: number;
  chroma?: number;
}

const BY_EXT: Record<string, Glyph> = {
  ".ts": { label: "TS", hue: 250 }, ".tsx": { label: "TX", hue: 230 }, ".mts": { label: "TS", hue: 250 }, ".cts": { label: "TS", hue: 250 },
  ".js": { label: "JS", hue: 95 }, ".jsx": { label: "JX", hue: 210 }, ".mjs": { label: "JS", hue: 95 }, ".cjs": { label: "JS", hue: 95 },
  ".json": { label: "{}", hue: 85 }, ".jsonc": { label: "{}", hue: 85 },
  ".html": { label: "<>", hue: 35 }, ".htm": { label: "<>", hue: 35 }, ".xml": { label: "<>", hue: 55 }, ".svg": { label: "SV", hue: 60 },
  ".css": { label: "#", hue: 265 }, ".scss": { label: "S#", hue: 350 }, ".less": { label: "L#", hue: 270 },
  ".md": { label: "MD", hue: 230, chroma: 0.05 }, ".mdx": { label: "MX", hue: 230, chroma: 0.05 }, ".txt": { label: "TX", hue: 0, chroma: 0 },
  ".py": { label: "PY", hue: 240 }, ".rs": { label: "RS", hue: 40 }, ".go": { label: "GO", hue: 210 },
  ".java": { label: "JV", hue: 30 }, ".kt": { label: "KT", hue: 300 }, ".cs": { label: "C#", hue: 150 },
  ".c": { label: "C", hue: 240 }, ".h": { label: "H", hue: 280 }, ".cpp": { label: "C+", hue: 250 }, ".hpp": { label: "H+", hue: 280 },
  ".php": { label: "PH", hue: 275 }, ".rb": { label: "RB", hue: 20 }, ".swift": { label: "SW", hue: 35 }, ".dart": { label: "DT", hue: 220 },
  ".lua": { label: "LU", hue: 260 }, ".sql": { label: "SQ", hue: 200 }, ".graphql": { label: "GQ", hue: 340 },
  ".sh": { label: "$", hue: 140 }, ".bash": { label: "$", hue: 140 }, ".ps1": { label: "PS", hue: 235 }, ".psm1": { label: "PS", hue: 235 },
  ".bat": { label: "BA", hue: 140 }, ".cmd": { label: "CM", hue: 140 },
  ".yml": { label: "YM", hue: 0 }, ".yaml": { label: "YM", hue: 0 }, ".toml": { label: "TM", hue: 30 }, ".ini": { label: "IN", hue: 60, chroma: 0.04 },
  ".lock": { label: "LK", hue: 0, chroma: 0 }, ".env": { label: "EN", hue: 95 }, ".log": { label: "LG", hue: 0, chroma: 0 },
  ".vue": { label: "VU", hue: 155 }, ".svelte": { label: "SV", hue: 30 }, ".r": { label: "R", hue: 240 },
  ".png": { label: "IM", hue: 300 }, ".jpg": { label: "IM", hue: 300 }, ".jpeg": { label: "IM", hue: 300 }, ".gif": { label: "IM", hue: 300 },
  ".ico": { label: "IC", hue: 300 }, ".webp": { label: "IM", hue: 300 },
  ".zip": { label: "ZP", hue: 70, chroma: 0.05 }, ".exe": { label: "EX", hue: 0, chroma: 0 }, ".dll": { label: "DL", hue: 0, chroma: 0 },
};

const BY_NAME: Record<string, Glyph> = {
  "package.json": { label: "NP", hue: 25 },
  "tsconfig.json": { label: "TC", hue: 250 },
  "cargo.toml": { label: "CG", hue: 40 },
  dockerfile: { label: "DK", hue: 225 },
  ".gitignore": { label: "GI", hue: 30 },
  ".gitattributes": { label: "GI", hue: 30 },
  license: { label: "LI", hue: 85, chroma: 0.05 },
  "readme.md": { label: "RM", hue: 230 },
  makefile: { label: "MK", hue: 60 },
};

export function glyphFor(name: string): Glyph | null {
  const lower = basename(name).toLowerCase();
  return BY_NAME[lower] ?? BY_EXT[extname(lower)] ?? null;
}

export function FileIcon({ name, isDir = false, open = false }: { name: string; isDir?: boolean; open?: boolean }) {
  const theme = useStore(settingsStore, (s) => s["ui.iconTheme"]);
  if (isDir) {
    return (
      <span className={`file-icon folder theme-${theme}`}>
        <Icon name={open ? "folder-open" : "folder"} />
      </span>
    );
  }
  const glyph = glyphFor(name);
  if (theme === "minimal" || !glyph) {
    return (
      <span className={`file-icon plain theme-${theme}`}>
        <Icon name="file" />
      </span>
    );
  }
  const c = theme === "mono" ? 0 : (glyph.chroma ?? 0.12);
  return (
    <span
      className={`file-icon badge theme-${theme}`}
      style={{ ["--fi-h" as string]: glyph.hue, ["--fi-c" as string]: c }}
      data-len={glyph.label.length}
    >
      {glyph.label}
    </span>
  );
}
