import { useQuery } from '@tanstack/react-query';
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

// Templates belong to an NGO, not to a phone number. The library can be written before
// any session exists, and every session later assigned to the NGO reads the same set.
export function useNgoTemplates(ngoId: string) {
  const query = useQuery({
    queryKey: ['ngo-templates', ngoId],
    queryFn: async () => {
      const data = await openwaTemplatesApi.list(ngoId);
      return (data.templates || []).map(
        (template): MessageTemplate => ({
          ...template,
          mediaUrl: normalizeTemplateMediaUrl(template.mediaUrl),
        }),
      );
    },
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
