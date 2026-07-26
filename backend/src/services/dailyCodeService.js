import { getAllQRCodes } from '../models/qrModel.js';
import { upsertDailyCode, getDailyCodesForDate } from '../models/dailyCodeModel.js';

function random4Digit() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export async function generateDailyCodes() {
  const today = new Date().toISOString().slice(0, 10);
  const qrs = await getAllQRCodes();
  const existing = await getDailyCodesForDate(today);
  const used = new Set(existing.map(c => c.daily_code));
  const generated = [];

  for (const qr of qrs) {
    let code;
    let attempts = 0;
    do {
      code = random4Digit();
      attempts++;
    } while (used.has(code) && attempts < 50);
    if (!code) throw new Error('Failed to generate unique daily code after 50 attempts');
    await upsertDailyCode(qr.id, today, code);
    used.add(code);
    generated.push({ qr_id: qr.id, code });
  }

  return { generated: generated.length, date: today };
}
