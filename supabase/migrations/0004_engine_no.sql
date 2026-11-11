-- Engine number on the franchise (operator) record. Run in the Supabase SQL editor.
-- Nothing else needs changing: existing RLS policies and table grants already cover new columns.
alter table holders add column if not exists engine_no text;
