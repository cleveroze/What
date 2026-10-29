import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore } from "../lib/store";
import { settingsStore } from "../state/settings";
import { Kbd } from "./ui/controls";

interface Tip {
  title: string;
  desc?: string;
  keys?: string;
  rect: DOMRect;
}

/** Rich tooltips for any element with `data-tip` (plus optional
 * `data-tip-desc` explanation for newcomers and `data-tip-keys`). */
export function TooltipHost() {
  const [tip, setTip] = useState<Tip | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null);
  const showDesc = useStore(settingsStore, (s) => s["workbench.tips"]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: HTMLElement | null = null;
    let warm = false; // after one tooltip, the next appears immediately
    let coolTimer: ReturnType<typeof setTimeout> | undefined;
    const hide = () => {
      clearTimeout(timer);
      if (current) {
        current = null;
        setTip(null);
        clearTimeout(coolTimer);
        coolTimer = setTimeout(() => (warm = false), 600);
      }
    };
    const over = (e: PointerEvent) => {
      const el = (e.target as Element).closest<HTMLElement>("[data-tip]");
      if (el === current) return;
      clearTimeout(timer);
      if (!el) {
        hide();
        return;
      }
      current = el;
      setTip(null);
      timer = setTimeout(
        () => {
          if (current !== el || !el.isConnected) return;
          warm = true;
          setTip({ title: el.dataset.tip!, desc: el.dataset.tipDesc, keys: el.dataset.tipKeys, rect: el.getBoundingClientRect() });
        },
        warm ? 60 : 550,
      );
    };
    window.addEventListener("pointerover", over);
    window.addEventListener("pointerdown", hide, true);
    window.addEventListener("keydown", hide, true);
    window.addEventListener("wheel", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerover", over);
      window.removeEventListener("pointerdown", hide, true);
      window.removeEventListener("keydown", hide, true);
      window.removeEventListener("wheel", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);

  useLayoutEffect(() => {
    if (!tip || !ref.current) {
      setPos(null);
      return;
    }
    const box = ref.current.getBoundingClientRect();
    const r = tip.rect;
    const below = r.top - box.height - 8 < 4;
    let x = r.left + r.width / 2 - box.width / 2;
    x = Math.max(6, Math.min(window.innerWidth - box.width - 6, x));
    // Side-mounted triggers (activity bar) get the tooltip beside them.
    if (r.width < 64 && r.left < 80 && r.height > 24) {
      setPos({ x: r.right + 8, y: r.top + r.height / 2 - box.height / 2, below: false });
      return;
    }
    setPos({ x, y: below ? r.bottom + 8 : r.top - box.height - 8, below });
  }, [tip]);

  if (!tip) return null;
  return (
    <div
      ref={ref}
      className={`tooltip ${pos ? "shown" : ""} ${pos?.below ? "below" : ""}`}
      role="tooltip"
      style={{ left: pos?.x ?? -9999, top: pos?.y ?? -9999 }}
    >
      <div className="tooltip-title">
        <span>{tip.title}</span>
        {tip.keys && <Kbd binding={tip.keys} />}
      </div>
      {showDesc && tip.desc && <div className="tooltip-desc">{tip.desc}</div>}
    </div>
  );
}
