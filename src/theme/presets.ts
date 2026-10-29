import type { PresetId } from "../state/settings";

export interface Preset {
  id: PresetId;
  name: string;
  description: string;
  /** Hue/chroma of the neutral surfaces (OKLCH). */
  neutralHue: number;
  neutralChroma: number;
  /** Hue/chroma of the accent (OKLCH). */
  accentHue: number;
  accentChroma: number;
  /** How far syntax hues rotate away from the accent; 0 = monochrome. */
  syntaxChroma: number;
}

export const PRESETS: Preset[] = [
  {
    id: "cream",
    name: "Cream",
    description: "Warm paper tones with a terracotta accent",
    neutralHue: 75,
    neutralChroma: 0.016,
    accentHue: 48,
    accentChroma: 0.13,
    syntaxChroma: 0.11,
  },
  {
    id: "graphite",
    name: "Graphite",
    description: "Neutral cool greys with a steel-blue accent",
    neutralHue: 262,
    neutralChroma: 0.006,
    accentHue: 255,
    accentChroma: 0.12,
    syntaxChroma: 0.11,
  },
  {
    id: "ocean",
    name: "Ocean",
    description: "Deep blue-teal surfaces and a lagoon accent",
    neutralHue: 232,
    neutralChroma: 0.03,
    accentHue: 205,
    accentChroma: 0.11,
    syntaxChroma: 0.11,
  },
  {
    id: "forest",
    name: "Forest",
    description: "Mossy greens with a fern accent",
    neutralHue: 150,
    neutralChroma: 0.02,
    accentHue: 152,
    accentChroma: 0.11,
    syntaxChroma: 0.1,
  },
  {
    id: "monochrome",
    name: "Monochrome",
    description: "Pure greyscale, contrast through weight and tone",
    neutralHue: 0,
    neutralChroma: 0,
    accentHue: 0,
    accentChroma: 0,
    syntaxChroma: 0,
  },
];

export const presetById = (id: PresetId) => PRESETS.find((p) => p.id === id) ?? PRESETS[0];
