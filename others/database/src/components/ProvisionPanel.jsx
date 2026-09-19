import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import Icon from './Icon.jsx';

function copyText(text, label) {
  navigator.clipboard.writeText(String(text)).then(() => {
    if (window.__flashToast) window.__flashToast(label + ' copied');
  }).catch(() => {});
}

function Field({ label, value, mono }) {
  if (value == null || value === '') return null;
  return (
    <div className="py-2">
      <div className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">{label}</div>
      <div className="flex items-center gap-2 mt-1">
        <code className={`flex-1 min-w-0 truncate text-body-sm ${mono ? '' : ''} text-on-surface`}>{value}</code>
        <button
          onClick={() => copyText(value, label)}
          className="flex items-center gap-1 px-2 py-1 rounded border border-border-subtle bg-surface text-on-surface-variant text-body-sm hover:text-primary hover:border-primary transition-colors cursor-pointer"
          title={`Copy ${label}`}
        >
          <Icon name="copy" size={14} />
        </button>
      </div>
    </div>
  );
}

function Section({ icon, title, children }) {
  return (
    <div className="border border-border-subtle rounded bg-surface-card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-surface-container-high border-b border-border-subtle">
        <Icon name={icon} className="text-primary" size={16} />
        <span className="font-headline-md text-headline-md font-bold text-on-surface">{title}</span>
      </div>
      <div className="px-3 pb-2">{children}</div>
    </div>
  );
}

function ResultBlock({ result }) {
  const db = result.database;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-body-sm text-on-surface-variant">
        <Icon name="check" className="text-primary" size={16} />
        Customer <span className="text-on-surface font-semibold">{result.customer}</span> provisioned in {result.steps.join(' + ')}.
        <span className="flex-1" />
        <button
          onClick={() => copyText(db.connectionString, 'Database connection string')}
          className="px-2.5 py-1 rounded border border-border-subtle bg-surface text-on-surface font-body-sm text-body-sm hover:border-primary hover:text-primary transition-colors cursor-pointer"
        >
          Copy connection string
        </button>
      </div>

      <Section icon="database" title="Database">
        <Field label="Host" value={db.host} />
        <Field label="Port" value={db.port} />
        <Field label="Database" value={db.name} />
        <Field label="User" value={db.user} />
        <Field label="Password" value={db.password} />
      </Section>

      <Section icon="bucket" title="S3 Bucket">
        <Field label="Bucket" value={result.bucket.name} />
      </Section>

      <Section icon="key" title="IAM User">
        <Field label="User" value={result.iam.user} />
        <Field label="Policy" value={result.iam.policyName} />
        <Field label="Access Key ID" value={result.iam.accessKeyId} />
        <Field label="Secret Access Key" value={result.iam.secretAccessKey} />
        <div className="text-body-sm text-on-surface-variant pt-1">
          Save these — the secret access key is shown only once.
        </div>
      </Section>
    </div>
  );
}

function ChipList({ title, items, empty }) {
  return (
    <div>
      <div className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider mb-1.5">{title}</div>
      {items.length === 0 ? (
        <div className="text-body-sm text-on-surface-variant">{empty}</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((it) => (
            <span key={typeof it === 'string' ? it : it.name} className="px-2 py-0.5 rounded-full border border-border-subtle bg-surface-container text-body-sm text-on-surface">
              {typeof it === 'string' ? it : it.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProvisionPanel({ open, onClose }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [list, setList] = useState(null);
  const [listError, setListError] = useState(null);

  const loadList = async () => {
    try {
      setList(await api('/api/customer/list'));
      setListError(null);
    } catch (e) {
      setListError(e.message);
    }
  };

  useEffect(() => {
    if (open && list === null) loadList();
  }, [open, list]);

  if (!open) return null;

  const provision = async () => {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api('/api/customer/provision', { method: 'POST', body: JSON.stringify({ name: n }) }));
      setName('');
      loadList();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-md my-md border border-border-subtle rounded bg-surface-card overflow-hidden">
      <div className="flex items-center gap-2.5 px-3 py-2 bg-surface-container-high border-b border-border-subtle">
        <span className="font-headline-md text-headline-md font-bold text-on-surface">Customer Provision</span>
        <span className="font-body-sm text-body-sm text-on-surface-variant font-normal">dedicated database + S3 bucket + IAM user</span>
        <span className="flex-1" />
        <button
          onClick={onClose}
          className="px-2.5 py-1 rounded border border-border-subtle bg-surface text-on-surface-variant font-body-sm text-body-sm hover:text-on-surface hover:border-on-surface-variant transition-colors cursor-pointer"
        >
          Close
        </button>
      </div>

      <div className="p-3 space-y-3">
        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !busy && provision()}
            placeholder="Customer name (e.g. Acme Corp)"
            disabled={busy}
            className="flex-1 bg-surface-container border border-border-subtle text-on-surface font-body-sm text-body-sm rounded px-3 py-2 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 placeholder-text-muted transition-all disabled:opacity-60"
          />
          <button
            onClick={provision}
            disabled={busy || !name.trim()}
            className="flex items-center gap-2 bg-primary-container text-on-primary-fixed-variant hover:bg-primary-fixed transition-colors px-4 py-2 rounded font-body-sm text-body-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Icon name={busy ? 'loader' : 'user_plus'} className={busy ? 'animate-spin' : ''} size={18} />
            {busy ? 'Provisioning…' : 'Provision'}
          </button>
        </div>

        {error && (
          <div className="px-3 py-2.5 rounded border border-error/60 bg-error/10 text-error text-body-sm whitespace-pre-wrap">
            {error}
          </div>
        )}

        {result && <ResultBlock result={result} />}

        <div className="border-t border-border-subtle pt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">Existing customers</span>
            <button
              onClick={loadList}
              className="px-2 py-0.5 rounded border border-border-subtle bg-surface text-on-surface-variant font-body-sm text-body-sm hover:text-primary hover:border-primary transition-colors cursor-pointer"
            >
              Refresh
            </button>
          </div>

          {listError && <div className="text-body-sm text-error mb-2">{listError}</div>}

          {!list ? (
            <div className="text-body-sm text-on-surface-variant">Loading…</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ChipList
                title="Databases"
                items={list.databases || []}
                empty={list.databasesError ? `error: ${list.databasesError}` : 'none yet'}
              />
              <ChipList
                title="S3 Buckets"
                items={list.buckets || []}
                empty={list.bucketsError ? `error: ${list.bucketsError}` : 'none yet'}
              />
              <ChipList
                title="IAM Users"
                items={list.users || []}
                empty={list.usersError ? `error: ${list.usersError}` : 'none yet'}
              />
            </div>
          )}
        </div>

        <div className="text-body-sm text-on-surface-variant">
          Creates a <code className="text-primary">cust_*</code> database, <code className="text-primary">ucs-&lt;name&gt;-*</code> bucket and a <code className="text-primary">cust-*</code> IAM user with a bucket-only policy. AWS keys + IAM/S3 permissions are required in <code className="text-primary">backend/.env</code>.
        </div>
      </div>
    </div>
  );
}
