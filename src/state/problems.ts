import { monaco } from "../editor/monaco";
import { createStore } from "../lib/store";
import { debounce } from "../lib/util";
import { editorStore, getModel } from "./editors";

export interface Problem {
  docId: string;
  path: string | null;
  name: string;
  severity: "error" | "warning" | "info";
  message: string;
  source?: string;
  code?: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

export const problemsStore = createStore<{ items: Problem[]; errors: number; warnings: number }>({
  items: [],
  errors: 0,
  warnings: 0,
});

function severity(s: monaco.MarkerSeverity): Problem["severity"] | null {
  if (s === monaco.MarkerSeverity.Error) return "error";
  if (s === monaco.MarkerSeverity.Warning) return "warning";
  if (s === monaco.MarkerSeverity.Info) return "info";
  return null;
}

const recompute = debounce(() => {
  const items: Problem[] = [];
  for (const doc of Object.values(editorStore.get().docs)) {
    const model = getModel(doc.id);
    if (!model || model.isDisposed()) continue;
    for (const m of monaco.editor.getModelMarkers({ resource: model.uri })) {
      const sev = severity(m.severity);
      if (!sev) continue;
      items.push({
        docId: doc.id,
        path: doc.path,
        name: doc.name,
        severity: sev,
        message: m.message,
        source: m.source,
        code: typeof m.code === "string" ? m.code : m.code?.value,
        line: m.startLineNumber,
        column: m.startColumn,
        endLine: m.endLineNumber,
        endColumn: m.endColumn,
      });
    }
  }
  const rank = { error: 0, warning: 1, info: 2 };
  items.sort((a, b) => a.name.localeCompare(b.name) || rank[a.severity] - rank[b.severity] || a.line - b.line);
  problemsStore.set({
    items,
    errors: items.filter((i) => i.severity === "error").length,
    warnings: items.filter((i) => i.severity === "warning").length,
  });
}, 150);

monaco.editor.onDidChangeMarkers(() => recompute());
let lastDocs = editorStore.get().docs;
editorStore.subscribe(() => {
  const docs = editorStore.get().docs;
  if (docs !== lastDocs) {
    lastDocs = docs;
    recompute();
  }
});
