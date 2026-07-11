export type UserRole = 'super_admin' | 'tenant_admin' | 'agent' | 'viewer';

export type UserStatus = 'active' | 'invited' | 'deactivated';

export type TenantStatus = 'active' | 'suspended' | 'cancelled';

export type ConversationStatus = 'open' | 'pending' | 'closed' | 'snoozed';

export type ConversationPriority = 'low' | 'medium' | 'high' | 'urgent';

export type MessageDirection = 'inbound' | 'outbound';

export type MessageType = 
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'location'
  | 'contact'
  | 'interactive'
  | 'template'
  | 'reaction'
  | 'sticker'
  | 'system';

export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

export type ContactSource = 'whatsapp' | 'manual' | 'import' | 'api' | 'campaign';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  settings: Record<string, unknown>;
  status: TenantStatus;
  max_users: number;
  max_contacts: number;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  tenant_id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
  phone?: string;
  role: UserRole;
  status: UserStatus;
  last_login_at?: string;
  last_active_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  tenant_id: string;
  phone: string;
  phone_normalized: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  company?: string;
  profile_pic_url?: string;
  wa_profile_name?: string;
  source: ContactSource;
  opted_in: boolean;
  opted_in_at?: string;
  opted_out_at?: string;
  custom_fields: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ContactTag {
  id: string;
  tenant_id: string;
  name: string;
  color?: string;
  created_at: string;
}

export interface ContactNote {
  id: string;
  tenant_id: string;
  contact_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppPhoneNumber {
  id: string;
  tenant_id: string;
  phone_number_id: string;
  display_phone_number: string;
  verified_name?: string;
  quality_rating?: string;
  status: 'pending' | 'verified' | 'banned' | 'restricted';
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  tenant_id: string;
  contact_id: string;
  phone_number_id: string;
  assigned_to?: string;
  status: ConversationStatus;
  priority: ConversationPriority;
  source: 'whatsapp' | 'manual';
  last_message_at?: string;
  last_inbound_at?: string;
  snoozed_until?: string;
  closed_at?: string;
  closed_by?: string;
  labels: string[];
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  tenant_id: string;
  conversation_id: string;
  contact_id: string;
  user_id?: string;
  direction: MessageDirection;
  message_type: MessageType;
  body_text?: string;
  caption?: string;
  media_url?: string;
  media_id?: string;
  media_mime_type?: string;
  wa_message_id?: string;
  wa_context_id?: string;
  template_id?: string;
  template_params?: unknown;
  interactive_payload?: unknown;
  status: MessageStatus;
  status_updated_at?: string;
  failure_reason?: string;
  failure_code?: string;
  message_category?: 'service' | 'marketing' | 'utility' | 'authentication';
  metadata: Record<string, unknown>;
  is_automated: boolean;
  automation_id?: string;
  campaign_id?: string;
  created_at: string;
}

export interface WhatsAppWebhookLog {
  id: string;
  tenant_id?: string;
  direction: 'inbound' | 'outbound';
  event_type: string;
  payload: unknown;
  processed: boolean;
  processed_at?: string;
  error_message?: string;
  created_at: string;
}

export interface Pipeline {
  id: string;
  tenant_id: string;
  name: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface PipelineStage {
  id: string;
  pipeline_id: string;
  tenant_id: string;
  name: string;
  position: number;
  color?: string;
  created_at: string;
}

export interface Deal {
  id: string;
  tenant_id: string;
  pipeline_id: string;
  stage_id: string;
  contact_id: string;
  assigned_to?: string;
  title: string;
  value?: number;
  currency?: string;
  expected_close_date?: string;
  status: 'open' | 'won' | 'lost' | 'abandoned';
  notes?: string;
  created_at: string;
  updated_at: string;
  contact?: Contact;
}

export interface DealActivity {
  id: string;
  tenant_id: string;
  deal_id: string;
  user_id?: string;
  activity_type: string;
  description?: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ContactSegment {
  id: string;
  tenant_id: string;
  name: string;
  rules: Record<string, unknown>;
  contact_count: number;
  created_at: string;
  updated_at: string;
}

export type AutomationFlowType = 'auto_reply' | 'chatbot' | 'drip_campaign' | 'trigger_action';
export type AutomationFlowStatus = 'draft' | 'active' | 'paused' | 'archived';
export type AutomationStepType = 'send_message' | 'send_template' | 'wait' | 'condition' | 'add_tag' | 'remove_tag' | 'assign_agent' | 'api_call' | 'end';
export type AutomationRunStatus = 'running' | 'completed' | 'failed' | 'cancelled';
export type DripStatus = 'active' | 'completed' | 'unsubscribed' | 'paused';

export interface AutomationFlow {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  type: AutomationFlowType;
  status: AutomationFlowStatus;
  trigger_type?: string;
  trigger_config: Record<string, unknown>;
  flow_data: Record<string, unknown>;
  priority: number;
  stats: Record<string, unknown>;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface AutomationFlowStep {
  id: string;
  tenant_id: string;
  flow_id: string;
  position: number;
  step_type: AutomationStepType;
  config: Record<string, unknown>;
  next_step_id?: string;
  next_step_on_false?: string;
  created_at: string;
}

export interface AutomationRun {
  id: string;
  tenant_id: string;
  flow_id: string;
  contact_id: string;
  conversation_id: string;
  status: AutomationRunStatus;
  current_step_id?: string;
  context: Record<string, unknown>;
  started_at: string;
  completed_at?: string;
  error_message?: string;
  created_at: string;
}

export interface DripCampaignContact {
  id: string;
  tenant_id: string;
  flow_id: string;
  contact_id: string;
  current_step_id?: string;
  status: DripStatus;
  next_scheduled_at?: string;
  enrolled_at: string;
  completed_at?: string;
}

export interface Campaign {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  type: 'broadcast' | 'drip' | 'template_message';
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'cancelled';
  phone_number_id?: string;
  template_id?: string;
  template_params?: unknown;
  audience_type?: string;
  audience_config?: Record<string, unknown>;
  schedule_at?: string;
  sent_at?: string;
  stats: Record<string, unknown>;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface CampaignContact {
  id: string;
  tenant_id: string;
  campaign_id: string;
  contact_id: string;
  status: 'pending' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'opted_out';
  message_id?: string;
  failure_reason?: string;
  sent_at?: string;
  delivered_at?: string;
  read_at?: string;
  created_at: string;
}

export interface WhatsAppTemplate {
  id: string;
  tenant_id: string;
  phone_number_id: string;
  meta_template_id?: string;
  name: string;
  language: string;
  category?: string;
  status: 'pending' | 'approved' | 'rejected';
  components: Record<string, unknown>;
  rejection_reason?: string;
  synced_at?: string;
  created_at: string;
  updated_at: string;
}

export interface QuickReply {
  id: string;
  tenant_id: string;
  name: string;
  label: string;
  category: 'info' | 'qr' | 'receipt' | 'general';
  message_text?: string;
  media_url?: string;
  media_type?: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface MediaItem {
  id: string;
  tenant_id: string;
  name: string;
  label: string;
  category: 'qr' | 'receipt' | 'general' | 'image' | 'document';
  file_url: string;
  file_type?: string;
  file_size?: number;
  created_at: string;
}
