/** Material ripple: a single delegated listener adds an expanding ink circle
 * at the pointer position inside interactive elements. */
const SELECTOR = [
  ".btn", ".icon-btn", ".menu-item", ".palette-row", ".tree-row:not(.editing)", ".search-match",
  ".search-file-row", ".settings-nav-item", ".segmented button", ".status-item", ".problem-row",
  ".problem-file", ".preset-card", ".tab", ".welcome-card", ".checklist-item", ".panel-tab",
  ".menubar-item", ".command-center", ".terminal-item", ".crumb", ".welcome-recent", ".tip-action",
].join(",");

export function installRipple() {
  window.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button !== 0 || document.documentElement.dataset.animation === "off") return;
      const host = (e.target as Element).closest<HTMLElement>(SELECTOR);
      if (!host || host.matches(":disabled, [aria-disabled='true']")) return;
      const rect = host.getBoundingClientRect();
      const size = Math.hypot(rect.width, rect.height) * 2;
      const ink = document.createElement("span");
      ink.className = "ripple";
      ink.style.width = ink.style.height = `${size}px`;
      ink.style.left = `${e.clientX - rect.left - size / 2}px`;
      ink.style.top = `${e.clientY - rect.top - size / 2}px`;
      host.appendChild(ink);
      const release = () => {
        ink.classList.add("out");
        setTimeout(() => ink.remove(), 500);
        window.removeEventListener("pointerup", release);
        window.removeEventListener("pointercancel", release);
      };
      window.addEventListener("pointerup", release);
      window.addEventListener("pointercancel", release);
    },
    true,
  );
}
