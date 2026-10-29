/** Guesses a Monaco language id from text, for untitled files that have no
 * extension yet. Returns null when nothing is recognisable. */
export function detectLanguage(text: string): string | null {
  const t = text.slice(0, 4000);
  const s = t.trim();
  if (!s) return null;
  if (/^#!.*\b(ba|z)?sh\b/.test(s)) return "shell";
  if (/^#!.*\bpython/.test(s)) return "python";
  if (/^#!.*\bnode\b/.test(s)) return "javascript";
  if (/<\?php/.test(t)) return "php";
  if (/^<!doctype html|<html[\s>]|<head[\s>]|<body[\s>]|^<(div|p|h[1-6]|section|main|span|ul|a|img|script|style|button|form|table)[\s>]/im.test(s)) return "html";
  if (/^<\?xml|^<svg[\s>]/i.test(s)) return "xml";
  if (/^[{[]/.test(s)) {
    try {
      JSON.parse(s);
      return "json";
    } catch {
      /* not JSON */
    }
  }
  if (/#include\s*[<"]/.test(t)) return /\bstd::|\bcout\b|\bclass\s+\w+|\bnamespace\b|\btemplate\s*</.test(t) ? "cpp" : "c";
  if (/\bfn\s+main\s*\(|\blet\s+mut\b|\bprintln!\s*\(|\bimpl\s+\w+/.test(t)) return "rust";
  if (/^package\s+main\b|\bfunc\s+main\s*\(\s*\)/m.test(t)) return "go";
  if (/\bpublic\s+static\s+void\s+main\s*\(|^import\s+java\./m.test(t)) return "java";
  if (/^using\s+System\b|\bnamespace\s+[\w.]+\s*[{;]|\bConsole\.Write(Line)?\s*\(/m.test(t)) return "csharp";
  if (/^\s*(def\s+\w+\s*\(.*\)\s*(->.*)?:|class\s+\w+(\(.*\))?:|from\s+[\w.]+\s+import\s|import\s+\w+\s*$|if\s+__name__\s*==)/m.test(t) || /^\s*print\s*\(/m.test(t) && !/;\s*$/m.test(t))
    return "python";
  if (/^\s*(Write-Host|Get-\w+|Set-\w+|\$\w+\s*=.*;?\s*$|param\s*\()/im.test(t) && /\b(Write-Host|Get-|Set-|-eq\b|\$PSVersionTable)/.test(t)) return "powershell";
  if (/^\s*(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE)\b/im.test(t)) return "sql";
  if (/\binterface\s+\w+\s*\{|\btype\s+\w+\s*=|:\s*(string|number|boolean|void)\b|\bas\s+const\b/.test(t)) return "typescript";
  if (/\b(function\s+\w*\s*\(|const\s+\w+\s*=|let\s+\w+\s*=|var\s+\w+\s*=|=>|console\.log\s*\(|document\.|require\s*\(|export\s+(default|const|function))/.test(t)) return "javascript";
  if (/^[^{}\n]*[.#]?[\w-]+[^{}\n]*\{[^{}]*[\w-]+\s*:\s*[^;{}]+;?[^{}]*\}/m.test(t) && !/[()=]/.test(t.split("{")[0])) return "css";
  if (/^\s*#{1,6}\s+\S|^\s*[-*]\s+\S.*\n\s*[-*]\s+\S|\[[^\]]+\]\([^)]+\)/m.test(t)) return "markdown";
  return null;
}
