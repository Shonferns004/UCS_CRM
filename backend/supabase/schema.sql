-- ============================================================================
-- UCS CRM — Full Database Schema
-- Source: Supabase (PostgreSQL) dump
-- Generated: July 2026
-- ============================================================================

-- 1. CORE / LOOKUP TABLES
-- ============================================================================

CREATE TABLE public.ngos (
  id                        uuid NOT NULL DEFAULT gen_random_uuid(),
  name                      text NOT NULL,
  code                      text NOT NULL UNIQUE,
  address                   text,
  is_active                 boolean DEFAULT true,
  created_at                timestamp with time zone DEFAULT now(),
  updated_at                timestamp with time zone DEFAULT now(),
  registration_no           text,
  daily_collection_target   numeric NOT NULL DEFAULT 0,
  CONSTRAINT ngos_pkey PRIMARY KEY (id)
);

CREATE TABLE public.data_sources (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  is_active   boolean DEFAULT true,
  created_at  timestamp with time zone DEFAULT now(),
  updated_at  timestamp with time zone DEFAULT now(),
  CONSTRAINT data_sources_pkey PRIMARY KEY (id)
);

CREATE TABLE public.bank_audit_sources (
  id          integer NOT NULL DEFAULT nextval('bank_audit_sources_id_seq'::regclass),
  name        text NOT NULL UNIQUE,
  is_active   boolean DEFAULT true,
  sort_order  integer DEFAULT 0,
  created_at  timestamp with time zone DEFAULT now(),
  CONSTRAINT bank_audit_sources_pkey PRIMARY KEY (id)
);

CREATE TABLE public.qr_codes (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  code            text NOT NULL UNIQUE,
  label           text,
  latitude        double precision NOT NULL,
  longitude       double precision NOT NULL,
  radius_meters   double precision NOT NULL DEFAULT 100,
  created_at      timestamp with time zone DEFAULT now(),
  CONSTRAINT qr_codes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.settings (
  key         text NOT NULL,
  value       text NOT NULL,
  updated_at  timestamp with time zone DEFAULT now(),
  CONSTRAINT settings_pkey PRIMARY KEY (key)
);

CREATE TABLE public.company_policies (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  content     text NOT NULL DEFAULT ''::text,
  sort_order  integer DEFAULT 0,
  is_active   boolean DEFAULT true,
  created_at  timestamp with time zone DEFAULT now(),
  updated_at  timestamp with time zone DEFAULT now(),
  CONSTRAINT company_policies_pkey PRIMARY KEY (id)
);

CREATE TABLE public.api_keys (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  name          text,
  key           text DEFAULT encode(gen_random_bytes(24), 'hex'::text),
  permissions   jsonb DEFAULT '{}'::jsonb,
  active        boolean DEFAULT true,
  last_used_at  timestamp with time zone,
  expires_at    timestamp with time zone,
  created_at    timestamp with time zone DEFAULT now(),
  CONSTRAINT api_keys_pkey PRIMARY KEY (id)
);

-- 2. USERS, WORKERS, ACCESS
-- ============================================================================

CREATE TABLE public.users (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  ngo_id          uuid,
  name            text NOT NULL,
  email           text NOT NULL UNIQUE,
  password_hash   text NOT NULL,
  role            text NOT NULL CHECK (role = ANY (ARRAY['admin'::text, 'agent'::text, 'viewer'::text])),
  department      text,
  created_by      uuid,
  is_active       boolean DEFAULT true,
  last_login      timestamp with time zone,
  created_at      timestamp with time zone DEFAULT now(),
  updated_at      timestamp with time zone DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_ngo_id_fkey FOREIGN KEY (ngo_id) REFERENCES public.ngos(id)
);

CREATE TABLE public.hrs (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  ngo_id          uuid,
  name            text NOT NULL,
  email           text NOT NULL UNIQUE,
  password_hash   text NOT NULL,
  department      text,
  created_by      uuid,
  is_active       boolean DEFAULT true,
  last_login      timestamp with time zone,
  created_at      timestamp with time zone DEFAULT now(),
  updated_at      timestamp with time zone DEFAULT now(),
  CONSTRAINT hrs_pkey PRIMARY KEY (id),
  CONSTRAINT hrs_ngo_id_fkey FOREIGN KEY (ngo_id) REFERENCES public.ngos(id)
);

CREATE TABLE public.workers (
  id                        uuid NOT NULL DEFAULT gen_random_uuid(),
  ngo_id                    uuid,
  name                      text NOT NULL,
  email                     text,
  login_id                  text NOT NULL UNIQUE,
  password                  text NOT NULL,
  gender                    text,
  dob                       date,
  phone                     text,
  alternate_phone           text,
  address                   text,
  city                      text,
  state                     text,
  pincode                   text,
  photo_url                 text,
  onboarding_completed      boolean DEFAULT false,
  account_holder_name       text,
  ifsc_code                 text,
  account_number            text,
  father_husband_name       text,
  permanent_address         text,
  marital_status            text,
  pan_number                text,
  aadhar_number             text,
  previous_organizations    jsonb DEFAULT '[]'::jsonb,
  department                text,
  created_by                uuid,
  is_active                 boolean DEFAULT true,
  created_at                timestamp with time zone DEFAULT now(),
  updated_at                timestamp with time zone DEFAULT now(),
  bank_name                 text,
  shift_start_time          text,
  shift_end_time            text,
  daily_collection_target   numeric DEFAULT 0,
  education_details         jsonb DEFAULT '[]'::jsonb,
  family_details            jsonb DEFAULT '[]'::jsonb,
  reference_details         jsonb DEFAULT '[]'::jsonb,
  correspondence            jsonb,
  employment_status         text NOT NULL DEFAULT 'active'::text,
  details_status            text DEFAULT 'pending'::text,
  signature_url             text,
  correspondence_address    text,
  correspondence_city       text,
  correspondence_state      text,
  correspondence_pincode    text,
  CONSTRAINT workers_pkey PRIMARY KEY (id),
  CONSTRAINT workers_ngo_id_fkey FOREIGN KEY (ngo_id) REFERENCES public.ngos(id)
);

CREATE TABLE public.user_ngo_access (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  ngo_id      uuid NOT NULL,
  created_at  timestamp with time zone DEFAULT now(),
  CONSTRAINT user_ngo_access_pkey PRIMARY KEY (id),
  CONSTRAINT user_ngo_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT user_ngo_access_ngo_id_fkey FOREIGN KEY (ngo_id) REFERENCES public.ngos(id)
);

CREATE TABLE public.user_settings (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id     text NOT NULL,
  key         text NOT NULL,
  value       text,
  created_at  timestamp with time zone DEFAULT now(),
  updated_at  timestamp with time zone DEFAULT now(),
  CONSTRAINT user_settings_pkey PRIMARY KEY (id)
);

CREATE TABLE public.profile_update_requests (
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  worker_id           uuid NOT NULL,
  requested_changes   jsonb NOT NULL,
  status              text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),
  reviewed_by         uuid,
  reviewer_notes      text,
  created_at          timestamp with time zone DEFAULT now(),
  reviewed_at         timestamp with time zone,
  CONSTRAINT profile_update_requests_pkey PRIMARY KEY (id),
  CONSTRAINT profile_update_requests_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id),
  CONSTRAINT profile_update_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id)
);

-- 3. WORKER SUB-TABLES (education, family, references, allocations, loans)
-- ============================================================================

CREATE TABLE public.worker_education (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  worker_id         uuid NOT NULL,
  degree            text NOT NULL,
  institution       text NOT NULL,
  university        text,
  year_of_passing   integer,
  from_year         text,
  to_year           text,
  specialization    text,
  percentage        text,
  created_at        timestamp with time zone DEFAULT now(),
  CONSTRAINT worker_education_pkey PRIMARY KEY (id),
  CONSTRAINT worker_education_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id)
);

CREATE TABLE public.worker_family (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  worker_id     uuid NOT NULL,
  name          text NOT NULL,
  relationship  text NOT NULL,
  occupation    text,
  phone         text,
  dob           date,
  created_at    timestamp with time zone DEFAULT now(),
  CONSTRAINT worker_family_pkey PRIMARY KEY (id),
  CONSTRAINT worker_family_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id)
);

CREATE TABLE public.worker_references (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  worker_id       uuid NOT NULL,
  name            text NOT NULL,
  designation     text,
  organization    text,
  phone           text,
  email           text,
  created_at      timestamp with time zone DEFAULT now(),
  CONSTRAINT worker_references_pkey PRIMARY KEY (id),
  CONSTRAINT worker_references_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id)
);

CREATE TABLE public.worker_ngo_allocations (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  worker_id       uuid NOT NULL,
  ngo_id          uuid NOT NULL,
  salary_portion  numeric NOT NULL,
  created_at      timestamp with time zone DEFAULT now(),
  CONSTRAINT worker_ngo_allocations_pkey PRIMARY KEY (id),
  CONSTRAINT worker_ngo_allocations_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id),
  CONSTRAINT worker_ngo_allocations_ngo_id_fkey FOREIGN KEY (ngo_id) REFERENCES public.ngos(id)
);

CREATE TABLE public.worker_loans (
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  worker_id           uuid NOT NULL,
  type                text NOT NULL CHECK (type = ANY (ARRAY['advance'::text, 'loan'::text])),
  total_amount        numeric NOT NULL,
  reason              text,
  monthly_deduction   numeric DEFAULT 0,
  remaining_amount    numeric DEFAULT 0,
  status              text DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'active'::text, 'closed'::text])),
  hr_remark           text,
  applied_at          timestamp with time zone DEFAULT now(),
  decided_at          timestamp with time zone,
  decided_by          uuid,
  closed_at           timestamp with time zone,
  created_at          timestamp with time zone DEFAULT now(),
  updated_at          timestamp with time zone DEFAULT now(),
  CONSTRAINT worker_loans_pkey PRIMARY KEY (id),
  CONSTRAINT worker_loans_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id)
);

CREATE TABLE public.worker_loan_deductions (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  loan_id     uuid NOT NULL,
  month       date NOT NULL,
  amount      numeric NOT NULL,
  created_at  timestamp with time zone DEFAULT now(),
  CONSTRAINT worker_loan_deductions_pkey PRIMARY KEY (id),
  CONSTRAINT worker_loan_deductions_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.worker_loans(id)
);

-- 4. ATTENDANCE
-- ============================================================================

CREATE TABLE public.attendance (
  id                      uuid NOT NULL DEFAULT gen_random_uuid(),
  worker_id               uuid NOT NULL,
  date                    date NOT NULL,
  punch_in_time           timestamp with time zone,
  punch_in_lat            double precision,
  punch_in_lng            double precision,
  punch_out_time          timestamp with time zone,
  punch_out_lat           double precision,
  punch_out_lng           double precision,
  late_minutes            integer DEFAULT 0,
  status                  text NOT NULL DEFAULT 'present'::text CHECK (status = ANY (ARRAY['present'::text, 'late'::text, 'absent'::text, 'half-day'::text, 'leave'::text])),
  created_at              timestamp with time zone DEFAULT now(),
  hours_worked            text,
  punch_method            character varying,
  geofence_exit_time      timestamp with time zone,
  is_out_of_geofence      boolean DEFAULT false,
  CONSTRAINT attendance_pkey PRIMARY KEY (id),
  CONSTRAINT attendance_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id)
);

CREATE TABLE public.attendance_corrections (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  worker_id         uuid NOT NULL,
  attendance_id     uuid NOT NULL,
  date              date NOT NULL,
  field             text NOT NULL CHECK (field = ANY (ARRAY['punch_in'::text, 'punch_out'::text])),
  requested_time    timestamp with time zone NOT NULL,
  reason            text NOT NULL,
  status            text DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'hr_verified'::text, 'approved'::text, 'rejected'::text])),
  hr_remark         text,
  admin_remark      text,
  created_at        timestamp with time zone DEFAULT now(),
  updated_at        timestamp with time zone DEFAULT now(),
  CONSTRAINT attendance_corrections_pkey PRIMARY KEY (id),
  CONSTRAINT attendance_corrections_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id),
  CONSTRAINT attendance_corrections_attendance_id_fkey FOREIGN KEY (attendance_id) REFERENCES public.attendance(id)
);

CREATE TABLE public.leaves (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  worker_id         uuid NOT NULL,
  type              text NOT NULL CHECK (type = ANY (ARRAY['full_day'::text, 'half_day'::text, 'vacational'::text, 'emergency'::text])),
  leave_date        date,
  start_date        date,
  end_date          date,
  half_start_time   time without time zone,
  half_end_time     time without time zone,
  days              numeric NOT NULL,
  reason            text NOT NULL,
  status            text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),
  admin_remark      text,
  proof_data        text,
  proof_mime        text,
  applied_at        timestamp with time zone DEFAULT now(),
  updated_at        timestamp with time zone DEFAULT now(),
  CONSTRAINT leaves_pkey PRIMARY KEY (id),
  CONSTRAINT leaves_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id)
);

CREATE TABLE public.daily_qr_codes (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  qr_code_id    uuid NOT NULL,
  date          date NOT NULL DEFAULT CURRENT_DATE,
  daily_code    character varying NOT NULL,
  created_at    timestamp with time zone DEFAULT now(),
  CONSTRAINT daily_qr_codes_pkey PRIMARY KEY (id),
  CONSTRAINT daily_qr_codes_qr_code_id_fkey FOREIGN KEY (qr_code_id) REFERENCES public.qr_codes(id)
);

-- 5. SALARY, TARGETS, ACHIEVEMENTS
-- ============================================================================

CREATE TABLE public.salary_history (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  worker_id     uuid NOT NULL,
  salary        numeric NOT NULL,
  from_month    date NOT NULL,
  to_month      date,
  created_by    uuid,
  paid_at       timestamp with time zone,
  created_at    timestamp with time zone DEFAULT now(),
  extra_amount  numeric NOT NULL DEFAULT 0,
  CONSTRAINT salary_history_pkey PRIMARY KEY (id),
  CONSTRAINT salary_history_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id)
);

CREATE TABLE public.incentive_targets (
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  worker_id           uuid NOT NULL,
  month               date NOT NULL,
  target_amount       numeric NOT NULL,
  is_auto_generated   boolean DEFAULT false,
  created_by          uuid,
  created_at          timestamp with time zone DEFAULT now(),
  updated_at          timestamp with time zone DEFAULT now(),
  CONSTRAINT incentive_targets_pkey PRIMARY KEY (id),
  CONSTRAINT incentive_targets_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id)
);

CREATE TABLE public.daily_achievements (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  worker_id   uuid NOT NULL,
  date        date NOT NULL,
  amount      numeric NOT NULL DEFAULT 0,
  notes       text,
  created_by  uuid,
  created_at  timestamp with time zone DEFAULT now(),
  updated_at  timestamp with time zone DEFAULT now(),
  CONSTRAINT daily_achievements_pkey PRIMARY KEY (id),
  CONSTRAINT daily_achievements_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id)
);

CREATE TABLE public.fro_monthly_targets (
  id                integer NOT NULL DEFAULT nextval('fro_monthly_targets_id_seq'::regclass),
  fro_worker_id     uuid NOT NULL,
  ngo_id            uuid NOT NULL,
  month             date NOT NULL,
  target_amount     numeric NOT NULL DEFAULT 0,
  set_by            uuid,
  created_at        timestamp with time zone DEFAULT now(),
  achieved_target   numeric DEFAULT 0,
  incentive         numeric,
  CONSTRAINT fro_monthly_targets_pkey PRIMARY KEY (id),
  CONSTRAINT fro_monthly_targets_fro_worker_id_fkey FOREIGN KEY (fro_worker_id) REFERENCES public.workers(id),
  CONSTRAINT fro_monthly_targets_ngo_id_fkey FOREIGN KEY (ngo_id) REFERENCES public.ngos(id)
);

CREATE TABLE public.telecaller_targets (
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  worker_id           uuid NOT NULL,
  month               text NOT NULL,
  target_amount       numeric NOT NULL DEFAULT 0,
  achievement_amount  numeric DEFAULT 0,
  created_by          uuid,
  created_at          timestamp with time zone DEFAULT now(),
  updated_at          timestamp with time zone DEFAULT now(),
  CONSTRAINT telecaller_targets_pkey PRIMARY KEY (id),
  CONSTRAINT telecaller_targets_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id),
  CONSTRAINT telecaller_targets_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);

-- 6. DONOR & FRO (Field Relations Officer)
-- ============================================================================

CREATE TABLE public.donor_profiles (
  id                      integer NOT NULL DEFAULT nextval('donor_profiles_id_seq'::regclass),
  mobile_number           text NOT NULL UNIQUE,
  name                    text,
  bank_donor_name         text,
  agent_donor_name        text,
  mobile_2                text,
  address_1               text,
  address_2               text,
  city                    text,
  pin_code                text,
  pan_number              text,
  email                   text,
  birth_date              date,
  data_category           text,
  team                    text,
  agent_name              text,
  mop                     text,
  donors_bank_name        text,
  project_supported       text,
  account_of              text,
  category                text,
  amount                  numeric DEFAULT 0,
  total_amount            numeric DEFAULT 0,
  donation_count          integer DEFAULT 1,
  first_donation_date     date,
  last_donation_date      date,
  raw_data                jsonb,
  first_import_batch_id   uuid,
  first_imported_at       timestamp with time zone DEFAULT now(),
  updated_at              timestamp with time zone DEFAULT now(),
  station                 text,
  ngo                     text,
  state                   text,
  aadhaar_number          text,
  anniversary             date,
  preferred_language      text,
  donor_type              text,
  CONSTRAINT donor_profiles_pkey PRIMARY KEY (id)
);

CREATE TABLE public.new_data (
  id                      uuid NOT NULL DEFAULT gen_random_uuid(),
  data_source_id          uuid NOT NULL,
  import_date             date NOT NULL,
  import_batch_id         uuid NOT NULL,
  mobile_number           text NOT NULL,
  name                    text,
  category                text NOT NULL,
  amount                  numeric DEFAULT 0,
  transaction_date        date,
  bank_donor_name         text,
  agent_donor_name        text,
  mobile_2                text,
  address_1               text,
  address_2               text,
  city                    text,
  pin_code                text,
  pan_number              text,
  email                   text,
  birth_date              date,
  data_category           text,
  team                    text,
  agent_name              text,
  mop                     text,
  received_bank           text,
  payment_id_no           text,
  donors_bank_name        text,
  receipt_no              text,
  receipt_date            date,
  receipt_time            text,
  project_supported       text,
  account_of              text,
  branch                  text,
  created_at              timestamp with time zone DEFAULT now(),
  station                 text,
  ngo                     text,
  status                  text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'converted'::text, 'skipped'::text])),
  CONSTRAINT new_data_pkey PRIMARY KEY (id),
  CONSTRAINT imported_data_data_source_id_fkey FOREIGN KEY (data_source_id) REFERENCES public.data_sources(id)
);

CREATE TABLE public.fro_assignments (
  id                    integer NOT NULL DEFAULT nextval('fro_assignments_id_seq'::regclass),
  donor_id              integer NOT NULL,
  fro_worker_id         uuid,
  ngo_id                uuid NOT NULL,
  assigned_by           uuid,
  assigned_at           timestamp with time zone DEFAULT now(),
  status                text DEFAULT 'pending'::text,
  notes                 text,
  last_contacted_at     timestamp with time zone,
  next_follow_up        date,
  is_new                boolean DEFAULT true,
  station               text,
  transfer_id           integer,
  batch_id              text,
  batch_type            text,
  CONSTRAINT fro_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT fro_assignments_donor_id_fkey FOREIGN KEY (donor_id) REFERENCES public.donor_profiles(id),
  CONSTRAINT fro_assignments_fro_worker_id_fkey FOREIGN KEY (fro_worker_id) REFERENCES public.workers(id),
  CONSTRAINT fro_assignments_ngo_id_fkey FOREIGN KEY (ngo_id) REFERENCES public.ngos(id),
  CONSTRAINT fro_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id)
);

CREATE TABLE public.fro_donor_logs (
  id                        integer NOT NULL DEFAULT nextval('fro_donor_logs_id_seq'::regclass),
  assignment_id             integer NOT NULL,
  action                    text NOT NULL CHECK (action = ANY (ARRAY['call'::text, 'visit'::text, 'message'::text, 'follow_up'::text, 'donation'::text, 'note'::text, 'disposition'::text])),
  notes                     text,
  outcome                   text,
  amount_collected          numeric,
  created_by                uuid,
  created_at                timestamp with time zone DEFAULT now(),
  disposition_category      text,
  disposition_detail        text,
  scheduled_at              timestamp with time zone,
  payment_screenshot_url    text,
  accounts_status           text,
  pan_number                text,
  verified_at               timestamp with time zone,
  verified_by               uuid,
  donor_id                  integer,
  fro_worker_id             uuid,
  remark                    text,
  upi_transaction_id        text,
  transaction_datetime      timestamp with time zone,
  payment_from              text,
  payment_mode              text DEFAULT 'UPI'::text,
  rejection_reason          text,
  CONSTRAINT fro_donor_logs_pkey PRIMARY KEY (id),
  CONSTRAINT fro_donor_logs_donor_id_fkey FOREIGN KEY (donor_id) REFERENCES public.donor_profiles(id),
  CONSTRAINT fro_donor_logs_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.fro_assignments(id),
  CONSTRAINT fro_donor_logs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.workers(id),
  CONSTRAINT fro_donor_logs_fro_worker_id_fkey FOREIGN KEY (fro_worker_id) REFERENCES public.workers(id),
  CONSTRAINT fro_donor_logs_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.workers(id)
);

CREATE TABLE public.fro_scheduled_contacts (
  id              integer NOT NULL DEFAULT nextval('fro_scheduled_contacts_id_seq'::regclass),
  assignment_id   integer NOT NULL,
  scheduled_at    timestamp with time zone NOT NULL,
  notes           text,
  is_completed    boolean DEFAULT false,
  reminded        boolean DEFAULT false,
  created_by      uuid,
  created_at      timestamp with time zone DEFAULT now(),
  CONSTRAINT fro_scheduled_contacts_pkey PRIMARY KEY (id),
  CONSTRAINT fro_scheduled_contacts_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.fro_assignments(id),
  CONSTRAINT fro_scheduled_contacts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.workers(id)
);

CREATE TABLE public.fro_station_assignments (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  fro_worker_id     uuid,
  ngo_id            uuid,
  station           text NOT NULL,
  assigned_by       uuid,
  created_at        timestamp without time zone DEFAULT now(),
  updated_at        timestamp without time zone DEFAULT now(),
  CONSTRAINT fro_station_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT fro_station_assignments_fro_worker_id_fkey FOREIGN KEY (fro_worker_id) REFERENCES public.workers(id),
  CONSTRAINT fro_station_assignments_ngo_id_fkey FOREIGN KEY (ngo_id) REFERENCES public.ngos(id)
);

CREATE TABLE public.fro_live_status (
  id                      uuid NOT NULL DEFAULT gen_random_uuid(),
  worker_id               uuid UNIQUE,
  status                  text NOT NULL DEFAULT 'offline'::text CHECK (status = ANY (ARRAY['online'::text, 'on_call'::text, 'idle'::text, 'offline'::text, 'break'::text])),
  current_donor_name      text,
  current_donor_id        integer,
  call_started_at         timestamp with time zone,
  today_calls             integer DEFAULT 0,
  today_talk_seconds      integer DEFAULT 0,
  updated_at              timestamp with time zone DEFAULT now(),
  today_skipped           integer DEFAULT 0,
  today_idle_seconds      integer DEFAULT 0,
  today_break_seconds     integer DEFAULT 0,
  on_break                boolean DEFAULT false,
  break_started_at        timestamp with time zone,
  break_type              text,
  data_tab                text DEFAULT 'new'::text,
  current_batch_id        text,
  new_donor_id            integer,
  old_donor_id            integer,
  new_donor_index         integer,
  old_donor_index         integer,
  CONSTRAINT fro_live_status_pkey PRIMARY KEY (id),
  CONSTRAINT fro_live_status_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id)
);

CREATE TABLE public.fro_transfers (
  id                      uuid NOT NULL DEFAULT gen_random_uuid(),
  station                 text NOT NULL,
  source_fro_worker_id    text,
  target_fro_worker_id    text,
  target_station          text NOT NULL,
  ngo_id                  text,
  donor_count             integer DEFAULT 0,
  returned                boolean DEFAULT false,
  auto_return_at          timestamp with time zone,
  returned_at             timestamp with time zone,
  created_at              timestamp with time zone DEFAULT now(),
  created_by              text,
  CONSTRAINT fro_transfers_pkey PRIMARY KEY (id)
);

CREATE TABLE public.rejected_lead_tickets (
  id                  integer NOT NULL DEFAULT nextval('rejected_lead_tickets_id_seq'::regclass),
  fro_donor_log_id    text NOT NULL,
  fro_worker_id       text,
  ngo_id              text,
  donor_name          text,
  amount              numeric,
  rejection_reason    text,
  status              text DEFAULT 'pending_review'::text CHECK (status = ANY (ARRAY['pending_review'::text, 'acknowledged'::text, 'resolved'::text])),
  reviewed_by         text,
  reviewed_at         timestamp with time zone,
  created_at          timestamp with time zone DEFAULT now(),
  CONSTRAINT rejected_lead_tickets_pkey PRIMARY KEY (id)
);

CREATE TABLE public.suspense_donations (
  id                    integer NOT NULL DEFAULT nextval('suspense_donations_id_seq'::regclass),
  donor_name            text NOT NULL,
  amount                numeric NOT NULL DEFAULT 0,
  transaction_date      date,
  notes                 text,
  assigned_to_fro_id    uuid,
  assigned_at           timestamp with time zone,
  status                text DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'resolved'::text])),
  imported_data_id      uuid,
  created_at            timestamp with time zone DEFAULT now(),
  CONSTRAINT suspense_donations_pkey PRIMARY KEY (id),
  CONSTRAINT suspense_donations_assigned_to_fro_id_fkey FOREIGN KEY (assigned_to_fro_id) REFERENCES public.workers(id),
  CONSTRAINT suspense_donations_imported_data_id_fkey FOREIGN KEY (imported_data_id) REFERENCES public.new_data(id)
);

CREATE TABLE public.fro_data_requests (
  id                integer NOT NULL DEFAULT nextval('fro_data_requests_id_seq'::regclass),
  fro_worker_id     uuid NOT NULL,
  message           text NOT NULL,
  status            text NOT NULL DEFAULT 'pending'::text,
  created_at        timestamp with time zone NOT NULL DEFAULT now(),
  ngo_id            uuid,
  admin_response    text,
  resolved_at       timestamp with time zone,
  CONSTRAINT fro_data_requests_pkey PRIMARY KEY (id),
  CONSTRAINT fro_data_requests_ngo_id_fkey FOREIGN KEY (ngo_id) REFERENCES public.ngos(id)
);

-- 7. BANK AUDIT & FINANCE
-- ============================================================================

CREATE TABLE public.bank_audit_entries (
  id                      integer NOT NULL DEFAULT nextval('bank_audit_entries_id_seq'::regclass),
  source_id               integer NOT NULL,
  amount                  numeric NOT NULL,
  payment_id              text,
  check_id                text,
  transaction_date        date NOT NULL,
  remarks                 text,
  created_by              uuid,
  created_at              timestamp with time zone DEFAULT now(),
  updated_at              timestamp with time zone DEFAULT now(),
  bank_name               text,
  status                  text DEFAULT 'unverified'::text,
  assigned_to_ngo_admin   boolean DEFAULT false,
  assigned_to_fro_id      uuid,
  assigned_at             timestamp with time zone,
  screenshot_url          text,
  donor_details           text,
  ngo_admin_notes         text,
  donor_id                integer,
  matched_at              timestamp with time zone,
  no_match_by             text,
  payer_name              character varying DEFAULT NULL::character varying,
  payment_time            time without time zone,
  CONSTRAINT bank_audit_entries_pkey PRIMARY KEY (id),
  CONSTRAINT bank_audit_entries_donor_id_fkey FOREIGN KEY (donor_id) REFERENCES public.donor_profiles(id),
  CONSTRAINT bank_audit_entries_assigned_to_fro_id_fkey FOREIGN KEY (assigned_to_fro_id) REFERENCES public.workers(id),
  CONSTRAINT bank_audit_entries_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.bank_audit_sources(id)
);

CREATE TABLE public.payment_webhook_log (
  id                integer NOT NULL DEFAULT nextval('payment_webhook_log_id_seq'::regclass),
  gateway           text NOT NULL,
  event_type        text,
  payment_id        text,
  order_id          text,
  amount            numeric,
  gateway_source    text,
  sender_name       text,
  sender_email      text,
  sender_phone      text,
  raw_payload       jsonb,
  bank_entry_id     integer,
  status            text DEFAULT 'received'::text,
  error_message     text,
  created_at        timestamp with time zone DEFAULT now(),
  account_id        integer,
  account_name      text,
  CONSTRAINT payment_webhook_log_pkey PRIMARY KEY (id),
  CONSTRAINT payment_webhook_log_bank_entry_id_fkey FOREIGN KEY (bank_entry_id) REFERENCES public.bank_audit_entries(id)
);

CREATE TABLE public.receipts (
  id                integer NOT NULL DEFAULT nextval('receipts_id_seq'::regclass),
  log_id            integer,
  receipt_no        text NOT NULL,
  project_id        text NOT NULL,
  donor_name        text NOT NULL,
  amount            numeric NOT NULL DEFAULT 0,
  pan_number        text,
  address           text,
  mode              text,
  purpose           text DEFAULT 'General Donation'::text,
  receipt_date      date DEFAULT CURRENT_DATE,
  generated_by      uuid,
  created_at        timestamp with time zone DEFAULT now(),
  donor_mobile      text,
  donor_id          integer REFERENCES public.donor_profiles(id),
  sent              boolean DEFAULT false,
  sent_at           timestamp with time zone,
  email             text,
  payment_id        text,
  bank_name         text,
  agent_name        text,
  CONSTRAINT receipts_pkey PRIMARY KEY (id),
  CONSTRAINT receipts_log_id_fkey FOREIGN KEY (log_id) REFERENCES public.fro_donor_logs(id),
  CONSTRAINT receipts_generated_by_fkey FOREIGN KEY (generated_by) REFERENCES public.workers(id)
);

-- 8. NOTIFICATIONS
-- ============================================================================

CREATE TABLE public.fcm_tokens (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  worker_id     uuid UNIQUE,
  token         text NOT NULL,
  device_type   text DEFAULT 'flutter'::text,
  created_at    timestamp with time zone DEFAULT now(),
  updated_at    timestamp with time zone DEFAULT now(),
  CONSTRAINT fcm_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT fcm_tokens_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id)
);

CREATE TABLE public.notification_log (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  worker_id         uuid,
  type              text NOT NULL CHECK (type = ANY (ARRAY['admin'::text, 'birthday'::text, 'punch_out_reminder'::text, 'punch_reminder'::text, 'lead_rejected'::text])),
  title             text NOT NULL,
  body              text NOT NULL,
  reference_id      uuid,
  sent_at           timestamp with time zone DEFAULT now(),
  read_at           timestamp with time zone,
  fro_donor_log_id  text,
  CONSTRAINT notification_log_pkey PRIMARY KEY (id),
  CONSTRAINT notification_log_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id)
);

CREATE TABLE public.scheduled_notifications (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  ngo_id            uuid,
  title             text NOT NULL,
  body              text NOT NULL,
  recipient_type    text NOT NULL DEFAULT 'all_workers'::text CHECK (recipient_type = 'all_workers'::text),
  scheduled_at      timestamp with time zone NOT NULL,
  status            text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'sent'::text, 'cancelled'::text])),
  sent_at           timestamp with time zone,
  created_by        uuid,
  created_at        timestamp with time zone DEFAULT now(),
  updated_at        timestamp with time zone DEFAULT now(),
  CONSTRAINT scheduled_notifications_pkey PRIMARY KEY (id),
  CONSTRAINT scheduled_notifications_ngo_id_fkey FOREIGN KEY (ngo_id) REFERENCES public.ngos(id),
  CONSTRAINT scheduled_notifications_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);

-- 9. CRM / LEADS
-- ============================================================================

CREATE TABLE public.leads (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  recruiter_id      uuid,
  name              text NOT NULL,
  phone             text,
  email             text,
  source            text DEFAULT 'Walk-in'::text,
  status            text DEFAULT 'new'::text CHECK (status = ANY (ARRAY['rejected'::text, 'selected'::text, 'hold'::text, 'scheduled'::text, 'joined'::text])),
  notes             text,
  created_at        timestamp with time zone DEFAULT now(),
  updated_at        timestamp with time zone DEFAULT now(),
  age               integer,
  created_by        uuid,
  created_by_name   text,
  dob               date,
  scheduled_date    date,
  scheduled_by      uuid,
  scheduled_at      timestamp with time zone,
  scheduled_by_name text,
  CONSTRAINT leads_pkey PRIMARY KEY (id),
  CONSTRAINT leads_recruiter_id_fkey FOREIGN KEY (recruiter_id) REFERENCES public.users(id)
);

CREATE TABLE public.call_logs (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  lead_id           uuid,
  telecaller_id     uuid,
  call_time         timestamp with time zone DEFAULT now(),
  duration_seconds  integer DEFAULT 0,
  call_type         text CHECK (call_type = ANY (ARRAY['outgoing'::text, 'incoming'::text, 'missed'::text])),
  status            text CHECK (status = ANY (ARRAY['connected'::text, 'not_reached'::text, 'busy'::text, 'switched_off'::text, 'wrong_number'::text])),
  notes             text,
  follow_up_date    date,
  created_at        timestamp with time zone DEFAULT now(),
  CONSTRAINT call_logs_pkey PRIMARY KEY (id),
  CONSTRAINT call_logs_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id),
  CONSTRAINT call_logs_telecaller_id_fkey FOREIGN KEY (telecaller_id) REFERENCES public.users(id)
);

-- 10. EVENTS, NOTICES, ACHIEVEMENTS, HOLIDAYS, TASKS
-- ============================================================================

CREATE TABLE public.events (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  ngo_id        uuid,
  title         text NOT NULL,
  description   text,
  event_date    date NOT NULL,
  event_time    time without time zone,
  location      text,
  created_by    uuid,
  is_active     boolean DEFAULT true,
  created_at    timestamp with time zone DEFAULT now(),
  updated_at    timestamp with time zone DEFAULT now(),
  CONSTRAINT events_pkey PRIMARY KEY (id),
  CONSTRAINT events_ngo_id_fkey FOREIGN KEY (ngo_id) REFERENCES public.ngos(id)
);

CREATE TABLE public.notices (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  ngo_id            uuid,
  title             text NOT NULL,
  content           text NOT NULL DEFAULT ''::text,
  created_by        uuid,
  is_active         boolean DEFAULT true,
  created_at        timestamp with time zone DEFAULT now(),
  updated_at        timestamp with time zone DEFAULT now(),
  target_role       character varying DEFAULT 'all'::character varying,
  created_by_name   text,
  CONSTRAINT notices_pkey PRIMARY KEY (id),
  CONSTRAINT notices_ngo_id_fkey FOREIGN KEY (ngo_id) REFERENCES public.ngos(id)
);

CREATE TABLE public.achievements (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  ngo_id        uuid,
  worker_id     uuid,
  title         text NOT NULL,
  description   text,
  awarded_date  date DEFAULT CURRENT_DATE,
  created_by    uuid,
  created_at    timestamp with time zone DEFAULT now(),
  CONSTRAINT achievements_pkey PRIMARY KEY (id),
  CONSTRAINT achievements_ngo_id_fkey FOREIGN KEY (ngo_id) REFERENCES public.ngos(id),
  CONSTRAINT achievements_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id)
);

CREATE TABLE public.holidays (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  ngo_id        uuid,
  name          text NOT NULL,
  date          date NOT NULL,
  type          text NOT NULL DEFAULT 'holiday'::text CHECK (type = ANY (ARRAY['holiday'::text, 'event'::text])),
  is_recurring  boolean DEFAULT true,
  created_by    uuid,
  created_at    timestamp with time zone DEFAULT now(),
  updated_at    timestamp with time zone DEFAULT now(),
  CONSTRAINT holidays_pkey PRIMARY KEY (id),
  CONSTRAINT holidays_ngo_id_fkey FOREIGN KEY (ngo_id) REFERENCES public.ngos(id)
);

CREATE TABLE public.tasks (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  worker_id       uuid NOT NULL,
  title           text NOT NULL,
  description     text,
  status          text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text])),
  deadline        date,
  assigned_date   timestamp with time zone DEFAULT now(),
  created_at      timestamp with time zone DEFAULT now(),
  CONSTRAINT tasks_pkey PRIMARY KEY (id),
  CONSTRAINT tasks_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id)
);

CREATE TABLE public.causes (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  ngo_id        uuid NOT NULL,
  name          text NOT NULL,
  description   text,
  file_url      text,
  file_name     text,
  is_active     boolean DEFAULT true,
  created_at    timestamp with time zone DEFAULT now(),
  updated_at    timestamp with time zone DEFAULT now(),
  CONSTRAINT causes_pkey PRIMARY KEY (id),
  CONSTRAINT causes_ngo_id_fkey FOREIGN KEY (ngo_id) REFERENCES public.ngos(id)
);

CREATE TABLE public.alerts (
  id                bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  ngo_id            text NOT NULL,
  type              text NOT NULL,
  title             text,
  description       text,
  fro_name          text,
  donor_name        text,
  reference_id      bigint,
  acknowledged      boolean DEFAULT false,
  acknowledged_at   timestamp with time zone,
  created_at        timestamp with time zone DEFAULT now(),
  CONSTRAINT alerts_pkey PRIMARY KEY (id)
);

-- 11. HR / LETTERS
-- ============================================================================

CREATE TABLE public.letter_templates (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  ngo_id        uuid,
  title         text NOT NULL,
  category      text NOT NULL CHECK (category = ANY (ARRAY['joining'::text, 'offer'::text, 'experience'::text, 'appointment'::text, 'salary_revision'::text])),
  html_content  text NOT NULL DEFAULT ''::text,
  variables     jsonb DEFAULT '[]'::jsonb,
  created_by    uuid,
  is_active     boolean DEFAULT true,
  created_at    timestamp with time zone DEFAULT now(),
  updated_at    timestamp with time zone DEFAULT now(),
  CONSTRAINT letter_templates_pkey PRIMARY KEY (id),
  CONSTRAINT letter_templates_ngo_id_fkey FOREIGN KEY (ngo_id) REFERENCES public.ngos(id),
  CONSTRAINT letter_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);

CREATE TABLE public.generated_letters (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  template_id   uuid,
  worker_id     uuid,
  ngo_id        uuid,
  generated_by  uuid,
  filled_html   text NOT NULL,
  variables     jsonb DEFAULT '{}'::jsonb,
  created_at    timestamp with time zone DEFAULT now(),
  CONSTRAINT generated_letters_pkey PRIMARY KEY (id),
  CONSTRAINT generated_letters_generated_by_fkey FOREIGN KEY (generated_by) REFERENCES public.users(id),
  CONSTRAINT generated_letters_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.letter_templates(id),
  CONSTRAINT generated_letters_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id),
  CONSTRAINT generated_letters_ngo_id_fkey FOREIGN KEY (ngo_id) REFERENCES public.ngos(id)
);

-- 12. WHATSAPP
-- ============================================================================

CREATE TABLE public.whatsapp_accounts (
  id                integer NOT NULL DEFAULT nextval('whatsapp_accounts_id_seq'::regclass),
  name              text NOT NULL,
  project           text NOT NULL UNIQUE,
  phone_number_id   text NOT NULL,
  access_token      text NOT NULL,
  waba_id           text NOT NULL,
  is_active         boolean DEFAULT true,
  is_default        boolean DEFAULT false,
  created_at        timestamp with time zone DEFAULT now(),
  CONSTRAINT whatsapp_accounts_pkey PRIMARY KEY (id)
);

CREATE TABLE public.fro_whatsapp_assignments (
  id                    integer NOT NULL DEFAULT nextval('fro_whatsapp_assignments_id_seq'::regclass),
  fro_worker_id         uuid NOT NULL,
  whatsapp_account_id   integer NOT NULL,
  is_active             boolean DEFAULT true,
  created_at            timestamp with time zone DEFAULT now(),
  CONSTRAINT fro_whatsapp_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT fro_whatsapp_assignments_fro_worker_id_fkey FOREIGN KEY (fro_worker_id) REFERENCES public.workers(id),
  CONSTRAINT fro_whatsapp_assignments_whatsapp_account_id_fkey FOREIGN KEY (whatsapp_account_id) REFERENCES public.whatsapp_accounts(id)
);

CREATE TABLE public.whatsapp_phone_numbers (
  id                uuid NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id         text,
  phone_number_id   text NOT NULL,
  is_primary        boolean DEFAULT false,
  created_at        timestamp with time zone DEFAULT now(),
  CONSTRAINT whatsapp_phone_numbers_pkey PRIMARY KEY (id)
);

CREATE TABLE public.contacts (
  id                  uuid NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id           text,
  phone               text,
  phone_normalized    text,
  wa_profile_name     text,
  source              text DEFAULT 'whatsapp'::text,
  project             text,
  created_at          timestamp with time zone DEFAULT now(),
  CONSTRAINT contacts_pkey PRIMARY KEY (id)
);

CREATE TABLE public.conversations (
  id                    uuid NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id             text,
  contact_id            uuid,
  phone_number_id       uuid,
  status                text DEFAULT 'open'::text,
  last_message_at       timestamp with time zone,
  last_inbound_at       timestamp with time zone,
  project               text,
  assigned_to           text,
  unread_count          integer DEFAULT 0,
  created_at            timestamp with time zone DEFAULT now(),
  assigned_agent_id     uuid,
  whatsapp_account_id   integer,
  CONSTRAINT conversations_pkey PRIMARY KEY (id),
  CONSTRAINT conversations_assigned_agent_id_fkey FOREIGN KEY (assigned_agent_id) REFERENCES public.users(id),
  CONSTRAINT conversations_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id),
  CONSTRAINT conversations_phone_number_id_fkey FOREIGN KEY (phone_number_id) REFERENCES public.whatsapp_phone_numbers(id),
  CONSTRAINT conversations_whatsapp_account_id_fkey FOREIGN KEY (whatsapp_account_id) REFERENCES public.whatsapp_accounts(id)
);

CREATE TABLE public.messages (
  id                  uuid NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id           text,
  conversation_id     uuid,
  contact_id          uuid,
  user_id             text,
  direction           text NOT NULL,
  message_type        text DEFAULT 'text'::text,
  body_text           text,
  wa_message_id       text,
  status              text DEFAULT 'queued'::text,
  message_category    text,
  template_id         text,
  template_params     jsonb,
  failure_reason      text,
  status_updated_at   timestamp with time zone,
  is_automated        boolean DEFAULT false,
  created_at          timestamp with time zone DEFAULT now(),
  media_id            text,
  media_url           text,
  media_mime_type     text,
  CONSTRAINT messages_pkey PRIMARY KEY (id),
  CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id),
  CONSTRAINT messages_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id)
);

CREATE TABLE public.whatsapp_webhook_logs (
  id                uuid NOT NULL DEFAULT uuid_generate_v4(),
  direction         text,
  event_type        text,
  payload           jsonb,
  processed         boolean DEFAULT false,
  processed_at      timestamp with time zone,
  account_project   text,
  created_at        timestamp with time zone DEFAULT now(),
  CONSTRAINT whatsapp_webhook_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE public.whatsapp_templates (
  id                  integer NOT NULL DEFAULT nextval('whatsapp_templates_id_seq'::regclass),
  ngo_id              uuid NOT NULL,
  name                character varying NOT NULL,
  language            character varying NOT NULL DEFAULT 'en'::character varying,
  category            character varying DEFAULT 'UTILITY'::character varying,
  status              character varying DEFAULT 'approved'::character varying,
  meta_template_id    character varying,
  components          jsonb DEFAULT '[]'::jsonb,
  project             character varying,
  created_at          timestamp with time zone DEFAULT now(),
  updated_at          timestamp with time zone DEFAULT now(),
  CONSTRAINT whatsapp_templates_pkey PRIMARY KEY (id),
  CONSTRAINT whatsapp_templates_ngo_id_fkey FOREIGN KEY (ngo_id) REFERENCES public.ngos(id)
);

CREATE TABLE public.quick_replies (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  name          text,
  message_text  text,
  label         text,
  category      text,
  is_active     boolean DEFAULT true,
  sort_order    integer DEFAULT 0,
  created_at    timestamp with time zone DEFAULT now(),
  CONSTRAINT quick_replies_pkey PRIMARY KEY (id)
);

CREATE TABLE public.media_library (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  name        text,
  category    text,
  label       text,
  file_url    text,
  file_type   text,
  file_size   integer,
  tenant_id   uuid,
  created_at  timestamp with time zone DEFAULT now(),
  CONSTRAINT media_library_pkey PRIMARY KEY (id)
);

-- 13. PAYMENTS / RAZORPAY
-- ============================================================================

CREATE TABLE public.razorpay_accounts (
  id                integer NOT NULL DEFAULT nextval('razorpay_accounts_id_seq'::regclass),
  name              text NOT NULL,
  key_id            text NOT NULL,
  key_secret        text NOT NULL,
  webhook_secret    text NOT NULL,
  is_active         boolean DEFAULT true,
  is_default        boolean DEFAULT false,
  last_synced_at    timestamp with time zone,
  created_at        timestamp with time zone DEFAULT now(),
  CONSTRAINT razorpay_accounts_pkey PRIMARY KEY (id)
);

-- 14. EMAIL IMPORT
-- ============================================================================

CREATE TABLE public.email_import_accounts (
  id                integer NOT NULL DEFAULT nextval('email_import_accounts_id_seq'::regclass),
  name              text,
  email             text NOT NULL,
  app_password      text NOT NULL,
  imap_host         text DEFAULT 'imap.gmail.com'::text,
  imap_port         integer DEFAULT 993,
  is_active         boolean DEFAULT true,
  last_polled_at    timestamp with time zone,
  created_at        timestamp with time zone DEFAULT now(),
  updated_at        timestamp with time zone DEFAULT now(),
  CONSTRAINT email_import_accounts_pkey PRIMARY KEY (id)
);

CREATE TABLE public.email_import_log (
  id                        integer NOT NULL DEFAULT nextval('email_import_log_id_seq'::regclass),
  account_id                integer,
  total_emails              integer DEFAULT 0,
  imported                  integer DEFAULT 0,
  skipped                   integer DEFAULT 0,
  errors                    text,
  started_at                timestamp with time zone DEFAULT now(),
  completed_at              timestamp with time zone,
  status                    text DEFAULT 'imported'::text,
  error_message             text,
  raw_snippet               text,
  account_name              text,
  seen                      boolean DEFAULT false,
  email_message_id          text UNIQUE,
  email_subject             text,
  email_from                text,
  received_at               timestamp with time zone,
  parsed_amount             numeric,
  parsed_payment_id         text,
  parsed_transaction_date   date,
  parsed_source             text,
  parsed_sender_name        text,
  bank_entry_id             integer,
  created_at                timestamp with time zone DEFAULT now(),
  CONSTRAINT email_import_log_pkey PRIMARY KEY (id),
  CONSTRAINT email_import_log_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.email_import_accounts(id),
  CONSTRAINT email_import_log_bank_entry_id_fkey FOREIGN KEY (bank_entry_id) REFERENCES public.bank_audit_entries(id)
);

-- 15. EVENT HEAD (Field Events Management)
-- ============================================================================

CREATE TABLE public.event_head_events (
  id                      integer NOT NULL DEFAULT nextval('event_head_events_id_seq'::regclass),
  name                    text NOT NULL,
  category                text,
  ngo_id                  text,
  csr_partner             text,
  donor                   text,
  date                    date,
  start_time              time without time zone,
  end_time                time without time zone,
  venue                   text,
  gps_location            text,
  district                text,
  state                   text,
  organizer               text,
  event_manager           text,
  coordinator             text,
  expected_beneficiaries  integer,
  budget                  numeric,
  priority                text DEFAULT 'Medium'::text,
  approval_status         text DEFAULT 'Draft'::text,
  status                  text DEFAULT 'Draft'::text,
  created_at              timestamp with time zone DEFAULT now(),
  updated_at              timestamp with time zone DEFAULT now(),
  created_by              text,
  CONSTRAINT event_head_events_pkey PRIMARY KEY (id)
);

CREATE TABLE public.event_head_assets (
  id              integer NOT NULL DEFAULT nextval('event_head_assets_id_seq'::regclass),
  name            text NOT NULL,
  quantity        integer DEFAULT 1,
  available_qty   integer,
  issued_qty      integer DEFAULT 0,
  damaged_qty     integer DEFAULT 0,
  purchase_cost   numeric,
  condition       text DEFAULT 'Good'::text,
  location        text,
  created_at      timestamp with time zone DEFAULT now(),
  updated_at      timestamp with time zone DEFAULT now(),
  CONSTRAINT event_head_assets_pkey PRIMARY KEY (id)
);

CREATE TABLE public.event_head_materials (
  id              integer NOT NULL DEFAULT nextval('event_head_materials_id_seq'::regclass),
  name            text NOT NULL,
  opening_stock   integer DEFAULT 0,
  received        integer DEFAULT 0,
  issued          integer DEFAULT 0,
  balance         integer DEFAULT 0,
  cost            numeric,
  warehouse       text,
  donor           text,
  created_at      timestamp with time zone DEFAULT now(),
  updated_at      timestamp with time zone DEFAULT now(),
  CONSTRAINT event_head_materials_pkey PRIMARY KEY (id)
);

CREATE TABLE public.event_head_distributions (
  id                integer NOT NULL DEFAULT nextval('event_head_distributions_id_seq'::regclass),
  event_id          integer,
  beneficiary_name  text NOT NULL,
  mobile            text,
  address           text,
  category          text,
  material_id       integer,
  quantity          integer DEFAULT 1,
  created_at        timestamp with time zone DEFAULT now(),
  CONSTRAINT event_head_distributions_pkey PRIMARY KEY (id),
  CONSTRAINT event_head_distributions_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.event_head_events(id),
  CONSTRAINT event_head_distributions_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.event_head_materials(id)
);

CREATE TABLE public.event_head_volunteers (
  id          integer NOT NULL DEFAULT nextval('event_head_volunteers_id_seq'::regclass),
  name        text NOT NULL,
  mobile      text,
  email       text,
  duty        text,
  attended    boolean DEFAULT false,
  created_at  timestamp with time zone DEFAULT now(),
  CONSTRAINT event_head_volunteers_pkey PRIMARY KEY (id)
);

CREATE TABLE public.event_head_expenses (
  id                integer NOT NULL DEFAULT nextval('event_head_expenses_id_seq'::regclass),
  event_id          integer,
  type              text NOT NULL,
  amount            numeric DEFAULT 0,
  description       text,
  bill_attached     boolean DEFAULT false,
  created_at        timestamp with time zone DEFAULT now(),
  CONSTRAINT event_head_expenses_pkey PRIMARY KEY (id),
  CONSTRAINT event_head_expenses_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.event_head_events(id)
);

CREATE TABLE public.event_head_vehicles (
  id                  integer NOT NULL DEFAULT nextval('event_head_vehicles_id_seq'::regclass),
  vehicle_name        text NOT NULL,
  driver              text,
  fuel                text,
  kilometer_reading   text,
  assigned_event      integer,
  status              text DEFAULT 'Assigned'::text,
  created_at          timestamp with time zone DEFAULT now(),
  CONSTRAINT event_head_vehicles_pkey PRIMARY KEY (id),
  CONSTRAINT event_head_vehicles_assigned_event_fkey FOREIGN KEY (assigned_event) REFERENCES public.event_head_events(id)
);

CREATE TABLE public.event_head_media (
  id          integer NOT NULL DEFAULT nextval('event_head_media_id_seq'::regclass),
  event_id    integer,
  name        text,
  url         text,
  type        text,
  created_at  timestamp with time zone DEFAULT now(),
  CONSTRAINT event_head_media_pkey PRIMARY KEY (id),
  CONSTRAINT event_head_media_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.event_head_events(id)
);

CREATE TABLE public.event_head_attendance (
  id          integer NOT NULL DEFAULT nextval('event_head_attendance_id_seq'::regclass),
  event_id    integer,
  name        text NOT NULL,
  type        text DEFAULT 'Staff'::text,
  status      text DEFAULT 'Present'::text,
  created_at  timestamp with time zone DEFAULT now(),
  CONSTRAINT event_head_attendance_pkey PRIMARY KEY (id),
  CONSTRAINT event_head_attendance_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.event_head_events(id)
);

CREATE TABLE public.event_head_checklist (
  id          integer NOT NULL DEFAULT nextval('event_head_checklist_id_seq'::regclass),
  event_id    integer,
  label       text NOT NULL,
  status      boolean DEFAULT false,
  notes       text,
  created_at  timestamp with time zone DEFAULT now(),
  CONSTRAINT event_head_checklist_pkey PRIMARY KEY (id),
  CONSTRAINT event_head_checklist_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.event_head_events(id)
);

CREATE TABLE public.event_head_partners (
  id          integer NOT NULL DEFAULT nextval('event_head_partners_id_seq'::regclass),
  name        text NOT NULL,
  contact     text,
  email       text,
  type        text DEFAULT 'CSR'::text,
  created_at  timestamp with time zone DEFAULT now(),
  CONSTRAINT event_head_partners_pkey PRIMARY KEY (id)
);

CREATE TABLE public.event_head_donors (
  id          integer NOT NULL DEFAULT nextval('event_head_donors_id_seq'::regclass),
  name        text NOT NULL,
  contact     text,
  email       text,
  address     text,
  created_at  timestamp with time zone DEFAULT now(),
  CONSTRAINT event_head_donors_pkey PRIMARY KEY (id)
);

-- 16. ASSETS (IT / Hardware)
-- ============================================================================

CREATE TABLE public.assets (
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  code                text UNIQUE,
  name                text NOT NULL,
  category            text,
  brand               text,
  model               text,
  serial_no           text,
  department          text,
  condition           text DEFAULT 'New'::text,
  status              text DEFAULT 'available'::text,
  assigned_to         uuid,
  assigned_to_name    text,
  assigned_date       date,
  purchase_date       date,
  purchase_price      numeric DEFAULT 0,
  vendor              text,
  warranty_expiry     date,
  sim_number          text,
  sim_operator        text,
  sim_plan            numeric,
  repair_shop         text,
  repair_cost         numeric,
  repair_date         date,
  total_repair_cost   numeric DEFAULT 0,
  remarks             text,
  history             jsonb DEFAULT '[]'::jsonb,
  created_at          timestamp with time zone DEFAULT now(),
  updated_at          timestamp with time zone DEFAULT now(),
  CONSTRAINT assets_pkey PRIMARY KEY (id)
);

-- 17. SUPPORT / DEVELOPER TICKETS
-- ============================================================================

CREATE TABLE public.support_tickets (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  raised_by     uuid NOT NULL,
  department    text NOT NULL DEFAULT 'accounts'::text,
  category      text NOT NULL DEFAULT 'other'::text,
  subject       text NOT NULL,
  description   text,
  reference_id  text,
  priority      text NOT NULL DEFAULT 'medium'::text,
  status        text NOT NULL DEFAULT 'open'::text,
  resolved_by   uuid,
  resolution    text,
  created_at    timestamp with time zone NOT NULL DEFAULT now(),
  updated_at    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT support_tickets_pkey PRIMARY KEY (id),
  CONSTRAINT support_tickets_raised_by_fkey FOREIGN KEY (raised_by) REFERENCES public.workers(id),
  CONSTRAINT support_tickets_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.users(id)
);

CREATE TABLE public.ticket_replies (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_id     uuid NOT NULL,
  sender_id     uuid NOT NULL,
  sender_type   text NOT NULL DEFAULT 'worker'::text,
  message       text NOT NULL,
  created_at    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ticket_replies_pkey PRIMARY KEY (id),
  CONSTRAINT ticket_replies_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id)
);

CREATE TABLE public.developer_tickets (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_id         text,
  raised_by         uuid,
  raised_by_panel   text,
  subject           text NOT NULL,
  description       text,
  category          text DEFAULT 'other'::text,
  priority          text DEFAULT 'medium'::text,
  status            text DEFAULT 'open'::text,
  assigned_to       uuid,
  reference_id      text,
  created_at        timestamp with time zone DEFAULT now(),
  updated_at        timestamp with time zone DEFAULT now(),
  resolved_at       timestamp with time zone,
  first_response_at timestamp with time zone,
  CONSTRAINT developer_tickets_pkey PRIMARY KEY (id),
  CONSTRAINT developer_tickets_raised_by_fkey FOREIGN KEY (raised_by) REFERENCES public.workers(id),
  CONSTRAINT developer_tickets_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.workers(id)
);

CREATE TABLE public.developer_ticket_replies (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_id     uuid NOT NULL,
  sender_id     uuid,
  message       text NOT NULL,
  is_internal   boolean DEFAULT false,
  created_at    timestamp with time zone DEFAULT now(),
  CONSTRAINT developer_ticket_replies_pkey PRIMARY KEY (id),
  CONSTRAINT developer_ticket_replies_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.developer_tickets(id),
  CONSTRAINT developer_ticket_replies_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.workers(id)
);

-- 18. ASSIGNMENTS (Agent-Phone / Worker-Agent)
-- ============================================================================

CREATE TABLE public.agent_phone_assignments (
  user_id     uuid NOT NULL,
  account_id  bigint NOT NULL,
  assigned_at timestamp with time zone DEFAULT now(),
  CONSTRAINT agent_phone_assignments_pkey PRIMARY KEY (user_id, account_id)
);

CREATE TABLE public.worker_agent_assignments (
  worker_id   uuid NOT NULL,
  user_id     uuid NOT NULL,
  created_at  timestamp with time zone DEFAULT now(),
  account_id  integer,
  CONSTRAINT worker_agent_assignments_pkey PRIMARY KEY (worker_id, user_id),
  CONSTRAINT worker_agent_assignments_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id),
  CONSTRAINT worker_agent_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT worker_agent_assignments_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.whatsapp_accounts(id)
);
