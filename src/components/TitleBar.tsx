import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
import { bindingFor, getCommand, runCommand } from "../commands/registry";
import { basename } from "../lib/path";
import { useStore } from "../lib/store";
import { requestExit } from "../state/lifecycle";
import { settingsStore } from "../state/settings";
import { openPalette, type MenuEntry, type MenuItem } from "../state/ui";
import { clearRecent, openFolder, setLayout, workspaceStore } from "../state/workspace";
import { formatBinding } from "../lib/keys";
import { setSetting } from "../state/settings";
import { revealThemeFrom, themeStore } from "../theme/engine";
import { Icon } from "./Icon";
import { Logo } from "./Logo";
import { Menu } from "./ui/Menu";

const cmd = (id: string, label?: string): MenuItem => {
  const c = getCommand(id);
  return {
    label: label ?? c?.title ?? id,
    keybinding: bindingFor(id),
    disabled: !c || (c.enabled ? !c.enabled() : false),
    run: () => runCommand(id),
  };
};

function buildMenus(): { id: string; label: string; mnemonic: string; items: () => MenuEntry[] }[] {
  const s = settingsStore.get();
  const layout = workspaceStore.get().layout;
  const check = (item: MenuItem, checked: boolean): MenuItem => ({ ...item, checked });
  return [
    {
      id: "file",
      label: "File",
      mnemonic: "f",
      items: () => {
        const recent = workspaceStore.get().recent;
        return [
          cmd("file.newFile"),
          cmd("file.newFileInFolder", "New File in Folder…"),
          cmd("file.newFolder"),
          "separator",
          cmd("file.open"),
          cmd("file.openFolder"),
          {
            label: "Open Recent",
            submenu: recent.length
              ? ([
                  ...recent.slice(0, 10).map((r) => ({ label: r.path, run: () => openFolder(r.path) })),
                  "separator" as const,
                  { label: "More…", keybinding: bindingFor("file.openRecent"), run: () => runCommand("file.openRecent") },
                  { label: "Clear Recently Opened", run: clearRecent },
                ] as MenuEntry[])
              : [{ label: "No recent folders", disabled: true }],
          },
          "separator",
          cmd("file.save"),
          cmd("file.saveAs"),
          cmd("file.saveAll"),
          check({ label: "Auto Save", run: () => settingsStore.set((st) => ({ ...st, "files.autoSave": st["files.autoSave"] === "off" ? "afterDelay" : "off" })) }, s["files.autoSave"] !== "off"),
          "separator",
          cmd("file.revert"),
          cmd("file.closeEditor"),
          cmd("file.closeAll"),
          cmd("file.closeFolder"),
          "separator",
          cmd("settings.open", "Settings"),
          "separator",
          { label: "Exit", run: requestExit },
        ];
      },
    },
    {
      id: "edit",
      label: "Edit",
      mnemonic: "e",
      items: () => [
        cmd("edit.undo"),
        cmd("edit.redo"),
        "separator",
        cmd("edit.cut"),
        cmd("edit.copy"),
        cmd("edit.paste"),
        "separator",
        cmd("edit.find"),
        cmd("edit.replace"),
        "separator",
        cmd("edit.findInFiles"),
        cmd("edit.replaceInFiles"),
        "separator",
        cmd("edit.toggleComment"),
        cmd("edit.blockComment"),
        cmd("edit.format"),
      ],
    },
    {
      id: "selection",
      label: "Selection",
      mnemonic: "s",
      items: () => [
        cmd("edit.selectAll"),
        cmd("edit.expandSelection"),
        cmd("edit.shrinkSelection"),
        "separator",
        cmd("edit.copyLineUp"),
        cmd("edit.copyLineDown"),
        cmd("edit.moveLineUp"),
        cmd("edit.moveLineDown"),
        "separator",
        cmd("edit.cursorAbove"),
        cmd("edit.cursorBelow"),
        cmd("edit.cursorsLineEnds"),
        cmd("edit.addNextOccurrence"),
        cmd("edit.selectAllOccurrences"),
      ],
    },
    {
      id: "view",
      label: "View",
      mnemonic: "v",
      items: () => [
        cmd("workbench.commandPalette", "Command Palette…"),
        cmd("workbench.quickOpen"),
        "separator",
        cmd("view.explorer", "Explorer"),
        cmd("view.search", "Search"),
        cmd("view.problems", "Problems"),
        cmd("view.output", "Output"),
        cmd("terminal.toggle", "Terminal"),
        "separator",
        {
          label: "Appearance",
          submenu: [
            check(cmd("view.toggleSidebar", "Primary Side Bar"), layout.sidebarVisible),
            check(cmd("view.togglePanel", "Panel"), layout.panelVisible),
            check(cmd("view.toggleActivityBar", "Activity Bar"), s["layout.activityBarVisible"]),
            check(cmd("view.toggleStatusBar", "Status Bar"), s["layout.statusBarVisible"]),
            check(cmd("view.toggleBreadcrumbs", "Breadcrumbs"), s["layout.breadcrumbs"]),
            check(cmd("view.toggleMinimap", "Minimap"), s["editor.minimap"]),
            "separator",
            cmd("view.toggleSidebarPosition", s["layout.sidebarPosition"] === "left" ? "Move Side Bar Right" : "Move Side Bar Left"),
            cmd("view.maximizePanel"),
            cmd("view.fullscreen", "Full Screen"),
            "separator",
            cmd("view.zoomIn"),
            cmd("view.zoomOut"),
            cmd("view.zoomReset"),
          ],
        },
        check(cmd("view.toggleWordWrap", "Word Wrap"), s["editor.wordWrap"] !== "off"),
        "separator",
        cmd("theme.selectPreset", "Color Preset…"),
        cmd("theme.toggleDark"),
        cmd("settings.appearance", "Appearance & Customization…"),
      ],
    },
    {
      id: "go",
      label: "Go",
      mnemonic: "g",
      items: () => [
        cmd("view.nextEditor"),
        cmd("view.prevEditor"),
        "separator",
        cmd("workbench.quickOpen"),
        cmd("edit.gotoSymbol"),
        cmd("edit.gotoDefinition"),
        cmd("edit.peekDefinition"),
        cmd("edit.findReferences"),
        cmd("edit.gotoLine"),
      ],
    },
    {
      id: "terminal",
      label: "Terminal",
      mnemonic: "t",
      items: () => [
        cmd("terminal.new"),
        cmd("terminal.newWithShell"),
        "separator",
        cmd("terminal.runSelection"),
        cmd("terminal.clear"),
        cmd("terminal.kill"),
        "separator",
        cmd("terminal.selectDefaultShell"),
      ],
    },
    {
      id: "help",
      label: "Help",
      mnemonic: "h",
      items: () => [
        cmd("help.welcomeTour"),
        cmd("workbench.commandPalette", "Show All Commands"),
        cmd("settings.shortcuts", "Keyboard Shortcuts Reference"),
        "separator",
        cmd("help.showLog"),
        cmd("help.openConfigFolder"),
        "separator",
        cmd("help.about"),
      ],
    },
  ];
}

function WindowControls() {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const win = getCurrentWindow();
    win.isMaximized().then(setMaximized).catch(() => {});
    const un = win.onResized(() => win.isMaximized().then(setMaximized).catch(() => {}));
    return () => {
      un.then((f) => f());
    };
  }, []);
  const win = getCurrentWindow();
  return (
    <div className="window-controls">
      <button type="button" className="wc" aria-label="Minimize" data-tip="Minimize" onClick={() => win.minimize()}>
        <Icon name="win-min" size={16} />
      </button>
      <button type="button" className="wc" aria-label={maximized ? "Restore" : "Maximize"} data-tip={maximized ? "Restore down" : "Maximize"} onClick={() => win.toggleMaximize()}>
        <Icon name={maximized ? "win-restore" : "win-max"} size={16} />
      </button>
      <button type="button" className="wc wc-close" aria-label="Close" data-tip="Close" onClick={requestExit}>
        <Icon name="win-close" size={16} />
      </button>
    </div>
  );
}

function ThemeToggle() {
  const dark = useStore(themeStore, (s) => s.tokens.dark);
  return (
    <button
      type="button"
      className={`icon-btn theme-toggle ${dark ? "dark" : "light"}`}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      data-tip={dark ? "Switch to light theme" : "Switch to dark theme"}
      data-tip-desc="Changes are animated and saved automatically. More colors in Settings → Themes."
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        revealThemeFrom(r.left + r.width / 2, r.top + r.height / 2, () => setSetting("theme.mode", dark ? "light" : "dark"));
      }}
    >
      <Icon name="sun" size={16} className="tt-sun" />
      <Icon name="moon" size={16} className="tt-moon" />
    </button>
  );
}

export function TitleBar() {
  const [logoHover, setLogoHover] = useState(false);
  const root = useStore(workspaceStore, (s) => s.root);
  const layout = useStore(workspaceStore, (s) => s.layout);
  useStore(settingsStore, (s) => s);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const menus = buildMenus();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) return;
      const letter = e.code.startsWith("Key") ? e.code.slice(3).toLowerCase() : "";
      const idx = menus.findIndex((m) => m.mnemonic === letter);
      if (idx >= 0) {
        e.preventDefault();
        setOpenIdx(idx);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (openIdx === null) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element;
      if (!t.closest(".menu") && !t.closest(".menubar")) setOpenIdx(null);
    };
    const onBlur = () => setOpenIdx(null);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [openIdx]);

  const anchor = openIdx !== null ? buttons.current[openIdx]?.getBoundingClientRect() : null;

  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar-brand" onPointerEnter={() => setLogoHover(true)} onPointerLeave={() => setLogoHover(false)}>
        <Logo size={20} shape={logoHover ? "softBurst" : "cookie9"} />
      </div>
      <nav className="menubar" role="menubar" aria-label="Application menu">
        {menus.map((m, i) => (
          <button
            key={m.id}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={openIdx === i}
            className={`menubar-item ${openIdx === i ? "open" : ""}`}
            onPointerDown={(e) => {
              e.preventDefault();
              setOpenIdx(openIdx === i ? null : i);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
                e.preventDefault();
                setOpenIdx(i);
              }
            }}
            onPointerEnter={() => openIdx !== null && openIdx !== i && setOpenIdx(i)}
          >
            {m.label}
          </button>
        ))}
      </nav>
      <div className="titlebar-drag" data-tauri-drag-region />
      <button
        type="button"
        className="command-center"
        onClick={() => openPalette("files")}
        data-tip="Search files and commands"
        data-tip-desc="Type a file name to open it, or start with > to run any command."
        data-tip-keys={bindingFor("workbench.quickOpen")}
      >
        <Icon name="search" size={14} />
        <span>{root ? `Search ${basename(root)}` : "Search files and commands"}</span>
        <span className="command-center-hint">{formatBinding(bindingFor("workbench.quickOpen"))}</span>
      </button>
      <div className="titlebar-drag" data-tauri-drag-region />
      <div className="titlebar-actions">
        <ThemeToggle />
        <button
          type="button"
          className={`icon-btn ${layout.sidebarVisible ? "is-active" : ""}`}
          aria-label="Toggle Primary Side Bar"
          aria-pressed={layout.sidebarVisible}
          data-tip="Toggle side bar"
          data-tip-desc="Show or hide the Explorer and Search panel."
          data-tip-keys={bindingFor("view.toggleSidebar")}
          onClick={() => setLayout({ sidebarVisible: !layout.sidebarVisible })}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
            <rect x="2" y="2.75" width="12" height="10.5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <rect x="2" y="2.75" width="4.5" height="10.5" rx="2" fill={layout.sidebarVisible ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </button>
        <button
          type="button"
          className={`icon-btn ${layout.panelVisible ? "is-active" : ""}`}
          aria-label="Toggle Panel"
          aria-pressed={layout.panelVisible}
          data-tip="Toggle panel"
          data-tip-desc="Show or hide the Terminal, Output and Problems area."
          data-tip-keys={bindingFor("view.togglePanel")}
          onClick={() => setLayout({ panelVisible: !layout.panelVisible })}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
            <rect x="2" y="2.75" width="12" height="10.5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <rect x="2" y="8.75" width="12" height="4.5" rx="2" fill={layout.panelVisible ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </button>
      </div>
      <WindowControls />
      {openIdx !== null && anchor && (
        <Menu
          key={openIdx}
          className="menubar-dropdown"
          items={menus[openIdx].items()}
          x={anchor.left}
          y={anchor.bottom + 2}
          onClose={() => setOpenIdx(null)}
          onNavigateOut={(dir) => setOpenIdx((openIdx + dir + menus.length) % menus.length)}
        />
      )}
    </header>
  );
}
