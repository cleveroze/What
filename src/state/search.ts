import { search as nativeSearch, type SearchQuery, type SearchResult } from "../ipc/native";
import { basename, samePath } from "../lib/path";
import { createStore } from "../lib/store";
import { debounce, errorMessage } from "../lib/util";
import { dirtyDocs } from "./editors";
import { log } from "./output";
import { getSetting } from "./settings";
import { confirm, notify } from "./ui";
import { workspaceStore } from "./workspace";

export interface SearchState {
  query: string;
  replace: string;
  showReplace: boolean;
  showDetails: boolean;
  isRegex: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
  include: string;
  exclude: string;
  useDefaultExcludes: boolean;
  result: SearchResult | null;
  running: boolean;
  error: string | null;
  collapsed: Record<string, boolean>;
  focusNonce: number;
}

export const searchStore = createStore<SearchState>({
  query: "",
  replace: "",
  showReplace: false,
  showDetails: false,
  isRegex: false,
  caseSensitive: false,
  wholeWord: false,
  include: "",
  exclude: "",
  useDefaultExcludes: true,
  result: null,
  running: false,
  error: null,
  collapsed: {},
  focusNonce: 0,
});

function buildQuery(): SearchQuery | null {
  const s = searchStore.get();
  const root = workspaceStore.get().root;
  if (!root || !s.query) return null;
  const exclude = [s.exclude, s.useDefaultExcludes ? getSetting("search.exclude") : ""].filter(Boolean).join(",");
  return {
    root,
    pattern: s.query,
    isRegex: s.isRegex,
    caseSensitive: s.caseSensitive,
    wholeWord: s.wholeWord,
    include: s.include,
    exclude,
    maxResults: getSetting("search.maxResults"),
  };
}

let runId = 0;

export async function runSearch() {
  const query = buildQuery();
  const id = ++runId;
  if (!query) {
    searchStore.update({ result: null, running: false, error: null });
    return;
  }
  searchStore.update({ running: true, error: null });
  try {
    const result = await nativeSearch.run(query);
    if (id !== runId || result.cancelled) return;
    searchStore.update({ result, running: false, collapsed: {} });
  } catch (e) {
    if (id !== runId) return;
    searchStore.update({ running: false, error: errorMessage(e), result: null });
  }
}

export const runSearchDebounced = debounce(runSearch, 280);

export function setSearch(patch: Partial<SearchState>, rerun = true) {
  searchStore.update(patch);
  if (rerun) runSearchDebounced();
}

export function clearSearch() {
  nativeSearch.cancel().catch(() => {});
  runId++;
  searchStore.update({ query: "", replace: "", result: null, error: null, running: false });
}

export function focusSearchInput(text?: string, replace = false) {
  const patch: Partial<SearchState> = { focusNonce: searchStore.get().focusNonce + 1 };
  if (text) patch.query = text;
  if (replace) patch.showReplace = true;
  searchStore.update(patch);
  if (text) runSearchDebounced();
}

export async function replaceInFiles(paths?: string[]) {
  const query = buildQuery();
  const s = searchStore.get();
  if (!query || !s.result) return;
  let targets = paths ?? s.result.files.map((f) => f.path);
  const dirty = dirtyDocs().filter((d) => d.path);
  const skipped = targets.filter((p) => dirty.some((d) => samePath(d.path!, p)));
  targets = targets.filter((p) => !skipped.includes(p));
  if (!targets.length) {
    if (skipped.length) notify("warning", "Nothing replaced", "Matching files have unsaved changes. Save them first.");
    return;
  }
  const count = s.result.files.filter((f) => targets.includes(f.path)).reduce((n, f) => n + f.matches.reduce((m, l) => m + l.ranges.length, 0), 0);
  const ok = await confirm(
    "Replace in files",
    `Replace ${count} occurrence${count === 1 ? "" : "s"} across ${targets.length} file${targets.length === 1 ? "" : "s"} with '${s.replace}'?` +
      (skipped.length ? ` ${skipped.length} file(s) with unsaved changes will be skipped.` : ""),
    "Replace",
    true,
  );
  if (!ok) return;
  try {
    const res = await nativeSearch.replace(query, s.replace, targets);
    log(`Replaced ${res.replacements} occurrence(s) in ${res.filesChanged} file(s)`);
    for (const err of res.errors) log(`Replace error: ${err}`, "error");
    notify(
      res.errors.length ? "warning" : "success",
      `Replaced ${res.replacements} occurrence${res.replacements === 1 ? "" : "s"} in ${res.filesChanged} file${res.filesChanged === 1 ? "" : "s"}`,
      res.errors.length ? `${res.errors.length} file(s) failed — see Output` : skipped.map(basename).join(", ") || undefined,
    );
  } catch (e) {
    notify("error", "Replace failed", errorMessage(e));
  }
  await runSearch();
}
