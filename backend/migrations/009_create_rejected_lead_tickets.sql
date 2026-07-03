CREATE TABLE IF NOT EXISTS rejected_lead_tickets (
  id SERIAL PRIMARY KEY,
  fro_donor_log_id INTEGER NOT NULL REFERENCES fro_donor_logs(id),
  fro_worker_id INTEGER REFERENCES workers(id),
  ngo_id INTEGER,
  donor_name TEXT,
  amount NUMERIC,
  rejection_reason TEXT,
  status TEXT DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'acknowledged', 'resolved')),
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
