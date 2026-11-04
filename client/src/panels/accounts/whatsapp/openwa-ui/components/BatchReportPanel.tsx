import { Loader2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BatchReportResponse } from '../services/api';

export interface BroadcastRecipientLabel {
  chatId: string;
  name?: string;
  mobile?: string;
}

interface BatchReportPanelProps {
  report: BatchReportResponse;
  recipients: BroadcastRecipientLabel[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

// The report is per batch, so a large broadcast would otherwise render thousands of rows in one
// pass. The summary above already carries the totals; the table is the detail view.
const MAX_ROWS = 500;

function displayPhone(value: string | null | undefined): string {
  const digits = String(value || '').split('@')[0].replace(/\D/g, '');
  return digits || '—';
}

export function BatchReportPanel({ report, recipients, loading, error, onRefresh }: BatchReportPanelProps) {
  const { t } = useTranslation();
  const labelByChat = new Map(recipients.map(row => [row.chatId, row]));
  const rows = report.recipients.slice(0, MAX_ROWS);

  const stats: Array<{ key: string; label: string; value: number; tone: string }> = [
    { key: 'delivered', label: t('messageTester.report.delivered'), value: report.delivered, tone: 'ok' },
    { key: 'read', label: t('messageTester.report.read'), value: report.read, tone: 'ok' },
    { key: 'yes', label: t('messageTester.report.repliedYes'), value: report.repliedYes, tone: 'yes' },
    { key: 'no', label: t('messageTester.report.repliedNo'), value: report.repliedNo, tone: 'no' },
    { key: 'other', label: t('messageTester.report.repliedOther'), value: report.repliedOther, tone: 'muted' },
    { key: 'none', label: t('messageTester.report.noReply'), value: report.noReply, tone: 'muted' },
    { key: 'failed', label: t('messageTester.report.failed'), value: report.failed, tone: 'bad' },
  ];

  return (
    <div className="batch-report">
      <div className="batch-report-head">
        <div>
          <h3>{t('messageTester.report.title')}</h3>
          <span className="batch-report-sub">
            {t('messageTester.report.summary', {
              attempted: report.attempted,
              total: report.total,
              replied: report.replied,
            })}
          </span>
        </div>
        <button
          type="button"
          className="batch-cancel-btn batch-report-refresh"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          {t('messageTester.report.refresh')}
        </button>
      </div>

      <div className="batch-report-stats">
        {stats.map(stat => (
          <div key={stat.key} className={`batch-report-stat ${stat.tone}`}>
            <span className="batch-report-stat-value">{stat.value}</span>
            <span className="batch-report-stat-label">{stat.label}</span>
          </div>
        ))}
      </div>

      {error && <div className="batch-report-error" role="alert">{error}</div>}

      {rows.length === 0 ? (
        <div className="batch-report-empty">{t('messageTester.report.empty')}</div>
      ) : (
        <>
          <div className="batch-report-table-wrap">
            <table className="batch-report-table">
              <thead>
                <tr>
                  <th>{t('messageTester.report.recipient')}</th>
                  <th>{t('messageTester.report.delivery')}</th>
                  <th>{t('messageTester.report.reply')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const label = labelByChat.get(row.chatId);
                  // History reads its labels from the batch's own variables; the send-time ref only
                  // covers the batch on screen.
                  const name = row.name || label?.name;
                  const mobile = row.mobile || label?.mobile;
                  return (
                    <tr key={row.chatId}>
                      <td>
                        <div className="batch-report-name">{name || displayPhone(mobile || row.chatId)}</div>
                        {name && <div className="batch-report-phone">{displayPhone(mobile || row.chatId)}</div>}
                      </td>
                      <td>
                        <span className={`batch-report-pill ${row.delivery}`}>
                          {t(`messageTester.report.deliveryState.${row.delivery}`)}
                        </span>
                      </td>
                      <td>
                        {row.reply ? (
                          <span className={`batch-report-pill reply-${row.reply}`} title={row.replyText || undefined}>
                            {row.reply === 'yes'
                              ? t('messageTester.report.replyYes')
                              : row.reply === 'no'
                                ? t('messageTester.report.replyNo')
                                : t('messageTester.report.replyOther')}
                          </span>
                        ) : (
                          <span className="batch-report-pill none">{t('messageTester.report.replyNone')}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {report.recipients.length > MAX_ROWS && (
            <div className="batch-report-more">
              {t('messageTester.report.showingFirst', { shown: MAX_ROWS, total: report.recipients.length })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
