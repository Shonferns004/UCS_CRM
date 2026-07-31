function S({ width, height, style }) {
  return <div className="sk" style={{ width: width || '100%', height: height || 14, ...style }} />
}

export function SkeletonRow({ cols = 4, height }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:`repeat(${cols},1fr)`, gap:10, padding:4 }}>
      {Array.from({ length: cols }).map((_, i) => <S key={i} height={height || 80} />)}
    </div>
  )
}

export function SkeletonTable({ rows = 5 }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8, padding:16 }}>
      <S width="40%" style={{ marginBottom:8 }} />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display:'flex', gap:12, alignItems:'center' }}>
          <S width="30%" />
          <S width="20%" />
          <S width="25%" />
          <S width="15%" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonProfile() {
  return (
    <div className="detail-card" style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--card-bg, #fff)', borderRadius: 12 }}>
      <div className="detail-split" style={{ flex: 1, minHeight: 0 }}>
        <div className="detail-left" style={{ padding: 14 }}>
          <div style={{ textAlign: 'center', paddingBottom: 12, borderBottom: '1px solid var(--line, #e5e7eb)' }}>
            <div className="sk" style={{ width: 48, height: 48, borderRadius: '50%', margin: '0 auto 8px' }} />
            <S height={12} width="58%" style={{ margin: '0 auto 6px' }} />
            <S height={9} width="30%" style={{ margin: '0 auto' }} />
          </div>
          <div className="sk" style={{ height: 44, borderRadius: 10, margin: '10px 0' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[68, 54, 48, 62].map((width, i) => (
              <div key={i} style={{ border: '1px solid var(--line, #e5e7eb)', borderRadius: 8, padding: '7px 10px' }}>
                <S height={8} width="28%" style={{ marginBottom: 5 }} />
                <S height={10} width={`${width}%`} />
              </div>
            ))}
          </div>
        </div>
        <div className="detail-mid" style={{ padding: 14 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <div className="sk" style={{ width: 70, height: 26, borderRadius: 7 }} />
            <div className="sk" style={{ width: 70, height: 26, borderRadius: 7 }} />
          </div>
          <S height={30} style={{ marginBottom: 10, borderRadius: 8 }} />
          {[0, 1, 2].map(i => (
            <div key={i} style={{ border: '1px solid var(--line, #e5e7eb)', borderRadius: 10, padding: 10, marginBottom: 8 }}>
              <S height={9} width={i === 1 ? '34%' : '24%'} style={{ marginBottom: 8 }} />
              <S height={30} style={{ borderRadius: 7 }} />
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 12 }}>
            <div className="sk" style={{ width: 80, height: 30, borderRadius: 8 }} />
            <div className="sk" style={{ width: 110, height: 30, borderRadius: 8 }} />
          </div>
        </div>
        <div className="detail-right" style={{ padding: 14 }}>
          <S height={11} width="48%" style={{ marginBottom: 12 }} />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ padding: '9px 0', borderBottom: '1px solid var(--line, #e5e7eb)' }}>
              <S height={9} width={i % 2 ? '62%' : '78%'} style={{ marginBottom: 5 }} />
              <S height={7} width="42%" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function SkeletonDashboard() {
  const StatCard = ({ compact = false, index = 0 }) => (
    <div style={{ background: 'var(--card-bg, #fff)', border: '1px solid var(--line, #e5e7eb)', borderRadius: 10, padding: compact ? '14px 16px' : '16px 18px', minHeight: compact ? 64 : 82, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="sk" style={{ width: compact ? 28 : 34, height: compact ? 28 : 34, borderRadius: 9, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <S height={10} width={index % 2 ? '46%' : '60%'} style={{ marginBottom: 9 }} />
          <S height={compact ? 15 : 20} width={compact ? '35%' : '48%'} />
        </div>
      </div>
      {!compact && <S height={8} width="72%" style={{ marginTop: 13 }} />}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
        {Array.from({ length: 4 }).map((_, i) => <StatCard key={i} index={i} />)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
        {Array.from({ length: 8 }).map((_, i) => <StatCard key={i} compact index={i} />)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} style={{ background: 'var(--card-bg, #fff)', border: '1px solid var(--line, #e5e7eb)', borderRadius: 10, padding: '16px 18px', height: 190, boxSizing: 'border-box' }}>
            <S height={12} width="38%" style={{ marginBottom: 20 }} />
            <div style={{ height: 126, display: 'flex', alignItems: 'flex-end', gap: 10, padding: '0 8px' }}>
              {[48, 76, 58, 96, 68, 84].map((height, bar) => <div key={bar} className="sk" style={{ flex: 1, height: `${height}px`, borderRadius: '5px 5px 2px 2px' }} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SkeletonDonors() {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8, padding:4 }}>
      <S height={36} />
      <S width="20%" />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={{ display:'flex', gap:10, alignItems:'center', padding:'6px 0' }}>
          <div className="sk" style={{ width:32, height:32, borderRadius:'50%' }} />
          <S width="25%" />
          <S width="15%" />
        </div>
      ))}
    </div>
  )
}
