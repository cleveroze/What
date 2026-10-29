import { useMemo, useState } from "react";
import { useStore } from "../../lib/store";
import { activateTab, getActiveEditor, revealInDoc, tabIdForDoc } from "../../state/editors";
import { problemsStore, type Problem } from "../../state/problems";
import { FileIcon } from "../FileIcon";
import { EmptyState } from "../EmptyState";
import { Icon } from "../Icon";

function open(p: Problem) {
  activateTab(tabIdForDoc(p.docId));
  revealInDoc(p.docId, { line: p.line, column: p.column, endLine: p.endLine, endColumn: p.endColumn, focus: true });
  getActiveEditor()?.focus();
}

export function ProblemsView({ filter }: { filter: string }) {
  const items = useStore(problemsStore, (s) => s.items);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const groups = useMemo(() => {
    const f = filter.toLowerCase();
    const map = new Map<string, { name: string; path: string | null; items: Problem[] }>();
    for (const p of items) {
      if (f && !p.message.toLowerCase().includes(f) && !p.name.toLowerCase().includes(f)) continue;
      const g = map.get(p.docId) ?? { name: p.name, path: p.path, items: [] };
      g.items.push(p);
      map.set(p.docId, g);
    }
    return [...map.entries()];
  }, [items, filter]);

  if (!groups.length) {
    return (
      <div className="panel-empty">
        {items.length ? (
          <EmptyState shape="clover4" icon="search" title="Nothing matches the filter" size={52}>
            Try a different word or clear the filter.
          </EmptyState>
        ) : (
          <EmptyState shape="flower" icon="check" title="No problems — nice work!" size={52}>
            Errors and warnings from your open files will show up here.
          </EmptyState>
        )}
      </div>
    );
  }
  return (
    <div className="problems-view" role="tree" aria-label="Problems">
      {groups.map(([docId, g]) => (
        <div key={docId} role="treeitem" aria-expanded={!collapsed[docId]}>
          <button type="button" className="problem-file" onClick={() => setCollapsed((c) => ({ ...c, [docId]: !c[docId] }))} title={g.path ?? g.name}>
            <span className={`tree-twisty ${collapsed[docId] ? "" : "open"}`}>
              <Icon name="chevron-right" size={14} />
            </span>
            <FileIcon name={g.name} />
            <span className="problem-file-name">{g.name}</span>
            <span className="problem-file-dir">{g.path ?? ""}</span>
            <span className="count-badge">{g.items.length}</span>
          </button>
          {!collapsed[docId] &&
            g.items.map((p, i) => (
              <button type="button" key={i} className="problem-row" onClick={() => open(p)}>
                <Icon name={p.severity} size={14} className={`sev-${p.severity}`} />
                <span className="problem-msg">{p.message}</span>
                {p.source && <span className="problem-src">{p.source}{p.code ? `(${p.code})` : ""}</span>}
                <span className="problem-pos">
                  [Ln {p.line}, Col {p.column}]
                </span>
              </button>
            ))}
        </div>
      ))}
    </div>
  );
}
