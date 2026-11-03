import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  QrCode,
  RefreshCw,
  Loader2,
  AlertCircle,
  Trash2,
  PowerOff,
  Play,
  Square,
  X,
  Plus,
  Search,
} from 'lucide-react';
import { useUcs } from '../../store';
import { api } from '../../api/auth';
import { toast } from '../../components/Toast';

const STATUS_LABELS = {
  created: 'Created',
  initializing: 'Initializing',
  authenticating: 'Authenticating',
  connecting: 'Connecting',
  qr_ready: 'Scan QR Code',
  ready: 'Connected',
  disconnected: 'Disconnected',
  failed: 'Failed',
  action_required: 'Action required',
};

const STARTABLE = new Set(['created', 'disconnected', 'failed', 'action_required']);
const STOPPABLE = new Set(['ready', 'qr_ready', 'initializing', 'authenticating']);

const WRITE_ROLES = new Set(['master', 'super_admin', 'accounts']);

function errorMessage(err) {
  return err?.message || 'Something went wrong';
}

export default function OpenWAEnginePanel() {
  const { user } = useUcs();
  const canWrite = WRITE_ROLES.has(String(user?.role || '').toLowerCase());

  const [engines, setEngines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const [engineSearch, setEngineSearch] = useState('');

  const [showConnectModal, setShowConnectModal] = useState(false);
  const [newEngineName, setNewEngineName] = useState('');

  const [qrEngineId, setQrEngineId] = useState(null);
  const [qrCode, setQrCode] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);

  const fetchEngines = useCallback(async (options = {}) => {
    if (!options.silent) setLoading(true);
    try {
      const res = await api('/openwa/status');
      setEngines(Array.isArray(res?.data) ? res.data : []);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEngines();
    // Keep the status column fresh: a session moves created → qr_ready → ready
    // on its own while the engine is starting.
    const timer = setInterval(() => fetchEngines({ silent: true }), 6000);
    return () => clearInterval(timer);
  }, [fetchEngines]);

  const filteredEngines = useMemo(() => {
    const q = engineSearch.trim().toLowerCase();
    if (!q) return engines;
    return engines.filter(
      (engine) =>
        String(engine.id || '').toLowerCase().includes(q) ||
        String(engine.name || '').toLowerCase().includes(q)
    );
  }, [engines, engineSearch]);

  const connectedCount = filteredEngines.filter((engine) => engine.status === 'ready').length;

  const handleCreateEngine = async () => {
    const name = newEngineName.trim();
    if (!name) {
      toast('Enter a name for the new engine', 'warning');
      return;
    }
    setLoading(true);
    try {
      await api('/openwa/connect', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      toast(`Engine "${name}" created`, 'success');
      setNewEngineName('');
      setShowConnectModal(false);
      await fetchEngines();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  const openQr = async (engineId) => {
    setQrEngineId(engineId);
    setQrCode(null);
    setQrLoading(true);
    try {
      const res = await api(`/openwa/sessions/${encodeURIComponent(engineId)}/qr`);
      setQrCode(res?.qrCode || null);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setQrLoading(false);
    }
  };

  const closeQr = () => {
    setQrEngineId(null);
    setQrCode(null);
    setQrLoading(false);
  };

  const runAction = async (engineId, action, successMessage) => {
    setBusyId(engineId);
    try {
      await api(`/openwa/sessions/${encodeURIComponent(engineId)}/${action}`, { method: 'POST' });
      toast(successMessage, 'success');
      await fetchEngines();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleStart = (engineId) => runAction(engineId, 'start', 'Session started');
  const handleStop = (engineId) => runAction(engineId, 'stop', 'Session stopped');

  const handleDisconnect = async (engineId) => {
    if (!window.confirm('Disconnect this engine from WhatsApp?')) return;
    await runAction(engineId, 'disconnect', 'Engine disconnected');
  };

  const handleDelete = async (engineId) => {
    if (!window.confirm('Delete this engine? This cannot be undone.')) return;
    setBusyId(engineId);
    try {
      await api(`/openwa/sessions/${encodeURIComponent(engineId)}`, { method: 'DELETE' });
      toast('Engine deleted', 'success');
      await fetchEngines();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  if (loading && engines.length === 0) {
    return (
      <div className="openwa-engine-page openwa-centered">
        <Loader2 className="animate-spin" size={32} />
        <p>Loading engines…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="openwa-engine-page">
        <div className="openwa-error">
          <AlertCircle size={20} />
          <span>{error}</span>
          <button className="btn btn-secondary" onClick={fetchEngines}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="openwa-engine-page">
      <header className="openwa-header">
        <div>
          <h1>OpenWA Engine</h1>
          <p className="openwa-subtitle">Manage WhatsApp engine sessions through the OpenWA gateway.</p>
        </div>
        <div className="openwa-header-actions">
          <button className="btn btn-secondary" onClick={fetchEngines} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          {canWrite && (
            <button className="btn btn-primary" onClick={() => setShowConnectModal(true)}>
              <Plus size={16} /> Add engine
            </button>
          )}
        </div>
      </header>

      {showConnectModal && (
        <div className="openwa-modal-overlay" onClick={() => setShowConnectModal(false)}>
          <div className="openwa-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Create engine</h2>
            <p>Give the new WhatsApp session a name.</p>
            <label htmlFor="openwa-engine-name">Engine name</label>
            <input
              id="openwa-engine-name"
              type="text"
              value={newEngineName}
              onChange={(e) => setNewEngineName(e.target.value)}
              placeholder="e.g. sales-support"
              maxLength={64}
            />
            <div className="openwa-modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setNewEngineName('');
                  setShowConnectModal(false);
                }}
              >
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleCreateEngine} disabled={loading}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="openwa-engines-section">
        <div className="openwa-stats-bar">
          <div className="stat-item">
            <span className="stat-value">{filteredEngines.length}</span>
            <span className="stat-label">Total engines</span>
          </div>
          <div className="stat-item">
            <span className="stat-value connected">{connectedCount}</span>
            <span className="stat-label">Connected sessions</span>
          </div>
          <div className="openwa-search">
            <Search size={14} />
            <input
              type="search"
              value={engineSearch}
              onChange={(e) => setEngineSearch(e.target.value)}
              placeholder="Search engines"
            />
          </div>
        </div>

        {filteredEngines.length === 0 ? (
          <div className="openwa-empty-state">
            <QrCode size={64} />
            <h3>No engines yet</h3>
            <p>Create an engine, then scan its QR code to link WhatsApp.</p>
            {canWrite && (
              <button className="btn btn-primary" onClick={() => setShowConnectModal(true)}>
                <Plus size={16} /> Add engine
              </button>
            )}
          </div>
        ) : (
          <div className="openwa-engines-table">
            <div className="table-header">
              <span>Engine</span>
              <span>Status</span>
              <span>Phone</span>
              <span>Actions</span>
            </div>
            {filteredEngines.map((engine) => {
              const busy = busyId === engine.id;
              return (
                <div key={engine.id} className="table-row">
                  <div className="session-info-cell">
                    <span className="session-name">{engine.name || 'Unnamed engine'}</span>
                    <span className="session-id" title={engine.id}>
                      {engine.id ? `#${String(engine.id).slice(-8)}` : 'No session'}
                    </span>
                  </div>
                  <span className={`status-pill ${engine.status || 'disconnected'}`}>
                    {STATUS_LABELS[engine.status] || engine.status || 'Unknown'}
                  </span>
                  <span className="session-phone">{engine.phone || '—'}</span>
                  <div className="actions">
                    {canWrite && STARTABLE.has(engine.status) && (
                      <button
                        className="btn btn-sm"
                        onClick={() => handleStart(engine.id)}
                        disabled={busy}
                        title="Start session"
                      >
                        {busy ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                      </button>
                    )}
                    {canWrite && STOPPABLE.has(engine.status) && (
                      <button
                        className="btn btn-sm danger"
                        onClick={() => handleStop(engine.id)}
                        disabled={busy}
                        title="Stop session"
                      >
                        {busy ? <Loader2 size={12} className="animate-spin" /> : <Square size={12} />}
                      </button>
                    )}
                    {(engine.status === 'qr_ready' || engine.status === 'connecting' || engine.status === 'authenticating' || engine.status === 'initializing') && (
                      <button className="btn btn-sm" onClick={() => openQr(engine.id)} title="Scan QR code">
                        <QrCode size={12} />
                      </button>
                    )}
                    {canWrite && STOPPABLE.has(engine.status) && (
                      <button
                        className="btn btn-sm"
                        onClick={() => handleDisconnect(engine.id)}
                        disabled={busy}
                        title="Disconnect"
                      >
                        <PowerOff size={12} />
                      </button>
                    )}
                    {canWrite && (
                      <button
                        className="btn btn-sm danger"
                        onClick={() => handleDelete(engine.id)}
                        disabled={busy}
                        title="Delete engine"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {qrEngineId && (
        <div className="openwa-modal-overlay" onClick={closeQr}>
          <div className="openwa-modal openwa-qr-modal" onClick={(e) => e.stopPropagation()}>
            <button className="openwa-modal-close" onClick={closeQr} title="Close">
              <X size={20} />
            </button>
            <h2>Scan QR code</h2>
            <p>Open WhatsApp on your phone, then scan this code to link the engine.</p>
            <div className="openwa-qr-frame">
              {qrLoading ? (
                <Loader2 size={32} className="animate-spin" />
              ) : qrCode ? (
                <img
                  src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                  alt="WhatsApp pairing QR code"
                />
              ) : (
                <p className="openwa-qr-empty">No QR code available yet. Start the session and try again.</p>
              )}
            </div>
            <div className="openwa-modal-footer">
              <button className="btn btn-secondary" onClick={() => openQr(qrEngineId)} disabled={qrLoading}>
                <RefreshCw size={16} className={qrLoading ? 'animate-spin' : ''} /> Refresh
              </button>
              <button className="btn btn-primary" onClick={closeQr}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .openwa-engine-page {
          min-height: 100%;
          background: var(--bg);
        }
        .openwa-centered {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          min-height: 400px;
          color: var(--text-secondary);
        }
        .openwa-error {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem 1.5rem;
          margin: 1.5rem;
          border-radius: 8px;
          background: rgba(239, 68, 68, 0.12);
          color: var(--error-text, #b91c1c);
        }
        .openwa-header {
          padding: 1rem 1.5rem;
          border-bottom: 1px solid var(--border-color);
          background: var(--card-bg);
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
        }
        .openwa-header h1 {
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--ink);
        }
        .openwa-subtitle {
          font-size: 0.875rem;
          color: var(--text-secondary);
          margin-top: 0.25rem;
        }
        .openwa-header-actions {
          display: flex;
          gap: 0.5rem;
        }
        .openwa-engines-section {
          padding: 1rem 1.5rem 2rem;
        }
        .openwa-stats-bar {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1rem;
          flex-wrap: wrap;
        }
        .stat-item {
          display: flex;
          flex-direction: column;
          background: var(--card-bg);
          padding: 0.5rem 1rem;
          border-radius: 8px;
          font-size: 0.875rem;
        }
        .stat-value {
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--ink);
        }
        .stat-value.connected {
          color: var(--success);
        }
        .stat-label {
          color: var(--text-muted);
          font-size: 0.75rem;
        }
        .openwa-search {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-left: auto;
          padding: 0.4rem 0.75rem;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: var(--card-bg);
          color: var(--text-muted);
        }
        .openwa-search input {
          border: 0;
          outline: 0;
          background: transparent;
          color: var(--ink);
          font-size: 0.875rem;
          width: 180px;
        }
        .openwa-empty-state {
          text-align: center;
          padding: 3rem 1rem;
          color: var(--text-muted);
        }
        .openwa-empty-state h3 {
          margin: 1rem 0 0.5rem;
          color: var(--ink);
        }
        .openwa-empty-state p {
          margin-bottom: 1rem;
        }
        .openwa-engines-table {
          width: 100%;
          background: var(--card-bg);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          overflow: hidden;
        }
        .table-header,
        .table-row {
          display: grid;
          grid-template-columns: minmax(0, 2fr) 1fr 1fr auto;
          align-items: center;
          gap: 1rem;
          padding: 0.75rem 1rem;
        }
        .table-header {
          border-bottom: 1px solid var(--border-color);
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          color: var(--text-muted);
          font-weight: 500;
        }
        .table-row {
          border-bottom: 1px solid var(--border-color);
        }
        .table-row:last-child {
          border-bottom: 0;
        }
        .session-info-cell {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .session-name {
          font-size: 0.875rem;
          color: var(--ink);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .session-id {
          font-size: 0.75rem;
          color: var(--text-muted);
        }
        .session-phone {
          font-size: 0.875rem;
          color: var(--text-secondary);
        }
        .status-pill {
          display: inline-block;
          width: fit-content;
          padding: 0.2rem 0.55rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 500;
          background: var(--border-color);
          color: var(--text-secondary);
        }
        .status-pill.connecting { background: var(--warning); color: #fff; }
        .status-pill.initializing { background: var(--warning); color: #fff; }
        .status-pill.authenticating { background: var(--info); color: #fff; }
        .status-pill.qr_ready { background: var(--info); color: #fff; }
        .status-pill.ready { background: var(--success); color: #fff; }
        .status-pill.failed,
        .status-pill.action_required { background: var(--error); color: #fff; }
        .actions {
          display: flex;
          gap: 0.25rem;
          justify-content: flex-end;
        }
        .openwa-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .openwa-modal {
          position: relative;
          background: var(--card-bg);
          padding: 2rem;
          border-radius: 12px;
          max-width: 500px;
          width: 90%;
          max-height: 90vh;
          overflow-y: auto;
        }
        .openwa-modal h2 {
          margin-bottom: 0.25rem;
          color: var(--ink);
        }
        .openwa-modal p {
          color: var(--text-secondary);
          font-size: 0.875rem;
          margin-bottom: 1rem;
        }
        .openwa-modal label {
          display: block;
          margin-bottom: 0.25rem;
          font-size: 0.875rem;
          color: var(--text-secondary);
        }
        .openwa-modal input {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          font-size: 0.875rem;
        }
        .openwa-modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          margin-top: 1.25rem;
        }
        .openwa-modal-close {
          position: absolute;
          top: 1rem;
          right: 1rem;
          border: 0;
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
        }
        .openwa-qr-modal {
          text-align: center;
        }
        .openwa-qr-frame {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 240px;
          margin: 1rem auto;
          border: 1px dashed var(--border-color);
          border-radius: 12px;
          padding: 1rem;
        }
        .openwa-qr-frame img {
          width: 100%;
          max-width: 260px;
          height: auto;
          display: block;
        }
        .openwa-qr-empty {
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}
