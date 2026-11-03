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
};
