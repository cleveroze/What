// Workshop rules shared by the website, the admin panel and the GitHub bot
// (scripts/workshop-bot.mjs). Plain ES module without DOM or Node APIs.

export const OWNER = "cleveroze";
export const REPO = "cleveroze/What";
export const SITE = "https://cleveroze.github.io/What/";
export const TEMPLATE = "workshop-submission.yml";
export const LABELS = {
  submission: "workshop-submission",
  ready: "ready-for-review",
  invalid: "needs-fixes",
  changes: "changes-requested",
  approved: "approved",
  published: "published",
  rejected: "rejected",
  unpublish: "workshop-unpublish",
};
/** Hidden marker the admin panel leaves when approving a specific bundle. */
export const APPROVAL_MARK = "stride-workshop:approve";

export const CATEGORIES = ["Themes", "Snippets", "Tools", "AI", "Formatters", "Fun"];
export const PERMISSIONS = {
  ai: "Uses your AI assistant (and its credits)",
  network: "Can connect to the internet",
  clipboard: "Can write to the clipboard",
};
const ID = /^[a-z0-9][a-z0-9-]{1,48}$/;
const FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,60}\.(js|json|md|txt|css)$/;
const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
const COMMAND_ID = /^[a-zA-Z0-9][\w.-]{0,40}$/;
const KEY = /^((ctrl|shift|alt|meta)\+){1,3}[a-z0-9`\-=[\];',./]$|^f([1-9]|1[0-2])$/;
/** Issue bodies are limited to 65 536 characters. */
export const MAX_BUNDLE_CHARS = 60000;

const isObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const str = (x, min = 1, max = 300) => typeof x === "string" && x.trim().length >= min && x.length <= max;
const num = (x, lo, hi) => typeof x === "number" && Number.isFinite(x) && x >= lo && x <= hi;

/**
 * Checks an untrusted bundle `{ manifest, files }`.
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateBundle(bundle, { shapeNames } = {}) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);
  if (!isObj(bundle) || !isObj(bundle.manifest) || !isObj(bundle.files)) {
    return { errors: ["The bundle must be an object with “manifest” and “files”."], warnings };
  }
  const m = bundle.manifest;
  if (typeof m.id !== "string" || !ID.test(m.id)) err("“id” must be 2–49 lowercase letters, digits or dashes.");
  if (!str(m.name, 2, 40)) err("“name” must be 2–40 characters.");
  if (typeof m.version !== "string" || !VERSION.test(m.version)) err("“version” must look like 1.0.0.");
  if (!str(m.description, 10, 300)) err("“description” must be 10–300 characters.");
  if (!str(m.author, 1, 40)) err("“author” must be 1–40 characters.");
  if (m.icon !== undefined && (typeof m.icon !== "string" || (shapeNames && !shapeNames.includes(m.icon)))) err(`“icon” ${JSON.stringify(m.icon)} is not a known shape.`);
  if (m.categories !== undefined && (!Array.isArray(m.categories) || m.categories.some((c) => !CATEGORIES.includes(c)))) {
    err(`“categories” may only contain ${CATEGORIES.join(", ")}.`);
  }
  if (m.permissions !== undefined && (!Array.isArray(m.permissions) || m.permissions.some((p) => !(p in PERMISSIONS)))) {
    err(`“permissions” may only contain ${Object.keys(PERMISSIONS).join(", ")}.`);
  }
  const allowed = new Set(["id", "name", "version", "description", "author", "icon", "categories", "permissions", "main", "contributes"]);
  for (const k of Object.keys(m)) if (!allowed.has(k)) warnings.push(`Unknown field “${k}” in extension.json is ignored.`);

  const c = m.contributes;
  if (c !== undefined && !isObj(c)) err("“contributes” must be an object.");
  const themes = isObj(c) ? c.themes ?? [] : [];
  const snippets = isObj(c) ? c.snippets ?? [] : [];
  const commands = isObj(c) ? c.commands ?? [] : [];
  if (!Array.isArray(themes) || !Array.isArray(snippets) || !Array.isArray(commands)) err("“themes”, “snippets” and “commands” must be lists.");
  else {
    themes.forEach((t, i) => {
      const at = `Theme ${i + 1}`;
      if (!isObj(t) || !COMMAND_ID.test(t.id ?? "") || !str(t.name, 1, 40)) return err(`${at}: needs an “id” and a “name”.`);
      if (!num(t.neutralHue, 0, 360) || !num(t.accentHue, 0, 360)) err(`${at}: hues must be numbers from 0 to 360.`);
      if (!num(t.neutralChroma, 0, 0.04)) err(`${at}: “neutralChroma” must be 0–0.04.`);
      if (!num(t.accentChroma, 0, 0.2)) err(`${at}: “accentChroma” must be 0–0.2.`);
      if (t.syntaxChroma !== undefined && !num(t.syntaxChroma, 0, 0.2)) err(`${at}: “syntaxChroma” must be 0–0.2.`);
    });
    snippets.forEach((s, i) => {
      const body = isObj(s) && (typeof s.body === "string" || (Array.isArray(s.body) && s.body.every((l) => typeof l === "string")));
      if (!isObj(s) || !str(s.language, 1, 30) || !str(s.prefix, 1, 40) || !body) err(`Snippet ${i + 1}: needs “language”, “prefix” and “body”.`);
    });
    commands.forEach((cmd, i) => {
      if (!isObj(cmd) || !COMMAND_ID.test(cmd.id ?? "") || !str(cmd.title, 1, 60)) return err(`Command ${i + 1}: needs an “id” and a “title”.`);
      if (cmd.keybinding !== undefined && (typeof cmd.keybinding !== "string" || !KEY.test(cmd.keybinding))) err(`Command “${cmd.id}”: keybinding “${cmd.keybinding}” is not valid (e.g. ctrl+alt+u).`);
    });
    if (commands.length && !m.main) err("Commands need code: add “main” and the JavaScript file.");
  }

  const names = Object.keys(bundle.files);
  if (names.length > 12) err("At most 12 files.");
  for (const name of names) {
    if (name === "extension.json") err("“extension.json” belongs in “manifest”, not in “files”.");
    else if (!FILE.test(name)) err(`File name “${name}” is not allowed (letters, digits, . _ -; .js .json .md .txt .css).`);
    if (typeof bundle.files[name] !== "string") err(`File “${name}” must be text.`);
  }
  if (m.main !== undefined && (typeof m.main !== "string" || !(m.main in bundle.files))) err(`The main file “${m.main}” is missing.`);
  if (!m.main && !themes.length && !snippets.length) err("The extension does nothing: add code, themes or snippets.");

  const code = names.filter((n) => n.endsWith(".js")).map((n) => bundle.files[n]).join("\n");
  if (/\beval\s*\(|\bnew\s+Function\b/.test(code)) warnings.push("The code uses eval or new Function.");
  if (/\bfetch\s*\(|XMLHttpRequest|WebSocket/.test(code) && !(m.permissions ?? []).includes("network")) {
    warnings.push("The code mentions network APIs but does not ask for “network” — they will be unavailable.");
  }
  if ((m.permissions ?? []).includes("network")) warnings.push("Asks for internet access — check where data is sent.");
  return { errors, warnings };
}

/** Extracts the bundle from an issue created with the submission form. */
export function parseSubmission(body) {
  const section = (title) => {
    const re = new RegExp(`^###\\s+${title}\\s*$`, "m");
    const match = re.exec(body ?? "");
    if (!match) return null;
    const rest = body.slice(match.index + match[0].length);
    const next = /^###\s+/m.exec(rest);
    return (next ? rest.slice(0, next.index) : rest).trim();
  };
  let raw = section("Extension bundle");
  const notes = section("Notes for the reviewer");
  if (raw === null) return { error: "This issue has no “Extension bundle” section." };
  raw = raw.replace(/^```[a-z]*\s*\n/i, "").replace(/\n```\s*$/, "").trim();
  if (!raw || raw === "_No response_") return { error: "The “Extension bundle” field is empty.", raw };
  if (raw.length > MAX_BUNDLE_CHARS) return { error: `The bundle is too big (${raw.length} characters, max ${MAX_BUNDLE_CHARS}).`, raw };
  try {
    return { raw, bundle: JSON.parse(raw), notes: notes && notes !== "_No response_" ? notes : "" };
  } catch (e) {
    return { error: `The bundle is not valid JSON: ${e.message}`, raw };
  }
}

/** 1 if a > b, -1 if a < b, 0 if equal (versions like 1.2.3). */
export function compareVersions(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1;
  return 0;
}

/** Rules that depend on the published catalog and on who submits. */
export function checkAgainstRegistry(bundle, registry, submitter) {
  const errors = [];
  const existing = registry.extensions.find((e) => e.id === bundle.manifest.id);
  if (existing) {
    const owner = existing.publisher || OWNER;
    if (submitter && owner.toLowerCase() !== submitter.toLowerCase() && submitter.toLowerCase() !== OWNER) {
      errors.push(`The id “${existing.id}” belongs to @${owner}. Choose another id.`);
    }
    if (compareVersions(bundle.manifest.version, existing.version) <= 0) {
      errors.push(`Version ${bundle.manifest.version} must be higher than the published ${existing.version}.`);
    }
  }
  return { errors, existing: existing ?? null };
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Link that opens the submission form with the bundle filled in (when it fits in a URL). */
export function submissionUrl(bundle) {
  const url = new URL(`https://github.com/${REPO}/issues/new`);
  url.searchParams.set("template", TEMPLATE);
  url.searchParams.set("title", `[Workshop] ${bundle.manifest.name} ${bundle.manifest.version}`);
  const json = JSON.stringify(bundle, null, 2);
  const withBundle = new URL(url);
  withBundle.searchParams.set("bundle", json);
  return withBundle.href.length <= 7500 ? { url: withBundle.href, prefilled: true, json } : { url: url.href, prefilled: false, json };
}
