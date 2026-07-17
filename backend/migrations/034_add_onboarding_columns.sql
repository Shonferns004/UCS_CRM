-- Add missing columns for onboarding data to workers table
-- bank_name may already exist from editWorker usage; using IF NOT EXISTS for safety
ALTER TABLE workers ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS correspondence_address TEXT;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS correspondence_city TEXT;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS correspondence_state TEXT;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS correspondence_pincode TEXT;

-- Ensure onboarding sub-tables exist (CREATE IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS worker_education (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id uuid REFERENCES workers(id) ON DELETE CASCADE,
  degree text,
  institution text,
  university text,
  year_of_passing integer,
  percentage text,
  from_year integer,
  to_year integer,
  specialization text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS worker_family (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id uuid REFERENCES workers(id) ON DELETE CASCADE,
  name text NOT NULL,
  relationship text,
  occupation text,
  phone text,
  dob date,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS worker_references (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id uuid REFERENCES workers(id) ON DELETE CASCADE,
  name text NOT NULL,
  designation text,
  organization text,
  phone text,
  created_at timestamptz DEFAULT now()
);

-- Add missing columns to worker_education table
ALTER TABLE worker_education ADD COLUMN IF NOT EXISTS from_year INTEGER;
ALTER TABLE worker_education ADD COLUMN IF NOT EXISTS to_year INTEGER;
