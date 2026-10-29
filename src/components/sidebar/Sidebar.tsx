import { useRef } from "react";
import { useStore } from "../../lib/store";
import { workspaceStore } from "../../state/workspace";
import { Explorer } from "./Explorer";
import { SearchView } from "./SearchView";

export function Sidebar() {
  const view = useStore(workspaceStore, (s) => s.layout.sidebarView);
  // Slide in the direction of travel through the activity bar.
  const prev = useRef(view);
  const dir = useRef<"up" | "down">("down");
  if (prev.current !== view) {
    dir.current = view === "search" ? "down" : "up";
    prev.current = view;
  }
  return (
    <aside className="sidebar sheet" aria-label={view === "explorer" ? "Explorer" : "Search"}>
      <div className={`sidebar-view slide-${dir.current}`} key={view}>
        {view === "explorer" ? <Explorer /> : <SearchView />}
      </div>
    </aside>
  );
}
