export const APP_NAME = 'WhatsApp CRM';

export const CONVERSATION_STATUS = {
  OPEN: 'open',
  PENDING: 'pending',
  CLOSED: 'closed',
  SNOOZED: 'snoozed',
} as const;

export const MESSAGE_STATUS = {
  QUEUED: 'queued',
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'read',
  FAILED: 'failed',
} as const;

export const USER_ROLES = {
  SUPER_ADMIN: 'super_admin',
  TENANT_ADMIN: 'tenant_admin',
  AGENT: 'agent',
  VIEWER: 'viewer',
} as const;

export const WHATSAPP_API_BASE = 'https://graph.facebook.com/v19.0';

export const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
