import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, apiPatch, apiDelete } from '../api/auth';

const MATCH_TYPES = [
  { value: 'contains', label: 'Contains' },
  { value: 'exact', label: 'Exact match' },
  { value: 'starts_with', label: 'Starts with' },
  { value: 'ends_with', label: 'Ends with' },
  { value: 'whole_word', label: 'Whole word' },
];

const EMPTY_RULE = {
  name: '', keyword: '', match_type: 'contains', reply_text: '',
  cooldown_seconds: 0, priority: 0, enabled: true,
  template_name: '', template_language: 'en',
};

/**
 * WhatsApp keyword automations.
 *
 * The toggle at the top is the master switch. It maps to
 * whatsapp_automation_settings.enabled, which the inbound webhook checks BEFORE
 * it looks at any rule -- so leaving it off guarantees no automatic message can
 * be sent, regardless of what rules exist below.
 */
export default function WhatsAppAutomation() {
  const [settings, setSettings] = useState(null);
  const [rules, setRules] = useState([]);
  const [logs, setLogs] = useState([]);
  const [tab, setTab] = useState('rules');
  const [loading, setLoading] = useState(true);
  const [savingToggle, setSavingToggle] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [previewText, setPreviewText] = useState('');
  const [previewResult, setPreviewResult] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [s, r, l] = await Promise.all([
        apiGet('/whatsapp/automation/settings'),
        apiGet('/whatsapp/automation/rules'),
        apiGet('/whatsapp/automation/logs?limit=50'),
      ]);
      setSettings(s || { enabled: false });
      setRules(Array.isArray(r) ? r : []);
      setLogs(Array.isArray(l) ? l : []);
      setError('');
    } catch (err) {
      setError(err?.message || 'Could not load automation settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(''), 3000); };

  const toggleEnabled = async () => {
    const next = !settings?.enabled;
    // Confirm before switching ON, because ON means messages start going out on
    // their own. Switching off is safe and needs no confirmation.
    if (next && !window.confirm(
      'Turn automations ON?\n\nMatching inbound messages will be replied to automatically, without an agent. Start with one rule and watch the Logs tab first.',
    )) return;

    setSavingToggle(true);
    try {
      const res = await apiPost('/whatsapp/automation/settings/enabled', { enabled: next });
      setSettings((s) => ({ ...s, enabled: res?.current?.enabled ?? next }));
      flash(next ? 'Automations are ON — replies will send automatically' : 'Automations are OFF — nothing will be sent');
    } catch (err) {
      setError(err?.message || 'Could not change the toggle');
    } finally {
      setSavingToggle(false);
    }
  };

  const saveRule = async () => {
    if (!draft.name?.trim() || !draft.keyword?.trim() || !draft.reply_text?.trim()) {
      setError('Name, keyword and reply text are all required.');
      return;
    }
    setBusy(true);
    try {
      if (draft.id) await apiPatch(`/whatsapp/automation/rules/${draft.id}`, draft);
      else await apiPost('/whatsapp/automation/rules', draft);
      setDraft(null);
      await load();
      flash('Rule saved');
    } catch (err) {
      setError(err?.message || 'Could not save the rule');
    } finally {
      setBusy(false);
    }
  };

  const patchRule = async (rule, patch) => {
    try {
      await apiPatch(`/whatsapp/automation/rules/${rule.id}`, patch);
      await load();
    } catch (err) {
      setError(err?.message || 'Could not update the rule');
    }
  };

  const removeRule = async (rule) => {
    if (!window.confirm(`Delete the rule "${rule.name}"? Its logs are kept.`)) return;
    try {
      await apiDelete(`/whatsapp/automation/rules/${rule.id}`);
      await load();
      flash('Rule deleted');
    } catch (err) {
      setError(err?.message || 'Could not delete the rule');
    }
  };

  const runPreview = async () => {
    try {
      const res = await apiPost('/whatsapp/automation/preview', { text: previewText });
      setPreviewResult(res?.matches || []);
    } catch (err) {
      setError(err?.message || 'Preview failed');
    }
  };

  if (loading) return <div style={{ padding: 20, fontSize: 14, color: '#6b7280' }}>Loading…</div>;

  const on = !!settings?.enabled;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ---------------- master toggle ---------------- */}
      <div className="card">
        <div className="card-pad" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Keyword automations</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3, lineHeight: 1.45 }}>
              When ON, an inbound message that matches a rule is replied to automatically —
              no agent involved. When OFF, nothing is ever sent automatically.
            </div>
          </div>

          <button
            type="button"
            onClick={toggleEnabled}
            disabled={savingToggle}
            aria-pressed={on}
            title={on ? 'Click to turn automations off' : 'Click to turn automations on'}
            style={{
              position: 'relative', flex: '0 0 auto', width: 52, height: 28, borderRadius: 999,
              border: '1px solid ' + (on ? '#16a34a' : '#d1d5db'),
              background: on ? '#16a34a' : '#e5e7eb',
              cursor: savingToggle ? 'wait' : 'pointer', opacity: savingToggle ? 0.6 : 1,
              transition: 'background .15s, border-color .15s', padding: 0,
            }}
          >
            <span style={{
              position: 'absolute', top: 2, left: on ? 26 : 2, width: 22, height: 22,
              borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.25)',
              transition: 'left .15s',
            }} />
            <span style={{
              position: 'absolute', top: 0, left: 0, width: 52, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 800, letterSpacing: '.04em',
              color: on ? '#fff' : '#6b7280', pointerEvents: 'none',
            }}>
              {on ? 'ON' : 'OFF'}
            </span>
          </button>
        </div>

        {on && (
          <div style={{
            margin: '0 16px 16px', padding: '9px 12px', borderRadius: 6,
            background: '#fffbeb', border: '1px solid #fde68a',
            fontSize: 12, color: '#92400e', lineHeight: 1.45,
          }}>
            <strong>Automations are live.</strong> Replies send without an agent. Check the
            Logs tab after enabling, and use a cooldown so a customer is not messaged repeatedly.
          </div>
        )}
      </div>

      {error && (
        <div style={{ padding: '9px 12px', borderRadius: 6, background: '#fef2f2', border: '1px solid #fecaca', fontSize: 12, color: '#b91c1c' }}>
          {error}
        </div>
      )}
      {notice && (
        <div style={{ padding: '9px 12px', borderRadius: 6, background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: 12, color: '#15803d' }}>
          {notice}
        </div>
      )}

      {/* ---------------- tabs ---------------- */}
      <div style={{ display: 'flex', gap: 6 }}>
        {[['rules', 'Rules'], ['logs', 'Logs'], ['preview', 'Test a message']].map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            style={{
              fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
              background: tab === k ? '#111827' : '#fff',
              color: tab === k ? '#fff' : '#374151',
              border: '1px solid ' + (tab === k ? '#111827' : '#d1d5db'),
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ---------------- rules ---------------- */}
      {tab === 'rules' && (
        <div className="card">
          <div className="card-head">
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
              Rules ({rules.length})
            </h3>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => { setError(''); setDraft({ ...EMPTY_RULE }); }}
              style={{ fontSize: 12, padding: '5px 12px', fontWeight: 600 }}
            >
              + New rule
            </button>
          </div>

          <div className="card-pad">
            {rules.length === 0 && !draft && (
              <div style={{ padding: '20px 0', fontSize: 13, color: '#6b7280', textAlign: 'center' }}>
                No rules yet. Add one, test it under “Test a message”, then turn the toggle on.
              </div>
            )}

            {rules.map((r) => (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0',
                borderBottom: '1px solid #f3f4f6',
              }}>
                <input
                  type="checkbox"
                  checked={r.enabled !== false}
                  onChange={(e) => patchRule(r, { enabled: e.target.checked })}
                  title={r.enabled !== false ? 'Disable this rule' : 'Enable this rule'}
                  style={{ cursor: 'pointer' }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>
                    “{r.keyword}” · {MATCH_TYPES.find((m) => m.value === r.match_type)?.label || r.match_type}
                    {r.cooldown_seconds > 0 ? ` · ${r.cooldown_seconds}s cooldown` : ''}
                    {r.priority ? ` · priority ${r.priority}` : ''}
                  </div>
                </div>
                <button type="button" onClick={() => { setError(''); setDraft({ ...r }); }}
                  style={{ fontSize: 11, color: '#374151', background: '#fff', border: '1px solid #d1d5db', borderRadius: 5, padding: '3px 9px', cursor: 'pointer' }}>
                  Edit
                </button>
                <button type="button" onClick={() => removeRule(r)}
                  style={{ fontSize: 11, color: '#dc2626', background: '#fff', border: '1px solid #fecaca', borderRadius: 5, padding: '3px 9px', cursor: 'pointer' }}>
                  Delete
                </button>
              </div>
            ))}

            {draft && (
              <div style={{ marginTop: 14, padding: 14, border: '1px solid #e5e7eb', borderRadius: 8, background: '#f9fafb' }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: '#111827' }}>
                  {draft.id ? 'Edit rule' : 'New rule'}
                </div>

                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                  Name
                  <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="e.g. Office hours enquiry"
                    style={inputStyle} />
                </label>

                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                  Keyword
                  <input value={draft.keyword} onChange={(e) => setDraft({ ...draft, keyword: e.target.value })}
                    placeholder="e.g. timings"
                    style={inputStyle} />
                </label>

                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                  Match
                  <select value={draft.match_type} onChange={(e) => setDraft({ ...draft, match_type: e.target.value })}
                    style={inputStyle}>
                    {MATCH_TYPES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </label>

                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                  Reply text
                  <textarea value={draft.reply_text} rows={3}
                    onChange={(e) => setDraft({ ...draft, reply_text: e.target.value })}
                    placeholder="What the customer receives"
                    style={{ ...inputStyle, height: 'auto', resize: 'vertical' }} />
                </label>

                <div style={{ display: 'flex', gap: 10 }}>
                  <label style={{ flex: 1, fontSize: 11, fontWeight: 600, color: '#374151' }}>
                    Cooldown (seconds)
                    <input type="number" min="0" value={draft.cooldown_seconds}
                      onChange={(e) => setDraft({ ...draft, cooldown_seconds: e.target.value })}
                      style={inputStyle} />
                  </label>
                  <label style={{ flex: 1, fontSize: 11, fontWeight: 600, color: '#374151' }}>
                    Priority
                    <input type="number" value={draft.priority}
                      onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
                      style={inputStyle} />
                  </label>
                </div>

                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginTop: 8 }}>
                  Template fallback (used only when the 24-hour window is closed)
                  <input value={draft.template_name || ''}
                    onChange={(e) => setDraft({ ...draft, template_name: e.target.value })}
                    placeholder="approved template name (optional)"
                    style={inputStyle} />
                </label>

                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button type="button" onClick={saveRule} disabled={busy}
                    style={{ fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 6, cursor: 'pointer', background: '#111827', color: '#fff', border: '1px solid #111827' }}>
                    {busy ? 'Saving…' : 'Save rule'}
                  </button>
                  <button type="button" onClick={() => setDraft(null)}
                    style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, cursor: 'pointer', background: '#fff', color: '#374151', border: '1px solid #d1d5db' }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------- logs ---------------- */}
      {tab === 'logs' && (
        <div className="card">
          <div className="card-head"><h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Recent activity</h3></div>
          <div className="card-pad">
            {logs.length === 0 && (
              <div style={{ padding: '20px 0', fontSize: 13, color: '#6b7280', textAlign: 'center' }}>
                Nothing logged yet.
              </div>
            )}
            {logs.map((l) => (
              <div key={l.id} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: '1px solid #f3f4f6', fontSize: 12 }}>
                <span style={{
                  flex: '0 0 auto', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
                  background: l.result === 'sent' ? '#dcfce7' : l.result === 'failed' ? '#fee2e2' : '#f3f4f6',
                  color: l.result === 'sent' ? '#15803d' : l.result === 'failed' ? '#b91c1c' : '#6b7280',
                }}>
                  {l.result}
                </span>
                <span style={{ flex: 1, color: '#374151' }}>
                  {l.rule_name || '—'}
                  {l.detail ? <span style={{ color: '#6b7280' }}> · {l.detail}</span> : null}
                </span>
                <span style={{ flex: '0 0 auto', color: '#9ca3af' }}>
                  {l.created_at ? new Date(l.created_at).toLocaleString() : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------------- preview ---------------- */}
      {tab === 'preview' && (
        <div className="card">
          <div className="card-head"><h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Test a message</h3></div>
          <div className="card-pad">
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10, lineHeight: 1.45 }}>
              Dry run. Type what a customer might write and see which rule would fire.
              Nothing is sent and nothing is recorded.
            </div>
            <textarea value={previewText} rows={3}
              onChange={(e) => setPreviewText(e.target.value)}
              placeholder="e.g. what are your timings?"
              style={{ ...inputStyle, height: 'auto', resize: 'vertical' }} />
            <button type="button" onClick={runPreview} disabled={!previewText.trim()}
              style={{ marginTop: 8, fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 6, cursor: 'pointer', background: '#111827', color: '#fff', border: '1px solid #111827' }}>
              Test
            </button>

            {previewResult && (
              <div style={{ marginTop: 12, fontSize: 12 }}>
                {previewResult.length === 0 ? (
                  <div style={{ color: '#6b7280' }}>No rule matches that message.</div>
                ) : (
                  previewResult.map((m) => (
                    <div key={m.id} style={{ padding: 9, border: '1px solid #bbf7d0', background: '#f0fdf4', borderRadius: 6, marginBottom: 6 }}>
                      <div style={{ fontWeight: 700, color: '#15803d' }}>{m.name} would reply</div>
                      <div style={{ color: '#374151', marginTop: 3 }}>{m.reply_text}</div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  display: 'block', width: '100%', marginTop: 4, padding: '7px 10px', fontSize: 13,
  border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box', height: 34,
};