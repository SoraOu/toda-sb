
-- 0007: Admin pre-registration, yearly MTOP numbering, admin becomes view-only on holders.
-- Run AFTER 0006, and BEFORE deploying the new JS.

-- ========== 1. MTOP year (numbering restarts each calendar year) ==========
ALTER TABLE public.holders ADD COLUMN IF NOT EXISTS mtop_year smallint;

-- Every MTOP that exists today belongs to the 2026 numbering run (they stay unique among themselves).
-- Triggers are switched off so this does not flood the activity log.
ALTER TABLE public.holders DISABLE TRIGGER USER;
UPDATE public.holders SET mtop_year = 2026 WHERE mtop_no IS NOT NULL AND mtop_year IS NULL;
ALTER TABLE public.holders ENABLE TRIGGER USER;

-- Unique per year: 001 of 2027 may exist next to 001 of 2026.
CREATE UNIQUE INDEX IF NOT EXISTS holders_mtop_year_uq
  ON public.holders (mtop_year, lower(btrim(mtop_no))) WHERE mtop_no IS NOT NULL;
DROP INDEX IF EXISTS public.holders_mtop_uq;

-- A new holder gets the current year unless the app sends one (completing a pre-registration sends its year).
CREATE OR REPLACE FUNCTION public.holders_set_mtop_year() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF new.mtop_no IS NULL THEN
    new.mtop_year := NULL;
  ELSIF tg_op = 'INSERT' THEN
    new.mtop_year := coalesce(new.mtop_year, extract(year FROM (now() AT TIME ZONE 'Asia/Manila'))::smallint);
  ELSE
    new.mtop_year := coalesce(new.mtop_year, old.mtop_year, extract(year FROM (now() AT TIME ZONE 'Asia/Manila'))::smallint);
  END IF;
  RETURN new;
END $$;
DROP TRIGGER IF EXISTS holders_mtop_year ON public.holders;
CREATE TRIGGER holders_mtop_year BEFORE INSERT OR UPDATE ON public.holders
  FOR EACH ROW EXECUTE FUNCTION public.holders_set_mtop_year();

-- ========== 2. Pre-registrations ==========
-- One counter row per year. Only the function below touches it (RLS on, no policies).
CREATE TABLE IF NOT EXISTS public.mtop_counters (
  year    smallint PRIMARY KEY,
  last_no integer  NOT NULL DEFAULT 0
);
ALTER TABLE public.mtop_counters ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.pre_registrations (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name            text        NOT NULL CHECK (btrim(name) <> ''),
  mtop_no         text        NOT NULL CHECK (mtop_no ~ '^[0-9]{3}$'),
  mtop_year       smallint    NOT NULL,
  status          text        NOT NULL DEFAULT 'new' CHECK (status IN ('new','seen','completed','cancelled')),
  created_by      uuid        NOT NULL DEFAULT auth.uid(),
  created_by_name text        DEFAULT (auth.jwt() ->> 'email'),
  created_at      timestamptz NOT NULL DEFAULT now(),
  seen_at         timestamptz,
  holder_id       bigint      REFERENCES public.holders(id),
  UNIQUE (mtop_year, mtop_no)
);
ALTER TABLE public.pre_registrations ENABLE ROW LEVEL SECURITY;

-- Admin sees only their own rows; super_admin sees all. Rows are created ONLY by create_pre_registration().
DROP POLICY IF EXISTS pre_read ON public.pre_registrations;
CREATE POLICY pre_read ON public.pre_registrations FOR SELECT TO authenticated
  USING (is_super() OR (is_admin() AND created_by = auth.uid()));
DROP POLICY IF EXISTS pre_update ON public.pre_registrations;
CREATE POLICY pre_update ON public.pre_registrations FOR UPDATE TO authenticated
  USING (is_super()) WITH CHECK (is_super());
GRANT SELECT, UPDATE ON public.pre_registrations TO authenticated;
REVOKE INSERT, DELETE ON public.pre_registrations FROM authenticated, anon;

-- Hands out the next free 3-digit MTOP of the current year. The UPDATE locks the counter row,
-- so two admins pressing the button at the same moment can never get the same number.
CREATE OR REPLACE FUNCTION public.create_pre_registration(p_name text)
RETURNS public.pre_registrations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  y   smallint := extract(year FROM (now() AT TIME ZONE 'Asia/Manila'))::smallint;
  top integer;
  n   integer;
  rec public.pre_registrations;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Not allowed.' USING ERRCODE = '42501'; END IF;
  IF btrim(coalesce(p_name, '')) = '' THEN RAISE EXCEPTION 'Name is required.'; END IF;

  INSERT INTO mtop_counters(year, last_no) VALUES (y, 0) ON CONFLICT (year) DO NOTHING;
  -- also skip any 3-digit MTOP already typed in by hand for this year
  SELECT coalesce(max(CASE WHEN mtop_no ~ '^[0-9]{3}$' THEN mtop_no::int END), 0) INTO top
    FROM holders WHERE mtop_year = y;
  UPDATE mtop_counters SET last_no = greatest(last_no, top) + 1 WHERE year = y RETURNING last_no INTO n;
  IF n > 999 THEN RAISE EXCEPTION 'All MTOP numbers for % are used up.', y; END IF;

  INSERT INTO pre_registrations(name, mtop_no, mtop_year, created_by, created_by_name)
  VALUES (btrim(p_name), lpad(n::text, 3, '0'), y, auth.uid(), auth.jwt() ->> 'email')
  RETURNING * INTO rec;
  RETURN rec;
END $$;
REVOKE EXECUTE ON FUNCTION public.create_pre_registration(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_pre_registration(text) TO authenticated;

-- When a holder is saved with a pre-registered MTOP (same year), the pre-registration is marked completed.
CREATE OR REPLACE FUNCTION public.complete_pre_registration() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF new.mtop_no IS NOT NULL THEN
    UPDATE pre_registrations SET status = 'completed', holder_id = new.id
     WHERE mtop_year = new.mtop_year AND mtop_no = btrim(new.mtop_no) AND status IN ('new','seen');
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS holders_complete_pre ON public.holders;
CREATE TRIGGER holders_complete_pre AFTER INSERT ON public.holders
  FOR EACH ROW EXECUTE FUNCTION public.complete_pre_registration();

-- Live bell for the super admin.
ALTER PUBLICATION supabase_realtime ADD TABLE public.pre_registrations;

-- ========== 3. Admin is view-only on holders; only super_admin writes ==========
DROP POLICY IF EXISTS holders_insert ON public.holders;
CREATE POLICY holders_insert ON public.holders FOR INSERT TO authenticated WITH CHECK (is_super());
DROP POLICY IF EXISTS holders_update ON public.holders;
CREATE POLICY holders_update ON public.holders FOR UPDATE TO authenticated USING (is_super()) WITH CHECK (is_super());

DROP POLICY IF EXISTS renewals_ins ON public.holder_renewals;
CREATE POLICY renewals_ins  ON public.holder_renewals       FOR INSERT TO authenticated WITH CHECK (is_super());
DROP POLICY IF EXISTS status_ins ON public.holder_status_history;
CREATE POLICY status_ins    ON public.holder_status_history FOR INSERT TO authenticated WITH CHECK (is_super());
DROP POLICY IF EXISTS transfers_ins ON public.holder_transfers;
CREATE POLICY transfers_ins ON public.holder_transfers      FOR INSERT TO authenticated WITH CHECK (is_super());

-- Chassis numbers and photo changes: super_admin only.
DROP POLICY IF EXISTS chassis_read ON public.holder_chassis;
CREATE POLICY chassis_read ON public.holder_chassis FOR SELECT TO authenticated USING (is_super());
DROP POLICY IF EXISTS chassis_ins ON public.holder_chassis;
CREATE POLICY chassis_ins ON public.holder_chassis FOR INSERT TO authenticated WITH CHECK (is_super());
DROP POLICY IF EXISTS chassis_upd ON public.holder_chassis;
CREATE POLICY chassis_upd ON public.holder_chassis FOR UPDATE TO authenticated USING (is_super()) WITH CHECK (is_super());
DROP POLICY IF EXISTS chassis_del ON public.holder_chassis;
CREATE POLICY chassis_del ON public.holder_chassis FOR DELETE TO authenticated USING (is_super());

DROP POLICY IF EXISTS photos_ins ON storage.objects;
CREATE POLICY photos_ins ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'holder-photos' AND public.is_super());
DROP POLICY IF EXISTS photos_upd ON storage.objects;
CREATE POLICY photos_upd ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'holder-photos' AND public.is_super())
  WITH CHECK (bucket_id = 'holder-photos' AND public.is_super());
DROP POLICY IF EXISTS photos_del ON storage.objects;
CREATE POLICY photos_del ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'holder-photos' AND public.is_super());

NOTIFY pgrst, 'reload schema';

-- ========== 4. Admin account (run separately, AFTER creating the user in Authentication > Users) ==========
-- INSERT INTO public.mtpfms_roles (user_id, role, full_name)
-- SELECT id, 'admin', 'Full Name Here' FROM auth.users WHERE email = 'ADMIN_EMAIL_HERE'
-- ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
