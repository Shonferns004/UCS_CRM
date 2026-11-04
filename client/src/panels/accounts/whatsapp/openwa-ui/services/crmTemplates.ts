import { api } from '../../../../../api/auth';
import type { MessageTemplate, TemplatePayload } from './api';

// NGO-level template library (CRM-side, not the gateway). A template can be created
// before any WhatsApp session exists and is shared by every session assigned to the NGO.
export const openwaTemplatesApi = {
  list: (ngoId: string) =>
    api(`/openwa-templates?ngoId=${encodeURIComponent(ngoId)}`, { cache: 'no-store' }) as Promise<{
      templates: MessageTemplate[];
    }>,

  create: (ngoId: string, data: TemplatePayload) =>
    api('/openwa-templates', {
      method: 'POST',
      body: JSON.stringify({ ...data, ngoId }),
    }) as Promise<{ template: MessageTemplate }>,

  update: (id: string, data: Partial<TemplatePayload>) =>
    api(`/openwa-templates/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }) as Promise<{ template: MessageTemplate }>,

  delete: (id: string) =>
    api(`/openwa-templates/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }) as Promise<{ success: boolean }>,
};
