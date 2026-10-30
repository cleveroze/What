import { useEffect, useState } from "react";
import { runCommand } from "../commands/registry";
import { languageName } from "../editor/monaco";
import { ENCODING_LABELS } from "../ipc/native";
import { formatBinding } from "../lib/keys";
import { basename } from "../lib/path";
import { useStore } from "../lib/store";
import { chordStore } from "../commands/registry";
import { activeDoc, cursorStore, editorStore, savedStore } from "../state/editors";
import { problemsStore } from "../state/problems";
import { settingsStore } from "../state/settings";
import { terminalStore } from "../state/terminals";
import { showPanel, workspaceStore } from "../state/workspace";
import { Icon } from "./Icon";
import { extensionsStore } from "../extensions/host";

function Item({ children, onClick, title, desc, className }: { children: React.ReactNode; onClick?: () => void; title: string; desc?: string; className?: string }) {
  return (
    <button type="button" className={`status-item ${className ?? ""}`} onClick={onClick} data-tip={title} data-tip-desc={desc} aria-label={title}>
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
  const saved = useStore(savedStore, (s) => s);
  const extStatus = useStore(extensionsStore, (s) => s.status);
  const [, rerender] = useState(0);
  useEffect(() => {
    if (!saved.at) return;
    const t = setTimeout(() => rerender((x) => x + 1), 1700);
    return () => clearTimeout(t);
  }, [saved.at]);

  return (
    <footer className="statusbar" role="status">
      <div className="status-left">
        {root && (
          <Item title={root} desc="The folder you're working in. Click to switch to a recent one." onClick={() => runCommand("file.openRecent")} className="status-folder">
            <Icon name="folder" size={13} />
            <span>{basename(root)}</span>
          </Item>
        )}
        <Item title="Problems" desc="Errors and warnings found in your open files. Click to see the list." onClick={() => showPanel("problems", true)}>
          <span key={`${problems.errors}-${problems.warnings}`} className="status-bump">
          <Icon name="error" size={13} />
          <span>{problems.errors}</span>
          <Icon name="warning" size={13} />
          <span>{problems.warnings}</span>
          </span>
        </Item>
        {terms > 0 && (
          <Item title="Terminals running" desc="Click to show or hide the terminal panel." onClick={() => runCommand("terminal.toggle")}>
            <Icon name="terminal" size={13} />
            <span>{terms}</span>
          </Item>
        )}
        {saved.at > 0 && Date.now() - saved.at < 1600 && (
          <span key={saved.at} className="status-saved">
            <Icon name="check" size={12} /> Saved {saved.name}
          </span>
        )}
        {chord && <span className="status-chord">({formatBinding(chord)}) was pressed. Waiting for second key of chord…</span>}
      </div>
      <div className="status-right">
        {Object.entries(extStatus).map(([id, item]) => (
          <span key={id} className="status-item ext-status" data-tip={item.tooltip || item.text} data-tip-desc={`From the “${id}” extension`}>
            {item.text}
          </span>
        ))}
        {doc && (
          <>
            <Item title="Cursor position" desc="Line and column of the cursor. Click to jump to a line number." onClick={() => runCommand("edit.gotoLine")}>
              Ln {cursor.line}, Col {cursor.column}
              {cursor.selectedChars > 0 && ` (${cursor.selectedChars} selected)`}
              {cursor.selections > 1 && ` · ${cursor.selections} selections`}
            </Item>
            <Item title="Indentation" desc="What the Tab key inserts. Click to switch between spaces and tabs or change the width." onClick={() => runCommand("editor.changeIndentation")}>
              {cursor.insertSpaces ? "Spaces" : "Tab Size"}: {cursor.tabSize}
            </Item>
            <Item title="File encoding" desc="How characters are stored on disk. UTF-8 is the safe choice for almost everything." onClick={() => runCommand("editor.changeEncoding")}>
              {ENCODING_LABELS[doc.encoding]}
            </Item>
            <Item title="Line endings" desc="CRLF is the Windows style, LF the Unix style. Most tools accept both." onClick={() => runCommand("editor.changeEol")}>
              {doc.eol}
            </Item>
            <Item title="Language" desc="Decides colors and suggestions for this file. Click to pick another language." onClick={() => runCommand("editor.changeLanguage")}>
              {languageName(doc.language)}
            </Item>
          </>
        )}
        {autoSave !== "off" && (
          <Item title="Auto Save is on" desc="Your changes are saved automatically. Click to configure." onClick={() => import("../state/editors").then((m) => m.openSettingsTab("files"))}>
            <Icon name="check" size={13} />
            <span>Auto Save</span>
          </Item>
        )}
      </div>
    </footer>
  );
}
