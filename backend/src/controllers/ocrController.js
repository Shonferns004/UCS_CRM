import FormData from 'form-data';

export const parseImage = async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ message: 'image is required' });

    const apiKey = process.env.OCR_SPACE_KEY;
    if (!apiKey) return res.status(500).json({ message: 'OCR_SPACE_KEY not configured' });

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
      headers: { 'apikey': apiKey },
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
