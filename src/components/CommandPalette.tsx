import { useEffect, useMemo, useRef, useState } from "react";
import { allCommands, bindingFor, recentCommandIds, runCommand, type Command } from "../commands/registry";
import { fs } from "../ipc/native";
import { fuzzyMatch } from "../lib/fuzzy";
import { basename, dirname, relative } from "../lib/path";
import { useStore } from "../lib/store";
import { allDocs, getActiveEditor, openFile } from "../state/editors";
import { closePalette, paletteStore, type PickItem } from "../state/ui";
import { workspaceStore } from "../state/workspace";
import { FileIcon } from "./FileIcon";
import { Icon } from "./Icon";
import { Kbd } from "./ui/controls";

interface Row {
  key: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  keybinding?: string;
  positions: number[];
  run: () => void;
  group?: string;
}

function Highlight({ text, positions }: { text: string; positions: number[] }) {
  if (!positions.length) return <>{text}</>;
  const set = new Set(positions);
  return (
    <>
      {[...text].map((ch, i) => (set.has(i) ? <b key={i}>{ch}</b> : ch))}
    </>
  );
}

let fileCache: { root: string; files: string[]; at: number } | null = null;

async function listFiles(root: string): Promise<string[]> {
  if (fileCache && fileCache.root === root && Date.now() - fileCache.at < 15000) return fileCache.files;
  const files = await fs.listFiles(root, 50000);
  fileCache = { root, files, at: Date.now() };
  return files;
}

export function CommandPalette() {
  const state = useStore(paletteStore, (s) => s);
  const root = useStore(workspaceStore, (s) => s.root);
  const [text, setText] = useState("");
  const [index, setIndex] = useState(0);
  const [files, setFiles] = useState<string[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state.open) return;
    const prefix = state.mode === "commands" ? ">" : state.mode === "line" ? ":" : "";
    setText(prefix + state.initial);
    setIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [state.open, state.mode, state.initial, state.items]);

  const mode = state.mode === "pick" ? "pick" : text.startsWith(">") ? "commands" : text.startsWith(":") ? "line" : "files";
  const query = mode === "commands" || mode === "line" ? text.slice(1).trim() : text.trim();

  useEffect(() => {
    if (!state.open || mode !== "files" || !root) return;
    let cancelled = false;
    setLoadingFiles(true);
    listFiles(root)
      .then((f) => !cancelled && setFiles(f))
      .catch(() => !cancelled && setFiles([]))
      .finally(() => !cancelled && setLoadingFiles(false));
    return () => {
      cancelled = true;
    };
  }, [state.open, mode, root]);

  const finish = (fn: () => void) => {
    const resolve = paletteStore.get().resolve;
    paletteStore.set({ open: false, mode: "commands", initial: "" });
    fn();
    resolve?.(undefined);
  };

  const rows: Row[] = useMemo(() => {
    if (!state.open) return [];
    if (mode === "pick") {
      const scored: { it: PickItem; i: number; positions: number[]; score: number }[] = [];
      (state.items ?? []).forEach((it, i) => {
        const m = fuzzyMatch(query, it.label);
        if (m) scored.push({ it, i, positions: m.positions, score: m.score });
      });
      scored.sort((a, b) => (query ? b.score - a.score : a.i - b.i));
      return scored.map(({ it, i, positions }) => ({
        key: `pick-${i}`,
        label: it.label,
        description: it.description,
        icon: it.icon ? <Icon name={it.icon} size={15} /> : undefined,
        positions,
        run: () => {
          const resolve = paletteStore.get().resolve;
          paletteStore.set({ open: false, mode: "commands", initial: "" });
          resolve?.(it.value);
        },
      }));
    }
    if (mode === "commands") {
      const recent = recentCommandIds();
      const rank = (id: string) => {
        const r = recent.indexOf(id);
        return r < 0 ? 999 : r;
      };
      const scored: { c: Command; label: string; positions: number[]; score: number }[] = [];
      for (const c of allCommands()) {
        if (c.hidden || (c.enabled && !c.enabled())) continue;
        const label = `${c.category}: ${c.title}`;
        const m = fuzzyMatch(query, label);
        if (m) scored.push({ c, label, positions: m.positions, score: m.score });
      }
      scored.sort((a, b) =>
        query ? b.score - a.score : rank(a.c.id) - rank(b.c.id) || a.label.localeCompare(b.label),
      );
      return scored.slice(0, 200).map(({ c, label, positions }) => ({
        key: c.id,
        label,
        keybinding: bindingFor(c.id),
        positions,
        group: !query && recent.includes(c.id) ? "recently used" : undefined,
        run: () => finish(() => runCommand(c.id)),
      }));
    }
    if (mode === "line") {
      const editor = getActiveEditor();
      const model = editor?.getModel();
      if (!editor || !model) return [{ key: "noeditor", label: "Open a text editor first to go to a line.", positions: [], run: () => {} }];
      const [l, c] = query.split(/[,:]/).map((n) => parseInt(n, 10));
      const total = model.getLineCount();
      if (!l) {
        const pos = editor.getPosition();
        return [{ key: "hint", label: `Current line: ${pos?.lineNumber}, character: ${pos?.column}. Type a line number between 1 and ${total} to navigate to.`, positions: [], run: () => {} }];
      }
      const line = Math.min(Math.max(1, l), total);
      return [
        {
          key: "goto",
          label: c ? `Go to line ${line}, character ${c}.` : `Go to line ${line}.`,
          positions: [],
          run: () =>
            finish(() => {
              editor.setPosition({ lineNumber: line, column: c || 1 });
              editor.revealLineInCenter(line);
              editor.focus();
            }),
        },
      ];
    }
    // Files: open editors first, then workspace files.
    const open = allDocs().filter((d) => d.path);
    const openSet = new Set(open.map((d) => d.path!.toLowerCase()));
    const candidates = [...open.map((d) => d.path!), ...files.filter((f) => !openSet.has(f.toLowerCase()))];
    const scored: { path: string; rel: string; m: ReturnType<typeof fuzzyMatch>; name: string; opened: boolean }[] = [];
    for (const path of candidates) {
      const rel = root ? relative(root, path) : path;
      const name = basename(path);
      const mName = fuzzyMatch(query, name);
      const m = mName ? { ...mName, score: mName.score + 5 } : fuzzyMatch(query, rel);
      if (!m) continue;
      scored.push({ path, rel, m, name, opened: openSet.has(path.toLowerCase()) });
      if (!query && scored.length > 60) break;
    }
    scored.sort((a, b) => (query ? b.m!.score - a.m!.score : Number(b.opened) - Number(a.opened)));
    return scored.slice(0, 100).map((s) => {
      const nameMatch = fuzzyMatch(query, s.name);
      return {
        key: s.path,
        label: s.name,
        description: dirname(s.rel),
        icon: <FileIcon name={s.name} />,
        positions: nameMatch?.positions ?? [],
        group: !query && s.opened ? "open editors" : undefined,
        run: () => finish(() => openFile(s.path, { focus: true })),
      };
    });
  }, [state.open, state.items, mode, query, files, root]);

  useEffect(() => setIndex(0), [query, mode]);
  useEffect(() => {
    listRef.current?.querySelector(".palette-row.active")?.scrollIntoView({ block: "nearest" });
  }, [index]);

  if (!state.open) return null;

  const placeholder =
    state.mode === "pick"
      ? state.placeholder
      : mode === "files"
        ? root
          ? "Search files by name (append : to go to line, > for commands)"
          : "Type > to run a command (open a folder to search files)"
        : mode === "commands"
          ? "Type a command"
          : "Go to line";

  return (
    <div className="palette-scrim" onPointerDown={(e) => e.target === e.currentTarget && closePalette()}>
      <div className="palette" role="dialog" aria-label="Command palette">
        <div className="palette-input">
          <Icon name={mode === "commands" ? "arrow-right" : "search"} size={15} />
          <input
            ref={inputRef}
            value={text}
            placeholder={placeholder}
            spellCheck={false}
            aria-controls="palette-list"
            aria-activedescendant={rows[index] ? `pal-${index}` : undefined}
            onChange={(e) => setText(e.target.value)}
            onBlur={(e) => {
              if (!e.relatedTarget || !(e.relatedTarget as Element).closest(".palette")) closePalette();
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(rows.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(0, i - 1));
              } else if (e.key === "PageDown") {
                e.preventDefault();
                setIndex((i) => Math.min(rows.length - 1, i + 10));
              } else if (e.key === "PageUp") {
                e.preventDefault();
                setIndex((i) => Math.max(0, i - 10));
              } else if (e.key === "Enter") {
                e.preventDefault();
                rows[index]?.run();
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                closePalette();
                getActiveEditor()?.focus();
              }
            }}
          />
        </div>
        <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {rows.length === 0 && (
            <div className="palette-empty">{mode === "files" && loadingFiles ? "Indexing files…" : "No matching results"}</div>
          )}
          {rows.map((r, i) => (
            <div
              key={r.key}
              id={`pal-${i}`}
              role="option"
              aria-selected={i === index}
              className={`palette-row ${i === index ? "active" : ""}`}
              onPointerMove={() => i !== index && setIndex(i)}
              onPointerDown={(e) => {
                e.preventDefault();
                r.run();
              }}
            >
              {r.icon && <span className="palette-icon">{r.icon}</span>}
              <span className="palette-label">
                <Highlight text={r.label} positions={r.positions} />
              </span>
              {r.description && <span className="palette-desc">{r.description}</span>}
              {r.group && <span className="palette-group">{r.group}</span>}
              {r.keybinding && <Kbd binding={r.keybinding} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
