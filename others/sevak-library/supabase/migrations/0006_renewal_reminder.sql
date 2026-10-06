-- 0006_renewal_reminder.sql
-- Add a dedup column so each approved membership receives exactly one
-- automatic renewal reminder email when it reaches/expires its end date.

alter table public.applications
  add column if not exists renewal_email_sent boolean not null default false;

-- ---------------------------------------------------------------------
-- IMPORTANT: the daily scheduling below is done in
-- the Supabase Dashboard because pg_cron / pg_net must be enabled there.
--
-- 1. Enable extensions in the Dashboard -> Database -> Extensions:
--        pg_cron
--        pg_net
-- 2. Add an Edge Function secret named CRON_SECRET (any random string).
-- 3. Replace <SUPABASE_URL> and <CRON_SECRET> and run this in SQL Editor:
--
--    select cron.schedule(
--      'renewal-daily', '0 6 * * *',
--      $$
--      select net.http_post(
--        url := '<SUPABASE_URL>/functions/v1/send-membership-email',
--        headers := jsonb_build_object(
--          'Content-Type','application/json',
--          'Authorization','Bearer <CRON_SECRET>'
--        ),
--        body := jsonb_build_object('mode','renewal_scan')
--      );
--      $$
--    );
--
-- 4. The edge function runs the scan once daily; it only emails members
--    whose end_date <= current_date AND renewal_email_sent = false, then
--    sets the flag so they are never emailed again.
-- ---------------------------------------------------------------------