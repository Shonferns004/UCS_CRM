import { useState, useEffect, useCallback, useMemo } from 'react'
import { api } from '../api/auth'
import { RangeLeaderboard } from './LeadIncentiveLeaderboard'

const fmt = (n) => {
  const v = Number(n)
  return (Number.isFinite(v) ? v : 0).toLocaleString('en-IN')
}

const fmtDate = (d) => {
  if (!d) return '—'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// Value for <input type="datetime-local"> (no seconds, local time).
const toLocalInput = (d) => {
  if (!d) return ''
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`
}

// Absolute UTC ISO for a filled datetime-local value so the backend stores the
// exact instant the admin picked regardless of its own timezone. Blank → null.
const toIso = (v) => (v ? new Date(v).toISOString() : null)

const pad2 = (n) => String(n).padStart(2, '0')
const todayLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
const fmtDT = (d) => {
  if (!d) return '—'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const fmtSlabRange = (s) => `₹${fmt(s.min_amount)} – ₹${fmt(s.max_amount)}`

// A stale DB could hold duplicate rows for the same (min, max) range, which would
// make the UI list every range twice. Keep a single row per range — preferring an
// active one — so the screen never shows "double" ranges.
const uniqueByRange = (rows) => {
  const map = new Map()
  for (const s of rows || []) {
    const key = `${Number(s.min_amount)}-${Number(s.max_amount)}`
    const cur = map.get(key)
    if (!cur || (!cur.is_active && s.is_active)) map.set(key, s)
  }
  return [...map.values()]
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10,
  border: '1.5px solid var(--line)', background: 'var(--card-bg)', color: 'var(--ink)',
  fontSize: 13.5, outline: 'none',
}

const btnStyle = (bg = 'var(--ink)', fg = '#fff') => ({
  padding: '8px 16px', borderRadius: 10, border: 'none', background: bg, color: fg,
  fontWeight: 700, fontSize: 13, cursor: 'pointer',
})

const slabInputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8,
  border: '1.5px solid var(--line)', background: 'var(--card-bg)', color: 'var(--ink)',
  fontSize: 13, outline: 'none', textAlign: 'right',
}

// Live status for a range based on its Start/End window (mirrors "Sir ka Incentive").
const statusChip = (slab, { wonById = {} } = {}) => {
  const now = Date.now()
  if (wonById[slab?.id]) {
    return { text: '🏆 Won', bg: '#dcfce7', fg: '#166534' }
  }
  if (slab?.stopped_date && String(slab.stopped_date).slice(0, 10) === todayLocal()) {
    return { text: '⏹ Stopped', bg: '#fee2e2', fg: '#b91c1c' }
  }
  if (!slab?.started_at) {
    return { text: '⏸ Not Started', bg: '#edf2f7', fg: '#64748b' }
  }
  const s = new Date(slab.started_at).getTime()
  if (Number.isNaN(s)) return { text: '⏸ Not Started', bg: '#edf2f7', fg: '#64748b' }
  if (s > now) return { text: `⏱ Starts ${fmtDT(slab.started_at)}`, bg: '#fef3c7', fg: '#b45309' }
  if (slab.ended_at) {
    const e = new Date(slab.ended_at).getTime()
    if (!Number.isNaN(e) && e <= now) return { text: '⏹ Ended', bg: '#e2e8f0', fg: '#64748b' }
  }
  return { text: '● LIVE', bg: '#dcfce7', fg: '#15803d' }
}

// ─── Lead Rules Settings ──────────────────────────────────
function LeadRulesSettings({ settings, slabs, onSave, onUpdateSlab, onApplyAll, onApplyAllTime, saving, savingSlab, wonById = {} }) {
  const [local, setLocal] = useState({ ...settings })
  const [dirty, setDirty] = useState(false)

  useEffect(() => { setLocal({ ...settings }); setDirty(false) }, [settings])

  const update = (key, val) => {
    setLocal(prev => ({ ...prev, [key]: val }))
    setDirty(true)
  }

  // Per-range configure popup
  const [popupSlab, setPopupSlab] = useState(null)
  const [popupForm, setPopupForm] = useState({ amount_to_win: '', started_at: '', ended_at: '' })
  const [popupError, setPopupError] = useState('')

  const openPopup = (slab) => {
    setPopupSlab(slab)
    setPopupForm({
      amount_to_win: slab.amount_to_win ?? '',
      started_at: toLocalInput(slab.started_at),
      ended_at: toLocalInput(slab.ended_at),
    })
    setPopupError('')
  }

  const closePopup = () => { setPopupSlab(null); setPopupError('') }

  const savePopup = async () => {
    setPopupError('')
    const amount_to_win = Number(popupForm.amount_to_win)
    if (!(amount_to_win > 0)) {
      setPopupError('Enter a valid Win On amount (must be more than ₹0)')
      return
    }
    const started_at = popupForm.started_at
    const ended_at = popupForm.ended_at
    if (started_at && ended_at && !(new Date(ended_at).getTime() > new Date(started_at).getTime())) {
      setPopupError('End Time must be after Start Time')
      return
    }
    try {
      await onUpdateSlab(popupSlab, {
        amount_to_win,
        started_at: started_at || null,
        ended_at: ended_at || null,
      })
      closePopup()
    } catch (e) {
      setPopupError(e.message || 'Failed to save')
    }
  }

  // Apply common value to ALL ranges
  const [commonForm, setCommonForm] = useState({ amount_to_win: '' })
  const [commonError, setCommonError] = useState('')
  const [commonDone, setCommonDone] = useState('')

  // Start/End competition window for ALL ranges
  const [allTimeForm, setAllTimeForm] = useState({
    started_at: toLocalInput(new Date(Date.now() + 5 * 60 * 1000)),
    ended_at: toLocalInput(new Date(Date.now() + 24 * 60 * 60 * 1000)),
  })
  const [allTimeError, setAllTimeError] = useState('')
  const [allTimeDone, setAllTimeDone] = useState('')

  const applyCommon = async () => {
    setCommonError('')
    setCommonDone('')
    const amount_to_win = Number(commonForm.amount_to_win)
    if (!(amount_to_win > 0)) {
      setCommonError('Enter a valid Win On amount (must be more than ₹0)')
      return
    }
    try {
      const count = await onApplyAll({ amount_to_win })
      setCommonDone(`Applied to ${count} range(s) ✓`)
    } catch (e) {
      setCommonError(e.message || 'Failed to apply')
    }
  }

  // Apply Start/End window to ALL ranges at once
  const applyAllTime = async () => {
    setAllTimeError('')
    setAllTimeDone('')
    const started_at = allTimeForm.started_at
    const ended_at = allTimeForm.ended_at
    if (!started_at) {
      setAllTimeError('Choose a Start Time first')
      return
    }
    if (ended_at && !(new Date(ended_at).getTime() > new Date(started_at).getTime())) {
      setAllTimeError('End Time must be after Start Time')
      return
    }
    try {
      const count = await onApplyAllTime({ started_at: started_at || null, ended_at: ended_at || null })
      setAllTimeDone(`⏱ Started ${count} range(s) with this window ✓`)
    } catch (e) {
      setAllTimeError(e.message || 'Failed to apply')
    }
  }

  const activeSlabs = (slabs || []).filter(s => s.is_active)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Per-range configure list */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink)', marginBottom: 3 }}>
          Per Range Settings
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 10 }}>
          Each range sets its own <b>Win On (₹)</b> target and its own Start/End competition time — the first FRO to collect that much in verified leads wins the range's flat Prize.
        </div>

        {/* Apply common value to ALL ranges */}
        <div style={{
          marginBottom: 10, padding: '12px 14px', borderRadius: 12,
          background: '#f0fdf4',
          border: '1.5px solid #bbf7d0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 15 }}>📣</span>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#166534' }}>ALL RANGES — Apply common Win On</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 150px' }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', display: 'block', marginBottom: 4 }}>
                Win On – Total collected (₹)
              </label>
              <input type="number" style={slabInputStyle} value={commonForm.amount_to_win}
                onChange={e => setCommonForm(p => ({ ...p, amount_to_win: e.target.value }))} placeholder="e.g. 1500" />
            </div>
            <button onClick={applyCommon} disabled={savingSlab}
              style={{ ...btnStyle('#15803d'), padding: '8px 16px', fontSize: 12.5, whiteSpace: 'nowrap' }}>
              {savingSlab ? 'Applying…' : '⬇️ Apply to All Ranges'}
            </button>
          </div>
          {commonError && (
            <div style={{ fontSize: 11.5, fontWeight: 600, color: '#b91c1c', marginTop: 8 }}>{commonError}</div>
          )}
          {commonDone && (
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#15803d', marginTop: 8 }}>{commonDone}</div>
          )}
          <div style={{ fontSize: 10.5, color: 'var(--ink-soft)', marginTop: 6 }}>
            Fills every range's Win On target with this value at once — the Prize stays per range; you can still fine-tune each range below after.
          </div>
        </div>

        {/* Apply Start/End window to ALL ranges */}
        <div style={{
          marginBottom: 10, padding: '12px 14px', borderRadius: 12,
          background: '#fffdf5',
          border: '1.5px solid #fde68a',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 15 }}>⏱</span>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#92400e' }}>ALL RANGES — Start / End Time</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 170px' }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', display: 'block', marginBottom: 4 }}>
                Start Time
              </label>
              <input type="datetime-local" style={slabInputStyle} value={allTimeForm.started_at}
                onChange={e => setAllTimeForm(p => ({ ...p, started_at: e.target.value }))} />
            </div>
            <div style={{ flex: '1 1 170px' }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', display: 'block', marginBottom: 4 }}>
                End Time <span style={{ fontWeight: 500 }}>(optional)</span>
              </label>
              <input type="datetime-local" style={slabInputStyle} value={allTimeForm.ended_at}
                onChange={e => setAllTimeForm(p => ({ ...p, ended_at: e.target.value }))} />
            </div>
            <button onClick={applyAllTime} disabled={savingSlab}
              style={{ ...btnStyle('#b45309'), padding: '8px 16px', fontSize: 12.5, whiteSpace: 'nowrap' }}>
              {savingSlab ? 'Applying…' : '⏱ Start / End All Ranges'}
            </button>
          </div>
          {allTimeError && (
            <div style={{ fontSize: 11.5, fontWeight: 600, color: '#b91c1c', marginTop: 8 }}>{allTimeError}</div>
          )}
          {allTimeDone && (
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#92400e', marginTop: 8 }}>{allTimeDone}</div>
          )}
          <div style={{ fontSize: 10.5, color: 'var(--ink-soft)', marginTop: 6 }}>
            Applies the same window to every range and re-opens any range stopped today · verified leads are counted only between these times.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {activeSlabs.map(slab => {
            const chip = statusChip(slab, { wonById })
            return (
              <div key={slab.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                borderRadius: 10, border: '1.5px solid var(--line)', background: 'var(--bg)', flexWrap: 'wrap',
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', flex: '0 0 auto', minWidth: 110 }}>
                  {fmtSlabRange(slab)}
                </span>
                <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 999, background: chip.bg, color: chip.fg, whiteSpace: 'nowrap' }}>
                  {chip.text}
                </span>
                <span style={{ flex: 1, fontSize: 12, color: 'var(--ink-soft)' }}>
                  🎯 Win on ₹{fmt(slab.amount_to_win ?? 1500)} collected · 🏆 Prize ₹{fmt(slab.incentive_amount)}
                </span>
                <button onClick={() => openPopup(slab)} style={{ ...btnStyle('#b45309'), padding: '6px 12px', fontSize: 12, whiteSpace: 'nowrap' }}>
                  ⚙️ Configure
                </button>
              </div>
            )
          })}
          {activeSlabs.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>No slabs configured yet — add one via the 📋 Target Slabs button above.</div>
          )}
        </div>
      </div>

      {/* Per-range configure popup */}
      {popupSlab && (
        <div style={{ ...overlayStyle, zIndex: 99995 }} onClick={closePopup}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              ...modalCardStyle,
              width: 'min(460px, 100%)',
              borderRadius: 18,
            }}
          >
            {/* Header */}
            <div style={{
              padding: '18px 20px',
              background: '#b45309',
              position: 'relative',
            }}>
              <button onClick={closePopup} style={{
                position: 'absolute', top: 14, right: 14, width: 30, height: 30, borderRadius: 50,
                background: 'rgba(255,255,255,.22)', border: 'none', color: '#fff', fontWeight: 800,
                cursor: 'pointer', fontSize: 14, lineHeight: 1,
              }}>✕</button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,.22)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
                }}>⚙️</span>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.75)', letterSpacing: 1 }}>
                    CONFIGURE RANGE
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: '#fff' }}>
                    {fmtSlabRange(popupSlab)}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ padding: '18px 20px' }}>
              {popupError && (
                <div style={{ padding: '9px 12px', borderRadius: 8, background: '#fee2e2', color: '#b91c1c', fontSize: 12, fontWeight: 600, marginBottom: 12 }}>
                  {popupError}
                </div>
              )}

              {/* How it works strip */}
              <div style={{
                display: 'flex', gap: 8, alignItems: 'center', padding: '10px 12px',
                borderRadius: 10, background: '#fffdf5',
                border: '1.5px solid #fde68a', fontSize: 12, color: '#92400e', marginBottom: 14,
              }}>
                <span style={{ fontSize: 15 }}>💡</span>
                <div>Every verified lead counts. The first FRO in this range to collect <b>Win On (₹)</b> in total today wins the flat <b>Prize (₹{fmt(popupSlab.incentive_amount)})</b>.</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Win On amount */}
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ink)', display: 'block', marginBottom: 6 }}>
                    Win On – Total collected <span style={{ color: 'var(--ink-soft)', fontWeight: 600 }}>(₹)</span>
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg)', border: '1.5px solid var(--line)', borderRadius: 12, padding: '8px 12px' }}>
                    <span style={{ fontSize: 15, fontWeight: 900, color: '#b45309' }}>₹</span>
                    <input
                      type="number"
                      value={popupForm.amount_to_win}
                      onChange={e => setPopupForm(p => ({ ...p, amount_to_win: e.target.value }))}
                      placeholder="1500"
                      style={{
                        flex: 1, border: 'none', outline: 'none', background: 'transparent',
                        fontSize: 17, fontWeight: 800, color: 'var(--ink)',
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 5 }}>
                    When a FRO's total verified day collection reaches this, they win the Prize and the range stops for today.
                  </div>
                </div>

                {/* Prize display */}
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ink)', display: 'block', marginBottom: 6 }}>
                    Prize <span style={{ color: 'var(--ink-soft)', fontWeight: 600 }}>(₹) — flat payout to the winner</span>
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg)', border: '1.5px solid #bbf7d0', borderRadius: 12, padding: '8px 12px' }}>
                    <span style={{ fontSize: 15, fontWeight: 900, color: '#16a34a' }}>₹</span>
                    <span style={{ flex: 1, fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>
                      {fmt(popupSlab.incentive_amount)}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 5 }}>
                    Set in the 📋 Target Slabs table — full amount goes to the range's champion, nothing to anyone else.
                  </div>
                </div>

                {/* Competition window (Start/End Time) */}
                <div style={{
                  marginTop: 4, padding: '12px 14px', borderRadius: 12,
                  background: '#fffdf5',
                  border: '1.5px solid #fde68a',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 14 }}>⏱</span>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: '#92400e' }}>Competition Start / End Time</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-soft)', display: 'block', marginBottom: 4 }}>
                        Start Time
                      </label>
                      <input
                        type="datetime-local"
                        value={popupForm.started_at}
                        onChange={e => setPopupForm(p => ({ ...p, started_at: e.target.value }))}
                        style={{ ...inputStyle, fontSize: 14, fontWeight: 700 }}
                      />
                      <div style={{ fontSize: 10.5, color: 'var(--ink-soft)', marginTop: 4 }}>
                        Verified leads count for this range only after this moment · empty = not started
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-soft)', display: 'block', marginBottom: 4 }}>
                        End Time <span style={{ fontWeight: 500 }}>(optional — runs to end of day)</span>
                      </label>
                      <input
                        type="datetime-local"
                        value={popupForm.ended_at}
                        onChange={e => setPopupForm(p => ({ ...p, ended_at: e.target.value }))}
                        style={{ ...inputStyle, fontSize: 14, fontWeight: 700 }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
                <button onClick={closePopup} disabled={savingSlab}
                  style={{ ...btnStyle('var(--line)', 'var(--ink)'), flex: 1, padding: '11px 16px', fontSize: 13.5 }}>
                  Cancel
                </button>
                <button onClick={savePopup} disabled={savingSlab}
                  style={{ ...btnStyle('#b45309'), flex: 1.6, padding: '11px 16px', fontSize: 13.5 }}>
                  {savingSlab ? 'Saving…' : '💾 Save Range'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Slab Config ──────────────────────────────────────────
function SlabConfig({ slabs, onAdd, onUpdate, onDelete, saving, embedded = false }) {
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ min_amount: '', max_amount: '', incentive_amount: '', amount_to_win: '' })
  const [error, setError] = useState('')

  const startEdit = (slab) => {
    setEditing(slab.id)
    setAdding(false)
    setForm({
      min_amount: slab.min_amount,
      max_amount: slab.max_amount,
      incentive_amount: slab.incentive_amount,
      amount_to_win: slab.amount_to_win,
    })
    setError('')
  }

  const startAdd = () => {
    setAdding(true)
    setEditing(null)
    setForm({ min_amount: '', max_amount: '', incentive_amount: '', amount_to_win: '' })
    setError('')
  }

  const cancel = () => { setEditing(null); setAdding(false); setError('') }

  const submit = async () => {
    setError('')
    if (!(Number(form.min_amount) >= 0) || !(Number(form.max_amount) > 0)) {
      setError('Enter valid min and max amounts'); return
    }
    if (Number(form.min_amount) >= Number(form.max_amount)) {
      setError('Min must be less than max'); return
    }
    try {
      if (editing) {
        await onUpdate(editing, form)
      } else {
        await onAdd(form)
      }
      cancel()
    } catch (e) {
      setError(e.message || 'Failed')
    }
  }

  const fmtSlab = (n) => {
    const v = Number(n)
    if (v >= 100000) return `₹${(v / 100000).toFixed(v % 100000 === 0 ? 0 : 1)}L`
    if (v >= 1000) return `₹${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}K`
    return `₹${v}`
  }

  return (
    <div style={embedded
      ? { display: 'flex', flexDirection: 'column', gap: 12 }
      : { border: '1.5px solid var(--line)', borderRadius: 16, padding: 20, background: 'var(--card-bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: embedded ? 4 : 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>📋</span>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Target Slabs</div>
        </div>
        {!adding && !editing && (
          <button onClick={startAdd} style={btnStyle('#b45309')}>+ Add Slab</button>
        )}
      </div>

      {error && (
        <div style={{ padding: '9px 12px', borderRadius: 8, background: '#fee2e2', color: '#b91c1c', fontSize: 12, fontWeight: 600, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* Add form */}
      {adding && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 10, marginBottom: 16, padding: 14, borderRadius: 12, border: '1.5px dashed #f59e0b', background: '#fffdf5' }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', display: 'block', marginBottom: 4 }}>Min Amount (₹)</label>
            <input type="number" style={slabInputStyle} value={form.min_amount} onChange={e => setForm(p => ({ ...p, min_amount: e.target.value }))} placeholder="0" />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', display: 'block', marginBottom: 4 }}>Max Amount (₹)</label>
            <input type="number" style={slabInputStyle} value={form.max_amount} onChange={e => setForm(p => ({ ...p, max_amount: e.target.value }))} placeholder="20000" />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', display: 'block', marginBottom: 4 }}>Win On (₹)</label>
            <input type="number" style={slabInputStyle} value={form.amount_to_win} onChange={e => setForm(p => ({ ...p, amount_to_win: e.target.value }))} placeholder="1500" />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', display: 'block', marginBottom: 4 }}>Prize (₹)</label>
            <input type="number" style={slabInputStyle} value={form.incentive_amount} onChange={e => setForm(p => ({ ...p, incentive_amount: e.target.value }))} placeholder="0" />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
            <button onClick={submit} disabled={saving} style={btnStyle('#16a34a')}>{saving ? '…' : 'Save'}</button>
            <button onClick={cancel} style={btnStyle('var(--line)', 'var(--ink)')}>Cancel</button>
          </div>
        </div>
      )}

      {/* Slab table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--line)' }}>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 800, color: 'var(--ink-soft)', fontSize: 12 }}>Range</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--ink-soft)', fontSize: 12 }}>Win On</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--ink-soft)', fontSize: 12 }}>Prize</th>
              <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, color: 'var(--ink-soft)', fontSize: 12, width: 140 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {slabs.filter(s => s.is_active).map(slab => (
              editing === slab.id ? (
                <tr key={slab.id} style={{ borderBottom: '1px solid var(--line)', background: '#fffdf5' }}>
                  <td style={{ padding: 6 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="number" style={{ ...slabInputStyle, width: 100 }} value={form.min_amount} onChange={e => setForm(p => ({ ...p, min_amount: e.target.value }))} />
                      <span style={{ color: 'var(--ink-soft)', fontSize: 12 }}>to</span>
                      <input type="number" style={{ ...slabInputStyle, width: 100 }} value={form.max_amount} onChange={e => setForm(p => ({ ...p, max_amount: e.target.value }))} />
                    </div>
                  </td>
                  <td style={{ padding: 6 }}>
                    <input type="number" style={slabInputStyle} value={form.amount_to_win} onChange={e => setForm(p => ({ ...p, amount_to_win: e.target.value }))} />
                  </td>
                  <td style={{ padding: 6 }}>
                    <input type="number" style={slabInputStyle} value={form.incentive_amount} onChange={e => setForm(p => ({ ...p, incentive_amount: e.target.value }))} />
                  </td>
                  <td style={{ padding: 6, textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      <button onClick={submit} disabled={saving} style={{ ...btnStyle('#16a34a'), padding: '6px 12px', fontSize: 12 }}>{saving ? '…' : 'Save'}</button>
                      <button onClick={cancel} style={{ ...btnStyle('var(--line)', 'var(--ink)'), padding: '6px 12px', fontSize: 12 }}>Cancel</button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={slab.id} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--ink)' }}>
                    {fmtSlab(slab.min_amount)} – {fmtSlab(slab.max_amount)}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--ink-soft)' }}>
                    ₹{fmt(slab.amount_to_win ?? 1500)}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#b45309' }}>
                    ₹{fmt(slab.incentive_amount)}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      <button onClick={() => startEdit(slab)} style={{ ...btnStyle('var(--card-bg)', 'var(--ink)'), padding: '5px 10px', fontSize: 11, border: '1px solid var(--line)' }}>Edit</button>
                      <button onClick={() => onDelete(slab.id)} style={{ ...btnStyle('#fee2e2', '#b91c1c'), padding: '5px 10px', fontSize: 11, border: '1px solid #fecaca' }}>Delete</button>
                    </div>
                  </td>
                </tr>
              )
            ))}
            {slabs.filter(s => s.is_active).length === 0 && (
              <tr>
                <td colSpan={3} style={{ padding: 24, textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13 }}>
                  No slabs configured — add the first one!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── FRO Lead Summary ─────────────────────────────────────
function FroLeadSummary({ fros, champions, settings, date, onSelectFro }) {
  return (
    <div style={{ border: '1.5px solid var(--line)', borderRadius: 16, background: 'var(--card-bg)', overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>📋</span>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>FRO Lead Summary</div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
          Flat prize · first to collect the Win On amount wins
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--line)', background: 'var(--bg)' }}>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 800, color: 'var(--ink-soft)', fontSize: 12 }}>FRO</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--ink-soft)', fontSize: 12 }}>Target</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 800, color: 'var(--ink-soft)', fontSize: 12 }}>Slab</th>
              <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, color: 'var(--ink-soft)', fontSize: 12 }}>Leads</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--ink-soft)', fontSize: 12 }}>Amount</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--ink-soft)', fontSize: 12 }}>Win On</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--ink-soft)', fontSize: 12 }}>Prize / Total</th>
            </tr>
          </thead>
          <tbody>
            {fros.map(fro => {
              const isChampion = (champions || []).some(c => c.fro_id === fro.fro_id)
              const slabLabel = fro.slab
                ? `₹${fmt(fro.slab.min_amount)} – ₹${fmt(fro.slab.max_amount)}`
                : '—'

              return (
                <FroRow
                  key={fro.fro_id}
                  fro={fro}
                  isChampion={isChampion}
                  slabLabel={slabLabel}
                  onSelect={onSelectFro}
                />
              )
            })}
            {fros.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13 }}>
                  No FROs found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ padding: '8px 18px', borderTop: '1px solid var(--line)', fontSize: 11, color: 'var(--ink-soft)', textAlign: 'center' }}>
        Leads auto-calculated from verified lead_done dispositions · Click a row to view individual leads
      </div>
    </div>
  )
}

// ─── FRO Row (click to open detail modal) ─────────────────
function FroRow({ fro, isChampion, slabLabel, onSelect }) {
  return (
    <tr
      onClick={() => onSelect && onSelect(fro.fro_id)}
      style={{
        borderBottom: '1px solid var(--line)',
        cursor: 'pointer',
        background: isChampion ? '#fffdf5' : 'transparent',
      }}
    >
      <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--ink)' }}>
        <span style={{ marginRight: 6, fontSize: 11, color: 'var(--ink-soft)' }}>👁</span>
        {fro.fro_name}
        {isChampion && <span style={{ marginLeft: 6, fontSize: 12 }}>🏆</span>}
      </td>
      <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--ink-soft)' }}>₹{fmt(fro.target)}</td>
      <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--ink-soft)' }}>
        {slabLabel}
      </td>
      <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: 'var(--ink)' }}>{fro.total_leads}</td>
      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--ink)' }}>
        ₹{fmt(fro.total_amount)}
        {isChampion && (
          <div style={{ fontSize: 10, color: '#16a34a', fontWeight: 600, whiteSpace: 'nowrap' }}>
            🏆 crossed win-on ✓
          </div>
        )}
      </td>
      <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
        🎯 ₹{fmt(fro.slab?.amount_to_win ?? 1500)}
      </td>
      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 900, fontSize: 14, color: isChampion ? '#16a34a' : 'var(--ink-soft)' }}>
        {isChampion ? `🏆 ₹${fmt(fro.slab?.incentive_amount ?? 0)}` : '—'}
      </td>
    </tr>
  )
}

// ─── FRO Detail Modal ─────────────────────────────────────
function FroDetailModal({ froId, date, champions, onClose }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    api(`/incentive/lead/lead-summary/fro/${froId}?date=${date}`, { _prefix: 'ucs' })
      .then(data => { if (alive) setDetail(data) })
      .catch(e => { if (alive) setError(e.message || 'Failed to load detail') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [froId, date])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (loading) {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={modalCardStyle} onClick={e => e.stopPropagation()}>
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13 }}>Loading leads…</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={modalCardStyle} onClick={e => e.stopPropagation()}>
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--danger)', fontSize: 13 }}>{error}</div>
          <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 20 }}>
            <button onClick={onClose} style={btnStyle('var(--line)', 'var(--ink)')}>Close</button>
          </div>
        </div>
      </div>
    )
  }

  if (!detail) return null

  const isChampion = (champions || []).some(c => c.fro_id === detail.fro_id)
  const slabLabel = detail.slab
    ? `₹${fmt(detail.slab.min_amount)} – ₹${fmt(detail.slab.max_amount)}`
    : '—'
  const winOn = detail.amount_to_win ?? detail.slab?.amount_to_win ?? 1500
  const prize = detail.incentive_amount ?? detail.slab?.incentive_amount ?? 0

  const stat = (label, value, color) => (
    <div style={{
      borderRadius: 12, padding: '12px 14px', background: 'var(--bg)',
      border: '1.5px solid var(--line)', textAlign: 'center', minWidth: 110, flex: 1,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 900, color: color || 'var(--ink)', marginTop: 4 }}>{value}</div>
    </div>
  )

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalCardStyle, width: 'min(760px, 100%)', maxHeight: '86vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        {/* Modal header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', background: '#fffdf5', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>🏆</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>
              {detail.fro_name}
              {isChampion && <span style={{ marginLeft: 6, fontSize: 13 }}>🏆</span>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
              {fmtDate(detail.date)} · Lead detail
            </div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 50, background: 'var(--line)', border: 'none', fontWeight: 700, color: 'var(--ink)', cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>

        <div style={{ overflowY: 'auto', padding: '16px 20px 20px' }}>
          {/* Stats grid */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
            {stat('Target', `₹${fmt(detail.target)}`)}
            {stat('Slab', slabLabel)}
            {stat('Leads', detail.total_leads)}
            {stat('Amount', `₹${fmt(detail.total_amount)}`)}
            {stat('Win On', `🎯 ₹${fmt(winOn)}`, '#b45309')}
            {stat('Prize', `₹${fmt(prize)}`, '#16a34a')}
            {isChampion && stat('Won', '✓ Champion', '#16a34a')}
          </div>

          {/* Leads list */}
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink)', marginBottom: 8 }}>
            Individual Leads ({detail.leads?.length || 0})
          </div>
          {detail.leads && detail.leads.length > 0 ? (
            <div style={{ border: '1.5px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--line)', background: 'var(--bg)' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 800, color: 'var(--ink-soft)', fontSize: 11 }}>Status</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 800, color: 'var(--ink-soft)', fontSize: 11 }}>Donor</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 800, color: 'var(--ink-soft)', fontSize: 11 }}>Mobile</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--ink-soft)', fontSize: 11 }}>Amount</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--ink-soft)', fontSize: 11 }}>Verified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.leads.map((lead, i) => (
                      <tr key={lead.id || i} style={{ borderBottom: '1px solid var(--line)', background: lead.qualified ? 'rgba(220,252,231,.35)' : 'transparent' }}>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 22, height: 22, borderRadius: 50,
                            background: lead.qualified ? '#dcfce7' : '#f1f5f9',
                            fontSize: 12, fontWeight: 800, color: lead.qualified ? '#16a34a' : '#94a3b8',
                          }}>
                            {lead.qualified ? '✓' : '✗'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--ink)' }}>
                          {lead.donor_name || `Donor #${lead.donor_id || '—'}`}
                        </td>
                        <td style={{ padding: '8px 12px', color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
                          {lead.donor_mobile || '—'}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: lead.qualified ? '#16a34a' : 'var(--ink-soft)' }}>
                          ₹{fmt(lead.amount)}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
                          {fmtDate(lead.verified_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink-soft)', fontSize: 12, border: '1.5px dashed var(--line)', borderRadius: 12 }}>
              No leads for this date
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const overlayStyle = {
  position: 'fixed', inset: 0, zIndex: 99992, background: 'rgba(15,23,42,.55)',
  backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
}

const modalCardStyle = {
  width: 'min(500px, 100%)', borderRadius: 16, background: 'var(--card-bg)',
  boxShadow: '0 24px 60px rgba(0,0,0,.35)', overflow: 'hidden',
}

// ─── Main Component ───────────────────────────────────────
export default function LeadIncentive() {
  const [settings, setSettings] = useState({ lead_rate: 20, min_lead_amount: 300, champion_bonus: 250 })
  const [slabs, setSlabs] = useState([])
  const [summary, setSummary] = useState(null)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [loading, setLoading] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)
  const [savingSlab, setSavingSlab] = useState(false)
  const [announced, setAnnounced] = useState([])
  const [announceOpen, setAnnounceOpen] = useState(false)
  const [announceMsg, setAnnounceMsg] = useState('')
  const [announcing, setAnnouncing] = useState(false)
  const [detailFroId, setDetailFroId] = useState(null)
  const [slabsOpen, setSlabsOpen] = useState(false)

  // Only one row per range may ever reach the UI (fixes "double" ranges).
  const uniqueSlabs = useMemo(() => uniqueByRange(slabs), [slabs])

  // Ranges that already produced a winner today (announced champions) — STOP-AFTER-WIN.
  const wonSlabById = useMemo(() => {
    const map = {}
    for (const a of announced || []) {
      if (a && a.slab_id) map[a.slab_id] = true
    }
    for (const c of summary?.champions || []) {
      if (c && c.slab_id) map[c.slab_id] = true
    }
    return map
  }, [announced, summary])

  // Leader board panel data — grouped from the summary, top 3 per active range.
  const lbData = useMemo(() => {
    const champs = summary?.champions || []
    const ranges = (uniqueSlabs || [])
      .map(slab => {
        const members = (summary?.fros || [])
          .filter(f => f.slab && String(f.slab.id) === String(slab.id))
          .sort((a, b) => (Number(b.total_amount) || 0) - (Number(a.total_amount) || 0))
          .slice(0, 3)
          .map(f => ({ ...f, is_winner: champs.some(c => String(c.fro_id) === String(f.fro_id)) }))
        const champion = champs.find(c => String(c.slab_id) === String(slab.id)) || null
        return {
          slab_id: slab.id,
          slab_label: fmtSlabRange(slab),
          amount_to_win: Number(slab.amount_to_win) || 1500,
          incentive_amount: Number(slab.incentive_amount) || 0,
          champion,
          fros: members,
        }
      })
      .filter(r => r.champion || r.fros.length > 0)
    return { ranges }
  }, [uniqueSlabs, summary])

  const loadSettings = useCallback(async () => {
    try {
      const data = await api('/incentive/lead/settings', { _prefix: 'ucs' })
      if (data) setSettings(data)
    } catch { /* ignore */ }
  }, [])

  const loadSlabs = useCallback(async () => {
    try {
      const data = await api('/incentive/lead/slabs', { _prefix: 'ucs' })
      if (Array.isArray(data)) setSlabs(data)
    } catch { /* ignore */ }
  }, [])

  const loadSummary = useCallback(async () => {
    try {
      setLoading(true)
      const data = await api(`/incentive/lead/lead-summary?date=${date}`, { _prefix: 'ucs' })
      if (data) setSummary(data)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [date])

  const loadAnnouncement = useCallback(async () => {
    try {
      const r = await api(`/incentive/lead/champion/current?date=${date}`, { _prefix: 'ucs' })
      setAnnounced(Array.isArray(r?.champions) ? r.champions : [])
    } catch { /* ignore */ }
  }, [date])

  useEffect(() => { loadSettings(); loadSlabs() }, [loadSettings, loadSlabs])
  useEffect(() => { loadSummary(); loadAnnouncement() }, [loadSummary, loadAnnouncement])

  const saveSettings = async (newSettings) => {
    setSavingSettings(true)
    try {
      const updated = await api('/incentive/lead/settings', {
        method: 'PUT', _prefix: 'ucs',
        body: JSON.stringify({
          lead_rate: Number(newSettings.lead_rate),
          min_lead_amount: Number(newSettings.min_lead_amount),
          champion_bonus: Number(newSettings.champion_bonus),
        }),
      })
      if (updated) setSettings(updated)
      loadSummary()
    } catch (e) {
      alert(e.message || 'Failed to save')
    } finally { setSavingSettings(false) }
  }

  const addSlab = async (form) => {
    setSavingSlab(true)
    try {
      await api('/incentive/lead/slabs', {
        method: 'POST', _prefix: 'ucs',
        body: JSON.stringify({
          min_amount: Number(form.min_amount),
          max_amount: Number(form.max_amount),
          incentive_amount: Number(form.incentive_amount) || 0,
          amount_to_win: Number(form.amount_to_win) || 1500,
        }),
      })
      await loadSlabs()
      loadSummary()
    } finally { setSavingSlab(false) }
  }

  const updateSlab = async (id, form) => {
    setSavingSlab(true)
    try {
      await api(`/incentive/lead/slabs/${id}`, {
        method: 'PUT', _prefix: 'ucs',
        body: JSON.stringify({
          min_amount: Number(form.min_amount),
          max_amount: Number(form.max_amount),
          incentive_amount: Number(form.incentive_amount) || 0,
          amount_to_win: Number(form.amount_to_win) || 1500,
        }),
      })
      await loadSlabs()
      loadSummary()
    } finally { setSavingSlab(false) }
  }

  // Per-range popup save: touches this slab's Win On amount + Start/End window
  const updateSlabRates = async (slab, { amount_to_win, started_at, ended_at }) => {
    setSavingSlab(true)
    try {
      await api(`/incentive/lead/slabs/${slab.id}`, {
        method: 'PUT', _prefix: 'ucs',
        body: JSON.stringify({
          min_amount: Number(slab.min_amount),
          max_amount: Number(slab.max_amount),
          incentive_amount: Number(slab.incentive_amount) || 0,
          amount_to_win: Number(amount_to_win) || 1500,
          started_at: toIso(started_at),
          ended_at: toIso(ended_at),
        }),
      })
      await loadSlabs()
      loadSummary()
    } finally { setSavingSlab(false) }
  }

  // Apply a single common Win On value to all active ranges
  const applyAllRates = async ({ amount_to_win }) => {
    setSavingSlab(true)
    try {
      const r = await api('/incentive/lead/slabs/apply-all', {
        method: 'PUT', _prefix: 'ucs',
        body: JSON.stringify({ amount_to_win: Number(amount_to_win) || 1500 }),
      })
      await loadSlabs()
      loadSummary()
      return Array.isArray(r?.slabs) ? r.slabs.length : 0
    } finally { setSavingSlab(false) }
  }

  // Apply a Start/End window to all active ranges at once (time-only apply → re-opens stopped ranges)
  const applyAllTime = async ({ started_at, ended_at }) => {
    setSavingSlab(true)
    try {
      const r = await api('/incentive/lead/slabs/apply-all', {
        method: 'PUT', _prefix: 'ucs',
        body: JSON.stringify({ started_at: toIso(started_at), ended_at: toIso(ended_at) }),
      })
      await loadSlabs()
      loadSummary()
      return Array.isArray(r?.slabs) ? r.slabs.length : 0
    } finally { setSavingSlab(false) }
  }

  const deleteSlab = async (id) => {
    if (!window.confirm('Remove this slab?')) return
    setSavingSlab(true)
    try {
      await api(`/incentive/lead/slabs/${id}`, { method: 'DELETE', _prefix: 'ucs' })
      await loadSlabs()
      loadSummary()
    } finally { setSavingSlab(false) }
  }

  const confirmAnnounce = async () => {
    setAnnouncing(true)
    try {
      const r = await api('/incentive/lead/champion/announce', {
        method: 'POST', _prefix: 'ucs',
        body: JSON.stringify({ date, message: announceMsg.trim() }),
      })
      if (r && Array.isArray(r.announcements)) {
        setAnnounced(r.announcements)
        setAnnounceOpen(false)
        setAnnounceMsg('')
        loadSummary()
      }
    } catch (e) {
      alert(e.message || 'Failed to announce')
    } finally { setAnnouncing(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 22 }}>📊</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>Lead Incentive</div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Auto-calculated from verified lead_done dispositions</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)' }}>📅</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{ ...inputStyle, width: 160 }}
          />
          <button onClick={() => { loadSlabs(); loadSummary() }} style={btnStyle('var(--card-bg)', 'var(--ink)')}>↻ Refresh</button>
        </div>
      </div>

      {/* Target Slabs trigger → modal */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setSlabsOpen(true)} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10,
          border: '1.5px solid var(--line)', background: 'var(--card-bg)', color: 'var(--ink)',
          fontWeight: 800, fontSize: 12.5, cursor: 'pointer',
        }}>
          <span style={{ fontSize: 14 }}>📋</span> Target Slabs <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>✎</span>
        </button>
      </div>

      {/* Two-column: Lead Incentive | Leader Board */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 18, alignItems: 'start' }}>
        {/* Left — Lead Incentive */}
        <div style={{ border: '1.5px solid var(--line)', borderRadius: 16, padding: 18, background: 'var(--card-bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 17 }}>🎯</span>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Lead Incentive</div>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>per-range settings</span>
          </div>
          <LeadRulesSettings
            settings={settings}
            slabs={uniqueSlabs}
            wonById={wonSlabById}
            onSave={saveSettings}
            onUpdateSlab={updateSlabRates}
            onApplyAll={applyAllRates}
            onApplyAllTime={applyAllTime}
            saving={savingSettings}
            savingSlab={savingSlab}
          />
        </div>

        {/* Right — Leader Board (directly on the page, no wrapper card) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 2px 0' }}>
            <span style={{ width: 9, height: 9, borderRadius: 50, background: '#22c55e', boxShadow: '0 0 0 3px rgba(34,197,94,.22)', flex: '0 0 auto' }} />
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Leader Board</div>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>top 3 · live</span>
          </div>
          {loading ? (
            <div style={{ padding: 28, textAlign: 'center', color: 'var(--ink-soft)', fontSize: 12.5 }}>Loading leaderboard…</div>
          ) : (
            <RangeLeaderboard data={lbData} you={null} />
          )}
        </div>
      </div>

      {/* Champion */}
      {announced && announced.length > 0 ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px',
          borderRadius: 14, background: '#dcfce7',
          border: '2px solid #22c55e',
        }}>
          <span style={{ fontSize: 24 }}>🏆</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#166534', marginBottom: 4 }}>
              Range Champions Announced for {date}
            </div>
            {announced.map(a => (
              <div key={a.id} style={{ fontSize: 12.5, fontWeight: 700, color: '#15803d', marginTop: 2 }}>
                {a.slab_label ? `🏆 ${a.slab_label} → ` : '🏆 '}{a.fro_name} · ₹{fmt(a.total_amount)} collected · Prize ₹{fmt(a.incentive_amount || a.total_incentive || 0)}
              </div>
            ))}
          </div>
          <span style={{ padding: '5px 12px', borderRadius: 999, background: '#22c55e', color: '#fff', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>
            ✓ ANNOUNCED
          </span>
        </div>
      ) : (summary?.champions && summary.champions.length > 0) ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px',
          borderRadius: 14, background: '#fef3c7',
          border: '2px solid #f59e0b',
        }}>
          <span style={{ fontSize: 28 }}>🏆</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#92400e' }}>
              Today's Range Winners ({summary.champions.length})
            </div>
            <div style={{ fontSize: 12, color: '#b45309', marginTop: 2 }}>
              {summary.champions.map(c => `🏆 ${c.fro_name} (${c.slab_label})`).join('  ·  ')}
            </div>
            <div style={{ fontSize: 11, color: '#92400e', marginTop: 4 }}>
              First FRO to collect the range's Win On amount in total today wins the flat prize.
            </div>
          </div>
          <button onClick={() => setAnnounceOpen(true)} style={btnStyle('#b45309')}>
            🎉 Announce Range Winners
          </button>
        </div>
      ) : null}

      {/* FRO Summary */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13 }}>
          Loading lead data…
        </div>
      ) : (
        <FroLeadSummary
          fros={summary?.fros || []}
          champions={summary?.champions || []}
          settings={settings}
          date={date}
          onSelectFro={id => setDetailFroId(id)}
        />
      )}

      {/* FRO Detail Modal */}
      {detailFroId && (
        <FroDetailModal
          froId={detailFroId}
          date={date}
          champions={summary?.champions || []}
          onClose={() => setDetailFroId(null)}
        />
      )}

      {/* Announce Champion Modal */}
      {announceOpen && summary?.champions && summary.champions.length > 0 && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99991, background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ width: 'min(420px,100%)', borderRadius: 16, padding: 22, background: 'var(--card-bg)', border: '2px solid #f59e0b', boxShadow: '0 24px 60px rgba(0,0,0,.35)' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>🏆 Announce Range Winners for {date}?</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 8 }}>
              {summary.champions.map(c => (
                <div key={c.slab_id} style={{ padding: '8px 0', borderBottom: '1px dashed var(--line)' }}>
                  <div style={{ fontWeight: 800, color: 'var(--ink)' }}>
                    🏆 {c.slab_label} → {c.fro_name}
                  </div>
                  <div style={{ fontSize: 11.5, marginTop: 2 }}>
                    Collected ₹{fmt(c.crossing_amount ?? c.hit_amount ?? c.total_amount)} · crossed 🎯 ₹{fmt(c.amount_to_win ?? 1500)} · Prize ₹{fmt(c.slab_bonus || c.total_incentive || 0)}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 8 }}>
              This locks each range's first-hitter and notifies every panel.
            </div>
            <div style={{ marginTop: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', display: 'block', marginBottom: 5 }}>Message (optional)</label>
              <textarea
                value={announceMsg}
                onChange={e => setAnnounceMsg(e.target.value)}
                placeholder="e.g. Great work today everyone! 🎉"
                style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => setAnnounceOpen(false)} disabled={announcing} style={{ ...btnStyle('var(--line)', 'var(--ink)'), flex: 1 }}>
                Cancel
              </button>
              <button onClick={confirmAnnounce} disabled={announcing} style={{ ...btnStyle('#b45309'), flex: 1 }}>
                {announcing ? 'Announcing…' : '🏆 Confirm Announce'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Target Slabs Modal */}
      {slabsOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99990, background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 16px 16px', overflow: 'auto' }} onClick={() => setSlabsOpen(false)}>
          <div style={{ width: 'min(700px,100%)', borderRadius: 18, background: 'var(--card-bg)', border: '1.5px solid var(--line)', boxShadow: '0 24px 60px rgba(0,0,0,.35)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', background: '#b45309' }}>
              <span style={{ fontSize: 17 }}>📋</span>
              <div style={{ flex: 1, color: '#fff', fontSize: 14, fontWeight: 800 }}>Target Slabs</div>
              <button onClick={() => setSlabsOpen(false)} style={{ width: 30, height: 30, borderRadius: 50, background: 'rgba(255,255,255,.22)', border: 'none', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ padding: 16, maxHeight: '78vh', overflowY: 'auto' }}>
              <SlabConfig slabs={uniqueSlabs} onAdd={addSlab} onUpdate={updateSlab} onDelete={deleteSlab} saving={savingSlab} embedded />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
