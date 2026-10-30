import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { fs, state as nativeState } from "../../ipc/native";
import { fuzzyMatch } from "../../lib/fuzzy";
import { useStore } from "../../lib/store";
import { debounce } from "../../lib/util";
import { editorStore } from "../../state/editors";
import {
  DEFAULT_SETTINGS,
  exportSettings,
  replaceSettings,
  resetSetting,
  sanitizeSettings,
  setSetting,
  settingsStore,
  type ActivityItemId,
  type Settings,
} from "../../state/settings";
import { loadShells, terminalStore } from "../../state/terminals";
import { confirm, notify, reportError } from "../../state/ui";
import { resolveDark, themeStore, tokensFor } from "../../theme/engine";
import { presetsStore, type Preset } from "../../theme/presets";
import { ACTIVITY_LABELS } from "../ActivityBar";
import type { ShapeName } from "../../lib/shapes";
import { openOnboarding } from "../../state/ui";
import { Icon } from "../Icon";
import { MorphShape } from "../Shape";
import { Button, ColorField, IconButton, NumberField, Segmented, Select, Slider, Switch, TextField } from "../ui/controls";
import { SECTIONS, SETTINGS, type SectionId, type SettingDef } from "./schema";
import { ShortcutsEditor } from "./ShortcutsEditor";
import { AiSection } from "./AiSection";
import { ThemePreview } from "./ThemePreview";

const SECTION_SHAPES: Record<SectionId, ShapeName> = {
  general: "cookie9",
  editor: "pentagon",
  appearance: "flower",
  themes: "clover4",
  terminal: "pill",
  files: "arch",
  shortcuts: "cookie4",
  advanced: "softBurst",
  ai: "sunny",
};

const ACCENT_SWATCHES = ["#c0612b", "#3f7cc0", "#1f8a8a", "#3e8a4f", "#8a5cc0", "#c04a6a", "#262626"];

function ActivityItemsControl({ settings }: { settings: Settings }) {
  const order = settings["layout.activityItems"];
  const hidden = settings["layout.hiddenActivityItems"];
  const move = (i: number, d: number) => {
    const next = [...order];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setSetting("layout.activityItems", next);
  };
  const toggle = (id: ActivityItemId) =>
    setSetting("layout.hiddenActivityItems", hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id]);
  return (
    <ul className="activity-items-control">
      {order.map((id, i) => (
        <li key={id} className={hidden.includes(id) ? "off" : ""}>
          <Switch checked={!hidden.includes(id)} onChange={() => toggle(id)} label={`Show ${ACTIVITY_LABELS[id]}`} />
          <span className="aic-label">{ACTIVITY_LABELS[id]}</span>
          <IconButton icon="chevron-up" label="Move up" disabled={i === 0} onClick={() => move(i, -1)} />
          <IconButton icon="chevron-down" label="Move down" disabled={i === order.length - 1} onClick={() => move(i, 1)} />
        </li>
      ))}
    </ul>
  );
}

function ShellControl({ value }: { value: string }) {
  const shells = useStore(terminalStore, (s) => s.shells);
  useEffect(() => {
    loadShells();
  }, []);
  if (!shells.length) return <span className="muted">Detecting shells…</span>;
  const current = shells.find((s) => s.id === value) ?? shells[0];
  return (
    <Select
      value={current.id}
      options={shells.map((s) => ({ value: s.id, label: s.name }))}
      onChange={(v) => setSetting("terminal.shell", v)}
      label="Default shell"
    />
  );
}

function SettingControl({ def, settings }: { def: SettingDef; settings: Settings }) {
  const value = settings[def.key] as never;
  const set = (v: unknown) => setSetting(def.key, v as never);
  const c = def.control;
  switch (c.type) {
    case "toggle":
      return <Switch checked={value} onChange={set} label={def.label} />;
    case "segmented":
      return <Segmented value={value} options={c.options} onChange={set} label={def.label} />;
    case "select":
      return <Select value={value} options={c.options} onChange={set} label={def.label} />;
    case "number":
      return <NumberField value={value} min={c.min} max={c.max} step={c.step} onChange={set} label={def.label} />;
    case "slider":
      return (
        <Slider
          value={value}
          min={c.min}
          max={c.max}
          step={c.step}
          onChange={set}
          label={def.label}
          format={(v) => `${c.decimals ? v.toFixed(c.decimals) : v}${c.unit ?? ""}`}
        />
      );
    case "text":
      return <TextField value={value} onCommit={set} placeholder={c.placeholder} monospace={c.monospace} label={def.label} />;
    case "color": {
      const t = themeStore.get().tokens;
      const placeholder = c.role === "accent" ? t.accent : c.role === "background" ? t.bg : t.surface;
      return <ColorField value={value} onChange={set} placeholder={placeholder} swatches={c.role === "accent" ? ACCENT_SWATCHES : []} />;
    }
    case "shell":
      return <ShellControl value={value} />;
    case "activityItems":
      return <ActivityItemsControl settings={settings} />;
  }
}

function SettingRow({ def, settings, showSection, index = 0 }: { def: SettingDef; settings: Settings; showSection?: boolean; index?: number }) {
  const modified = JSON.stringify(settings[def.key]) !== JSON.stringify(DEFAULT_SETTINGS[def.key]);
  return (
    <div className={`setting-row ${def.wide ? "wide" : ""} ${modified ? "modified" : ""}`} data-key={def.key} style={{ ["--i" as string]: Math.min(index, 14) }}>
      <div className="setting-text">
        <div className="setting-label">
          {showSection && <span className="setting-section-tag">{SECTIONS.find((s) => s.id === def.section)?.label} ›</span>}
          {def.label}
          {modified && (
            <button type="button" className="setting-reset" title="Reset to default" aria-label={`Reset ${def.label}`} onClick={() => resetSetting(def.key)}>
              <Icon name="reset" size={12} />
            </button>
          )}
        </div>
        <div className="setting-desc">{def.description}</div>
      </div>
      <div className="setting-control">
        <SettingControl def={def} settings={settings} />
      </div>
    </div>
  );
}

function Groups({ defs, settings }: { defs: SettingDef[]; settings: Settings }) {
  let counter = 0;
  const groups = new Map<string, SettingDef[]>();
  for (const d of defs) {
    const g = d.group ?? "";
    groups.set(g, [...(groups.get(g) ?? []), d]);
  }
  return (
    <>
      {[...groups.entries()].map(([g, list]) => (
        <section key={g} className="settings-group">
          {g && <h3>{g}</h3>}
          <div className="settings-card">
            {list.map((d) => (
              <SettingRow key={d.key} def={d} settings={settings} index={counter++} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function PresetCard({ preset, settings, onHover }: { preset: Preset; settings: Settings; onHover: (p: Preset | null) => void }) {
  const selected = settings["theme.preset"] === preset.id;
  const light = tokensFor({ ...settings, "theme.accent": "", "theme.background": "", "theme.surface": "" }, { preset: preset.id, dark: false });
  const dark = tokensFor({ ...settings, "theme.accent": "", "theme.background": "", "theme.surface": "" }, { preset: preset.id, dark: true });
  const strip = (t: typeof light) => (
    <span className="preset-strip" style={{ background: t.editor }}>
      <span style={{ background: t.bg }} />
      <span style={{ background: t.surface }} />
      <span className="preset-accent" style={{ background: t.accent }} />
      <span className="preset-syn">
        {(["keyword", "function", "string", "type", "number"] as const).map((k) => (
          <i key={k} style={{ background: t.syntax[k] }} />
        ))}
      </span>
    </span>
  );
  return (
    <button
      type="button"
      className={`preset-card ${selected ? "selected" : ""}`}
      aria-pressed={selected}
      onClick={() => setSetting("theme.preset", preset.id)}
      onPointerEnter={() => onHover(preset)}
      onPointerLeave={() => onHover(null)}
      onFocus={() => onHover(preset)}
      onBlur={() => onHover(null)}
    >
      <span className="preset-swatches">
        {strip(light)}
        {strip(dark)}
      </span>
      <span className="preset-name">
        {preset.name}
        {selected && <Icon name="check" size={14} />}
      </span>
      <span className="preset-desc">{preset.description}</span>
    </button>
  );
}

function ThemesSection({ settings }: { settings: Settings }) {
  const [hover, setHover] = useState<Preset | null>(null);
  const presets = useStore(presetsStore, (x) => x.presets);
  const tokens = hover ? tokensFor(settings, { preset: hover.id }) : themeStore.get().tokens;
  useStore(themeStore, (s) => s.tokens);
  return (
    <>
      <div className="themes-hero">
        <ThemePreview tokens={tokens} settings={settings} />
        <div className="themes-hero-side">
          <div className="themes-hero-label">{hover ? `Previewing ${hover.name}` : "Live preview"}</div>
          <Segmented
            value={settings["theme.mode"]}
            onChange={(v) => setSetting("theme.mode", v)}
            label="Theme mode"
            options={[
              { value: "system", label: "System", icon: "monitor" },
              { value: "light", label: "Light", icon: "sun" },
              { value: "dark", label: "Dark", icon: "moon" },
            ]}
          />
          <p className="muted">
            {settings["theme.mode"] === "system" ? `Following Windows (${resolveDark(settings) ? "dark" : "light"}).` : "Hover a preset to preview it here."}
          </p>
        </div>
      </div>
      <section className="settings-group">
        <h3>Presets</h3>
        <div className="preset-grid">
          {presets.map((p) => (
            <PresetCard key={p.id} preset={p} settings={settings} onHover={setHover} />
          ))}
        </div>
      </section>
      <Groups defs={SETTINGS.filter((d) => d.section === "themes")} settings={settings} />
    </>
  );
}

function CustomCssEditor({ settings }: { settings: Settings }) {
  const [draft, setDraft] = useState(settings["advanced.customCss"]);
  const commit = useMemo(() => debounce((v: string) => setSetting("advanced.customCss", v), 400), []);
  useEffect(() => setDraft(settings["advanced.customCss"]), [settings["advanced.customCss"]]);
  return (
    <div className="setting-row wide">
      <div className="setting-text">
        <div className="setting-label">Custom CSS</div>
        <div className="setting-desc">
          Applied live on top of the built-in styles. Theme tokens are available as variables, e.g. <code>--accent</code>, <code>--surface</code>, <code>--r-md</code>.
        </div>
      </div>
      <textarea
        className="css-editor"
        spellCheck={false}
        value={draft}
        placeholder={".tab.active { font-weight: 600; }\n.tree-row.selected { border-radius: var(--r-xl); }"}
        onChange={(e) => {
          setDraft(e.target.value);
          commit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Tab") {
            e.preventDefault();
            const t = e.currentTarget;
            const { selectionStart: s, selectionEnd: en } = t;
            const v = t.value.slice(0, s) + "  " + t.value.slice(en);
            setDraft(v);
            commit(v);
            requestAnimationFrame(() => t.setSelectionRange(s + 2, s + 2));
          }
        }}
        aria-label="Custom CSS"
      />
    </div>
  );
}

function AdvancedSection({ settings }: { settings: Settings }) {
  const [dir, setDir] = useState("");
  useEffect(() => {
    nativeState.dir().then(setDir).catch(() => {});
  }, []);
  const doExport = async () => {
    const path = await saveDialog({ defaultPath: "stride-settings.json", filters: [{ name: "JSON", extensions: ["json"] }] });
    if (!path) return;
    try {
      await fs.writeText(path, exportSettings(), "utf8");
      notify("success", "Settings exported", path);
    } catch (e) {
      reportError("Export failed", e);
    }
  };
  const doImport = async () => {
    const path = await openDialog({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] });
    if (typeof path !== "string") return;
    try {
      const file = await fs.readText(path);
      replaceSettings(sanitizeSettings(JSON.parse(file.content)));
      notify("success", "Settings imported", path);
    } catch (e) {
      reportError("Import failed", e);
    }
  };
  const doReset = async () => {
    if (await confirm("Reset all settings", "Restore every setting to its default value? Key bindings are kept.", "Reset", true)) {
      replaceSettings({ ...DEFAULT_SETTINGS });
    }
  };
  return (
    <>
      <section className="settings-group">
        <h3>Styling</h3>
        <div className="settings-card">
          <CustomCssEditor settings={settings} />
        </div>
      </section>
      <section className="settings-group">
        <h3>Settings data</h3>
        <div className="settings-card">
          <div className="setting-row">
            <div className="setting-text">
              <div className="setting-label">Settings folder</div>
              <div className="setting-desc mono">{dir || "…"}</div>
            </div>
            <div className="setting-control">
              <Button variant="tonal" icon="reveal" disabled={!dir} onClick={() => fs.reveal(dir)}>
                Reveal
              </Button>
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-text">
              <div className="setting-label">Export and import</div>
              <div className="setting-desc">Save your customized settings to a JSON file, or load them on another machine.</div>
            </div>
            <div className="setting-control row">
              <Button variant="tonal" icon="download" onClick={doExport}>
                Export…
              </Button>
              <Button variant="tonal" icon="upload" onClick={doImport}>
                Import…
              </Button>
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-text">
              <div className="setting-label">Reset all settings</div>
              <div className="setting-desc">Return every option to its default value.</div>
            </div>
            <div className="setting-control">
              <Button variant="danger" icon="reset" onClick={doReset}>
                Reset…
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export default function SettingsPage() {
  const settings = useStore(settingsStore, (s) => s);
  const section = useStore(editorStore, (s) => s.settingsSection) as SectionId;
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useStore(themeStore, (s) => s.tokens);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [section]);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return null;
    return SETTINGS.map((d) => {
      const m = fuzzyMatch(q, `${d.label} ${d.key}`) ?? fuzzyMatch(q, d.description);
      return m && { d, score: m.score };
    })
      .filter((x): x is { d: SettingDef; score: number } => !!x && x.score > q.length * 0.6)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.d);
  }, [query]);

  const meta = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  const counts = useMemo(() => {
    if (!results) return null;
    const c: Record<string, number> = {};
    for (const d of results) c[d.section] = (c[d.section] ?? 0) + 1;
    return c;
  }, [results]);

  return (
    <div className="settings-page">
      <nav className="settings-nav" aria-label="Settings sections">
        <div className="input-box settings-search">
          <Icon name="search" size={14} />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search settings"
            spellCheck={false}
            aria-label="Search settings"
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
          />
          {query && <IconButton icon="close" label="Clear search" onClick={() => setQuery("")} size={14} />}
        </div>
        <ul style={{ ["--nav-index" as string]: SECTIONS.findIndex((s) => s.id === section) }}>
          <li className={`settings-nav-indicator ${results ? "hidden" : ""}`} aria-hidden />
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className={`settings-nav-item ${!results && s.id === section ? "active" : ""}`}
                aria-current={!results && s.id === section ? "page" : undefined}
                onClick={() => {
                  setQuery("");
                  editorStore.update({ settingsSection: s.id });
                }}
              >
                <Icon name={s.icon} size={15} />
                <span>{s.label}</span>
                {counts && counts[s.id] ? <span className="count-badge">{counts[s.id]}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="settings-content" ref={contentRef}>
        <div className="settings-content-inner" key={results ? "search" : section}>
          {results ? (
            <>
              <header className="settings-header">
                <h1>Search results</h1>
                <p>
                  {results.length} setting{results.length === 1 ? "" : "s"} matching “{query}”
                </p>
              </header>
              {results.length > 0 && (
                <div className="settings-card">
                  {results.map((d, i) => (
                    <SettingRow key={d.key} def={d} settings={settings} showSection index={i} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <header className="settings-header with-art">
                <span className="settings-header-art">
                  <MorphShape name={SECTION_SHAPES[section] ?? "circle"} size={52} fill="var(--accent-soft)" spin={90} />
                  <Icon name={meta.icon} size={22} />
                </span>
                <div>
                  <h1>{meta.label}</h1>
                  <p>{meta.description}</p>
                </div>
                {section === "general" && (
                  <Button variant="tonal" icon="sliders" onClick={openOnboarding}>
                    Welcome tour
                  </Button>
                )}
              </header>
              {section === "appearance" && (
                <div className="appearance-preview">
                  <ThemePreview tokens={themeStore.get().tokens} settings={settings} compact />
                </div>
              )}
              {section === "themes" ? (
                <ThemesSection settings={settings} />
              ) : section === "shortcuts" ? (
                <ShortcutsEditor />
              ) : section === "ai" ? (
                <AiSection />
              ) : section === "advanced" ? (
                <AdvancedSection settings={settings} />
              ) : (
                <Groups defs={SETTINGS.filter((d) => d.section === section)} settings={settings} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
