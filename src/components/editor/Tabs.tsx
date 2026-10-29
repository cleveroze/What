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
  savedStore,
  type Tab,
} from "../../state/editors";
import { problemsStore } from "../../state/problems";
import { runKind, runnerLabel } from "../../state/run";
import { bindingFor, runCommand } from "../../commands/registry";
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
  const activeDocMeta = useStore(editorStore, (s) => {
    const t = s.tabs.find((x) => x.id === s.activeTabId);
    return t?.kind === "doc" ? s.docs[t.docId] ?? null : null;
  });
  const stripRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [closing, setClosing] = useState<string[]>([]);
  const saved = useStore(savedStore, (x) => x);
  const [now, setNow] = useState(0);
  useEffect(() => {
    // Re-render once the save confirmation should disappear.
    if (!saved.at) return;
    setNow(Date.now());
    const t = setTimeout(() => setNow(Date.now()), 1300);
    return () => clearTimeout(t);
  }, [saved.at]);

  /** Clean tabs collapse away first; dirty ones go straight to the prompt. */
  const animatedClose = (tab: Tab) => {
    const doc = tab.kind === "doc" ? docs[tab.docId] : null;
    if (doc?.dirty || document.documentElement.dataset.animation === "off") {
      closeTab(tab.id);
      return;
    }
    setClosing((c) => [...c, tab.id]);
    setTimeout(() => {
      closeTab(tab.id).finally(() => setClosing((c) => c.filter((id) => id !== tab.id)));
    }, 170);
  };
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
      { label: "Close", keybinding: "ctrl+w", run: () => animatedClose(tab) },
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
      animatedClose(tab);
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
    // Insert where the pointer is, relative to the other tabs' centers.
    let to = 0;
    d.rects.forEach((r, j) => {
      if (j !== d.from && r.left + r.width / 2 < e.clientX) to++;
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
          const justSaved = !!doc && saved.docId === doc.id && now - saved.at < 1200;
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              className={`tab ${active ? "active" : ""} ${doc?.dirty ? "dirty" : ""} ${doc?.orphaned ? "orphaned" : ""} ${drag?.active && drag.from === i ? "lifted" : ""} ${closing.includes(tab.id) ? "closing" : ""} ${justSaved ? "just-saved" : ""}`}
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
                if (e.key === "Delete") animatedClose(tab);
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
                  animatedClose(tab);
                }}
              >
                <span className="tab-dirty-dot" aria-hidden />
                <Icon name="close" size={14} className="tab-close-x" />
                {justSaved && <Icon key={saved.at} name="check" size={14} className="tab-saved-check" />}
              </button>
            </div>
          );
        })}
      </div>
      {tabs.length > 0 && (
        <div className="tabs-actions">
          {activeDocMeta && runKind(activeDocMeta) === "preview" && (
            <button type="button" className="run-btn secondary" onClick={() => runCommand("run.openInBrowser")} data-tip="Open in browser" data-tip-desc="Opens this page in your default web browser." data-tip-keys={bindingFor("run.openInBrowser")}>
              <Icon name="external" size={14} />
            </button>
          )}
          {activeDocMeta && runKind(activeDocMeta) && (
            <button
              type="button"
              className="run-btn"
              onClick={() => runCommand("run.file")}
              data-tip={runKind(activeDocMeta) === "preview" ? "Show live preview" : "Run this file"}
              data-tip-desc={
                runKind(activeDocMeta) === "preview"
                  ? "Shows the page next to your code and refreshes it every time you save."
                  : `Saves the file and runs it in the terminal${runnerLabel(activeDocMeta) ? ` with ${runnerLabel(activeDocMeta)}` : ""}. The tool must be installed on your PC.`
              }
              data-tip-keys={bindingFor("run.file")}
            >
              <Icon name={runKind(activeDocMeta) === "preview" ? "eye" : "play"} size={13} />
              <span>{runKind(activeDocMeta) === "preview" ? "Preview" : "Run"}</span>
            </button>
          )}
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
