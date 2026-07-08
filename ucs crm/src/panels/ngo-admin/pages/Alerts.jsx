import { useState, useEffect } from 'react'
import { apiGet, apiPut } from '../api/auth'

function getAlertIcon(type) {
  switch (type) {
    case 'missed_schedule': return '\u26A0\uFE0F';
    case 'missed_callback': return '\uD83D\uDD14';
    case 'data_request': return '\uD83D\uDCE5';
    default: return '\uD83D\uDD14';
  }
}

function getTimeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selectedNgoId, setSelectedNgoId] = useState('all');
  const [accessibleNgos, setAccessibleNgos] = useState([]);

  useEffect(() => {
    apiGet('/ngo-admin/ngos').then(setAccessibleNgos).catch(() => {});
  }, []);

  const load = () => {
    setLoading(true);
    const ngoParam = selectedNgoId !== 'all' ? `?ngo_id=${selectedNgoId}` : '';
    apiGet(`/ngo-admin/alerts${ngoParam}`)
      .then(data => setAlerts(Array.isArray(data) ? data : data?.alerts || []))
      .catch(() => setAlerts([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, [selectedNgoId]);

  const handleAcknowledge = async (alertId) => {
    try {
      await apiPut(`/ngo-admin/alerts/${alertId}/acknowledge`, {});
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, acknowledged: true } : a));
    } catch (err) {
      alert(err.message);
    }
  };

  const filtered = filter === 'all' ? alerts : filter === 'unread' ? alerts.filter(a => !a.acknowledged) : alerts.filter(a => a.type === filter);
  const unreadCount = alerts.filter(a => !a.acknowledged).length;

  return (
    <div>
      <div className="filter-bar">
        <span style={{fontSize:13, fontWeight:600, color:'var(--ink-soft)'}}>NGO:</span>
        <select value={selectedNgoId} onChange={e => setSelectedNgoId(e.target.value)}>
          <option value="all">All NGOs</option>
          {accessibleNgos.map(ngo => (
            <option key={ngo.id} value={ngo.id}>{ngo.name}</option>
          ))}
        </select>
      </div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <h3 style={{ margin:0 }}>Alerts</h3>
          {unreadCount > 0 && (
            <span style={{ background:'#dc2626', color:'#fff', borderRadius:10, padding:'1px 8px', fontSize:10, fontWeight:700 }}>
              {unreadCount} new
            </span>
          )}
        </div>
        <div style={{ display:'flex', gap:6 }}>
          {['all','unread','missed_schedule','data_request'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding:'4px 12px', border:`1px solid ${filter === f ? 'var(--sage)' : 'var(--line)'}`, borderRadius:16, background: filter === f ? 'var(--sage)' : '#fff', color: filter === f ? '#fff' : 'var(--ink)', fontSize:10, fontWeight:600, fontFamily:'inherit', cursor:'pointer' }}>
              {f === 'all' ? 'All' : f === 'unread' ? 'Unread' : f === 'missed_schedule' ? 'Missed' : 'Data Requests'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading alerts...</div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="card-pad">
            <div className="empty-state"><p>No alerts found.</p></div>
          </div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {filtered.map(alert => (
            <div key={alert.id} className="card" style={{ opacity: alert.acknowledged ? .6 : 1 }}>
              <div style={{ display:'flex', gap:12, alignItems:'flex-start', padding:14 }}>
                <span style={{ fontSize:20 }}>{getAlertIcon(alert.type)}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                    <strong style={{ fontSize:13 }}>{alert.title || alert.type?.replace('_',' ')}</strong>
                    {!alert.acknowledged && (
                      <span style={{ width:8, height:8, borderRadius:'50%', background:'#dc2626', flexShrink:0 }} />
                    )}
                  </div>
                  <p style={{ margin:0, fontSize:11, color:'var(--ink-soft)', lineHeight:1.5 }}>
                    {alert.message || alert.description || 'No details'}
                  </p>
                  <div style={{ display:'flex', gap:16, marginTop:6, fontSize:10, color:'var(--ink-soft)' }}>
                    <span>{getTimeAgo(alert.created_at || alert.timestamp)}</span>
                    {alert.fro_name && <span>FRO: {alert.fro_name}</span>}
                    {alert.donor_name && <span>Donor: {alert.donor_name}</span>}
                  </div>
                </div>
                {!alert.acknowledged && (
                  <button onClick={() => handleAcknowledge(alert.id)}
                    style={{ flexShrink:0, padding:'5px 12px', border:'1px solid var(--line)', borderRadius:6, background:'#fff', fontSize:10, fontWeight:600, fontFamily:'inherit', cursor:'pointer' }}>
                    Acknowledge
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
