import { useState, useEffect } from 'react';
import { useHR } from '../store';

export default function Settings({ onClose }) {
  const { fetchSettings, updateSettings } = useHR();
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('19:00');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchSettings().then(s => {
      if (s.office_start_time) setStartTime(s.office_start_time);
      if (s.office_end_time) setEndTime(s.office_end_time);
    }).catch((err) => { console.error('Error:', err.message); });
  }, [fetchSettings]);

  const calcHours = (s, e) => {
    const [sh, sm] = s.split(':').map(Number);
    const [eh, em] = e.split(':').map(Number);
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins <= 0) return '0h 0m';
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  const handleSave = async () => {
    setBusy(true); setSaved(false);
    try {
      await updateSettings({ office_start_time: startTime, office_end_time: endTime });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) { alert(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <div className="card" style={{ padding: '24px 28px', marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 20 }}>Shift Timing</div>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 16 }}>
          These timings are used to calculate late minutes when workers punch in, and for notification reminders.
        </p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: 1, minWidth: 180 }}>
            Office Start Time
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
          </label>
          <label className="field" style={{ flex: 1, minWidth: 180 }}>
            Office End Time
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={busy}>
            {busy ? 'Saving...' : saved ? 'Saved!' : 'Save'}
          </button>
          <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
            Total hours: <strong>{calcHours(startTime, endTime)}</strong>
          </span>
        </div>
      </div>

      <div className="card" style={{ padding: '24px 28px' }}>
        <div className="card-title" style={{ marginBottom: 12 }}>Info</div>
        <ul style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.8, paddingLeft: 18 }}>
          <li>Late minutes are calculated from the office start time on punch-in.</li>
          <li>Workers have a grace period of <strong>180 minutes</strong> of late time per month.</li>
          <li>After 180 minutes: 0.5 day deduction. After 240 minutes: 1 day. After 480 minutes: proportional.</li>
          <li>Punch-in reminders are sent 20 minutes and 10 minutes before office start time.</li>
          <li>Punch-out reminders are sent 5 minutes and 10 minutes after office end time.</li>
        </ul>
      </div>
    </div>
  );
}
