import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { apiGet } from '../api/auth';
import SearchInput from './SearchInput.jsx';

function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

const SKELETONS = [0, 1, 2, 3, 4, 5];

/**
 * Second panel inside the agents drawer: search for workers that are not yet
 * assigned to this account and assign a selection. Uses the same endpoints the
 * inline UI used (search + one POST per assignment); the manager owns the
 * calls, this panel owns only the selection state.
 */
export default function AssignAgentsPanel({ account, assignedIds, assigning, onAssign, onBack }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [searchError, setSearchError] = useState(null);
  const timer = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    const q = query.trim();
    if (timer.current) clearTimeout(timer.current);
    if (q.length < 2) {
      setResults(null);
      setSearching(false);
      setSearchError(null);
      return undefined;
    }
    setSearching(true);
    timer.current = setTimeout(async () => {
      try {
        const data = await apiGet(`/whatsapp/accounts/agents/search?q=${encodeURIComponent(q)}`);
        setResults(data || []);
        setSearchError(null);
      } catch {
        setResults([]);
        setSearchError('Could not search agents. Please try again.');
      } finally {
        setSearching(false);
      }
    }, 300);
    return undefined;
  }, [query]);

  const candidates = useMemo(() => {
    if (!results) return [];
    return results.filter((w) => !assignedIds.has(w.id));
  }, [results, assignedIds]);

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

  const q = query.trim();
  let emptyState = null;
  if (!searching && !searchError) {
    if (results === null) {
      emptyState = {
        title: 'Search for agents to assign',
        text: 'Type at least 2 characters of a name, email or phone number.',
      };
    } else if (results.length === 0) {
      emptyState = { title: 'No agents match your search', text: '' };
    } else if (candidates.length === 0) {
      emptyState = {
        title: 'All agents are already assigned',
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
          inputRef={inputRef}
          value={query}
          onChange={setQuery}
          placeholder="Search agents to assign"
          ariaLabel="Search agents to assign"
          autoFocus
        />
      </div>

      {!searching && !searchError && q.length >= 2 && candidates.length > 0 && (
        <label className="wa-selectall">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} />
          Select all (filtered)
        </label>
      )}

      <div className="wa-drawer-list">
        {searchError ? (
          <div className="wa-drawer-error" role="alert">
            <span>{searchError}</span>
          </div>
        ) : searching ? (
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
            return (
              <label key={w.id} className="wa-assign-row">
                <input type="checkbox" checked={selected.has(w.id)} onChange={() => toggle(w.id)} />
                <span className="wa-arow-avatar" aria-hidden="true">{initialsOf(name)}</span>
                <span className="wa-arow-name" title={name}>{name}</span>
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
