import { useEffect, useRef, useState } from "react";
import { inputBoxStore } from "../extensions/host";
import { useStore } from "../lib/store";
import { closeContextMenu, contextMenuStore, dialogStore, dismissToast, toastStore } from "../state/ui";
import type { ShapeName } from "../lib/shapes";
import { Icon } from "./Icon";
import { MorphShape } from "./Shape";

const TOAST_SHAPES: Record<string, ShapeName> = { error: "softBurst", warning: "triangle", success: "cookie9", info: "clover4" };
import { Menu } from "./ui/Menu";

export function ContextMenuHost() {
  const menu = useStore(contextMenuStore, (s) => s.menu);
  useEffect(() => {
    if (!menu) return;
    const prev = document.activeElement as HTMLElement | null;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest(".menu")) closeContextMenu();
    };
    const onBlur = () => closeContextMenu();
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("blur", onBlur);
    window.addEventListener("resize", onBlur);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("resize", onBlur);
      if (prev?.isConnected && document.activeElement === document.body) prev.focus();
    };
  }, [menu]);
  if (!menu) return null;
  return <Menu items={menu.items} x={menu.x} y={menu.y} onClose={closeContextMenu} />;
}

export function DialogHost() {
  const dialog = useStore(dialogStore, (s) => s.dialog);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!dialog) return;
    const prev = document.activeElement as HTMLElement | null;
    const primary = ref.current?.querySelector<HTMLButtonElement>(".btn-filled, .btn-danger");
    (primary ?? ref.current?.querySelector<HTMLButtonElement>("button"))?.focus();
    return () => prev?.focus?.();
  }, [dialog]);
  if (!dialog) return null;
  const danger = dialog.buttons.some((b) => b.danger);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      dialog.resolve(dialog.cancelValue);
    }
    if (e.key === "Tab") {
      const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
      const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
      e.preventDefault();
      buttons[(i + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
    }
  };
  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && dialog.resolve(dialog.cancelValue)}>
      <div ref={ref} className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" onKeyDown={onKey}>
        <div className={`dialog-icon ${danger ? "danger" : ""}`}>
          <MorphShape name={danger ? "softBurst" : "cookie9"} from="circle" size={48} spin={90} fill={danger ? "color-mix(in srgb, var(--danger) 22%, var(--raised))" : "var(--accent-soft)"} />
          <Icon name={danger ? "warning" : dialog.buttons.length > 1 ? "info" : "success"} size={20} />
        </div>
        <h2 id="dlg-title">{dialog.title}</h2>
        {dialog.message && <p className="dialog-message">{dialog.message}</p>}
        {dialog.detail && <p className="dialog-detail">{dialog.detail}</p>}
        <div className="dialog-actions">
          {dialog.buttons.map((b, i) => (
            <button
              key={i}
              type="button"
              className={`btn ${b.danger && b.primary ? "btn-danger" : b.primary ? "btn-filled" : "btn-text"}`}
              onClick={() => dialog.resolve(b.value)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Text prompt used by extensions (`stride.window.showInput`). */
export function InputBoxHost() {
  const box = useStore(inputBoxStore, (s) => s.box);
  const [value, setValue] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!box) return;
    setValue(box.value);
    requestAnimationFrame(() => ref.current?.select());
  }, [box]);
  if (!box) return null;
  return (
    <div className="palette-scrim" onPointerDown={(e) => e.target === e.currentTarget && box.resolve(null)}>
      <div className="palette input-box-dialog" role="dialog" aria-label={box.title}>
        <div className="input-box-title">
          <Icon name="puzzle" size={14} /> {box.title}
        </div>
        <div className="palette-input">
          <input
            ref={ref}
            value={value}
            placeholder={box.prompt}
            aria-label={box.prompt}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") box.resolve(value);
              if (e.key === "Escape") {
                e.stopPropagation();
                box.resolve(null);
              }
            }}
          />
        </div>
        <div className="palette-footer">
          <span>{box.prompt}</span>
          <span>
            <kbd>Enter</kbd> OK
          </span>
          <span>
            <kbd>Esc</kbd> cancel
          </span>
        </div>
      </div>
    </div>
  );
}

export function Toasts() {
  const toasts = useStore(toastStore, (s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind} ${t.leaving ? "leaving" : ""}`}>
          <span className="toast-icon">
            <MorphShape name={TOAST_SHAPES[t.kind]} from="circle" size={30} spin={120} fill="currentColor" />
            <Icon name={t.kind === "error" ? "close" : t.kind === "warning" ? "warning" : t.kind === "success" ? "check" : "info"} size={15} />
          </span>
          <div className="toast-body">
            <div className="toast-message">{t.message}</div>
            {t.detail && <div className="toast-detail">{t.detail}</div>}
          </div>
          <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
