import { useRef } from "react";

/** Drag handle for resizing panels. Reports the pointer delta since drag start;
 * double-click resets. Supports keyboard resizing for accessibility. */
export function Sash({
  orientation,
  onStart,
  onDrag,
  onEnd,
  onReset,
  label,
}: {
  orientation: "vertical" | "horizontal";
  onStart?: () => void;
  onDrag: (delta: number) => void;
  onEnd?: () => void;
  onReset?: () => void;
  label: string;
}) {
  const start = useRef<number | null>(null);
  const vertical = orientation === "vertical";
  return (
    <div
      className={`sash sash-${orientation}`}
      role="separator"
      aria-orientation={vertical ? "vertical" : "horizontal"}
      aria-label={label}
      tabIndex={0}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = vertical ? e.clientX : e.clientY;
        document.body.classList.add(vertical ? "resizing-x" : "resizing-y");
        onStart?.();
      }}
      onPointerMove={(e) => {
        if (start.current === null) return;
        onDrag((vertical ? e.clientX : e.clientY) - start.current);
      }}
      onPointerUp={() => {
        start.current = null;
        document.body.classList.remove("resizing-x", "resizing-y");
        onEnd?.();
      }}
      onLostPointerCapture={() => {
        if (start.current !== null) {
          start.current = null;
          document.body.classList.remove("resizing-x", "resizing-y");
          onEnd?.();
        }
      }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 40 : 10;
        const keys: Record<string, number> = vertical ? { ArrowLeft: -step, ArrowRight: step } : { ArrowUp: -step, ArrowDown: step };
        const d = keys[e.key];
        if (d !== undefined) {
          e.preventDefault();
          onStart?.();
          onDrag(d);
          onEnd?.();
        }
      }}
    />
  );
}
