export const UPI_APPS = [
  { id: 'gpay', name: 'Google Pay', scheme: (q) => `tez://upi/pay?${q}` },
  { id: 'phonepe', name: 'PhonePe', scheme: (q) => `phonepe://pay?${q}` },
  { id: 'paytm', name: 'Paytm', scheme: (q) => `paytmmp://pay?${q}` },
  { id: 'bhim', name: 'BHIM UPI', scheme: (q) => `upi://pay?${q}` },
  { id: 'amazon', name: 'Amazon Pay', scheme: (q) => `amazonpay://upi/?${q}` },
  { id: 'generic', name: 'Other UPI App', scheme: (q) => `upi://pay?${q}` }
]

export function buildUpiUrl(app, { vpa, payee, amount, note }) {
  const q = new URLSearchParams({ pa: vpa, pn: payee, am: String(amount), tn: note, cu: 'INR' })
  return app.scheme(q.toString())
}
