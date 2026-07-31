ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS agent_name text;
