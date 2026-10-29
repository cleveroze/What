import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatBinding } from "../../lib/keys";
import type { MenuEntry, MenuItem } from "../../state/ui";
import { Icon } from "../Icon";

/** Accessible popup menu with keyboard navigation and nested submenus. */
export function Menu({
  items,
  x,
  y,
  onClose,
  autoFocus = true,
  onNavigateOut,
  className,
}: {
  items: MenuEntry[];
  x: number;
  y: number;
  onClose: () => void;
  autoFocus?: boolean;
  onNavigateOut?: (dir: -1 | 1) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [active, setActive] = useState(-1);
  const [sub, setSub] = useState<{ index: number; x: number; y: number } | null>(null);
  const actionable = items.map((it, i) => (it !== "separator" && !it.disabled ? i : -1)).filter((i) => i >= 0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const nx = Math.max(4, Math.min(x, window.innerWidth - r.width - 4));
    const ny = y + r.height > window.innerHeight - 4 ? Math.max(4, window.innerHeight - r.height - 4) : y;
    setPos({ x: nx, y: ny });
  }, [x, y, items]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const run = (item: MenuItem) => {
    if (item.disabled || item.submenu) return;
    onClose();
    item.run?.();
  };

  const openSub = (index: number) => {
    const el = ref.current?.querySelectorAll<HTMLElement>("[data-index]")[actionable.indexOf(index)];
    const r = el?.getBoundingClientRect();
    if (r) setSub({ index, x: r.right - 2, y: r.top - 4 });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (sub) return;
    const pos = actionable.indexOf(active);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(actionable[(pos + 1) % actionable.length]);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(actionable[(pos - 1 + actionable.length) % actionable.length]);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(actionable[0]);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(actionable[actionable.length - 1]);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const it = items[active];
      if (it && it !== "separator") {
        if (it.submenu) openSub(active);
        else run(it);
      }
    } else if (e.key === "ArrowRight") {
      const it = items[active];
      if (it && it !== "separator" && it.submenu) {
        e.preventDefault();
        openSub(active);
      } else if (onNavigateOut) {
        e.preventDefault();
        onNavigateOut(1);
      }
    } else if (e.key === "ArrowLeft" && onNavigateOut) {
      e.preventDefault();
      onNavigateOut(-1);
    } else if (e.key === "Escape" || (e.key === "ArrowLeft" && !onNavigateOut)) {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key.length === 1) {
      const ch = e.key.toLowerCase();
      const hit = actionable.find((i) => (items[i] as MenuItem).label.toLowerCase().startsWith(ch));
      if (hit !== undefined) setActive(hit);
    }
  };

  return (
    <>
      <div
        ref={ref}
        className={`menu ${className ?? ""}`}
        role="menu"
        tabIndex={-1}
        style={{ left: pos.x, top: pos.y }}
        onKeyDown={onKeyDown}
        onContextMenu={(e) => e.preventDefault()}
      >
        {items.map((it, i) =>
          it === "separator" ? (
            <div key={i} className="menu-sep" role="separator" />
          ) : (
            <button
              key={i}
              type="button"
              role={it.checked !== undefined ? "menuitemcheckbox" : "menuitem"}
              aria-checked={it.checked}
              aria-disabled={it.disabled}
              aria-haspopup={it.submenu ? "menu" : undefined}
              data-index={i}
              style={{ ["--i" as string]: Math.min(i, 16) }}
              className={`menu-item ${i === active ? "active" : ""} ${it.danger ? "danger" : ""}`}
              disabled={it.disabled}
              onMouseEnter={() => {
                setActive(i);
                if (it.submenu) openSub(i);
                else setSub(null);
              }}
              onClick={() => (it.submenu ? openSub(i) : run(it))}
            >
              <span className="menu-check">{it.checked && <Icon name="check" size={14} />}</span>
              <span className="menu-label">{it.label}</span>
              {it.keybinding && <span className="menu-key">{formatBinding(it.keybinding)}</span>}
              {it.submenu && <Icon name="chevron-right" size={14} className="menu-sub" />}
            </button>
          ),
        )}
      </div>
      {sub && (items[sub.index] as MenuItem).submenu && (
        <Menu
          items={(items[sub.index] as MenuItem).submenu!}
          x={sub.x}
          y={sub.y}
          onClose={() => {
            setSub(null);
            onClose();
          }}
          onNavigateOut={(dir) => {
            if (dir === -1) {
              setSub(null);
              ref.current?.focus();
            }
          }}
        />
      )}
    </>
  );
}
