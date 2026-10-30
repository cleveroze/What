import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { activeModelLabel, PROVIDERS, setupProblem } from "../../ai/providers";
import { monaco } from "../../editor/monaco";
import { preview } from "../../ipc/native";
import { useStore } from "../../lib/store";
import {
  addComments,
  ask,
  assistantStore,
  explainCode,
  findBugs,
  fixProblems,
  newChat,
  stopAnswer,
  writeTests,
  type AssistantMessage,
} from "../../state/assistant";
import { activeDoc, editorStore, getActiveEditor, newUntitled, openSettingsTab } from "../../state/editors";
import { secretsStore } from "../../state/secrets";
import { setSetting, settingsStore } from "../../state/settings";
import { notify } from "../../state/ui";
import { EmptyState } from "../EmptyState";
import { Icon } from "../Icon";
import { LoadingIndicator, MorphShape } from "../Shape";
import { Button, IconButton } from "../ui/controls";

// ---------- Minimal, safe markdown rendering (no HTML injection) ----------

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[[^\]]+\]\((https?:[^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${key}-${i++}`;
    if (t.startsWith("`")) out.push(<code key={k}>{t.slice(1, -1)}</code>);
    else if (t.startsWith("**")) out.push(<strong key={k}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("[")) {
      const label = t.slice(1, t.indexOf("]"));
      const url = m[2];
      out.push(
        <a key={k} href={url} onClick={(e) => { e.preventDefault(); preview.openExternal(url); }}>
          {label}
        </a>,
      );
    } else out.push(<em key={k}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function TextBlock({ text, k }: { text: string; k: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <>
      {blocks.map((b, bi) => {
        const lines = b.split("\n");
        const key = `${k}-${bi}`;
        if (lines.every((l) => /^\s*([-*]|\d+\.)\s+/.test(l) || !l.trim())) {
          const ordered = /^\s*\d+\./.test(lines[0]);
          const items = lines.filter((l) => l.trim()).map((l, li) => <li key={li}>{inline(l.replace(/^\s*([-*]|\d+\.)\s+/, ""), `${key}-${li}`)}</li>);
          return ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>;
        }
        const h = /^(#{1,4})\s+(.*)$/.exec(lines[0]);
        if (h && lines.length === 1) return <h4 key={key}>{inline(h[2], key)}</h4>;
        return (
          <p key={key}>
            {lines.map((l, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {inline(l.replace(/^#{1,4}\s+/, ""), `${key}-${li}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </>
  );
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  const hasSelection = useStore(editorStore, () => !!getActiveEditor()?.getSelection() && !getActiveEditor()!.getSelection()!.isEmpty());
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    // Colorize with Monaco's tokenizer for the code's language.
    const el = ref.current;
    if (!el) return;
    const id = monaco.languages.getLanguages().find((l) => l.id === lang || l.aliases?.some((a) => a.toLowerCase() === lang.toLowerCase()) || l.extensions?.includes(`.${lang}`))?.id;
    if (!id) return;
    monaco.editor.colorize(code, id, {}).then((html) => {
      if (ref.current) ref.current.innerHTML = html;
    });
  }, [code, lang]);

  const apply = (mode: "insert" | "replace") => {
    const editor = getActiveEditor();
    if (!editor?.getModel()) {
      notify("info", "Open a file first", "Then you can insert the code where your cursor is.");
      return;
    }
    const sel = editor.getSelection()!;
    const range = mode === "replace" ? sel : new monaco.Range(sel.positionLineNumber, sel.positionColumn, sel.positionLineNumber, sel.positionColumn);
    editor.executeEdits("stride-ai", [{ range, text: code, forceMoveMarkers: true }]);
    editor.pushUndoStop();
    editor.focus();
  };

  return (
    <div className="ai-code">
      <div className="ai-code-bar">
        <span className="ai-code-lang">{lang || "code"}</span>
        <button type="button" className="ai-code-btn" data-tip="Insert at cursor" data-tip-desc="Puts this code where your cursor is in the open file. Ctrl+Z undoes it." onClick={() => apply("insert")}>
          <Icon name="arrow-right" size={13} /> Insert
        </button>
        {hasSelection && (
          <button type="button" className="ai-code-btn" data-tip="Replace selection" data-tip-desc="Swaps the selected text in the editor for this code. Ctrl+Z undoes it." onClick={() => apply("replace")}>
            <Icon name="replace" size={13} /> Replace
          </button>
        )}
        <button type="button" className="ai-code-btn" data-tip="Open in a new file" onClick={() => newUntitled(lang && monaco.languages.getLanguages().some((l) => l.id === lang) ? lang : "plaintext", code)}>
          <Icon name="new-file" size={13} />
        </button>
        <button
          type="button"
          className="ai-code-btn"
          data-tip="Copy"
          onClick={() => {
            navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        >
          <Icon name={copied ? "check" : "copy"} size={13} />
        </button>
      </div>
      <pre ref={ref}>{code}</pre>
    </div>
  );
}

function Markdown({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const re = /```([\w+#.-]*)[^\n]*\n([\s\S]*?)(```|$)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(<TextBlock key={`t${i}`} k={`t${i}`} text={text.slice(last, m.index)} />);
    parts.push(<CodeBlock key={`c${i}`} lang={m[1]} code={m[2].replace(/\n$/, "")} />);
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) parts.push(<TextBlock key={`t${i}`} k={`t${i}`} text={text.slice(last)} />);
  return <div className="ai-md">{parts}</div>;
}

// ---------- View ----------

function Message({ m, streaming }: { m: AssistantMessage; streaming: boolean }) {
  if (m.role === "user") {
    return (
      <div className="ai-msg user">
        {m.context && (
          <span className="ai-context-chip">
            <Icon name="file-code" size={12} /> {m.context}
          </span>
        )}
        <div className="ai-bubble">{m.display}</div>
      </div>
    );
  }
  return (
    <div className="ai-msg assistant">
      <span className="ai-avatar">
        <MorphShape name={streaming ? "softBurst" : "cookie9"} size={24} fill="var(--accent)" spin={120} />
      </span>
      <div className="ai-answer">
        {m.display ? <Markdown text={m.display} /> : !m.error && <LoadingIndicator size={22} label="Thinking" />}
        {m.notice && <div className="ai-notice">{m.notice}</div>}
        {m.error && (
          <div className="ai-error">
            <Icon name="warning" size={14} /> {m.error}
          </div>
        )}
      </div>
    </div>
  );
}

const SUGGESTIONS: { label: string; run: () => unknown; needsFile?: boolean }[] = [
  { label: "Explain this code", run: explainCode, needsFile: true },
  { label: "Find bugs", run: findBugs, needsFile: true },
  { label: "Fix the problems", run: fixProblems, needsFile: true },
  { label: "Add comments", run: addComments, needsFile: true },
  { label: "Write tests", run: writeTests, needsFile: true },
];

export function AssistantView() {
  const { messages, streaming, focusNonce } = useStore(assistantStore, (s) => s);
  const settings = useStore(settingsStore, (s) => s);
  useStore(secretsStore, (s) => s);
  const hasDoc = useStore(editorStore, () => !!activeDoc());
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const problem = setupProblem();
  const provider = PROVIDERS.find((p) => p.id === settings["ai.provider"])!;

  useEffect(() => {
    inputRef.current?.focus();
  }, [focusNonce]);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = () => {
    if (!draft.trim()) return;
    ask(draft);
    setDraft("");
  };

  return (
    <div className="assistant">
      <div className="sidebar-section-header">
        <span className="sidebar-section-title">AI Assistant</span>
        <div className="sidebar-actions">
          <IconButton icon="plus" label="New chat" onClick={newChat} disabled={!messages.length} />
          <IconButton icon="settings" label="AI settings" onClick={() => openSettingsTab("ai")} />
        </div>
      </div>
      {problem ? (
        <div className="explorer-empty">
          <EmptyState
            shape="sunny"
            icon="sparkle"
            title="Your AI coding buddy"
            action={
              <Button variant="filled" icon="settings" onClick={() => openSettingsTab("ai")}>
                Set up AI
              </Button>
            }
          >
            Ask questions, get code explained, find bugs. Works with Claude, OpenRouter (GPT, Gemini, Llama…) or a free local model via Ollama. {problem}
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="ai-list" ref={listRef}>
            {messages.length === 0 && (
              <div className="ai-welcome">
                <MorphShape name="sunny" from="circle" size={56} fill="var(--accent-soft)" spin={90} />
                <div className="ai-welcome-title">How can I help?</div>
                <div className="ai-welcome-text">
                  Ask anything about code. {settings["ai.includeFile"] && hasDoc ? "I can see the file you have open." : "Open a file and I'll be able to see it."}
                </div>
                <div className="ai-suggestions">
                  {SUGGESTIONS.filter((s) => !s.needsFile || hasDoc).map((s, i) => (
                    <button key={s.label} type="button" className="ai-suggestion" style={{ ["--i" as string]: i }} onClick={() => s.run()}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <Message key={m.id} m={m} streaming={streaming && i === messages.length - 1} />
            ))}
          </div>
          <div className="ai-composer">
            <div className="ai-composer-meta">
              <button
                type="button"
                className={`ai-file-toggle ${settings["ai.includeFile"] ? "on" : ""}`}
                onClick={() => setSetting("ai.includeFile", !settings["ai.includeFile"])}
                data-tip={settings["ai.includeFile"] ? "Sharing the open file" : "Not sharing the open file"}
                data-tip-desc="When on, the assistant sees the file you have open (and your selection). Code is sent to the AI provider you chose."
              >
                <Icon name="file-code" size={12} /> {settings["ai.includeFile"] ? "Open file shared" : "File not shared"}
              </button>
              <span className="ai-model" data-tip={provider.name} data-tip-desc="Change the provider and model in Settings → AI.">
                {activeModelLabel()}
              </span>
            </div>
            <div className="ai-input">
              <textarea
                ref={inputRef}
                value={draft}
                rows={1}
                placeholder="Ask about your code…  (Enter to send, Shift+Enter for a new line)"
                spellCheck
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              {streaming ? (
                <button type="button" className="ai-send stop" aria-label="Stop" data-tip="Stop answering" onClick={stopAnswer}>
                  <span className="ai-stop-square" />
                </button>
              ) : (
                <button type="button" className="ai-send" aria-label="Send" data-tip="Send" data-tip-keys="enter" disabled={!draft.trim()} onClick={send}>
                  <Icon name="arrow-right" size={16} />
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
