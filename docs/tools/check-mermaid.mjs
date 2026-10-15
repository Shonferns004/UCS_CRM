import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";
const DOCS = process.cwd();
function walk(d, acc = []) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) {
      if (["node_modules", "output"].includes(n)) continue;
      walk(p, acc);
    } else if (extname(n) === ".md") acc.push(p);
  }
  return acc;
}
let issues = 0;
for (const f of walk(DOCS)) {
  const md = readFileSync(f, "utf8");
  if ((md.match(/```/g) || []).length % 2 !== 0) { console.log("UNBALANCED FENCES: " + f); issues++; continue; }
  const re = /```mermaid\n([\s\S]*?)```/g;
  let m; let i = 0;
  while ((m = re.exec(md))) {
    i++;
    const body = m[1];
    const isEr = /^\s*erDiagram\s*$/m.test(body);
    const opens = (body.match(/[\[\(\{]/g) || []).length;
    const closes = (body.match(/[\])}]/g) || []).length;
    const lines = body.split("\n");
    const last = lines[lines.length - 1].trim();
    if (!isEr && opens !== closes) { console.log("BRACKET IMBALANCE " + f + " block#" + i + " [" + opens + "/" + closes + "]"); issues++; }
    if (!isEr && /-->$/.test(last)) { console.log("DIAGRAM EDGES CUT OFF " + f + " block#" + i); issues++; }
    for (const ln of lines) { if (ln.includes("``") && !ln.trim().startsWith("%%")) { console.log("STRAY BACKTICK " + f); issues++; } }
  }
  if (i > 0) console.log(f.replace(process.cwd(), "docs") + ": " + i + " mermaid block(s)");
}
console.log(issues ? "ISSUES (" + issues + ")" : "Mermaid structural scan OK");