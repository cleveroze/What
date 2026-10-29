import { withAlpha } from "../lib/color";
import { createStore } from "../lib/store";
import { settingsStore, type Settings } from "../state/settings";
import { presetById } from "./presets";
import { computeTokens, type ThemeTokens } from "./tokens";

const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

export function resolveDark(s: Settings): boolean {
  return s["theme.mode"] === "dark" || (s["theme.mode"] === "system" && systemDark.matches);
}

export function tokensFor(s: Settings, overrides?: Partial<{ preset: Settings["theme.preset"]; dark: boolean }>): ThemeTokens {
  return computeTokens({
    preset: presetById(overrides?.preset ?? s["theme.preset"]),
    dark: overrides?.dark ?? resolveDark(s),
    accent: s["theme.accent"] || undefined,
    background: s["theme.background"] || undefined,
    surface: s["theme.surface"] || undefined,
  });
}

export const themeStore = createStore<{ tokens: ThemeTokens }>({ tokens: tokensFor(settingsStore.get()) });

/** Maps tokens onto CSS custom properties consumed by every stylesheet. */
export function tokenVars(t: ThemeTokens): Record<string, string> {
  return {
    "--bg": t.bg,
    "--surface": t.surface,
    "--editor": t.editor,
    "--raised": t.raised,
    "--sunken": t.sunken,
    "--hover": t.hover,
    "--active": t.active,
    "--text": t.text,
    "--text-muted": t.textMuted,
    "--text-faint": t.textFaint,
    "--border": t.border,
    "--border-strong": t.borderStrong,
    "--accent": t.accent,
    "--on-accent": t.onAccent,
    "--accent-soft": t.accentSoft,
    "--on-accent-soft": t.onAccentSoft,
    "--accent-a12": withAlpha(t.accent, 0.12),
    "--accent-a24": withAlpha(t.accent, 0.24),
    "--danger": t.danger,
    "--warning": t.warning,
    "--success": t.success,
    "--info": t.info,
    "--scrim": t.dark ? "#00000080" : "#1a140c40",
    "--shadow-color": t.dark ? "0 0% 0%" : "30 20% 20%",
    "--syn-keyword": t.syntax.keyword,
    "--syn-function": t.syntax.function,
    "--syn-type": t.syntax.type,
    "--syn-string": t.syntax.string,
    "--syn-number": t.syntax.number,
    "--syn-comment": t.syntax.comment,
    "--syn-property": t.syntax.property,
  };
}

const DENSITY = {
  compact: { row: 22, titlebar: 34, tab: 32, status: 22, activity: 42, gap: 3, pad: 8 },
  default: { row: 24, titlebar: 38, tab: 35, status: 24, activity: 46, gap: 4, pad: 10 },
  comfortable: { row: 28, titlebar: 42, tab: 39, status: 27, activity: 52, gap: 6, pad: 12 },
} as const;

export const rowHeight = (s: Settings) => DENSITY[s["ui.density"]].row;

/** A critically-underdamped spring sampled into a CSS `linear()` easing. */
function springEasing(damping: number, samples = 40): string {
  const omega = 12;
  const zeta = damping;
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  const pts: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const x = 1 - Math.exp(-zeta * omega * t) * (Math.cos(wd * t) + ((zeta * omega) / wd) * Math.sin(wd * t));
    pts.push((i === samples ? 1 : x).toFixed(4));
  }
  return `linear(${pts.join(", ")})`;
}

function layoutVars(s: Settings): Record<string, string> {
  const d = DENSITY[s["ui.density"]];
  const r = s["ui.radius"];
  const anim = s["ui.animation"];
  const k = anim === "off" ? 0 : anim === "reduced" ? 0.6 : 1;
  return {
    "--row": `${d.row}px`,
    "--titlebar-h": `${d.titlebar}px`,
    "--tab-h": `${d.tab}px`,
    "--statusbar-h": `${d.status}px`,
    "--activity-w": `${d.activity}px`,
    "--gap": `${d.gap}px`,
    "--pad": `${d.pad}px`,
    "--r-xs": `${Math.round(r * 0.35)}px`,
    "--r-sm": `${Math.round(r * 0.6)}px`,
    "--r-md": `${r}px`,
    "--r-lg": `${Math.round(r * 1.4)}px`,
    "--r-xl": `${Math.round(r * 2)}px`,
    "--font-ui": s["ui.fontFamily"],
    "--font-ui-size": `${s["ui.fontSize"]}px`,
    "--font-code": s["editor.fontFamily"],
    "--dur-1": `${Math.round(90 * k)}ms`,
    "--dur-2": `${Math.round(180 * k)}ms`,
    "--dur-3": `${Math.round(320 * k)}ms`,
    "--dur-4": `${Math.round(480 * k)}ms`,
    "--ease": "cubic-bezier(0.2, 0, 0, 1)",
    "--ease-out": "cubic-bezier(0.05, 0.7, 0.1, 1)",
    "--ease-spring": anim === "normal" ? springEasing(0.55) : "cubic-bezier(0.2, 0, 0, 1)",
    "--ease-spring-soft": anim === "normal" ? springEasing(0.75) : "cubic-bezier(0.2, 0, 0, 1)",
  };
}

function setVars(vars: Record<string, string>) {
  const root = document.documentElement.style;
  for (const [k, v] of Object.entries(vars)) root.setProperty(k, v);
}

let userStyle: HTMLStyleElement | null = null;
function applyCustomCss(css: string) {
  if (!userStyle) {
    userStyle = document.createElement("style");
    userStyle.id = "verso-user-css";
    document.head.appendChild(userStyle);
  }
  if (userStyle.textContent !== css) userStyle.textContent = css;
  // Keep user CSS last so it wins over Monaco's injected styles too.
  document.head.appendChild(userStyle);
}

let lastThemeKey = "";

function apply(s: Settings, animate: boolean) {
  const tokens = tokensFor(s);
  const key = JSON.stringify(tokens);
  const commit = () => {
    setVars(tokenVars(tokens));
    setVars(layoutVars(s));
    document.documentElement.dataset.theme = tokens.dark ? "dark" : "light";
    document.documentElement.dataset.animation = s["ui.animation"];
    document.documentElement.dataset.density = s["ui.density"];
    document.documentElement.style.colorScheme = tokens.dark ? "dark" : "light";
    if (key !== lastThemeKey) themeStore.set({ tokens });
    lastThemeKey = key;
  };
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (animate && key !== lastThemeKey && lastThemeKey && s["ui.animation"] !== "off" && doc.startViewTransition) {
    doc.startViewTransition(commit);
  } else {
    commit();
  }
  applyCustomCss(s["advanced.customCss"]);
}

export function initThemeEngine() {
  apply(settingsStore.get(), false);
  settingsStore.subscribe(() => apply(settingsStore.get(), true));
  systemDark.addEventListener("change", () => apply(settingsStore.get(), true));
}
