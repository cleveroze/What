import { useEffect, useRef } from "react";
import { editorOptions, monaco } from "../../editor/monaco";
import { useStore } from "../../lib/store";
import {
  autoSaveOnFocusChange,
  cursorStore,
  editorStore,
  getModel,
  getViewState,
  setActiveEditor,
  setViewState,
  takeFocusRequest,
  takePendingReveal,
} from "../../state/editors";
import { settingsStore } from "../../state/settings";

/** Hosts the single Monaco editor instance; switching tabs swaps models while
 * preserving each document's cursor, scroll and folding state. */
export function EditorHost({ visible }: { visible: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const currentDoc = useRef<string | null>(null);
  const activeDocKey = useStore(editorStore, (s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    if (tab?.kind !== "doc") return null;
    return `${tab.docId}:${s.docs[tab.docId]?.modelRev ?? 0}`;
  });

  useEffect(() => {
    const editor = monaco.editor.create(ref.current!, {
      ...editorOptions(settingsStore.get()),
      model: null,
      theme: "verso",
    });
    editorRef.current = editor;
    setActiveEditor(editor);

    const updateCursor = () => {
      const model = editor.getModel();
      const sel = editor.getSelection();
      const sels = editor.getSelections() ?? [];
      if (!model || !sel) return;
      const selectedChars = sels.reduce((n, s) => n + model.getValueLengthInRange(s), 0);
      const opts = model.getOptions();
      cursorStore.set({
        line: sel.positionLineNumber,
        column: sel.positionColumn,
        selections: sels.length,
        selectedChars,
        tabSize: opts.tabSize,
        insertSpaces: opts.insertSpaces,
      });
    };
    const d1 = editor.onDidChangeCursorSelection(updateCursor);
    const d2 = editor.onDidChangeModel(updateCursor);
    const d3 = editor.onDidChangeModelOptions(updateCursor);
    const d4 = editor.onDidBlurEditorWidget(() => autoSaveOnFocusChange());

    const ro = new ResizeObserver(() => editor.layout());
    ro.observe(ref.current!);

    let lastOpts = JSON.stringify(editorOptions(settingsStore.get()));
    const unsub = settingsStore.subscribe(() => {
      const opts = editorOptions(settingsStore.get());
      const key = JSON.stringify(opts);
      if (key !== lastOpts) {
        lastOpts = key;
        editor.updateOptions(opts);
        // Font metrics may change; re-measure glyphs.
        monaco.editor.remeasureFonts();
      }
    });
    return () => {
      unsub();
      ro.disconnect();
      d1.dispose();
      d2.dispose();
      d3.dispose();
      d4.dispose();
      setActiveEditor(null);
      editor.dispose();
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const docId = activeDocKey?.split(":")[0] ?? null;
    const prev = currentDoc.current;
    if (prev && prev !== docId && editor.getModel() && !editor.getModel()!.isDisposed()) {
      setViewState(prev, editor.saveViewState());
    }
    currentDoc.current = docId;
    if (!docId) {
      editor.setModel(null);
      return;
    }
    const model = getModel(docId);
    if (!model) return;
    if (editor.getModel() !== model) {
      editor.setModel(model);
      const vs = getViewState(docId);
      if (vs) editor.restoreViewState(vs);
    }
    const focus = takeFocusRequest(docId);
    const reveal = takePendingReveal(docId);
    if (reveal) {
      editor.setSelection(reveal.range);
      editor.revealRangeInCenter(reveal.range, monaco.editor.ScrollType.Immediate);
      if (reveal.focus) editor.focus();
    } else if (focus) {
      editor.focus();
    }
  }, [activeDocKey]);

  useEffect(() => {
    if (visible) requestAnimationFrame(() => editorRef.current?.layout());
  }, [visible]);

  return <div ref={ref} className="monaco-host" style={{ display: visible ? undefined : "none" }} />;
}
