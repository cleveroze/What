import { useStore } from "../../lib/store";
import { workspaceStore } from "../../state/workspace";
import { Explorer } from "./Explorer";
import { SearchView } from "./SearchView";

export function Sidebar() {
  const view = useStore(workspaceStore, (s) => s.layout.sidebarView);
  return (
    <aside className="sidebar sheet" aria-label={view === "explorer" ? "Explorer" : "Search"}>
      <div className="sidebar-view" key={view}>
        {view === "explorer" ? <Explorer /> : <SearchView />}
      </div>
    </aside>
  );
}
