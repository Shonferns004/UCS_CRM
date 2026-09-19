const BANK_RE = /\b(bank|sbi|hdfc|icici|axis|kotak|idbi|pnb|canara|union|bob|baroda|bank of india|boi|iob|indian bank|yes bank|rbl|federal|indusind|indus|standard chartered|citibank|citi|bandhan|equitas|dbs|hsbc|barclays|deutsche|au bank|jupiter|fino)\b/i;

export function receivedMeta(sourceName) {
  const n = (sourceName || '').trim();
  if (!n) return null;
  const isBank = BANK_RE.test(n) || /\bbank\b/i.test(n) || /bank$/i.test(n);
  return { branch: n, mop: isBank ? 'online' : n, receivedBank: n };
}
