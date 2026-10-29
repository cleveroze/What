import { bindingFor, runCommand } from "../commands/registry";
import { formatBinding } from "../lib/keys";
import { useStore } from "../lib/store";
import { editorStore, openSettingsTab } from "../state/editors";
import { problemsStore } from "../state/problems";
import { setSetting, settingsStore, type ActivityItemId } from "../state/settings";
import { openContextMenu } from "../state/ui";
import { showPanel, showSidebarView, workspaceStore } from "../state/workspace";
import { Icon } from "./Icon";

const ITEMS: Record<ActivityItemId, { label: string; icon: string; command: string }> = {
  explorer: { label: "Explorer", icon: "files", command: "view.explorer" },
  search: { label: "Search", icon: "search", command: "edit.findInFiles" },
  terminal: { label: "Terminal", icon: "terminal", command: "terminal.toggle" },
  problems: { label: "Problems", icon: "problems", command: "view.problems" },
  settings: { label: "Settings", icon: "settings", command: "settings.open" },
};

export const ACTIVITY_LABELS = Object.fromEntries(Object.entries(ITEMS).map(([k, v]) => [k, v.label])) as Record<ActivityItemId, string>;

function activate(id: ActivityItemId) {
  switch (id) {
    case "explorer":
      return showSidebarView("explorer", true);
    case "search":
      return showSidebarView("search", true);
    case "terminal":
      return runCommand("terminal.toggle");
    case "problems":
      return showPanel("problems", true);
    case "settings":
      return openSettingsTab();
  }
}

export function ActivityBar({ horizontal }: { horizontal: boolean }) {
  const order = useStore(settingsStore, (s) => s["layout.activityItems"]);
  const hidden = useStore(settingsStore, (s) => s["layout.hiddenActivityItems"]);
  const layout = useStore(workspaceStore, (s) => s.layout);
  const settingsActive = useStore(editorStore, (s) => s.activeTabId === "settings");
  const problems = useStore(problemsStore, (s) => s.errors + s.warnings);
  const items = order.filter((i) => !hidden.includes(i));

  const isActive = (id: ActivityItemId) => {
    if (id === "explorer" || id === "search") return layout.sidebarVisible && layout.sidebarView === id;
    if (id === "terminal" || id === "problems") return layout.panelVisible && layout.panelTab === id;
    return settingsActive;
  };
  // The sliding indicator follows the first active sidebar item.
  const activeIndex = items.findIndex((i) => (i === "explorer" || i === "search") && isActive(i));

  const move = (id: ActivityItemId, delta: number) => {
    const next = [...order];
    const i = next.indexOf(id);
    const j = i + delta;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setSetting("layout.activityItems", next);
  };

  const menuFor = (e: React.MouseEvent, id?: ActivityItemId) =>
    openContextMenu(e, [
      ...order.map((i) => ({
        label: ITEMS[i].label,
        checked: !hidden.includes(i),
        run: () =>
          setSetting(
            "layout.hiddenActivityItems",
            hidden.includes(i) ? hidden.filter((h) => h !== i) : [...hidden, i],
          ),
      })),
      "separator",
      ...(id
        ? [
            { label: horizontal ? "Move Left" : "Move Up", disabled: order.indexOf(id) === 0, run: () => move(id, -1) },
            { label: horizontal ? "Move Right" : "Move Down", disabled: order.indexOf(id) === order.length - 1, run: () => move(id, 1) },
            "separator" as const,
          ]
        : []),
      { label: horizontal ? "Move Activity Bar to Side" : "Move Activity Bar to Top", run: () => setSetting("layout.activityBarPosition", horizontal ? "side" : "top") },
      { label: "Hide Activity Bar", run: () => setSetting("layout.activityBarVisible", false) },
    ]);

  return (
    <nav
      className={`activitybar ${horizontal ? "horizontal" : "vertical"}`}
      aria-label="Activity bar"
      onContextMenu={(e) => menuFor(e)}
      style={{ ["--active-index" as string]: activeIndex }}
    >
      <span className={`activity-indicator ${activeIndex < 0 ? "hidden" : ""}`} aria-hidden />
      {items.map((id) => {
        const item = ITEMS[id];
        const key = bindingFor(item.command);
        return (
          <button
            key={id}
            type="button"
            className={`activity-item ${isActive(id) ? "active" : ""} ${id === "explorer" || id === "search" ? "sidebar-item" : ""}`}
            aria-label={item.label}
            aria-pressed={isActive(id)}
            title={key ? `${item.label} (${formatBinding(key)})` : item.label}
            onClick={() => activate(id)}
            onContextMenu={(e) => {
              e.stopPropagation();
              menuFor(e, id);
            }}
          >
            <Icon name={item.icon} size={horizontal ? 18 : 22} />
            {id === "problems" && problems > 0 && <span className="activity-badge">{problems > 99 ? "99+" : problems}</span>}
          </button>
        );
      })}
    </nav>
  );
}
