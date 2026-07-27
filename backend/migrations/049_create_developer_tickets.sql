CREATE TABLE IF NOT EXISTS developer_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raised_by UUID NOT NULL REFERENCES workers(id),
  raised_by_name TEXT,
  raised_by_panel TEXT NOT NULL DEFAULT 'fro',
  assigned_to UUID REFERENCES workers(id),
  subject TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'bug',
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  reference_id TEXT,
  resolution TEXT,
  first_response_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS developer_ticket_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES developer_tickets(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  sender_name TEXT,
  sender_panel TEXT NOT NULL DEFAULT 'dev_panel',
  message TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dev_tickets_status ON developer_tickets(status);
CREATE INDEX IF NOT EXISTS idx_dev_tickets_priority ON developer_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_dev_tickets_assigned_to ON developer_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_dev_tickets_raised_by ON developer_tickets(raised_by);
CREATE INDEX IF NOT EXISTS idx_dev_tickets_category ON developer_tickets(category);
CREATE INDEX IF NOT EXISTS idx_dev_tickets_created_at ON developer_tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dev_ticket_replies_ticket_id ON developer_ticket_replies(ticket_id);
