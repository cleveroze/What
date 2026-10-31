/** Links into Stride: `stride://` URLs from the Workshop website and files or
 * folders opened while Stride is already running (forwarded by the
 * single-instance plugin as "open-paths"). */
import { listen } from "@tauri-apps/api/event";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { installById, showExtension } from "../extensions/host";
import { fs } from "../ipc/native";
import { openFile } from "./editors";
import { log } from "./output";
import { reportError } from "./ui";
import { openFolder } from "./workspace";

const ID = /^[a-z0-9][a-z0-9-]{1,48}$/;

/** Handles `stride://install/<id>` and `stride://extension/<id>`. */
export async function handleLink(raw: string) {
  const [action, id] = raw.replace(/^stride:\/*/i, "").split(/[/?#]/).filter(Boolean);
  log(`Opened link ${raw}`);
  if (!id || !ID.test(id)) return;
  if (action === "install") await installById(id);
  else if (action === "extension") showExtension("installed", id);
}

export async function openPaths(paths: string[]) {
  const stats = await Promise.all(paths.map(async (p) => ({ p, dir: (await fs.stat(p)).isDir })));
  // Folders first: opening a folder replaces the open editors.
  for (const { p } of stats.filter((x) => x.dir)) await openFolder(p);
  for (const { p } of stats.filter((x) => !x.dir)) await openFile(p, { focus: true });
}

export async function initLinks() {
  const run = (urls: string[] | null) => urls?.forEach((u) => handleLink(u).catch((e) => reportError("Cannot open link", e)));
  await listen<string[]>("open-paths", (e) => openPaths(e.payload).catch((err) => reportError("Cannot open", err)));
  try {
    await onOpenUrl(run);
    run(await getCurrent());
  } catch (e) {
    log(`stride:// links are unavailable: ${e}`, "warn");
  }
}
