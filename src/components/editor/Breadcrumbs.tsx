import { fs } from "../../ipc/native";
import { dirname, isWithin, join, relative, segments } from "../../lib/path";
import { useStore } from "../../lib/store";
import { activeDoc, editorStore, openFile } from "../../state/editors";
import { openMenuAt, type MenuEntry } from "../../state/ui";
import { revealInExplorer, workspaceStore } from "../../state/workspace";
import { FileIcon } from "../FileIcon";
import { Icon } from "../Icon";

/** Path breadcrumbs; each segment opens a menu listing that folder's real
 * contents for quick navigation. */
export function Breadcrumbs() {
  const root = useStore(workspaceStore, (s) => s.root);
  const path = useStore(editorStore, () => activeDoc()?.path ?? null);
  const name = useStore(editorStore, () => activeDoc()?.name ?? null);
  if (!name) return <div className="breadcrumbs" />;

  const inRoot = !!(path && root && isWithin(path, root));
  const base = inRoot ? root! : path ? dirname(path) : "";
  const parts = path ? (inRoot ? segments(relative(root!, path)) : [name]) : [name];
  const rootName = inRoot ? segments(root!).pop() : null;

  const open = async (e: React.MouseEvent, dir: string) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    try {
      const entries = await fs.readDir(dir);
      const items: MenuEntry[] = entries.slice(0, 200).map((en) => ({
        label: en.isDir ? `${en.name}/` : en.name,
        run: () => (en.isDir ? revealInExplorer(en.path) : openFile(en.path)),
      }));
      openMenuAt(r.left, r.bottom + 2, items.length ? items : [{ label: "Empty folder", disabled: true }]);
    } catch {
      /* folder vanished; nothing to show */
    }
  };

  const crumbs: { label: string; dir: string; isFile: boolean }[] = [];
  if (rootName) crumbs.push({ label: rootName, dir: dirname(root!), isFile: false });
  let acc = base;
  parts.forEach((p, i) => {
    const isFile = i === parts.length - 1;
    crumbs.push({ label: p, dir: acc, isFile });
    acc = join(acc, p);
  });

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumbs">
      {crumbs.map((c, i) => (
        <span key={i} className="crumb-wrap">
          {i > 0 && <Icon name="chevron-right" size={12} className="crumb-sep" />}
          <button type="button" className={`crumb ${c.isFile ? "file" : ""}`} disabled={!path} onClick={(e) => path && open(e, c.dir)}>
            {c.isFile && <FileIcon name={c.label} />}
            <span>{c.label}</span>
          </button>
        </span>
      ))}
    </nav>
  );
}
