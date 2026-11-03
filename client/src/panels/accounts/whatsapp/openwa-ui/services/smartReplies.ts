import { api } from '../../../../../api/auth';

export interface ReplyTemplate {
  id: string;
  question: string;
  answer: string;
  keywords?: string | null;
  ngo_id?: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReplyMatch {
  id: string;
  question: string;
  answer: string;
  score: number;
}

export interface ReplySuggestion {
  matched: ReplyMatch | null;
  draft: string;
  source: 'template' | 'ai' | 'none';
  alternatives: { id: string; question: string; score: number }[];
  aiConfigured: boolean;
  aiError?: string;
}

export interface ReplyTemplateInput {
  question: string;
  answer: string;
  keywords?: string;
  enabled?: boolean;
}

export const smartReplyApi = {
  list: () => api('/whatsapp-replies') as Promise<{ templates: ReplyTemplate[] }>,

  create: (input: ReplyTemplateInput) =>
    api('/whatsapp-replies', {
      method: 'POST',
      body: JSON.stringify(input),
    }) as Promise<{ template: ReplyTemplate }>,

  update: (id: string, input: Partial<ReplyTemplateInput>) =>
    api(`/whatsapp-replies/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }) as Promise<{ template: ReplyTemplate }>,

  remove: (id: string) =>
    api(`/whatsapp-replies/${encodeURIComponent(id)}`, { method: 'DELETE' }) as Promise<{
      success: boolean;
    }>,

  /** Draft only — this endpoint never sends anything. */
  suggest: (text: string, useAi = true) =>
    api('/whatsapp-replies/suggest', {
      method: 'POST',
      body: JSON.stringify({ text, useAi }),
    }) as Promise<ReplySuggestion>,
};
