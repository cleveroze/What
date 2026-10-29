/** OKLCH colour utilities used to derive harmonious tonal palettes from a
 * small set of seed colours (Material-style dynamic colour, done in OKLab). */

export interface Oklch {
  l: number;
  c: number;
  h: number;
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let s = m[1];
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const isHex = (hex: string) => parseHex(hex) !== null;

export function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function linearRgbFromOklch({ l, c, h }: Oklch): [number, number, number] {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

const inGamut = (rgb: number[]) => rgb.every((v) => v >= -0.0001 && v <= 1.0001);

/** Converts to hex, reducing chroma until the colour fits in sRGB. */
export function oklchToHex(color: Oklch): string {
  let c = color.c;
  let rgb = linearRgbFromOklch({ ...color, c });
  while (!inGamut(rgb) && c > 0) {
    c = Math.max(0, c - 0.005);
    rgb = linearRgbFromOklch({ ...color, c });
  }
  const [r, g, b] = rgb.map((v) => fromLinear(Math.min(1, Math.max(0, v))) * 255);
  return rgbToHex(r, g, b);
}

export function hexToOklch(hex: string): Oklch {
  const rgb = parseHex(hex) ?? [128, 128, 128];
  const [r, g, b] = rgb.map((v) => toLinear(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.sqrt(A * A + B * B);
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { l: L, c: C, h: H };
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = (parseHex(hex) ?? [0, 0, 0]).map((v) => toLinear(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Mixes two hex colours; t = 0 → a, t = 1 → b. */
export function mix(a: string, b: string, t: number): string {
  const ca = parseHex(a) ?? [0, 0, 0];
  const cb = parseHex(b) ?? [0, 0, 0];
  return rgbToHex(...(ca.map((v, i) => v + (cb[i] - v) * t) as [number, number, number]));
}

export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255).toString(16).padStart(2, "0");
  return (rgbToHex(...(parseHex(hex) ?? [0, 0, 0])) + a).toLowerCase();
}

/** Shifts lightness in OKLCH space keeping hue and chroma. */
export function shiftLightness(hex: string, delta: number): string {
  const c = hexToOklch(hex);
  return oklchToHex({ ...c, l: Math.min(1, Math.max(0, c.l + delta)) });
}

/** Picks readable foreground (near-black or near-white) for a background. */
export function onColor(bg: string, dark = "#16130f", light = "#ffffff"): string {
  return contrastRatio(bg, dark) >= contrastRatio(bg, light) ? dark : light;
}

/** Nudges `fg` lightness until it reaches `min` contrast against `bg`. */
export function ensureContrast(fg: string, bg: string, min: number): string {
  let color = hexToOklch(fg);
  const bgL = hexToOklch(bg).l;
  const dir = bgL > 0.6 ? -1 : 1;
  let hex = fg;
  for (let i = 0; i < 40 && contrastRatio(hex, bg) < min; i++) {
    color = { ...color, l: Math.min(1, Math.max(0, color.l + dir * 0.02)) };
    hex = oklchToHex(color);
  }
  return hex;
}
