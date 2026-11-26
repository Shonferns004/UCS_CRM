import { api } from './auth'

// `month` is an optional YYYY-MM key. The dashboard omits it (current month);
// the Incentive Calendar passes an older month when the FRO steps back.
export async function getMyTarget(month) {
  const query = month ? `?month=${encodeURIComponent(month)}` : ''
  return api(`/fro/target${query}`, { _prefix: 'ucs' })
}
