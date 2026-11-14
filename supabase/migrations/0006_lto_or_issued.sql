
-- "(LTO) OR Issued" date for the franchise holder's vehicle. Optional.
ALTER TABLE public.holders ADD COLUMN IF NOT EXISTS lto_or_issued DATE;
NOTIFY pgrst, 'reload schema';
