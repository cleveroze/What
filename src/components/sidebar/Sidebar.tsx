import { useRef } from "react";
import { useStore } from "../../lib/store";
import { workspaceStore } from "../../state/workspace";
import { Explorer } from "./Explorer";
import { SearchView } from "./SearchView";
import { AssistantView } from "./AssistantView";
import { ExtensionsView } from "./ExtensionsView";

const ORDER = ["explorer", "search", "assistant", "extensions"];
const LABELS: Record<string, string> = { explorer: "Explorer", search: "Search", assistant: "AI Assistant", extensions: "Extensions" };

export function Sidebar() {
  const view = useStore(workspaceStore, (s) => s.layout.sidebarView);
  // Slide in the direction of travel through the activity bar.
  const prev = useRef(view);
  const dir = useRef<"up" | "down">("down");
  if (prev.current !== view) {
    dir.current = ORDER.indexOf(view) > ORDER.indexOf(prev.current) ? "down" : "up";
    prev.current = view;
  }
  return (
    <aside className="sidebar sheet" aria-label={LABELS[view]}>
      <div className={`sidebar-view slide-${dir.current}`} key={view}>
        {view === "explorer" ? <Explorer /> : view === "search" ? <SearchView /> : view === "assistant" ? <AssistantView /> : <ExtensionsView />}
      </div>
    </aside>
  );
}
