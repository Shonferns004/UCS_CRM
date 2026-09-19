export default function Pagination({ page, setPage, totalItems, pageSize = 20 }) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const from = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);

  const go = (p) => { if (p >= 1 && p <= totalPages && p !== page) setPage(p); };

  const maxShow = 5;
  let start = Math.max(1, page - Math.floor(maxShow / 2));
  let end = Math.min(totalPages, start + maxShow - 1);
  start = Math.max(1, end - maxShow + 1);
  const pages = [];
  for (let i = start; i <= end; i++) pages.push(i);

  if (totalPages <= 1) return null;

  const btn = { minWidth: 30, height: 30, padding: '0 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: 12, cursor: 'pointer', transition: 'all .15s', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };
  const btnActive = { ...btn, background: 'var(--sage)', borderColor: 'var(--sage)', color: '#fff', fontWeight: 700 };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 2px 2px', flexWrap: 'wrap' }}>
      <div style={{ fontSize: 12, color: '#6b7280' }}>
        {totalItems === 0 ? 'No results' : <>Showing <strong>{from} {'\u2013'} {to}</strong> of <strong>{totalItems}</strong></>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button onClick={() => go(page - 1)} disabled={page === 1} style={{ ...btn, opacity: page === 1 ? .4 : 1, cursor: page === 1 ? 'not-allowed' : 'pointer' }}>{'\u2039'} Prev</button>
        {start > 1 && <span style={{ fontSize: 12, color: '#9ca3af', padding: '0 2px' }}>...</span>}
        {pages.map(p => (
          <button key={p} onClick={() => go(p)} style={p === page ? btnActive : btn}>{p}</button>
        ))}
        {end < totalPages && <span style={{ fontSize: 12, color: '#9ca3af', padding: '0 2px' }}>...</span>}
        <button onClick={() => go(page + 1)} disabled={page === totalPages} style={{ ...btn, opacity: page === totalPages ? .4 : 1, cursor: page === totalPages ? 'not-allowed' : 'pointer' }}>Next {'\u203A'}</button>
      </div>
    </div>
  );
}
