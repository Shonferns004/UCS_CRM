import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { apiGet } from '../api/auth';
import SearchInput from './SearchInput.jsx';

function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

const SKELETONS = [0, 1, 2, 3, 4, 5];

function matchesText(worker, q) {
  return [worker.name, worker.email, worker.phone, worker.login_id].some((value) =>
    String(value || '').toLowerCase().includes(q)
  );
}

/**
 * Second panel inside the agents drawer: pick the FROs that are not yet
 * assigned to this account and assign them.
 *
 * The whole FRO roster is fetched once when the panel opens and filtered in
 * the browser. Searching used to fire a request per keystroke (300ms
 * debounce + a round trip to the database), which made typing feel slow and
 * capped the results at the first 20 matches - so the agent an admin was
 * looking for could simply be missing. One request, one list, instant
 * filtering.
 */
export default function AssignAgentsPanel({ account, assignedIds, assigning, onAssign, onBack }) {
  const [query, setQuery] = useState('');
  const [roster, setRoster] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selected, setSelected] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await apiGet('/whatsapp/accounts/agents/list');
        if (cancelled) return;
        setRoster(data || []);
        setLoadError(null);
      } catch (err) {
        console.error(err);
        if (!cancelled) setLoadError('Could not load agents. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const matches = useMemo(() => {
    const list = roster || [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((w) => matchesText(w, q));
  }, [roster, query]);

  // Agents already on this account are not offered again.
  const candidates = useMemo(
    () => matches.filter((w) => !assignedIds.has(w.id)),
    [matches, assignedIds]
  );

  // Drop selections that stopped being candidates when the results changed.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(candidates.map((w) => w.id));
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [candidates]);

  const allSelected = candidates.length > 0 && candidates.every((w) => selected.has(w.id));

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const toggleAll = () => setSelected((prev) => {
    const next = new Set(prev);
    if (allSelected) candidates.forEach((w) => next.delete(w.id));
    else candidates.forEach((w) => next.add(w.id));
    return next;
  });

  const handleAssign = async () => {
    if (!selected.size || assigning) return;
    const ok = await onAssign([...selected]);
    if (ok) onBack();
  };

  const total = (roster || []).length;
  const q = query.trim();

  let emptyState = null;
  if (!loading && !loadError) {
    if (matches.length === 0) {
      emptyState = {
        title: q ? `No agents match "${q}"` : 'No agents available',
        text: q ? 'Try a different name, email or phone number.' : '',
      };
    } else if (candidates.length === 0) {
      emptyState = {
        title: 'All matching agents are already assigned',
        text: 'Every agent matching this search is already on this account.',
      };
    }
  }

  return (
    <section className="wa-assign-panel" aria-label="Assign agents">
      <header className="wa-drawer-header">
        <button type="button" className="wa-drawer-close" onClick={onBack} aria-label="Back to assigned agents">
          <ArrowLeft size={18} strokeWidth={1.8} aria-hidden="true" />
        </button>
        <div className="wa-drawer-header-text">
          <div className="wa-drawer-title-row">
            <h2 className="wa-drawer-title">Assign agents</h2>
          </div>
          <p className="wa-drawer-sub">{account.name}</p>
        </div>
      </header>

      <div className="wa-drawer-toolbar">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search agents to assign"
          ariaLabel="Search agents to assign"
          autoFocus
        />
      </div>

      {!loading && !loadError && total > 0 && (
        <p className="wa-drawer-count" role="status">
          {q
            ? `Showing ${candidates.length} of ${matches.length} matching agents`
            : `Showing ${candidates.length} of ${total} agents`}
        </p>
      )}

      {candidates.length > 0 && (
        <label className="wa-selectall">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} />
          Select all (filtered)
        </label>
      )}

      <div className="wa-drawer-list">
        {loadError ? (
          <div className="wa-drawer-error" role="alert">
            <span>{loadError}</span>
            <button type="button" className="wa-btn wa-btn-ghost" onClick={onBack}>
              Back
            </button>
          </div>
        ) : loading ? (
          <div aria-hidden="true">
            {SKELETONS.map((i) => (
              <div key={i} className="wa-skel-row">
                <span className="wa-skel-avatar" />
                <span className="wa-skel-line" style={{ width: '50%' }} />
              </div>
            ))}
          </div>
        ) : emptyState ? (
          <div className="wa-drawer-empty">
            <p className="wa-empty-title">{emptyState.title}</p>
            {emptyState.text ? <p className="wa-empty-text">{emptyState.text}</p> : null}
          </div>
        ) : (
          candidates.map((w) => {
            const name = w.name || w.email || 'Unknown';
            const sub = w.phone || w.email || w.login_id || '';
            return (
              <label key={w.id} className="wa-assign-row">
                <input type="checkbox" checked={selected.has(w.id)} onChange={() => toggle(w.id)} />
                <span className="wa-arow-avatar" aria-hidden="true">{initialsOf(name)}</span>
                <span className="wa-assign-text">
                  <span className="wa-assign-name" title={name}>{name}</span>
                  <span className="wa-assign-sub" title={sub}>{sub}</span>
                </span>
                {w.is_active === false ? (
                  <span className="wa-assign-tag">Inactive</span>
                ) : null}
              </label>
            );
          })
        )}
      </div>

      <footer className="wa-drawer-footer wa-assign-foot">
        <div className="wa-assign-foot-right">
          <button type="button" className="wa-btn wa-btn-ghost" onClick={onBack}>
            Cancel
          </button>
          <button
            type="button"
            className="wa-btn wa-btn-primary"
            disabled={!selected.size || assigning}
            onClick={handleAssign}
          >
            {assigning ? 'Assigning...' : `Assign (${selected.size})`}
          </button>
        </div>
      </footer>
    </section>
  );
}
