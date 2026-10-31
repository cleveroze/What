// Workshop bot, run by .github/workflows/workshop.yml on submission issues.
//   check     — validate a submission and label it (ready-for-review / needs-fixes)
//   prepare   — owner approved: write extensions/<id>/ and rebuild the catalog
//   finish    — after the commit is pushed: comment, label "published", close
//   fail      — something went wrong while publishing: tell the owner
//   unpublish — owner asked to remove an extension: delete its folder
// Issue text is untrusted: it is only ever parsed as JSON and validated.
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SHAPE_NAMES } from "../site/assets/shapes.js";
import {
  APPROVAL_MARK,
  LABELS,
  OWNER,
  SITE,
  checkAgainstRegistry,
  parseSubmission,
  sha256,
  validateBundle,
} from "../site/assets/workshop-core.js";

const root = new URL("..", import.meta.url).pathname;
const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const repo = process.env.GITHUB_REPOSITORY;
const issue = event.issue;
const sender = event.sender?.login ?? "";
const isOwner = (login) => String(login).toLowerCase() === OWNER.toLowerCase();
const BOT_MARK = "<!-- stride-workshop:check -->";

async function gh(method, path, body) {
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok && res.status !== 404 && res.status !== 422) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json().catch(() => null);
}

const COLORS = { [LABELS.submission]: "a6501a", [LABELS.ready]: "2f7d4f", [LABELS.invalid]: "b3261e", [LABELS.changes]: "c9821c", [LABELS.approved]: "2f7d4f", [LABELS.published]: "1f5f99", [LABELS.rejected]: "6f6152", [LABELS.unpublish]: "6f6152" };
async function ensureLabels() {
  for (const [name, color] of Object.entries(COLORS)) await gh("POST", "/labels", { name, color });
}
const addLabels = (labels) => gh("POST", `/issues/${issue.number}/labels`, { labels });
const removeLabel = (name) => gh("DELETE", `/issues/${issue.number}/labels/${encodeURIComponent(name)}`);
const comment = (body) => gh("POST", `/issues/${issue.number}/comments`, { body });
const close = (state_reason = "completed") => gh("PATCH", `/issues/${issue.number}`, { state: "closed", state_reason });

async function listComments() {
  const out = [];
  for (let page = 1; page < 10; page++) {
    const batch = await gh("GET", `/issues/${issue.number}/comments?per_page=100&page=${page}`);
    if (!Array.isArray(batch) || !batch.length) break;
    out.push(...batch);
  }
  return out;
}

const registry = () => JSON.parse(readFileSync(join(root, "site/workshop/registry.json"), "utf8"));

async function evaluate() {
  const parsed = parseSubmission(issue.body ?? "");
  if (parsed.error) return { parsed, errors: [parsed.error], warnings: [] };
  const { errors, warnings } = validateBundle(parsed.bundle, { shapeNames: SHAPE_NAMES });
  if (!errors.length) errors.push(...checkAgainstRegistry(parsed.bundle, registry(), issue.user.login).errors);
  return { parsed, errors, warnings };
}

function output(values) {
  for (const [k, v] of Object.entries(values)) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);
}

const commands = {
  async check() {
    await ensureLabels();
    if (issue.state !== "open") return;
    const { parsed, errors, warnings } = await evaluate();
    const m = parsed.bundle?.manifest;
    const lines = [BOT_MARK];
    if (errors.length) {
      lines.push("**Checks failed.** Edit the issue to fix these and the checks run again:", "", ...errors.map((e) => `- ${e}`));
    } else {
      lines.push(`**Checks passed** for **${m.name}** \`${m.id}\` ${m.version}. Waiting for review by @${OWNER}.`);
    }
    if (warnings.length) lines.push("", "Notes for the reviewer:", "", ...warnings.map((w) => `- ${w}`));
    const previous = (await listComments()).find((c) => c.user?.type === "Bot" && c.body?.startsWith(BOT_MARK));
    if (previous) await gh("PATCH", `/issues/comments/${previous.id}`, { body: lines.join("\n") });
    else await comment(lines.join("\n"));
    await addLabels([LABELS.submission, errors.length ? LABELS.invalid : LABELS.ready]);
    await removeLabel(errors.length ? LABELS.ready : LABELS.invalid);
    if (event.action === "edited") await removeLabel(LABELS.changes);
  },

  async prepare() {
    if (!isOwner(sender)) {
      await removeLabel(LABELS.approved);
      await comment(`Only @${OWNER} can approve Workshop submissions.`);
      return output({ publish: "false" });
    }
    const { parsed, errors } = await evaluate();
    if (errors.length) throw new Error(errors.join(" "));
    // If the approval came from the admin panel, publish exactly the reviewed bundle.
    const approvals = (await listComments()).filter((c) => isOwner(c.user?.login) && c.body?.includes(APPROVAL_MARK));
    const reviewed = approvals.at(-1)?.body.match(/sha256=([0-9a-f]{64})/)?.[1];
    if (reviewed && reviewed !== (await sha256(parsed.raw))) {
      throw new Error("The submission was edited after it was reviewed. Review it again before approving.");
    }
    const { manifest, files } = parsed.bundle;
    const dir = join(root, "extensions", manifest.id);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "extension.json"), JSON.stringify(manifest, null, 2) + "\n");
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    const publishersPath = join(root, "extensions/publishers.json");
    const publishers = JSON.parse(readFileSync(publishersPath, "utf8"));
    publishers[manifest.id] ??= issue.user.login;
    writeFileSync(publishersPath, JSON.stringify(publishers, null, 2) + "\n");
    output({ publish: "true", id: manifest.id, version: manifest.version });
  },

  async finish() {
    const { manifest } = parseSubmission(issue.body).bundle;
    await comment(
      `Published **${manifest.name}** ${manifest.version}. It is now in the Workshop — in Stride (Extensions → Workshop) and at ${SITE}workshop.html#${manifest.id}. Thank you!`,
    );
    await addLabels([LABELS.published]);
    await removeLabel(LABELS.ready);
    await close("completed");
  },

  async fail() {
    await removeLabel(LABELS.approved);
    await comment(`Publishing failed — see the [workflow run](${process.env.RUN_URL}). @${OWNER}`);
  },

  async unpublish() {
    if (!isOwner(sender) || !isOwner(issue.user.login)) return output({ publish: "false" });
    const id = /^\[Workshop\] Unpublish ([a-z0-9-]+)$/.exec(issue.title)?.[1];
    if (!id || !registry().extensions.some((e) => e.id === id && !e.builtin)) throw new Error(`Nothing to unpublish for “${issue.title}”.`);
    rmSync(join(root, "extensions", id), { recursive: true, force: true });
    rmSync(join(root, "site/workshop/extensions", `${id}.stride-ext.json`), { force: true });
    const publishersPath = join(root, "extensions/publishers.json");
    const publishers = JSON.parse(readFileSync(publishersPath, "utf8"));
    delete publishers[id];
    writeFileSync(publishersPath, JSON.stringify(publishers, null, 2) + "\n");
    output({ publish: "true", id, version: "removed" });
  },

  async unpublished() {
    await comment("Removed from the Workshop.");
    await close("completed");
  },
};

const command = commands[process.argv[2]];
if (!command) throw new Error(`Unknown command ${process.argv[2]}`);
await command();
