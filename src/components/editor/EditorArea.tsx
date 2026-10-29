import { lazy, Suspense } from "react";
import { useStore } from "../../lib/store";
import { editorStore } from "../../state/editors";
import { settingsStore } from "../../state/settings";
import { Breadcrumbs } from "./Breadcrumbs";
import { EditorHost } from "./EditorHost";
import { Tabs } from "./Tabs";
import { Welcome } from "./Welcome";

const SettingsPage = lazy(() => import("../settings/SettingsPage"));

export function EditorArea() {
  const kind = useStore(editorStore, (s) => s.tabs.find((t) => t.id === s.activeTabId)?.kind ?? null);
  const hasTabs = useStore(editorStore, (s) => s.tabs.length > 0);
  const breadcrumbs = useStore(settingsStore, (s) => s["layout.breadcrumbs"]);
  const showWelcome = useStore(settingsStore, (s) => s["workbench.showWelcome"]);
  return (
    <section className="editor-area sheet" aria-label="Editor">
      {hasTabs && <Tabs />}
      {kind === "doc" && breadcrumbs && <Breadcrumbs />}
      <div className="editor-body">
        <EditorHost visible={kind === "doc"} />
        {kind === "settings" && (
          <Suspense fallback={null}>
            <SettingsPage />
          </Suspense>
        )}
        {!hasTabs && showWelcome && <Welcome />}
        {!hasTabs && !showWelcome && <div className="editor-empty" />}
      </div>
    </section>
  );
}
