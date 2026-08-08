CREATE TABLE IF NOT EXISTS receipt_claims (
  id SERIAL PRIMARY KEY,
  receipt_id INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  fro_worker_id UUID NOT NULL,
  project_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  donor_id INTEGER,
  notes TEXT,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ,
  verified_by UUID,
  UNIQUE (receipt_id, fro_worker_id)
);

CREATE INDEX IF NOT EXISTS idx_receipt_claims_status ON receipt_claims(status);
CREATE INDEX IF NOT EXISTS idx_receipt_claims_receipt ON receipt_claims(receipt_id);
CREATE INDEX IF NOT EXISTS idx_receipt_claims_fro ON receipt_claims(fro_worker_id);
