import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, extname, dirname } from "node:path";
const DOCS = process.cwd();
function walk(d, acc = []) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) {
      if (["node_modules", "output", "assets"].includes(n)) continue;
      walk(p, acc);
    } else if (extname(n) === ".md") acc.push(p);
  }
  return acc;
}
const files = walk(DOCS);
let bad = [];
for (const f of files) {
  const md = readFileSync(f, "utf8");
  const re = /\[[^\]]*\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(md))) {
    const t = ((m[1].match(/^[^\s"']+/) || [""])[0]).split("#")[0];
    if (!t) continue;
    if (/^https?:/.test(t)) continue;
    if (/^mailto:/.test(t)) continue;
    const target = join(dirname(f), decodeURIComponent(t));
    if (!existsSync(target)) bad.push(`${f.replace(/.*docs[\\/]/, "docs\\")} -> ${t}`);
  }
}
if (bad.length) { console.log("BROKEN (" + bad.length + "):"); bad.forEach((b) => console.log("  " + b)); process.exit(1); }
console.log("OK: " + files.length + " files, all relative links resolve");