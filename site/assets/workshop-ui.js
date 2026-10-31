// Shared UI for the Workshop pages (catalog, publish, admin).
import { lerpRadii, radiiToPath, shapeRadii, springProgress } from "./shapes.js";

export const DOWNLOAD_URL = "https://github.com/cleveroze/What/releases/latest/download/Stride-Setup.exe";
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Hue of an extension: its first theme's accent, else derived from the id. */
export function hueOf(entry, manifest) {
  const theme = manifest?.contributes?.themes?.[0];
  if (theme && Number.isFinite(Number(theme.accentHue))) return Math.round(Number(theme.accentHue));
  if (typeof entry.hue === "number") return Math.round(entry.hue);
  let h = 0;
  for (const ch of entry.id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/** Markup of a tinted M3 shape with the extension's initial. */
export function glyph(entry, size = 56, manifest) {
  const shape = entry.icon || "cookie9";
  let d = "";
  try {
    d = radiiToPath(shapeRadii(shape), size);
  } catch {
    d = radiiToPath(shapeRadii("cookie9"), size);
  }
  return `<span class="glyph" style="--s:${size}px;--h:${hueOf(entry, manifest)}" data-glyph="${esc(shape)}">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>
    <b>${esc((entry.name || "?").trim().charAt(0).toUpperCase())}</b></span>`;
}

/** Spring-morphs a glyph's path through shapes, forever. */
export function morph(el, shapes, interval = 2400) {
  const path = el.querySelector("path");
  const size = Number(el.style.getPropertyValue("--s").replace("px", "")) || 56;
  if (!path || reduced) return;
  let current = new Float64Array(shapeRadii(shapes[0]));
  let i = 0;
  setInterval(() => {
    i = (i + 1) % shapes.length;
    const from = new Float64Array(current);
    const to = shapeRadii(shapes[i]);
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / 900);
      current = lerpRadii(from, to, springProgress(t, 0.55, 12));
      path.setAttribute("d", radiiToPath(current, size));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, interval);
}

export function toast(text, ms = 3200) {
  document.querySelector(".toast")?.remove();
  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.remove(), ms);
}

/** Read-only code viewer with file tabs; `diffs` maps file → previous text. */
export function codeViewer(files, diffs = null) {
  const names = Object.keys(files);
  const wrap = document.createElement("div");
  wrap.className = "code";
  if (!names.length) return wrap;
  wrap.innerHTML = `<div class="code-tabs" role="tablist">${names
    .map((n, i) => `<button role="tab" aria-selected="${i === 0}" data-file="${esc(n)}">${esc(n)}${diffs && !(n in diffs) ? " (new)" : ""}</button>`)
    .join("")}</div><pre></pre>`;
  const pre = wrap.querySelector("pre");
  const show = (name) => {
    for (const b of wrap.querySelectorAll("[data-file]")) b.setAttribute("aria-selected", String(b.dataset.file === name));
    const text = String(files[name]);
    const lines =
      diffs && name in diffs && diffs[name] !== text
        ? lineDiff(String(diffs[name]), text).map(([k, l]) => `<span class="${k}">${esc(l) || " "}</span>`)
        : text.split("\n").map((l) => `<span>${esc(l) || " "}</span>`);
    pre.innerHTML = lines.join("");
  };
  wrap.querySelector(".code-tabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-file]");
    if (b) show(b.dataset.file);
  });
  show(names[0]);
  return wrap;
}

/** Minimal LCS line diff → [["", line] | ["add", line] | ["del", line]]. */
export function lineDiff(a, b) {
  const x = a.split("\n");
  const y = b.split("\n");
  if (x.length * y.length > 4e6) return [...x.map((l) => ["del", l]), ...y.map((l) => ["add", l])];
  const n = x.length;
  const m = y.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) out.push(["", x[i++]]), j++;
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push(["del", x[i++]]);
    else out.push(["add", y[j++]]);
  }
  while (i < n) out.push(["del", x[i++]]);
  while (j < m) out.push(["add", y[j++]]);
  return out;
}

export const kbd = (k) =>
  k
    .split("+")
    .map((p) => `<kbd>${esc(p.length > 1 ? p[0].toUpperCase() + p.slice(1) : p.toUpperCase())}</kbd>`)
    .join(" ");

/** Rows describing what a manifest contributes (themes, commands, snippets). */
export function contributions(m) {
  const c = m.contributes ?? {};
  const out = [];
  for (const t of c.themes ?? []) {
    // Numbers only: manifests may be untrusted (admin panel).
    const [nc, nh, ac, ah] = [t.neutralChroma, t.neutralHue, t.accentChroma, t.accentHue].map((x) => Number(x) || 0);
    const sw = [`oklch(0.97 ${nc} ${nh})`, `oklch(0.56 ${ac} ${ah})`, `oklch(0.21 ${nc} ${nh})`, `oklch(0.78 ${ac} ${ah})`];
    out.push(`<div><span class="swatch">${sw.map((c) => `<i style="background:${c}"></i>`).join("")}</span><span class="grow">${esc(t.name)}<small>${esc(t.description ?? "Theme")} · Settings → Appearance</small></span></div>`);
  }
  for (const cmd of c.commands ?? []) {
    out.push(`<div><span class="grow">${esc(cmd.title)}<small>Command · Ctrl+Shift+P</small></span>${cmd.keybinding ? `<span>${kbd(cmd.keybinding)}</span>` : ""}</div>`);
  }
  const byLang = {};
  for (const s of c.snippets ?? []) (byLang[s.language] ??= []).push(s);
  for (const [lang, list] of Object.entries(byLang)) {
    out.push(`<div><span class="grow">${[...new Set(list.map((s) => s.prefix))].map((p) => `<code>${esc(p)}</code>`).join(", ")}<small>Snippets for ${esc(lang)} · type the word and press Enter</small></span></div>`);
  }
  return out.join("");
}

const SUN = `<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="8" r="2.75"/><path d="M8 1.25v1.25M8 13.5v1.25M1.25 8H2.5M13.5 8h1.25M3.2 3.2l.9.9M11.9 11.9l.9.9M3.2 12.8l.9-.9M11.9 4.1l.9-.9"/></svg>`;
const MOON = `<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M13.5 9.75A5.75 5.75 0 0 1 6.25 2.5a5.75 5.75 0 1 0 7.25 7.25z"/></svg>`;

function setupChrome() {
  const root = document.documentElement;
  try {
    const saved = localStorage.getItem("stride-site-theme");
    if (saved) root.dataset.theme = saved;
  } catch {}
  const dark = () => root.dataset.theme === "dark" || (!root.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
  const btn = document.getElementById("theme");
  if (btn) {
    const paint = () => (btn.innerHTML = dark() ? SUN : MOON);
    paint();
    btn.addEventListener("click", (e) => {
      const apply = () => {
        root.dataset.theme = dark() ? "light" : "dark";
        try {
          localStorage.setItem("stride-site-theme", root.dataset.theme);
        } catch {}
        paint();
      };
      root.style.setProperty("--rx", `${e.clientX}px`);
      root.style.setProperty("--ry", `${e.clientY}px`);
      if (document.startViewTransition && !reduced) document.startViewTransition(apply);
      else apply();
    });
  }
  const top = document.querySelector(".top");
  const onScroll = () => top?.classList.toggle("scrolled", scrollY > 4);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  for (const a of document.querySelectorAll("[data-download]")) a.href = DOWNLOAD_URL;
}

setupChrome();
