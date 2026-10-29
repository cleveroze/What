import { pickOpenFiles, pickOpenFolder } from "../../commands/builtin";
import { bindingFor, runCommand } from "../../commands/registry";
import { dirname } from "../../lib/path";
import { useStore } from "../../lib/store";
import { newUntitled, openSettingsTab } from "../../state/editors";
import { openContextMenu } from "../../state/ui";
import { openFolder, removeRecent, workspaceStore } from "../../state/workspace";
import { Icon } from "../Icon";
import { Kbd } from "../ui/controls";

export function Welcome() {
  const recent = useStore(workspaceStore, (s) => s.recent);
  const root = useStore(workspaceStore, (s) => s.root);
  const hints: [string, string][] = [
    ["Show all commands", "workbench.commandPalette"],
    ["Go to file", "workbench.quickOpen"],
    ["Find in files", "edit.findInFiles"],
    ["Toggle terminal", "terminal.toggle"],
    ["Open settings", "settings.open"],
  ];
  return (
    <div className="welcome">
      <div className="welcome-inner">
        <div className="welcome-brand">
          <svg viewBox="0 0 1024 1024" width="56" height="56" aria-hidden>
            <path d="M512 64c260 0 448 56 448 448s-188 448-448 448S64 904 64 512 252 64 512 64z" fill="var(--accent-soft)" />
            <path d="M300 330 L512 720 L724 330" fill="none" stroke="var(--accent)" strokeWidth="96" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>
            <h1>Verso</h1>
            <p>{root ? "Open a file from the explorer or press Ctrl+P to jump to one." : "Editing, evolved. Open a folder to get started."}</p>
          </div>
        </div>
        <div className="welcome-grid">
          <section>
            <h2>Start</h2>
            <button type="button" className="welcome-action" onClick={() => newUntitled()}>
              <Icon name="new-file" /> New File <Kbd binding={bindingFor("file.newFile")} />
            </button>
            <button type="button" className="welcome-action" onClick={pickOpenFiles}>
              <Icon name="file" /> Open File… <Kbd binding={bindingFor("file.open")} />
            </button>
            <button type="button" className="welcome-action" onClick={pickOpenFolder}>
              <Icon name="folder-open" /> Open Folder… <Kbd binding={bindingFor("file.openFolder")} />
            </button>
            <button type="button" className="welcome-action" onClick={() => openSettingsTab("appearance")}>
              <Icon name="palette" /> Customize Appearance
            </button>
          </section>
          <section>
            <h2>Recent</h2>
            {recent.length === 0 && <p className="muted">Folders you open will appear here.</p>}
            {recent.slice(0, 7).map((r) => (
              <button
                type="button"
                key={r.path}
                className="welcome-recent"
                title={r.path}
                onClick={() => openFolder(r.path)}
                onContextMenu={(e) => openContextMenu(e, [{ label: "Remove from Recent", run: () => removeRecent(r.path) }])}
              >
                <span className="welcome-recent-name">{r.name}</span>
                <span className="welcome-recent-path">{dirname(r.path)}</span>
              </button>
            ))}
          </section>
        </div>
        <div className="welcome-hints">
          {hints.map(([label, id]) => (
            <button type="button" key={id} className="welcome-hint" onClick={() => runCommand(id)}>
              <span>{label}</span>
              <Kbd binding={bindingFor(id)} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
