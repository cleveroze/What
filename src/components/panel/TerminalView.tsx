import { useEffect, useLayoutEffect, useRef } from "react";
import { useStore } from "../../lib/store";
import { createTerminal, ensureTerminal, fitTerminal, focusTerminal, mountTerminal, terminalStore } from "../../state/terminals";
import { workspaceStore } from "../../state/workspace";
import { Button } from "../ui/controls";

export function TerminalView({ visible }: { visible: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const activeId = useStore(terminalStore, (s) => s.activeId);
  const count = useStore(terminalStore, (s) => s.sessions.length);

  useLayoutEffect(() => {
    if (!visible || !activeId || !ref.current) return;
    // Only the active terminal's host element stays attached.
    for (const child of [...ref.current.children]) {
      if (child.classList.contains("terminal-host")) child.remove();
    }
    mountTerminal(activeId, ref.current);
    focusTerminal(activeId);
  }, [activeId, visible]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const id = terminalStore.get().activeId;
        if (id) fitTerminal(id);
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Wait for session restore so the shell starts in the workspace folder.
  const ready = useStore(workspaceStore, (s) => s.ready);
  useEffect(() => {
    if (visible && ready) ensureTerminal();
  }, [visible, ready]);

  return (
    <div className="terminal-view" ref={ref} onClick={() => focusTerminal()}>
      {count === 0 && (
        <div className="panel-empty">
          <p>No terminal is running.</p>
          <Button variant="tonal" icon="plus" onClick={() => createTerminal()}>
            New Terminal
          </Button>
        </div>
      )}
    </div>
  );
}
