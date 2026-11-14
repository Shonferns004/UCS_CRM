/**
 * Generates the extension icons as real PNG files (no placeholder art).
 * Run once: node scripts/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function encodePng(size, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function insideRoundedRect(px, py, x0, y0, x1, y1, radius) {
  if (px < x0 || px > x1 || py < y0 || py > y1) return false;
  const cx = Math.min(Math.max(px, x0 + radius), x1 - radius);
  const cy = Math.min(Math.max(py, y0 + radius), y1 - radius);
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= radius * radius;
}

/** Sample the tile at a normalised point. Returns [r, g, b, a]. */
function sample(u, v) {
  const inBackground = insideRoundedRect(u, v, 0.02, 0.02, 0.98, 0.98, 0.22);
  if (!inBackground) return [0, 0, 0, 0];

  const inGlyphOuter = u >= 0.30 && u <= 0.70 && v >= 0.26 && v <= 0.72;
  const inGlyphInner = u >= 0.415 && u <= 0.585 && v >= 0.26 && v <= 0.575;
  if (inGlyphOuter && !inGlyphInner) return [255, 255, 255, 255];

  return [37, 99, 235, 255];
}

function render(size) {
  const samples = 4;
  const rgba = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const u = (x + (sx + 0.5) / samples) / size;
          const v = (y + (sy + 0.5) / samples) / size;
          const [cr, cg, cb, ca] = sample(u, v);
          const weight = ca / 255;
          r += cr * weight;
          g += cg * weight;
          b += cb * weight;
          a += ca;
        }
      }

      const total = samples * samples;
      const alpha = a / total;
      const offset = (y * size + x) * 4;
      const denominator = alpha > 0 ? alpha / 255 : 1;

      rgba[offset] = Math.round(r / total / denominator);
      rgba[offset + 1] = Math.round(g / total / denominator);
      rgba[offset + 2] = Math.round(b / total / denominator);
      rgba[offset + 3] = Math.round(alpha);
    }
  }

  return encodePng(size, rgba);
}

const outdir = path.join(process.cwd(), 'assets', 'icons');
await mkdir(outdir, { recursive: true });

for (const size of [16, 32, 48, 128]) {
  const png = render(size);
  await writeFile(path.join(outdir, `icon${size}.png`), png);
  console.log(`icon${size}.png (${png.length} bytes)`);
}
