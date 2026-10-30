import { describeAiError, streamChat, type ChatMessage } from "../ai/providers";
import { languageName } from "../editor/monaco";
import { createStore } from "../lib/store";
import { uid } from "../lib/util";
import { activeDoc, getActiveEditor, getModel } from "./editors";
import { log } from "./output";
import { problemsStore } from "./problems";
import { getSetting } from "./settings";
import { showSidebarView } from "./workspace";

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  /** What the user typed (shown in the chat). */
  display: string;
  /** What is sent to the model (display + attached code context). */
  content: string;
  error?: string;
  notice?: string;
  context?: string;
}

export const assistantStore = createStore<{ messages: AssistantMessage[]; streaming: boolean; focusNonce: number }>({
  messages: [],
  streaming: false,
  focusNonce: 0,
});

let controller: AbortController | null = null;

const SYSTEM = `You are Stride AI, the coding assistant built into the Stride code editor.
Many users are beginners: explain things clearly and concretely, avoid jargon (or explain it), and keep answers focused.
When you show code the user should put into their file, use a fenced code block tagged with the language. When you rewrite the user's selection, return only the replacement code in a single block, followed by a short explanation.
The user's current file and selection, when shared, are given inside <file> and <selection> tags.`;

function fileContext(includeFile: boolean): { text: string; label: string } | null {
  const doc = activeDoc();
  const editor = getActiveEditor();
  const model = doc ? getModel(doc.id) : null;
  if (!doc || !model) return null;
  const sel = editor?.getSelection();
  const selection = sel && !sel.isEmpty() ? model.getValueInRange(sel) : "";
  const parts: string[] = [];
  const lang = languageName(doc.language);
  if (includeFile) {
    const full = model.getValue();
    const text = full.length > 120_000 ? full.slice(0, 120_000) + "\n…(truncated)" : full;
    parts.push(`<file name="${doc.name}" language="${lang}">\n${text}\n</file>`);
  }
  if (selection) parts.push(`<selection lines="${sel!.startLineNumber}-${sel!.endLineNumber}">\n${selection}\n</selection>`);
  if (!parts.length) return null;
  return { text: parts.join("\n"), label: selection ? `${doc.name} · lines ${sel!.startLineNumber}–${sel!.endLineNumber}` : doc.name };
}

function patchLast(patch: Partial<AssistantMessage> | ((m: AssistantMessage) => Partial<AssistantMessage>)) {
  assistantStore.set((s) => {
    const msgs = [...s.messages];
    const last = msgs[msgs.length - 1];
    msgs[msgs.length - 1] = { ...last, ...(typeof patch === "function" ? patch(last) : patch) };
    return { ...s, messages: msgs };
  });
}

export async function ask(prompt: string, opts: { withFile?: boolean } = {}) {
  const text = prompt.trim();
  if (!text || assistantStore.get().streaming) return;
  showSidebarView("assistant");
  const ctx = fileContext(opts.withFile ?? getSetting("ai.includeFile"));
  const user: AssistantMessage = {
    id: uid("msg"),
    role: "user",
    display: text,
    content: ctx ? `${ctx.text}\n\n${text}` : text,
    context: ctx?.label,
  };
  const reply: AssistantMessage = { id: uid("msg"), role: "assistant", display: "", content: "" };
  assistantStore.set((s) => ({ ...s, messages: [...s.messages, user, reply], streaming: true }));

  const history: ChatMessage[] = assistantStore
    .get()
    .messages.filter((m) => m.id !== reply.id && !m.error)
    .map((m) => ({ role: m.role, content: m.content }));

  controller = new AbortController();
  try {
    const result = await streamChat({
      system: SYSTEM,
      messages: history,
      signal: controller.signal,
      onText: (delta) => patchLast((m) => ({ display: m.display + delta, content: m.content + delta })),
    });
    if (result.stop === "refused") patchLast({ notice: "The model declined to answer this request." });
    else if (result.stop === "length") patchLast({ notice: "The answer was cut off because it got too long." });
  } catch (e) {
    if (controller.signal.aborted) patchLast({ notice: "Stopped." });
    else {
      const msg = describeAiError(e);
      patchLast({ error: msg });
      log(`AI: ${msg}`, "error");
    }
  } finally {
    controller = null;
    assistantStore.set((s) => ({ ...s, streaming: false }));
  }
}

export function stopAnswer() {
  controller?.abort();
}

export function newChat() {
  stopAnswer();
  assistantStore.set((s) => ({ ...s, messages: [] }));
}

export function focusAssistant() {
  showSidebarView("assistant");
  assistantStore.set((s) => ({ ...s, focusNonce: s.focusNonce + 1 }));
}

// ---------- Quick actions ----------

export function explainCode() {
  return ask("Explain what this code does, step by step, in simple words.", { withFile: true });
}

export function findBugs() {
  return ask("Look for bugs or mistakes in this code. For each one, say what is wrong and show the fix.", { withFile: true });
}

export function addComments() {
  return ask("Add helpful comments to this code. Return the commented code in one block.", { withFile: true });
}

export function writeTests() {
  return ask("Write simple unit tests for this code, and explain how to run them.", { withFile: true });
}

export function fixProblems() {
  const doc = activeDoc();
  const problems = problemsStore.get().items.filter((p) => doc && p.docId === doc.id);
  if (!problems.length) return ask("Review this file and suggest improvements.", { withFile: true });
  const list = problems.map((p) => `- Line ${p.line}: ${p.message}`).join("\n");
  return ask(`My editor reports these problems:\n${list}\n\nExplain each one simply and show how to fix it.`, { withFile: true });
}

export function explainError(message: string) {
  return ask(`What does this error mean, and how do I fix it?\n\n${message}`, { withFile: true });
}
