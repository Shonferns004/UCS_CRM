import express from 'express';
import { createWorker } from 'tesseract.js';
import { extractStructuredData } from './extractor.js';

let worker = null;

async function getWorker() {
  if (!worker) {
    worker = await createWorker('eng');
    await worker.setParameters({ tessedit_pageseg_mode: '3' });
  }
  return worker;
}

const app = express();
app.use(express.json({ limit: '10mb' }));

app.post('/ocr', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ text: '', error: 'image is required' });

    let base64 = image;
    if (base64.includes('base64,')) base64 = base64.split('base64,')[1];

    const w = await getWorker();
    const { data } = await w.recognize(Buffer.from(base64, 'base64'));
    return res.json({ text: data.text.trim() });
  } catch (e) {
    return res.json({ text: '', error: e.message });
  }
});

app.post('/extract', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ data: null, error: 'image is required' });

    let base64 = image;
    if (base64.includes('base64,')) base64 = base64.split('base64,')[1];

    const w = await getWorker();
    const { data } = await w.recognize(Buffer.from(base64, 'base64'));
    const extracted = extractStructuredData(data.text);

    return res.json({ data: extracted, raw_text: data.text.trim() });
  } catch (e) {
    return res.json({ data: null, error: e.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = parseInt(process.env.PORT || '8000');
app.listen(PORT, '0.0.0.0', () => {
  console.log(`OCR service running on port ${PORT}`);
});
