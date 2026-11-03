import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { sessionApi, type StatusUpdate } from '../services/api';

export function useContactStatuses(sessionId: string | null, enabled = true): UseQueryResult<StatusUpdate[], Error> {
  return useQuery<StatusUpdate[], Error>({
    queryKey: ['contact-statuses', sessionId],
    queryFn: async () => (await sessionApi.getContactStatuses(sessionId!)).statuses,
    enabled: Boolean(sessionId) && enabled,
    // No live status event without the gateway socket; refresh the tab periodically.
    refetchInterval: 30000,
  });
}
