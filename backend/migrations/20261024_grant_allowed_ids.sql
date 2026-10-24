ALTER TABLE temporary_data_assignments
  ADD COLUMN IF NOT EXISTS allowed_assignment_ids INTEGER[] NULL;
