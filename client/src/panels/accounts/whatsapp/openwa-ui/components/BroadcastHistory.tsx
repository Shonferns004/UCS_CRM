import { Loader2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BatchReportSummary } from '../services/api';

interface BroadcastHistoryProps {
  items: BatchReportSummary[];
  loading: boolean;
  error: string | null;
  selectedBatchId: string | null;
  onSelect: (batchId: string) => void;
  onRefresh: () => void;
}

function formatWhen(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Past bulk broadcasts for the session, newest first. Clicking a row loads its full report. */
export function BroadcastHistory({ items, loading, error, selectedBatchId, onSelect, onRefresh }: BroadcastHistoryProps) {
  const { t } = useTranslation();

  return (
    <section className="broadcast-history">
      <div className="broadcast-history-head">
        <div>
          <h2>{t('messageTester.history.title')}</h2>
          <p>{t('messageTester.history.subtitle')}</p>
        </div>
        <button type="button" className="batch-cancel-btn batch-report-refresh" onClick={onRefresh} disabled={loading}>
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          {t('messageTester.history.refresh')}
        </button>
      </div>

      {error && <div className="batch-report-error" role="alert">{error}</div>}

      {items.length === 0 && !loading ? (
        <div className="broadcast-history-empty">{t('messageTester.history.empty')}</div>
      ) : (
        <div className="broadcast-history-table-wrap">
          <table className="broadcast-history-table">
            <thead>
              <tr>
                <th>{t('messageTester.history.when')}</th>
                <th>{t('messageTester.history.message')}</th>
                <th>{t('messageTester.history.recipients')}</th>
                <th>{t('messageTester.report.delivered')}</th>
                <th>{t('messageTester.report.read')}</th>
                <th>{t('messageTester.report.repliedYes')}</th>
                <th>{t('messageTester.report.repliedNo')}</th>
                <th>{t('messageTester.report.noReply')}</th>
                <th>{t('messageTester.report.failed')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr
                  key={item.batchId}
                  className={selectedBatchId === item.batchId ? 'selected' : undefined}
                  onClick={() => onSelect(item.batchId)}
                  title={item.batchId}
                >
                  <td>{formatWhen(item.completedAt || item.startedAt || item.createdAt)}</td>
                  <td>
                    <div className="broadcast-history-preview">{item.preview || item.batchId}</div>
                    <div className="broadcast-history-status">{item.status}</div>
                  </td>
                  <td>{item.total}</td>
                  <td>{item.delivered}</td>
                  <td>{item.read}</td>
                  <td className="yes">{item.repliedYes}</td>
                  <td className="no">{item.repliedNo}</td>
                  <td>{item.noReply}</td>
                  <td className={item.failed ? 'no' : undefined}>{item.failed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
