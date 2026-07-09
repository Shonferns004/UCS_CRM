import FormData from 'form-data';

async function callOcrService(endpoint, image) {
  const ocrRes = await fetch(`${process.env.OCR_SERVICE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image }),
  });
  if (!ocrRes.ok) throw new Error(`OCR service error: ${ocrRes.status}`);
  return ocrRes.json();
}

export const parseImage = async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ message: 'image is required' });

    if (process.env.OCR_SERVICE_URL) {
      const result = await callOcrService('/ocr', image);
      return res.json(result);
    }

    let base64 = image;
    let filetype = 'PNG';
    if (image.includes('base64,')) {
      base64 = image.split('base64,')[1];
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
      return res.json({ text: json.ParsedResults[0].ParsedText });
    }

    return res.status(422).json({ message: 'OCR failed', details: json.ErrorMessage || json.ErrorDetails || 'Unknown error' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const extractImage = async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ message: 'image is required' });

    if (process.env.OCR_SERVICE_URL) {
      const result = await callOcrService('/extract', image);
      return res.json(result);
    }

    return res.status(501).json({ message: 'Extraction requires OCR_SERVICE_URL to be set' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
