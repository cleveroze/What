import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useEffect, useRef, useState } from "react";
import { ActivityBar } from "./components/ActivityBar";
import { CommandPalette } from "./components/CommandPalette";
import { EditorArea } from "./components/editor/EditorArea";
import { ContextMenuHost, DialogHost, InputBoxHost, Toasts } from "./components/overlays";
import { Panel } from "./components/panel/Panel";
import { Sash } from "./components/Sash";
import { Sidebar } from "./components/sidebar/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { TitleBar } from "./components/TitleBar";
import { Icon } from "./components/Icon";
import { Onboarding } from "./components/Onboarding";
import { TooltipHost } from "./components/Tooltip";
import { fs } from "./ipc/native";
import { useStore } from "./lib/store";
import { clamp } from "./lib/util";
import { autoSaveOnFocusChange, openFile } from "./state/editors";
import { settingsStore } from "./state/settings";
import { DEFAULT_LAYOUT, openFolder, setLayout, workspaceStore } from "./state/workspace";

const MIN_SIDEBAR = 170;
const MIN_PANEL = 100;

function useOsFileDrop() {
  const [over, setOver] = useState(false);
  useEffect(() => {
    const un = getCurrentWebview().onDragDropEvent(async (e) => {
      const p = e.payload;
      if (p.type === "enter" || p.type === "over") setOver(true);
      else if (p.type === "leave") setOver(false);
      else if (p.type === "drop") {
        setOver(false);
        let folderOpened = false;
        for (const path of p.paths) {
          const st = await fs.stat(path);
          if (st.isDir && !folderOpened) {
            folderOpened = await openFolder(path);
          } else if (!st.isDir) {
            await openFile(path, { focus: true });
          }
        }
      }
    });
    return () => {
      un.then((f) => f());
    };
  }, []);
  return over;
}

export function App() {
  const layout = useStore(workspaceStore, (s) => s.layout);
  const s = useStore(settingsStore, (x) => x);
  const dropping = useOsFileDrop();
  const startSize = useRef(0);
  const workbenchRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onBlur = () => autoSaveOnFocusChange();
    window.addEventListener("blur", onBlur);
    const noMenu = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("input, textarea, .monaco-editor, .xterm")) e.preventDefault();
    };
    window.addEventListener("contextmenu", noMenu);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("contextmenu", noMenu);
    };
  }, []);

  const right = s["layout.sidebarPosition"] === "right";
  const activityTop = s["layout.activityBarPosition"] === "top";
  const showActivitySide = s["layout.activityBarVisible"] && !activityTop;
  const showActivityTop = s["layout.activityBarVisible"] && activityTop && layout.sidebarVisible;
  const maxSidebar = () => Math.max(MIN_SIDEBAR, (workbenchRef.current?.clientWidth ?? 1200) - 320);
  const maxPanel = () => Math.max(MIN_PANEL, (mainRef.current?.clientHeight ?? 700) - 120);

  return (
    <div className={`app ${right ? "sidebar-right" : "sidebar-left"} ${s["layout.statusBarVisible"] ? "" : "no-status"}`}>
      <TitleBar />
      <div className="workbench" ref={workbenchRef}>
        {showActivitySide && <ActivityBar horizontal={false} />}
        {layout.sidebarVisible && (
          <div className="sidebar-wrap" style={{ width: clamp(layout.sidebarWidth, MIN_SIDEBAR, 900) }}>
            {showActivityTop && <ActivityBar horizontal />}
            <Sidebar />
          </div>
        )}
        {layout.sidebarVisible && (
          <Sash
            orientation="vertical"
            label="Resize side bar"
            onStart={() => (startSize.current = layout.sidebarWidth)}
            onDrag={(d) => {
              const w = startSize.current + (right ? -d : d);
              if (w < MIN_SIDEBAR - 60) setLayout({ sidebarVisible: false, sidebarWidth: startSize.current });
              else setLayout({ sidebarWidth: clamp(w, MIN_SIDEBAR, maxSidebar()) });
            }}
            onReset={() => setLayout({ sidebarWidth: DEFAULT_LAYOUT.sidebarWidth })}
          />
        )}
        <div className="main-column" ref={mainRef}>
          {!(layout.panelVisible && layout.panelMaximized) && <EditorArea />}
          {layout.panelVisible && !layout.panelMaximized && (
            <Sash
              orientation="horizontal"
              label="Resize panel"
              onStart={() => (startSize.current = layout.panelHeight)}
              onDrag={(d) => {
                const h = startSize.current - d;
                if (h < MIN_PANEL - 60) setLayout({ panelVisible: false, panelHeight: startSize.current });
                else setLayout({ panelHeight: clamp(h, MIN_PANEL, maxPanel()) });
              }}
              onReset={() => setLayout({ panelHeight: DEFAULT_LAYOUT.panelHeight })}
            />
          )}
          {layout.panelVisible && (
            <div className={`panel-wrap ${layout.panelMaximized ? "maximized" : ""}`} style={layout.panelMaximized ? undefined : { height: clamp(layout.panelHeight, MIN_PANEL, 2000) }}>
              <Panel />
            </div>
          )}
        </div>
      </div>
      {s["layout.statusBarVisible"] && <StatusBar />}
      <CommandPalette />
      <ContextMenuHost />
      <InputBoxHost />
      <DialogHost />
      <Onboarding />
      <Toasts />
      <TooltipHost />
      {dropping && (
        <div className="drop-overlay" aria-hidden>
          <div className="drop-card">
            <Icon name="folder-open" size={22} />
            Drop to open files or a folder
          </div>
        </div>
      )}
    </div>
  );
}
