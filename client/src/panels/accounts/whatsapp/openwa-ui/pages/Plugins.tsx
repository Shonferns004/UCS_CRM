import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { localizePlugin } from '../utils/localizePlugin';
import { configUiSafeConfig, missingRequiredConfig, sparseSessionOverride } from '../utils/pluginConfigRules';
import { coerceFieldInput, emptyForField, fillClearedFields } from '../utils/pluginConfigForm';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Puzzle,
  Power,
  PowerOff,
  Settings,
  CheckCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  Cpu,
  Database,
  Server,
  Shield,
  Zap,
  Upload,
  Trash2,
  Globe,
  Download,
  Plus,
  Search,
  ArrowUpCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { pluginsApi } from '../services/api';
import type { Plugin, CatalogPlugin, PluginConfigField } from '../services/api';
import { openwaAssignmentsApi } from '../services/crmAssignments';
import { injectConfigUiCsp } from '../utils/pluginFrameSecurity';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useTheme } from '../hooks/useTheme';
import { usePluginsQuery, useSessionsQuery, queryKeys } from '../hooks/queries';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Modal';
import { useToast } from '../hooks/useToast';
import { PluginInstances } from '../components/PluginInstances';
import './Plugins.css';

type PluginType = 'engine' | 'storage' | 'queue' | 'auth' | 'extension';

const pluginTypeIcons: Record<PluginType, typeof Puzzle> = {
  engine: Cpu,
  storage: Database,
  queue: Server,
  auth: Shield,
  extension: Zap,
};

/**
 * Friendly editor for the FAQ bot's `rules` field.
 *
 * The plugin schema stores the rules as a JSON string, which is exact but hard
 * to maintain from a phone. This presents the same data as Q&A rows and writes
 * the identical JSON back through `onChange`, so the gateway contract does not
 * change and the per-session override works exactly as before.
 */
type FaqRuleMode = 'contains' | 'exact' | 'regex';
type FaqRuleRow = { mode: FaqRuleMode; pattern: string; reply: string };

const FAQ_MODES: { value: FaqRuleMode; label: string }[] = [
  { value: 'contains', label: 'Message contains' },
  { value: 'exact', label: 'Message is exactly' },
  { value: 'regex', label: 'Regex pattern' },
];

function parseFaqRules(value: unknown): FaqRuleRow[] {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value || '[]') : value;
    const list = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    return list.map((r: Record<string, unknown>) => ({
      mode: FAQ_MODES.some(m => m.value === r?.mode) ? (r.mode as FaqRuleMode) : 'contains',
      pattern: String(r?.pattern ?? ''),
      reply: String(r?.reply ?? ''),
    }));
  } catch {
    return [];
  }
}

function FaqRulesField({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const [rows, setRows] = useState<FaqRuleRow[]>(() => parseFaqRules(value));
  // The JSON we last emitted. The parent echoes it straight back as `value`;
  // re-parsing that would reset local state and steal focus mid-typing.
  const lastEmitted = useRef('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState('');

  useEffect(() => {
    if (value === lastEmitted.current) return;
    setRows(parseFaqRules(value));
  }, [value]);

  const commit = (next: FaqRuleRow[]) => {
    setRows(next);
    const json = JSON.stringify(next, null, 2);
    lastEmitted.current = json;
    onChange(json);
  };

  const update = (index: number, patch: Partial<FaqRuleRow>) => {
    commit(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  // Excel/CSV import: column 1 = question/keyword, column 2 = answer, optional
  // column 3 = contains | exact | regex. A header row is skipped automatically.
  const importFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImportError('');
    try {
      const buffer = await file.arrayBuffer();
      const workbook = /\.csv$/i.test(file.name)
        ? XLSX.read(new TextDecoder().decode(buffer), { type: 'string' })
        : XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error('The first sheet is empty.');
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        blankrows: false,
        defval: '',
      });
      if (matrix.length === 0) throw new Error('No rows found in the first sheet.');
      const first = matrix[0].map(v => String(v ?? '').trim().toLowerCase());
      const hasHeader = /question|pattern|keyword/.test(first[0] ?? '')
        || /answer|reply/.test(first[1] ?? '');
      const parsed: FaqRuleRow[] = (hasHeader ? matrix.slice(1) : matrix)
        .map(row => {
          const pattern = String(row[0] ?? '').trim();
          const reply = String(row[1] ?? '').trim();
          const rawMode = String(row[2] ?? '').trim().toLowerCase();
          const mode = FAQ_MODES.some(m => m.value === rawMode) ? (rawMode as FaqRuleMode) : 'contains';
          return { mode, pattern, reply };
        })
        .filter(row => row.pattern || row.reply);
      if (parsed.length === 0) {
        throw new Error('No Q&A rows found. Use column 1 = question/keyword, column 2 = answer, column 3 = optional match type.');
      }
      if (rows.length > 0 && !window.confirm('Replace the current Q&A rows with the uploaded sheet?')) return;
      commit(parsed);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not read that file.');
    }
  };

  const incomplete = rows.some(row => !row.pattern.trim() || !row.reply.trim());

  return (
    <div className="faq-rules">
      <div className="faq-rules-head">
        <div>
          <div className="faq-rules-title">Questions &amp; answers</div>
          <div className="faq-rules-hint">
            One rule per question. Rules are checked top to bottom and the first matching answer is sent.
          </div>
        </div>
        <div className="faq-toolbar">
          <button type="button" className="faq-upload" onClick={() => fileInputRef.current?.click()}>
            <Upload size={14} /> Upload Excel
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            onChange={e => void importFile(e)}
            style={{ display: 'none' }}
            aria-label="Upload questions and answers from Excel or CSV"
          />
          <button
            type="button"
            className="faq-add"
            onClick={() => commit([...rows, { mode: 'contains', pattern: '', reply: '' }])}
          >
            <Plus size={14} /> Add Q&amp;A
          </button>
        </div>
      </div>

      <div className="faq-upload-hint">
        Excel/CSV: column 1 = question or keyword, column 2 = answer, column 3 = optional match type (contains / exact / regex).
      </div>

      {importError && <div className="faq-import-error">{importError}</div>}

      {rows.length === 0 ? (
        <div className="faq-empty">No Q&amp;A rules yet. Add the first question here.</div>
      ) : (
        <div className="faq-rows">
          {rows.map((row, i) => (
            <div className="faq-row" key={i}>
              <div className="faq-row-line">
                <span className="faq-num">{i + 1}</span>
                <select
                  value={row.mode}
                  aria-label={`Match type for Q&A ${i + 1}`}
                  onChange={e => update(i, { mode: e.target.value as FaqRuleMode })}
                >
                  {FAQ_MODES.map(mode => (
                    <option key={mode.value} value={mode.value}>{mode.label}</option>
                  ))}
                </select>
                <input
                  value={row.pattern}
                  aria-label={`Question or keyword for Q&A ${i + 1}`}
                  placeholder="Question / keyword, e.g. ashray"
                  onChange={e => update(i, { pattern: e.target.value })}
                />
                <button
                  type="button"
                  className="faq-remove"
                  aria-label={`Remove Q&A ${i + 1}`}
                  title="Remove"
                  onClick={() => commit(rows.filter((_, j) => j !== i))}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <textarea
                value={row.reply}
                rows={2}
                aria-label={`Answer for Q&A ${i + 1}`}
                placeholder="Answer the bot should send…"
                onChange={e => update(i, { reply: e.target.value })}
              />
            </div>
          ))}
        </div>
      )}

      {incomplete && (
        <div className="faq-warn">Fill in both the question/keyword and the answer for every row before saving.</div>
      )}
      <div className="faq-rules-foot">
        These answers are used for the selected NGO only. Saving applies them to every WhatsApp number assigned to that NGO.
      </div>
    </div>
  );
}

/**
 * Renders one config field from a plugin's schema and reports edits via `onChange`. Recurses for
 * nested objects and array-of-rows. Module-scope (stable identity) so inputs keep focus across
 * keystrokes. The secret redact/restore round-trip lives server-side (PUT /plugins/:id/config).
 */
function ConfigField({
  field,
  label,
  value,
  onChange,
  pluginId,
  fieldKey,
}: {
  field: PluginConfigField;
  label: string;
  value: unknown;
  onChange: (next: unknown) => void;
  /** Only used to give the FAQ bot's `rules` field a friendly Q&A editor. */
  pluginId?: string;
  fieldKey?: string;
}) {
  const { t } = useTranslation();
  // Per-instance id: ConfigField renders once per schema property (and recurses), so a hardcoded
  // id would collide on any schema with two boolean fields - the second label would toggle the
  // first checkbox. useId is stable across re-renders and unique per instance.
  const fieldId = React.useId();
  // Secret fields are still type=password by default; the reveal toggle only
  // changes this input's local presentation and never writes the value anywhere.
  const [showSecret, setShowSecret] = React.useState(false);
  const desc = field.description ? <small>{field.description}</small> : null;
  // Bound to the control it names. The boolean branch below builds its own pair because its caption
  // and its checkbox sit in different containers.
  const labelEl = (
    <label htmlFor={fieldId}>
      {label}
      {field.required && <span className="required-mark"> *</span>}
    </label>
  );
  // An array renders one control PER ROW, so there is no single input for a label to point at; a
  // `<label>` here would be an orphan that names nothing. It is a caption, so it is marked up as one.
  const captionEl = (
    <span className="config-array-label">
      {label}
      {field.required && <span className="required-mark"> *</span>}
    </span>
  );

  // The FAQ bot's configSchema describes `rules` as a JSON textarea. That is
  // accurate but unusable for the people who actually maintain the answers, so
  // the same field gets a row-based Q&A editor (still saving the exact same
  // rules JSON, including inside a per-session override).
  if (pluginId === 'faq-bot' && fieldKey === 'rules') {
    return <FaqRulesField value={value} onChange={onChange} description={field.description} />;
  }

  if (field.type === 'boolean') {
    return (
      <div className="form-group toggle-group">
        <div className="toggle-info">
          <label htmlFor={fieldId}>{label}</label>
          {desc}
        </div>
        <label className="toggle-switch">
          <input id={fieldId} type="checkbox" checked={Boolean(value)} onChange={e => onChange(e.target.checked)} />
          <span className="toggle-slider"></span>
        </label>
      </div>
    );
  }

  if (field.enum && field.enum.length > 0) {
    const options = field.enum;
    return (
      <div className="form-group">
        {labelEl}
        <select
          id={fieldId}
          value={String(value ?? '')}
          // Restore the option's original type (e.g. a number/boolean enum), not the raw string value.
          onChange={e => onChange(options.find(o => String(o) === e.target.value) ?? e.target.value)}
        >
          {options.map(opt => (
            <option key={String(opt)} value={String(opt)}>
              {String(opt)}
            </option>
          ))}
        </select>
        {desc}
      </div>
    );
  }

  if (field.type === 'object') {
    const obj = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
    const props = field.properties ?? {};
    return (
      <fieldset className="config-fieldset">
        <legend>{label}</legend>
        {desc}
        {Object.entries(props).map(([k, sub]) => (
          <ConfigField
            key={k}
            field={sub}
            label={sub.title || k}
            value={obj[k]}
            onChange={v => onChange({ ...obj, [k]: v })}
          />
        ))}
      </fieldset>
    );
  }

  if (field.type === 'array') {
    const rows = Array.isArray(value) ? value : [];
    const item = field.items;
    if (!item) {
      // No element schema declared — nothing to render safely (don't fall through to a text input
      // that would stringify the array to "[object Object]"/"" and corrupt it).
      return (
        <div className="config-array">
          {captionEl}
          {desc}
        </div>
      );
    }
    return (
      <div className="config-array">
        {captionEl}
        {desc}
        {rows.map((row, i) => (
          <div className="config-array-row" key={i}>
            <div className="config-array-row-body">
              <ConfigField
                field={item}
                label={`#${i + 1}`}
                value={row}
                onChange={v => onChange(rows.map((r, j) => (j === i ? v : r)))}
              />
            </div>
            <button
              type="button"
              className="config-array-remove"
              title={t('common.delete')}
              aria-label={t('common.delete')}
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button type="button" className="config-array-add" onClick={() => onChange([...rows, emptyForField(item)])}>
          <Plus size={14} /> {t('plugins.config.addItem')}
        </button>
      </div>
    );
  }

  if (field.type === 'textarea') {
    return (
      <div className="form-group">
        {labelEl}
        <textarea
          id={fieldId}
          value={value === undefined || value === null ? '' : String(value)}
          placeholder={field.default !== undefined ? String(field.default) : undefined}
          required={field.required}
          minLength={field.min}
          maxLength={field.max}
          rows={4}
          onChange={e => onChange(coerceFieldInput(field, e.target.value))}
        />
        {desc}
      </div>
    );
  }

  const inputType = field.type === 'number' ? 'number' : field.secret ? (showSecret ? 'text' : 'password') : 'text';
  const inputEl = (
    <input
      id={fieldId}
      type={inputType}
      value={value === undefined || value === null ? '' : String(value)}
      placeholder={field.default !== undefined ? String(field.default) : undefined}
      autoComplete={field.secret ? 'new-password' : undefined}
      required={field.required}
      min={field.type === 'number' ? field.min : undefined}
      max={field.type === 'number' ? field.max : undefined}
      // min/max are value bounds only; without step="any" the default step of 1 rejects 0.7.
      step={field.type === 'number' ? 'any' : undefined}
      minLength={field.type !== 'number' ? field.min : undefined}
      maxLength={field.type !== 'number' ? field.max : undefined}
      // A stored secret reads back as the mask '***', which no pattern describes: it is only checked once typed over.
      pattern={field.type !== 'number' && !(field.secret && value === '***') ? field.pattern : undefined}
      onChange={e => onChange(coerceFieldInput(field, e.target.value))}
    />
  );
  return (
    <div className="form-group">
      {labelEl}
      {field.secret ? (
        <div className="config-secret">
          {inputEl}
          <button
            type="button"
            className="config-secret-toggle"
            onClick={() => setShowSecret(v => !v)}
            aria-label={showSecret ? t('plugins.config.hideSecret') : t('plugins.config.showSecret')}
            title={showSecret ? t('plugins.config.hideSecret') : t('plugins.config.showSecret')}
          >
            {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      ) : inputEl}
      {desc}
    </div>
  );
}

/**
 * Renders a plugin's sandboxed-iframe config editor. The entry HTML is fetched WITH the API key
 * (which never enters the iframe), hardened (script nonces + a per-document CSP that pins media
 * to 'self'/data: and forbids connections/forms — see utils/pluginFrameSecurity), and injected
 * as `srcdoc` into a `sandbox="allow-scripts"` iframe (opaque origin — no access to the parent).
 * The editor talks to the host over a postMessage bridge:
 *   iframe → host  { type: 'config:get' }          → host → iframe { type: 'config:value', config, schema, locale, theme }
 *   iframe → host  { type: 'config:save', config }  → host → iframe { type: 'config:saved' } | { type: 'config:error', message }
 * The host makes the authenticated PUT (secret redact/restore applies); the iframe only ever sees the
 * already-redacted config.
 *
 * `theme` is 'light' | 'dark', already resolved (so 'system' arrives as one of the two). The iframe has
 * an opaque origin and cannot read the parent's theme itself, so without this an editor can only guess —
 * which is how the Chat Flow editor ended up a glaring white panel inside a dark modal. Additive: an
 * editor that ignores the field renders exactly as it did before.
 *
 * `locale` is the dashboard language code ('es', 'zh-CN', ...), and `schema` arrives with field titles and
 * descriptions localized from the manifest `i18n` block, the same text the generated form shows. The
 * iframe cannot read the parent's language setting either, and the manifest block covers only top-level
 * field text, so `locale` is what lets an editor translate its own strings. Additive, like `theme`.
 *
 * They are sent once, with the handshake. The theme and language controls sit behind the modal overlay,
 * so neither setting can change while an editor is open, and reopening re-runs the handshake. The OS
 * appearance can, though: under the 'system' theme the dashboard repaints when it flips, while the
 * handshake theme stays as sent, so an editor that follows it should also watch `prefers-color-scheme`.
 */
function PluginConfigUi({ plugin, sessionId }: { plugin: Plugin; sessionId?: string }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [handshakeReceived, setHandshakeReceived] = useState(false);
  const [handshakeError, setHandshakeError] = useState<string | null>(null);

  const hardenConfigUiHtml = (source: string): string => {
    const nonce = document.querySelector<HTMLMetaElement>('meta[name="openwa-csp-nonce"]')?.content ?? '';
    const doc = new DOMParser().parseFromString(source, 'text/html');
    if (nonce && nonce !== '__OPENWA_CSP_NONCE__') {
      // Vite development has no production CSP, so there is nothing to stamp. Config UIs are
      // required to be self-contained. Nonce only inline scripts; a plugin-supplied external
      // `src` must still satisfy the parent's host allow-list rather than bypassing it via nonce.
      for (const script of doc.querySelectorAll('script:not([src])')) script.setAttribute('nonce', nonce);
    }
    // Lock down media/connection egress for the frame's document — independent of the parent
    // CSP, so it protects Vite dev sessions too. See utils/pluginFrameSecurity.
    injectConfigUiCsp(doc);
    return `<!doctype html>\n${doc.documentElement.outerHTML}`;
  };

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setError(null);
    setHandshakeReceived(false);
    setHandshakeError(null);
    pluginsApi
      .getConfigUi(plugin.id)
      .then(h => {
        if (!cancelled) setHtml(h);
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : t('common.unknownError'));
      });
    return () => {
      cancelled = true;
    };
  }, [plugin.id, t]);

  useEffect(() => {
    if (html === null || handshakeReceived) return;
    const timer = window.setTimeout(() => setHandshakeError(t('plugins.config.uiHandshakeError')), 5000);
    return () => window.clearTimeout(timer);
  }, [html, handshakeReceived, t]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const frame = iframeRef.current?.contentWindow;
      if (!frame || e.source !== frame) return; // only our sandboxed iframe (its origin is opaque 'null')
      const msg = e.data as { type?: string; config?: Record<string, unknown> };
      const post = (m: unknown) => frame.postMessage(m, '*');
      if (msg?.type === 'config:get') {
        setHandshakeReceived(true);
        setHandshakeError(null);
        // Only expose schema-DECLARED fields (already secret-redacted by the API). An undeclared key
        // may hold a secret the host can't mask, so it never reaches the untrusted iframe; with no
        // schema there is nothing safe to send. The plugin must declare its fields to pre-fill them.
        // For a per-session editor (sessionId set), expose the resolved slice: the session's override
        // value where set, else the base value.
        post({
          type: 'config:value',
          config: configUiSafeConfig(plugin, sessionId),
          schema: localizePlugin(plugin, i18n.language).configSchema,
          locale: i18n.language,
          theme: resolvedTheme,
        });
      } else if (msg?.type === 'config:save') {
        void (async () => {
          try {
            // These endpoints report a failure as 200 + {success:false}, so the result has to be read.
            // Taking the absence of a throw as success told the operator "Saved!" — and told the editor
            // its values were stored — for a save the server had rejected.
            const res = sessionId
              ? await pluginsApi.updateSessionConfig(
                  plugin.id,
                  sessionId,
                  sparseSessionOverride(msg.config ?? {}, plugin),
                )
              : await pluginsApi.updateConfig(plugin.id, msg.config ?? {});
            if (!res.success) throw new Error(res.message);
            void queryClient.invalidateQueries({ queryKey: queryKeys.plugins });
            post({ type: 'config:saved' });
            toast.success(t('plugins.toasts.savedTitle'), t('plugins.toasts.savedDesc'));
          } catch (err) {
            const message = err instanceof Error ? err.message : t('common.unknownError');
            post({ type: 'config:error', message });
            toast.error(t('plugins.toasts.saveFailed'), message);
          }
        })();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [plugin, sessionId, queryClient, t, i18n.language, toast, resolvedTheme]);

  if (error) return <div className="config-ui-status config-ui-error">{error}</div>;
  if (html === null)
    return (
      <div className="config-ui-status">
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  return (
    <>
      {handshakeError && <div className="config-ui-status config-ui-error">{handshakeError}</div>}
      <iframe
        ref={iframeRef}
        className="plugin-config-ui-frame"
        sandbox="allow-scripts"
        srcDoc={hardenConfigUiHtml(html)}
        title={localizePlugin(plugin, i18n.language).name}
        style={{ height: plugin.configUi?.height ?? 600 }}
      />
    </>
  );
}

/**
 * The config modal's "Sessions" tab for a session-scoped plugin: set which sessions it runs for
 * (activation), and optionally a per-session config OVERRIDE on top of the Global (`'*'`) config.
 * Activation → PUT /plugins/:id/sessions; overrides → PUT /plugins/:id/config/:sessionId.
 */
/**
 * The FAQ bot's NGO tab: one tab per WhatsApp session (the sessions are named
 * after the NGO: AFLF / BSCT / MANN), with that NGO's Q&A rules and an activation
 * switch. Saving writes a per-session override and turns the plugin on/off for
 * exactly that number. The global Configuration tab stays the common rule set.
 */
function FaqNgoTab({ plugin }: { plugin: Plugin }) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: sessions = [], isLoading } = useSessionsQuery();
  // The gateway session list has no NGO column: the CRM assignment rows are the
  // source (one row per station). A session can serve several stations, so the
  // session ids are de-duplicated per NGO.
  const { data: assignmentsData } = useQuery({
    queryKey: ['openwa-assignments'],
    queryFn: openwaAssignmentsApi.list,
    staleTime: 30_000,
  });
  const { data: ngoMeta } = useQuery({
    queryKey: ['openwa-ngos'],
    queryFn: openwaAssignmentsApi.meta,
    staleTime: 60_000,
  });
  const [selectedNgoId, setSelectedNgoId] = useState('');
  const [rulesJson, setRulesJson] = useState('');
  const [activeDraft, setActiveDraft] = useState(false);
  const [saving, setSaving] = useState(false);

  const assignments = assignmentsData?.assignments ?? [];
  const liveSessionIds = useMemo(() => new Set(sessions.map(s => s.id)), [sessions]);
  const ngos = useMemo(() => {
    const map = new Map<string, string>();
    for (const ngo of ngoMeta?.ngos ?? []) map.set(ngo.id, ngo.name);
    for (const row of assignments) {
      if (row.ngo_id) map.set(row.ngo_id, row.ngo_name || row.ngo_id);
    }
    const preferred = ['BSCT', 'AFLF', 'MANN'];
    return [...map.entries()]
      .filter(([, name]) => String(name).trim().toLowerCase() !== 'other')
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => {
        const ai = preferred.indexOf(a.name.toUpperCase());
        const bi = preferred.indexOf(b.name.toUpperCase());
        if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
        return a.name.localeCompare(b.name);
      });
  }, [ngoMeta, assignments]);

  const ngoSessionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of assignments) {
      if (row.ngo_id === selectedNgoId && row.session_id && liveSessionIds.has(row.session_id)) {
        ids.add(row.session_id);
      }
    }
    return [...ids];
  }, [assignments, selectedNgoId, liveSessionIds]);

  useEffect(() => {
    if (ngos.length === 0) {
      setSelectedNgoId('');
      return;
    }
    if (!selectedNgoId || !ngos.some(n => n.id === selectedNgoId)) {
      setSelectedNgoId(ngos[0].id);
    }
  }, [ngos, selectedNgoId]);

  // Seed from the first session of the NGO (its override, else the global
  // rules). The live plugin query refetches in the background; re-seeding on
  // that would wipe in-progress typing, so only a different NGO/session set
  // reseeds.
  const seedKey = `${selectedNgoId}|${ngoSessionIds.join(',')}`;
  useEffect(() => {
    if (!selectedNgoId || ngoSessionIds.length === 0) {
      setRulesJson('');
      setActiveDraft(false);
      return;
    }
    const first = plugin.sessionConfig?.[ngoSessionIds[0]] ?? {};
    const value = first.rules ?? plugin.config?.rules ?? '';
    setRulesJson(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
    const activeSessions = plugin.activeSessions ?? [];
    setActiveDraft(
      ngoSessionIds.every(id => activeSessions.includes('*') || activeSessions.includes(id)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey, plugin.id]);

  const selectedNgo = ngos.find(n => n.id === selectedNgoId) || null;
  const ngoName = selectedNgo?.name || '';

  const save = async () => {
    if (!selectedNgoId || ngoSessionIds.length === 0) return;
    setSaving(true);
    try {
      // Save the same Q&A override for every WhatsApp number of this NGO. Keep
      // any other per-session override fields the session already had.
      await Promise.all(ngoSessionIds.map(async sessionId => {
        const existing = plugin.sessionConfig?.[sessionId] ?? {};
        const full = { ...plugin.config, ...existing, rules: rulesJson };
        const res = await pluginsApi.updateSessionConfig(
          plugin.id,
          sessionId,
          sparseSessionOverride(full, plugin),
        );
        if (!res.success) throw new Error(res.message);
      }));

      // Activate/deactivate every session of this NGO in one activation update.
      const current = plugin.activeSessions ?? [];
      let next: string[] | null = null;
      if (activeDraft) {
        if (!current.includes('*')) {
          const set = new Set([...current, ...ngoSessionIds]);
          next = [...set];
        }
      } else if (current.includes('*')) {
        next = sessions.map(s => s.id).filter(id => !ngoSessionIds.includes(id));
      } else {
        next = current.filter(id => !ngoSessionIds.includes(id));
      }
      const changed = next
        && (next.length !== current.length
          || next.some(id => !current.includes(id))
          || current.some(id => !next.includes(id)));
      if (changed) await pluginsApi.setSessions(plugin.id, next!);

      void queryClient.invalidateQueries({ queryKey: queryKeys.plugins });
      toast.success(
        t('plugins.toasts.savedTitle'),
        activeDraft
          ? `FAQ active on ${ngoSessionIds.length} ${ngoName} number${ngoSessionIds.length === 1 ? '' : 's'}.`
          : `FAQ switched off for ${ngoName}.`,
      );
    } catch (err) {
      toast.error(t('plugins.toasts.saveFailed'), err instanceof Error ? err.message : t('common.unknownError'));
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <div className="config-ui-status"><Loader2 size={18} className="animate-spin" /></div>;
  }

  if (ngos.length === 0) {
    return <div className="faq-ngo-empty">{t('plugins.sessions.noSessions')}</div>;
  }

  return (
    <div className="faq-ngo">
      <div className="faq-ngo-tabs" role="tablist" aria-label="NGOs">
        {ngos.map(ngo => {
          const ids = assignments
            .filter(row => row.ngo_id === ngo.id && row.session_id && liveSessionIds.has(row.session_id))
            .map(row => row.session_id);
          const activeSessions = plugin.activeSessions ?? [];
          const active = ids.length > 0
            && ids.every(id => activeSessions.includes('*') || activeSessions.includes(id));
          return (
            <button
              key={ngo.id}
              type="button"
              role="tab"
              aria-selected={ngo.id === selectedNgoId}
              className={`faq-ngo-tab${ngo.id === selectedNgoId ? ' active' : ''}`}
              onClick={() => setSelectedNgoId(ngo.id)}
            >
              <span className={`faq-ngo-dot${active ? ' on' : ''}`} />
              {ngo.name}
            </button>
          );
        })}
      </div>

      {selectedNgo && (
        <div className="faq-ngo-body">
          <div className="faq-ngo-head">
            <div>
              <h3>{ngoName}</h3>
              <small>
                {ngoSessionIds.length > 0
                  ? `All ${ngoSessionIds.length} ${ngoName} WhatsApp number${ngoSessionIds.length === 1 ? '' : 's'} will use these answers.`
                  : `No WhatsApp session is assigned to ${ngoName} yet.`}
              </small>
            </div>
            <label className="faq-ngo-switch">
              <span>{activeDraft ? 'Active' : 'Inactive'}</span>
              <span className="toggle-switch">
                <input
                  type="checkbox"
                  checked={activeDraft}
                  onChange={e => setActiveDraft(e.target.checked)}
                  disabled={ngoSessionIds.length === 0}
                  aria-label={`Activate FAQ for ${ngoName}`}
                />
                <span className="toggle-slider" />
              </span>
            </label>
          </div>

          <FaqRulesField value={rulesJson} onChange={setRulesJson} />

          <div className="faq-ngo-actions">
            <span className="faq-ngo-hint">
              {ngoSessionIds.length === 0
                ? 'Assign this NGO to a WhatsApp session first (WhatsApp Bulk → Assignments).'
                : activeDraft
                  ? 'Saving applies these answers to every number of this NGO.'
                  : 'Saving will switch FAQ off on every number of this NGO.'}
            </span>
            <button
              type="button"
              className="btn-primary"
              onClick={() => void save()}
              disabled={saving || ngoSessionIds.length === 0}
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : `Save for ${ngoName}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * NGO tab for the AI Responder. Provider credentials (API URL/key/model and the
 * rate limits) stay global on the Configuration tab; the prompt is the part
 * that changes per NGO, so this writes a per-session `systemPrompt` override to
 * every WhatsApp number of the selected NGO and activates/deactivates them all.
 */
function AiNgoTab({ plugin }: { plugin: Plugin }) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const promptId = React.useId();
  const { data: sessions = [], isLoading } = useSessionsQuery();
  const { data: assignmentsData } = useQuery({
    queryKey: ['openwa-assignments'],
    queryFn: openwaAssignmentsApi.list,
    staleTime: 30_000,
  });
  const { data: ngoMeta } = useQuery({
    queryKey: ['openwa-ngos'],
    queryFn: openwaAssignmentsApi.meta,
    staleTime: 60_000,
  });
  const [selectedNgoId, setSelectedNgoId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [activeDraft, setActiveDraft] = useState(false);
  const [saving, setSaving] = useState(false);

  const assignments = assignmentsData?.assignments ?? [];
  const liveSessionIds = useMemo(() => new Set(sessions.map(s => s.id)), [sessions]);
  const ngos = useMemo(() => {
    const map = new Map<string, string>();
    for (const ngo of ngoMeta?.ngos ?? []) map.set(ngo.id, ngo.name);
    for (const row of assignments) {
      if (row.ngo_id) map.set(row.ngo_id, row.ngo_name || row.ngo_id);
    }
    const preferred = ['BSCT', 'AFLF', 'MANN'];
    return [...map.entries()]
      .filter(([, name]) => String(name).trim().toLowerCase() !== 'other')
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => {
        const ai = preferred.indexOf(a.name.toUpperCase());
        const bi = preferred.indexOf(b.name.toUpperCase());
        if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
        return a.name.localeCompare(b.name);
      });
  }, [ngoMeta, assignments]);

  const ngoSessionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of assignments) {
      if (row.ngo_id === selectedNgoId && row.session_id && liveSessionIds.has(row.session_id)) {
        ids.add(row.session_id);
      }
    }
    return [...ids];
  }, [assignments, selectedNgoId, liveSessionIds]);

  useEffect(() => {
    if (ngos.length === 0) {
      setSelectedNgoId('');
      return;
    }
    if (!selectedNgoId || !ngos.some(n => n.id === selectedNgoId)) {
      setSelectedNgoId(ngos[0].id);
    }
  }, [ngos, selectedNgoId]);

  const seedKey = `${selectedNgoId}|${ngoSessionIds.join(',')}`;
  useEffect(() => {
    if (!selectedNgoId || ngoSessionIds.length === 0) {
      setPrompt('');
      setActiveDraft(false);
      return;
    }
    const first = plugin.sessionConfig?.[ngoSessionIds[0]] ?? {};
    setPrompt(String(first.systemPrompt ?? plugin.config?.systemPrompt ?? ''));
    const activeSessions = plugin.activeSessions ?? [];
    setActiveDraft(
      ngoSessionIds.every(id => activeSessions.includes('*') || activeSessions.includes(id)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey, plugin.id]);

  const selectedNgo = ngos.find(n => n.id === selectedNgoId) || null;
  const ngoName = selectedNgo?.name || '';

  const save = async () => {
    if (!selectedNgoId || ngoSessionIds.length === 0) return;
    setSaving(true);
    try {
      await Promise.all(ngoSessionIds.map(async sessionId => {
        const existing = plugin.sessionConfig?.[sessionId] ?? {};
        const full = { ...plugin.config, ...existing, systemPrompt: prompt };
        const res = await pluginsApi.updateSessionConfig(
          plugin.id,
          sessionId,
          sparseSessionOverride(full, plugin),
        );
        if (!res.success) throw new Error(res.message);
      }));

      const current = plugin.activeSessions ?? [];
      let next: string[] | null = null;
      if (activeDraft) {
        if (!current.includes('*')) {
          next = [...new Set([...current, ...ngoSessionIds])];
        }
      } else if (current.includes('*')) {
        next = sessions.map(s => s.id).filter(id => !ngoSessionIds.includes(id));
      } else {
        next = current.filter(id => !ngoSessionIds.includes(id));
      }
      const changed = next
        && (next.length !== current.length
          || next.some(id => !current.includes(id))
          || current.some(id => !next.includes(id)));
      if (changed) await pluginsApi.setSessions(plugin.id, next!);

      void queryClient.invalidateQueries({ queryKey: queryKeys.plugins });
      toast.success(
        t('plugins.toasts.savedTitle'),
        activeDraft
          ? `AI prompt active on ${ngoSessionIds.length} ${ngoName} number${ngoSessionIds.length === 1 ? '' : 's'}.`
          : `AI responder switched off for ${ngoName}.`,
      );
    } catch (err) {
      toast.error(t('plugins.toasts.saveFailed'), err instanceof Error ? err.message : t('common.unknownError'));
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <div className="config-ui-status"><Loader2 size={18} className="animate-spin" /></div>;
  }

  if (ngos.length === 0) {
    return <div className="faq-ngo-empty">{t('plugins.sessions.noSessions')}</div>;
  }

  return (
    <div className="faq-ngo">
      <div className="faq-ngo-tabs" role="tablist" aria-label="NGOs">
        {ngos.map(ngo => {
          const ids = assignments
            .filter(row => row.ngo_id === ngo.id && row.session_id && liveSessionIds.has(row.session_id))
            .map(row => row.session_id);
          const activeSessions = plugin.activeSessions ?? [];
          const active = ids.length > 0
            && ids.every(id => activeSessions.includes('*') || activeSessions.includes(id));
          return (
            <button
              key={ngo.id}
              type="button"
              role="tab"
              aria-selected={ngo.id === selectedNgoId}
              className={`faq-ngo-tab${ngo.id === selectedNgoId ? ' active' : ''}`}
              onClick={() => setSelectedNgoId(ngo.id)}
            >
              <span className={`faq-ngo-dot${active ? ' on' : ''}`} />
              {ngo.name}
            </button>
          );
        })}
      </div>

      {selectedNgo && (
        <div className="faq-ngo-body">
          <div className="faq-ngo-head">
            <div>
              <h3>{ngoName}</h3>
              <small>
                {ngoSessionIds.length > 0
                  ? `This prompt is used on all ${ngoSessionIds.length} ${ngoName} WhatsApp number${ngoSessionIds.length === 1 ? '' : 's'}.`
                  : `No WhatsApp session is assigned to ${ngoName} yet.`}
              </small>
            </div>
            <label className="faq-ngo-switch">
              <span>{activeDraft ? 'Active' : 'Inactive'}</span>
              <span className="toggle-switch">
                <input
                  type="checkbox"
                  checked={activeDraft}
                  onChange={e => setActiveDraft(e.target.checked)}
                  disabled={ngoSessionIds.length === 0}
                  aria-label={`Activate AI responder for ${ngoName}`}
                />
                <span className="toggle-slider" />
              </span>
            </label>
          </div>

          <div className="config-form">
            <div className="form-group">
              <label htmlFor={promptId}>System prompt for {ngoName}</label>
              <textarea
                id={promptId}
                rows={6}
                value={prompt}
                placeholder={`e.g. You are the WhatsApp assistant for ${ngoName}. Answer questions about our work, donations and receipts in a warm, concise tone.`}
                onChange={e => setPrompt(e.target.value)}
              />
              <small>
                Provider API URL, key, model and rate limits come from the Configuration tab.
                Leave this blank to inherit the global system prompt.
              </small>
            </div>
          </div>

          <div className="faq-ngo-actions">
            <span className="faq-ngo-hint">
              {ngoSessionIds.length === 0
                ? 'Assign this NGO to a WhatsApp session first (WhatsApp Bulk → Assignments).'
                : activeDraft
                  ? 'Saving applies this prompt to every number of this NGO.'
                  : 'Saving will switch the AI responder off on every number of this NGO.'}
            </span>
            <button
              type="button"
              className="btn-primary"
              onClick={() => void save()}
              disabled={saving || ngoSessionIds.length === 0}
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : `Save for ${ngoName}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SessionsTab({ plugin }: { plugin: Plugin }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: sessions = [] } = useSessionsQuery();

  // ── Activation ────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<'all' | 'specific'>(plugin.activeSessions.includes('*') ? 'all' : 'specific');
  const [picked, setPicked] = useState<Set<string>>(new Set(plugin.activeSessions.filter(s => s !== '*')));
  const [savingAct, setSavingAct] = useState(false);

  const saveActivation = async () => {
    setSavingAct(true);
    try {
      await pluginsApi.setSessions(plugin.id, mode === 'all' ? ['*'] : Array.from(picked));
      void queryClient.invalidateQueries({ queryKey: queryKeys.plugins });
      toast.success(t('plugins.toasts.savedTitle'), t('plugins.toasts.savedDesc'));
    } catch (err) {
      toast.error(t('plugins.toasts.saveFailed'), err instanceof Error ? err.message : t('common.unknownError'));
    } finally {
      setSavingAct(false);
    }
  };

  // ── Per-session config override ───────────────────────────────────────────
  // `properties` is optional in practice: the gateway does not validate a manifest's configSchema.
  const hasSchema = Object.keys(plugin.configSchema?.properties ?? {}).length > 0;
  const hasUi = !!plugin.configUi;
  const lzProps = localizePlugin(plugin, i18n.language).configSchema?.properties;
  const [selSession, setSelSession] = useState<string>('');
  const [overrideCfg, setOverrideCfg] = useState<Record<string, unknown>>({});
  const [savingOverride, setSavingOverride] = useState(false);
  const overrideFormRef = useRef<HTMLFormElement>(null);
  // The session selected now, read by a request that resolves after the operator may have switched.
  const selSessionRef = useRef(selSession);
  useEffect(() => {
    selSessionRef.current = selSession;
  }, [selSession]);

  // Seed the override form from the resolved slice (the session's override value where set, else base).
  // Keyed on selSession + plugin.id (NOT the plugin object): `configPlugin` is derived from the live
  // query, so it gets a new reference on every refetch (refetchOnWindowFocus) — re-running on that
  // would wipe the operator's in-progress edits. Reseed only when the selected session/plugin changes.
  useEffect(() => {
    const props = plugin.configSchema?.properties;
    if (!selSession || !props) {
      setOverrideCfg({});
      return;
    }
    const ov = plugin.sessionConfig?.[selSession] ?? {};
    const seeded: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(props)) {
      seeded[key] = key in ov ? ov[key] : (plugin.config[key] ?? emptyForField(field));
    }
    setOverrideCfg(seeded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selSession, plugin.id]);

  const saveOverride = async () => {
    if (!selSession || !plugin.configSchema?.properties) return;
    // Enforce the schema's HTML constraint hints (required/min/max/pattern) before saving.
    if (overrideFormRef.current && !overrideFormRef.current.reportValidity()) return;
    setSavingOverride(true);
    try {
      // A rejected save answers 200 + {success:false}; the absence of a throw is not success.
      const res = await pluginsApi.updateSessionConfig(
        plugin.id,
        selSession,
        sparseSessionOverride(overrideCfg, plugin),
      );
      if (!res.success) throw new Error(res.message);
      void queryClient.invalidateQueries({ queryKey: queryKeys.plugins });
      toast.success(t('plugins.toasts.savedTitle'), t('plugins.toasts.savedDesc'));
    } catch (err) {
      toast.error(t('plugins.toasts.saveFailed'), err instanceof Error ? err.message : t('common.unknownError'));
    } finally {
      setSavingOverride(false);
    }
  };

  const clearOverride = async () => {
    const sid = selSession;
    if (!sid) return;
    setSavingOverride(true);
    try {
      const res = await pluginsApi.updateSessionConfig(plugin.id, sid, {});
      if (!res.success) throw new Error(res.message);
      // The seed effect does not re-run on the refetch, so reseed from Global here (the seed with an empty
      // override). Left as it was, the form keeps the cleared values and the next save pins them back.
      // Skipped when the operator has since picked another session: the form now holds that one's values.
      const props = plugin.configSchema?.properties;
      if (props && selSessionRef.current === sid) {
        setOverrideCfg(
          Object.fromEntries(
            Object.entries(props).map(([key, field]) => [key, plugin.config[key] ?? emptyForField(field)]),
          ),
        );
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.plugins });
      toast.success(t('plugins.toasts.savedTitle'), t('plugins.toasts.savedDesc'));
    } catch (err) {
      toast.error(t('plugins.toasts.saveFailed'), err instanceof Error ? err.message : t('common.unknownError'));
    } finally {
      setSavingOverride(false);
    }
  };

  const hasOverride = (sid: string): boolean => Object.keys(plugin.sessionConfig?.[sid] ?? {}).length > 0;

  return (
    <div className="sessions-tab">
      <section className="sessions-section">
        <h3>{t('plugins.sessions.activationTitle')}</h3>
        <small>{t('plugins.sessions.activationDesc')}</small>
        <label className="sessions-radio">
          <input type="radio" name="activation" checked={mode === 'all'} onChange={() => setMode('all')} />
          <span>{t('plugins.sessions.allSessions')}</span>
        </label>
        <label className="sessions-radio">
          <input type="radio" name="activation" checked={mode === 'specific'} onChange={() => setMode('specific')} />
          <span>{t('plugins.sessions.specificSessions')}</span>
        </label>
        {mode === 'specific' &&
          (sessions.length === 0 ? (
            <p className="sessions-empty">{t('plugins.sessions.noSessions')}</p>
          ) : (
            <div className="sessions-checklist">
              {sessions.map(s => (
                <label key={s.id} className="sessions-check">
                  <input
                    type="checkbox"
                    checked={picked.has(s.id)}
                    onChange={e => {
                      const next = new Set(picked);
                      if (e.target.checked) next.add(s.id);
                      else next.delete(s.id);
                      setPicked(next);
                    }}
                  />
                  <span>{s.name || s.id}</span>
                </label>
              ))}
            </div>
          ))}
        <button className="btn-primary" onClick={() => void saveActivation()} disabled={savingAct}>
          {savingAct ? <Loader2 size={16} className="animate-spin" /> : t('plugins.sessions.saveActivation')}
        </button>
      </section>

      {(hasSchema || hasUi) && (
        <section className="sessions-section">
          <h3>{t('plugins.sessions.perSessionTitle')}</h3>
          <small>{t('plugins.sessions.perSessionDesc')}</small>
          <div className="sessions-ngo-hint">{t('plugins.sessions.perSessionNgoHint')}</div>
          {/* The heading above is a sibling, not a label, so the select had no accessible name of its
              own: a screen reader announced an unnamed combobox. */}
          <select
            className="sessions-select"
            aria-label={t('plugins.sessions.selectSession')}
            value={selSession}
            onChange={e => setSelSession(e.target.value)}
          >
            <option value="">{t('plugins.sessions.selectSession')}</option>
            {sessions.map(s => (
              <option key={s.id} value={s.id}>
                {(s.name || s.id) + (hasOverride(s.id) ? ' ●' : '')}
              </option>
            ))}
          </select>
          {selSession && hasUi ? (
            <PluginConfigUi key={selSession} plugin={plugin} sessionId={selSession} />
          ) : selSession && hasSchema ? (
            <>
              <form ref={overrideFormRef} className="config-form" onSubmit={e => e.preventDefault()}>
                {Object.entries(lzProps ?? plugin.configSchema?.properties ?? {}).map(([key, field]) => (
                  <ConfigField
                    key={key}
                    field={field}
                    fieldKey={key}
                    pluginId={plugin.id}
                    label={field.title || key}
                    value={overrideCfg[key]}
                    onChange={v => setOverrideCfg({ ...overrideCfg, [key]: v })}
                  />
                ))}
              </form>
              <div className="sessions-override-actions">
                <button className="btn-secondary" onClick={() => void clearOverride()} disabled={savingOverride}>
                  {t('plugins.sessions.clearOverride')}
                </button>
                <button className="btn-primary" onClick={() => void saveOverride()} disabled={savingOverride}>
                  {savingOverride ? <Loader2 size={16} className="animate-spin" /> : t('plugins.sessions.saveOverride')}
                </button>
              </div>
            </>
          ) : null}
        </section>
      )}
    </div>
  );
}

/**
 * The remote catalog and its read. The mount prefetch can still be in flight when a later read starts (an install or
 * an uninstall changes the installed flags), so only the latest read may publish: an older answer finishing after it
 * would put back flags from before.
 */
function useCatalog() {
  const [catalog, setCatalog] = useState<CatalogPlugin[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const latestRead = useRef(0);

  const loadCatalog = useCallback(async () => {
    const read = ++latestRead.current;
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const entries = await pluginsApi.catalog();
      if (read === latestRead.current) setCatalog(entries);
    } catch (err) {
      // The error renders only inside the Catalog tab, next to a Refresh button, so a failed
      // page-mount prefetch stays quiet on the page itself (it just means no update chips). It
      // must still be recorded: a tab opened while that prefetch was in flight would otherwise
      // settle on "No plugins in the catalog." with no way to retry.
      if (read === latestRead.current) setCatalogError(err instanceof Error ? err.message : String(err));
    } finally {
      if (read === latestRead.current) setCatalogLoading(false);
    }
  }, []);

  return { catalog, catalogLoading, catalogError, loadCatalog };
}

export default function Plugins() {
  const { t, i18n } = useTranslation();
  useDocumentTitle(t('plugins.title'));
  const toast = useToast();
  const queryClient = useQueryClient();
  const {
    data: plugins = [],
    isLoading: loadingPlugins,
    error: queryError,
    // A read that never produced a list says nothing about what is installed. A failed refetch keeps its data.
    isLoadingError: neverLoaded,
  } = usePluginsQuery();
  const loading = loadingPlugins;
  const error = queryError instanceof Error ? queryError.message : null;
  // Ids of plugins with a lifecycle action in flight. One per plugin, so another plugin's action
  // settling first does not re-enable this plugin's buttons while its own request is pending.
  const [actionLoading, setActionLoading] = useState<ReadonlySet<string>>(new Set());
  const startAction = (id: string) => setActionLoading(s => new Set(s).add(id));
  const endAction = (id: string) =>
    setActionLoading(s => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
  const schemaFormRef = useRef<HTMLFormElement>(null);

  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configPluginId, setConfigPluginId] = useState<string | null>(null);
  // Derive the open plugin from the LIVE query so the modal (esp. the Sessions tab) reflects the
  // latest activeSessions/sessionConfig after a save + invalidate — not a stale open-time snapshot.
  const configPlugin = configPluginId ? (plugins.find(p => p.id === configPluginId) ?? null) : null;
  const [configTab, setConfigTab] = useState<'config' | 'sessions' | 'instances' | 'ngos'>('config');
  const [savingConfig, setSavingConfig] = useState(false);
  // Values for a schema-driven (non-engine) plugin's config form, keyed by configSchema property.
  const [schemaConfig, setSchemaConfig] = useState<Record<string, unknown>>({});
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [installFile, setInstallFile] = useState<File | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installMode, setInstallMode] = useState<'upload' | 'catalog'>('upload');
  const { catalog, catalogLoading, catalogError, loadCatalog } = useCatalog();
  const [catalogSearch, setCatalogSearch] = useState('');
  const [installingId, setInstallingId] = useState<string | null>(null);

  const refetchAll = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.plugins });
  };

  // Required-config gate: a plugin whose schema declares required fields that are still unset fails
  // INSIDE the sandbox with a raw "<id>: <field> is required" error and flips the card to ERROR.
  // Open the config modal instead so the user completes the fields first — cures the whole class
  // (after-hours `schedule`/`awayMessage`, faq-bot `rules`, any catalog plugin with required fields).
  const handleToggle = async (plugin: Plugin) => {
    if (plugin.status !== 'enabled') {
      const missing = missingRequiredConfig(plugin);
      if (missing.length > 0) {
        // Interpolation, not a template literal: with the field list baked into the default string the
        // key could never be translated without silently dropping it.
        toast.warning(
          t('plugins.toasts.configRequiredTitle'),
          t('plugins.toasts.configRequiredDesc', { fields: missing.join(', ') }),
        );
        handleOpenConfig(plugin);
        return;
      }
    }
    startAction(plugin.id);
    try {
      // Both endpoints report lifecycle failures as 200 + {success:false} — surface them instead of
      // silently refetching. The card flips to ERROR either way, but without the message the operator
      // has to go to the logs to learn why.
      const res =
        plugin.status === 'enabled' ? await pluginsApi.disable(plugin.id) : await pluginsApi.enable(plugin.id);
      if (!res.success) {
        toast.warning(
          plugin.status === 'enabled' ? t('plugins.toasts.disableFailedTitle') : t('plugins.toasts.enableFailedTitle'),
          res.message,
        );
      }
      refetchAll();
    } catch (err) {
      toast.error(
        t('plugins.toasts.errorTitle'),
        err instanceof Error ? err.message : t('plugins.toasts.errorDefault'),
      );
    } finally {
      endAction(plugin.id);
    }
  };

  const handleHealthCheck = async (pluginId: string) => {
    startAction(pluginId);
    try {
      const result = await pluginsApi.healthCheck(pluginId);
      if (result.healthy) {
        toast.success(t('plugins.toasts.healthOk'), result.message);
      } else {
        toast.warning(t('plugins.toasts.healthFail'), result.message);
      }
    } catch (err) {
      toast.error(t('plugins.toasts.healthError'), err instanceof Error ? err.message : t('common.unknownError'));
    } finally {
      endAction(pluginId);
    }
  };

  const handleOpenConfig = (plugin: Plugin) => {
    setConfigPluginId(plugin.id);
    // The FAQ and AI Responder are operated per NGO, so open straight on their NGO tab. The
    // tab value stays 'sessions' (its label is what changes) because that is the branch the
    // NGO editor renders under.
    setConfigTab(
      plugin.id === 'faq-bot' ? 'ngos' : plugin.id === 'ai-responder' ? 'sessions' : 'config',
    );
    // Seed the schema form from the plugin's saved config, falling back to each field's default.
    if (plugin.configSchema?.properties) {
      const initial: Record<string, unknown> = {};
      for (const [key, field] of Object.entries(plugin.configSchema.properties)) {
        initial[key] = plugin.config[key] ?? emptyForField(field);
      }
      setSchemaConfig(initial);
    }
    setShowConfigModal(true);
  };

  const handleSaveSchemaConfig = async () => {
    if (!configPlugin) return;
    // Enforce the schema's HTML constraint hints (required/min/max/pattern) before saving.
    if (schemaFormRef.current && !schemaFormRef.current.reportValidity()) return;
    setSavingConfig(true);
    try {
      // 200 + {success:false} is how a rejected save arrives; without this the modal closed on a
      // "Saved!" toast and the operator's edit was silently gone on the next open.
      const res = await pluginsApi.updateConfig(
        configPlugin.id,
        fillClearedFields(schemaConfig, configPlugin.config, configPlugin.configSchema?.properties ?? {}),
      );
      if (!res.success) throw new Error(res.message);
      void queryClient.invalidateQueries({ queryKey: queryKeys.plugins });
      toast.success(t('plugins.toasts.savedTitle'), t('plugins.toasts.savedDesc'));
      setShowConfigModal(false);
    } catch (err) {
      toast.error(t('plugins.toasts.saveFailed'), err instanceof Error ? err.message : t('common.unknownError'));
    } finally {
      setSavingConfig(false);
    }
  };

  const handleInstall = async () => {
    if (!installFile) return;
    if (installFile.size > 5 * 1024 * 1024) {
      toast.error(
        t('plugins.toasts.installFailed', 'Install failed'),
        t('plugins.installModal.tooLarge', 'The file exceeds the 5 MB limit.'),
      );
      return;
    }
    setInstalling(true);
    try {
      const installed = await pluginsApi.install(installFile);
      refetchAll();
      // The catalog's installed and update flags are computed per request, so they changed too.
      void loadCatalog();
      toast.success(t('plugins.toasts.installed', 'Plugin installed'), installed.name);
      setShowInstallModal(false);
      setInstallFile(null);
    } catch (err) {
      toast.error(t('plugins.toasts.installFailed', 'Install failed'), err instanceof Error ? err.message : '');
    } finally {
      setInstalling(false);
    }
  };

  // Load the catalog when the Catalog tab opens with nothing to show: the first time, or again
  // after an earlier load failed.
  useEffect(() => {
    if (showInstallModal && installMode === 'catalog' && catalog.length === 0 && !catalogLoading) {
      void loadCatalog();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInstallModal, installMode]);

  // Prefetch once on mount so installed-plugin cards can flag newer catalog versions without the
  // user having to open the Install drawer first. An unreachable catalog just hides the chips.
  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  // Catalog entries with a strictly newer version than the installed one, keyed by plugin id —
  // drives both the per-card update chip and the counter on the Install button.
  const updatesById = useMemo(
    () => new Map(catalog.filter(entry => entry.updateAvailable).map(entry => [entry.id, entry])),
    [catalog],
  );

  const handleInstallFromCatalog = async (entry: CatalogPlugin) => {
    if (!entry.download) {
      toast.error(
        t('plugins.toasts.installFailed', 'Install failed'),
        t('plugins.catalog.noDownload', 'This catalog entry has no download URL.'),
      );
      return;
    }
    setInstallingId(entry.id);
    try {
      const installed = await pluginsApi.installFromUrl(entry.download);
      refetchAll();
      await loadCatalog();
      toast.success(t('plugins.toasts.installed', 'Plugin installed'), installed.name);
    } catch (err) {
      toast.error(t('plugins.toasts.installFailed', 'Install failed'), err instanceof Error ? err.message : '');
    } finally {
      setInstallingId(null);
    }
  };

  const handleUpdateFromCatalog = async (entry: CatalogPlugin) => {
    if (!entry.download) {
      toast.error(
        t('plugins.toasts.updateFailed', 'Update failed'),
        t('plugins.catalog.noDownload', 'This catalog entry has no download URL.'),
      );
      return;
    }
    setInstallingId(entry.id);
    try {
      const updated = await pluginsApi.updateFromUrl(entry.id, entry.download);
      refetchAll();
      await loadCatalog();
      toast.success(t('plugins.catalog.updated', 'Plugin updated'), `${updated.name} v${updated.version}`);
    } catch (err) {
      toast.error(t('plugins.toasts.updateFailed', 'Update failed'), err instanceof Error ? err.message : '');
    } finally {
      setInstallingId(null);
    }
  };

  const handleUninstall = async (plugin: Plugin) => {
    if (!window.confirm(t('plugins.uninstallConfirm', { name: localizePlugin(plugin, i18n.language).name }))) return;
    startAction(plugin.id);
    try {
      const res = await pluginsApi.uninstall(plugin.id);
      refetchAll();
      void loadCatalog();
      // The server ships with this page, so any answer but its plain one reports work left behind (a registry entry
      // the uninstall could not drop), and with the card gone the answer is all that is left to say so. It stays until
      // closed: it names the call left to make, and is too long to read before a timed toast leaves.
      if (res.message === `Plugin ${plugin.id} uninstalled successfully`) {
        toast.success(
          t('plugins.toasts.uninstalled', 'Plugin uninstalled'),
          localizePlugin(plugin, i18n.language).name,
        );
      } else {
        toast.addToast({
          type: 'warning',
          title: t('plugins.toasts.uninstalledWithWarning'),
          message: res.message,
          duration: 0,
        });
      }
    } catch (err) {
      toast.error(t('plugins.toasts.uninstallFailed', 'Uninstall failed'), err instanceof Error ? err.message : '');
    } finally {
      endAction(plugin.id);
    }
  };

  if (loading) {
    return (
      <div
        className="plugins-page"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}
      >
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  // Engines are configured under Infrastructure (Engine Configuration tile), not here — keep them
  // out of the plugin grid, the counts and the rail so the Plugins page is extensions-only.
  const visiblePlugins = plugins.filter(p => p.type !== 'engine');
  const enabledCount = visiblePlugins.filter(p => p.status === 'enabled').length;
  const activePlugins = visiblePlugins.filter(p => p.status === 'enabled');

  return (
    <div className="plugins-page">
      <PageHeader
        title={t('plugins.title')}
        subtitle={t('plugins.subtitle')}
        actions={
          <>
            <button className="btn-secondary" onClick={refetchAll}>
              <RefreshCw size={16} />
              {t('plugins.refresh')}
            </button>
            <button className="btn-primary" onClick={() => setShowInstallModal(true)}>
              <Upload size={16} />
              {t('plugins.install', 'Install plugin')}
              {updatesById.size > 0 && (
                <span className="install-update-count" title={t('plugins.catalog.updateAvailable', 'Update available')}>
                  {updatesById.size}
                </span>
              )}
            </button>
          </>
        }
      />

      {error && (
        <div className="error-banner">
          <AlertCircle size={20} />
          <span className="error-banner-text">{error}</span>
        </div>
      )}

      <div className="plugins-summary">
        <div className="summary-stats">
          <div className="summary-stat">
            <span className="summary-stat-num">{neverLoaded ? '-' : enabledCount}</span>
            <span className="summary-stat-label">{t('plugins.rail.enabled', 'enabled')}</span>
          </div>
          <span className="summary-divider" aria-hidden="true" />
          <div className="summary-stat">
            <span className="summary-stat-num">{neverLoaded ? '-' : visiblePlugins.length}</span>
            <span className="summary-stat-label">{t('plugins.rail.installed', 'installed')}</span>
          </div>
        </div>

        <div className="summary-active">
          <span className="summary-label">{t('plugins.rail.active', 'Active plugins')}</span>
          {neverLoaded ? null : activePlugins.length === 0 ? (
            <span className="summary-empty">{t('plugins.rail.none', 'None enabled yet')}</span>
          ) : (
            <ul className="summary-active-list">
              {activePlugins.map(p => (
                <li key={p.id} className="summary-active-chip">
                  <span className="status-dot enabled" />
                  {localizePlugin(p, i18n.language).name}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="plugins-grid">
        {visiblePlugins.map(plugin => {
              const TypeIcon = pluginTypeIcons[plugin.type as PluginType] || Puzzle;
              const isLoading = actionLoading.has(plugin.id);
              const lz = localizePlugin(plugin, i18n.language);

              return (
                <div key={plugin.id} className="plugin-card">
                  <div className={`plugin-card-header type-${plugin.type}`}>
                    <div className="plugin-info">
                      <div className="plugin-icon-wrapper">
                        <TypeIcon size={18} />
                      </div>
                      <div className="plugin-titles">
                        <h3 className="plugin-name" title={lz.name}>{lz.name}</h3>
                        <span className="plugin-meta">
                          v{plugin.version}
                          <span className="plugin-meta-sep" aria-hidden="true">·</span>
                          {t(`plugins.types.${plugin.type}`, { defaultValue: plugin.type })}
                          {updatesById.has(plugin.id) && (
                            <button
                              type="button"
                              className="plugin-update-chip"
                              title={`${t('plugins.catalog.updateAvailable', 'Update available')} (v${plugin.version} → v${updatesById.get(plugin.id)!.version})`}
                              aria-label={t('common.joinedName', {
                                first: `v${updatesById.get(plugin.id)!.version}`,
                                second: t('plugins.catalog.updateAvailable', 'Update available'),
                              })}
                              onClick={() => {
                                // Land the user directly on this plugin's catalog entry, where the
                                // existing Update button (and its confirmation flow) lives.
                                setInstallMode('catalog');
                                setCatalogSearch(plugin.id);
                                setShowInstallModal(true);
                              }}
                            >
                              <ArrowUpCircle size={12} />v{updatesById.get(plugin.id)!.version}
                            </button>
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="plugin-header-side">
                      {plugin.builtIn && <span className="plugin-builtin-badge">{t('plugins.builtIn')}</span>}
                      <span className={`plugin-status-pill ${plugin.status}`}>
                        <span className={`status-dot ${plugin.status}`} />
                        {t(`plugins.statuses.${plugin.status}`, { defaultValue: plugin.status })}
                      </span>
                    </div>
                  </div>

                  <div className="plugin-card-body">
                    <p className="plugin-description">{lz.description || t('plugins.noDescription')}</p>

                    {plugin.error && (
                      <div className="plugin-error">
                        <p className="plugin-error-text">{plugin.error}</p>
                      </div>
                    )}

                    {plugin.provides && plugin.provides.length > 0 && (
                      <div className="plugin-provides">
                        {plugin.provides.map(item => (
                          <span key={item} className="provides-tag">
                            {item}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="plugin-actions">
                      <button
                        onClick={() => handleToggle(plugin)}
                        disabled={isLoading}
                        className={`btn-toggle ${plugin.status === 'enabled' ? 'disable' : 'enable'}`}
                      >
                        {isLoading ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : plugin.status === 'enabled' ? (
                          <>
                            <PowerOff size={16} />
                            {t('plugins.disable')}
                          </>
                        ) : (
                          <>
                            <Power size={16} />
                            {t('plugins.enable')}
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => handleHealthCheck(plugin.id)}
                        disabled={isLoading}
                        className="btn-action"
                        title={t('plugins.healthCheck')}
                      >
                        <CheckCircle size={16} />
                      </button>

                      <button
                        className="btn-action"
                        title={t('plugins.configure')}
                        onClick={() => handleOpenConfig(plugin)}
                      >
                        <Settings size={16} />
                      </button>

                      {!plugin.builtIn && (
                        <button
                          className="btn-action btn-action-danger"
                          title={t('plugins.uninstall', 'Uninstall')}
                          onClick={() => void handleUninstall(plugin)}
                          disabled={isLoading}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
      </div>

      {visiblePlugins.length === 0 && !loading && !neverLoaded && (
        <div className="empty-state">
          <Puzzle size={64} />
          <h3>{t('plugins.empty.title')}</h3>
          <p>{t('plugins.empty.description')}</p>
        </div>
      )}

      {showInstallModal && (
        <Modal
          open
          onClose={() => setShowInstallModal(false)}
          title={t('plugins.installModal.title', 'Install a plugin')}
          className="install-modal"
          closeLabel={t('common.close')}
          headerExtra={
            <div className="install-tabs" role="tablist">
              <button
                role="tab"
                aria-selected={installMode === 'upload'}
                className={`install-tab${installMode === 'upload' ? ' active' : ''}`}
                onClick={() => setInstallMode('upload')}
              >
                <Upload size={15} /> {t('plugins.installModal.tabUpload', 'Upload .zip')}
              </button>
              <button
                role="tab"
                aria-selected={installMode === 'catalog'}
                className={`install-tab${installMode === 'catalog' ? ' active' : ''}`}
                onClick={() => setInstallMode('catalog')}
              >
                <Globe size={15} /> {t('plugins.installModal.tabCatalog', 'Catalog')}
              </button>
            </div>
          }
          footer={
            installMode === 'upload' ? (
              <>
                <button className="btn-secondary" onClick={() => setShowInstallModal(false)} disabled={installing}>
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  className="btn-primary"
                  onClick={() => void handleInstall()}
                  disabled={!installFile || installing}
                >
                  {installing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                  {t('plugins.install', 'Install plugin')}
                </button>
              </>
            ) : (
              <button className="btn-secondary" onClick={() => setShowInstallModal(false)}>
                {t('common.close', 'Close')}
              </button>
            )
          }
        >
          {/* Trusted-code warning sits ABOVE the tab conditional: upload and catalog land the
              same payload in the same process, so it must show on both. */}
          <p className="install-hint install-hint-warning">
            <AlertCircle size={15} />
            {t(
              'plugins.installModal.trustWarning',
              "Plugins run with the gateway's full process privileges — the sandbox contains crashes, not malicious code. Install only plugins you trust.",
            )}
          </p>
          {installMode === 'upload' ? (
            <>
              <p className="install-hint">
                {t(
                  'plugins.installModal.hint',
                  'Upload a plugin packaged as a .zip (with a manifest.json). It runs sandboxed once enabled.',
                )}
              </p>
              <label className={`install-drop${installFile ? ' has-file' : ''}`}>
                <input
                  type="file"
                  accept=".zip,application/zip"
                  onChange={e => setInstallFile(e.target.files?.[0] ?? null)}
                />
                <Upload size={28} />
                <span className="install-drop-name">
                  {installFile ? installFile.name : t('plugins.installModal.choose', 'Choose a .zip file…')}
                </span>
              </label>
              {/* Point first-time users at the Catalog tab — otherwise the marketplace is invisible
                  and an operator only ever discovers plugins by hearing about one out-of-band. */}
              <p className="install-hint install-hint-sub">
                {t('plugins.installModal.catalogTeaser', 'Looking for plugins?')}{' '}
                <button type="button" className="install-inline-link" onClick={() => setInstallMode('catalog')}>
                  {t('plugins.installModal.tabCatalog', 'Catalog')}
                </button>{' '}
                {t('plugins.installModal.catalogTeaserSuffix', 'browses the official marketplace.')}
              </p>
            </>
          ) : (
            <>
              <p className="install-hint">
                {t(
                  'plugins.installModal.catalogHint',
                  'Install directly from the OpenWA plugin catalog. The .zip is fetched server-side through the SSRF guard, then validated and sandboxed.',
                )}
              </p>
              {catalogLoading ? (
                <div className="catalog-empty">
                  <Loader2 size={20} className="animate-spin" />
                </div>
              ) : catalogError ? (
                <div className="catalog-empty catalog-error">
                  <AlertCircle size={16} /> {catalogError}
                  <button className="btn-secondary" onClick={() => void loadCatalog()}>
                    {t('plugins.refresh', 'Refresh')}
                  </button>
                </div>
              ) : catalog.length === 0 ? (
                <div className="catalog-empty">{t('plugins.catalog.empty', 'No plugins in the catalog.')}</div>
              ) : (
                (() => {
                  const q = catalogSearch.trim().toLowerCase();
                  const filtered = q
                    ? catalog.filter(e =>
                        [e.name, e.description, e.author, e.id].some(f => f?.toLowerCase().includes(q)),
                      )
                    : catalog;
                  return (
                    <>
                      <div className="catalog-search">
                        <Search size={15} />
                        <input
                          type="text"
                          value={catalogSearch}
                          onChange={e => setCatalogSearch(e.target.value)}
                          placeholder={t('plugins.catalog.searchPlaceholder', 'Search plugins…')}
                        />
                      </div>
                      {filtered.length === 0 ? (
                        <div className="catalog-empty">
                          {t('plugins.catalog.noMatch', 'No plugins match your search.')}
                        </div>
                      ) : (
                        <div className="catalog-list">
                          {filtered.map(entry => {
                            const lz = localizePlugin(entry, i18n.language);
                            return (
                              <div className="catalog-row" key={entry.id}>
                                <div className="catalog-row-info">
                                  <div className="catalog-row-name">
                                    {lz.name} <span className="catalog-row-version">v{entry.version}</span>
                                  </div>
                                  {lz.description && <div className="catalog-row-desc">{lz.description}</div>}
                                  <div className="catalog-row-meta">
                                    {entry.author && <span className="catalog-row-author">{entry.author}</span>}
                                    {entry.updateAvailable && (
                                      <span className="catalog-badge update">
                                        {t('plugins.catalog.updateAvailable', 'Update available')} (v
                                        {entry.installedVersion} → v{entry.version})
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="catalog-row-action">
                                  {entry.installed ? (
                                    entry.updateAvailable ? (
                                      <button
                                        className="btn-update"
                                        disabled={installingId !== null || !entry.download}
                                        onClick={() => void handleUpdateFromCatalog(entry)}
                                      >
                                        {installingId === entry.id ? (
                                          <Loader2 size={15} className="animate-spin" />
                                        ) : (
                                          <Download size={15} />
                                        )}
                                        {t('plugins.catalog.update', 'Update')}
                                      </button>
                                    ) : (
                                      <span className="catalog-installed">
                                        <CheckCircle size={15} /> {t('plugins.catalog.installed', 'Installed')}
                                      </span>
                                    )
                                  ) : (
                                    <button
                                      className="btn-primary"
                                      disabled={installingId !== null || !entry.download}
                                      onClick={() => void handleInstallFromCatalog(entry)}
                                    >
                                      {installingId === entry.id ? (
                                        <Loader2 size={15} className="animate-spin" />
                                      ) : (
                                        <Download size={15} />
                                      )}
                                      {t('plugins.catalog.install', 'Install')}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  );
                })()
              )}
            </>
          )}
        </Modal>
      )}

      {showConfigModal &&
        configPlugin &&
        (() => {
          const lz = localizePlugin(configPlugin, i18n.language);
          // Session-scoped plugins get a Configuration/Sessions split; ingress-capable plugins add an
          // Instances tab. Either (or both) turns the modal into a tabbed view.
          const showTabs = configPlugin.sessionScoped !== false || configPlugin.ingressCapable;
          return (
            <Modal
              open
              onClose={() => setShowConfigModal(false)}
              title={t('plugins.config.title', { name: lz.name })}
              className="config-modal"
              closeLabel={t('common.close')}
              subheader={
                showTabs ? (
                  <div className="config-modal-tabbar">
                    <div className="modal-tabs" role="tablist">
                      {configPlugin.id === 'faq-bot' ? (
                        <button
                          role="tab"
                          aria-selected={configTab === 'ngos'}
                          className={`modal-tab ${configTab === 'ngos' ? 'active' : ''}`}
                          onClick={() => setConfigTab('ngos')}
                        >
                          {t('plugins.config.tabConfig')}
                        </button>
                      ) : (
                        <>
                          <button
                            role="tab"
                            aria-selected={configTab === 'config'}
                            className={`modal-tab ${configTab === 'config' ? 'active' : ''}`}
                            onClick={() => setConfigTab('config')}
                          >
                            {t('plugins.config.tabConfig')}
                          </button>
                          {configPlugin.sessionScoped !== false && (
                            <button
                              role="tab"
                              aria-selected={configTab === 'sessions'}
                              className={`modal-tab ${configTab === 'sessions' ? 'active' : ''}`}
                              onClick={() => setConfigTab('sessions')}
                            >
                              {configPlugin.id === 'ai-responder'
                                ? t('plugins.config.tabNgos')
                                : t('plugins.config.tabSessions')}
                            </button>
                          )}
                          {configPlugin.ingressCapable && (
                            <button
                              role="tab"
                              aria-selected={configTab === 'instances'}
                              className={`modal-tab ${configTab === 'instances' ? 'active' : ''}`}
                              onClick={() => setConfigTab('instances')}
                            >
                              {t('plugins.instances.title')}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ) : undefined
              }
              footer={
                <>
                  <button className="btn-secondary" onClick={() => setShowConfigModal(false)}>
                    {t('common.close')}
                  </button>
                  {/* The Sessions and Instances tabs have their own actions; the footer Save is config-tab
                      only. A plugin with its own editor saves through that editor, so the footer Save is
                      omitted rather than left to save a form the operator cannot see. */}
                  {(showTabs && (configTab === 'sessions' || configTab === 'instances')) ||
                  configPlugin.id === 'faq-bot' ||
                  configPlugin.configUi ? null : Object.keys(lz.configSchema?.properties ?? {}).length > 0 ? (
                    <button className="btn-primary" onClick={handleSaveSchemaConfig} disabled={savingConfig}>
                      {savingConfig ? <Loader2 size={16} className="animate-spin" /> : t('plugins.config.save')}
                    </button>
                  ) : null}
                </>
              }
            >
              {configPlugin.id === 'faq-bot' ? (
                <FaqNgoTab plugin={configPlugin} />
              ) : showTabs && configTab === 'instances' && configPlugin.ingressCapable ? (
                <PluginInstances pluginId={configPlugin.id} />
              ) : showTabs && configTab === 'sessions' && configPlugin.sessionScoped !== false ? (
                configPlugin.id === 'ai-responder'
                  ? <AiNgoTab plugin={configPlugin} />
                  : <SessionsTab plugin={configPlugin} />
              ) : /* A plugin that ships its own editor owns the whole config: rendering the generic
                     form underneath it too produced a second copy of every field and a second Save
                     button with different semantics, which is what the Chat Flow modal looked like. */
              configPlugin.configUi ? (
                <PluginConfigUi plugin={configPlugin} />
              ) : lz.configSchema && Object.keys(lz.configSchema.properties ?? {}).length > 0 ? (
                <form ref={schemaFormRef} className="config-form" onSubmit={e => e.preventDefault()}>
                  {Object.entries(lz.configSchema.properties).map(([key, field]) => (
                    <ConfigField
                      key={key}
                      field={field}
                      fieldKey={key}
                      pluginId={configPlugin.id}
                      label={field.title || key}
                      value={schemaConfig[key]}
                      onChange={v => setSchemaConfig({ ...schemaConfig, [key]: v })}
                    />
                  ))}
                </form>
              ) : (
                <div className="no-config">
                  <Settings size={48} style={{ opacity: 0.3 }} />
                  <p>{t('plugins.config.noOptions')}</p>
                </div>
              )}
            </Modal>
          );
        })()}
    </div>
  );
}
