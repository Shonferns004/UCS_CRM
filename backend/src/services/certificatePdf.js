import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import PDFDocument from 'pdfkit';

const execFileAsync = promisify(execFile);

const BUCKET_EXT = { docx: 'docx', pptx: 'pptx', png: 'png' };

// PNG -> single-page landscape PDF using pdfkit. The page is landscape with
// the image's aspect ratio preserved (fit within the page, centered), which
// keeps certificate artwork crisp at any source size.
export function imageToPdf(imageBuffer, width, height) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const isWide = width >= height;
    const pageW = isWide ? width : height;
    const pageH = isWide ? height : width;
    const doc = new PDFDocument({ autoFirstPage: false, margin: 0 });
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.addPage({ size: [pageW, pageH], margin: 0 });
    doc.image(imageBuffer, 0, 0, { fit: [pageW, pageH], align: 'center', valign: 'center' });
    doc.end();
  });
}

// DOCX/PPTX -> PDF via LibreOffice headless. Single-flight like the snapshot
// service, so bulk runs never stack soffice processes.
let conversionInFlight = false;

export async function officeToPdf(buffer, ext) {
  if (conversionInFlight) return null;
  conversionInFlight = true;
  try {
    return await renderOfficeToPdf(buffer, ext);
  } finally {
    conversionInFlight = false;
  }
}

async function renderOfficeToPdf(buffer, ext) {
  const safeExt = BUCKET_EXT[ext] || 'docx';
  const dir = mkdtempSync(path.join(tmpdir(), 'cert-pdf-'));
  const src = path.join(dir, `input.${safeExt}`);
  const profile = path.join(dir, 'lo-profile');
  const profileUrl = 'file://' + profile;
  try {
    writeFileSync(src, buffer);
    try {
      await execFileAsync('soffice', [
        `-env:UserInstallation=${profileUrl}`,
        '--headless',
        '--convert-to', 'pdf',
        '--outdir', dir,
        src,
      ], { timeout: 90000 });
    } catch (e) {
      if (e.code === 'ENOENT') return null;
    }
    const out = path.join(dir, 'input.pdf');
    if (!existsSync(out)) return null;
    return readFileSync(out);
  } finally {
    try { await execFileAsync('pkill', ['-f', profile], { timeout: 5000 }); } catch {}
    rmSync(dir, { recursive: true, force: true });
  }
}

// Produces a landscape PDF for any rendered certificate output.
export async function toPdfBuffer(out) {
  if (!out || !out.buffer) return null;
  if (out.ext === 'png') {
    try {
      const sharp = (await import('sharp')).default;
      const meta = await sharp(out.buffer).metadata();
      return await imageToPdf(out.buffer, meta.width, meta.height);
    } catch {
      return null;
    }
  }
  return officeToPdf(out.buffer, out.ext);
}
