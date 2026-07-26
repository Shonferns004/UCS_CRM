export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const AKI_RANGES = {
  Sunday: [
    { min: 3750, max: 6999, incentive: 200 },
    { min: 7000, max: 11999, incentive: 400 },
    { min: 12000, max: 13749, incentive: 800 },
    { min: 13750, max: 18999, incentive: 1100 },
    { min: 19000, max: Infinity, incentive: 1500 },
  ],
  Monday: [
    { min: 3000, max: 5999, incentive: 180 },
    { min: 6000, max: 8999, incentive: 360 },
    { min: 9000, max: 11999, incentive: 540 },
    { min: 12000, max: 13999, incentive: 720 },
    { min: 14000, max: Infinity, incentive: 900 },
  ],
  Tuesday: [
    { min: 2500, max: 7999, incentive: 100 },
    { min: 8000, max: 12499, incentive: 400 },
    { min: 12500, max: 15999, incentive: 700 },
    { min: 16000, max: Infinity, incentive: 1100 },
  ],
  Wednesday: [
    { min: 3000, max: 5499, incentive: 250 },
    { min: 5500, max: 7499, incentive: 300 },
    { min: 7500, max: 10499, incentive: 450 },
    { min: 10500, max: 12499, incentive: 610 },
    { min: 12500, max: Infinity, incentive: 750 },
  ],
  Thursday: [
    { min: 3750, max: 6999, incentive: 200 },
    { min: 7000, max: 11999, incentive: 400 },
    { min: 12000, max: 13749, incentive: 800 },
    { min: 13750, max: 18999, incentive: 1100 },
    { min: 19000, max: Infinity, incentive: 1500 },
  ],
  Friday: [
    { min: 3000, max: 5999, incentive: 180 },
    { min: 6000, max: 8999, incentive: 360 },
    { min: 9000, max: 11999, incentive: 540 },
    { min: 12000, max: 13999, incentive: 720 },
    { min: 14000, max: Infinity, incentive: 900 },
  ],
  Saturday: [
    { min: 2500, max: 3999, incentive: 100 },
    { min: 4000, max: 7999, incentive: 200 },
    { min: 8000, max: 12499, incentive: 400 },
    { min: 12500, max: 15999, incentive: 700 },
    { min: 16000, max: Infinity, incentive: 1100 },
  ],
};

export function getDayName(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    console.warn('getDayName: invalid dateStr', dateStr);
    return '';
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) {
    console.warn('getDayName: could not parse date', dateStr);
    return '';
  }
  return DAY_NAMES[new Date(y, m - 1, d).getDay()];
}

export function calculateAKI(amount, dayName) {
  const ranges = AKI_RANGES[dayName];
  if (!ranges) return 0;
  const range = ranges.find(r => amount >= r.min && amount <= r.max);
  return range ? range.incentive : 0;
}

export function getMonthsEmployed(createdAt) {
  const now = new Date();
  const join = new Date(createdAt);
  const months = (now.getFullYear() - join.getFullYear()) * 12 + (now.getMonth() - join.getMonth());
  const isAfterJoinDay = now.getDate() >= join.getDate();
  return isAfterJoinDay ? months + 1 : months;
}
