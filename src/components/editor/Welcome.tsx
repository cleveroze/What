import { useEffect, useState } from "react";
import { pickOpenFiles, pickOpenFolder } from "../../commands/builtin";
import { bindingFor, runCommand } from "../../commands/registry";
import { dirname } from "../../lib/path";
import type { ShapeName } from "../../lib/shapes";
import { useStore } from "../../lib/store";
import { newUntitled, openSettingsTab } from "../../state/editors";
import { progressStore, STEPS } from "../../state/progress";
import { setSetting, settingsStore } from "../../state/settings";
import { openContextMenu } from "../../state/ui";
import { openFolder, removeRecent, workspaceStore } from "../../state/workspace";
import { Icon } from "../Icon";
import { MorphShape, Shape, ShapeCycle } from "../Shape";
import { Button, Kbd } from "../ui/controls";

const HERO_SHAPES: ShapeName[] = ["cookie9", "clover4", "softBurst", "pentagon", "flower", "pill", "gem", "puffy"];

const TIPS: { title: string; text: string; command?: string; action?: string }[] = [
  { title: "Jump to any file", text: "Press Ctrl+P and type part of a file name — no need to dig through folders.", command: "workbench.quickOpen", action: "Try it" },
  { title: "Every action has a name", text: "Ctrl+Shift+P opens the command palette. Type what you want to do, like “format” or “theme”.", command: "workbench.commandPalette", action: "Open palette" },
  { title: "Several cursors at once", text: "Hold Alt and click to add cursors, or press Ctrl+D to select the next match of a word." },
  { title: "Move files by dragging", text: "Drag a file onto a folder in the Explorer to move it. Right-click for rename, copy and more." },
  { title: "A real terminal inside", text: "Press Ctrl+` to open PowerShell or CMD in your project folder.", command: "terminal.toggle", action: "Open terminal" },
  { title: "Never lose work", text: "Turn on Auto Save in the File menu, and Stride saves for you as you type.", command: "settings.open", action: "Settings" },
  { title: "Make it yours", text: "Choose colors, roundness, density and how lively animations are.", command: "settings.themes", action: "Customize" },
];

function ProgressRing({ value, total }: { value: number; total: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <svg className="progress-ring" width="56" height="56" viewBox="0 0 56 56" aria-label={`${value} of ${total} steps done`}>
      <circle cx="28" cy="28" r={r} className="progress-ring-track" />
      <circle cx="28" cy="28" r={r} className="progress-ring-value" strokeDasharray={c} strokeDashoffset={c * (1 - value / total)} />
      <text x="28" y="33" textAnchor="middle">
        {value}/{total}
      </text>
    </svg>
  );
}

function Checklist() {
  const done = useStore(progressStore, (s) => s.done);
  const count = STEPS.filter((s) => done[s.id]).length;
  return (
    <section className="welcome-section checklist" style={{ ["--i" as string]: 2 }}>
      <header className="checklist-header">
        <ProgressRing value={count} total={STEPS.length} />
        <div>
          <h2>{count === STEPS.length ? "You're all set!" : "First steps"}</h2>
          <p className="muted">
            {count === STEPS.length ? "You know the essentials. Happy coding!" : "A few things worth trying. Each one ticks itself off when you do it."}
          </p>
        </div>
        <button type="button" className="icon-btn" aria-label="Hide first steps" data-tip="Hide first steps" data-tip-desc="You can bring it back in Settings → General." onClick={() => setSetting("workbench.checklist", false)}>
          <Icon name="close" size={14} />
        </button>
      </header>
      <ol className="checklist-items">
        {STEPS.map((step, i) => {
          const ok = !!done[step.id];
          return (
            <li key={step.id} style={{ ["--i" as string]: i }}>
              <button type="button" className={`checklist-item ${ok ? "done" : ""}`} onClick={() => runCommand(step.command)}>
                <span className="checklist-shape">
                  <MorphShape name={ok ? "circle" : step.shape} size={30} fill={ok ? "var(--accent)" : "var(--accent-soft)"} spin={120} />
                  <Icon name={ok ? "check" : "arrow-right"} size={14} className="checklist-glyph" />
                </span>
                <span className="checklist-text">
                  <span className="checklist-title">{step.title}</span>
                  <span className="checklist-hint">{step.hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Tips() {
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      setDir(1);
      setIndex((i) => (i + 1) % TIPS.length);
    }, 8000);
    return () => clearInterval(id);
  }, [paused]);
  const go = (d: number) => {
    setDir(d);
    setIndex((i) => (i + d + TIPS.length) % TIPS.length);
  };
  const tip = TIPS[index];
  return (
    <section className="welcome-section tips" style={{ ["--i" as string]: 3 }} onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}>
      <div className="tips-head">
        <h2>Tip</h2>
        <div className="tips-nav">
          <button type="button" className="icon-btn" aria-label="Previous tip" onClick={() => go(-1)}>
            <Icon name="chevron-right" size={14} style={{ transform: "scaleX(-1)" }} />
          </button>
          <span className="tips-dots" aria-hidden>
            {TIPS.map((_, i) => (
              <span key={i} className={i === index ? "on" : ""} />
            ))}
          </span>
          <button type="button" className="icon-btn" aria-label="Next tip" onClick={() => go(1)}>
            <Icon name="chevron-right" size={14} />
          </button>
        </div>
      </div>
      <div className={`tip-card ${dir > 0 ? "from-right" : "from-left"}`} key={index} aria-live="polite">
        <Shape name={HERO_SHAPES[index % HERO_SHAPES.length]} size={34} fill="var(--accent-soft)" className="tip-shape" />
        <div className="tip-body">
          <div className="tip-title">{tip.title}</div>
          <div className="tip-text">{tip.text}</div>
          {tip.command && (
            <button type="button" className="tip-action" onClick={() => runCommand(tip.command!)}>
              {tip.action} <Kbd binding={bindingFor(tip.command)} />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

export function Welcome() {
  const recent = useStore(workspaceStore, (s) => s.recent);
  const root = useStore(workspaceStore, (s) => s.root);
  const checklist = useStore(settingsStore, (s) => s["workbench.checklist"]);
  const tips = useStore(settingsStore, (s) => s["workbench.tips"]);
  const [heroHover, setHeroHover] = useState(false);

  const cards: { label: string; desc: string; icon: string; shape: ShapeName; run: () => void; command: string }[] = [
    { label: "New file", desc: "Start typing right away", icon: "new-file", shape: "cookie4", run: () => newUntitled(), command: "file.newFile" },
    { label: "Open file", desc: "Edit a single file", icon: "file", shape: "pentagon", run: pickOpenFiles, command: "file.open" },
    { label: "Open folder", desc: "Work on a whole project", icon: "folder-open", shape: "clover4", run: pickOpenFolder, command: "file.openFolder" },
    { label: "Customize", desc: "Colors, shapes, motion", icon: "palette", shape: "flower", run: () => openSettingsTab("themes"), command: "settings.themes" },
  ];

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <section className="welcome-hero" style={{ ["--i" as string]: 0 }}>
          <div className="hero-art" onPointerEnter={() => setHeroHover(true)} onPointerLeave={() => setHeroHover(false)}>
            {heroHover ? (
              <MorphShape name="softBoom" size={132} fill="var(--accent-soft)" spin={90} className="hero-shape" />
            ) : (
              <ShapeCycle shapes={HERO_SHAPES} size={132} interval={2600} spin={60} fill="var(--accent-soft)" className="hero-shape" />
            )}
            <svg className="hero-chevrons" viewBox="0 0 100 100" width="64" height="64" aria-hidden>
              <path d="M28 30 L48 50 L28 70 M54 30 L74 50 L54 70" fill="none" stroke="var(--accent)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="hero-text">
            <h1>{root ? "Ready when you are" : "Welcome to Stride"}</h1>
            <p>{root ? "Pick a file in the Explorer, or press Ctrl+P to jump straight to one." : "A friendly, fast code editor. Open a folder to start a project, or just create a new file."}</p>
            <div className="hero-actions">
              {!root && (
                <Button variant="filled" icon="folder-open" onClick={pickOpenFolder}>
                  Open folder
                </Button>
              )}
              <Button variant={root ? "filled" : "tonal"} icon="new-file" onClick={() => newUntitled()}>
                New file
              </Button>
              <Button variant="text" icon="search" onClick={() => runCommand("workbench.commandPalette")}>
                All commands
              </Button>
            </div>
          </div>
        </section>

        <section className="welcome-cards" style={{ ["--i" as string]: 1 }}>
          {cards.map((c, i) => (
            <button key={c.label} type="button" className="welcome-card" style={{ ["--i" as string]: i }} onClick={c.run}>
              <span className="welcome-card-shape">
                <Shape name={c.shape} size={44} fill="var(--accent-soft)" />
                <Icon name={c.icon} size={20} className="welcome-card-icon" />
              </span>
              <span className="welcome-card-label">{c.label}</span>
              <span className="welcome-card-desc">{c.desc}</span>
              <Kbd binding={bindingFor(c.command)} />
            </button>
          ))}
        </section>

        <div className="welcome-columns">
          <div className="welcome-col">
            {checklist && <Checklist />}
            {tips && <Tips />}
          </div>
          <section className="welcome-section recent" style={{ ["--i" as string]: 4 }}>
            <h2>Recent folders</h2>
            {recent.length === 0 && (
              <div className="recent-empty">
                <Shape name="ghostish" size={40} fill="var(--accent-soft)" />
                <p className="muted">Folders you open will show up here, so you can get back to them in one click.</p>
              </div>
            )}
            {recent.slice(0, 7).map((r, i) => (
              <button
                type="button"
                key={r.path}
                className="welcome-recent"
                style={{ ["--i" as string]: i }}
                data-tip={r.path}
                onClick={() => openFolder(r.path)}
                onContextMenu={(e) => openContextMenu(e, [{ label: "Remove from Recent", run: () => removeRecent(r.path) }])}
              >
                <Icon name="folder" size={15} />
                <span className="welcome-recent-name">{r.name}</span>
                <span className="welcome-recent-path">{dirname(r.path)}</span>
              </button>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
