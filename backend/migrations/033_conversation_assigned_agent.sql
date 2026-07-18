ALTER TABLE conversations ADD COLUMN assigned_agent_id UUID REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_agent ON conversations(assigned_agent_id);
