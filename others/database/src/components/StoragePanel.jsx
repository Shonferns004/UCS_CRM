import { useEffect, useMemo, useRef, useState } from 'react';
import { api, apiBlob, getAdminKey, setAdminKey } from '../lib/api.js';
import Icon from './Icon.jsx';

function fmtSize(n) {
  if (n == null) return '';
  if (n < 1024) return n + ' B';
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

function fmtDate(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const btn = 'px-2.5 py-1 rounded border border-border-subtle bg-surface text-on-surface font-body-sm text-body-sm hover:border-primary hover:text-primary transition-colors cursor-pointer';
const btnGhost = 'px-2.5 py-1 rounded border border-transparent text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer';

function KeyField({ onSave, onClear }) {
  const [v, setV] = useState('');
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSave(v.trim()); }}
      className="flex items-center gap-1.5"
    >
      <input
        type="password"
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="Admin key"
        autoComplete="off"
        className="w-40 bg-surface-container border border-border-subtle text-on-surface font-body-sm text-body-sm rounded px-2.5 py-1 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 placeholder-text-muted transition-all"
      />
      <button type="submit" className={btn}>Set</button>
      {getAdminKey() && <button type="button" onClick={onClear} className={btnGhost}><Icon name="close" size={14} /></button>}
    </form>
  );
}

export default function StoragePanel({ open, onClose, confirmDialog }) {
  const [accounts, setAccounts] = useState(null);
  const [bucketsError, setBucketsError] = useState(null);
  const [needKey, setNeedKey] = useState(false);
  // { account, bucket } of the open bucket, plus the prefix path inside it.
  const [loc, setLoc] = useState(null);
  const [listing, setListing] = useState(null);
  const [listError, setListError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');
  const [picked, setPicked] = useState(() => new Set());
  const [path, setPath] = useState('');
  const [flash, setFlash] = useState('');
  const [flashTone, setFlashTone] = useState('ok');
  const flashTimer = useRef(null);

  // Reloading a listing clears listError, so partial-delete warnings go
  // through here instead — they have to survive the refresh that follows.
  const say = (msg, tone = 'ok') => {
    setFlash(msg);
    setFlashTone(tone);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(''), 6000);
  };

  const loadBuckets = async () => {
    setBucketsError(null);
    try {
      const r = await api('/api/s3/buckets');
      setAccounts(r.accounts || []);
      setNeedKey(false);
    } catch (e) {
      if (/admin key|Unauthorized/i.test(e.message)) setNeedKey(true);
      setBucketsError(e.message);
      setAccounts(null);
    }
  };

  useEffect(() => { if (open && accounts === null) loadBuckets(); }, [open]);

  const loadObjects = async (target, p) => {
    if (!target) return;
    setBusy(true);
    setListError(null);
    setPicked(new Set());
    try {
      const q = new URLSearchParams({ account: target.account, bucket: target.bucket, prefix: p || '' });
      setListing(await api(`/api/s3/objects?${q.toString()}`));
      setNeedKey(false);
    } catch (e) {
      if (/admin key|Unauthorized/i.test(e.message)) setNeedKey(true);
      setListError(e.message);
      setListing(null);
    } finally {
      setBusy(false);
    }
  };

  const openBucket = (account, bucket) => {
    const t = { account, bucket };
    setLoc(t);
    setFilter('');
    loadObjects(t, '');
  };

  const enter = (prefix) => {
    setFilter('');
    setPath(prefix);
    loadObjects(loc, prefix);
  };

  const goUp = () => {
    if (!loc || !path) return;
    const next = path.replace(/\/[^/]*\/$/, '');
    setPath(next);
    setFilter('');
    loadObjects(loc, next);
  };

  const leave = () => {
    setLoc(null);
    setListing(null);
    setListError(null);
    setPath('');
    setPicked(new Set());
  };

  const crumbs = useMemo(() => {
    if (!path) return [];
    const parts = path.split('/').filter(Boolean);
    return parts.map((p, i) => ({
      name: p,
      key: parts.slice(0, i + 1).join('/') + '/',
    }));
  }, [path]);

  const objects = (listing && listing.objects) || [];
  const folders = (listing && listing.folders) || [];
  const f = filter.trim().toLowerCase();
  const shownObjects = f ? objects.filter((o) => o.name.toLowerCase().includes(f)) : objects;
  const shownFolders = f ? folders.filter((o) => o.name.toLowerCase().includes(f)) : folders;
  const allKeys = shownObjects.map((o) => o.key);
  const allPicked = allKeys.length > 0 && allKeys.every((k) => picked.has(k));

  const toggle = (k, on) => setPicked((prev) => {
    const m = new Set(prev);
    if (on) m.add(k); else m.delete(k);
    return m;
  });

  const download = async (o) => {
    setListError(null);
    try {
      const q = new URLSearchParams({ account: loc.account, bucket: loc.bucket, key: o.key });
      const blob = await apiBlob(`/api/s3/object?${q.toString()}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = o.name.split('/').pop() || 'object';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      if (/admin key|Unauthorized/i.test(e.message)) setNeedKey(true);
      setListError(e.message);
    }
  };

  const deleteKeys = async (keys, label) => {
    const ok = await confirmDialog({
      title: label,
      desc: 'This permanently deletes from S3. There is no undo and no trash — anything still referenced in the database will break.',
      sql: keys.length > 12 ? keys.slice(0, 12).join('\n') + `\n… and ${keys.length - 12} more` : keys.join('\n'),
      phrase: 'delete',
      inputPlaceholder: 'Type "delete" to confirm',
    });
    if (!ok) return;
    setBusy(true);
    setListError(null);
    try {
      const r = await api('/api/s3/objects/delete', {
        method: 'POST',
        body: JSON.stringify({ account: loc.account, bucket: loc.bucket, keys }),
      });
      const extra = r.errors && r.errors.length ? ` · ${r.errors.length} failed` : '';
      if (r.capped) say(`Deleted ${r.deleted} of ${r.requested} — the rest was not touched.`, 'warn');
      else say(`Deleted ${r.deleted} object(s)${extra}`, extra ? 'warn' : 'ok');
      await loadObjects(loc, path);
    } catch (e) {
      if (/admin key|Unauthorized/i.test(e.message)) setNeedKey(true);
      setListError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const deleteFolder = async (folder) => {
    const ok = await confirmDialog({
      title: `Delete folder "${folder.name}"?`,
      desc: 'Every object under this prefix is permanently deleted from S3. There is no undo.',
      sql: `${loc.bucket}/${folder.key}`,
      phrase: 'delete ' + folder.name,
      inputPlaceholder: `Type "delete ${folder.name}" to confirm`,
    });
    if (!ok) return;
    setBusy(true);
    setListError(null);
    try {
      const r = await api('/api/s3/folder/delete', {
        method: 'POST',
        body: JSON.stringify({ account: loc.account, bucket: loc.bucket, prefix: folder.key }),
      });
      if (r.empty) say('Folder was already empty');
      else if (r.capped) say(`Deleted ${r.deleted} of at least ${r.scanned} objects — the folder may not be empty.`, 'warn');
      else say(`Deleted ${r.deleted} object(s)`);
      await loadObjects(loc, path);
    } catch (e) {
      if (/admin key|Unauthorized/i.test(e.message)) setNeedKey(true);
      setListError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="mx-md my-md border border-border-subtle rounded bg-surface-card overflow-hidden">
      <div className="flex items-center gap-2.5 px-3 py-2 bg-surface-container-high border-b border-border-subtle flex-wrap">
        <Icon name="bucket" className="text-primary" size={18} />
        <span className="font-headline-md text-headline-md font-bold text-on-surface">S3 Buckets</span>
        <span className="font-body-sm text-body-sm text-on-surface-variant">
          {loc ? `${loc.account} / ${loc.bucket}` : 'all accounts'}
        </span>
        <span className="flex-1" />
        {needKey && (
          <KeyField
            onSave={(v) => { setAdminKey(v); setNeedKey(false); loadBuckets(); if (loc) loadObjects(loc, path); }}
            onClear={() => { setAdminKey(''); setNeedKey(false); loadBuckets(); }}
          />
        )}
        {loc && (
          <button onClick={leave} className={btn}>All buckets</button>
        )}
        <button onClick={() => (loc ? loadObjects(loc, path) : loadBuckets())} className={btn} disabled={busy}>
          Refresh
        </button>
        <button onClick={onClose} className={btnGhost}>Close</button>
      </div>

      {(bucketsError || listError) && (
        <div className="px-3 py-2 border-b border-error/60 bg-error/10 text-error text-body-sm font-body-sm whitespace-pre-wrap">
          {bucketsError || listError}
        </div>
      )}

      {flash && (
        <div className={`px-3 py-1.5 border-b text-body-sm font-body-sm ${flashTone === 'warn' ? 'border-error/60 bg-error/10 text-error' : 'border-primary/40 bg-primary/10 text-primary'}`}>
          {flash}
        </div>
      )}

      {!loc ? (
        <div className="p-3">
          {accounts === null && !bucketsError && <div className="text-body-sm text-on-surface-variant">Loading…</div>}
          {(accounts || []).map((acc) => (
            <div key={acc.name} className="mb-4 last:mb-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="font-label-caps text-label-caps text-on-surface uppercase tracking-wider">{acc.name}</span>
                <span className="text-body-sm text-on-surface-variant">{acc.region}</span>
                {!acc.configured && <span className="text-body-sm text-on-surface-variant">— not configured</span>}
              </div>
              {acc.note && <div className="text-body-sm text-on-surface-variant mb-1.5">{acc.note}</div>}
              {acc.buckets.length === 0 ? (
                <div className="text-body-sm text-on-surface-variant">no buckets</div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {acc.buckets.map((b) => (
                    <button
                      key={b.name}
                      onClick={() => openBucket(acc.name, b.name)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border-subtle bg-surface-container hover:border-primary hover:text-primary text-on-surface text-body-sm font-body-sm transition-colors cursor-pointer"
                      title={b.createdAt ? `created ${fmtDate(b.createdAt)}` : 'configured bucket'}
                    >
                      <Icon name="bucket" size={14} />
                      {b.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle flex-wrap">
            <button onClick={goUp} disabled={!path} className={`${btn} disabled:opacity-40 disabled:cursor-not-allowed`}>
              <Icon name="chevron_left" size={14} />
            </button>
            <div className="flex items-center gap-1 text-body-sm font-body-sm text-on-surface-variant flex-wrap">
              <span className="text-on-surface">{loc.bucket}</span>
              {crumbs.map((c) => (
                <span key={c.key} className="flex items-center gap-1">
                  <span className="text-on-surface-variant">/</span>
                  <button
                    onClick={() => { setPath(c.key); setFilter(''); loadObjects(loc, c.key); }}
                    className="text-primary hover:underline cursor-pointer"
                  >
                    {c.name}
                  </button>
                </span>
              ))}
            </div>
            <span className="flex-1" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter names…"
              className="w-44 bg-surface-container border border-border-subtle text-on-surface font-body-sm text-body-sm rounded pl-3 pr-3 py-1.5 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 placeholder-text-muted transition-all"
            />
            <button
              onClick={() => deleteKeys([...picked], `Delete ${picked.size} object(s) from "${loc.bucket}"?`)}
              disabled={picked.size === 0 || busy}
              className="px-3 py-1 rounded border border-error/50 bg-transparent text-error hover:bg-error/10 text-body-sm font-body-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Delete selected ({picked.size})
            </button>
          </div>

          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-high">
                  <th className="px-3 py-2 w-9">
                    <input
                      type="checkbox"
                      checked={allPicked}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setPicked((prev) => {
                          const m = new Set(prev);
                          for (const k of allKeys) { if (on) m.add(k); else m.delete(k); }
                          return m;
                        });
                      }}
                      className="rounded bg-surface-container border-border-subtle text-primary w-4 h-4 cursor-pointer"
                    />
                  </th>
                  <th className="px-3 py-2 font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">Name</th>
                  <th className="px-3 py-2 font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider w-24 text-right">Size</th>
                  <th className="px-3 py-2 font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider w-44">Modified</th>
                  <th className="px-3 py-2 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {shownFolders.map((fo) => (
                  <tr key={fo.key} className="border-b border-border-subtle hover:bg-surface-container-low">
                    <td className="px-3 py-1.5"></td>
                    <td className="px-3 py-1.5">
                      <span className="flex items-center gap-2">
                        <Icon name="bucket" className="text-primary" size={15} />
                        <button onClick={() => enter(fo.key)} className="text-primary hover:underline cursor-pointer font-code-snippet text-code-snippet">
                          {fo.name}/
                        </button>
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right text-body-sm text-on-surface-variant">—</td>
                    <td className="px-3 py-1.5 text-body-sm text-on-surface-variant">—</td>
                    <td className="px-3 py-1.5 text-right">
                      <button
                        onClick={() => deleteFolder(fo)}
                        disabled={busy}
                        className="text-error hover:text-error/80 disabled:opacity-50 cursor-pointer"
                        title="Delete every object in this folder"
                      >
                        <Icon name="delete" size={15} />
                      </button>
                    </td>
                  </tr>
                ))}

                {shownObjects.map((o) => (
                  <tr key={o.key} className={`border-b border-border-subtle hover:bg-surface-container-low ${picked.has(o.key) ? 'sel-row' : ''}`}>
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={picked.has(o.key)}
                        onChange={(e) => toggle(o.key, e.target.checked)}
                        className="rounded bg-surface-container border-border-subtle text-primary w-4 h-4 cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-1.5 text-on-surface font-code-snippet text-code-snippet break-all" title={o.key}>{o.name}</td>
                    <td className="px-3 py-1.5 text-right text-body-sm text-on-surface-variant">{fmtSize(o.size)}</td>
                    <td className="px-3 py-1.5 text-body-sm text-on-surface-variant">{fmtDate(o.lastModified)}</td>
                    <td className="px-3 py-1.5 text-right flex items-center justify-end gap-2">
                      <button onClick={() => download(o)} className="text-on-surface-variant hover:text-primary cursor-pointer" title="Download">
                        <Icon name="copy" size={15} />
                      </button>
                      <button
                        onClick={() => deleteKeys([o.key], `Delete "${o.name}"?`)}
                        disabled={busy}
                        className="text-error hover:text-error/80 disabled:opacity-50 cursor-pointer"
                        title="Delete this object"
                      >
                        <Icon name="delete" size={15} />
                      </button>
                    </td>
                  </tr>
                ))}

                {!busy && shownFolders.length === 0 && shownObjects.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-body-sm text-on-surface-variant">
                      {f ? 'No names match that filter.' : 'This folder is empty.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="px-3 py-2 border-t border-border-subtle flex items-center gap-3 text-body-sm text-on-surface-variant">
            <span>{folders.length} folder(s) · {objects.length} object(s) here</span>
            {listing && listing.truncated && <span className="text-primary">more results not shown — narrow the filter</span>}
            <span className="flex-1" />
            <span>{busy ? 'Working…' : 'Deletes are permanent.'}</span>
          </div>
        </>
      )}
    </div>
  );
}
