import { useEffect, useRef } from "react";
import { useStore } from "../lib/store";
import { closeContextMenu, contextMenuStore, dialogStore, dismissToast, toastStore } from "../state/ui";
import { Icon } from "./Icon";
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

export function Toasts() {
  const toasts = useStore(toastStore, (s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <Icon name={t.kind === "error" ? "error" : t.kind === "warning" ? "warning" : t.kind === "success" ? "success" : "info"} className="toast-icon" />
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
