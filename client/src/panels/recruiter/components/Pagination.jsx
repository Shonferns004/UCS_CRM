export default function Pagination({ page, setPage, totalItems, pageSize = 10 }) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const from = totalItems === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, totalItems);

  const go = (p) => { if (p >= 1 && p <= totalPages && p !== current) setPage(p); };

  const maxShow = 5;
  let start = Math.max(1, current - Math.floor(maxShow / 2));
  let end = Math.min(totalPages, start + maxShow - 1);
  start = Math.max(1, end - maxShow + 1);
  const pages = [];
  for (let i = start; i <= end; i++) pages.push(i);

  if (totalPages <= 1) return null;

  return (
    <div className="pagination">
      <div className="pagination-info">
        Showing <strong>{from}</strong>{'\u2013'}<strong>{to}</strong> of <strong>{totalItems}</strong>
      </div>
      <div className="pagination-controls">
        <button className="page-btn page-nav" onClick={() => go(current - 1)} disabled={current === 1}>{'\u2039'} Prev</button>
        {start > 1 && <button className="page-btn" onClick={() => go(1)}>1</button>}
        {start > 2 && <span className="page-ellipsis">{'\u2026'}</span>}
        {pages.map(p => (
          <button key={p} className={`page-btn ${p === current ? 'active' : ''}`} onClick={() => go(p)}>{p}</button>
        ))}
        {end < totalPages - 1 && <span className="page-ellipsis">{'\u2026'}</span>}
        {end < totalPages && <button className="page-btn" onClick={() => go(totalPages)}>{totalPages}</button>}
        <button className="page-btn page-nav" onClick={() => go(current + 1)} disabled={current === totalPages}>Next {'\u203A'}</button>
      </div>
    </div>
  );
}
