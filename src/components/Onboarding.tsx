import { useEffect, useRef, useState } from "react";
import { pickOpenFolder } from "../commands/builtin";
import type { ShapeName } from "../lib/shapes";
import { useStore } from "../lib/store";
import { onboardingStore } from "../state/ui";
import { newUntitled } from "../state/editors";
import { setSetting, settingsStore, type PresetId } from "../state/settings";
import { workspaceStore } from "../state/workspace";
import { revealThemeFrom, tokensFor } from "../theme/engine";
import { PRESETS } from "../theme/presets";
import { Icon } from "./Icon";
import { MorphShape, Shape } from "./Shape";
import { Button, Segmented, Slider, Switch } from "./ui/controls";

const STEP_SHAPES: ShapeName[] = ["softBurst", "flower", "cookie9", "heart"];
const PRESET_SHAPES: Record<PresetId, ShapeName> = {
  cream: "cookie9",
  graphite: "gem",
  ocean: "clover4",
  forest: "flower",
  monochrome: "square",
};

function LookStep() {
  const s = useStore(settingsStore, (x) => x);
  return (
    <div className="ob-body">
      <h2>Pick your look</h2>
      <p className="muted">You can change this any time — try a few, changes apply instantly.</p>
      <div className="ob-row">
        <span className="ob-label">Theme</span>
        <Segmented
          value={s["theme.mode"]}
          onChange={(v) => setSetting("theme.mode", v)}
          label="Theme mode"
          options={[
            { value: "system", label: "Like Windows", icon: "monitor" },
            { value: "light", label: "Light", icon: "sun" },
            { value: "dark", label: "Dark", icon: "moon" },
          ]}
        />
      </div>
      <div className="ob-presets">
        {PRESETS.map((p, i) => {
          const t = tokensFor(s, { preset: p.id });
          const selected = s["theme.preset"] === p.id;
          return (
            <button
              key={p.id}
              type="button"
              className={`ob-preset ${selected ? "selected" : ""}`}
              style={{ background: t.surface, color: t.text, ["--i" as string]: i }}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                revealThemeFrom(r.left + r.width / 2, r.top + r.height / 2, () => setSetting("theme.preset", p.id));
              }}
            >
              <span className="ob-preset-art" style={{ background: t.editor }}>
                <MorphShape name={selected ? "softBurst" : PRESET_SHAPES[p.id]} size={46} fill={t.accent} spin={90} />
                <span className="ob-preset-lines">
                  <i style={{ background: t.syntax.keyword }} />
                  <i style={{ background: t.syntax.string }} />
                  <i style={{ background: t.syntax.function }} />
                </span>
              </span>
              <span className="ob-preset-name">
                {p.name}
                {selected && <Icon name="check" size={14} />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ComfortStep() {
  const s = useStore(settingsStore, (x) => x);
  return (
    <div className="ob-body">
      <h2>Make it comfortable</h2>
      <p className="muted">Bigger text is easier on the eyes; motion can be calmed down or switched off.</p>
      <div className="ob-sample" style={{ fontFamily: s["editor.fontFamily"], fontSize: s["editor.fontSize"] }}>
        <span style={{ color: "var(--syn-keyword)" }}>const</span> greeting = <span style={{ color: "var(--syn-string)" }}>"Hello, Stride!"</span>;
      </div>
      <div className="ob-row">
        <span className="ob-label">Code text size</span>
        <Slider value={s["editor.fontSize"]} min={10} max={24} onChange={(v) => setSetting("editor.fontSize", v)} format={(v) => `${v}px`} label="Code text size" />
      </div>
      <div className="ob-row">
        <span className="ob-label">Spacing</span>
        <Segmented
          value={s["ui.density"]}
          onChange={(v) => setSetting("ui.density", v)}
          label="UI density"
          options={[
            { value: "compact", label: "Compact" },
            { value: "default", label: "Default" },
            { value: "comfortable", label: "Roomy" },
          ]}
        />
      </div>
      <div className="ob-row">
        <span className="ob-label">Animations</span>
        <Segmented
          value={s["ui.animation"]}
          onChange={(v) => setSetting("ui.animation", v)}
          label="Animations"
          options={[
            { value: "off", label: "Off" },
            { value: "reduced", label: "Calm" },
            { value: "normal", label: "Lively" },
          ]}
        />
      </div>
      <div className="ob-row">
        <span className="ob-label">
          Beginner hints
          <small>Explanations in tooltips, tips and a “first steps” checklist</small>
        </span>
        <Switch checked={s["workbench.tips"]} onChange={(v) => {
          setSetting("workbench.tips", v);
          setSetting("workbench.checklist", v);
        }} label="Beginner hints" />
      </div>
    </div>
  );
}

export function Onboarding() {
  const open = useStore(onboardingStore, (s) => s.open);
  const onboarded = useStore(settingsStore, (s) => s["workbench.onboarded"]);
  const ready = useStore(workspaceStore, (s) => s.ready);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const ref = useRef<HTMLDivElement>(null);
  const visible = open || (ready && !onboarded);

  useEffect(() => {
    if (visible) {
      setStep(0);
      requestAnimationFrame(() => ref.current?.querySelector<HTMLButtonElement>(".ob-next")?.focus());
    }
  }, [visible]);

  if (!visible) return null;

  const finish = (then?: () => void) => {
    setSetting("workbench.onboarded", true);
    onboardingStore.set({ open: false });
    then?.();
  };
  const go = (d: number) => {
    setDir(d);
    setStep((x) => Math.max(0, Math.min(3, x + d)));
  };

  return (
    <div className="scrim ob-scrim" onKeyDown={(e) => e.key === "Escape" && finish()}>
      <div ref={ref} className="onboarding" role="dialog" aria-modal="true" aria-label="Welcome to Stride">
        <div className="ob-art">
          <MorphShape name={STEP_SHAPES[step]} size={180} fill="var(--accent)" spin={90} className="ob-art-shape" />
          <svg className="ob-art-chevrons" viewBox="0 0 100 100" width="84" height="84" aria-hidden>
            <path d="M28 30 L48 50 L28 70 M54 30 L74 50 L54 70" fill="none" stroke="var(--on-accent)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="ob-orbit o1"><Shape name="clover4" size={26} fill="var(--accent-soft)" /></span>
          <span className="ob-orbit o2"><Shape name="cookie7" size={18} fill="var(--accent-soft)" /></span>
          <span className="ob-orbit o3"><Shape name="sunny" size={22} fill="var(--accent-soft)" /></span>
        </div>
        <div className="ob-main">
          <div className={`ob-step ${dir > 0 ? "from-right" : "from-left"}`} key={step}>
            {step === 0 && (
              <div className="ob-body">
                <h2>Hi! Welcome to Stride</h2>
                <p className="muted">A code editor that stays out of your way. Let's set it up in three quick steps — it takes less than a minute.</p>
                <ul className="ob-points">
                  <li><Shape name="cookie9" size={22} fill="var(--accent-soft)" /><span><b>Explorer</b> on the left shows your project's files.</span></li>
                  <li><Shape name="clover4" size={22} fill="var(--accent-soft)" /><span><b>Ctrl+Shift+P</b> finds any command by name — you never need to memorize menus.</span></li>
                  <li><Shape name="pill" size={22} fill="var(--accent-soft)" /><span>Hover any button to see what it does.</span></li>
                </ul>
              </div>
            )}
            {step === 1 && <LookStep />}
            {step === 2 && <ComfortStep />}
            {step === 3 && (
              <div className="ob-body">
                <h2>You're ready!</h2>
                <p className="muted">How would you like to start? You can always reopen this tour from Help → Welcome Tour.</p>
                <div className="ob-start">
                  <button type="button" className="welcome-card" onClick={() => finish(pickOpenFolder)}>
                    <span className="welcome-card-shape"><Shape name="clover4" size={44} fill="var(--accent-soft)" /><Icon name="folder-open" size={20} className="welcome-card-icon" /></span>
                    <span className="welcome-card-label">Open a folder</span>
                    <span className="welcome-card-desc">Work on an existing project</span>
                  </button>
                  <button type="button" className="welcome-card" onClick={() => finish(() => newUntitled())}>
                    <span className="welcome-card-shape"><Shape name="cookie4" size={44} fill="var(--accent-soft)" /><Icon name="new-file" size={20} className="welcome-card-icon" /></span>
                    <span className="welcome-card-label">New file</span>
                    <span className="welcome-card-desc">Start writing right away</span>
                  </button>
                  <button type="button" className="welcome-card" onClick={() => finish()}>
                    <span className="welcome-card-shape"><Shape name="flower" size={44} fill="var(--accent-soft)" /><Icon name="eye" size={20} className="welcome-card-icon" /></span>
                    <span className="welcome-card-label">Look around</span>
                    <span className="welcome-card-desc">Explore at your own pace</span>
                  </button>
                </div>
              </div>
            )}
          </div>
          <footer className="ob-footer">
            <span className="ob-dots" aria-label={`Step ${step + 1} of 4`}>
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={i === step ? "on" : i < step ? "past" : ""} />
              ))}
            </span>
            <span className="ob-spacer" />
            {step < 3 && (
              <Button variant="text" onClick={() => finish()}>
                Skip
              </Button>
            )}
            {step > 0 && (
              <Button variant="tonal" onClick={() => go(-1)}>
                Back
              </Button>
            )}
            {step < 3 && (
              <Button variant="filled" className="ob-next" onClick={() => go(1)}>
                {step === 0 ? "Let's go" : "Next"}
              </Button>
            )}
          </footer>
        </div>
      </div>
    </div>
  );
}
