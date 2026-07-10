const OCR_API = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL + '/ocr/extract'
  : '/api/ocr/extract';

export async function extractTransactionData(base64Image) {
  try {
    const res = await fetch(OCR_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64Image }),
    });
    if (!res.ok) return fallback();
    const json = await res.json();
    const d = json.data;
    if (!d) return fallback();

    let transactionDatetime = null;
    if (d.date) {
      const timeStr = d.time || '00:00:00';
      transactionDatetime = `${d.date}T${timeStr.length === 8 ? timeStr : timeStr + ':00'}`;
    }

    return {
      upiTransactionId: d.transaction_id || null,
      transactionDatetime,
      amount: d.amount || null,
      fromName: d.from || null,
    };
  } catch {
    return fallback();
  }
}

function fallback() {
  return { upiTransactionId: null, transactionDatetime: null, amount: null, fromName: null };
}
