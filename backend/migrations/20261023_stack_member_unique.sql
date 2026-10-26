-- Prevent a donor from being in more than one stack on the same station.
-- Denormalise station onto donor_stack_members for a cheap unique constraint.
ALTER TABLE donor_stack_members
  ADD COLUMN IF NOT EXISTS station TEXT;

-- Backfill station from parent stack.
UPDATE donor_stack_members m
   SET station = s.station
  FROM donor_stacks s
 WHERE m.stack_id = s.id AND m.station IS NULL;

-- Unique: one donor per station across all stacks.
CREATE UNIQUE INDEX IF NOT EXISTS idx_stack_member_unique_donor_station
  ON donor_stack_members (donor_id, station)
  WHERE station IS NOT NULL;

-- Keep station in sync on insert (trigger).
CREATE OR REPLACE FUNCTION set_stack_member_station()
RETURNS TRIGGER AS $$
BEGIN
  SELECT station INTO NEW.station FROM donor_stacks WHERE id = NEW.stack_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_stack_member_station ON donor_stack_members;
CREATE TRIGGER trg_set_stack_member_station
  BEFORE INSERT OR UPDATE ON donor_stack_members
  FOR EACH ROW EXECUTE FUNCTION set_stack_member_station();
