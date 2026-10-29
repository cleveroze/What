import type { ReactNode } from "react";
import type { ShapeName } from "../lib/shapes";
import { Icon } from "./Icon";
import { MorphShape } from "./Shape";

/** Friendly empty state: an expressive shape, a short explanation and
 * (optionally) the action that gets the user going. */
export function EmptyState({
  shape,
  icon,
  title,
  children,
  action,
  size = 64,
}: {
  shape: ShapeName;
  icon: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  size?: number;
}) {
  return (
    <div className="empty-state">
      <span className="empty-art" style={{ width: size, height: size }}>
        <MorphShape name={shape} from="circle" size={size} fill="var(--accent-soft)" spin={120} />
        <Icon name={icon} size={Math.round(size * 0.36)} />
      </span>
      <div className="empty-title">{title}</div>
      {children && <div className="empty-text">{children}</div>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}
