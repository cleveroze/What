import { runCommand } from "../commands/registry";
import { languageName } from "../editor/monaco";
import { ENCODING_LABELS } from "../ipc/native";
import { formatBinding } from "../lib/keys";
import { basename } from "../lib/path";
import { useStore } from "../lib/store";
import { chordStore } from "../commands/registry";
import { activeDoc, cursorStore, editorStore } from "../state/editors";
import { problemsStore } from "../state/problems";
import { settingsStore } from "../state/settings";
import { terminalStore } from "../state/terminals";
import { showPanel, workspaceStore } from "../state/workspace";
import { Icon } from "./Icon";

function Item({ children, onClick, title, className }: { children: React.ReactNode; onClick?: () => void; title: string; className?: string }) {
  return (
    <button type="button" className={`status-item ${className ?? ""}`} onClick={onClick} title={title} aria-label={title}>
      {children}
    </button>
  );
}

export function StatusBar() {
  const doc = useStore(editorStore, () => activeDoc());
  const cursor = useStore(cursorStore, (s) => s);
  const problems = useStore(problemsStore, (s) => s);
  const root = useStore(workspaceStore, (s) => s.root);
  const autoSave = useStore(settingsStore, (s) => s["files.autoSave"]);
  const terms = useStore(terminalStore, (s) => s.sessions.filter((x) => !x.exited).length);
  const chord = useStore(chordStore, (s) => s.pending);

  return (
    <footer className="statusbar" role="status">
      <div className="status-left">
        {root && (
          <Item title={`Folder: ${root}`} onClick={() => runCommand("file.openRecent")} className="status-folder">
            <Icon name="folder" size={13} />
            <span>{basename(root)}</span>
          </Item>
        )}
        <Item title="Problems (Ctrl+Shift+M)" onClick={() => showPanel("problems", true)}>
          <Icon name="error" size={13} />
          <span>{problems.errors}</span>
          <Icon name="warning" size={13} />
          <span>{problems.warnings}</span>
        </Item>
        {terms > 0 && (
          <Item title="Toggle Terminal" onClick={() => runCommand("terminal.toggle")}>
            <Icon name="terminal" size={13} />
            <span>{terms}</span>
          </Item>
        )}
        {chord && <span className="status-chord">({formatBinding(chord)}) was pressed. Waiting for second key of chord…</span>}
      </div>
      <div className="status-right">
        {doc && (
          <>
            <Item title="Go to Line/Column (Ctrl+G)" onClick={() => runCommand("edit.gotoLine")}>
              Ln {cursor.line}, Col {cursor.column}
              {cursor.selectedChars > 0 && ` (${cursor.selectedChars} selected)`}
              {cursor.selections > 1 && ` · ${cursor.selections} selections`}
            </Item>
            <Item title="Select Indentation" onClick={() => runCommand("editor.changeIndentation")}>
              {cursor.insertSpaces ? "Spaces" : "Tab Size"}: {cursor.tabSize}
            </Item>
            <Item title="Select Encoding" onClick={() => runCommand("editor.changeEncoding")}>
              {ENCODING_LABELS[doc.encoding]}
            </Item>
            <Item title="Select End of Line Sequence" onClick={() => runCommand("editor.changeEol")}>
              {doc.eol}
            </Item>
            <Item title="Select Language Mode" onClick={() => runCommand("editor.changeLanguage")}>
              {languageName(doc.language)}
            </Item>
          </>
        )}
        {autoSave !== "off" && (
          <Item title="Auto Save is on — click to configure" onClick={() => import("../state/editors").then((m) => m.openSettingsTab("files"))}>
            <Icon name="check" size={13} />
            <span>Auto Save</span>
          </Item>
        )}
      </div>
    </footer>
  );
}
