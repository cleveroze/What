import { ensureContrast, hexToOklch, isHex, mix, oklchToHex, onColor, shiftLightness } from "../lib/color";
import type { Preset } from "./presets";

export interface SyntaxColors {
  keyword: string;
  control: string;
  function: string;
  type: string;
  string: string;
  number: string;
  constant: string;
  variable: string;
  property: string;
  tag: string;
  attribute: string;
  regexp: string;
  operator: string;
  comment: string;
}

export interface ThemeTokens {
  dark: boolean;
  /** No hue in syntax colors; emphasis comes from weight instead. */
  monochrome: boolean;
  bg: string;
  surface: string;
  editor: string;
  raised: string;
  sunken: string;
  hover: string;
  active: string;
  text: string;
  textMuted: string;
  textFaint: string;
  border: string;
  borderStrong: string;
  accent: string;
  onAccent: string;
  accentSoft: string;
  onAccentSoft: string;
  danger: string;
  warning: string;
  success: string;
  info: string;
  syntax: SyntaxColors;
  ansi: string[];
}

export interface ThemeInput {
  preset: Preset;
  dark: boolean;
  accent?: string;
  background?: string;
  surface?: string;
}

/** Derives a complete, contrast-checked token set from a preset plus optional
 * user overrides. */
export function computeTokens({ preset, dark, accent, background, surface }: ThemeInput): ThemeTokens {
  const nh = preset.neutralHue;
  const nc = preset.neutralChroma;
  const n = (l: number, cScale = 1) => oklchToHex({ l, c: nc * cScale, h: nh });

  let bg = dark ? n(0.185) : n(0.932);
  let surfaceC = dark ? n(0.212) : n(0.962);
  let editor = dark ? n(0.232) : n(0.985, 0.6);

  if (background && isHex(background)) {
    bg = background;
    const l = hexToOklch(bg).l;
    const step = l > 0.55 ? 0.028 : 0.028;
    surfaceC = shiftLightness(bg, step);
    editor = shiftLightness(bg, step * 1.8);
  }
  if (surface && isHex(surface)) {
    surfaceC = surface;
    editor = shiftLightness(surface, hexToOklch(surface).l > 0.55 ? 0.022 : 0.02);
  }
  const darkSurface = hexToOklch(editor).l < 0.55;
  dark = darkSurface;

  const raised = dark ? shiftLightness(editor, 0.035) : shiftLightness(editor, 0.012);
  const sunken = dark ? shiftLightness(bg, -0.02) : shiftLightness(bg, -0.018);
  const hover = mix(surfaceC, dark ? "#ffffff" : "#000000", dark ? 0.06 : 0.045);
  const active = mix(surfaceC, dark ? "#ffffff" : "#000000", dark ? 0.1 : 0.08);

  const textBase = n(dark ? 0.93 : 0.24, 0.8);
  const text = ensureContrast(textBase, editor, 10);
  const textMuted = ensureContrast(n(dark ? 0.74 : 0.45, 0.8), surfaceC, 4.6);
  const textFaint = ensureContrast(n(dark ? 0.58 : 0.6, 0.8), surfaceC, 2.6);
  const border = mix(surfaceC, text, dark ? 0.1 : 0.1);
  const borderStrong = mix(surfaceC, text, dark ? 0.2 : 0.22);

  let accentC: string;
  if (accent && isHex(accent)) {
    accentC = ensureContrast(accent, editor, 3);
  } else if (preset.accentChroma === 0) {
    accentC = dark ? "#e8e8e8" : "#262626";
  } else {
    accentC = oklchToHex({ l: dark ? 0.76 : 0.53, c: preset.accentChroma, h: preset.accentHue });
  }
  const a = hexToOklch(accentC);
  const softChroma = Math.min(a.c, dark ? 0.07 : 0.06);
  const accentSoft = oklchToHex({ l: dark ? 0.33 : 0.9, c: softChroma, h: a.h });
  const onAccentSoft = ensureContrast(oklchToHex({ l: dark ? 0.9 : 0.3, c: softChroma, h: a.h }), accentSoft, 6);

  const sem = (h: number, c = 0.14) => ensureContrast(oklchToHex({ l: dark ? 0.74 : 0.52, c, h }), editor, 3.6);

  const sc = preset.syntaxChroma;
  const accentHue = accent && isHex(accent) ? a.h : preset.accentHue;
  const syn = (rot: number, l = 0, cScale = 1) => {
    if (sc === 0 && !(accent && isHex(accent))) {
      return ensureContrast(n((dark ? 0.86 : 0.3) + l, 0), editor, 4.5);
    }
    const c = (sc || 0.1) * cScale * (dark ? 1 : 1.3);
    return ensureContrast(oklchToHex({ l: (dark ? 0.79 : 0.5) + l, c, h: (accentHue + rot + 360) % 360 }), editor, 4.5);
  };
  const syntax: SyntaxColors = {
    keyword: syn(0, dark ? -0.02 : 0, 1.05),
    control: syn(-25, dark ? -0.02 : 0, 1.05),
    function: syn(55, 0.02),
    type: syn(160, 0.01),
    string: syn(105, 0),
    number: syn(-60, 0.02),
    constant: syn(-60, 0.02),
    variable: text,
    property: syn(200, 0.02, 0.6),
    tag: syn(0, 0),
    attribute: syn(55, 0.02, 0.8),
    regexp: syn(130, 0.02, 0.9),
    operator: textMuted,
    comment: ensureContrast(n(dark ? 0.6 : 0.58, 1.2), editor, 3.2),
  };
  const monochrome = sc === 0 && !(accent && isHex(accent));
  if (monochrome) {
    // Monochrome: vary tone instead of hue.
    syntax.string = ensureContrast(n(dark ? 0.72 : 0.42, 0), editor, 4.5);
    syntax.number = syntax.constant = ensureContrast(n(dark ? 0.8 : 0.36, 0), editor, 4.5);
    syntax.type = syntax.function = text;
  }

  const ansiHue = [0, 25, 145, 90, 255, 330, 200, 0];
  const ansi = ansiHue.map((h, i) => {
    if (i === 0) return dark ? n(0.3) : n(0.25);
    if (i === 7) return dark ? n(0.85) : n(0.55);
    return oklchToHex({ l: dark ? 0.72 : 0.5, c: 0.13, h });
  });
  const bright = ansiHue.map((h, i) => {
    if (i === 0) return dark ? n(0.5) : n(0.4);
    if (i === 7) return dark ? n(0.97) : n(0.35);
    return oklchToHex({ l: dark ? 0.82 : 0.42, c: 0.14, h });
  });

  return {
    dark,
    monochrome,
    bg,
    surface: surfaceC,
    editor,
    raised,
    sunken,
    hover,
    active,
    text,
    textMuted,
    textFaint,
    border,
    borderStrong,
    accent: accentC,
    onAccent: onColor(accentC),
    accentSoft,
    onAccentSoft,
    danger: sem(25, 0.16),
    warning: sem(75, 0.14),
    success: sem(150, 0.13),
    info: sem(245, 0.12),
    syntax,
    ansi: [...ansi, ...bright],
  };
}
