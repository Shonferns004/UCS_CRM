-- Merge worker_education, worker_family, worker_references into workers table as JSONB
-- This keeps everything in one place, same pattern as previous_organizations

-- Add JSONB columns to workers
ALTER TABLE workers ADD COLUMN IF NOT EXISTS education_details JSONB DEFAULT '[]'::jsonb;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS family_details JSONB DEFAULT '[]'::jsonb;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS reference_details JSONB DEFAULT '[]'::jsonb;

-- Migrate existing data from separate tables into workers JSONB columns
UPDATE workers w SET education_details = (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'degree', e.degree,
    'institution', e.institution,
    'university', e.university,
    'year_of_passing', e.year_of_passing,
    'percentage', e.percentage,
    'from_year', e.from_year,
    'to_year', e.to_year,
    'specialization', e.specialization
  )), '[]'::jsonb)
  FROM worker_education e WHERE e.worker_id = w.id
);

UPDATE workers w SET family_details = (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', f.name,
    'relationship', f.relationship,
    'occupation', f.occupation,
    'phone', f.phone,
    'dob', f.dob
  )), '[]'::jsonb)
  FROM worker_family f WHERE f.worker_id = w.id
);

UPDATE workers w SET reference_details = (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', r.name,
    'designation', r.designation,
    'organization', r.organization,
    'phone', r.phone
  )), '[]'::jsonb)
  FROM worker_references r WHERE r.worker_id = w.id
);

-- Add bank_name and correspondence columns (safe to re-run)
ALTER TABLE workers ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS correspondence_address TEXT;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS correspondence_city TEXT;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS correspondence_state TEXT;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS correspondence_pincode TEXT;
