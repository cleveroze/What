import { useEffect, useMemo, useRef, useState } from "react";
import {
  allCommands,
  bindingFor,
  commandsForBinding,
  getCommand,
  keybindingStore,
  resetAllKeybindings,
  resetKeybinding,
  setKeybinding,
} from "../../commands/registry";
import { fuzzyMatch } from "../../lib/fuzzy";
import { formatBinding, keyFromEvent } from "../../lib/keys";
import { useStore } from "../../lib/store";
import { confirm } from "../../state/ui";
import { Icon } from "../Icon";
import { Button, IconButton, Kbd } from "../ui/controls";

function Recorder({ commandId, onDone }: { commandId: string; onDone: () => void }) {
  const [chords, setChords] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    keybindingStore.set((s) => ({ ...s, recording: true }));
    ref.current?.focus();
    return () => keybindingStore.set((s) => ({ ...s, recording: false }));
  }, []);
  const binding = chords.join(" ");
  const conflicts = binding ? commandsForBinding(binding).filter((c) => c.id !== commandId) : [];
  return (
    <div
      ref={ref}
      className="key-recorder"
      tabIndex={0}
      role="textbox"
      aria-label="Press the desired key combination, then Enter"
      onKeyDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!e.ctrlKey && !e.altKey && !e.shiftKey && e.key === "Escape") return onDone();
        if (!e.ctrlKey && !e.altKey && !e.shiftKey && e.key === "Enter" && chords.length) {
          setKeybinding(commandId, binding);
          return onDone();
        }
        const chord = keyFromEvent(e.nativeEvent);
        if (!chord) return;
        setChords((c) => (c.length >= 2 ? [chord] : [...c, chord]));
      }}
      onBlur={onDone}
    >
      {chords.length ? <Kbd binding={binding} /> : <span className="muted">Press keys…</span>}
      <span className="key-recorder-hint">Enter to save · Esc to cancel</span>
      {conflicts.length > 0 && (
        <span className="key-recorder-conflict">
          <Icon name="warning" size={13} /> Also bound to {conflicts.map((c) => c.title).join(", ")}
        </span>
      )}
    </div>
  );
}

export function ShortcutsEditor() {
  const overrides = useStore(keybindingStore, (s) => s.overrides);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  const rows = useMemo(() => {
    const cmds = allCommands().filter((c) => !c.hidden);
    const q = filter.trim();
    const scored = cmds
      .map((c) => {
        const text = `${c.category}: ${c.title}`;
        const key = formatBinding(bindingFor(c.id)).toLowerCase();
        const m = fuzzyMatch(q, text);
        const keyHit = q && key.includes(q.toLowerCase());
        return m || keyHit ? { c, score: keyHit ? 100 : m!.score } : null;
      })
      .filter((x): x is { c: (typeof cmds)[number]; score: number } => !!x);
    if (q) scored.sort((a, b) => b.score - a.score);
    else scored.sort((a, b) => a.c.category.localeCompare(b.c.category) || a.c.title.localeCompare(b.c.title));
    return scored.map((s) => s.c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, overrides]);

  const userCount = Object.keys(overrides).length;

  return (
    <div className="shortcuts">
      <div className="shortcuts-toolbar">
        <div className="input-box grow">
          <Icon name="search" size={14} />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search commands or key bindings" spellCheck={false} aria-label="Filter key bindings" />
        </div>
        <Button
          variant="text"
          icon="reset"
          disabled={!userCount}
          onClick={async () => {
            if (await confirm("Reset key bindings", `Reset all ${userCount} customized key bindings to their defaults?`, "Reset", true)) resetAllKeybindings();
          }}
        >
          Reset all
        </Button>
      </div>
      <div className="shortcuts-table" role="table" aria-label="Keyboard shortcuts">
        <div className="shortcuts-row head" role="row">
          <span role="columnheader">Command</span>
          <span role="columnheader">Key binding</span>
          <span role="columnheader">Source</span>
          <span role="columnheader" className="sr-only">Actions</span>
        </div>
        {rows.map((c) => {
          const binding = bindingFor(c.id);
          const user = !c.editorNative && c.id in overrides;
          const conflicts = binding ? commandsForBinding(binding).filter((o) => o.id !== c.id && !o.hidden) : [];
          return (
            <div key={c.id} className={`shortcuts-row ${user ? "user" : ""}`} role="row" onDoubleClick={() => !c.editorNative && setEditing(c.id)}>
              <span role="cell" className="sc-command">
                <span className="sc-category">{c.category}:</span> {c.title}
                <span className="sc-id">{c.id}</span>
              </span>
              <span role="cell" className="sc-binding">
                {editing === c.id ? (
                  <Recorder commandId={c.id} onDone={() => setEditing(null)} />
                ) : binding ? (
                  <>
                    <Kbd binding={binding} />
                    {conflicts.length > 0 && (
                      <span className="sc-conflict" title={`Also bound to: ${conflicts.map((o) => getCommand(o.id)?.title).join(", ")}`}>
                        <Icon name="warning" size={13} />
                      </span>
                    )}
                  </>
                ) : (
                  <span className="muted">—</span>
                )}
              </span>
              <span role="cell" className="sc-source">{c.editorNative ? "Editor" : user ? "User" : "Default"}</span>
              <span role="cell" className="sc-actions">
                {c.editorNative ? (
                  <span className="muted" title="Handled natively by the code editor while it has focus">built-in</span>
                ) : (
                  <>
                    <IconButton icon="edit" label="Change key binding" onClick={() => setEditing(c.id)} />
                    <IconButton icon="close" label="Remove key binding" disabled={!binding} onClick={() => setKeybinding(c.id, null)} />
                    <IconButton icon="reset" label="Reset to default" disabled={!user} onClick={() => resetKeybinding(c.id)} />
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
