import { api } from '../../../../../api/auth';
import type { MessageTemplate } from './api';

export const chatTemplatesApi = {
  // The NGO is derived on the server from the session's assignment, so the chat page
  // only needs the session it is already showing.
  forSession: (sessionId: string) =>
    api(`/openwa-chat/templates?sessionId=${encodeURIComponent(sessionId)}`) as Promise<{
      ngoId?: string | null;
      ngoName?: string | null;
      templates: MessageTemplate[];
    }>,

  // A suggested reply for a donor message, generated from the same FAQ rules / AI prompt as the
  // auto-responder but returned as text only. Nothing is sent.
  draft: (sessionId: string, text: string) =>
    api('/openwa-chat/draft', {
      method: 'POST',
      body: JSON.stringify({ sessionId, text }),
    }) as Promise<{ draft: string; source: 'faq' | 'ai' | 'none'; pattern?: string }>,

  // True while the gateway FAQ/AI plugins are enabled and sending on their own.
  replyMode: () =>
    api('/openwa-chat/reply-mode', { cache: 'no-store' }) as Promise<{ autoReply: boolean }>,
};
