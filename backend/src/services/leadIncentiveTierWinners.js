// Tier-winner selection for lead incentives (pure, no DB).
//
// A range in "tier mode" has milestone tiers (e.g. ₹500 → ₹100, ₹2000 → ₹300,
// …). At the end of the window each tier gets exactly one winner: the FRO with
// the highest counted collection whose total CROSSED that tier's target
// (inclusive), ties going to whoever crossed that tier first.
//
// A FRO takes at most ONE tier — the highest one they can win. Winners are
// therefore picked top-down (highest tier first), and a FRO already crowned in a
// higher tier is skipped in the tiers below.
//
// This exists because of a live production bug: the original code dropped each
// FRO into the pool of ONLY their highest reached tier. So a FRO who overshot
// into a tier they could not win (a bigger collector took it) fell out of every
// lower tier too and got ₹0 — even though they were the top collector of a tier
// they had clearly crossed. Reported case: in ₹1–29,999, Damini Thakur collected
// ₹2000, lost tier 2 to Dhanshree, and got nothing, when she should have won
// tier 1.

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const timeOf = (iso) => {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) ? t : Infinity;
};

// members: [{ fro_id, total, crossTimes: { [tier_key]: iso }, ...extra }]
// tiers:   [{ tier_key, target_amount, ... }] (any order)
// returns: { winnerByTier: { [tier_key]: { member, total, crossAt } },
//            wonTierByFro: { [fro_id]: tier_key } }
export function selectTierWinners(members, tiers) {
  const list = (members || []).map((m) => ({
    member: m,
    froId: m && m.fro_id != null ? String(m.fro_id) : '',
    total: num(m && m.total),
    crossTimes: (m && m.crossTimes) || {},
  }));

  // Highest target first: the FRO who can win the most valuable tier is placed
  // there before lower tiers are decided.
  const tiersDesc = (tiers || [])
    .slice()
    .sort((a, b) => num(b && b.target_amount) - num(a && a.target_amount));

  const winnerByTier = {};
  const wonTierByFro = {};

  for (const t of tiersDesc) {
    const target = num(t && t.target_amount);
    const key = t && t.tier_key;

    let best = null;
    for (const e of list) {
      if (e.total < target) continue; // never crossed this tier
      if (e.froId && wonTierByFro[e.froId]) continue; // already took a higher tier
      const crossAt = e.crossTimes[key] || null;
      if (!best) {
        best = { member: e.member, total: e.total, crossAt };
        continue;
      }
      if (e.total > best.total) {
        best = { member: e.member, total: e.total, crossAt };
        continue;
      }
      if (e.total === best.total && timeOf(crossAt) < timeOf(best.crossAt)) {
        best = { member: e.member, total: e.total, crossAt };
      }
    }

    if (best) {
      winnerByTier[key] = best;
      if (best.member && best.member.fro_id != null) {
        wonTierByFro[String(best.member.fro_id)] = key;
      }
    }
  }

  return { winnerByTier, wonTierByFro };
}
