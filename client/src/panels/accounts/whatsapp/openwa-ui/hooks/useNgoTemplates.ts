import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { openwaAssignmentsApi } from '../services/crmAssignments';
import { templateApi, type MessageTemplate } from '../services/api';
import { API_BASE } from '../../../../../lib/apiBase';

// Older templates stored the S3 public URL, which 403s for this private bucket. The
// gateway reads media server-side, so rewrite it to the CRM's stable streaming route.
export function normalizeTemplateMediaUrl(url?: string | null): string | null | undefined {
  if (!url) return url;
  if (url.includes('/template-media/')) return url;
  const match = url.match(/\/whatsapp-media\/([^?#]+)$/);
  return match
    ? `${API_BASE}/template-media/${encodeURIComponent(decodeURIComponent(match[1]))}`
    : url;
}

// Templates belong to an NGO, not to a phone number. The gateway stores each template
// against a session, so a template library for an NGO is the union of the templates of
// every WhatsApp session assigned to that NGO.
export function useNgoSessions(ngoId: string) {
  const assignments = useQuery({
    queryKey: ['openwa-assignments'],
    queryFn: openwaAssignmentsApi.list,
    staleTime: 30_000,
  });

  const sessionIds = useMemo(() => {
    const rows = assignments.data?.assignments || [];
    return [...new Set(rows.filter(row => row.ngo_id === ngoId).map(row => row.session_id))];
  }, [assignments.data, ngoId]);

  return { sessionIds, loading: assignments.isLoading, error: assignments.error };
}

export function useNgoTemplates(ngoId: string) {
  const { sessionIds, loading: loadingSessions, error: sessionsError } = useNgoSessions(ngoId);

  const query = useQuery({
    queryKey: ['ngo-templates', ngoId, sessionIds.join('|')],
    queryFn: async () => {
      const lists = await Promise.all(
        sessionIds.map(id => templateApi.list(id).catch(() => [] as MessageTemplate[])),
      );
      return lists.flat().map(template => ({
        ...template,
        mediaUrl: normalizeTemplateMediaUrl(template.mediaUrl),
      }));
    },
    enabled: !!ngoId && sessionIds.length > 0,
    staleTime: 10_000,
  });

  return {
    templates: query.data ?? [],
    isLoading: loadingSessions || query.isLoading,
    error: sessionsError ?? query.error,
    refetch: query.refetch,
    sessionIds,
  };
}
