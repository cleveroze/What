import { useEffect, useMemo, useReducer, useRef, type CSSProperties } from "react";
import { lerpRadii, radiiToPath, shapePath, shapeRadii, springProgress, type ShapeName } from "../lib/shapes";
import { getSetting } from "../state/settings";

interface ShapeProps {
  name: ShapeName;
  size: number;
  className?: string;
  style?: CSSProperties;
  rotation?: number;
  fill?: string;
}

/** A static Material 3 Expressive shape. */
export function Shape({ name, size, className, style, rotation = 0, fill = "currentColor" }: ShapeProps) {
  const d = useMemo(() => shapePath(name, size, rotation), [name, size, rotation]);
  return (
    <svg className={`shape ${className ?? ""}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={style} aria-hidden>
      <path d={d} fill={fill} />
    </svg>
  );
}

function motion() {
  const m = getSetting("ui.animation");
  return m === "off" ? null : { duration: m === "reduced" ? 260 : 650, damping: m === "reduced" ? 1 : 0.55 };
}

/** Morphs smoothly (spring physics) into `name` whenever it changes, spinning
 * by `spin` degrees during the transition. Rendering is done directly on the
 * DOM node, so React does not re-render per frame. */
export function MorphShape({
  name,
  size,
  className,
  style,
  fill = "currentColor",
  spin = 0,
  from,
}: ShapeProps & { spin?: number; /** Shape to morph from when first shown. */ from?: ShapeName }) {
  const pathRef = useRef<SVGPathElement>(null);
  const state = useRef({ radii: new Float64Array(shapeRadii(from ?? name)), rotation: from ? -spin : 0, frame: 0 });

  useEffect(() => {
    const el = pathRef.current;
    const s = state.current;
    const target = shapeRadii(name);
    const m = motion();
    cancelAnimationFrame(s.frame);
    if (!el) return;
    if (!m) {
      s.radii = new Float64Array(target);
      s.rotation = 0;
      el.setAttribute("d", radiiToPath(s.radii, size, 0));
      return;
    }
    const from = new Float64Array(s.radii);
    const fromRot = s.rotation % 360;
    const toRot = fromRot + spin;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / m.duration);
      const p = springProgress(t, m.damping);
      lerpRadii(from, target, p, s.radii);
      s.rotation = fromRot + (toRot - fromRot) * p;
      el.setAttribute("d", radiiToPath(s.radii, size, s.rotation));
      if (t < 1) s.frame = requestAnimationFrame(tick);
    };
    s.frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(s.frame);
  }, [name, size, spin]);

  return (
    <svg className={`shape ${className ?? ""}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={style} aria-hidden>
      <path ref={pathRef} d={radiiToPath(state.current.radii, size, state.current.rotation)} fill={fill} />
    </svg>
  );
}

/** Cycles through shapes on a timer, morphing between them. */
export function ShapeCycle({ shapes, interval = 2400, ...rest }: Omit<ShapeProps, "name"> & { shapes: ShapeName[]; interval?: number; spin?: number }) {
  const idx = useCycle(shapes.length, interval);
  return <MorphShape name={shapes[idx]} {...rest} />;
}

function useCycle(length: number, interval: number) {
  const [index, next] = useReducer((i: number) => (i + 1) % length, 0);
  useEffect(() => {
    if (getSetting("ui.animation") === "off") return;
    const id = setInterval(next, interval);
    return () => clearInterval(id);
  }, [interval]);
  return index;
}

const LOADER_SHAPES: ShapeName[] = ["softBurst", "cookie9", "pentagon", "pill", "sunny", "cookie4", "oval", "flower"];

/** Material 3 Expressive loading indicator: a continuously rotating shape
 * that morphs through a sequence. Shown only while real work is running. */
export function LoadingIndicator({ size = 28, label = "Loading" }: { size?: number; label?: string }) {
  return (
    <span className="loading-indicator" role="progressbar" aria-label={label} style={{ width: size, height: size }}>
      <ShapeCycle shapes={LOADER_SHAPES} size={Math.round(size * 0.72)} interval={650} spin={90} className="loading-shape" />
    </span>
  );
}
