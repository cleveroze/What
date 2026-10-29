import { MorphShape } from "./Shape";
import type { ShapeName } from "../lib/shapes";

/** The Stride mark: an M3 "cookie" shape with a forward double chevron.
 * Pass `shape` to morph the backdrop (used for playful hover states). */
export function Logo({ size = 20, shape = "cookie9", className }: { size?: number; shape?: ShapeName; className?: string }) {
  return (
    <span className={`logo ${className ?? ""}`} style={{ width: size, height: size }}>
      <MorphShape name={shape} size={size} fill="var(--accent)" spin={40} />
      <svg className="logo-chevrons" viewBox="0 0 100 100" width={size} height={size} aria-hidden>
        <path d="M30 32 L48 50 L30 68 M54 32 L72 50 L54 68" fill="none" stroke="var(--on-accent)" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
