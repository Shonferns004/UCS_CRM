CREATE TABLE IF NOT EXISTS profile_update_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  requested_changes JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES users(id),
  reviewer_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX idx_profile_update_requests_worker ON profile_update_requests(worker_id);
CREATE INDEX idx_profile_update_requests_status ON profile_update_requests(status);

ALTER TABLE profile_update_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workers can view own requests" ON profile_update_requests
  FOR SELECT USING (auth.uid() = worker_id);

CREATE POLICY "Workers can insert own requests" ON profile_update_requests
  FOR INSERT WITH CHECK (auth.uid() = worker_id);

CREATE POLICY "HR can view all requests" ON profile_update_requests
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin', 'hr'))
  );

CREATE POLICY "HR can update requests" ON profile_update_requests
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin', 'hr'))
  );
