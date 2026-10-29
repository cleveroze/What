import { useEffect, useRef, useState } from "react";
import { fs } from "../../ipc/native";
import { useStore } from "../../lib/store";
import {
  activateTab,
  closeAllTabs,
  closeOtherTabs,
  closeSavedTabs,
  closeTab,
  closeTabsToRight,
  editorStore,
  moveTab,
  type Tab,
} from "../../state/editors";
import { problemsStore } from "../../state/problems";
import { openContextMenu, openMenuAt } from "../../state/ui";
import { revealInExplorer } from "../../state/workspace";
import { FileIcon } from "../FileIcon";
import { Icon } from "../Icon";

interface DragState {
  from: number;
  startX: number;
  dx: number;
  to: number;
  rects: DOMRect[];
  active: boolean;
}

export function Tabs() {
  const tabs = useStore(editorStore, (s) => s.tabs);
  const docs = useStore(editorStore, (s) => s.docs);
  const activeId = useStore(editorStore, (s) => s.activeTabId);
  const problems = useStore(problemsStore, (s) => s.items);
  const stripRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>(".tab.active");
    el?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [activeId, tabs.length]);

  const labelFor = (tab: Tab) => (tab.kind === "settings" ? "Settings" : docs[tab.docId]?.name ?? "");

  const menuFor = (tab: Tab, i: number) => {
    const doc = tab.kind === "doc" ? docs[tab.docId] : null;
    return [
      { label: "Close", keybinding: "ctrl+w", run: () => closeTab(tab.id) },
      { label: "Close Others", disabled: tabs.length < 2, run: () => closeOtherTabs(tab.id) },
      { label: "Close to the Right", disabled: i === tabs.length - 1, run: () => closeTabsToRight(tab.id) },
      { label: "Close Saved", run: closeSavedTabs },
      { label: "Close All", run: () => closeAllTabs() },
      "separator" as const,
      { label: "Copy Path", disabled: !doc?.path, run: () => doc?.path && navigator.clipboard.writeText(doc.path) },
      { label: "Reveal in Explorer View", disabled: !doc?.path, run: () => doc?.path && revealInExplorer(doc.path) },
      { label: "Reveal in File Explorer", disabled: !doc?.path, run: () => doc?.path && fs.reveal(doc.path) },
    ];
  };

  const onPointerDown = (e: React.PointerEvent, i: number, tab: Tab) => {
    if (e.button === 1) {
      e.preventDefault();
      closeTab(tab.id);
      return;
    }
    if (e.button !== 0 || (e.target as Element).closest(".tab-close")) return;
    activateTab(tab.id);
    const rects = [...(stripRef.current?.querySelectorAll<HTMLElement>(".tab") ?? [])].map((el) => el.getBoundingClientRect());
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ from: i, startX: e.clientX, dx: 0, to: i, rects, active: false });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (!d.active && Math.abs(dx) < 5) return;
    const self = d.rects[d.from];
    const center = self.left + self.width / 2 + dx;
    let to = 0;
    d.rects.forEach((r, j) => {
      if (j !== d.from && r.left + r.width / 2 < center) to++;
    });
    setDrag({ ...d, dx, to, active: true });
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    if (d?.active && d.to !== d.from) moveTab(d.from, d.to);
    setDrag(null);
  };

  const shiftFor = (j: number) => {
    if (!drag?.active) return 0;
    const w = drag.rects[drag.from].width;
    if (j === drag.from) return drag.dx;
    if (drag.from < drag.to && j > drag.from && j <= drag.to) return -w;
    if (drag.from > drag.to && j >= drag.to && j < drag.from) return w;
    return 0;
  };

  return (
    <div className="tabs-bar">
      <div
        ref={stripRef}
        className={`tabs ${drag?.active ? "dragging" : ""}`}
        role="tablist"
        aria-label="Open editors"
        onWheel={(e) => {
          if (e.deltaY && stripRef.current) stripRef.current.scrollLeft += e.deltaY;
        }}
      >
        {tabs.map((tab, i) => {
          const doc = tab.kind === "doc" ? docs[tab.docId] : null;
          const active = tab.id === activeId;
          const errors = doc ? problems.filter((p) => p.docId === doc.id && p.severity === "error").length : 0;
          const shift = shiftFor(i);
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              className={`tab ${active ? "active" : ""} ${doc?.dirty ? "dirty" : ""} ${doc?.orphaned ? "orphaned" : ""} ${drag?.active && drag.from === i ? "lifted" : ""}`}
              style={shift ? { transform: `translateX(${shift}px)` } : undefined}
              title={doc?.path ?? labelFor(tab)}
              onPointerDown={(e) => onPointerDown(e, i, tab)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => setDrag(null)}
              onAuxClick={(e) => e.button === 1 && e.preventDefault()}
              onContextMenu={(e) => openContextMenu(e, menuFor(tab, i))}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                  const next = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
                  activateTab(next.id);
                  (e.currentTarget.parentElement?.children[tabs.indexOf(next)] as HTMLElement)?.focus();
                }
                if (e.key === "Delete") closeTab(tab.id);
              }}
            >
              {tab.kind === "settings" ? <Icon name="settings" size={14} className="tab-icon" /> : <FileIcon name={doc?.name ?? ""} />}
              <span className={`tab-label ${errors ? "has-errors" : ""}`}>{labelFor(tab)}</span>
              {doc?.orphaned && <span className="tab-deleted">deleted</span>}
              <button
                type="button"
                className="tab-close"
                aria-label={`Close ${labelFor(tab)}`}
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                <span className="tab-dirty-dot" aria-hidden />
                <Icon name="close" size={14} />
              </button>
            </div>
          );
        })}
      </div>
      {tabs.length > 0 && (
        <div className="tabs-actions">
          <button
            type="button"
            className="icon-btn"
            aria-label="Editor actions"
            title="More actions"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              openMenuAt(r.right - 200, r.bottom + 4, [
                { label: "Close All", run: () => closeAllTabs() },
                { label: "Close Saved", run: closeSavedTabs },
              ]);
            }}
          >
            <Icon name="more" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
