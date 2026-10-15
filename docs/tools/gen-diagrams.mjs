// UCS CRM — render every Mermaid diagram in docs/ to a PNG image and embed it.
// Usage:  node gen-diagrams.mjs
//  - Finds ```mermaid fenced blocks (outside <details>), renders them headlessly
//    (puppeteer-core + system Chrome) into SVG and screenshots the result, so
//    HTML labels (mermaid foreignObject nodes) are rasterized natively.
//  - Writes docs/diagrams/<slug>.png and docs/diagrams/MANIFEST.json.
//  - Rewrites the Markdown: image embed + collapsible Mermaid source.
import puppeteer from "puppeteer-core";
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, basename, extname, relative } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const TOOLS = dirname(fileURLToPath(import.meta.url));
const DOCS = join(TOOLS, "..");
const DIAGRAMS = join(DOCS, "diagrams");
const MANIFEST = join(DIAGRAMS, "MANIFEST.json");
const CANVAS = join(TOOLS, "render-canvas.html");

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
];
const EXECUTABLE = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!EXECUTABLE) { console.error("No Chrome/Edge found; install Chrome or set CHROME_EXECUTABLE."); process.exit(1); }

const RENDER_VERSION = 3;
const SKIP_DIRS = new Set(["tools", "node_modules", "output", "assets"]);
const GENERIC_BASENAMES = new Set(["panel.md", "readme.md", "index.md"]);

function walk(d, acc = []) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) { if (!SKIP_DIRS.has(n)) walk(p, acc); }
    else if (extname(n) === ".md") acc.push(p);
  }
  return acc;
}
function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function typeName(firstLine) {
  const t = firstLine.toLowerCase();
  if (t.startsWith("erdiagram")) return "ER Diagram";
  if (t.startsWith("sequence")) return "Sequence Diagram";
  if (t.startsWith("state")) return "State Diagram";
  if (t.startsWith("class")) return "Class Diagram";
  if (t.startsWith("gantt")) return "Gantt Chart";
  if (t.startsWith("pie")) return "Pie Chart";
  if (t.startsWith("flowchart") || t.startsWith("graph")) return "Flowchart";
  if (t.startsWith("architecture-beta")) return "Architecture Diagram";
  return "Diagram";
}

// split a file into raw lines, return blocks [{rawLines, startLine, lines}]
function findBlocks(md) {
  const lines = md.split("\n");
  const blocks = [];
  let inDetails = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^<details/.test(lines[i].trim())) inDetails++;
    else if (/^<\/details>/.test(lines[i].trim()) && inDetails > 0) inDetails--;
    if (inDetails > 0) continue;
    const fence = /^\s*```(mermaid)?\s*$/i.exec(lines[i]);
    if (!fence || fence[1] === undefined) continue;
    const start = i;
    let end = -1;
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s*```\s*$/.test(lines[j])) { end = j; break; }
    }
    if (end === -1) continue;
    blocks.push({ raw: lines.slice(start + 1, end).join("\n"), start, end });
    i = end;
  }
  return blocks;
}

// every ```mermaid block anywhere (also inside <details> embeds), document order
function findAllBlocks(md) {
  const lines = md.split("\n");
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*```mermaid\s*$/i.test(lines[i])) continue;
    const start = i;
    let end = -1;
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s*```\s*$/.test(lines[j])) { end = j; break; }
    }
    if (end === -1) continue;
    blocks.push({ raw: lines.slice(start + 1, end).join("\n") });
    i = end;
  }
  return blocks;
}

function buildSlug(file) {
  const relDir = dirname(relative(DOCS, file));
  const base = slugify(basename(file, ".md"));
  const dirLast = relDir.split(/[\\/]/).filter(Boolean).pop() || "";
  const dirToken = slugify(dirLast);
  const generic = GENERIC_BASENAMES.has(basename(file).toLowerCase());
  return generic && dirToken ? `${dirToken}-${base}` : base || "diagram";
}

async function main() {
  mkdirSync(DIAGRAMS, { recursive: true });
  const files = walk(DOCS).sort();
  const oldManifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : { figures: [], errors: [] };
  const known = new Map((oldManifest.figures || []).map((f) => [f.id, f]));

  const browser = await puppeteer.launch({
    executablePath: EXECUTABLE,
    headless: true,
    args: ["--allow-file-access-from-files", "--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1600, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => console.error("  [pageerror] " + e.message));
  page.on("console", (m) => { if (m.type() === "error") console.error("  [console] " + m.text()); });
  await page.goto("file:///" + CANVAS.split(/[\\/]/).join("/"), { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__ready === true", { timeout: 60000 });

  const figures = [];
  const errors = [];
  let figIndex = 0;
  const changed = [];

  for (const file of files) {
    const md = readFileSync(file, "utf8");
    const blocks = findAllBlocks(md);
    if (!blocks.length) continue;
    const rel = relative(DOCS, file).split(/[\\/]/).join("/");
    const prefix = join(dirname(relative(DOCS, file)), DIAGRAMS.split(/[\\/]/).pop()).split(/[\\/]/).join("/").replace(/^[^\/]+\/?/, "");
    for (let bi = 0; bi < blocks.length; bi++) {
      const b = blocks[bi];
      const mermaidText = b.raw;
      const slug = `${buildSlug(file)}-${bi + 1}`;
      const pngPath = join(DIAGRAMS, `${slug}.png`);
      const id = `fig-${slug}`;
      const titleLine = /^\s*%%\s*title:\s*(.+)\s*$/m.exec(mermaidText);
      const firstLine = mermaidText.trim().split("\n")[0].trim();
      const title = titleLine ? titleLine[1].trim() : `${typeName(firstLine)} — ${rel} #${bi + 1}`;

      const hash = createHash("sha1").update(mermaidText).digest("hex").slice(0, 12);
      const prev = known.get(id);
      let width = prev && prev.width, height = prev && prev.height;

      if (!existsSync(pngPath) || (prev && prev.hash !== hash) || (prev && prev.version !== RENDER_VERSION)) {
        const t0 = Date.now();
        const m = await page.evaluate(async (tid, text) => window.__mermaidRender(tid, text), id, mermaidText);
        if (!m.ok) {
          errors.push({ id, file: rel, error: m.error });
          console.error("  ⚠ render failed: " + id + " — " + m.error);
          continue;
        }
        width = m.width; height = m.height;
        try {
          const pad = 24;
          await page.setViewport({ width: m.width + pad, height: m.height + pad, deviceScaleFactor: 2 });
          const clip = await page.evaluate(() => {
            const r = document.getElementById("holder").querySelector("svg").getBoundingClientRect();
            return { x: Math.round(r.x), y: Math.round(r.y), width: Math.ceil(r.width), height: Math.ceil(r.height) };
          });
          if (!clip || clip.width < 1 || clip.height < 1) throw new Error("empty layout box");
          const png = await page.screenshot({ clip, type: "png" });
          writeFileSync(pngPath, png);
          console.log(`  ✔ rendered ${slug}.png  (${width}x${height})  ${Date.now() - t0}ms  [${rel}]`);
          changed.push(slug);
        } catch (e) {
          errors.push({ id, file: rel, error: "screenshot: " + e.message });
          console.error("  ⚠ rasterize failed: " + id + " — " + e.message);
          continue;
        }
      } else {
        console.log(`  = unchanged ${slug}.png [${rel}]`);
      }

      figIndex++;
      figures.push({ id, file: rel, title, type: typeName(firstLine), version: RENDER_VERSION, hash, width, height, png: `${slug}.png`, figIndex });
    }
  }

  await browser.close();

  // merge with previously known figures, keep order stable (by figIndex from manifest order)
  const all = [];
  const seen = new Set();
  for (const f of figures) { all.push(f); seen.add(f.id); }
  for (const f of oldManifest.figures || []) { if (!seen.has(f.id)) all.push({ ...f, figIndex: ++figIndex }); }
  all.sort((a, b) => a.figIndex - b.figIndex);
  all.forEach((f, i) => (f.figIndex = i + 1));

  writeFileSync(MANIFEST, JSON.stringify({ generated: new Date().toISOString(), figures: all, errors }, null, 2) + "\n");
  console.log(`\nManifest: ${all.length} figures, ${errors.length} errors.`);

  // ---- rewrite markdown: embed image + keep source in <details> ----
  let rewritten = 0;
  for (const file of files) {
    let md = readFileSync(file, "utf8");
    const rel = relative(DOCS, file).split(/[\\/]/).join("/");
    const relDiagrams = relative(dirname(file), DIAGRAMS).split(/[\\/]/).join("/") || "diagrams";

    // fix any existing image embeds to use the correct relative path
    const fixRe = /!\[([^\]]*)\]\(([^)]+?)(\s+"[^"]*")?\)/g;
    md = md.replace(fixRe, (m, alt, path, title) => {
      const base = path.split(/[\\/]/).pop();
      if (!all.some((f) => f.png === base)) return m;
      return `![${alt}](${relDiagrams}/${base}${title || ""})`;
    });

    // embed images for any new top-level blocks
    const blocks2 = findBlocks(md);
    if (blocks2.length) {
      let lines = md.split("\n");
      let modified = false;
      for (let bi = blocks2.length - 1; bi >= 0; bi--) {
        const b = blocks2[bi];
        const slug = `${buildSlug(file)}-${bi + 1}`;
        const entry = all.find((f) => f.id === `fig-${slug}`);
        if (!entry) continue;
        const imgPath = `${relDiagrams}/${slug}.png`;
        const embed = [
          `![${slug}](${imgPath} "${entry.title}")`,
          `<details><summary>Show diagram source (Mermaid)</summary>`,
          "",
          "```mermaid",
          ...b.raw.split("\n"),
          "```",
          "",
          `</details>`,
          "",
        ].join("\n");
        lines.splice(b.start, b.end - b.start + 1, embed);
        modified = true;
      }
      if (modified) md = lines.join("\n");
    }

    const before = readFileSync(file, "utf8");
    if (before !== md) {
      writeFileSync(file, md);
      rewritten++;
      console.log(`  ✎ embedded/fixed diagrams in ${rel}`);
    }
  }
  console.log(`\nRewrote ${rewritten} file(s). done (${changed.length} new/re-rendered).`);
}

main().catch((e) => { console.error(e); process.exit(1); });