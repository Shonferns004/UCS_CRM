import { useState, useEffect, useMemo } from 'react';
import { useHR } from '../store';
import { Dropdown } from './ui';
import { Plus, Trash } from '../icons';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export default function Holidays() {
  const { addHoliday, removeHoliday, fetchHolidays, fetchWorkers } = useHR();
  const [holidays, setHolidays] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [name, setName] = useState('');
  const [type, setType] = useState('holiday');
  const [recurring, setRecurring] = useState(true);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const today = new Date();
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchWorkers().then(data => { if (!cancelled) setWorkers(data); }).catch((err) => { console.error('API error:', err.message); });
    fetchHolidays().then(data => { if (!cancelled) setHolidays(data); }).catch((err) => { console.error('API error:', err.message); });
    return () => { cancelled = true; };
  }, []);

  const birthdays = useMemo(() => {
    const map = {};
    workers.forEach(w => {
      if (!w.dob) return;
      const d = new Date(w.dob + 'T00:00:00');
      const md = `${d.getMonth()}-${d.getDate()}`;
      if (!map[md]) map[md] = [];
      map[md].push(w.name);
    });
    return map;
  }, [workers]);

  const monthHolidays = useMemo(() => {
    return holidays.filter(h => {
      const d = new Date(h.date + 'T00:00:00');
      if (h.is_recurring) return d.getMonth() === calMonth;
      return d.getFullYear() === calYear && d.getMonth() === calMonth;
    });
  }, [holidays, calYear, calMonth]);

  const dayHolidays = useMemo(() => {
    const map = {};
    monthHolidays.forEach(h => {
      const d = new Date(h.date + 'T00:00:00');
      const day = d.getDate();
      if (!map[day]) map[day] = [];
      map[day].push(h);
    });
    return map;
  }, [monthHolidays]);

  const dayBirthdays = useMemo(() => {
    const map = {};
    Object.entries(birthdays).forEach(([md, names]) => {
      const [m, day] = md.split('-').map(Number);
      if (m === calMonth) map[day] = names;
    });
    return map;
  }, [birthdays, calMonth]);

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const prevMonth = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); };
  const nextMonth = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); };

  const handleDayClick = (d) => {
    setSelectedDay(d);
    setShowForm(false);
    setName('');
    setType('holiday');
    setRecurring(true);
  };

  const submit = async () => {
    if (!name.trim()) return;
    const m = String(calMonth + 1).padStart(2, '0');
    const day = String(selectedDay).padStart(2, '0');
    const date = `${calYear}-${m}-${day}`;
    await addHoliday({ name: name.trim(), date, is_recurring: recurring, type });
    setName('');
    setShowForm(false);
    fetchHolidays().then(setHolidays).catch((err) => { console.error('API error:', err.message); });
  };

  const isToday = (d) => calYear === today.getFullYear() && calMonth === today.getMonth() && d === today.getDate();

  const sideEvents = [
    ...(dayHolidays[selectedDay] || []).map(h => ({ ...h, kind: h.type === 'event' ? 'event' : 'holiday' })),
    ...(dayBirthdays[selectedDay] || []).map(n => ({ id: 'b-' + n, name: n, kind: 'birthday' })),
  ];

  return (
    <div className="hol-wrap">
      <div className="card hol-cal-card">
        <div className="card-head">
          <h3>{MONTHS[calMonth]} {calYear}</h3>
          <div className="hol-head-right">
            <span className="sub">{monthHolidays.length} {monthHolidays.length === 1 ? 'entry' : 'entries'}</span>
            <button className="btn btn-icon cal-nav" onClick={prevMonth}>&lsaquo;</button>
            <button className="btn btn-icon cal-nav" onClick={nextMonth}>&rsaquo;</button>
          </div>
        </div>
        <div className="cal-grid">
          {DAYS.map(d => <div key={d} className="cal-dow">{d}</div>)}
          {cells.map((d, i) => (
            <div
              key={i}
              className={`cal-cell ${d === null ? 'cal-empty' : ''} ${isToday(d) ? 'cal-today' : ''} ${selectedDay === d ? 'cal-selected' : ''}`}
              onClick={() => d !== null && handleDayClick(d)}
            >
              {d !== null && (
                <>
                  <div className="cal-day-num">{d}</div>
                  <div className="cal-dots">
                    {(dayHolidays[d] || []).map(h => (
                      <span key={h.id} className={`cal-dot ${h.type === 'event' ? 'cal-dot-event' : 'cal-dot-holiday'}`} title={h.name} />
                    ))}
                    {(dayBirthdays[d] || []).map((_, i) => (
                      <span key={`b-${i}`} className="cal-dot cal-dot-bday" title="Birthday" />
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="card hol-side">
        <div className="card-head">
          <h3>{selectedDay} {MONTHS[calMonth]}</h3>
        </div>
        <div className="card-pad hol-side-body">
          {sideEvents.length > 0 && (
            <div className="hol-side-events">
              {sideEvents.map(e => (
                <div key={e.id} className={`cal-side-item ${e.kind === 'birthday' ? 'cal-side-bday' : e.kind === 'event' ? 'cal-side-event' : ''}`}>
                  <div className="hol-side-text">
                    <div className="hol-side-name">
                      {e.kind === 'birthday' && '\uD83C\uDF82 '}
                      {e.is_recurring && <span className="hol-rec-icon">↻</span>}
                      {e.name}
                    </div>
                    <div className="hol-side-badges">
                      {e.kind === 'holiday' && <span className="badge badge-present">Holiday</span>}
                      {e.kind === 'event' && <span className="badge badge-leave">Event</span>}
                      {e.kind === 'birthday' && <span className="badge bday-badge">Birthday</span>}
                    </div>
                  </div>
                  {e.kind !== 'birthday' && (
                    <button className="btn btn-icon" onClick={() => setConfirmDelete(e)} title="Remove">
                      <Trash width={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {!showForm ? (
            <button className="btn btn-primary hol-add-trigger" onClick={() => { setShowForm(true); setName(''); setType('holiday'); setRecurring(true); }}>
              <Plus width={16} /> Add
            </button>
          ) : (
            <div className={`hol-add-form ${sideEvents.length > 0 ? 'hol-add-bordered' : ''}`}>
              <label className="field hol-field">Occasion
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Diwali" onKeyDown={e => e.key === 'Enter' && submit()} autoFocus />
              </label>
              <div className="form-row" style={{ gap: 8 }}>
                <label className="field" style={{ flex: 1 }}>Type
                  <Dropdown value={type} onChange={e => setType(e.target.value)}
                    options={[{value:'holiday',label:'Holiday'},{value:'event',label:'Event'}]} />
                </label>
                <label className="toggle-wrap">
                  <span className="toggle-lbl">Recurring</span>
                  <span className={`toggle ${recurring ? 'on' : ''}`} onClick={() => setRecurring(r => !r)}>
                    <span className="toggle-knob" />
                  </span>
                </label>
              </div>
              <div className="hol-btn-row">
                <button className="btn" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={submit}><Plus width={16} /> Save</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {confirmDelete && (
        <div onClick={() => setConfirmDelete(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1100, padding: '20px'
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#FFFFFF', width: '100%', maxWidth: '400px',
            borderRadius: '16px', boxShadow: '0 25px 60px rgba(0,0,0,0.15), 0 4px 20px rgba(0,0,0,0.08)',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '28px 28px 20px', textAlign: 'center' }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%', background: '#FEE2E2',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px'
              }}>
                <Trash width={22} />
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 700, color: '#111827' }}>
                Delete {confirmDelete.kind === 'event' ? 'Event' : 'Holiday'}?
              </h3>
              <p style={{ margin: 0, fontSize: '14px', color: '#6B7280', lineHeight: 1.5 }}>
                Are you sure you want to delete <strong style={{ color: '#111827' }}>"{confirmDelete.name}"</strong>? This action cannot be undone.
              </p>
            </div>
            <div style={{
              padding: '16px 28px 24px', display: 'flex', gap: '10px', justifyContent: 'center'
            }}>
              <button onClick={() => setConfirmDelete(null)} style={{
                padding: '10px 24px', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
                background: '#FFFFFF', color: '#111827', border: '1px solid #E5E7EB',
                cursor: 'pointer', flex: 1
              }}>Cancel</button>
              <button onClick={() => { removeHoliday(confirmDelete.id); setConfirmDelete(null); fetchHolidays().then(setHolidays).catch(() => {}); }} style={{
                padding: '10px 24px', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
                background: '#EF4444', color: '#FFFFFF', border: 'none',
                cursor: 'pointer', flex: 1
              }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
