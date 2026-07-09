import { createWorker } from 'tesseract.js';

let worker;
async function getWorker() {
  if (!worker) {
    worker = await createWorker('eng');
    await worker.setParameters({ tessedit_pageseg_mode: '3' });
  }
  return worker;
}

export const parseImage = async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ message: 'image is required' });

    if (process.env.OCR_SERVICE_URL) {
      const ocrRes = await fetch(`${process.env.OCR_SERVICE_URL}/ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image }),
      });
      if (!ocrRes.ok) return res.status(502).json({ message: 'OCR service error' });
      return res.json(await ocrRes.json());
    }

    let base64 = image;
    if (base64.includes('base64,')) base64 = base64.split('base64,')[1];

    const w = await getWorker();
    const { data } = await w.recognize(Buffer.from(base64, 'base64'));
    return res.json({ text: data.text.trim() });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
