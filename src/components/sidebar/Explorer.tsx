import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { pickOpenFolder } from "../../commands/builtin";
import { fs, type DirEntry } from "../../ipc/native";
import { basename, dirname, isWithin, samePath } from "../../lib/path";
import { useStore } from "../../lib/store";
import { activeDoc, editorStore, openFile } from "../../state/editors";
import {
  copyPathToClipboard,
  createEntry,
  deleteEntries,
  duplicateEntry,
  moveEntries,
  pasteEntries,
  renameEntry,
  validateName,
} from "../../state/fileOps";
import { settingsStore } from "../../state/settings";
import { createTerminal } from "../../state/terminals";
import { openContextMenu, type MenuEntry } from "../../state/ui";
import {
  collapseAll,
  explorerStore,
  isExcluded,
  openFolder,
  refreshExplorer,
  revealInExplorer,
  selectInExplorer,
  setExplorerClipboard,
  setInlineEdit,
  toggleDir,
  workspaceStore,
  type InlineEdit,
} from "../../state/workspace";
import { rowHeight } from "../../theme/engine";
import { FileIcon } from "../FileIcon";
import { Icon } from "../Icon";
import { Button, IconButton } from "../ui/controls";

type Row =
  | { kind: "entry"; entry: DirEntry; depth: number; expanded: boolean }
  | { kind: "edit"; edit: InlineEdit; depth: number; isDir: boolean; initial: string }
  | { kind: "message"; text: string; depth: number; error?: boolean };

const dirKey = (p: string) => p.replace(/\\/g, "/").toLowerCase();

function buildRows(root: string, state: ReturnType<typeof explorerStore.get>): Row[] {
  const rows: Row[] = [];
  const edit = state.edit;
  const walk = (dir: string, depth: number) => {
    if (edit && edit.kind !== "rename" && samePath(edit.parent, dir)) {
      rows.push({ kind: "edit", edit, depth, isDir: edit.kind === "new-folder", initial: "" });
    }
    const entries = state.dirs[dirKey(dir)];
    const err = state.errors[dirKey(dir)];
    if (err) {
      rows.push({ kind: "message", text: err, depth, error: true });
      return;
    }
    if (!entries) {
      rows.push({ kind: "message", text: "Loading…", depth });
      return;
    }
    for (const entry of entries) {
      if (isExcluded(entry)) continue;
      if (edit?.kind === "rename" && samePath(edit.target, entry.path)) {
        rows.push({ kind: "edit", edit, depth, isDir: entry.isDir, initial: entry.name });
        continue;
      }
      const expanded = entry.isDir && !!state.expanded[dirKey(entry.path)];
      rows.push({ kind: "entry", entry, depth, expanded });
      if (expanded) walk(entry.path, depth + 1);
    }
  };
  walk(root, 0);
  return rows;
}

function InlineInput({ row, onDone }: { row: Extract<Row, { kind: "edit" }>; onDone: () => void }) {
  const [value, setValue] = useState(row.initial);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current!;
    el.focus();
    const dot = row.initial.lastIndexOf(".");
    el.setSelectionRange(0, !row.isDir && dot > 0 ? dot : row.initial.length);
  }, [row.initial, row.isDir]);

  const commit = async () => {
    if (done.current) return;
    const name = value.trim();
    if (!name || name === row.initial) {
      done.current = true;
      onDone();
      return;
    }
    const segments = name.split(/[\\/]/);
    const invalid = segments.map(validateName).find(Boolean);
    if (invalid) {
      setError(invalid);
      return;
    }
    done.current = true;
    onDone();
    if (row.edit.kind === "rename") await renameEntry(row.edit.target, name);
    else await createEntry(row.edit.parent, name, row.edit.kind === "new-folder" ? "folder" : "file");
  };

  return (
    <div className="tree-edit">
      <input
        ref={ref}
        value={value}
        spellCheck={false}
        aria-label={row.edit.kind === "rename" ? "New name" : row.isDir ? "Folder name" : "File name"}
        aria-invalid={!!error}
        onChange={(e) => {
          setValue(e.target.value);
          setError(e.target.value.split(/[\\/]/).map(validateName).find((x) => x && e.target.value.trim()) ?? null);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            done.current = true;
            onDone();
          }
        }}
        onBlur={commit}
      />
      {error && <div className="tree-edit-error">{error}</div>}
    </div>
  );
}

export function Explorer() {
  const root = useStore(workspaceStore, (s) => s.root);
  const recent = useStore(workspaceStore, (s) => s.recent);
  const state = useStore(explorerStore, (s) => s);
  const settings = useStore(settingsStore, (s) => s);
  const activePath = useStore(editorStore, () => activeDoc()?.path ?? null);
  const rowH = rowHeight(settings);
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(400);
  const [focused, setFocused] = useState(false);
  const [drag, setDrag] = useState<{ paths: string[]; x: number; y: number; target: string | null } | null>(null);
  const dragStart = useRef<{ path: string; x: number; y: number } | null>(null);
  const justDragged = useRef(false);

  const rows = useMemo(() => (root ? buildRows(root, state) : []), [root, state, settings["files.exclude"]]);
  const indexOf = (path: string | null) => (path ? rows.findIndex((r) => r.kind === "entry" && samePath(r.entry.path, path)) : -1);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewH(el.clientHeight));
    ro.observe(el);
    setViewH(el.clientHeight);
    return () => ro.disconnect();
  }, [root]);

  // Auto-reveal the active editor's file.
  useEffect(() => {
    if (activePath && root && isWithin(activePath, root)) revealInExplorer(activePath, false);
  }, [activePath, root]);

  // Keep the selection scrolled into view.
  useEffect(() => {
    const i = indexOf(state.selected);
    const el = listRef.current;
    if (i < 0 || !el) return;
    const top = i * rowH;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + rowH > el.scrollTop + el.clientHeight) el.scrollTop = top + rowH - el.clientHeight;
  }, [state.selected, rows.length]);

  if (!root) {
    return (
      <div className="explorer-empty">
        <p>You have not opened a folder yet.</p>
        <Button variant="filled" icon="folder-open" onClick={pickOpenFolder}>
          Open Folder
        </Button>
        {recent.length > 0 && (
          <>
            <div className="explorer-empty-heading">Recent</div>
            <ul className="recent-list">
              {recent.slice(0, 6).map((r) => (
                <li key={r.path}>
                  <button type="button" onClick={() => openFolder(r.path)} title={r.path}>
                    <Icon name="folder" size={14} />
                    <span className="recent-name">{r.name}</span>
                    <span className="recent-path">{dirname(r.path)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    );
  }

  const targetDirFor = (entry: DirEntry | null) => (entry ? (entry.isDir ? entry.path : dirname(entry.path)) : root);
  const selectedEntry = (() => {
    const i = indexOf(state.selected);
    const r = rows[i];
    return r?.kind === "entry" ? r.entry : null;
  })();

  const menuFor = (entry: DirEntry | null): MenuEntry[] => {
    const dir = targetDirFor(entry);
    const items: MenuEntry[] = [
      { label: "New File…", run: () => setInlineEdit({ kind: "new-file", parent: dir }) },
      { label: "New Folder…", run: () => setInlineEdit({ kind: "new-folder", parent: dir }) },
      "separator",
      { label: "Reveal in File Explorer", keybinding: "shift+alt+r", run: () => fs.reveal(entry?.path ?? root) },
      { label: "Open in Integrated Terminal", run: () => createTerminal(undefined, dir) },
    ];
    if (entry) {
      items.push(
        "separator",
        { label: "Cut", keybinding: "ctrl+x", run: () => setExplorerClipboard([entry.path], true) },
        { label: "Copy", keybinding: "ctrl+c", run: () => setExplorerClipboard([entry.path], false) },
      );
    }
    items.push({ label: "Paste", keybinding: "ctrl+v", disabled: !state.clipboard, run: () => pasteEntries(dir) });
    if (entry) {
      items.push(
        { label: "Duplicate", run: () => duplicateEntry(entry.path) },
        "separator",
        { label: "Copy Path", keybinding: "shift+alt+c", run: () => copyPathToClipboard(entry.path, false) },
        { label: "Copy Relative Path", run: () => copyPathToClipboard(entry.path, true) },
        "separator",
        { label: "Rename…", keybinding: "f2", run: () => setInlineEdit({ kind: "rename", target: entry.path }) },
        { label: "Delete", keybinding: "delete", danger: true, run: () => deleteEntries([entry.path]) },
      );
    } else {
      items.push("separator", { label: "Refresh", run: refreshExplorer }, { label: "Collapse All", run: collapseAll });
    }
    return items;
  };

  const activate = (entry: DirEntry, focusEditor = false) => {
    selectInExplorer(entry.path);
    if (entry.isDir) toggleDir(entry.path);
    else openFile(entry.path, { focus: focusEditor });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (state.edit) return;
    const i = indexOf(state.selected);
    const entryRows = rows.map((r, idx) => (r.kind === "entry" ? idx : -1)).filter((x) => x >= 0);
    const pos = entryRows.indexOf(i);
    const select = (idx: number | undefined) => {
      const r = idx !== undefined ? rows[idx] : undefined;
      if (r?.kind === "entry") selectInExplorer(r.entry.path);
    };
    const ctrl = e.ctrlKey || e.metaKey;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        select(entryRows[Math.min(entryRows.length - 1, pos + 1)]);
        break;
      case "ArrowUp":
        e.preventDefault();
        select(entryRows[Math.max(0, pos - 1)]);
        break;
      case "Home":
        e.preventDefault();
        select(entryRows[0]);
        break;
      case "End":
        e.preventDefault();
        select(entryRows[entryRows.length - 1]);
        break;
      case "ArrowRight":
        e.preventDefault();
        if (selectedEntry?.isDir) {
          if (!state.expanded[dirKey(selectedEntry.path)]) toggleDir(selectedEntry.path, true);
          else select(entryRows[pos + 1]);
        }
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (selectedEntry?.isDir && state.expanded[dirKey(selectedEntry.path)]) toggleDir(selectedEntry.path, false);
        else if (selectedEntry && !samePath(dirname(selectedEntry.path), root)) selectInExplorer(dirname(selectedEntry.path));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedEntry) activate(selectedEntry, !selectedEntry.isDir);
        break;
      case "F2":
        e.preventDefault();
        if (selectedEntry) setInlineEdit({ kind: "rename", target: selectedEntry.path });
        break;
      case "Delete":
        e.preventDefault();
        if (selectedEntry) deleteEntries([selectedEntry.path]);
        break;
      case "Escape":
        if (state.clipboard?.cut) explorerStore.update({ clipboard: null });
        break;
      default:
        if (ctrl && e.key.toLowerCase() === "c" && selectedEntry) {
          e.preventDefault();
          setExplorerClipboard([selectedEntry.path], false);
        } else if (ctrl && e.key.toLowerCase() === "x" && selectedEntry) {
          e.preventDefault();
          setExplorerClipboard([selectedEntry.path], true);
        } else if (ctrl && e.key.toLowerCase() === "v") {
          e.preventDefault();
          pasteEntries(targetDirFor(selectedEntry));
        }
    }
  };

  // Pointer-driven drag & drop for moving files between folders.
  const onPointerMove = (e: React.PointerEvent) => {
    const start = dragStart.current;
    if (!start) return;
    if (!drag && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 5) return;
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-row-path]");
    let target: string | null = null;
    if (el) {
      const path = el.dataset.rowPath!;
      target = el.dataset.isDir === "true" ? path : dirname(path);
    } else if (listRef.current?.contains(document.elementFromPoint(e.clientX, e.clientY))) {
      target = root;
    }
    if (target && (isWithin(target, start.path) || samePath(dirname(start.path), target))) target = null;
    setDrag({ paths: [start.path], x: e.clientX, y: e.clientY, target });
  };
  const onPointerUp = () => {
    if (drag) {
      justDragged.current = true;
      setTimeout(() => (justDragged.current = false), 0);
    }
    if (drag?.target) moveEntries(drag.paths, drag.target);
    dragStart.current = null;
    setDrag(null);
  };

  const first = Math.max(0, Math.floor(scrollTop / rowH) - 8);
  const last = Math.min(rows.length, Math.ceil((scrollTop + viewH) / rowH) + 8);
  const cutPaths = state.clipboard?.cut ? state.clipboard.paths : [];

  return (
    <div className="explorer">
      <div className="sidebar-section-header">
        <span className="sidebar-section-title" title={root}>
          {basename(root)}
        </span>
        <div className="sidebar-actions">
          <IconButton icon="new-file" label="New File…" onClick={() => setInlineEdit({ kind: "new-file", parent: targetDirFor(selectedEntry) })} />
          <IconButton icon="new-folder" label="New Folder…" onClick={() => setInlineEdit({ kind: "new-folder", parent: targetDirFor(selectedEntry) })} />
          <IconButton icon="refresh" label="Refresh Explorer" onClick={refreshExplorer} />
          <IconButton icon="collapse-all" label="Collapse Folders" onClick={collapseAll} />
        </div>
      </div>
      <div
        ref={listRef}
        className={`tree ${focused ? "focused" : ""} ${drag?.target && samePath(drag.target, root) ? "drop-root" : ""}`}
        role="tree"
        aria-label="Files"
        tabIndex={0}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onContextMenu={(e) => openContextMenu(e, menuFor(null))}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          dragStart.current = null;
          setDrag(null);
        }}
        style={{ ["--row-h" as string]: `${rowH}px` }}
      >
        <div className="tree-inner" style={{ height: rows.length * rowH }}>
          {rows.slice(first, last).map((row, k) => {
            const i = first + k;
            const style = { transform: `translateY(${i * rowH}px)`, paddingLeft: 8 + row.depth * 14 };
            if (row.kind === "message") {
              return (
                <div key={`m-${i}`} className={`tree-row message ${row.error ? "error" : ""}`} style={style} title={row.text}>
                  {row.text}
                </div>
              );
            }
            if (row.kind === "edit") {
              return (
                <div key="edit" className="tree-row editing" style={style}>
                  <span className="tree-twisty" />
                  <FileIcon name={row.initial || (row.isDir ? "folder" : "untitled")} isDir={row.isDir} />
                  <InlineInput row={row} onDone={() => setInlineEdit(null)} />
                </div>
              );
            }
            const { entry, expanded } = row;
            const selected = !!state.selected && samePath(state.selected, entry.path);
            const isActive = !!activePath && samePath(activePath, entry.path);
            const dropTarget = !!drag?.target && entry.isDir && samePath(drag.target, entry.path);
            return (
              <div
                key={entry.path}
                role="treeitem"
                aria-level={row.depth + 1}
                aria-expanded={entry.isDir ? expanded : undefined}
                aria-selected={selected}
                data-row-path={entry.path}
                data-is-dir={entry.isDir}
                className={`tree-row ${selected ? "selected" : ""} ${isActive ? "active-file" : ""} ${dropTarget ? "drop-target" : ""} ${cutPaths.some((p) => samePath(p, entry.path)) ? "cut" : ""}`}
                style={style}
                title={entry.path}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  dragStart.current = { path: entry.path, x: e.clientX, y: e.clientY };
                }}
                onClick={() => !justDragged.current && activate(entry)}
                onDoubleClick={() => !entry.isDir && openFile(entry.path, { focus: true })}
                onContextMenu={(e) => {
                  e.stopPropagation();
                  selectInExplorer(entry.path);
                  openContextMenu(e, menuFor(entry));
                }}
              >
                {Array.from({ length: row.depth }, (_, d) => (
                  <span key={d} className="tree-guide" style={{ left: 8 + d * 14 + 7 }} />
                ))}
                <span className={`tree-twisty ${entry.isDir ? (expanded ? "open" : "") : "leaf"}`}>
                  {entry.isDir && <Icon name="chevron-right" size={14} />}
                </span>
                <FileIcon name={entry.name} isDir={entry.isDir} open={expanded} />
                <span className="tree-label">{entry.name}</span>
                {entry.isSymlink && <span className="tree-meta">↪</span>}
              </div>
            );
          })}
        </div>
      </div>
      {drag && (
        <div className="drag-ghost" style={{ left: drag.x + 12, top: drag.y + 8 }}>
          {basename(drag.paths[0])}
          {drag.target ? <span className="drag-ghost-target"> → {basename(drag.target)}</span> : null}
        </div>
      )}
    </div>
  );
}
