import { writeFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TESSDATA_DIR = join(__dirname, '..', 'tessdata');
const URL = 'https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata';
const OUT = join(TESSDATA_DIR, 'eng.traineddata');

async function download() {
  mkdirSync(TESSDATA_DIR, { recursive: true });
  console.log('Downloading eng.traineddata (12 MB)...');

  const res = await fetch(URL);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(OUT, buffer);
  console.log(`eng.traineddata downloaded (${(buffer.length / 1024 / 1024).toFixed(1)} MB).`);
}

download().catch((err) => {
  console.error('Failed to download eng.traineddata:', err.message);
  process.exit(1);
});
