import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import AgentRow from './AgentRow.jsx';
import AssignAgentsPanel from './AssignAgentsPanel.jsx';
import SearchInput from './SearchInput.jsx';

const SKELETONS = [0, 1, 2, 3, 4, 5];
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Right-side drawer listing the agents assigned to one WhatsApp account,
 * with an inner panel for assigning more. Presentational shell: the manager
 * owns agent state, loading/error flags and the API calls.
 */
export default function AgentsDrawer({
  account,
  agents,
  loading,
  loadError,
  assigning,
  onClose,
  onReload,
  onRemove,
  onAssign,
}) {
  const [listFilter, setListFilter] = useState('');
  const [assignOpen, setAssignOpen] = useState(false);
  const drawerRef = useRef(null);
  const panelRef = useRef(null);
  const listSearchRef = useRef(null);
  const prevFocusRef = useRef(null);

  // Remember what opened the drawer so focus can be returned on close.
  useEffect(() => {
    prevFocusRef.current = document.activeElement;
    return () => {
      const el = prevFocusRef.current;
      if (el && typeof el.focus === 'function') el.focus();
    };
  }, []);

  // Body scroll lock while the drawer is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Escape closes; focus is trapped inside whichever panel is on top.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = assignOpen ? panelRef.current : drawerRef.current;
      if (!root) return;
      const items = [...root.querySelectorAll(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null
      );
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [assignOpen, onClose]);

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const assignedIds = useMemo(
    () => new Set((agents || []).map((a) => a.fro_worker_id)),
    [agents]
  );

  const visibleAgents = useMemo(() => {
    const list = agents || [];
    const q = listFilter.trim().toLowerCase();
    if (!q) return list;
    return list.filter((a) => {
      const w = a.workers || {};
      return (
        String(w.name || '').toLowerCase().includes(q) ||
        String(w.email || '').toLowerCase().includes(q)
      );
    });
  }, [agents, listFilter]);

  const count = (agents || []).length;
  let body;

  if (loading) {
    body = (
      <div className="wa-drawer-list" aria-hidden="true">
        {SKELETONS.map((i) => (
          <div key={i} className="wa-skel-row">
            <span className="wa-skel-avatar" />
            <span className="wa-skel-line" style={{ width: '55%' }} />
          </div>
        ))}
      </div>
    );
  } else if (loadError) {
    body = (
      <div className="wa-drawer-list">
        <div className="wa-drawer-error" role="alert">
          <span>{loadError}</span>
          <button type="button" className="wa-btn wa-btn-ghost" onClick={onReload}>
            Retry
          </button>
        </div>
      </div>
    );
  } else if (count === 0) {
    body = (
      <div className="wa-drawer-list">
        <div className="wa-drawer-empty">
          <p className="wa-empty-title">No agents assigned yet</p>
          <p className="wa-empty-text">Assign your first agent to start routing chats.</p>
          <button
            type="button"
            className="wa-btn wa-btn-primary"
            onClick={() => setAssignOpen(true)}
          >
            Assign agents
          </button>
        </div>
      </div>
    );
  } else if (visibleAgents.length === 0) {
    body = (
      <div className="wa-drawer-list">
        <div className="wa-drawer-empty">
          <p className="wa-empty-title">No agents match “{listFilter.trim()}”</p>
          <button type="button" className="wa-btn wa-btn-ghost" onClick={() => setListFilter('')}>
            Clear search
          </button>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="wa-drawer-list">
        {visibleAgents.map((agent) => (
          <AgentRow
            key={agent.id}
            agent={agent}
            accountName={account.name}
            onRemove={(froId, name) => onRemove(froId, name)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="wa-drawer-overlay" onClick={handleOverlayClick}>
      <div
        ref={drawerRef}
        className="wa-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wa-drawer-title"
      >
        <header className="wa-drawer-header">
          <div className="wa-drawer-header-text">
            <div className="wa-drawer-title-row">
              <h2 className="wa-drawer-title" id="wa-drawer-title">
                {account.name}
              </h2>
              <span className="wa-chip wa-chip-code">{account.project}</span>
            </div>
            <p className="wa-drawer-sub">Assigned agents ({count})</p>
          </div>
          <button
            type="button"
            className="wa-drawer-close"
            onClick={onClose}
            aria-label="Close agents"
          >
            <X size={18} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </header>

        {!assignOpen && !loading && !loadError && count > 0 && (
          <>
            <div className="wa-drawer-toolbar">
              <SearchInput
                inputRef={listSearchRef}
                value={listFilter}
                onChange={setListFilter}
                placeholder="Search assigned agents"
                ariaLabel="Search assigned agents"
              />
              <button
                type="button"
                className="wa-btn wa-btn-primary wa-assign-btn"
                onClick={() => setAssignOpen(true)}
              >
                + Assign
              </button>
            </div>
            <p className="wa-drawer-count" role="status">
              Showing {visibleAgents.length} of {count}
            </p>
          </>
        )}

        {body}

        {!assignOpen && (
          <footer className="wa-drawer-footer">
            <button type="button" className="wa-btn wa-btn-ghost" onClick={onClose}>
              Done
            </button>
          </footer>
        )}

        {assignOpen && (
          <div ref={panelRef} className="wa-assign-host">
            <AssignAgentsPanel
              account={account}
              assignedIds={assignedIds}
              assigning={assigning}
              onAssign={onAssign}
              onBack={() => setAssignOpen(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
