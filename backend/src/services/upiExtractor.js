import Tesseract from 'tesseract.js';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import groq from '../config/groq.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCAL_LANG_PATH = join(__dirname, '..', '..', 'tessdata');
const HAS_LOCAL_TESSDATA = existsSync(join(LOCAL_LANG_PATH, 'eng.traineddata'));

function parseGroqJson(raw) {
  try {
    const cleaned = raw.replace(/```(?:json)?\s*/g, '').replace(/```\s*$/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    const idMatch = raw.match(/["']?upi_transaction_id["']?\s*[:=]\s*["']?([\w\d-]+)["']?/);
    const dtMatch = raw.match(/["']?transaction_datetime["']?\s*[:=]\s*["']?([^"'\n]+)["']?/);
    const fromMatch = raw.match(/["']?payment_from["']?\s*[:=]\s*["']?([^"'\n]+)["']?/);
    return {
      upi_transaction_id: idMatch?.[1] || null,
      transaction_datetime: dtMatch?.[1] || null,
      payment_from: fromMatch?.[1] || null,
    };
  }
}

export async function extractUpiFields(screenshotUrl) {
  const ocrStart = Date.now();

  const workerOptions = { logger: () => {} };
  if (HAS_LOCAL_TESSDATA) {
    workerOptions.langPath = LOCAL_LANG_PATH;
  }

  const { data: { text } } = await Tesseract.recognize(screenshotUrl, 'eng', workerOptions);

  const ocrText = text.trim();
  const ocrMs = Date.now() - ocrStart;

  if (!ocrText || ocrText.length < 5) {
    return {
      upi_transaction_id: null,
      transaction_datetime: null,
      payment_from: null,
      ocr_text: ocrText,
      ocr_ms: ocrMs,
      ai_ms: 0,
    };
  }

  const aiStart = Date.now();

  const completion = await groq.chat.completions.create({
    messages: [
      {
        role: 'system',
        content: `You extract UPI payment details from OCR text of a payment screenshot.

Return ONLY a JSON object (no markdown, no explanation) with exactly these 3 keys:
- "upi_transaction_id": the UPI transaction ID / UPI reference number (e.g. "123456789012"). If not found, use null.
- "transaction_datetime": combined date and time in ISO 8601 format (e.g. "2025-01-12T10:30:00"). If only date is found, use that date with T00:00:00. Use the current year if year is missing. If not found, use null.
- "payment_from": the sender/payer name (the name on the UPI account that sent the payment). If not found, use null.

Do NOT include any other text. Only the JSON object.`,
      },
      {
        role: 'user',
        content: `Extract UPI details from this OCR text:\n\n${ocrText}`,
      },
    ],
    model: 'llama-3.3-70b-versatile',
    temperature: 0,
    max_tokens: 200,
  });

  const aiMs = Date.now() - aiStart;
  const raw = completion.choices[0]?.message?.content?.trim() || '';
  const parsed = parseGroqJson(raw);

  return {
    upi_transaction_id: parsed.upi_transaction_id || null,
    transaction_datetime: parsed.transaction_datetime || null,
    payment_from: parsed.payment_from || null,
    ocr_text: ocrText,
    ocr_ms: ocrMs,
    ai_ms: aiMs,
  };
}
