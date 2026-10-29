import type { CSSProperties } from "react";
import { withAlpha } from "../../lib/color";
import type { Settings } from "../../state/settings";
import { tokenVars } from "../../theme/engine";
import type { ThemeTokens } from "../../theme/tokens";

type Tok = [string, keyof ThemeTokens["syntax"] | null];

const SAMPLE: Tok[][] = [
  [["// Render a greeting for each user", "comment"]],
  [["import", "keyword"], [" { ", null], ["format", "variable"], [" } ", null], ["from", "keyword"], [" ", null], ['"./util"', "string"], [";", "operator"]],
  [],
  [["export", "keyword"], [" ", null], ["function", "keyword"], [" ", null], ["greet", "function"], ["(", "operator"], ["users", "variable"], [": ", "operator"], ["User", "type"], ["[]", "operator"], [") {", "operator"]],
  [["  ", null], ["for", "control"], [" (", "operator"], ["const", "keyword"], [" u ", null], ["of", "keyword"], [" users) {", null]],
  [["    ", null], ["const", "keyword"], [" n = u.", null], ["visits", "property"], [" + ", "operator"], ["1", "number"], [";", "operator"]],
  [["    console.", null], ["log", "function"], ["(", "operator"], ["`Hi ${u.", "string"], ["name", "property"], ["}`", "string"], [", n);", null]],
  [["  }", null]],
  [["}", null]],
];

/** A miniature, faithful rendering of the workbench using a candidate token
 * set, so palette and shape changes can be judged before (or while) applying. */
export function ThemePreview({ tokens, settings, compact = false }: { tokens: ThemeTokens; settings: Settings; compact?: boolean }) {
  const vars = tokenVars(tokens) as unknown as CSSProperties;
  const r = settings["ui.radius"];
  const style = {
    ...vars,
    ["--pv-r" as string]: `${Math.round(r * 0.8)}px`,
    ["--pv-code-font" as string]: settings["editor.fontFamily"],
    ["--pv-ui-font" as string]: settings["ui.fontFamily"],
  } as CSSProperties;
  const right = settings["layout.sidebarPosition"] === "right";
  const activity = settings["layout.activityBarVisible"];
  const activityTop = settings["layout.activityBarPosition"] === "top";
  return (
    <div className={`theme-preview ${compact ? "compact" : ""} ${right ? "right" : ""}`} style={style} aria-label="Theme preview" role="img">
      <div className="pv-titlebar">
        <span className="pv-dot" />
        <span className="pv-menu">File</span>
        <span className="pv-menu">Edit</span>
        <span className="pv-menu">View</span>
        <span className="pv-cc">project</span>
      </div>
      <div className="pv-body">
        {activity && !activityTop && (
          <div className="pv-activity">
            <span className="pv-act active" />
            <span className="pv-act" />
            <span className="pv-act" />
          </div>
        )}
        <div className="pv-sidebar">
          {activity && activityTop && (
            <div className="pv-activity-top">
              <span className="pv-act active" />
              <span className="pv-act" />
              <span className="pv-act" />
            </div>
          )}
          <div className="pv-heading">PROJECT</div>
          {["src", "components", "App.tsx", "main.tsx", "styles.css", "README.md"].map((n, i) => (
            <div key={n} className={`pv-row ${i === 2 ? "selected" : ""}`} style={{ paddingLeft: i === 0 ? 6 : i < 2 ? 14 : 22 }}>
              <span className="pv-ico" style={{ background: i < 2 ? withAlpha(tokens.textMuted, 0.5) : tokens.syntax[(["type", "keyword", "function", "string"] as const)[i % 4]] }} />
              {n}
            </div>
          ))}
        </div>
        <div className="pv-editor">
          <div className="pv-tabs">
            <span className="pv-tab active">App.tsx</span>
            <span className="pv-tab">main.tsx<span className="pv-dirty" /></span>
          </div>
          <pre className="pv-code">
            {SAMPLE.map((line, i) => (
              <div key={i} className={`pv-line ${i === 5 ? "current" : ""}`}>
                <span className="pv-ln">{i + 1}</span>
                <span>
                  {line.map(([text, kind], j) => (
                    <span key={j} style={kind ? { color: tokens.syntax[kind], fontStyle: kind === "comment" ? "italic" : undefined } : undefined}>
                      {text}
                    </span>
                  ))}
                  {i === 5 && <span className="pv-cursor" />}
                </span>
              </div>
            ))}
          </pre>
        </div>
      </div>
      {settings["layout.statusBarVisible"] && (
        <div className="pv-status">
          <span>Ln 6, Col 24</span>
          <span>UTF-8</span>
          <span>TypeScript</span>
        </div>
      )}
    </div>
  );
}
