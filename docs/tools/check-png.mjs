import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const dir = join(process.cwd(), "docs", "diagrams");
for (const f of readdirSync(dir).filter((f) => f.endsWith(".png")).sort()) {
  const b = readFileSync(join(dir, f));
  const ok = b.readUInt32BE(0) === 0x89504e47;
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  const flag = ok && w > 100 && h > 100 && w < 6000 && h < 12000 ? "OK" : "SUSPECT";
  console.log(`${f.padEnd(32)} ${String(b.length).padStart(8)} B  ${w}x${h}  ${flag}`);
}