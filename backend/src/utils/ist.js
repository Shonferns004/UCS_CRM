const IST_OFFSET_MINUTES = 330;

export function istParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(date));
  const values = Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  return { year: +values.year, month: +values.month, day: +values.day, hour: +values.hour, minute: +values.minute, second: +values.second };
}

export function istDateString(date = new Date()) {
  const p = istParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function istDayBounds(date = new Date()) {
  const p = istParts(date);
  const start = new Date(Date.UTC(p.year, p.month - 1, p.day) - IST_OFFSET_MINUTES * 60 * 1000);
  return { start, end: new Date(start.getTime() + 86400000 - 1) };
}

export function firstOfNextMonthIstUtc(date = new Date()) {
  const p = istParts(date);
  return new Date(Date.UTC(p.year, p.month, 1) - IST_OFFSET_MINUTES * 60 * 1000);
}

export function startOfNextIstDayUtc(date = new Date()) {
  const p = istParts(date);
  return new Date(Date.UTC(p.year, p.month - 1, p.day + 1) - IST_OFFSET_MINUTES * 60 * 1000);
}
