import { useState } from 'react';

function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

/**
 * One assigned agent in the drawer's list: avatar, name, and a Remove
 * button that asks for confirmation inline before calling the caller's
 * remove handler. UI only - the API call stays with the manager.
 */
export default function AgentRow({ agent, accountName, onRemove }) {
  const [confirming, setConfirming] = useState(false);
  const worker = agent.workers || {};
  const name = worker.name || worker.email || 'Unknown';

  if (confirming) {
    return (
      <div className="wa-arow-confirm" role="group" aria-label={`Confirm removing ${name}`}>
        <span className="wa-arow-confirm-text">
          Remove {name} from {accountName}?
        </span>
        <div className="wa-arow-confirm-actions">
          <button type="button" className="wa-btn-xs" onClick={() => setConfirming(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="wa-btn-xs is-danger"
            onClick={() => {
              setConfirming(false);
              onRemove(agent.fro_worker_id, name);
            }}
          >
            Remove
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wa-arow">
      <span className="wa-arow-avatar" aria-hidden="true">{initialsOf(name)}</span>
      <span className="wa-arow-name" title={name}>{name}</span>
      <button
        type="button"
        className="wa-arow-remove"
        onClick={() => setConfirming(true)}
        aria-label={`Remove agent ${name}`}
      >
        Remove
      </button>
    </div>
  );
}
