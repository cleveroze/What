// Builds the Workshop catalog and site assets:
//  - site/workshop/extensions/<id>.stride-ext.json  (one bundle per extension)
//  - site/workshop/registry.json                    (catalog read by Stride and the site)
//  - site/assets/shapes.js                          (M3 shape library, shared with the app)
// Usage: node scripts/build-workshop.mjs
import { build } from "esbuild";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const extDir = join(root, "extensions");
const outDir = join(root, "site/workshop/extensions");
mkdirSync(outDir, { recursive: true });

const builtinSrc = readFileSync(join(root, "src/extensions/builtin.ts"), "utf8");
const builtinIds = JSON.parse(/BUILTIN_IDS = (\[[^\]]*\])/.exec(builtinSrc)[1]);

const entries = [];
for (const id of readdirSync(extDir).sort()) {
  const dir = join(extDir, id);
  const manifest = JSON.parse(readFileSync(join(dir, "extension.json"), "utf8"));
  if (manifest.id !== id) throw new Error(`${id}: folder name must equal manifest id (${manifest.id})`);
  const files = {};
  for (const f of readdirSync(dir)) {
    if (f !== "extension.json") files[f] = readFileSync(join(dir, f), "utf8");
  }
  if (manifest.main && !files[manifest.main]) throw new Error(`${id}: main file ${manifest.main} is missing`);
  writeFileSync(join(outDir, `${id}.stride-ext.json`), JSON.stringify({ manifest, files }, null, 2) + "\n");
  entries.push({
    id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    author: manifest.author,
    icon: manifest.icon,
    categories: manifest.categories ?? [],
    permissions: manifest.permissions ?? [],
    // A plain-text summary for catalog pages (the full manifest is in the bundle).
    summary: {
      commands: (manifest.contributes?.commands ?? []).map((c) => c.title),
      themes: (manifest.contributes?.themes ?? []).map((t) => t.name),
      snippets: [...new Set((manifest.contributes?.snippets ?? []).map((s) => s.prefix))],
    },
    builtin: builtinIds.includes(id),
    bundle: `extensions/${id}.stride-ext.json`,
  });
}
writeFileSync(join(root, "site/workshop/registry.json"), JSON.stringify({ version: 1, extensions: entries }, null, 2) + "\n");

await build({
  entryPoints: [join(root, "src/lib/shapes.ts")],
  bundle: true,
  format: "esm",
  minify: true,
  outfile: join(root, "site/assets/shapes.js"),
  logLevel: "warning",
});
copyFileSync(join(root, "docs/screenshot.png"), join(root, "site/assets/screenshot.png"));
copyFileSync(join(root, "assets/logo.svg"), join(root, "site/assets/logo.svg"));
console.log(`Workshop: ${entries.length} extensions (${entries.filter((e) => e.builtin).length} built in)`);
