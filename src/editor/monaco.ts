import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/languages/features/json/json.worker?worker";
import CssWorker from "monaco-editor/languages/features/css/css.worker?worker";
import HtmlWorker from "monaco-editor/languages/features/html/html.worker?worker";
import TsWorker from "monaco-editor/languages/features/typescript/ts.worker?worker";
import { withAlpha, mix } from "../lib/color";
import { basename, extname } from "../lib/path";
import type { Settings } from "../state/settings";
import { themeStore } from "../theme/engine";
import type { ThemeTokens } from "../theme/tokens";

self.MonacoEnvironment = {
  getWorker(_id: string, label: string) {
    switch (label) {
      case "json":
        return new JsonWorker();
      case "css":
      case "scss":
      case "less":
        return new CssWorker();
      case "html":
      case "handlebars":
      case "razor":
        return new HtmlWorker();
      case "typescript":
      case "javascript":
        return new TsWorker();
      default:
        return new EditorWorker();
    }
  },
};

// Files are opened standalone (no project/tsconfig), so silence diagnostics
// that only reflect missing module resolution.
const ignoredTsDiagnostics = [2307, 2792, 7016, 2875, 1375, 1378, 2686];
for (const defaults of [monaco.typescript.typescriptDefaults, monaco.typescript.javascriptDefaults]) {
  defaults.setCompilerOptions({
    target: monaco.typescript.ScriptTarget.ESNext,
    module: monaco.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
    jsx: monaco.typescript.JsxEmit.ReactJSX,
    allowJs: true,
    allowNonTsExtensions: true,
    esModuleInterop: true,
    strict: true,
    skipLibCheck: true,
  });
  defaults.setDiagnosticsOptions({ diagnosticCodesToIgnore: ignoredTsDiagnostics });
}

export { monaco };

const strip = (hex: string) => hex.replace("#", "");

export function defineVersoTheme(t: ThemeTokens) {
  const s = t.syntax;
  const rule = (token: string, fg: string, fontStyle?: string) => ({ token, foreground: strip(fg), fontStyle });
  const strong = t.monochrome ? "bold" : undefined;
  monaco.editor.defineTheme("verso", {
    base: t.dark ? "vs-dark" : "vs",
    inherit: true,
    rules: [
      rule("", t.text),
      rule("comment", s.comment, "italic"),
      rule("comment.doc", s.comment, "italic"),
      rule("keyword", s.keyword, strong),
      rule("keyword.control", s.control, strong),
      rule("keyword.flow", s.control, strong),
      rule("storage", s.keyword, strong),
      rule("string", s.string),
      rule("string.escape", s.regexp),
      rule("string.key.json", s.property),
      rule("string.value.json", s.string),
      rule("number", s.number),
      rule("constant", s.constant),
      rule("regexp", s.regexp),
      rule("type", s.type),
      rule("type.identifier", s.type),
      rule("identifier", s.variable),
      rule("function", s.function),
      rule("delimiter", s.operator),
      rule("operator", s.operator),
      rule("tag", s.tag, strong),
      rule("metatag", s.tag),
      rule("attribute.name", s.attribute),
      rule("attribute.value", s.string),
      rule("variable", s.variable),
      rule("variable.predefined", s.constant),
      rule("predefined", s.function),
      rule("annotation", s.attribute),
      rule("namespace", s.type),
      rule("key", s.property),
      rule("emphasis", t.text, "italic"),
      rule("strong", t.text, "bold"),
      rule("keyword.md", s.keyword, "bold"),
    ],
    colors: {
      "editor.background": t.editor,
      "editor.foreground": t.text,
      "editorLineNumber.foreground": withAlpha(t.textFaint, 0.85),
      "editorLineNumber.activeForeground": t.text,
      "editorCursor.foreground": t.accent,
      "editor.selectionBackground": withAlpha(t.accent, t.dark ? 0.3 : 0.24),
      "editor.inactiveSelectionBackground": withAlpha(t.accent, 0.14),
      "editor.selectionHighlightBackground": withAlpha(t.accent, 0.14),
      "editor.wordHighlightBackground": withAlpha(t.accent, 0.12),
      "editor.wordHighlightStrongBackground": withAlpha(t.accent, 0.18),
      "editor.findMatchBackground": withAlpha(t.warning, 0.45),
      "editor.findMatchHighlightBackground": withAlpha(t.warning, 0.22),
      "editor.lineHighlightBackground": mix(t.editor, t.text, t.dark ? 0.035 : 0.03),
      "editor.lineHighlightBorder": "#00000000",
      "editorIndentGuide.background1": withAlpha(t.text, 0.08),
      "editorIndentGuide.activeBackground1": withAlpha(t.text, 0.22),
      "editorWhitespace.foreground": withAlpha(t.textFaint, 0.5),
      "editorRuler.foreground": withAlpha(t.text, 0.08),
      "editorBracketMatch.background": withAlpha(t.accent, 0.16),
      "editorBracketMatch.border": withAlpha(t.accent, 0.5),
      "editorGutter.background": t.editor,
      "editorWidget.background": t.raised,
      "editorWidget.foreground": t.text,
      "editorWidget.border": t.border,
      "editorSuggestWidget.background": t.raised,
      "editorSuggestWidget.border": t.border,
      "editorSuggestWidget.selectedBackground": t.accentSoft,
      "editorSuggestWidget.selectedForeground": t.onAccentSoft,
      "editorSuggestWidget.highlightForeground": t.accent,
      "editorHoverWidget.background": t.raised,
      "editorHoverWidget.border": t.border,
      "editorStickyScroll.background": t.editor,
      "editorStickyScrollHover.background": t.hover,
      "editorOverviewRuler.border": "#00000000",
      "editorError.foreground": t.danger,
      "editorWarning.foreground": t.warning,
      "editorInfo.foreground": t.info,
      "editorLink.activeForeground": t.accent,
      "list.hoverBackground": t.hover,
      "list.activeSelectionBackground": t.accentSoft,
      "list.activeSelectionForeground": t.onAccentSoft,
      "list.focusBackground": t.accentSoft,
      "list.highlightForeground": t.accent,
      "input.background": t.sunken,
      "input.foreground": t.text,
      "input.border": t.border,
      "inputOption.activeBorder": t.accent,
      "inputOption.activeBackground": withAlpha(t.accent, 0.2),
      focusBorder: withAlpha(t.accent, 0.7),
      "scrollbar.shadow": "#00000000",
      "scrollbarSlider.background": withAlpha(t.text, 0.12),
      "scrollbarSlider.hoverBackground": withAlpha(t.text, 0.2),
      "scrollbarSlider.activeBackground": withAlpha(t.text, 0.28),
      "minimap.background": t.editor,
      "minimapSlider.background": withAlpha(t.text, 0.08),
      "minimapSlider.hoverBackground": withAlpha(t.text, 0.14),
      "menu.background": t.raised,
      "menu.foreground": t.text,
      "menu.selectionBackground": t.accentSoft,
      "menu.selectionForeground": t.onAccentSoft,
      "menu.separatorBackground": t.border,
      "menu.border": t.border,
      "peekView.border": t.accent,
      "peekViewEditor.background": t.surface,
      "peekViewResult.background": t.raised,
      "peekViewTitle.background": t.raised,
      "editorBracketHighlight.foreground1": s.keyword,
      "editorBracketHighlight.foreground2": s.function,
      "editorBracketHighlight.foreground3": s.type,
      "editorBracketHighlight.foreground4": s.number,
      "editorBracketHighlight.foreground5": s.string,
      "editorBracketHighlight.foreground6": s.property,
    },
  });
  monaco.editor.setTheme("verso");
}

defineVersoTheme(themeStore.get().tokens);
themeStore.subscribe(() => defineVersoTheme(themeStore.get().tokens));

/** Resolves Monaco's language id for a file path from registered extensions,
 * file names and glob-like filename patterns. */
export function languageForPath(path: string): string {
  const name = basename(path).toLowerCase();
  const ext = extname(path);
  let byExt: string | undefined;
  for (const lang of monaco.languages.getLanguages()) {
    if (lang.filenames?.some((f) => f.toLowerCase() === name)) return lang.id;
    if (!byExt && lang.extensions?.some((e) => e.toLowerCase() === ext || name.endsWith(e.toLowerCase()))) {
      byExt = lang.id;
    }
  }
  if (byExt) return byExt;
  if (name === "dockerfile" || name.startsWith("dockerfile.")) return "dockerfile";
  if (name === ".gitignore" || name === ".env" || name.endsWith(".env")) return "ini";
  return "plaintext";
}

export function languageName(id: string): string {
  const lang = monaco.languages.getLanguages().find((l) => l.id === id);
  return lang?.aliases?.[0] ?? id;
}

export function editorOptions(s: Settings): monaco.editor.IEditorOptions & monaco.editor.IGlobalEditorOptions {
  const rulers = s["editor.rulers"]
    .split(",")
    .map((r) => parseInt(r.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return {
    fontFamily: s["editor.fontFamily"],
    fontSize: s["editor.fontSize"],
    lineHeight: s["editor.lineHeight"],
    fontLigatures: s["editor.fontLigatures"],
    wordWrap: s["editor.wordWrap"] === "bounded" ? "bounded" : s["editor.wordWrap"],
    wordWrapColumn: 120,
    minimap: { enabled: s["editor.minimap"], renderCharacters: false, scale: 1, maxColumn: 100 },
    lineNumbers: s["editor.lineNumbers"],
    renderWhitespace: s["editor.renderWhitespace"],
    cursorStyle: s["editor.cursorStyle"],
    cursorBlinking: s["editor.cursorBlinking"],
    cursorSmoothCaretAnimation: s["editor.smoothCaret"] && s["ui.animation"] !== "off" ? "on" : "off",
    smoothScrolling: s["editor.smoothScrolling"] && s["ui.animation"] !== "off",
    bracketPairColorization: { enabled: s["editor.bracketPairColorization"] },
    guides: { bracketPairs: s["editor.guides"] ? "active" : false, indentation: s["editor.guides"] },
    stickyScroll: { enabled: s["editor.stickyScroll"] },
    folding: s["editor.folding"],
    showFoldingControls: "mouseover",
    autoClosingBrackets: s["editor.autoClosingBrackets"] ? "languageDefined" : "never",
    autoClosingQuotes: s["editor.autoClosingBrackets"] ? "languageDefined" : "never",
    quickSuggestions: s["editor.quickSuggestions"],
    renderLineHighlight: s["editor.renderLineHighlight"],
    rulers,
    matchBrackets: "always",
    multiCursorModifier: "alt",
    mouseWheelZoom: true,
    padding: { top: 6, bottom: 6 },
    scrollBeyondLastLine: true,
    fixedOverflowWidgets: true,
    automaticLayout: false,
    contextmenu: true,
    dragAndDrop: true,
    links: true,
    colorDecorators: true,
    scrollbar: { verticalScrollbarSize: 12, horizontalScrollbarSize: 12, useShadows: false },
    overviewRulerBorder: false,
    renderValidationDecorations: "on",
  };
}
