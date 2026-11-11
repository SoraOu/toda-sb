-- Optional MTOP permit Amount for the franchise holder. Amount is in PHP.
ALTER TABLE public.holders ADD COLUMN IF NOT EXISTS permit_amount NUMERIC(12,2);
NOTIFY pgrst, 'reload schema';
