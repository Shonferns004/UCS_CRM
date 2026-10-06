  -- 0011_load_existing_members.sql
  -- One-time backfill: load the existing member list (shared by the library as a
  -- spreadsheet) directly into `applications` as APPROVED members.
  --
  -- - Uses the same conventions as the import feature: auto SL-YYYY-XXXX IDs
  --   continuing from the current count of approved members, no transaction
  --   number (payments were collected offline), payment info stored in `data`.
  -- - Runs as the SQL Editor role, so it bypasses the staff check in the
  --   import_members RPC (auth.uid() is null there).
  -- - Rows whose mobile already exists are skipped (4 applicants may already be
  --   in the database from the online form).
  --
  -- Paste and run this in the Supabase Dashboard -> SQL Editor.

  with src as (
    select * from (values
      (1,  'Sumit Santosh Gupta',     '9987767751', '12th Pass',  '2026-07-17', 'Monthly',     1750, 'BSCT',        null, null, '2026-07-17', '2026-08-17', 5,   'Form Done'),
      (2,  'Deepak Dinanath Kondu',   '8086638504', 'C.A.',       '2026-07-25', 'Monthly',     1650, 'BSCT',        null, null, '2026-07-25', '2026-08-25', 13,  'Form Done No Photo'),
      (3,  'Nausad Ansari',           '8898647499', null,         '2026-07-29', 'Half Monthly', 500, 'BSCT',        null, null, '2026-07-29', '2026-08-13', 1,   'No Form'),
      (4,  'Adarsh Yadav',            '7977488979', null,         '2026-07-31', 'Monthly',     1100, 'BSCT',        null, null, '2026-07-31', '2026-08-31', 19,  'Form Done'),
      (5,  'Sushil Gupta',            '8422098868', 'C.A.',       '2026-08-01', 'Monthly',     1000, 'BSCT',        null, null, '2026-08-01', '2026-09-01', 20,  'Form Done No Photo'),
      (6,  'Saurabh Singh',           '9324170774', null,         '2026-08-01', 'Monthly',     1100, 'BSCT + Cash', null, null, '2026-08-01', '2026-09-01', 20,  'Form Done No Photo'),
      (7,  'Devraj Joshi',            '8619306680', 'MBBS',       '2026-08-03', 'Monthly',     1100, 'BSCT',        null, null, '2026-08-03', '2026-09-03', 22,  'Form Done No Photo'),
      (8,  'Sagar Gupta',             '7977793783', 'C.A.',       '2026-08-03', 'Monthly',     1100, 'BSCT',        null, null, '2026-08-03', '2026-09-03', 22,  'Form Done No Photo'),
      (9,  'Dikshita Deepak Shirtavale', '8208135679', 'C.A.',    '2026-08-04', '5 Months',    4850, 'BSCT',        null, null, '2026-08-04', '2026-12-04', 114, 'Form Done'),
      (10, 'Purva Gosavi',            '8097723291', 'JEE',        '2026-08-04', 'Quaterly',    2850, 'BSCT + Cash', null, null, '2026-08-04', '2026-10-04', 53,  'Form Done No Photo'),
      (11, 'Brijesh Yadav',           '9773864709', 'MCA',        '2026-07-07', 'Half Monthly', 5400, 'BSCT',       null, null, '2026-08-07', '2027-01-07', 148, 'Form Done No Photo'),
      (12, 'Nek Ravindra Ranka',      '9892920066', 'C.A.',       '2026-08-07', 'Half Monthly', 5400, 'BSCT',       null, null, '2026-08-07', '2027-01-07', 154, 'Form Done No Photo'),
      (13, 'Abhishek Punjara',        '9664623509', 'M.Com',      '2026-08-07', null,            200, 'BSCT',       null, null, '2026-08-07', '2026-08-07', 0,   'Form Done No Photo'),
      (14, 'Ritika .R. Vishwakarma',  '8591865510', '12th Pass',  '2026-08-02', 'Registration', 1000, 'BSCT',       null, null, '2026-08-05', '2026-09-05', 24,  'Form Done No Photo'),
      (15, 'Manav Bhavin Shah',       '8369489794', null,         '2026-08-11', 'Monthly',     1399, 'BSCT',        null, null, '2026-08-12', '2026-09-12', 31,  null)
    ) as t (
      sr_no, full_name, mobile, degree, registration_date, membership_type,
      membership_fee, amount_received, payment_mode, receipt_no,
      start_date, end_date, days_left, remarks
    )
  )
  insert into public.applications (
    ref,
    data,
    full_name,
    mobile,
    membership_type,
    membership_fee,
    start_date,
    end_date,
    status,
    membership_id
  )
  select
    'SL-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)),
    jsonb_build_object(
      'degree',           nullif(s.degree, ''),
      'registrationDate', s.registration_date,
      'amountReceived',   nullif(s.amount_received, ''),
      'paymentMode',      nullif(s.payment_mode, ''),
      'receiptNo',        nullif(s.receipt_no, ''),
      'daysLeft',         s.days_left,
      'remarks',          nullif(s.remarks, '')
    ),
    s.full_name,
    s.mobile,
    nullif(s.membership_type, ''),
    s.membership_fee,
    s.start_date::date,
    s.end_date::date,
    'APPROVED',
    'SL-' || to_char(now(), 'YYYY') || '-' || lpad((b.cnt + row_number() over (order by s.sr_no))::text, 4, '0')
  from src s
  cross join (
    select count(*) as cnt
      from public.applications
    where status = 'APPROVED'
      and membership_id is not null
  ) b
  where not exists (
    select 1 from public.applications a where a.mobile = s.mobile
  );

  -- Show what was just imported (and skipped duplicates stay out automatically).
  select full_name, mobile, membership_type, membership_fee, membership_id, status
    from public.applications
  where status = 'APPROVED'
  order by membership_id;
