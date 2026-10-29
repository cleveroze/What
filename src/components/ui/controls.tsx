import { useEffect, useRef, useState, type ReactNode, type ButtonHTMLAttributes, type KeyboardEvent } from "react";
import { isHex } from "../../lib/color";
import { formatBinding } from "../../lib/keys";
import { clamp } from "../../lib/util";
import { openMenuAt } from "../../state/ui";
import { Icon, type IconName } from "../Icon";

export function IconButton({
  icon,
  label,
  active,
  className,
  size = 16,
  ...rest
}: { icon: IconName; label: string; active?: boolean; size?: number } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`icon-btn ${active ? "is-active" : ""} ${className ?? ""}`}
      aria-label={label}
      aria-pressed={active}
      data-tip={label}
      {...rest}
    >
      <Icon name={icon} size={size} />
    </button>
  );
}

export function Button({
  variant = "tonal",
  icon,
  children,
  className,
  ...rest
}: { variant?: "filled" | "tonal" | "outlined" | "text" | "danger"; icon?: IconName; children?: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`btn btn-${variant} ${className ?? ""}`} {...rest}>
      {icon && <Icon name={icon} size={15} />}
      {children && <span>{children}</span>}
    </button>
  );
}

/** Material 3 style switch: the thumb grows when on and stretches on press. */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`switch ${checked ? "on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-thumb">
        <svg viewBox="0 0 16 16" className="switch-check" aria-hidden>
          <path d="M3.5 8.5 6.5 11.5 12.5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; icon?: IconName }[];
  onChange: (v: T) => void;
  label?: string;
}) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next = options[(idx + (e.key === "ArrowRight" ? 1 : -1) + options.length) % options.length];
      onChange(next.value);
    }
  };
  return (
    <div
      className="segmented"
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKey}
      style={{ ["--seg-count" as string]: options.length, ["--seg-index" as string]: idx }}
    >
      <span className="segmented-indicator" aria-hidden />
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          className={o.value === value ? "selected" : ""}
          onClick={() => onChange(o.value)}
        >
          {o.icon && <Icon name={o.icon} size={14} />}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Expressive slider: a pill handle that narrows while dragging and a value
 * bubble. Supports keyboard (arrows, PageUp/Down, Home/End). */
export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  format = (v) => String(v),
  label,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const pct = ((clamp(value, min, max) - min) / (max - min)) * 100;
  const snap = (v: number) => {
    const s = Math.round((v - min) / step) * step + min;
    return clamp(Number(s.toFixed(4)), min, max);
  };
  const fromPointer = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect();
    const t = clamp((clientX - rect.left) / rect.width, 0, 1);
    onChange(snap(min + t * (max - min)));
  };
  return (
    <div
      ref={ref}
      className={`slider ${dragging ? "dragging" : ""}`}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={format(value)}
      style={{ ["--pct" as string]: `${pct}%` }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        fromPointer(e.clientX);
      }}
      onPointerMove={(e) => dragging && fromPointer(e.clientX)}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onKeyDown={(e) => {
        const big = (max - min) / 10;
        const map: Record<string, number> = {
          ArrowRight: value + step, ArrowUp: value + step, ArrowLeft: value - step, ArrowDown: value - step,
          PageUp: value + big, PageDown: value - big, Home: min, End: max,
        };
        if (e.key in map) {
          e.preventDefault();
          onChange(snap(map[e.key]));
        }
      }}
    >
      <span className="slider-track">
        <span className="slider-fill" />
      </span>
      <span className="slider-handle">
        <span className="slider-bubble">{format(value)}</span>
      </span>
    </div>
  );
}

export function Select<T extends string | number>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: { value: T; label: string; description?: string }[];
  onChange: (v: T) => void;
  label?: string;
  className?: string;
}) {
  const current = options.find((o) => o.value === value);
  const ref = useRef<HTMLButtonElement>(null);
  const open = () => {
    const r = ref.current!.getBoundingClientRect();
    openMenuAt(
      r.left,
      r.bottom + 4,
      options.map((o) => ({ label: o.label, checked: o.value === value, run: () => onChange(o.value) })),
    );
  };
  return (
    <button
      ref={ref}
      type="button"
      className={`select ${className ?? ""}`}
      aria-haspopup="menu"
      aria-label={label}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const idx = options.findIndex((o) => o.value === value);
          const next = options[clamp(idx + (e.key === "ArrowDown" ? 1 : -1), 0, options.length - 1)];
          onChange(next.value);
        }
      }}
    >
      <span>{current?.label ?? String(value)}</span>
      <Icon name="chevron-down" size={14} />
    </button>
  );
}

export function TextField({
  value,
  onChange,
  placeholder,
  monospace,
  onCommit,
  className,
  label,
}: {
  value: string;
  onChange?: (v: string) => void;
  onCommit?: (v: string) => void;
  placeholder?: string;
  monospace?: boolean;
  className?: string;
  label?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className={`text-field ${monospace ? "mono" : ""} ${className ?? ""}`}
      value={draft}
      placeholder={placeholder}
      aria-label={label}
      spellCheck={false}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange?.(e.target.value);
      }}
      onBlur={() => onCommit && draft !== value && onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onCommit) onCommit(draft);
        if (e.key === "Escape") setDraft(value);
      }}
    />
  );
}

export function NumberField({ value, min, max, step = 1, onChange, label }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label?: string }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = parseFloat(draft);
    if (Number.isFinite(n)) onChange(clamp(n, min, max));
    else setDraft(String(value));
  };
  return (
    <div className="number-field">
      <button type="button" aria-label="Decrease" onClick={() => onChange(clamp(Number((value - step).toFixed(4)), min, max))}>
        −
      </button>
      <input
        value={draft}
        inputMode="decimal"
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "ArrowUp") { e.preventDefault(); onChange(clamp(Number((value + step).toFixed(4)), min, max)); }
          if (e.key === "ArrowDown") { e.preventDefault(); onChange(clamp(Number((value - step).toFixed(4)), min, max)); }
        }}
      />
      <button type="button" aria-label="Increase" onClick={() => onChange(clamp(Number((value + step).toFixed(4)), min, max))}>
        +
      </button>
    </div>
  );
}

export function ColorField({ value, onChange, placeholder, swatches = [] }: { value: string; onChange: (v: string) => void; placeholder: string; swatches?: string[] }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const shown = isHex(value) ? value : placeholder;
  return (
    <div className="color-field">
      {swatches.map((s) => (
        <button
          key={s}
          type="button"
          className={`swatch ${value.toLowerCase() === s.toLowerCase() ? "selected" : ""}`}
          style={{ background: s }}
          aria-label={`Use ${s}`}
          onClick={() => onChange(s)}
        />
      ))}
      <label className="swatch picker" style={{ background: shown }} title="Pick a custom color">
        <input type="color" value={shown} onChange={(e) => onChange(e.target.value)} aria-label="Custom color" />
      </label>
      <input
        className="text-field mono hex"
        value={draft}
        placeholder={placeholder}
        spellCheck={false}
        aria-label="Hex color"
        onChange={(e) => {
          setDraft(e.target.value);
          if (isHex(e.target.value) && e.target.value.length >= 7) onChange(e.target.value);
        }}
        onBlur={() => {
          if (draft === "" || isHex(draft)) onChange(draft);
          else setDraft(value);
        }}
      />
      {value && (
        <IconButton icon="reset" label="Reset to preset color" onClick={() => onChange("")} />
      )}
    </div>
  );
}

export function Kbd({ binding }: { binding?: string | null }) {
  if (!binding) return null;
  return (
    <span className="kbd-group">
      {formatBinding(binding)
        .split(" ")
        .map((chord, i) => (
          <span key={i} className="kbd-chord">
            {chord.split("+").map((k, j) => (
              <kbd key={j}>{k}</kbd>
            ))}
          </span>
        ))}
    </span>
  );
}
