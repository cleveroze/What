import { useState } from "react";
import { bindingFor } from "../../commands/registry";
import { formatBinding } from "../../lib/keys";
import { useStore } from "../../lib/store";
import { clearOutput } from "../../state/output";
import { problemsStore } from "../../state/problems";
import {
  clearTerminal,
  closeTerminal,
  createTerminal,
  loadShells,
  setActiveTerminal,
  terminalStore,
} from "../../state/terminals";
import { openContextMenu, openMenuAt } from "../../state/ui";
import { setLayout, workspaceStore, type PanelTab } from "../../state/workspace";
import { Icon } from "../Icon";
import { IconButton } from "../ui/controls";
import { OutputView } from "./OutputView";
import { ProblemsView } from "./ProblemsView";
import { TerminalView } from "./TerminalView";

const TABS: { id: PanelTab; label: string; command: string }[] = [
  { id: "problems", label: "Problems", command: "view.problems" },
  { id: "output", label: "Output", command: "view.output" },
  { id: "terminal", label: "Terminal", command: "terminal.toggle" },
];

export function Panel() {
  const layout = useStore(workspaceStore, (s) => s.layout);
  const counts = useStore(problemsStore, (s) => s.errors + s.warnings);
  const sessions = useStore(terminalStore, (s) => s.sessions);
  const activeTerm = useStore(terminalStore, (s) => s.activeId);
  const [filter, setFilter] = useState("");
  const tab = layout.panelTab;
  const tabIndex = TABS.findIndex((t) => t.id === tab);

  const shellMenu = async (e: React.MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    const shells = await loadShells();
    openMenuAt(r.left - 160, r.bottom + 4, [
      ...shells.map((s) => ({ label: s.name, run: () => createTerminal(s.id) })),
      "separator" as const,
      { label: "Select Default Shell…", run: () => import("../../commands/builtin").then((m) => m.selectDefaultShell()) },
    ]);
  };

  return (
    <section className="panel sheet" aria-label="Panel">
      <div className="panel-header">
        <div className="panel-tabs" role="tablist" style={{ ["--tab-index" as string]: tabIndex }}>
          {TABS.map((t) => {
            const key = bindingFor(t.command);
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`panel-tab ${tab === t.id ? "active" : ""}`}
                title={key ? `${t.label} (${formatBinding(key)})` : t.label}
                onClick={() => setLayout({ panelTab: t.id })}
              >
                {t.label}
                {t.id === "problems" && counts > 0 && <span className="count-badge">{counts}</span>}
              </button>
            );
          })}
        </div>
        <div className="panel-actions">
          {tab === "problems" && (
            <input className="text-field panel-filter" placeholder="Filter (e.g. text, file name)" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter problems" />
          )}
          {tab === "output" && <IconButton icon="clear" label="Clear Output" onClick={clearOutput} />}
          {tab === "terminal" && (
            <>
              <IconButton icon="plus" label="New Terminal (Ctrl+Shift+`)" onClick={() => createTerminal()} />
              <IconButton icon="chevron-down" label="Launch Profile…" onClick={shellMenu} />
              <IconButton icon="clear" label="Clear Terminal" onClick={() => clearTerminal()} disabled={!activeTerm} />
              <IconButton icon="kill" label="Kill Terminal" onClick={() => activeTerm && closeTerminal(activeTerm)} disabled={!activeTerm} />
            </>
          )}
          <span className="panel-actions-sep" />
          <IconButton
            icon={layout.panelMaximized ? "restore" : "maximize"}
            label={layout.panelMaximized ? "Restore Panel Size" : "Maximize Panel Size"}
            onClick={() => setLayout({ panelMaximized: !layout.panelMaximized })}
          />
          <IconButton icon="close" label="Hide Panel (Ctrl+J)" onClick={() => setLayout({ panelVisible: false })} />
        </div>
      </div>
      <div className="panel-body">
        <div className="panel-content" hidden={tab !== "problems"}>
          {tab === "problems" && <ProblemsView filter={filter} />}
        </div>
        <div className="panel-content" hidden={tab !== "output"}>
          {tab === "output" && <OutputView />}
        </div>
        <div className="panel-content terminal-layout" hidden={tab !== "terminal"}>
          <TerminalView visible={tab === "terminal" && layout.panelVisible} />
          {sessions.length > 1 && (
            <ul className="terminal-list" role="listbox" aria-label="Terminals">
              {sessions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={s.id === activeTerm}
                    className={`terminal-item ${s.id === activeTerm ? "active" : ""} ${s.exited ? "exited" : ""}`}
                    onClick={() => setActiveTerminal(s.id)}
                    onContextMenu={(e) =>
                      openContextMenu(e, [
                        { label: "Clear", run: () => clearTerminal(s.id) },
                        { label: "Kill Terminal", danger: true, run: () => closeTerminal(s.id) },
                      ])
                    }
                    title={`${s.shell.path}${s.cwd ? ` — ${s.cwd}` : ""}`}
                  >
                    <Icon name="terminal" size={14} />
                    <span>{s.title}</span>
                    <span
                      className="terminal-item-close"
                      role="button"
                      aria-label={`Kill ${s.title}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTerminal(s.id);
                      }}
                    >
                      <Icon name="close" size={12} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
