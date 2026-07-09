import { createWorker } from 'tesseract.js';
import FormData from 'form-data';

let worker;
async function getWorker() {
  if (!worker) {
    worker = await createWorker('eng');
    await worker.setParameters({ tessedit_pageseg_mode: '3' });
  }
  return worker;
}

function decodeBase64(image) {
  return image.includes('base64,') ? image.split('base64,')[1] : image;
}

async function recognizeTesseract(image) {
  const w = await getWorker();
  const { data } = await w.recognize(Buffer.from(decodeBase64(image), 'base64'));
  return data.text.trim();
}

async function recognizeOcrSpace(image) {
  let base64 = decodeBase64(image);
  let filetype = 'PNG';
  if (image.includes('base64,')) {
    const header = image.substring(0, 30);
    if (header.includes('jpeg') || header.includes('jpg')) filetype = 'JPG';
    else if (header.includes('gif')) filetype = 'GIF';
  }

  const form = new FormData();
  form.append('base64image', base64);
  form.append('language', 'eng');
  form.append('filetype', filetype);
  form.append('isOverlayRequired', 'false');

  const ocrRes = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    headers: { apikey: process.env.OCR_SPACE_KEY },
    body: form,
  });
  const json = await ocrRes.json();
  if (json.OCRExitCode === 1 && json.ParsedResults?.length > 0) {
    return json.ParsedResults[0].ParsedText;
  }
  throw new Error(json.ErrorMessage || json.ErrorDetails || 'OCR.space failed');
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

    let text = null;
    const errors = [];

    if (!process.env.VERCEL) {
      try {
        text = await recognizeTesseract(image);
      } catch (e) {
        errors.push('tesseract: ' + e.message);
      }
    }

    if (!text && process.env.OCR_SPACE_KEY) {
      try {
        text = await recognizeOcrSpace(image);
      } catch (e) {
        errors.push('ocr.space: ' + e.message);
      }
    }

    if (text) return res.json({ text });

    return res.status(500).json({
      message: 'OCR failed',
      details: errors.join('; ') || 'No OCR engine available',
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
