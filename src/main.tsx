import "@xterm/xterm/css/xterm.css";
import "./styles/index.css";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyZoom, registerBuiltinCommands } from "./commands/builtin";
import { initKeybindings } from "./commands/registry";
import "./editor/monaco";
import { fs } from "./ipc/native";
import { openFile } from "./state/editors";
import { installCloseHandler } from "./state/lifecycle";
import { log } from "./state/output";
import { load } from "./state/persist";
import "./state/problems";
import { getSetting, replaceSettings, sanitizeSettings, settingsStore } from "./state/settings";
import { reportError } from "./state/ui";
import { initWorkspace, markReady, openFolder } from "./state/workspace";
import { initThemeEngine } from "./theme/engine";

async function restoreSession(lastRoot: string | null) {
  const launch = await fs.launchPaths().catch(() => [] as string[]);
  if (launch.length) {
    for (const p of launch) {
      const st = await fs.stat(p);
      if (st.isDir) await openFolder(p, { skipConfirm: true });
      else await openFile(p, { focus: true });
    }
    return;
  }
  if (lastRoot && getSetting("workbench.restoreWorkspace")) {
    await openFolder(lastRoot, { skipConfirm: true });
  }
}

async function boot() {
  const win = getCurrentWindow();
  try {
    replaceSettings(sanitizeSettings(await load("settings")));
    initThemeEngine();
    registerBuiltinCommands();
    await initKeybindings();
    const lastRoot = await initWorkspace();

    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await installCloseHandler();
    applyZoom();
    let zoom = getSetting("window.zoom");
    settingsStore.subscribe(() => {
      if (getSetting("window.zoom") !== zoom) {
        zoom = getSetting("window.zoom");
        applyZoom();
      }
    });
    // Show the window once the themed UI has rendered (avoids a white flash).
    // Hidden webviews get no animation frames, so use a timer, not rAF.
    setTimeout(() => win.show().then(() => win.setFocus()).catch(() => {}), 40);
    await restoreSession(lastRoot);
    log("Verso ready");
  } catch (e) {
    reportError("Startup failed", e);
    win.show();
  } finally {
    markReady();
  }
}

boot();
