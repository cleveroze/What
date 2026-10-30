// Shared site behaviour: M3 shapes (rendered and morphed with the same
// library as the app), theme toggle with circular reveal, scroll reveals.
import { lerpRadii, radiiToPath, shapePath, shapeRadii, springProgress } from "./shapes.js";

export const DOWNLOAD_URL = "https://github.com/cleveroze/What/releases/latest/download/Stride-Setup.exe";
export const RELEASES_URL = "https://github.com/cleveroze/What/releases/latest";

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Renders <span data-shape="cookie9" data-size="52"> as an SVG shape. */
export function renderShapes(root = document) {
  for (const el of root.querySelectorAll("[data-shape]:not([data-ready])")) {
    const size = Number(el.dataset.size || 52);
    el.insertAdjacentHTML(
      "afterbegin",
      `<svg class="shape" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><path fill="currentColor" d="${shapePath(el.dataset.shape, size)}"/></svg>`,
    );
    el.dataset.ready = "1";
  }
}

/** Cycles an element's SVG path through shapes with a spring morph. */
export function morphCycle(svgPath, size, shapes, interval = 2600) {
  let current = new Float64Array(shapeRadii(shapes[0]));
  let index = 0;
  svgPath.setAttribute("d", radiiToPath(current, size));
  if (reduced) return;
  setInterval(() => {
    index = (index + 1) % shapes.length;
    const from = new Float64Array(current);
    const to = shapeRadii(shapes[index]);
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / 900);
      current = lerpRadii(from, to, springProgress(t, 0.55, 12));
      svgPath.setAttribute("d", radiiToPath(current, size));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, interval);
}

function setupTheme() {
  const btn = document.querySelector("#theme");
  if (!btn) return;
  const saved = localStorage.getItem("stride-site-theme");
  if (saved) document.documentElement.dataset.theme = saved;
  const isDark = () =>
    document.documentElement.dataset.theme === "dark" ||
    (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
  const icon = () => (btn.innerHTML = isDark() ? SUN : MOON);
  icon();
  btn.addEventListener("click", (e) => {
    const apply = () => {
      const next = isDark() ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      localStorage.setItem("stride-site-theme", next);
      icon();
    };
    document.documentElement.style.setProperty("--rx", `${e.clientX}px`);
    document.documentElement.style.setProperty("--ry", `${e.clientY}px`);
    if (document.startViewTransition && !reduced) document.startViewTransition(apply);
    else apply();
  });
}

const SUN = `<svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="8" cy="8" r="2.75"/><path d="M8 1.25v1.25M8 13.5v1.25M1.25 8H2.5M13.5 8h1.25M3.2 3.2l.9.9M11.9 11.9l.9.9M3.2 12.8l.9-.9M11.9 4.1l.9-.9"/></svg>`;
const MOON = `<svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M13.5 9.75A5.75 5.75 0 0 1 6.25 2.5a5.75 5.75 0 1 0 7.25 7.25z"/></svg>`;

function setupReveal() {
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add("in"), io.unobserve(e.target))),
    { threshold: 0.12 },
  );
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
}

renderShapes();
setupTheme();
setupReveal();
for (const a of document.querySelectorAll("[data-download]")) a.href = DOWNLOAD_URL;
