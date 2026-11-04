import { useQueries, useQuery } from '@tanstack/react-query';
import { openwaTemplatesApi } from '../services/crmTemplates';
import type { MessageTemplate } from '../services/api';
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

async function fetchNgoTemplates(ngoId: string): Promise<MessageTemplate[]> {
  const data = await openwaTemplatesApi.list(ngoId);
  return (data.templates || []).map(
    (template): MessageTemplate => ({
      ...template,
      mediaUrl: normalizeTemplateMediaUrl(template.mediaUrl),
    }),
  );
}

// Templates belong to an NGO, not to a phone number. The library can be written before
// any session exists, and every session later assigned to the NGO reads the same set.
export function useNgoTemplates(ngoId: string) {
  const query = useQuery({
    queryKey: ['ngo-templates', ngoId],
    queryFn: () => fetchNgoTemplates(ngoId),
    enabled: !!ngoId,
    staleTime: 10_000,
  });

  return {
    templates: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * The library with the NGO filter set to "All": one query per NGO, combined and sorted by the
 * last update so the list reads like a single library. Passing an empty list (a specific filter
 * is active) runs no queries.
 */
export function useAllNgoTemplates(ngoIds: string[]) {
  const queries = useQueries({
    queries: ngoIds.map(ngoId => ({
      queryKey: ['ngo-templates', ngoId],
      queryFn: () => fetchNgoTemplates(ngoId),
      enabled: !!ngoId,
      staleTime: 10_000,
    })),
  });

  const templates = queries.flatMap(query => query.data ?? []);
  templates.sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));

  return {
    templates,
    isLoading: queries.some(query => query.isLoading),
    error: (queries.find(query => query.error)?.error as Error | null) ?? null,
    refetch: () => Promise.all(queries.map(query => query.refetch())),
  };
}
