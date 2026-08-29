import { useState } from 'react';
import { toast } from '../../components/Toast';
import { addSimCard, updateSimCard, replaceSimCard } from './api';
import { SIM_STATUSES, SIM_SLOTS, FORM_FIELDS, daysLeft, todayStr, effectiveStatus, dayLabel, dayClass, formatDate, pillForStatus } from './helpers';

function Field({ label, value, onChange, type = 'text', disabled, placeholder }) {
  return (
    <div className="form-row">
      <label>{label}</label>
      <input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder={placeholder} />
    </div>
  );
}

function computeDl(expiry) {
  return expiry ? daysLeft(expiry) : null;
}

export function SimFormModal({ open, onClose, card, onSaved }) {
  const [form, setForm] = useState(() =>
    Object.fromEntries(FORM_FIELDS.map((f) => [f.key, card?.[f.key] || '']))
  );
  const [extra, setExtra] = useState({
    team: card?.team || '',
    signature: card?.signature || '',
    issue_date: card?.issue_date || '',
    expiry_date: card?.expiry_date || '',
    status: card?.status || 'Active',
  });
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const set = (key, val) => setForm((p) => ({ ...p, [key]: val }));
  const setE = (key, val) => setExtra((p) => ({ ...p, [key]: val }));

  const dl = computeDl(extra.expiry_date);

  async function handleSave() {
    if (!form.mobile_id || !form.device_model || !form.imei || !extra.issue_date || !extra.expiry_date) {
      toast('Please fill required fields (Mobile ID, Device, IMEI, Issue Date, Expiry Date)', 'error');
      return;
    }
    setSaving(true);
    const payload = {
      ...form,
      team: extra.team,
      signature: extra.signature,
      issue_date: extra.issue_date,
      expiry_date: extra.expiry_date,
      status: extra.status,
    };
    try {
      if (card) {
        await updateSimCard(card.id, payload);
        toast('SIM card updated', 'success');
      } else {
        await addSimCard(payload);
        toast('SIM card added', 'success');
      }
      onSaved();
      onClose();
    } catch (e) {
      toast(e.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h3>{card ? 'Edit SIM Card' : 'Add SIM Card'}</h3>
          <button className="modal-x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <Field label="Mobile ID No. *" value={form.mobile_id} onChange={(v) => set('mobile_id', v)} />
            <Field label="Device & Model Name *" value={form.device_model} onChange={(v) => set('device_model', v)} />
            <Field label="IMEI No. *" value={form.imei} onChange={(v) => set('imei', v)} />
            <Field label="Team" value={extra.team} onChange={(v) => setE('team', v)} />
            <Field label="Signature" value={extra.signature} onChange={(v) => setE('signature', v)} />
            <Field label="SIM Card Issue Date *" type="date" value={extra.issue_date} onChange={(v) => setE('issue_date', v)} />
            <Field label="Auto Expiry Date *" type="date" value={extra.expiry_date} onChange={(v) => setE('expiry_date', v)} />
            <div className="form-row">
              <label>SIM Card Status</label>
              <select value={extra.status} onChange={(e) => setE('status', e.target.value)}>
                {SIM_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-row locked full">
              <label>SIM Expiry Days Left (auto-calculated)</label>
              <input value={dl === null ? '—' : `${dl} days`} disabled />
            </div>
          </div>

          <div className="section-title" style={{ margin: '18px 0 10px', fontSize: 13 }}>SIM Details</div>
          <div className="form-grid">
            {SIM_SLOTS.map((n) => (
              <Field key={n} label={`SIM ${n}`} value={form[`sim_${n}`]} onChange={(v) => set(`sim_${n}`, v)} />
            ))}
          </div>
        </div>
        <div className="modal-foot">
          <button className="sim-btn" onClick={onClose}>Cancel</button>
          <button className="sim-btn primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : card ? 'Save Changes' : 'Save SIM Card'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SimViewModal({ card, open, onClose, onEdit, onReplace }) {
  if (!open || !card) return null;
  const dl = card.days_left !== undefined && card.days_left !== null ? card.days_left : daysLeft(card.expiry_date);
  const status = effectiveStatus(card);
  const Item = ({ k, v }) => (
    <div className="detail-item">
      <div className="k">{k}</div>
      <div className="v">{v || '—'}</div>
    </div>
  );
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal drawer" style={{ borderRadius: 14, marginLeft: 'auto', marginRight: 0 }}>
        <div className="modal-head">
          <h3>SIM Card Details</h3>
          <button className="modal-x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="detail-sections">
            <div className="detail-sec">
              <h4>SIM Information</h4>
              <div className="detail-grid">
                <Item k="Mobile ID" v={card.mobile_id} />
                <div className="detail-item"><div className="k">SIM Status</div><div className="v"><span className={`pill ${pillForStatus(status)}`}>{status}</span></div></div>
                <Item k="Issue Date" v={formatDate(card.issue_date)} />
                <Item k="Expiry Date" v={formatDate(card.expiry_date)} />
                <div className="detail-item"><div className="k">Days Left</div><div className={`v ${dl !== null ? dayClass(dl) : ''}`}>{dayLabel(dl)}</div></div>
                <Item k="Replacement Count" v={card.replacement_count} />
              </div>
            </div>
            <div className="detail-sec">
              <h4>Device Information</h4>
              <div className="detail-grid">
                <Item k="Device & Model" v={card.device_model} />
                <Item k="IMEI" v={card.imei} />
                <Item k="Team" v={card.team} />
                <Item k="Signature" v={card.signature} />
              </div>
            </div>
            <div className="detail-sec">
              <h4>SIM Details</h4>
              <div className="detail-grid">
                {SIM_SLOTS.map((n) => <Item key={n} k={`SIM ${n}`} v={card[`sim_${n}`]} />)}
              </div>
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="sim-btn" onClick={() => { onClose(); onReplace(); }}>Replace</button>
          <button className="sim-btn" onClick={() => { onClose(); onEdit(); }}>Edit</button>
          <button className="sim-btn primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export function ReplaceModal({ card, open, onClose, onDone }) {
  const [form, setForm] = useState({ new_sim: '', replacement_date: todayStr(), reason: '', new_expiry_date: '' });
  const [saving, setSaving] = useState(false);
  if (!open || !card) return null;
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  async function handleReplace() {
    if (!form.new_sim) {
      toast('New SIM number is required', 'error');
      return;
    }
    setSaving(true);
    try {
      await replaceSimCard(card.id, form);
      toast('SIM card replaced', 'success');
      onDone();
      onClose();
    } catch (e) {
      toast(e.message || 'Replacement failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  const Item = ({ k, v }) => (
    <div className="detail-item"><div className="k">{k}</div><div className="v">{v || '—'}</div></div>
  );

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h3>Replace SIM Card</h3>
          <button className="modal-x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="detail-sec" style={{ marginBottom: 18 }}>
            <h4>Current SIM</h4>
            <div className="detail-grid">
              <Item k="Mobile ID" v={card.mobile_id} />
              <Item k="Device" v={card.device_model} />
              <Item k="Current Status" v={card.status} />
              <Item k="Current Issue Date" v={formatDate(card.issue_date)} />
              <div className="detail-item"><div className="k">Current Expiry Date</div><div className="v">{formatDate(card.expiry_date)}</div></div>
              <Item k="Replacement Count" v={card.replacement_count} />
            </div>
          </div>
          <div className="form-grid">
            <Field label="New SIM Number *" value={form.new_sim} onChange={(v) => set('new_sim', v)} />
            <Field label="Replacement Date" type="date" value={form.replacement_date} onChange={(v) => set('replacement_date', v)} />
            <Field label="New Expiry Date" type="date" value={form.new_expiry_date} onChange={(v) => set('new_expiry_date', v)} />
            <div className="form-row full">
              <label>Reason</label>
              <textarea rows={2} value={form.reason} onChange={(e) => set('reason', e.target.value)} style={{ fontFamily: 'inherit', fontSize: 13, padding: '9px 11px', border: '1px solid var(--sim-line)', borderRadius: 8, outline: 'none' }} />
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="sim-btn" onClick={onClose}>Cancel</button>
          <button className="sim-btn primary" onClick={handleReplace} disabled={saving}>{saving ? 'Replacing...' : 'Replace SIM'}</button>
        </div>
      </div>
    </div>
  );
}
