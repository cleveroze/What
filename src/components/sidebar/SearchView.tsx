import { useEffect, useRef } from "react";
import { pickOpenFolder } from "../../commands/builtin";
import { basename, dirname, relative } from "../../lib/path";
import { useStore } from "../../lib/store";
import { openFile } from "../../state/editors";
import { clearSearch, replaceInFiles, runSearch, searchStore, setSearch } from "../../state/search";
import { openContextMenu } from "../../state/ui";
import { workspaceStore } from "../../state/workspace";
import { FileIcon } from "../FileIcon";
import { Icon } from "../Icon";
import { Button, IconButton } from "../ui/controls";

function Toggle({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`input-toggle ${active ? "on" : ""}`} aria-label={label} aria-pressed={active} title={label} onClick={onClick}>
      <Icon name={icon} size={14} />
    </button>
  );
}

/** Renders a preview line with highlighted match ranges (UTF-16 offsets). */
function Preview({ text, ranges, replace }: { text: string; ranges: [number, number][]; replace: string | null }) {
  const [firstStart] = ranges[0];
  const offset = firstStart > 16 ? firstStart - 12 : 0;
  const parts: React.ReactNode[] = [];
  let pos = offset;
  if (offset > 0) parts.push("…");
  ranges.forEach(([s, e], i) => {
    if (s < pos) return;
    parts.push(text.slice(pos, s));
    parts.push(
      <mark key={i} className={replace !== null ? "replacing" : ""}>
        {text.slice(s, e)}
      </mark>,
    );
    if (replace !== null) parts.push(<ins key={`r${i}`}>{replace}</ins>);
    pos = e;
  });
  parts.push(text.slice(pos, pos + 200));
  return <span className="search-preview">{parts}</span>;
}

export function SearchView() {
  const s = useStore(searchStore, (x) => x);
  const root = useStore(workspaceStore, (x) => x.root);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (s.focusNonce) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [s.focusNonce]);

  useEffect(() => {
    if (root && s.query) runSearch();
  }, [root]);

  if (!root) {
    return (
      <div className="explorer-empty">
        <p>Open a folder to search across its files.</p>
        <Button variant="filled" icon="folder-open" onClick={pickOpenFolder}>
          Open Folder
        </Button>
      </div>
    );
  }

  const result = s.result;
  const replacePreview = s.showReplace && s.replace !== "" ? s.replace : s.showReplace ? "" : null;

  return (
    <div className="search-view">
      <div className="sidebar-section-header">
        <span className="sidebar-section-title">Search</span>
        <div className="sidebar-actions">
          <IconButton icon="refresh" label="Refresh" onClick={runSearch} disabled={!s.query} />
          <IconButton icon="clear" label="Clear Search Results" onClick={clearSearch} disabled={!s.query} />
          <IconButton
            icon="collapse-all"
            label="Collapse All"
            disabled={!result?.files.length}
            onClick={() => setSearch({ collapsed: Object.fromEntries(result!.files.map((f) => [f.path, true])) }, false)}
          />
        </div>
      </div>
      <div className="search-form">
        <div className="search-row">
          <button
            type="button"
            className={`search-expand ${s.showReplace ? "open" : ""}`}
            aria-label="Toggle Replace"
            aria-expanded={s.showReplace}
            onClick={() => setSearch({ showReplace: !s.showReplace }, false)}
          >
            <Icon name="chevron-right" size={14} />
          </button>
          <div className="search-fields">
            <div className="input-box">
              <textarea
                ref={inputRef}
                rows={1}
                value={s.query}
                placeholder="Search"
                aria-label="Search"
                spellCheck={false}
                onChange={(e) => setSearch({ query: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    runSearch();
                  }
                  if (e.altKey && e.key.toLowerCase() === "c") { e.preventDefault(); setSearch({ caseSensitive: !s.caseSensitive }); }
                  if (e.altKey && e.key.toLowerCase() === "w") { e.preventDefault(); setSearch({ wholeWord: !s.wholeWord }); }
                  if (e.altKey && e.key.toLowerCase() === "r") { e.preventDefault(); setSearch({ isRegex: !s.isRegex }); }
                }}
              />
              <div className="input-toggles">
                <Toggle icon="case" label="Match Case (Alt+C)" active={s.caseSensitive} onClick={() => setSearch({ caseSensitive: !s.caseSensitive })} />
                <Toggle icon="word" label="Match Whole Word (Alt+W)" active={s.wholeWord} onClick={() => setSearch({ wholeWord: !s.wholeWord })} />
                <Toggle icon="regex" label="Use Regular Expression (Alt+R)" active={s.isRegex} onClick={() => setSearch({ isRegex: !s.isRegex })} />
              </div>
            </div>
            {s.showReplace && (
              <div className="input-box replace-box">
                <textarea
                  rows={1}
                  value={s.replace}
                  placeholder="Replace"
                  aria-label="Replace"
                  spellCheck={false}
                  onChange={(e) => setSearch({ replace: e.target.value }, false)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.ctrlKey && e.altKey) {
                      e.preventDefault();
                      replaceInFiles();
                    }
                  }}
                />
                <IconButton
                  icon="replace-all"
                  label="Replace All (Ctrl+Alt+Enter)"
                  disabled={!result?.totalMatches}
                  onClick={() => replaceInFiles()}
                />
              </div>
            )}
          </div>
        </div>
        <button type="button" className="search-details-toggle" onClick={() => setSearch({ showDetails: !s.showDetails }, false)} aria-expanded={s.showDetails}>
          <Icon name="more" size={14} />
          <span>{s.showDetails ? "Hide" : "Show"} include/exclude</span>
        </button>
        {s.showDetails && (
          <div className="search-details">
            <label>
              <span>Files to include</span>
              <input className="text-field" value={s.include} placeholder="e.g. *.ts, src/**" spellCheck={false} onChange={(e) => setSearch({ include: e.target.value })} />
            </label>
            <label>
              <span>Files to exclude</span>
              <div className="input-row">
                <input className="text-field" value={s.exclude} placeholder="e.g. *.test.ts" spellCheck={false} onChange={(e) => setSearch({ exclude: e.target.value })} />
                <Toggle icon="eye-off" label="Use Exclude Settings and Ignore Files" active={s.useDefaultExcludes} onClick={() => setSearch({ useDefaultExcludes: !s.useDefaultExcludes })} />
              </div>
            </label>
          </div>
        )}
      </div>

      <div className="search-summary" aria-live="polite">
        {s.running && <span className="progress-line" aria-label="Searching" />}
        {s.error && <span className="error-text">{s.error}</span>}
        {!s.error && result && (
          <span>
            {result.totalMatches === 0
              ? "No results found."
              : `${result.totalMatches}${result.truncated ? "+" : ""} result${result.totalMatches === 1 ? "" : "s"} in ${result.files.length} file${result.files.length === 1 ? "" : "s"}`}
            {result.truncated && " — refine your search to see all results."}
          </span>
        )}
      </div>

      <div className="search-results" role="tree" aria-label="Search results">
        {result?.files.map((f) => {
          const collapsed = s.collapsed[f.path];
          const rel = relative(root, f.path);
          const count = f.matches.reduce((n, m) => n + m.ranges.length, 0);
          return (
            <div key={f.path} className="search-file" role="treeitem" aria-expanded={!collapsed}>
              <div
                className="search-file-row"
                onClick={() => setSearch({ collapsed: { ...s.collapsed, [f.path]: !collapsed } }, false)}
                onContextMenu={(e) =>
                  openContextMenu(e, [
                    { label: "Open File", run: () => openFile(f.path) },
                    { label: "Replace in This File", disabled: !s.showReplace, run: () => replaceInFiles([f.path]) },
                    { label: "Copy Path", run: () => navigator.clipboard.writeText(f.path) },
                  ])
                }
                title={f.path}
              >
                <span className={`tree-twisty ${collapsed ? "" : "open"}`}>
                  <Icon name="chevron-right" size={14} />
                </span>
                <FileIcon name={f.path} />
                <span className="search-file-name">{basename(f.path)}</span>
                <span className="search-file-dir">{dirname(rel)}</span>
                <span className="count-badge">{count}</span>
                {s.showReplace && (
                  <button
                    type="button"
                    className="icon-btn row-action"
                    aria-label="Replace in file"
                    title="Replace in this file"
                    onClick={(e) => {
                      e.stopPropagation();
                      replaceInFiles([f.path]);
                    }}
                  >
                    <Icon name="replace" size={14} />
                  </button>
                )}
              </div>
              {!collapsed &&
                f.matches.map((m) => (
                  <button
                    type="button"
                    key={m.line}
                    className="search-match"
                    onClick={() =>
                      openFile(f.path, {
                        line: m.line,
                        column: m.ranges[0][0] + 1,
                        endColumn: m.ranges[0][1] + 1,
                        focus: false,
                      })
                    }
                    onDoubleClick={() => openFile(f.path, { line: m.line, column: m.ranges[0][0] + 1, endColumn: m.ranges[0][1] + 1, focus: true })}
                  >
                    <span className="search-line-no">{m.line}</span>
                    <Preview text={m.preview} ranges={m.ranges} replace={replacePreview} />
                  </button>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
