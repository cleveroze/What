import { useEffect, useRef } from "react";
import { useStore } from "../../lib/store";
import { outputStore } from "../../state/output";

const fmt = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour12: false });

export function OutputView() {
  const entries = useStore(outputStore, (s) => s.entries);
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [entries]);
  return (
    <div
      className="output-view"
      ref={ref}
      tabIndex={0}
      role="log"
      aria-label="Output"
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      }}
    >
      {entries.length === 0 && <div className="panel-empty"><p>No output yet.</p></div>}
      {entries.map((e) => (
        <div key={e.id} className={`log-line log-${e.level}`}>
          <span className="log-time">{fmt(e.time)}</span>
          <span className="log-level">{e.level}</span>
          <span className="log-msg">{e.message}</span>
        </div>
      ))}
    </div>
  );
}
