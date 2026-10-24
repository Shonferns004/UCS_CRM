-- Donor Stacks: group donors into named stacks assignable to FROs.
-- Data stays on the source station; stacks are a VIEW layer over fro_assignments.

CREATE TABLE IF NOT EXISTS donor_stacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ngo_id UUID NOT NULL,
  station TEXT NOT NULL,
  name TEXT NOT NULL,
  stack_type TEXT NOT NULL DEFAULT 'normal',  -- 'normal' | 'high_tier'
  fro_worker_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS donor_stack_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stack_id UUID NOT NULL REFERENCES donor_stacks(id) ON DELETE CASCADE,
  donor_id INTEGER NOT NULL,
  assignment_id INTEGER,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (stack_id, donor_id)
);

CREATE INDEX IF NOT EXISTS idx_donor_stacks_station ON donor_stacks(station, ngo_id);
CREATE INDEX IF NOT EXISTS idx_donor_stacks_fro ON donor_stacks(fro_worker_id);
CREATE INDEX IF NOT EXISTS idx_stack_members_stack ON donor_stack_members(stack_id);
CREATE INDEX IF NOT EXISTS idx_stack_members_donor ON donor_stack_members(donor_id);
