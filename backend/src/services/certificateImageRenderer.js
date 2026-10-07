import sharp from 'sharp';
import { openSync } from 'fontkit';
import { existsSync } from 'node:fs';

// Image certificate renderer — composites styled text overlays onto the
// uploaded certificate background. No LibreOffice, no placeholder text in the
// image. Coordinates are always in the ORIGINAL image pixel space.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FONT_ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../assets/fonts');
const ASSETS_DIR = FONT_ASSETS;

const FONTS = [
  { name: 'Arial', file: 'arial.ttf' },
  { name: 'Arial Bold', file: 'arialbd.ttf' },
  { name: 'Calibri', file: 'calibri.ttf' },
  { name: 'Calibri Bold', file: 'calibrib.ttf' },
  { name: 'Cambria', file: 'cambria.ttc' },
  { name: 'Cambria Bold', file: 'cambriab.ttf' },
  { name: 'Georgia', file: 'georgia.ttf' },
  { name: 'Georgia Bold', file: 'georgiab.ttf' },
  { name: 'Times New Roman', file: 'times.ttf' },
  { name: 'Times New Roman Bold', file: 'timesbd.ttf' },
  { name: 'Verdana', file: 'verdana.ttf' },
  { name: 'Verdana Bold', file: 'verdanab.ttf' },
  { name: 'Tahoma', file: 'tahoma.ttf' },
  { name: 'Tahoma Bold', file: 'tahomabd.ttf' },
  { name: 'Courier New', file: 'cour.ttf' },
  { name: 'Courier New Bold', file: 'courbd.ttf' },
  { name: 'Impact', file: 'impact.ttf' },
  { name: 'Comic Sans MS', file: 'comic.ttf' },
  { name: 'Segoe UI', file: 'segoeui.ttf' },
  { name: 'Segoe UI Bold', file: 'segoeuib.ttf' },
  { name: 'Bookman Old Style', file: 'BOOKOS.TTF' },
  { name: 'Bookman Old Style Bold', file: 'BOOKOSB.TTF' },
  { name: 'Poppins', file: 'Poppins-Regular.ttf', dir: ASSETS_DIR },
  { name: 'Poppins Bold', file: 'Poppins-Bold.ttf', dir: ASSETS_DIR },
  { name: 'Montserrat', file: 'Montserrat-Regular-inst.ttf', dir: ASSETS_DIR },
  { name: 'Montserrat Bold', file: 'Montserrat-Bold-inst.ttf', dir: ASSETS_DIR },
  { name: 'Open Sans', file: 'OpenSans-Regular-inst.ttf', dir: ASSETS_DIR },
  { name: 'Open Sans Bold', file: 'OpenSans-Bold-inst.ttf', dir: ASSETS_DIR },
  { name: 'Playfair Display', file: 'PlayfairDisplay-Regular-inst.ttf', dir: ASSETS_DIR },
  { name: 'Playfair Display Bold', file: 'PlayfairDisplay-Bold-inst.ttf', dir: ASSETS_DIR },
  { name: 'Cinzel', file: 'Cinzel-Regular-inst.ttf', dir: ASSETS_DIR },
  { name: 'Cinzel Bold', file: 'Cinzel-Bold-inst.ttf', dir: ASSETS_DIR },
  { name: 'Inter', file: 'Inter-Regular-inst.ttf', dir: ASSETS_DIR },
  { name: 'Inter Bold', file: 'Inter-Bold-inst.ttf', dir: ASSETS_DIR },
  { name: 'Lato', file: 'Lato-Regular.ttf', dir: ASSETS_DIR },
  { name: 'Lato Bold', file: 'Lato-Bold.ttf', dir: ASSETS_DIR },
  { name: 'Glacial Indifference', file: 'GlacialIndifference-Regular.ttf', dir: ASSETS_DIR },
  { name: 'Glacial Indifference Bold', file: 'GlacialIndifference-Bold.ttf', dir: ASSETS_DIR },
  { name: 'Cormorant Garamond', file: 'CormorantGaramond-Regular-inst.ttf', dir: ASSETS_DIR },
  { name: 'Cormorant Garamond Bold', file: 'CormorantGaramond-Bold-inst.ttf', dir: ASSETS_DIR },
];

export const FONT_FAMILIES = [...new Set(FONTS.map((f) => f.name.replace(/ Bold$/, '')))];

const FONT_DIRS = ['C:\\Windows\\Fonts', '/usr/share/fonts', '/usr/local/share/fonts', '/Library/Fonts', '/System/Library/Fonts'];

const fontCache = new Map();

function fontPathFor(family, bold) {
  const base = String(family || 'Arial').trim() || 'Arial';
  const wanted = bold ? FONTS.find((f) => f.name === `${base} Bold`) : FONTS.find((f) => f.name === base);
  const reg = FONTS.find((f) => f.name === base) || FONTS.find((f) => f.name === 'Arial');
  const pick = wanted || reg || FONTS[0];
  for (const dir of (pick.dir ? [pick.dir, ...FONT_DIRS] : FONT_DIRS)) {
    const p = `${dir}\\${pick.file}`.replace(/\\/g, '/').replace(/\/\/+/g, '/');
    const p2 = dir.includes('Windows') ? p : `${dir}/${pick.file}`;
    if (existsSync(p2)) return p2;
  }
  const fallback = `C:\\Windows\\Fonts\\${pick.file}`;
  return fallback;
}

function getFont(family, bold) {
  const key = `${family || 'Arial'}|${bold ? 1 : 0}`;
  if (fontCache.has(key)) return fontCache.get(key);
  let font;
  try {
    font = openSync(fontPathFor(family, bold));
  } catch {
    try { font = openSync(fontPathFor('Arial', bold)); } catch { font = null; }
  }
  fontCache.set(key, font);
  return font;
}

function measure(font, text, size, letterSpacing = 0) {
  if (!font) return text.length * size * 0.55;
  const run = font.layout(text);
  const advance = run.advanceWidth / font.unitsPerEm;
  return advance * size + Math.max(0, text.length - 1) * letterSpacing;
}

function isBoldWeight(w) {
  const n = parseInt(String(w || '400'), 10);
  return n >= 600 || String(w).toLowerCase().includes('bold');
}

function wrapText(font, text, size, maxWidth, letterSpacing) {
  const paragraphs = String(text ?? '').split(/\r?\n/);
  const lines = [];
  for (const para of paragraphs) {
      const words = para.split(/\s+/).filter(Boolean);
      if (!words.length) { lines.push(''); continue; }
      // Hard-break words that alone exceed the box width, so long unbroken
      // strings wrap to the next line instead of overflowing.
      const broken = [];
      for (let w of words) {
        if (measure(font, w, size, letterSpacing) <= maxWidth) { broken.push(w); continue; }
        let chunk = '';
        for (const ch of w) {
          if (measure(font, chunk + ch, size, letterSpacing) <= maxWidth || !chunk) chunk += ch;
          else { broken.push(chunk); chunk = ch; }
        }
        if (chunk) broken.push(chunk);
      }
      let line = broken[0];
      for (let i = 1; i < broken.length; i += 1) {
        const candidate = `${line} ${broken[i]}`;
        if (measure(font, candidate, size, letterSpacing) <= maxWidth) line = candidate;
        else { lines.push(line); line = broken[i]; }
      }
      lines.push(line);
  }
  return lines;
}

function layoutField(font, value, style) {
  const maxWidth = Math.max(10, Number(style.width) || 100);
  const maxH = Math.max(10, Number(style.height) || 40);
  const lineHeight = Number(style.lineHeight) > 0 ? Number(style.lineHeight) : 1.2;
  const letterSpacing = Number(style.letterSpacing) || 0;
  const autoFit = style.autoFit !== false;
  const minSize = Math.max(6, Number(style.minFontSize) || 12);
  let size = Math.max(minSize, Number(style.fontSize) || 32);
  let lines = wrapText(font, value, size, maxWidth, letterSpacing);
  if (autoFit) {
    // Shrink until everything fits the box.
    let guard = 0;
    while (guard < 200 && size > minSize &&
      (lines.length * size * lineHeight > maxH || lines.some((l) => measure(font, l, size, letterSpacing) > maxWidth))) {
      size -= 1;
      lines = wrapText(font, value, size, maxWidth, letterSpacing);
      guard += 1;
    }
  }
  return { size, lines, lineHeight, letterSpacing };
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function svgForField(style, value, font) {
  const x = Number(style.x) || 0;
  const y = Number(style.y) || 0;
  const w = Math.max(10, Number(style.width) || 100);
  const h = Math.max(10, Number(style.height) || 40);
  const align = ['left', 'center', 'right', 'justify'].includes(style.textAlign) ? style.textAlign : 'center';
  const valign = ['top', 'middle', 'bottom'].includes(style.verticalAlign) ? style.verticalAlign : 'middle';
  const color = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(String(style.color || '')) ? style.color : '#111111';
  const { size, lines, lineHeight, letterSpacing } = layoutField(font, value, style);
  const bold = isBoldWeight(style.fontWeight);
  const italic = String(style.fontStyle || '').toLowerCase() === 'italic';
  const lineH = size * lineHeight;
  const totalH = lines.length * lineH;
  const startY = valign === 'top' ? y : valign === 'bottom' ? y + h - totalH : y + (h - totalH) / 2;
  const anchorX = align === 'left' ? x + 4 : align === 'right' ? x + w - 4 : x + w / 2;
  const anchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';
  let ascent = size * 0.8;
  if (font) {
    try { ascent = (font.ascent / font.unitsPerEm) * size; } catch { /* keep estimate */ }
  }
  const tspans = lines.map((line, i) => {
    const ly = startY + i * lineH + ascent;
    if (align === 'justify') {
      const words = line.split(/\s+/).filter(Boolean);
      if (i < lines.length - 1 && words.length > 1) {
        const wordWidths = words.map((w) => measure(font, w, size, letterSpacing));
        const total = wordWidths.reduce((a, b) => a + b, 0);
        const gap = (w - total) / (words.length - 1);
        let cx = x + 4;
        let out = '';
        words.forEach((wl, wi) => {
          out += `<text x="${cx}" y="${ly}" font-family="${escapeXml(style.fontFamily || 'Arial')}" font-size="${size}" font-weight="${bold ? 700 : 400}" font-style="${italic ? 'italic' : 'normal'}" fill="${escapeXml(color)}" text-anchor="start" letter-spacing="${letterSpacing}">${escapeXml(wl)}</text>`;
          cx += wordWidths[wi] + gap + letterSpacing;
        });
        return out;
      }
      return `<text x="${x + 4}" y="${ly}" font-family="${escapeXml(style.fontFamily || 'Arial')}" font-size="${size}" font-weight="${bold ? 700 : 400}" font-style="${italic ? 'italic' : 'normal'}" fill="${escapeXml(color)}" text-anchor="start" letter-spacing="${letterSpacing}">${escapeXml(line)}</text>`;
    }
    return `<text x="${anchorX}" y="${ly}" font-family="${escapeXml(style.fontFamily || 'Arial')}" font-size="${size}" font-weight="${bold ? 700 : 400}" font-style="${italic ? 'italic' : 'normal'}" fill="${escapeXml(color)}" text-anchor="${anchor}" letter-spacing="${letterSpacing}">${escapeXml(line)}</text>`;
  }).join('');
  return tspans;
}

// Renders the final PNG: background image + styled field values.
export async function renderImageCertificate(imageBuffer, fields, values) {
  const meta = await sharp(imageBuffer).metadata();
  const width = meta.width;
  const height = meta.height;
  let overlays = '';
  for (const f of fields || []) {
    const style = f.style || {};
    const value = values && values[f.field_key] != null && String(values[f.field_key]).trim() !== ''
      ? String(values[f.field_key])
      : String(f.default_value ?? '');
    if (!value) continue;
    const font = getFont(style.fontFamily, isBoldWeight(style.fontWeight));
    overlays += svgForField({ ...style, x: style.x ?? f.position_x, y: style.y ?? f.position_y, width: style.width ?? f.width, height: style.height ?? f.height }, value, font);
  }
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${overlays}</svg>`;
  const { Resvg } = await import('@resvg/resvg-js');
  const resvg = new Resvg(svg, {
    font: {
      fontDirs: [FONT_ASSETS, 'C:\\Windows\\Fonts', '/usr/share/fonts', '/usr/local/share/fonts', '/Library/Fonts', '/System/Library/Fonts'].filter((d) => existsSync(d)),
      loadSystemFonts: true,
      defaultFontFamily: 'Arial',
    },
  });
  const overlay = Buffer.from(resvg.render().asPng());
  const png = await sharp(imageBuffer)
    .composite([{ input: overlay, top: 0, left: 0 }])
    .png()
    .toBuffer();
  return { buffer: png, width, height };
}

export async function getImageDimensions(buffer) {
  try {
    const meta = await sharp(buffer).metadata();
    if (!meta.width || !meta.height) return null;
    return { width: meta.width, height: meta.height, format: meta.format };
  } catch {
    return null;
  }
}
