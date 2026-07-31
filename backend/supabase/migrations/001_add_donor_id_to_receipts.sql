ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS donor_id integer REFERENCES public.donor_profiles(id);
