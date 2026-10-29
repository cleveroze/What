/**
 * Material 3 Expressive shape library.
 *
 * Every shape is reduced to the same representation — N radii sampled at
 * evenly spaced angles around the center — so any two shapes can be morphed
 * into each other by interpolating radii. Paths are drawn as smooth closed
 * Catmull-Rom splines.
 */

export const SAMPLES = 120;

type Pt = [number, number];
type Radii = Float64Array;

const TAU = Math.PI * 2;
/** Sample angles start at the top (−90°) and run clockwise in SVG space. */
const angleAt = (i: number) => (i / SAMPLES) * TAU - Math.PI / 2;

function fromFn(fn: (theta: number) => number, rotation = 0): Radii {
  const r = new Float64Array(SAMPLES);
  for (let i = 0; i < SAMPLES; i++) r[i] = fn(angleAt(i) - rotation);
  return r;
}

/** Casts a ray from the origin at each sample angle and records the distance
 * to the polygon outline (the polygon must be star-shaped around 0,0). */
function fromPolygon(points: Pt[]): Radii {
  const r = new Float64Array(SAMPLES);
  for (let i = 0; i < SAMPLES; i++) {
    const a = angleAt(i);
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let best = 0;
    for (let k = 0; k < points.length; k++) {
      const [ax, ay] = points[k];
      const [bx, by] = points[(k + 1) % points.length];
      const ex = bx - ax;
      const ey = by - ay;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = (ax * ey - ay * ex) / den;
      const u = (ax * dy - ay * dx) / den;
      if (t > 0 && u >= -1e-9 && u <= 1 + 1e-9) best = Math.max(best, t);
    }
    r[i] = best;
  }
  return r;
}

/** Circular smoothing of the radius profile; rounds corners. */
function smooth(r: Radii, window: number, passes = 2): Radii {
  if (window < 1) return r;
  let cur = r;
  for (let p = 0; p < passes; p++) {
    const next = new Float64Array(SAMPLES);
    for (let i = 0; i < SAMPLES; i++) {
      let sum = 0;
      for (let k = -window; k <= window; k++) sum += cur[(i + k + SAMPLES) % SAMPLES];
      next[i] = sum / (2 * window + 1);
    }
    cur = next;
  }
  return cur;
}

/** Scales the profile so the shape exactly fills the unit square [-1, 1]². */
function fit(r: Radii): Radii {
  let max = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const a = angleAt(i);
    max = Math.max(max, Math.abs(r[i] * Math.cos(a)), Math.abs(r[i] * Math.sin(a)));
  }
  const out = new Float64Array(SAMPLES);
  for (let i = 0; i < SAMPLES; i++) out[i] = r[i] / (max || 1);
  return out;
}

const regular = (n: number, rotation: number, sx = 1, sy = 1): Pt[] =>
  Array.from({ length: n }, (_, k) => {
    const a = rotation + (k / n) * TAU;
    return [Math.cos(a) * sx, Math.sin(a) * sy] as Pt;
  });

const rotate = (pts: Pt[], deg: number): Pt[] => {
  const a = (deg * Math.PI) / 180;
  return pts.map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]);
};

const arc = (cx: number, cy: number, rad: number, from: number, to: number, steps = 24): Pt[] =>
  Array.from({ length: steps + 1 }, (_, k) => {
    const a = from + ((to - from) * k) / steps;
    return [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad] as Pt;
  });

const star = (n: number, inner: number, rotation = -Math.PI / 2): Pt[] =>
  Array.from({ length: n * 2 }, (_, k) => {
    const a = rotation + (k / (n * 2)) * TAU;
    const rad = k % 2 === 0 ? 1 : inner;
    return [Math.cos(a) * rad, Math.sin(a) * rad] as Pt;
  });

/** Signed power: keeps sign, sharpens (p > 1) or flattens (p < 1). */
const spow = (x: number, p: number) => Math.sign(x) * Math.abs(x) ** p;

/** Rounds polygon corners while keeping edges straight: pins each edge at
 * `round` (0–0.5) from its ends, then applies Chaikin corner cutting. */
function roundCorners(pts: Pt[], round: number, iterations = 4): Pt[] {
  const f = Math.min(0.5, Math.max(0.02, round * 0.5));
  let cur: Pt[] = [];
  for (let k = 0; k < pts.length; k++) {
    const [ax, ay] = pts[k];
    const [bx, by] = pts[(k + 1) % pts.length];
    cur.push([ax + (bx - ax) * f, ay + (by - ay) * f], [ax + (bx - ax) * (1 - f), ay + (by - ay) * (1 - f)]);
  }
  // The original vertices become the control points being cut away.
  cur = pts.flatMap((p, k) => [p, cur[2 * k], cur[2 * k + 1]]);
  for (let it = 0; it < iterations; it++) {
    const next: Pt[] = [];
    for (let k = 0; k < cur.length; k++) {
      const [ax, ay] = cur[k];
      const [bx, by] = cur[(k + 1) % cur.length];
      next.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    cur = next;
  }
  return cur;
}

const roundedPoly = (pts: Pt[], round: number) => fit(fromPolygon(roundCorners(pts, round)));

const DEFINITIONS = {
  circle: () => fromFn(() => 1),
  square: () => roundedPoly(regular(4, Math.PI / 4), 1),
  slanted: () => roundedPoly([[-0.75, -1], [1, -1], [0.75, 1], [-1, 1]], 0.85),
  arch: () => roundedPoly([...arc(0, 0, 1, Math.PI, TAU, 32), [1, 1], [-1, 1]], 0.3),
  semicircle: () => roundedPoly([...arc(0, 0.45, 1, Math.PI, TAU, 32), [1, 0.45], [-1, 0.45]], 0.25),
  oval: () => fit(fromFn((t) => 1 / Math.sqrt((Math.cos(t) / 1) ** 2 + (Math.sin(t) / 0.62) ** 2), (-35 * Math.PI) / 180)),
  pill: () =>
    fit(smooth(fromPolygon(rotate([...arc(0.45, 0, 0.55, -Math.PI / 2, Math.PI / 2), ...arc(-0.45, 0, 0.55, Math.PI / 2, (3 * Math.PI) / 2)], -45)), 1)),
  triangle: () => roundedPoly(regular(3, -Math.PI / 2).map(([x, y]) => [x, y + 0.2] as Pt), 0.9),
  arrow: () => roundedPoly([[0, -1], [1, 0.85], [0, 0.4], [-1, 0.85]], 0.8),
  fan: () => roundedPoly([[-0.85, 0.85], ...arc(-0.85, 0.85, 1.85, -Math.PI / 2, 0, 28)].map(([x, y]) => [x + 0.15, y - 0.15] as Pt), 0.35),
  diamond: () => roundedPoly(regular(4, -Math.PI / 2, 0.82, 1), 0.85),
  clamshell: () => roundedPoly(regular(6, 0, 1, 0.72), 0.8),
  pentagon: () => roundedPoly(regular(5, -Math.PI / 2), 0.85),
  gem: () => roundedPoly(regular(6, -Math.PI / 2, 1, 0.92), 0.75),
  verySunny: () => roundedPoly(star(8, 0.7), 0.7),
  sunny: () => roundedPoly(star(8, 0.8), 1),
  cookie4: () => fit(fromFn((t) => 1 + 0.1 * Math.cos(4 * t), Math.PI / 4)),
  cookie6: () => fit(fromFn((t) => 1 + 0.075 * Math.cos(6 * t))),
  cookie7: () => fit(fromFn((t) => 1 + 0.065 * Math.cos(7 * t))),
  cookie9: () => fit(fromFn((t) => 1 + 0.055 * Math.cos(9 * t))),
  cookie12: () => fit(fromFn((t) => 1 + 0.045 * Math.cos(12 * t))),
  clover4: () => fit(smooth(fromFn((t) => 0.62 + 0.38 * Math.abs(Math.cos(2 * t)) ** 0.75, Math.PI / 4), 1, 1)),
  clover8: () => fit(smooth(fromFn((t) => 0.76 + 0.24 * Math.abs(Math.cos(4 * t)) ** 0.7), 1, 1)),
  burst: () => fit(smooth(fromPolygon(star(12, 0.7)), 1, 1)),
  softBurst: () => roundedPoly(star(10, 0.74), 1),
  boom: () => fit(fromPolygon(star(16, 0.42))),
  softBoom: () => roundedPoly(star(16, 0.52), 0.9),
  flower: () => fit(smooth(fromFn((t) => 0.5 + 0.5 * Math.abs(Math.cos(4 * t)) ** 0.55), 1, 1)),
  puffy: () => fit(smooth(fromFn((t) => 0.8 + 0.2 * Math.abs(Math.cos(4 * t)) ** 0.45), 1, 1)),
  puffyDiamond: () => {
    const base = fit(smooth(fromPolygon(regular(4, -Math.PI / 2)), 6));
    const bumps = fromFn((t) => 0.86 + 0.14 * Math.abs(Math.cos(6 * t)) ** 0.5);
    return fit(base.map((v, i) => v * bumps[i]) as Radii);
  },
  ghostish: () => {
    const bottom: Pt[] = Array.from({ length: 25 }, (_, k) => {
      const x = 1 - (2 * k) / 24;
      return [x, 0.85 + 0.15 * Math.cos(Math.PI * 2 * x * 0.75)] as Pt;
    });
    return roundedPoly([...arc(0, -0.15, 1, Math.PI, TAU, 32), ...bottom], 0.2);
  },
  bun: () => {
    const pts: Pt[] = Array.from({ length: 160 }, (_, k) => {
      const t = (k / 160) * TAU;
      const x = spow(Math.cos(t), 0.5);
      const y = spow(Math.sin(t), 0.5) * 0.95;
      return [x * (1 - 0.32 * Math.exp(-((y / 0.16) ** 2))), y] as Pt;
    });
    return fit(smooth(fromPolygon(pts), 1));
  },
  heart: () => {
    const pts: Pt[] = Array.from({ length: 200 }, (_, k) => {
      const t = (k / 200) * TAU;
      const x = 16 * Math.sin(t) ** 3;
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      return [x / 17, (y + 2.5) / 17] as Pt;
    });
    return fit(smooth(fromPolygon(pts), 2));
  },
} satisfies Record<string, () => Radii>;

export type ShapeName = keyof typeof DEFINITIONS;
export const SHAPE_NAMES = Object.keys(DEFINITIONS) as ShapeName[];

const cache = new Map<ShapeName, Radii>();

export function shapeRadii(name: ShapeName): Radii {
  let r = cache.get(name);
  if (!r) {
    r = DEFINITIONS[name]();
    cache.set(name, r);
  }
  return r;
}

export function lerpRadii(a: Radii, b: Radii, t: number, out = new Float64Array(SAMPLES)): Radii {
  for (let i = 0; i < SAMPLES; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}

/** Builds a smooth closed SVG path for a radius profile inside a box of
 * `size`, optionally rotated by `rotation` degrees. */
export function radiiToPath(r: Radii, size: number, rotation = 0, inset = 0): string {
  const c = size / 2;
  const scale = c - inset;
  const rot = (rotation * Math.PI) / 180;
  const pts: Pt[] = new Array(SAMPLES);
  for (let i = 0; i < SAMPLES; i++) {
    const a = angleAt(i) + rot;
    pts[i] = [c + Math.cos(a) * r[i] * scale, c + Math.sin(a) * r[i] * scale];
  }
  const f = (n: number) => n.toFixed(2);
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < SAMPLES; i++) {
    const p0 = pts[(i - 1 + SAMPLES) % SAMPLES];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % SAMPLES];
    const p3 = pts[(i + 2) % SAMPLES];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + "Z";
}

export const shapePath = (name: ShapeName, size: number, rotation = 0, inset = 0) =>
  radiiToPath(shapeRadii(name), size, rotation, inset);

/** Damped-spring progress (0 → 1 with a little overshoot when damping < 1). */
export function springProgress(t: number, damping = 0.6, omega = 12): number {
  if (t >= 1) return 1;
  const wd = omega * Math.sqrt(1 - damping * damping);
  return 1 - Math.exp(-damping * omega * t) * (Math.cos(wd * t) + ((damping * omega) / wd) * Math.sin(wd * t));
}
