-- Permanent delete of one holder and ALL of its data. Super Administrator only.
-- Run after 0007. The browser removes the photo file from Storage first (Supabase blocks
-- deleting storage files with SQL), then calls this function to remove everything else.
--
-- Rules (enforced here, not just in the browser):
--   * caller must be super_admin
--   * the record must already be archived (Archive first, delete second)
--   * an operator that still has drivers (live or archived) cannot be deleted; delete the drivers first
--
-- Removes: the holder row, chassis no., renewal / status / transfer history, linked pre-registrations.
-- Activity log: entries about this holder are KEPT but their personal details (name, address, phone,
-- changed values) are wiped, and one DELETE entry is added with no name in it.

create or replace function public.delete_holder(p_holder bigint)
returns void
language plpgsql security definer set search_path = public as $$
declare h holders;
begin
  if not is_super() then
    raise exception 'Only a Super Administrator can permanently delete a record.' using errcode = '42501';
  end if;

  select * into h from holders where id = p_holder for update;
  if h.id is null then
    raise exception 'That record no longer exists.';
  end if;
  if h.archived_on is null then
    raise exception 'Archive this record first, then delete it.';
  end if;
  if exists (select 1 from holders d where d.operator_id = h.id) then
    raise exception 'This operator still has drivers (including archived ones). Delete them first.';
  end if;

  delete from holder_chassis         where holder_id = h.id;
  delete from holder_renewals        where holder_id = h.id;
  delete from holder_status_history  where holder_id = h.id;
  delete from holder_transfers       where holder_id = h.id;
  delete from pre_registrations      where holder_id = h.id;

  -- keep the audit trail, drop the personal data inside it
  update activity_log set detail = jsonb_build_object('redacted', true)
   where table_name = 'holders' and row_id = h.id;

  delete from holders where id = h.id;

  insert into activity_log(action, table_name, row_id, detail)
  values ('DELETE', 'holders', h.id,
          jsonb_build_object('class', h.classification, 'type', h.category, 'mtop', h.mtop_no));
end $$;

revoke execute on function public.delete_holder(bigint) from public, anon;
grant  execute on function public.delete_holder(bigint) to authenticated;

notify pgrst, 'reload schema';
