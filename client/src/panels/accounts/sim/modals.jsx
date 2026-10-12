import { useState, useEffect } from 'react';
import { toast } from '../../../components/Toast';
import { addSimCard, updateSimCard, replaceSimCard, fetchSimHistory, fetchBrandSimHistory, fetchReplacementsForCard } from './api';
import { Icon } from './components';
import { useSim } from './store';
import { AssignSimModal } from './SimInventory';
import { SIM_STATUSES, SIM_TYPES, SIM_SLOTS, MAX_SIM_SLOTS, FORM_FIELDS, daysLeft, todayStr, mobileExpiryStatus, sameMobileId, dayLabel, dayClass, formatDate, pillForStatus, SIM_BRAND_FILTERS, simBrandOf, numberHistoryEntries, groupEntriesByBrand, filterEntriesByRange, historyRangeFrom, HISTORY_PERIODS, liveDaysLeft, classifySims } from './helpers';

function Field({ label, value, onChange, type = 'text', disabled, placeholder, full, required }) {
  return (
    <div className={`form-row${full ? ' full' : ''}`}>
      <label>
        {label}
        {required ? <span className="req">*</span> : null}
      </label>
      <input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder={placeholder} />
    </div>
  );
}

function Select({ label, value, onChange, options, placeholder, full }) {
  return (
    <div className={`form-row${full ? ' full' : ''}`}>
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  );
}

function Group({ title, icon, hint, grid, count, children }) {
  return (
    <section className="se-sec">
      <div className="se-sec-head">
        <span className="se-sec-ic">{icon}</span>
        <div className="se-sec-txt">
          <h4>{title}</h4>
          {hint ? <p>{hint}</p> : null}
        </div>
        {count ? <span className="se-sec-count">{count}</span> : null}
      </div>
      <div className={grid ? 'se-sec-body se-form-grid' : 'se-sec-body'}>{children}</div>
    </section>
  );
}

function computeDl(expiry) {
  return expiry ? daysLeft(expiry) : null;
}

function raw(v) {
  return v === null || v === undefined || String(v).trim() === '' ? null : String(v);
}

function txt(v) {
  const s = raw(v);
  return s === null ? '\u2014' : s;
}

export function SimFormModal({ open, onClose, card, inventory = [], onSaved }) {
  /* The plan window (Issue / Auto Expiry / Days Left) and the SIM Numbers list
     describe the SIMs the phone is carrying right now, not the card's oldest
     slot. A number handed over by the Locker (or one that has expired out of an
     old slot) is what the drawer's Active list shows, so this form reads from
     the same source instead of the stale card slots. */
  const activeSims = card ? classifySims({ card, inventory }).active : [];
  const activeSim = activeSims[0] || null;

  const [form, setForm] = useState(() =>
    Object.fromEntries(FORM_FIELDS.map((f) => [f.key, card?.[f.key] || '']))
  );
  const [extra, setExtra] = useState({
    team: card?.team || '',
    owner: card?.owner || '',
    signature: card?.signature || '',
    ngo: card?.w1_name || card?.ngo || '',
    sim_type: card?.sim_type || '',
    gb: card?.gb || '',
    issue_date: (activeSim?.activatedOn ? String(activeSim.activatedOn).slice(0, 10) : '') || card?.issue_date || '',
    expiry_date: (activeSim?.expiresOn ? String(activeSim.expiresOn).slice(0, 10) : '') || card?.expiry_date || '',
    status: card?.status || 'Active',
  });
  const [simList, setSimList] = useState(() => {
    /* Current active numbers first (card slots + Locker), so the list matches
       the Active SIMs the phone shows; fall back to the raw card slots only
       when the phone carries no live number at all. */
    const current = activeSims.map((a) => String(a.number).trim()).filter(Boolean);
    if (current.length) return current;
    const existing = [];
    for (let i = 1; i <= MAX_SIM_SLOTS; i++) {
      const val = card?.[`sim_${i}`];
      if (val && String(val).trim()) existing.push(val);
    }
    return existing;
  });
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    let active = true;
    if (open && card) {
      fetchSimHistory(card.id)
        .then((h) => { if (active && Array.isArray(h)) setHistory(h); })
        .catch(() => { if (active) setHistory([]); });
    } else if (!open) {
      setHistory([]);
    }
    return () => { active = false; };
  }, [open, card]);

  if (!open) return null;

  const set = (key, val) => setForm((p) => ({ ...p, [key]: val }));
  const setE = (key, val) => setExtra((p) => ({ ...p, [key]: val }));

  const dl = computeDl(extra.expiry_date);

  function addSimField() { if (simList.length < MAX_SIM_SLOTS) setSimList((p) => [...p, '']); }
  function removeSimField(idx) { setSimList((p) => p.filter((_, i) => i !== idx)); }
  function setSimVal(idx, val) { setSimList((p) => p.map((v, i) => i === idx ? val : v)); }

  async function handleSave() {
    if (!form.mobile_id || !String(form.mobile_id).trim()) {
      toast('Please fill Mobile ID No.', 'error');
      return;
    }
    setSaving(true);
    const simFields = {};
    simList.filter((v) => v && String(v).trim()).forEach((v, i) => { simFields[`sim_${i + 1}`] = v; });
    for (let i = simList.filter((v) => v && String(v).trim()).length + 1; i <= MAX_SIM_SLOTS; i++) { simFields[`sim_${i}`] = null; }
    const payload = {
      ...form,
      ...simFields,
      team: extra.team,
      owner: extra.owner,
      signature: extra.signature,
      ngo: extra.ngo,
      w1_name: extra.ngo,
      sim_type: extra.sim_type || null,
      gb: extra.gb || null,
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
      if (card) {
        try {
          const h = await fetchSimHistory(card.id);
          if (Array.isArray(h)) setHistory(h);
        } catch { /* keep current history */ }
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
    <div className="modal-overlay sim-edit-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal sim-edit-modal">
        <div className="se-head">
          <div className="se-head-main">
            <span className="se-avatar"><Icon name={card ? 'settings' : 'simcard'} size={18} /></span>
            <div className="se-head-txt">
              <h3>{card ? 'Edit SIM Card' : 'Add SIM Card'}</h3>
              <div className="se-head-sub">
                {card ? (
                  <>
                    <span className="se-head-id">{txt(card.mobile_id)}</span>
                    {raw(card.device_model) ? <><i className="se-dot" /><span className="se-head-model">{card.device_model}</span></> : null}
                  </>
                ) : (
                  'Fill in the card details below'
                )}
              </div>
            </div>
          </div>
          <button className="modal-x" onClick={onClose} aria-label="Close"><Icon name="close" size={17} /></button>
        </div>

        <div className="modal-body se-body">
          <Group title="Device Identification" icon={<Icon name="mobile" size={14} />} hint="How this SIM card is identified in the system" grid>
            <Field label="Mobile ID No." value={form.mobile_id} onChange={(v) => set('mobile_id', v)} placeholder="e.g. Android 1" required />
            <Field label="Device & Model Name" value={form.device_model} onChange={(v) => set('device_model', v)} placeholder="e.g. M2006C3LI" />
            <Field label="IMEI No." value={form.imei} onChange={(v) => set('imei', v)} placeholder="15-digit IMEI" />
            <Field label="GB" value={extra.gb} onChange={(v) => setE('gb', v)} placeholder="e.g. 64 GB" />
          </Group>

          <Group title="Assignment" icon={<Icon name="report" size={14} />} hint="Who this card is issued to" grid>
            <Field label="Team" value={extra.team} onChange={(v) => setE('team', v)} />
            <Field label="Owner" value={extra.owner} onChange={(v) => setE('owner', v)} />
            <Field label="NGO" value={extra.ngo} onChange={(v) => setE('ngo', v)} />
            <Field label="Remark" value={extra.signature} onChange={(v) => setE('signature', v)} />
          </Group>

          <Group title="SIM Configuration" icon={<Icon name="sim" size={14} />} hint="Plan type, validity window and current status" grid>
            <Select label="SIM Type" value={extra.sim_type} onChange={(v) => setE('sim_type', v)} options={SIM_TYPES} placeholder="Select SIM Type" />
            <Select label="SIM Card Status" value={extra.status} onChange={(v) => setE('status', v)} options={SIM_STATUSES} />
            <Field label="SIM Card Issue Date" type="date" value={extra.issue_date} onChange={(v) => setE('issue_date', v)} />
            <Field label="Auto Expiry Date" type="date" value={extra.expiry_date} onChange={(v) => setE('expiry_date', v)} />
            <div className="form-row locked full">
              <label>SIM Expiry Days Left <span className="auto-tag">auto</span></label>
              <input value={dl === null ? '\u2014' : `${dl} days`} disabled readOnly />
            </div>
          </Group>

          <Group
            title="SIM Numbers"
            icon={<Icon name="simcard" size={14} />}
            hint={`${simList.filter((v) => v && String(v).trim()).length} of ${MAX_SIM_SLOTS} slots filled`}
          >
            <div className="se-slots">
              {simList.map((val, idx) => (
                <div className="se-slot" key={idx}>
                  <span className="se-slot-idx">{idx + 1}</span>
                  <input value={val} onChange={(e) => setSimVal(idx, e.target.value)} placeholder={`SIM ${idx + 1} number`} />
                  {simList.length > 1 && (
                    <button type="button" className="se-slot-x" onClick={() => removeSimField(idx)} aria-label={`Remove SIM ${idx + 1}`}>
                      <Icon name="trash" size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {simList.length < MAX_SIM_SLOTS && (
              <button type="button" className="sim-btn se-add-sim" onClick={addSimField}>
                <Icon name="sim" size={14} /> Add SIM Slot
              </button>
            )}
          </Group>

          {card && (
            <section className="se-sec">
              <div className="se-sec-head">
                <span className="se-sec-ic"><Icon name="history" size={14} /></span>
                <div className="se-sec-txt">
                  <h4>Change History</h4>
                  <p>Every saved edit to this card, newest first</p>
                </div>
                {history.length > 0 && <span className="se-sec-count">{history.length}</span>}
              </div>
              <div className="se-sec-body">
                {history.length === 0 ? (
                  <div className="se-empty">
                    <Icon name="history" size={18} />
                    <span>No previous changes saved for this card.</span>
                  </div>
                ) : (
                  <div className="se-tl-scroll">
                    <div className="se-timeline">
                      {history.map((h) => {
                        const cols = h.changed_cols && typeof h.changed_cols === 'object' ? Object.entries(h.changed_cols) : [];
                        return (
                          <div className="se-tl-item" key={h.id}>
                            <span className="se-tl-dot" />
                            <div className="se-tl-card">
                              <div className="se-tl-head">
                                <span className="se-tl-time">{formatDateTime(h.changed_at)}</span>
                                {h.changed_by ? <span className="se-tl-by">by {h.changed_by}</span> : null}
                              </div>
                              {cols.length === 0 ? (
                                <div className="se-tl-none">Data updated</div>
                              ) : (
                                <div className="se-tl-rows">
                                  {cols.map(([field, v]) => {
                                    const name = field.replace(/^sim_(\d+)$/, 'SIM $1').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
                                    const oldE = v.old === null || v.old === undefined || v.old === '';
                                    const newE = v.new === null || v.new === undefined || v.new === '';
                                    return (
                                      <div className="se-tl-row" key={field}>
                                        <span className="se-tl-field">{name}</span>
                                        {oldE && !newE ? (
                                          <span className="se-delta add">+ {String(v.new)}</span>
                                        ) : !oldE && newE ? (
                                          <span className="se-delta del">&minus; {String(v.old)}</span>
                                        ) : (
                                          <span className="se-delta">
                                            <s>{String(v.old)}</s>
                                            <em>&rarr;</em>
                                            <b className="new">{String(v.new)}</b>
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>

        <div className="modal-foot se-foot">
          <span className="se-foot-hint">
            {card ? 'Changes are recorded in Change History on save.' : 'Mobile ID No. is required to save.'}
          </span>
          <div className="se-foot-btns">
            <button className="sim-btn" onClick={onClose}>Cancel</button>
            <button className="sim-btn primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : card ? 'Save Changes' : 'Save SIM Card'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* One Active / Expired SIM table inside the modal. Every row shows the
   number with the date it was activated and the date it expires or ended;
   `expired` only switches the last column to "days ago" wording. */
function SimListSection({ title, icon, count, tone, rows, showNgo, expiresLabel, expired, empty }) {
  return (
    <section className="sv-sec">
      <div className="sv-sec-head">
        <span className="sv-sec-ic">{icon}</span>
        <h4>{title}</h4>
        <span className={`sv-sec-count${tone ? ` ${tone}` : ''}`}>{count}</span>
      </div>
      {rows.length === 0 ? (
        <div className="sv-empty">{empty}</div>
      ) : (
        <div className="sv-table-wrap">
          <table className="sv-simtable">
            <thead>
              <tr>
                <th>Slot</th>
                <th>Number</th>
                {showNgo ? <th>NGO</th> : null}
                <th>Activated</th>
                <th>{expiresLabel}</th>
                <th className="num">{expired ? 'Ended' : 'Days Left'}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="c-slot">{r.slot ? `SIM ${r.slot}` : '—'}</td>
                  <td className="c-num">{r.number}</td>
                  {showNgo ? <td className="c-ngo">{r.ngo || '—'}</td> : null}
                  <td>{formatDate(r.activatedOn)}</td>
                  <td className="c-exp">
                    {formatDate(r.expiresOn)}
                    {r.note ? <span className="sv-note">{r.note}</span> : null}
                  </td>
                  <td className={`num days-cell ${r.daysLeft === null ? 'days-neutral' : dayClass(r.daysLeft)}`}>
                    {expired
                      ? (r.daysLeft === null ? '—' : r.daysLeft < 0 ? `${Math.abs(r.daysLeft)} days ago` : dayLabel(r.daysLeft))
                      : (r.daysLeft === null ? 'No expiry' : dayLabel(r.daysLeft))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function SimViewModal({ card, open, onClose, onEdit, onReplace }) {
  /* The Locker list is the store's, refreshed on every open: it owns the
     per-number dates and the "does this phone still carry a live SIM" verdict.
     A snapshot taken before the last assignment would keep calling the old SIM
     expired (or miss the new one entirely) until a full page reload. */
  const { inventory, refreshInventory } = useSim();
  const [replacements, setReplacements] = useState([]);
  const [changes, setChanges] = useState([]);
  const [loadingDates, setLoadingDates] = useState(false);

  const cardId = card ? card.id : null;

  // Both audit trails are read unconditionally: replacement_count is not
  // trustworthy (imports wipe it) and the Expired list has to show every past
  // SIM, whichever trail recorded it.
  useEffect(() => {
    if (!open || !cardId) return undefined;
    let alive = true;
    setReplacements([]);
    setChanges([]);
    setLoadingDates(true);
    const trail = (request) => request.then((r) => (Array.isArray(r) ? r : [])).catch(() => []);
    Promise.all([
      Promise.resolve(refreshInventory()).catch(() => {}),
      trail(fetchReplacementsForCard(cardId)),
      trail(fetchSimHistory(cardId)),
    ])
      .then(([, reps, hist]) => {
        if (!alive) return;
        setReplacements(reps);
        setChanges(hist);
      })
      .finally(() => { if (alive) setLoadingDates(false); });
    return () => { alive = false; };
  }, [open, cardId]);

  if (!open || !card) return null;

  /* "Assigned" lives in the Locker table (sim_inventory), not in this card's
     own status word, so the drawer joins on mobile_id exactly like the All
     SIM Cards table does - otherwise the row said "Assigned" while the drawer
     opened from it still said "Active". */
  const lockerItem = (inventory || []).find((it) => sameMobileId(it.mobile_id, card.mobile_id)) || null;
  const expiryStatus = mobileExpiryStatus(card, inventory);
  const groups = classifySims({ card, inventory, replacements, history: changes });
  /* The Issued / Expires / Days Left strip describes the SIM the phone carries
     right now. The card's own issue/expiry dates belong to its oldest number
     and go stale the moment a newer SIM is issued - the phone read "Expired"
     while its Active list showed a number with weeks left. The current active
     SIM's own dates win whenever there is one; the stale card-level dates are
     only the fallback for a phone with no active number at all. */
  const primaryActive = groups.active[0] || null;
  const dl = primaryActive && primaryActive.daysLeft !== null && primaryActive.daysLeft !== undefined
    ? primaryActive.daysLeft
    : liveDaysLeft(card);
  const heroIssuedOn = primaryActive?.activatedOn || card.issue_date;
  const heroExpiresOn = primaryActive?.expiresOn || card.expiry_date;
  const showNgo = groups.active.some((r) => r.ngo) || groups.expired.some((r) => r.ngo);
  /* Only SIM-number history: updates to a SIM slot's number (old → new) and the
     numbers that have expired. Generic field edits (team, owner, dates, …) are
     deliberately left out of this trail. */
  const updatedSimRows = historyRows(changes).filter((r) => /^SIM \d+$/.test(r.field));
  const shownOld = new Set(updatedSimRows.map((r) => String(r.old).toLowerCase()));
  /* A replaced SIM left the slot through the replacement log, which records the
     number it was swapped for. classifySims keeps only the old number, so the
     "New Value" column would otherwise be blank even though the Active list
     already shows the incoming number. */
  const replacedBy = new Map();
  for (const r of replacements) {
    const oldK = raw(r?.old_sim);
    const newV = raw(r?.new_sim);
    if (oldK && newV) replacedBy.set(oldK.toLowerCase(), newV);
  }
  /* When the replacement log has no matching row, an expired slot is the phone's
     old number with nothing recorded as its successor - yet the Active list
     plainly shows the one number the phone carries now. Fall back to that sole
     active number so the "New Value" is never a blank dash next to it. */
  const activeNumbers = groups.active.map((a) => String(a.number).trim()).filter(Boolean);
  const soleActive = activeNumbers.length === 1 ? activeNumbers[0] : '';
  const expiredSimRows = groups.expired
    .filter((e) => !shownOld.has(String(e.number).toLowerCase()))
    .map((e) => {
      const oldK = String(e.number).trim().toLowerCase();
      const next = replacedBy.get(oldK)
        || (soleActive && soleActive.toLowerCase() !== oldK ? soleActive : '');
      return {
        id: e.key,
        changed_at: e.expiresOn,
        field: e.slot ? `SIM ${e.slot}` : 'SIM Number',
        old: e.number,
        new: next || '—',
        action: next ? 'Updated' : 'Expired',
      };
    });
  const historyEntries = [...updatedSimRows, ...expiredSimRows].sort((a, b) => {
    const ta = a.changed_at ? new Date(a.changed_at).getTime() : 0;
    const tb = b.changed_at ? new Date(b.changed_at).getTime() : 0;
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });

  const totalSpan = (() => {
    if (!heroIssuedOn || !heroExpiresOn) return null;
    const a = new Date(`${String(heroIssuedOn).slice(0, 10)}T00:00:00`);
    const b = new Date(`${String(heroExpiresOn).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
    const total = Math.round((b - a) / 86400000);
    return total > 0 ? total : null;
  })();
  const pct = totalSpan && dl !== null ? Math.max(0, Math.min(100, Math.round((dl / totalSpan) * 100))) : null;

  return (
    <div className="modal-overlay sim-view-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal sim-view-modal">
        <div className="sv-head">
          <div className="sv-head-main">
            <span className="sv-avatar"><Icon name="simcard" size={20} /></span>
            <div className="sv-head-txt">
              <h3>SIM Card Details</h3>
              <div className="sv-head-sub">
                <span className="sv-head-id">{txt(card.mobile_id)}</span>
                {raw(card.device_model) ? <><i className="sv-dot" />{card.device_model}</> : null}
                {raw(card.team) ? <><i className="sv-dot" />{card.team}</> : null}
              </div>
            </div>
          </div>
          <div className="sv-head-right">
            {/* Two facts, both live: the phone carries a Locker SIM, and whether
                any SIM it carries is still valid. A phone whose numbers have all
                run out reads Expired, never Active. */}
            {lockerItem ? <span className="pill pill-assigned">Assigned</span> : null}
            <span className={`pill ${pillForStatus(expiryStatus)}`}>{expiryStatus}</span>
            <button className="sv-x" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
          </div>
        </div>

        <div className="modal-body sv-body">
          <div className="sv-hero">
            <div className="sv-hero-top">
              <div className="sv-hero-cell">
                <span className="sv-hero-k">Issued</span>
                <span className="sv-hero-v">{formatDate(heroIssuedOn)}</span>
              </div>
              <div className="sv-hero-sep" />
              <div className="sv-hero-cell">
                <span className="sv-hero-k">Expires</span>
                <span className="sv-hero-v">{formatDate(heroExpiresOn)}</span>
              </div>
              <div className="sv-hero-sep" />
              <div className="sv-hero-cell">
                <span className="sv-hero-k">Days Left</span>
                <span className={`sv-hero-v ${dl !== null ? dayClass(dl) : ''}`}>{dayLabel(dl)}</span>
              </div>
            </div>
            {pct !== null && (
              <div className="sv-meter">
                <div className="sv-meter-track">
                  <span className={`sv-meter-fill ${dayClass(dl)}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="sv-meter-txt">{pct}% of validity remaining</span>
              </div>
            )}
          </div>

          <div className="sv-chips">
            <span className="sv-chip chip-active">{groups.active.length} Active</span>
            <span className="sv-chip chip-expired">{groups.expired.length} Expired</span>
            <span className="sv-chip chip-meta">
              {loadingDates
                ? 'Loading dates…'
                : `${groups.filled} number${groups.filled === 1 ? '' : 's'} on this mobile`}
            </span>
          </div>

          <div className="sv-sections">
            <SimListSection
              title="Active SIMs"
              icon={<Icon name="sim" size={14} />}
              count={`${groups.active.length} active`}
              tone="tone-active"
              rows={groups.active}
              showNgo={showNgo}
              expiresLabel="Expires"
              expired={false}
              empty="No active SIM numbers on this mobile."
            />

            <section className="sv-sec">
              <div className="sv-sec-head">
                <span className="sv-sec-ic"><Icon name="history" size={14} /></span>
                <h4>SIM History</h4>
                {!loadingDates && historyEntries.length > 0 && (
                  <span className="sv-sec-count">{historyEntries.length} entr{historyEntries.length === 1 ? 'y' : 'ies'}</span>
                )}
              </div>
              {loadingDates ? (
                <div className="sv-empty">Loading history…</div>
              ) : historyEntries.length === 0 ? (
                <div className="sv-empty">No SIM history recorded for this mobile.</div>
              ) : (
                <div className="se-log-wrap">
                  <table className="se-log">
                    <thead>
                      <tr>
                        <th className="c-when">Date &amp; Time</th>
                        <th className="c-field">Field Changed</th>
                        <th className="c-old">Old Value</th>
                        <th className="c-new">New Value</th>
                        <th className="c-act">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyEntries.map((r, idx) => (
                        <tr key={`${r.id}-${idx}`}>
                          <td className="c-when">{formatDateTime(r.changed_at)}</td>
                          <td className="c-field">{r.field}</td>
                          <td className="c-old"><s>{r.old}</s></td>
                          <td className="c-new">{r.new}</td>
                          <td className="c-act">
                            <span className={`se-act ${r.action.toLowerCase()}`}>{r.action}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

          </div>
        </div>

        <div className="modal-foot sv-foot">
          <span className="sv-foot-note">Record ID {txt(card.id)}</span>
          <div className="sv-foot-btns">
            <button className="sim-btn" onClick={() => { onClose(); onReplace(); }}>
              <Icon name="replace" size={15} /> Replace
            </button>
            <button className="sim-btn" onClick={() => { onClose(); onEdit(); }}>
              <Icon name="settings" size={15} /> Edit
            </button>
            <button className="sim-btn primary" onClick={onClose}>Close</button>
          </div>
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

const HISTORY_FIELD_LABELS = {
  mobile_id: 'Mobile ID No.',
  device_model: 'Device & Model Name',
  gb: 'GB',
  imei: 'IMEI No.',
  team: 'Team',
  owner: 'Owner',
  signature: 'Remark',
  ngo: 'NGO',
  sim_type: 'SIM Type',
  issue_date: 'SIM Card Issue Date',
  expiry_date: 'Auto Expiry Date',
  status: 'SIM Card Status',
  replacement_count: 'Sim Card Repla. Count',
};

function historyFieldLabel(key) {
  if (HISTORY_FIELD_LABELS[key]) return HISTORY_FIELD_LABELS[key];
  if (/^sim_\d+$/.test(key)) return `SIM ${key.slice(4)}`;
  return key.replace(/_/g, ' ');
}

function historyAction(oldV, newV) {
  const oldEmpty = oldV === null || oldV === undefined || String(oldV).trim() === '';
  const newEmpty = newV === null || newV === undefined || String(newV).trim() === '';
  if (oldEmpty && !newEmpty) return 'Added';
  if (!oldEmpty && newEmpty) return 'Removed';
  return 'Updated';
}

function displayValue(v) {
  if (v === null || v === undefined || v === '') return 'Blank';
  return String(v);
}

function formatDateTime(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  const pad = (n) => String(n).padStart(2, '0');
  const day = pad(dt.getDate());
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mon = months[dt.getMonth()];
  const year = dt.getFullYear();
  let h = dt.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  return `${day}-${mon}-${year} ${pad(h)}:${pad(dt.getMinutes())} ${ampm}`;
}

function historyRows(list) {
  const rows = [];
  for (const h of list || []) {
    const cols = h.changed_cols && typeof h.changed_cols === 'object' ? h.changed_cols : {};
    const entries = Object.entries(cols);
    if (entries.length === 0) {
      rows.push({ id: h.id, changed_at: h.changed_at, mobile_id: h.mobile_id, field: '—', old: '—', new: '—', action: '—' });
      continue;
    }
    for (const [k, ch] of entries) {
      const oldV = ch && typeof ch === 'object' ? ch.old : ch;
      const newV = ch && typeof ch === 'object' ? ch.new : ch;
      rows.push({
        id: h.id,
        changed_at: h.changed_at,
        mobile_id: h.mobile_id,
        field: historyFieldLabel(k),
        old: displayValue(oldV),
        new: displayValue(newV),
        action: historyAction(oldV, newV),
      });
    }
  }
  return rows;
}

const BRAND_API = { All: 'all', Nokia: 'nokia', Android: 'android' };

const BRAND_HISTORY_CAP = 5000;

const BRAND_FALLBACK_CONCURRENCY = 8;

// The bulk endpoint (GET /sim-cards/history/all) only exists once the backend is
// restarted/redeployed. Until then the API answers 404 and the feature would
// look broken, so fall back to reading each card's own history - an endpoint
// every backend already has - and stitch the rows together here. Concurrency is
// capped so a few hundred cards cannot fire hundreds of requests at once.
async function fetchBrandHistoryViaCards(brand, from, cards) {
  const wanted = (cards || []).filter((c) => {
    const mobileId = String(c.mobile_id || '');
    if (/^android whatsapp/i.test(mobileId)) return false;
    if (brand === 'all') return true;
    // simBrandOf returns the UI label ('Nokia'); `brand` is the API value
    // ('nokia'), so compare case-insensitively.
    return simBrandOf(mobileId).toLowerCase() === brand;
  });

  const collected = [];
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= wanted.length) return;
      const card = wanted[i];
      try {
        const res = await fetchSimHistory(card.id);
        const list = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : []);
        for (const row of list) {
          // The per-card endpoint returns no card info, so attach it here for
          // the same table the bulk endpoint feeds.
          collected.push({
            ...row,
            sim_cards: { mobile_id: card.mobile_id || '', device_model: card.device_model || '' },
          });
        }
      } catch { /* one unreadable card must not sink the whole log */ }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(BRAND_FALLBACK_CONCURRENCY, wanted.length)) }, worker));

  let rows = collected;
  if (from) {
    const cutoff = new Date(`${from}T00:00:00`).getTime();
    if (Number.isFinite(cutoff)) {
      rows = rows.filter((r) => {
        const t = new Date(r.changed_at).getTime();
        return !Number.isFinite(t) || t >= cutoff;
      });
    }
  }
  rows.sort((a, b) => {
    const ta = new Date(a.changed_at).getTime();
    const tb = new Date(b.changed_at).getTime();
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });
  return rows.slice(0, BRAND_HISTORY_CAP);
}

// A dead session is the one failure a fallback cannot paper over, and fanning
// out would just repeat it once per card.
function isAuthFailure(err) {
  const msg = err && err.message ? String(err.message) : '';
  return /no token|token provided|session|unauthor|log ?in|login/i.test(msg);
}

// Brand-wide number history, opened from the SIM toolbar. Answers "which SIM
// number changed, and when" across every card of a brand in one request, with
// the entries bucketed by month. Deliberately separate from the per-card
// Change History inside the edit form, which is left untouched.
export function SimBrandHistoryModal({ open, onClose, initialBrand = 'All', onGoToLocker }) {
  const { cards: simCards, inventory, refreshInventory, assignInventoryItem } = useSim();
  // Sanitised at init, not in an effect: an effect runs after the first paint,
  // which would briefly title the modal with an unrecognised brand.
  const [brand, setBrand] = useState(() => (SIM_BRAND_FILTERS.includes(initialBrand) ? initialBrand : 'All'));
  const [range, setRange] = useState('all');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // The Locker block is a second job for this modal: hand a spare SIM to a phone
  // without leaving the history view. It reuses the same store data as the SIM
  // Locker page, so a SIM assigned here vanishes from the list straight away.
  const [lockerAssign, setLockerAssign] = useState(null);

  useEffect(() => {
    if (open) setBrand(SIM_BRAND_FILTERS.includes(initialBrand) ? initialBrand : 'All');
  }, [open, initialBrand]);

  // The Locker list is only needed while the modal is open, so it is pulled once
  // on open. The dep list is deliberately just `open`: refreshInventory is a new
  // function on every store render and setInventory always stores a fresh array,
  // so depending on it here would refetch the locker in a loop.
  useEffect(() => {
    if (!open) return;
    refreshInventory(); /* eslint-disable-next-line */
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    setLoading(true);
    setError('');
    // The whole history for this brand is fetched once; the period chips then
    // narrow it in memory. Asking the server for a windowed slice instead would
    // make the chips unable to state the true full-history span.
    fetchBrandSimHistory({ brand: BRAND_API[brand] })
      .catch((e) => {
        if (isAuthFailure(e)) throw e;
        return fetchBrandHistoryViaCards(BRAND_API[brand], null, simCards);
      })
      .then((res) => {
        if (!active) return;
        const list = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : []);
        setRows(list);
      })
      .catch((e) => {
        if (!active) return;
        setRows([]);
        setError(e && e.message ? e.message : 'Could not load number history');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, brand, simCards]);

  if (!open) return null;

  const allEntries = numberHistoryEntries(rows);
  const entries = filterEntriesByRange(allEntries, range);
  const sections = groupEntriesByBrand(entries, brand);
  const capped = rows.length >= BRAND_HISTORY_CAP;
  const title = brand === 'All' ? 'SIM Number History' : `${brand} Number History`;
  // Each period chip carries how many changes it would show, so a window with
  // nothing in it is greyed out instead of looking broken, and the footer can
  // state the window that is actually active.
  const periodChips = HISTORY_PERIODS.map((p) => ({
    ...p,
    count: filterEntriesByRange(allEntries, p.value).length,
    from: historyRangeFrom(p.value),
  }));
  const activePeriod = periodChips.find((p) => p.value === range) || periodChips[0];
  const sinceText = activePeriod.from ? ` · since ${formatDate(activePeriod.from)}` : '';
  const cardsTouched = new Set(entries.map((e) => e.mobile_id)).size;
  // Mirrors the Locker page: a SIM counts as a spare when no phone is recorded
  // against it, which is the same field the assign endpoint writes.
  const lockerSpares = (inventory || []).filter(
    (i) => String(i.mobile_id || '').trim() === '' && i.status !== 'Lost' && i.status !== 'Damaged' && i.status !== 'Expired'
  );

  return (
    <div className="modal-overlay sim-edit-overlay sim-bh-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal sim-hist-modal sim-bh-modal">
        <div className="se-head">
          <div className="se-head-main">
            <span className="se-avatar"><Icon name="history" size={18} /></span>
            <div className="se-head-txt">
              <h3>{title}</h3>
              <div className="se-head-sub">
                <span>Which SIM number changed, and when</span>
              </div>
            </div>
          </div>
          <button className="modal-x" onClick={onClose} aria-label="Close"><Icon name="close" size={17} /></button>
        </div>

        <div className="modal-body se-body">
          <section className="se-sec locker-sec">
            <div className="se-sec-head">
              <span className="se-sec-ic"><Icon name="inventory" size={14} /></span>
              <div className="se-sec-txt">
                <h4>SIM Locker</h4>
                <p>Spare SIMs you hold that are not in any phone yet</p>
              </div>
              <span className="se-sec-count">{lockerSpares.length} spare</span>
            </div>
            <div className="se-sec-body">
              {lockerSpares.length === 0 ? (
                <div className="locker-inline-empty">
                  No spare SIMs right now. Add them from the SIM Locker page.
                </div>
              ) : (
                <div className="locker-inline-list">
                  {lockerSpares.map((item) => (
                    <div className="locker-inline-row" key={item.id}>
                      <div className="li-main">
                        <span className="li-name">{item.sim_name || item.sim_number || '—'}</span>
                        <span className="li-meta">
                          {item.sim_number || '—'}
                          {item.provider ? ` · ${item.provider}` : ''}
                          {item.assigned_to ? ` · ${item.assigned_to}` : ''}
                        </span>
                      </div>
                      <button className="mini-btn primary" onClick={() => setLockerAssign(item)}>Assign</button>
                    </div>
                  ))}
                </div>
              )}
              {onGoToLocker && (
                <div className="locker-inline-foot">
                  <button className="sim-btn ghost" onClick={onGoToLocker}>Open SIM Locker</button>
                </div>
              )}
            </div>
          </section>

          <section className="se-sec">
            <div className="se-sec-head">
              <span className="se-sec-ic"><Icon name="mobile" size={14} /></span>
              <div className="se-sec-txt">
                <h4>Number Changes</h4>
                <p>Grouped by month, newest first</p>
              </div>
              {!loading && !error && entries.length > 0 && (
                <span className="se-sec-count">{entries.length} change{entries.length === 1 ? '' : 's'}</span>
              )}
            </div>
            <div className="se-sec-body">
              <div className="se-bh-bar">
                <div className="se-bh-chips" role="group" aria-label="Brand">
                  {SIM_BRAND_FILTERS.map((b) => (
                    <button
                      key={b}
                      type="button"
                      className={`se-bh-chip${b === brand ? ' on' : ''}`}
                      aria-pressed={b === brand}
                      onClick={() => setBrand(b)}
                    >
                      {b}
                    </button>
                  ))}
                </div>
                <div className="se-bh-chips" role="group" aria-label="Period">
                  {periodChips.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      className={`se-bh-chip${p.value === range ? ' on' : ''}`}
                      aria-pressed={p.value === range}
                      disabled={p.count === 0 && p.value !== range}
                      title={`${p.count} change${p.count === 1 ? '' : 's'}${p.from ? ` · since ${formatDate(p.from)}` : ''}`}
                      onClick={() => setRange(p.value)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {loading ? (
                <div className="se-empty"><span className="se-spin" /> Loading number history...</div>
              ) : error ? (
                <div className="se-empty">
                  <Icon name="history" size={18} />
                  <span>{error}</span>
                </div>
              ) : sections.length === 0 ? (
                <div className="se-empty">
                  <Icon name="history" size={18} />
                  <span>No SIM number changes recorded for {brand === 'All' ? 'any card' : brand} in {activePeriod.label.toLowerCase()}.</span>
                </div>
              ) : (
                <div className="se-log-wrap se-bh-wrap">
                  <table className="se-log se-bh-log">
                    <thead>
                      <tr>
                        <th className="c-when">Date &amp; Time</th>
                        <th className="c-card">Mobile ID</th>
                        <th className="c-field">Number</th>
                        <th className="c-old">Old Number</th>
                        <th className="c-new">New Number</th>
                        <th className="c-act">Action</th>
                        <th className="c-by">Changed By</th>
                      </tr>
                    </thead>
                    {sections.map((sec) => (
                      <tbody key={sec.key}>
                        {sections.length > 1 ? (
                          <tr className="se-bh-brand">
                            <td colSpan={7}>
                              <span className={`se-bh-brand-name b-${sec.brand.toLowerCase()}`}>{sec.label}</span>
                              <span className="se-bh-brand-count">{sec.total} change{sec.total === 1 ? '' : 's'}</span>
                            </td>
                          </tr>
                        ) : null}
                        {sec.months.map((g) => (
                          <tr className="se-bh-month" key={g.key}>
                            <td colSpan={7}>
                              <span className="se-bh-month-label">{g.label}</span>
                              <span className="se-bh-month-count">{g.entries.length} change{g.entries.length === 1 ? '' : 's'}</span>
                            </td>
                          </tr>
                        ))}
                        {sec.months.map((g) => g.entries.map((e) => (
                          <tr key={e.key}>
                            <td className="c-when">{formatDateTime(e.changed_at)}</td>
                            <td className="c-card">
                              <span className="se-bh-mid">{txt(e.mobile_id) || '—'}</span>
                              {raw(e.device_model) ? <span className="se-bh-dev">{e.device_model}</span> : null}
                            </td>
                            <td className="c-field">SIM {e.slot}</td>
                            <td className="c-old">{e.action === 'Added' ? <span className="se-bh-none">—</span> : <s>{e.old}</s>}</td>
                            <td className="c-new">{e.action === 'Removed' ? <span className="se-bh-none">—</span> : e.new}</td>
                            <td className="c-act"><span className={`se-act ${e.action.toLowerCase()}`}>{e.action}</span></td>
                            <td className="c-by">{e.changed_by || '—'}</td>
                          </tr>
                        )))}
                      </tbody>
                    ))}
                  </table>
                </div>
              )}

              {capped && !loading && !error ? (
                <p className="se-bh-note">Showing the most recent {BRAND_HISTORY_CAP} history records. Narrow the brand or period to see older changes.</p>
              ) : null}
            </div>
          </section>
        </div>

        <div className="modal-foot se-foot">
          <span className="se-foot-hint">
            {loading
              ? 'Fetching number history...'
              : `${entries.length} number change${entries.length === 1 ? '' : 's'} across ${cardsTouched} card${cardsTouched === 1 ? '' : 's'}${sinceText}`}
          </span>
          <div className="se-foot-btns">
            <button className="sim-btn primary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>

      <AssignSimModal
        open={!!lockerAssign}
        item={lockerAssign}
        onClose={() => setLockerAssign(null)}
        onSaved={assignInventoryItem}
      />
    </div>
  );
}
