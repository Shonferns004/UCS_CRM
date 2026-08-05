CREATE INDEX IF NOT EXISTS idx_new_data_mobile_number ON public.new_data(mobile_number);
CREATE INDEX IF NOT EXISTS idx_new_data_import_batch_id ON public.new_data(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_new_data_ngo_mobile_number ON public.new_data(ngo, mobile_number);
