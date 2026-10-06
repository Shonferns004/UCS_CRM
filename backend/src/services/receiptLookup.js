// Shared donor -> receipt lookup.
//
// Receipts can reach a donor two ways:
//   1. the donor profile has been linked directly (receipts.donor_id)
//   2. only the donor's phone was captured (receipts.donor_mobile), which is
//      how the vast majority of receipts entered the system
//
// A donor_id-only lookup hides case 2 entirely, so a donor's history looked
// like it vanished the moment a receipt was logged before any sync ran. This
// module unions both paths and de-duplicates on receipt id.
//
// NOTE: receipts are never written from here. Read-only by construction.

const digitsOf = raw => (raw === null || raw === undefined ? '' : String(raw).replace(/[^0-9]/g, ''));

// Every spelling of a number that may legitimately appear in receipts.
// last-10-digit matching is deliberately NOT used: mobile numbers repeat
// across different people and silently merge unrelated donors.
export function mobileVariants(raw) {
  if (raw === null || raw === undefined) return [];
  const out = new Set();
  const original = String(raw).trim();
  if (original) out.add(original);

  const digits = digitsOf(raw);
  if (!digits) return [...out];
  out.add(digits);

  if (digits.length === 10) {
    out.add(`91${digits}`);
    out.add(`0${digits}`);
    out.add(`+91${digits}`);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    const base = digits.slice(1);
    out.add(base);
    out.add(`91${base}`);
    out.add(`+91${base}`);
  } else if (digits.length === 12 && digits.startsWith('91')) {
    const base = digits.slice(2);
    out.add(base);
    out.add(`0${base}`);
    out.add(`+91${base}`);
  }
  return [...out];
}

// Returns receipts for a donor, unioned across donor_id and every mobile
// variant, de-duplicated by id, ordered newest first.
export async function receiptsForDonor(client, donor) {
  const donorId = donor && donor.id;
  const variants = mobileVariants(donor && donor.mobile_number);

  const queries = [client.from('receipts').select('*').eq('donor_id', donorId)];
  if (variants.length > 0) {
    queries.push(client.from('receipts').select('*').in('donor_mobile', variants));
  }

  const results = await Promise.allSettled(queries);
  const merged = [];
  const seen = new Set();
  for (const r of results) {
    if (r.status !== 'fulfilled' || !Array.isArray(r.value.data)) continue;
    for (const receipt of r.value.data) {
      if (seen.has(receipt.id)) continue;
      seen.add(receipt.id);
      merged.push(receipt);
    }
  }
  merged.sort((a, b) => {
    const da = a.receipt_date || a.created_at || '';
    const db = b.receipt_date || b.created_at || '';
    if (da === db) return (b.id || 0) - (a.id || 0);
    return da < db ? 1 : -1;
  });
  return merged;
}
