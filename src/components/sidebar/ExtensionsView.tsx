import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useState } from "react";
import { bindingFor } from "../../commands/registry";
import { builtinFiles } from "../../extensions/builtin";
import {
  createExtension,
  extensionsStore,
  fetchRegistry,
  installBundle,
  installFromFile,
  installFromWorkshop,
  openExtensionsFolder,
  openWorkshopSite,
  publishToWorkshop,
  reloadExtensions,
  setExtensionEnabled,
  uninstallExtension,
} from "../../extensions/host";
import type { ExtensionManifest, InstalledExtension, RegistryEntry } from "../../extensions/types";
import type { ShapeName } from "../../lib/shapes";
import { useStore } from "../../lib/store";
import { join } from "../../lib/path";
import { openFile } from "../../state/editors";
import { settingsStore } from "../../state/settings";
import { confirm, notify, openMenuAt, quickPick } from "../../state/ui";
import { EmptyState } from "../EmptyState";
import { Icon } from "../Icon";
import { LoadingIndicator, Shape } from "../Shape";
import { Button, IconButton, Switch } from "../ui/controls";

const PERMISSION_LABELS: Record<string, string> = { ai: "Uses AI", network: "Internet", clipboard: "Clipboard" };

function contributionsSummary(m: ExtensionManifest) {
  const c = m.contributes ?? {};
  const parts: string[] = [];
  if (c.themes?.length) parts.push(`${c.themes.length} theme${c.themes.length > 1 ? "s" : ""}`);
  if (c.snippets?.length) parts.push(`${c.snippets.length} snippets`);
  if (c.commands?.length) parts.push(`${c.commands.length} command${c.commands.length > 1 ? "s" : ""}`);
  return parts.join(" · ");
}

function Card({
  manifest,
  index,
  badge,
  actions,
  expanded,
  onToggle,
  error,
}: {
  manifest: (Pick<ExtensionManifest, "id" | "name" | "description" | "author" | "version" | "icon" | "permissions" | "categories"> & Partial<ExtensionManifest>) | RegistryEntry;
  index: number;
  badge?: string;
  actions: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  error?: string;
}) {
  const full = manifest as ExtensionManifest;
  return (
    <div className={`ext-card ${expanded ? "expanded" : ""}`} data-ext-id={manifest.id} style={{ ["--i" as string]: Math.min(index, 12) }}>
      <button type="button" className="ext-card-main" onClick={onToggle} aria-expanded={expanded}>
        <span className="ext-icon">
          <Shape name={(manifest.icon as ShapeName) ?? "cookie9"} size={36} fill="var(--accent-soft)" />
          <span className="ext-icon-letter">{manifest.name.charAt(0)}</span>
        </span>
        <span className="ext-text">
          <span className="ext-name">
            {manifest.name}
            {badge && <span className="ext-badge">{badge}</span>}
          </span>
          <span className="ext-desc">{manifest.description}</span>
          <span className="ext-meta">
            {"publisher" in manifest && manifest.publisher && !manifest.builtin ? `@${manifest.publisher}` : manifest.author} · v{manifest.version}
            {(manifest.permissions ?? []).map((p) => (
              <span key={p} className="ext-perm">
                {PERMISSION_LABELS[p] ?? p}
              </span>
            ))}
          </span>
        </span>
      </button>
      <div className="ext-actions">{actions}</div>
      {error && (
        <div className="ext-error">
          <Icon name="warning" size={13} /> {error}
        </div>
      )}
      {expanded && "summary" in manifest && manifest.summary && (
        <div className="ext-details">
          {(manifest.summary as RegistryEntry["summary"])!.commands.map((c) => (
            <div key={c} className="ext-detail-row">
              <Icon name="arrow-right" size={12} /> {c}
            </div>
          ))}
          {(manifest.summary as RegistryEntry["summary"])!.themes.map((t) => (
            <div key={t} className="ext-detail-row">
              <Icon name="palette" size={12} /> Theme “{t}”
            </div>
          ))}
          {(manifest.summary as RegistryEntry["summary"])!.snippets.length > 0 && (
            <div className="ext-detail-row">
              <Icon name="code" size={12} /> Snippets: {(manifest.summary as RegistryEntry["summary"])!.snippets.join(", ")}
            </div>
          )}
        </div>
      )}
      {expanded && full.contributes && (
        <div className="ext-details">
          {contributionsSummary(full) && <div className="ext-detail-title">Adds {contributionsSummary(full)}</div>}
          {full.contributes.commands?.map((c) => (
            <div key={c.id} className="ext-detail-row">
              <Icon name="arrow-right" size={12} /> {c.title}
              {c.keybinding && <span className="ext-key">{c.keybinding.toUpperCase()}</span>}
              {!c.keybinding && bindingFor(`ext.${full.id}.${c.id}`) && <span className="ext-key">{bindingFor(`ext.${full.id}.${c.id}`)!.toUpperCase()}</span>}
            </div>
          ))}
          {full.contributes.themes?.map((t) => (
            <div key={t.id} className="ext-detail-row">
              <Icon name="palette" size={12} /> Theme “{t.name}” — choose it in Settings → Themes
            </div>
          ))}
          {full.contributes.snippets && (
            <div className="ext-detail-row">
              <Icon name="code" size={12} /> Snippets: {[...new Set(full.contributes.snippets.map((s) => s.prefix))].join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Expands and scrolls to the extension a link or command asked for. */
function useFocus(setOpen: (id: string) => void, ready: boolean) {
  const view = useStore(extensionsStore, (s) => s.view);
  useEffect(() => {
    if (!view.focus || !ready) return;
    setOpen(view.focus);
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-ext-id="${CSS.escape(view.focus!)}"]`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      el?.classList.add("flash");
      setTimeout(() => el?.classList.remove("flash"), 1600);
    });
  }, [view.nonce, ready]); // eslint-disable-line react-hooks/exhaustive-deps
}

async function copyBuiltin(ext: InstalledExtension) {
  const name = `${ext.manifest.name} (my copy)`;
  const id = `${ext.manifest.id}-copy`;
  const files = builtinFiles(ext.manifest.id);
  delete files["extension.json"];
  const ok = await installBundle({ manifest: { ...ext.manifest, id, name, author: "Me" }, files });
  if (ok) notify("success", `Copied to your extensions as “${name}”`, "Open the extensions folder to edit it, then press Reload.");
}

function Installed({ query }: { query: string }) {
  const { installed, running, errors } = useStore(extensionsStore, (s) => s);
  const disabled = useStore(settingsStore, (s) => s["extensions.disabled"]);
  const [open, setOpen] = useState<string | null>(null);
  const registry = useStore(extensionsStore, (s) => s.registry);
  useFocus(setOpen, installed.length > 0);
  const list = installed.filter((e) => !query || `${e.manifest.name} ${e.manifest.description}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="ext-list">
      {list.map((ext, i) => {
        const on = !disabled.includes(ext.manifest.id);
        return (
          <Card
            key={ext.manifest.id}
            manifest={ext.manifest}
            index={i}
            badge={ext.builtin ? "Example" : undefined}
            expanded={open === ext.manifest.id}
            onToggle={() => setOpen(open === ext.manifest.id ? null : ext.manifest.id)}
            error={errors[ext.manifest.id]}
            actions={
              <>
                <Switch checked={on && !!running[ext.manifest.id]} onChange={(v) => setExtensionEnabled(ext.manifest.id, v)} label={`Enable ${ext.manifest.name}`} />
                <IconButton
                  icon="more"
                  label="More"
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    openMenuAt(r.left - 180, r.bottom + 4, [
                      ...(ext.builtin
                        ? [{ label: "Copy to my extensions (to edit)", run: () => copyBuiltin(ext) }]
                        : [
                            { label: "Edit code", disabled: !ext.manifest.main, run: () => ext.path && ext.manifest.main && openFile(join(ext.path, ext.manifest.main)) },
                            { label: "Edit extension.json", run: () => ext.path && openFile(join(ext.path, "extension.json")) },
                            "separator" as const,
                            { label: "Publish to the Workshop…", run: () => publishToWorkshop(ext) },
                          ]),
                      ...(registry?.some((r) => r.id === ext.manifest.id) || ext.builtin ? [{ label: "Open in the Workshop website", run: () => openWorkshopSite(ext.manifest.id) }] : []),
                      "separator" as const,
                      {
                        label: "Uninstall",
                        danger: true,
                        disabled: ext.builtin,
                        run: async () => {
                          if (await confirm("Uninstall extension", `Remove “${ext.manifest.name}”?`, "Uninstall", true)) uninstallExtension(ext);
                        },
                      },
                    ]);
                  }}
                />
              </>
            }
          />
        );
      })}
      {list.length === 0 && <p className="ext-empty">Nothing matches “{query}”.</p>}
    </div>
  );
}

function Workshop({ query }: { query: string }) {
  const { registry, registryError, registryLoading, installed, busy } = useStore(extensionsStore, (s) => s);
  const [open, setOpen] = useState<string | null>(null);
  const [category, setCategory] = useState<string>("All");
  useEffect(() => {
    fetchRegistry();
  }, []);
  useFocus((id) => {
    setOpen(id);
    setCategory("All");
  }, !!registry);
  const categories = useMemo(() => ["All", ...new Set((registry ?? []).flatMap((e) => e.categories ?? []))], [registry]);
  if (registryLoading && !registry) {
    return (
      <div className="ext-loading">
        <LoadingIndicator size={36} label="Loading the Workshop" />
        Loading the Workshop…
      </div>
    );
  }
  if (registryError) {
    return (
      <EmptyState shape="ghostish" icon="globe" title="Couldn't reach the Workshop" action={<Button variant="tonal" icon="refresh" onClick={() => fetchRegistry(true)}>Try again</Button>}>
        {registryError}. Check your internet connection.
      </EmptyState>
    );
  }
  const list = (registry ?? []).filter(
    (e: RegistryEntry) =>
      (category === "All" || e.categories?.includes(category as never)) &&
      (!query || `${e.name} ${e.description} ${e.author}`.toLowerCase().includes(query.toLowerCase())),
  );
  return (
    <>
      <div className="ext-chips">
        {categories.map((c) => (
          <button key={c} type="button" className={`ext-chip ${c === category ? "on" : ""}`} onClick={() => setCategory(c)}>
            {c}
          </button>
        ))}
      </div>
      <div className="ext-list">
        {list.map((entry, i) => {
          const have = installed.find((x) => x.manifest.id === entry.id);
          const updatable = have && !have.builtin && have.manifest.version !== entry.version;
          return (
            <Card
              key={entry.id}
              manifest={entry}
              index={i}
              badge={entry.builtin ? "Built in" : undefined}
              expanded={open === entry.id}
              onToggle={() => setOpen(open === entry.id ? null : entry.id)}
              actions={
                busy[entry.id] ? (
                  <LoadingIndicator size={22} label="Installing" />
                ) : (
                  <>
                    {have && !updatable ? (
                      <span className="ext-installed">
                        <Icon name="check" size={13} /> Installed
                      </span>
                    ) : (
                      <Button variant={updatable ? "tonal" : "filled"} onClick={() => installFromWorkshop(entry)}>
                        {updatable ? "Update" : "Install"}
                      </Button>
                    )}
                    <IconButton icon="external" label="Open on the Workshop website" onClick={() => openWorkshopSite(entry.id)} />
                  </>
                )
              }
            />
          );
        })}
        {list.length === 0 && <p className="ext-empty">No extensions match.</p>}
      </div>
    </>
  );
}

async function pickAndPublish() {
  const mine = extensionsStore.get().installed.filter((x) => !x.builtin);
  if (!mine.length) return notify("info", "Nothing to publish yet", "Create an extension first: ⋯ → Create a new extension.");
  const ext = await quickPick(
    mine.map((x) => ({ label: x.manifest.name, description: `${x.manifest.id} · v${x.manifest.version}`, value: x })),
    "Which extension do you want to publish?",
  );
  if (ext) publishToWorkshop(ext);
}

export function ExtensionsView() {
  const tab = useStore(extensionsStore, (s) => s.view.tab);
  const setTab = (t: "installed" | "workshop") => extensionsStore.set((s) => ({ ...s, view: { ...s.view, tab: t, focus: null } }));
  const [query, setQuery] = useState("");
  const count = useStore(extensionsStore, (s) => s.installed.length);

  const newExtension = async () => {
    const dir = await createExtension(`My Extension ${Math.floor(Math.random() * 900 + 100)}`);
    if (dir) {
      await openFile(join(dir, "main.js"));
      notify("success", "Your extension is ready", "Edit main.js, then press Reload in the Extensions panel. Try the command “Say Hello”.");
    }
  };

  return (
    <div className="extensions">
      <div className="sidebar-section-header">
        <span className="sidebar-section-title">Extensions</span>
        <div className="sidebar-actions">
          <IconButton icon="refresh" label="Reload extensions" onClick={() => (tab === "workshop" ? fetchRegistry(true) : reloadExtensions())} />
          <IconButton
            icon="more"
            label="More actions"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              openMenuAt(r.left - 200, r.bottom + 4, [
                { label: "Create a new extension…", run: newExtension },
                {
                  label: "Install from file (.stride-ext.json)…",
                  run: async () => {
                    const p = await openDialog({ multiple: false, filters: [{ name: "Stride extension", extensions: ["json"] }] });
                    if (typeof p === "string") installFromFile(p);
                  },
                },
                { label: "Open extensions folder", run: openExtensionsFolder },
                "separator",
                { label: "Open the Workshop website", run: () => openWorkshopSite() },
                { label: "Publish an extension…", run: pickAndPublish },
              ]);
            }}
          />
        </div>
      </div>
      <div className="ext-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "installed"} className={tab === "installed" ? "on" : ""} onClick={() => setTab("installed")}>
          Installed <span className="count-badge">{count}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === "workshop"} className={tab === "workshop" ? "on" : ""} onClick={() => setTab("workshop")}>
          <Icon name="globe" size={13} /> Workshop
        </button>
      </div>
      <div className="ext-search input-box">
        <Icon name="search" size={14} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tab === "workshop" ? "Search the Workshop" : "Search installed"} spellCheck={false} />
      </div>
      <div className="ext-body" key={tab}>
        {tab === "installed" ? <Installed query={query} /> : <Workshop query={query} />}
        {tab === "installed" && (
          <button type="button" className="ext-create" onClick={newExtension}>
            <Icon name="plus" size={14} />
            <span>
              <b>Build your own extension</b>
              <small>Creates a working example you can edit — a few lines of JavaScript.</small>
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
