export interface FuzzyMatch {
  score: number;
  /** Indices of matched characters in the target. */
  positions: number[];
}

const isBoundary = (prev: string | undefined, ch: string) =>
  prev === undefined ||
  prev === "/" || prev === "\\" || prev === "." || prev === "_" || prev === "-" || prev === " " ||
  (prev.toLowerCase() === prev && ch.toUpperCase() === ch && ch.toLowerCase() !== ch);

/** Subsequence fuzzy matcher favouring consecutive and word-boundary hits. */
export function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
  if (!query) return { score: 0, positions: [] };
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  const positions: number[] = [];
  let score = 0;
  let ti = 0;
  let streak = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    if (ch === " ") continue;
    let found = -1;
    // Prefer a word-boundary occurrence close ahead.
    for (let j = ti; j < t.length; j++) {
      if (t[j] === ch && isBoundary(target[j - 1], target[j])) {
        if (j - ti < 12 || streak === 0) found = j;
        break;
      }
    }
    if (found < 0) found = t.indexOf(ch, ti);
    if (found < 0) return null;
    const boundary = isBoundary(target[found - 1], target[found]);
    streak = positions.length && positions[positions.length - 1] === found - 1 ? streak + 1 : 0;
    score += 1 + streak * 3 + (boundary ? 4 : 0) - Math.min(found - ti, 8) * 0.25;
    positions.push(found);
    ti = found + 1;
  }
  score -= target.length * 0.02;
  return { score, positions };
}
