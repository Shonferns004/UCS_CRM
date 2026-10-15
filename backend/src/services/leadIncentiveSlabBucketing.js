// Which incentive RANGE (slab) does a FRO's monthly target belong in?
//
// Pure and dependency-free so it is unit-testable without a database, following
// the same split froMonthlyTarget.js uses. leadIncentiveService.js is the only
// consumer.
//
// THE BUG THIS GUARDS. The first version compared `t >= min && t < max` — an
// exclusive upper bound. Admins define ranges as "₹1 – ₹29999",
// "₹70000 – ₹100000", "₹100001 – ₹200000" and expect a ₹1,00,000 target to sit
// IN the ₹70k–₹1L range. With `< max`, a target landing exactly on a range's
// max_amount matched nothing, walked past every range, and fell into the final
// "first slab" fallback. Live consequence: a FRO with a ₹2,00,000 target (exactly
// the max of the ₹100001–₹200000 range) was bucketed under ₹1 – ₹29,999 — the
// bottom race — along with every other exact-boundary target.
//
// Two rules keep it correct:
//   1. Bounds are INCLUSIVE of max_amount (min <= t <= max).
//   2. A target in a genuine GAP between two configured ranges (e.g. ₹2,20,000
//      when no range covers 2,00,001–2,49,999) goes to the NEAREST range by
//      distance — never automatically the lowest one.

// slabs: rows of incentive_slabs (need min_amount/max_amount), sorted ascending
// by min_amount (getActiveSlabs already returns them that way).
export function getSlabForTarget(target, slabs) {
  const t = Number(target) || 0;
  const rows = slabs || [];
  for (const slab of rows) {
    if (t >= Number(slab.min_amount) && t <= Number(slab.max_amount)) {
      return slab;
    }
  }
  // Above every configured range: the highest range owns it.
  if (rows.length > 0 && t >= Number(rows[rows.length - 1].min_amount)) {
    return rows[rows.length - 1];
  }
  // Gap (or below the lowest range): closest range by distance to [min, max].
  let nearest = rows[0] || null;
  let nearestDist = Infinity;
  for (const slab of rows) {
    const mn = Number(slab.min_amount);
    const mx = Number(slab.max_amount);
    const d = t < mn ? mn - t : t > mx ? t - mx : 0;
    if (d < nearestDist) {
      nearestDist = d;
      nearest = slab;
    }
  }
  return nearest;
}

// Resolve the FRO's competition range: an admin-assigned slab (via ⚙️ Configure)
// wins; otherwise the FRO falls into a range automatically from their monthly
// target.
export function resolveFroSlab(froId, target, slabs, assignMap, slabById) {
  const assignedId = assignMap ? assignMap[froId] : null;
  if (assignedId && slabById && slabById[assignedId]) {
    return { slab: slabById[assignedId], target };
  }
  return { slab: getSlabForTarget(target, slabs), target };
}
