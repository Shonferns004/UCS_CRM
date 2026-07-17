-- Migration 036: Consolidate correspondence columns into single JSONB + drop shift column
-- Run this in Supabase SQL Editor

-- 1. Add the new JSONB column
ALTER TABLE workers ADD COLUMN IF NOT EXISTS correspondence JSONB;

-- 2. Backfill from existing columns into single JSONB object
UPDATE workers
SET correspondence = jsonb_build_object(
  'address', correspondence_address,
  'city', correspondence_city,
  'state', correspondence_state,
  'pincode', correspondence_pincode
)
WHERE correspondence_address IS NOT NULL
   OR correspondence_city IS NOT NULL
   OR correspondence_state IS NOT NULL
   OR correspondence_pincode IS NOT NULL;

-- 3. Drop old columns
ALTER TABLE workers DROP COLUMN IF EXISTS correspondence_address;
ALTER TABLE workers DROP COLUMN IF EXISTS correspondence_city;
ALTER TABLE workers DROP COLUMN IF EXISTS correspondence_state;
ALTER TABLE workers DROP COLUMN IF EXISTS correspondence_pincode;

-- 4. Drop unused shift column
ALTER TABLE workers DROP COLUMN IF EXISTS shift;
