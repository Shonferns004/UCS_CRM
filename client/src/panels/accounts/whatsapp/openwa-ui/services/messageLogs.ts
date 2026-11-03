import { api } from '../../../../../api/auth';

export interface MessageLogSession {
  id: string;
  name: string;
  phone?: string | null;
  status?: string | null;
}

export interface MessageLogRow {
  id: string;
  session_id: string;
  session_name?: string | null;
  ngo_id?: string | null;
  ngo_name?: string | null;
  station?: string | null;
  chat_id: string;
  chat_name?: string | null;
  wa_message_id?: string | null;
  body?: string | null;
  type?: string | null;
  direction?: 'incoming' | 'outgoing' | string | null;
  actor_id?: string | null;
  actor_name?: string | null;
  actor_role?: string | null;
  for_everyone?: boolean;
  createdAt: string;
  tracked: boolean;
}

export interface MessageLogFilters {
  /** YYYY-MM values that actually have deletions in this session, newest first. */
  months: string[];
  /** Stations the deleters worked from, so a filter can never return nothing. */
  stations: string[];
}

export interface MessageLogQuery {
  /** YYYY-MM, empty for every month. */
  month?: string;
  /** Station name, empty for every station. */
  station?: string;
  limit?: number;
  offset?: number;
}

export interface RecordDeletionPayload {
  sessionId: string;
  chatId: string;
  chatName?: string;
  messageId: string;
  body?: string;
  type?: string;
  forEveryone?: boolean;
}

export interface RecentDeletion {
  id: string;
  session_id: string;
  session_name?: string | null;
  ngo_name?: string | null;
  station?: string | null;
  chat_id: string;
  chat_name?: string | null;
  wa_message_id?: string | null;
  body?: string | null;
  type?: string | null;
  direction?: string | null;
  actor_name?: string | null;
  actor_role?: string | null;
  for_everyone?: boolean;
  createdAt: string;
}

export interface RecentDeletionsResponse {
  items: RecentDeletion[];
  byType: { type: string; count: number }[];
  total: number;
}

export const messageLogApi = {
  sessions: () =>
    api('/openwa-message-logs/sessions') as Promise<{ sessions: MessageLogSession[] }>,

  recent: (limit = 8) =>
    api(`/openwa-message-logs/recent?limit=${limit}`) as Promise<RecentDeletionsResponse>,

  filters: (sessionId: string) =>
    api(
      `/openwa-message-logs/filters?sessionId=${encodeURIComponent(sessionId)}`,
    ) as Promise<MessageLogFilters>,

  logs: (sessionId: string, { month = '', station = '', limit = 200, offset = 0 }: MessageLogQuery = {}) => {
    const query = new URLSearchParams({ sessionId, limit: String(limit), offset: String(offset) });
    if (month) query.set('month', month);
    if (station) query.set('station', station);
    return api(`/openwa-message-logs?${query.toString()}`) as Promise<{
      logs: MessageLogRow[];
      total: number;
      limit: number;
      offset: number;
    }>;
  },

  recordDeletion: (payload: RecordDeletionPayload) =>
    api('/openwa-message-logs/deletions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ success: boolean }>,
};
