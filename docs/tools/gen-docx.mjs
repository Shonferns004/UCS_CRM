// UCS CRM Black Book -> DOCX converter.
// Reads docs/ (numbered folders), renders Markdown subset to DOCX via the `docx` package.
// Run: node gen-docx.mjs           (from docs/tools)
// Output: ../output/UCS-CRM-BLACK-BOOK.docx
import { readdirSync, readFileSync, mkdirSync, statSync, existsSync, writeFileSync } from "node:fs";
import { join, extname, basename, dirname, relative, sep } from "node:path";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ImageRun,
} from "docx";
import { fileURLToPath } from "node:url";

const TOOLS = dirname(fileURLToPath(import.meta.url));
const DOCS = join(TOOLS, "..");
const OUT = join(DOCS, "output");
const DIAGRAMS = join(DOCS, "diagrams");
const MANIFEST = join(DIAGRAMS, "MANIFEST.json");

const MAX_IMG_W = 620;
const MAX_IMG_H = 820;

function loadManifest() {
  if (!existsSync(MANIFEST)) return { figures: [], errors: [] };
  return JSON.parse(readFileSync(MANIFEST, "utf8"));
}

const FOLDER_ORDER = [
  "00-Project-Overview", "01-Requirements", "02-System-Architecture",
  "03-Panel-Documentation", "04-Module-Workflows", "05-Database-Documentation",
  "06-API-Reference", "07-Business-Logic", "08-Libraries-and-Technologies",
  "09-Testing-and-QA", "10-Security", "11-Deployment-and-Setup",
  "12-Troubleshooting", "13-User-Manual", "14-Glossary", "15-Change-History",
  "16-Plain-English",
];

const SKIP_FILES = new Set(["blackbookdocs.md"]);
const SKIP_DIRS = new Set(["tools", "node_modules", "output", "assets", "diagrams", "security"]);

function listMarkdown(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      out.push(...listMarkdown(p));
    } else if (extname(name) === ".md" && !SKIP_FILES.has(name)) {
      out.push(p);
    }
  }
  return out;
}

function orderedFiles() {
  const top = readdirSync(DOCS).filter((n) => statSync(join(DOCS, n)).isDirectory());
  const byFolder = new Map();
  for (const folder of top) {
    const mds = listMarkdown(join(DOCS, folder));
    if (folder === "README.md") continue;
    if (mds.length) byFolder.set(folder, mds);
  }
  // README first as front matter, then folders in declared order, then any extras.
  const extra = top.filter((f) => !FOLDER_ORDER.includes(f) && byFolder.has(f));
  const ordered = [...FOLDER_ORDER, ...extra].filter((f) => byFolder.has(f));
  const files = [];
  const readme = join(DOCS, "README.md");
  if (existsSync(readme)) files.push(readme);
  for (const folder of ordered) files.push(...byFolder.get(folder));
  return files;
}

// ---- minimal inline markdown -> TextRuns ----
function inlineRuns(text, base = {}) {
  const runs = [];
  const re = /(\*\*[^*]+\*\*|~~[^~]+~~|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) runs.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const tok = m[0];
    if (tok.startsWith("**")) {
      runs.push(new TextRun({ text: tok.slice(2, -2), bold: true, ...base }));
    } else if (tok.startsWith("~~")) {
      runs.push(new TextRun({ text: tok.slice(2, -2), strike: true, ...base }));
    } else if (tok.startsWith("`")) {
      runs.push(new TextRun({ text: tok.slice(1, -1), font: "Consolas", ...base }));
    } else {
      const link = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok);
      runs.push(new TextRun({ text: link[1], underline: {}, color: "0563C1", children: [], ...base }));
    }
    last = m.index + tok.length;
  }
  if (last < text.length) runs.push(new TextRun({ text: text.slice(last), ...base }));
  return runs;
}

function parseTableRow(line) {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

const BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "dddddd" },
  insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "dddddd" },
};

function mdToDocx(md, file, figuresByPng) {
  const blocks = [];
  const lines = md.split(/\r?\n/);
  let i = 0;
  let inCode = false;
  let codeBuf = [];
  let codeLang = "";
  let tableBuf = [];
  let inDetails = 0;

  const flushCode = () => {
    if (codeBuf.length) {
      const isMermaid = codeLang.includes("mermaid");
      const text = codeBuf.join("\n");
      if (!isMermaid) {
        blocks.push(new Paragraph({ spacing: { before: 60, after: 60 }, shading: { fill: "F2F2F2" }, children: [new TextRun({ text, font: "Consolas", size: 16 })] }));
      } else {
        blocks.push(new Paragraph({ spacing: { before: 60, after: 60 }, shading: { fill: "FFF8E6" }, children: [new TextRun({ text: "» Diagram source (Mermaid code):", italics: true, color: "8A6D00", size: 16 }), new TextRun({ text: "\n" + text, font: "Consolas", size: 14, color: "666666" })] }));
      }
      codeBuf = [];
    }
  };
  const flushTable = () => {
    if (tableBuf.length < 1) return;
    const rows = tableBuf;
    const header = rows[0].map((c) => c.replace(/-+$/g, "").trim());
    const isHeaderSep = rows.length >= 2 && rows[1].every((c) => /^:?-{3,}:?$/.test(c));
    const dataRows = isHeaderSep ? rows.slice(2) : rows.slice(1);
    const colCount = Math.max(header.length, ...dataRows.map((r) => r.length));
    const widths = Array.from({ length: colCount }, () => Math.round(100 / colCount));
    const hdrRow = new TableRow({
      tableHeader: true,
      children: header.map((c, idx) => new TableCell({
        borders: BORDERS, shading: { fill: "E7E6E6" },
        width: { size: widths[idx], type: WidthType.PERCENTAGE },
        children: [new Paragraph({ children: inlineRuns(c || "", { bold: true, size: 18 }) })],
      })),
    });
    const bodyRows = dataRows.map((r) => new TableRow({
      children: Array.from({ length: colCount }, (_, idx) => new TableCell({
        borders: BORDERS,
        width: { size: widths[idx], type: WidthType.PERCENTAGE },
        children: [new Paragraph({ children: inlineRuns(r[idx] || "", { size: 18 }) })],
      })),
    }));
    blocks.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [hdrRow, ...bodyRows] }));
    blocks.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
    tableBuf = [];
  };

  for (; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    if (inDetails > 0) {
      if (/^<\/details>/.test(line)) inDetails--;
      continue;
    }
    if (/^<details/.test(line)) { flushTable(); inDetails++; continue; }

    const img = /^!\[[^\]]*\]\(([^)]+?)(\s+"[^"]*")?\)/.exec(line);
    if (img) {
      flushTable();
      const target = decodeURIComponent(img[1].split("#")[0].trim());
      const pngName = target.split(/[\\/]/).pop();
      const entry = figuresByPng.get(pngName);
      const caption = (img[2] ? img[2].replace(/^\s+"|"$/g, "") : null) || (entry && entry.title) || pngName;
      if (entry) {
        const scale = Math.min((MAX_IMG_W / entry.width), (MAX_IMG_H / entry.height), 1);
        const w = Math.round(entry.width * scale);
        const h = Math.round(entry.height * scale);
        const data = readFileSync(join(DIAGRAMS, pngName)).toString("base64");
        blocks.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 60 }, children: [new ImageRun({ type: "png", data, transformation: { width: w, height: h } })] }));
        blocks.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: `Figure ${entry.figIndex}: ${caption}`, italics: true, size: 16, color: "555555" })] }));
      } else {
        blocks.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "[missing image: " + target + "]", color: "CC0000", italics: true })] }));
      }
      continue;
    }
    if (inCode) {
      if (line.startsWith("```")) { inCode = false; flushCode(); continue; }
      codeBuf.push(raw);
      continue;
    }
    if (line.startsWith("```")) {
      flushTable(); inCode = true; codeLang = line.slice(3).trim(); flushCode();
      continue;
    }
    if (tableBuf.length && (!line.startsWith("|") || line === "")) { flushTable(); }
    if (line.startsWith("|")) { tableBuf.push(parseTableRow(line)); continue; }
    if (line === "") { blocks.push(new Paragraph({ children: [] })); continue; }
    if (/^---+$/.test(line) || /^\*\*\*+$/.test(line)) { blocks.push(new Paragraph({ border: { bottom: BORDERS.bottom }, children: [] })); continue; }

    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const levelMap = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3, 4: HeadingLevel.HEADING_4 };
      blocks.push(new Paragraph({ heading: levelMap[h[1].length], pageBreakBefore: h[1].length === 1, spacing: { before: 240, after: 120 }, children: inlineRuns(h[2]) }));
      continue;
    }
    if (line.startsWith("> ")) {
      blocks.push(new Paragraph({ indent: { left: 360 }, spacing: { before: 60, after: 60 }, children: inlineRuns(line.slice(2), { italics: true, color: "666666" }) }));
      continue;
    }
    const ul = /^([-*])\s+(.*)$/.exec(line);
    if (ul) { blocks.push(new Paragraph({ bullet: { level: 0 }, children: inlineRuns(ul[2], { size: 20 }) })); continue; }
    const ol = /^(\d+)\.\s+(.*)$/.exec(line);
    if (ol) { blocks.push(new Paragraph({ children: [new TextRun({ text: `${ol[1]}. `, bold: true, size: 20 }), ...inlineRuns(ol[2], { size: 20 })] })); continue; }
    const ck = /^(\s*)[-*]\s+\[( |x)\]\s+(.*)$/.exec(line);
    if (ck) { blocks.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: ck[2] === "x" ? "☑ " : "☐ ", size: 20 }), ...inlineRuns(ck[3], { size: 20 })] })); continue; }
    blocks.push(new Paragraph({ spacing: { after: 60 }, children: inlineRuns(raw) }));
  }
  if (inCode) flushCode();
  flushTable();
  return blocks;
}

function build() {
  mkdirSync(OUT, { recursive: true });
  const files = orderedFiles();
  const manifest = loadManifest();
  const figuresByPng = new Map((manifest.figures || []).map((f) => [f.png, f]));
  const children = [];

  // Cover
  children.push(new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing: { before: 1600 }, children: [new TextRun({ text: "UCS CRM", bold: true, size: 56 })] }));
  children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Black Book Documentation", size: 40 })] }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Markdown source of truth: docs/ · Generated 2026-10-13", color: "777777", size: 20 })] }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Status labels: Verified | Partially verified | Inferred | Planned", color: "777777", size: 16, children: [] })] }));

  // Table of Contents
  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 600 }, children: [new TextRun({ text: "Table of Contents" })] }));
  for (const f of files) {
    const rel = relative(DOCS, f).split(sep).join("/");
    children.push(new Paragraph({ children: [new TextRun({ text: rel, size: 20, color: "444444" })] }));
  }

  // List of Figures
  if (manifest.figures && manifest.figures.length) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 400 }, children: [new TextRun({ text: "List of Figures" })] }));
    for (const f of manifest.figures) {
      children.push(new Paragraph({ children: [new TextRun({ text: `Figure ${f.figIndex}. ${f.title}  —  ${f.file}`, size: 20, color: "444444" })] }));
    }
  }
  children.push(new Paragraph({ pageBreakBefore: true, children: [] }));

  for (const f of files) {
    const rel = relative(DOCS, f).split(sep).join("/");
    const md = readFileSync(f, "utf8");
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: rel })] }));
    children.push(...mdToDocx(md, f, figuresByPng));
  }

  const doc = new Document({
    creator: "UCS CRM docs build",
    title: "UCS CRM Black Book",
    description: "Consolidated black-book documentation for the UCS CRM primary system",
    sections: [{ properties: {}, children }],
  });
  const outPath = join(OUT, "UCS-CRM-BLACK-BOOK.docx");
  Packer.toBuffer(doc).then((buf) => {
    try {
      writeFileSync(outPath, buf);
      console.log("Wrote " + outPath);
    } catch (e) {
      if (e.code === "EBUSY" || e.code === "EPERM") {
        const stamped = join(OUT, `UCS-CRM-BLACK-BOOK-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.docx`);
        writeFileSync(stamped, buf);
        console.log("Target was locked — wrote " + stamped);
      } else throw e;
    }
  }).catch((e) => { throw e; });
}

build();