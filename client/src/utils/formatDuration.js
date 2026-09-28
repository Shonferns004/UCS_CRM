// One duration format for every idle/worked figure in the product.
//
// The FRO strip rendered seconds as "59m" / "1h 5m" while the NGO-admin
// telecaller table rendered the same field as a bare hours decimal ("0.99"),
// so an idle figure of 59 minutes looked like a completely different number on
// the two screens. Both now go through this helper, which is the strip's
// original format — the one already reviewed and understood.
export function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export default formatDuration;
