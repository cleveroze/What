/** User-facing file operations used by the explorer, palette and menus. */
import { fs } from "../ipc/native";
import { basename, dirname, isWithin, join, samePath } from "../lib/path";
import { handlePathDeleted, handlePathRenamed, openFile } from "./editors";
import { log } from "./output";
import { getSetting } from "./settings";
import { confirm, reportError } from "./ui";
import { explorerStore, loadDir, revealInExplorer, selectInExplorer, workspaceStore } from "./workspace";

const INVALID_NAME = /[<>:"|?*\u0000-\u001f]/;

export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "A name must be provided.";
  if (INVALID_NAME.test(trimmed)) return 'Names cannot contain < > : " | ? * or control characters.';
  if (/[. ]$/.test(trimmed)) return "Names cannot end with a dot or space.";
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(trimmed)) return `'${trimmed}' is a reserved name on Windows.`;
  return null;
}

/** `name` may contain sub-folders ("src/util.ts"), which are created too. */
export async function createEntry(parent: string, name: string, kind: "file" | "folder") {
  const rel = name.trim().replace(/[\\/]+/g, parent.includes("\\") ? "\\" : "/");
  const target = join(parent, rel);
  try {
    if (kind === "folder") {
      await fs.createDir(target);
    } else {
      const dir = dirname(target);
      if (!samePath(dir, parent)) {
        const st = await fs.stat(dir);
        if (!st.exists) await fs.createDir(dir);
      }
      await fs.createFile(target);
    }
    log(`Created ${target}`);
    await loadDir(parent);
    if (!samePath(dirname(target), parent)) await loadDir(dirname(target));
    await revealInExplorer(target);
    if (kind === "file") await openFile(target);
  } catch (e) {
    reportError(`Cannot create ${kind}`, e);
  }
}

export async function renameEntry(path: string, newName: string) {
  const target = join(dirname(path), newName.trim());
  if (target === path) return;
  try {
    await fs.rename(path, target);
    log(`Renamed ${path} → ${target}`);
    handlePathRenamed(path, target);
    await loadDir(dirname(path));
    selectInExplorer(target);
  } catch (e) {
    reportError("Rename failed", e);
  }
}

export async function moveEntries(paths: string[], targetDir: string) {
  const movable = paths.filter((p) => !samePath(dirname(p), targetDir) && !isWithin(targetDir, p));
  if (!movable.length) return;
  if (getSetting("files.confirmDragAndDrop")) {
    const what = movable.length === 1 ? `'${basename(movable[0])}'` : `${movable.length} items`;
    const ok = await confirm("Move items", `Move ${what} into '${basename(targetDir)}'?`, "Move");
    if (!ok) return;
  }
  for (const p of movable) {
    const dest = join(targetDir, basename(p));
    try {
      await fs.rename(p, dest);
      log(`Moved ${p} → ${dest}`);
      handlePathRenamed(p, dest);
      await loadDir(dirname(p));
    } catch (e) {
      reportError(`Cannot move ${basename(p)}`, e);
    }
  }
  await loadDir(targetDir);
}

export async function deleteEntries(paths: string[]) {
  if (!paths.length) return;
  const useTrash = getSetting("files.useTrash");
  if (getSetting("files.confirmDelete")) {
    const what = paths.length === 1 ? `'${basename(paths[0])}'` : `${paths.length} items`;
    const ok = await confirm(
      "Delete",
      useTrash
        ? `Move ${what} to the Recycle Bin?`
        : `Permanently delete ${what}? This cannot be undone.`,
      useTrash ? "Move to Recycle Bin" : "Delete",
      true,
    );
    if (!ok) return;
  }
  for (const p of paths) {
    try {
      await fs.delete(p, useTrash);
      log(`Deleted ${p}${useTrash ? " (Recycle Bin)" : ""}`);
      handlePathDeleted(p);
      await loadDir(dirname(p));
    } catch (e) {
      reportError(`Cannot delete ${basename(p)}`, e);
    }
  }
  selectInExplorer(null);
}

export async function pasteEntries(targetDir: string) {
  const clip = explorerStore.get().clipboard;
  if (!clip) return;
  if (clip.cut) {
    for (const p of clip.paths) {
      const dest = join(targetDir, basename(p));
      if (samePath(p, dest)) continue;
      try {
        await fs.rename(p, dest);
        handlePathRenamed(p, dest);
        await loadDir(dirname(p));
      } catch (e) {
        reportError(`Cannot move ${basename(p)}`, e);
      }
    }
    explorerStore.update({ clipboard: null });
  } else {
    for (const p of clip.paths) {
      try {
        const dest = await fs.copy(p, join(targetDir, basename(p)));
        log(`Copied ${p} → ${dest}`);
      } catch (e) {
        reportError(`Cannot copy ${basename(p)}`, e);
      }
    }
  }
  await loadDir(targetDir);
}

export async function duplicateEntry(path: string) {
  try {
    const dest = await fs.copy(path, path);
    await loadDir(dirname(path));
    selectInExplorer(dest);
  } catch (e) {
    reportError("Cannot duplicate", e);
  }
}

export async function copyPathToClipboard(path: string, relativeToRoot: boolean) {
  const root = workspaceStore.get().root;
  let text = path;
  if (relativeToRoot && root && isWithin(path, root)) {
    text = path.slice(root.replace(/[\\/]+$/, "").length).replace(/^[\\/]+/, "");
  }
  await navigator.clipboard.writeText(text);
}
