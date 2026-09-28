// Work-as identity + arbitration. Both of these used to be inline in a request
// handler and a query loop, which is how a chained switch ended up recording the
// previous target as the operator and how an operator's displayed row kept
// changing between covers. Both are pure so they can be unit-tested directly.

// The real operator for a work-as switch.
//
// While impersonating, the JWT's `id` and `name` ARE the covered FRO — the
// operator is in `imposter_id` / `imposter_name`. Reading `id`/`name` on a
// chained switch therefore stamped the previous target onto the new target's row
// as its "operator", which made a covered FRO render as an acting operator in the
// NGO dashboard and handed them the covered row's live counters.
export function resolveOperatorIdentity(user) {
  const chained = !!(user?.impersonation && user?.imposter_id);
  return {
    chained,
    imposterId: chained ? user.imposter_id : user?.id,
    imposterName: chained ? (user.imposter_name || '') : (user?.name || ''),
  };
}

// Map operator id -> the one covered row that represents them.
//
// An operator routinely covers SEVERAL FROs at once, so "which row is this
// operator working" needs a total order. First-seen-wins was not one: the
// underlying queries have no ORDER BY, so PostgREST row order shifts whenever
// any covered row is written (~60s per live panel) and the operator's presence
// flipped between targets non-deterministically. Most-recently-written wins,
// with worker_id as a tie-break so identical timestamps are still stable.
export function buildWorkAsByOp(rows, isLiveFresh) {
  const byOperator = new Map();
  for (const s of rows || []) {
    if (!s?.work_as_operator_id || !isLiveFresh(s)) continue;
    const op = String(s.work_as_operator_id);
    const best = byOperator.get(op);
    if (!best) { byOperator.set(op, s); continue; }
    const bestAt = best.updated_at ? new Date(best.updated_at).getTime() : 0;
    const candAt = s.updated_at ? new Date(s.updated_at).getTime() : 0;
    if (candAt > bestAt || (candAt === bestAt && String(s.worker_id) < String(best.worker_id))) {
      byOperator.set(op, s);
    }
  }
  return byOperator;
}
