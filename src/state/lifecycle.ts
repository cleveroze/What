import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirmAllDirty, dirtyDocs } from "./editors";
import { flushPersistence } from "./persist";
import { getSetting } from "./settings";
import { flushWorkspaceState } from "./workspace";

let exiting = false;

/** Closes the app after giving the user a chance to save dirty files. */
export async function requestExit() {
  if (exiting) return;
  exiting = true;
  try {
    if (getSetting("workbench.confirmClose") && dirtyDocs().length) {
      if (!(await confirmAllDirty())) return;
    }
    flushWorkspaceState();
    await flushPersistence();
    await getCurrentWindow().destroy();
  } finally {
    exiting = false;
  }
}

export async function installCloseHandler() {
  await getCurrentWindow().onCloseRequested((event) => {
    event.preventDefault();
    requestExit();
  });
}
