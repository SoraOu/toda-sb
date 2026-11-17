-- MTPFMS initial schema. Derived from js/app.js (demo) + spec/PAGE-MAP.md.
-- Run in Supabase SQL editor, or `supabase db push`.

-- ========== ENUMS ==========
create type app_role      as enum ('super_admin','admin','viewer');
create type holder_class  as enum ('Operator','Driver','Driver-Operator');
create type franchise_cat as enum ('TODA','PODA');
create type holder_status as enum ('Active','Expired','Suspended','Cancelled','Pending');

-- ========== LOOKUPS ==========
create table associations (
  id       smallint generated always as identity primary key,
  name     text not null unique,
  category franchise_cat not null,
  unique (id, category)                       -- target for composite FK below
);

create table barangays (name text primary key);

insert into associations (name, category) values
 ('ARMOTODA','TODA'),('ASPTODA','TODA'),('BMTODA','TODA'),('BPTODA','TODA'),('BTODA','TODA'),
 ('BSMBBCTODA','TODA'),('CAPTODA','TODA'),('ICLBTODA','TODA'),('GUITODA','TODA'),('MATODA','TODA'),
 ('MMMTODA','TODA'),('MTLTTA','TODA'),('NJBTODA','TODA'),('SMMPHTODA','TODA'),
 ('MPODA','PODA'),('NLPODA','PODA'),('SPODA','PODA');

insert into barangays (name) values
 ('Anapog-Sibucao'),('Argao'),('Balanacan'),('Banto'),('Bintakay'),('Bocboc'),('Butansapa'),
 ('Candahon'),('Capayang'),('Danao'),('Dulong Bayan (Pob.)'),('Gitnang Bayan (Pob.)'),('Guisian'),
 ('Hinadharan'),('Hinanggayon'),('Ino'),('Janagdong'),('Lamesa'),('Laon'),('Magapua'),('Malayak'),
 ('Malusak'),('Mampaitan'),('Mangyan-Mababad'),('Market Site (Pob.)'),('Mataas Na Bayan'),
 ('Mendez'),('Nangka I (Pob.)'),('Nangka II'),('Paye'),('Pili'),('Puting Buhangin'),('Sayao'),
 ('Silangan'),('Sumangga'),('Tarug'),('Villa Mendez (Pob.)');

-- ========== USERS / ROLES ==========
-- One row per login. Create the user in Supabase Auth first, then insert a row here.
create table mtpfms_roles (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  role      app_role not null default 'viewer',
  full_name text
);

-- SECURITY DEFINER so RLS policies can read it without recursion.
create function current_app_role() returns app_role
language sql stable security definer set search_path = public as
$$ select role from mtpfms_roles where user_id = auth.uid() $$;

create function is_admin() returns boolean
language sql stable as $$ select coalesce(current_app_role() in ('admin','super_admin'), false) $$;

create function is_super() returns boolean
language sql stable as $$ select coalesce(current_app_role() = 'super_admin', false) $$;

-- ========== HOLDERS ==========
create table holders (
  id             bigint generated always as identity primary key,
  classification holder_class  not null,
  operator_id    bigint references holders(id),          -- demo: asg (drivers only)
  name           text          not null check (btrim(name) <> ''),
  address        text          not null check (btrim(address) <> ''),
  barangay       text          not null references barangays(name),
  phone          text          not null default '',
  category       franchise_cat not null,
  association_id smallint      not null,
  -- franchise fields (operators only)
  mtop_no        text,
  or_no          text,
  or_date        date,
  issued_on      date,
  expires_on     date,
  status         holder_status,
  plate_no       text,
  vehicle_type   text check (vehicle_type in ('Tricycle','Tribike','Other')),
  vehicle_model  text,
  color          text,
  is_public      boolean       not null default false,    -- demo: pub
  photo_path     text,                                    -- private Storage bucket path
  archived_on    date,
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now(),

  -- association must belong to the holder's category
  foreign key (association_id, category) references associations (id, category),

  -- drivers: must have an operator, no franchise data. Others: need MTOP + status + expiry.
  constraint driver_shape check (
    (classification = 'Driver'
       and operator_id is not null
       and mtop_no is null and status is null and expires_on is null)
    or
    (classification <> 'Driver'
       and operator_id is null
       and nullif(btrim(mtop_no),'') is not null
       and status is not null
       and expires_on is not null)
  )
);

-- MTOP No. unique, case-insensitive, archived rows included (demo rule).
create unique index holders_mtop_uq on holders (lower(btrim(mtop_no))) where mtop_no is not null;
create index holders_operator_ix on holders (operator_id);
create index holders_assoc_ix    on holders (association_id);
create index holders_expires_ix  on holders (expires_on) where archived_on is null;
-- Soft duplicate warnings (name+barangay, plate, OR, chassis) stay in the app, not constraints:
-- the demo lets the user confirm and save anyway.

-- Effective status: Active past expiry shows as Expired (demo: eff()).
create view holders_v with (security_invoker = true) as
select h.*,
  case when h.status = 'Active' and h.expires_on < current_date then 'Expired'::holder_status
       else h.status end                       as effective_status,
  (h.expires_on - current_date)                as days_to_expiry
from holders h;

-- Driver inherits category + association from operator (demo: save/doTransfer cascade).
create function sync_driver_from_operator() returns trigger
language plpgsql as $$
declare op holders;
begin
  if new.classification = 'Driver' then
    select * into op from holders where id = new.operator_id;
    if op.id is null or op.classification = 'Driver' or op.archived_on is not null then
      raise exception 'Choose an active operator for this driver.';
    end if;
    new.category := op.category;
    new.association_id := op.association_id;
  end if;
  return new;
end $$;
create trigger holders_driver_sync before insert or update on holders
  for each row execute function sync_driver_from_operator();

create function cascade_operator_to_drivers() returns trigger
language plpgsql as $$
begin
  if new.classification <> 'Driver'
     and (new.category, new.association_id) is distinct from (old.category, old.association_id) then
    update holders set category = new.category, association_id = new.association_id
    where operator_id = new.id;
  end if;
  return new;
end $$;
create trigger holders_cascade after update on holders
  for each row execute function cascade_operator_to_drivers();

-- Cannot archive an operator who still has live drivers (demo: doArchive).
create function block_archive_with_drivers() returns trigger
language plpgsql as $$
begin
  if new.archived_on is not null and old.archived_on is null
     and exists (select 1 from holders d where d.operator_id = new.id and d.archived_on is null) then
    raise exception 'Archive or reassign this operator''s drivers first.';
  end if;
  return new;
end $$;
create trigger holders_archive_guard before update on holders
  for each row execute function block_archive_with_drivers();

create function touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
create trigger holders_touch before update on holders
  for each row execute function touch_updated_at();

-- Chassis is hidden from viewers (demo rule), so it lives in its own admin-only table.
create table holder_chassis (
  holder_id  bigint primary key references holders(id),
  chassis_no text not null check (btrim(chassis_no) <> '')
);

-- ========== HISTORY TABLES ==========
create table holder_renewals (
  id         bigint generated always as identity primary key,
  holder_id  bigint not null references holders(id),
  renewed_on date   not null default current_date,
  old_expiry date   not null,
  new_expiry date   not null check (new_expiry > old_expiry),
  by_user    uuid   references auth.users(id) default auth.uid(),
  by_role    app_role default current_app_role()
);

create table holder_status_history (
  id         bigint generated always as identity primary key,
  holder_id  bigint not null references holders(id),
  changed_on date   not null default current_date,
  from_status holder_status,
  to_status   holder_status not null,
  reason     text,
  decided_by text,                                   -- who decided (free text, as in demo)
  by_user    uuid references auth.users(id) default auth.uid(),
  by_role    app_role default current_app_role(),
  -- Suspended / Cancelled require reason + decider (demo rule)
  check (to_status not in ('Suspended','Cancelled')
         or (nullif(btrim(reason),'') is not null and nullif(btrim(decided_by),'') is not null))
);

create table holder_transfers (
  id          bigint generated always as identity primary key,
  holder_id   bigint not null references holders(id),
  transferred_on date not null,
  from_name   text not null,
  to_name     text not null,
  from_assoc  smallint not null references associations(id),
  to_assoc    smallint not null references associations(id),
  note        text,
  approved_by text not null check (btrim(approved_by) <> ''),
  by_user     uuid references auth.users(id) default auth.uid(),
  by_role     app_role default current_app_role(),
  check (lower(from_name) <> lower(to_name) or from_assoc <> to_assoc)
);

-- ========== ACTIVITY LOG (written by the database, not the browser) ==========
create table activity_log (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  user_id   uuid default auth.uid(),
  role      app_role    default current_app_role(),
  action    text        not null,          -- INSERT / UPDATE / ARCHIVE / RENEW ...
  table_name text       not null,
  row_id    bigint,
  detail    jsonb
);

create function log_holder_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into activity_log(action, table_name, row_id, detail)
    values ('INSERT','holders', new.id, jsonb_build_object('name', new.name));
  elsif tg_op = 'UPDATE' then
    insert into activity_log(action, table_name, row_id, detail)
    values (case when new.archived_on is distinct from old.archived_on
                 then case when new.archived_on is null then 'RESTORE' else 'ARCHIVE' end
                 else 'UPDATE' end,
            'holders', new.id,
            jsonb_build_object('name', new.name,
              'changed', (select coalesce(jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value)), '{}')
                          from jsonb_each(to_jsonb(new)) n
                          join jsonb_each(to_jsonb(old)) o using (key)
                          where n.value is distinct from o.value and n.key <> 'updated_at')));
  end if;
  return null;
end $$;
create trigger holders_log after insert or update on holders
  for each row execute function log_holder_change();

-- ========== RPC: atomic renew ==========
create function renew_franchise(p_holder bigint, p_year int) returns void
language plpgsql security invoker as $$
declare h holders; new_exp date := make_date(p_year, 12, 31);
begin
  select * into h from holders where id = p_holder for update;
  if h.id is null or h.classification = 'Driver' or h.archived_on is not null then
    raise exception 'Not renewable.'; end if;
  if h.status in ('Suspended','Cancelled') then
    raise exception 'Set the status to Active first, then renew.'; end if;
  if new_exp <= h.expires_on then
    raise exception 'The new expiry must be later than %.', h.expires_on; end if;
  insert into holder_renewals(holder_id, old_expiry, new_expiry) values (h.id, h.expires_on, new_exp);
  update holders set expires_on = new_exp, status = 'Active' where id = h.id;
  insert into activity_log(action, table_name, row_id, detail)
  values ('RENEW','holders', h.id, jsonb_build_object('name', h.name, 'from', h.expires_on, 'to', new_exp));
end $$;

-- ========== ROW LEVEL SECURITY ==========
alter table associations          enable row level security;
alter table barangays             enable row level security;
alter table mtpfms_roles          enable row level security;
alter table holders               enable row level security;
alter table holder_chassis        enable row level security;
alter table holder_renewals       enable row level security;
alter table holder_status_history enable row level security;
alter table holder_transfers      enable row level security;
alter table activity_log          enable row level security;

-- Lookups: any logged-in user reads.
create policy lookups_read_assoc on associations for select to authenticated using (true);
create policy lookups_read_brgy  on barangays    for select to authenticated using (true);

-- Roles: you see your own row; super_admin manages all.
create policy roles_self  on mtpfms_roles for select to authenticated using (user_id = auth.uid() or is_super());
create policy roles_super on mtpfms_roles for all    to authenticated using (is_super()) with check (is_super());

-- Holders: everyone logged in reads live rows; archived only super_admin.
create policy holders_read   on holders for select to authenticated
  using (current_app_role() is not null and (archived_on is null or is_super()));
create policy holders_insert on holders for insert to authenticated with check (is_admin());
create policy holders_update on holders for update to authenticated
  using (is_admin()) with check (is_admin() and (archived_on is null or is_super()));
-- no DELETE policy on purpose: records are archived, never deleted.

-- History: admin+ read/insert (viewer sees none). Never update/delete.
create policy renewals_read  on holder_renewals       for select to authenticated using (is_admin());
create policy renewals_ins   on holder_renewals       for insert to authenticated with check (is_admin());
create policy status_read    on holder_status_history for select to authenticated using (is_admin());
create policy status_ins     on holder_status_history for insert to authenticated with check (is_admin());
create policy transfers_read on holder_transfers      for select to authenticated using (is_admin());
create policy transfers_ins  on holder_transfers      for insert to authenticated with check (is_admin());

-- Activity log: super_admin reads. Rows come from triggers/RPC only.
create policy log_read on activity_log for select to authenticated using (is_super());
create policy log_ins  on activity_log for insert to authenticated with check (current_app_role() is not null);

-- Chassis: admin+ only.
create policy chassis_read on holder_chassis for select to authenticated using (is_admin());
create policy chassis_ins  on holder_chassis for insert to authenticated with check (is_admin());
create policy chassis_upd  on holder_chassis for update to authenticated using (is_admin()) with check (is_admin());
