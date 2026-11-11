-- Photos bucket (private) + table grants. Run after 0001.

-- Supabase usually grants these already; this makes it explicit. RLS still decides what each role can do.
grant usage on schema public to authenticated;
grant select, insert, update on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- Private bucket for holder photos. Files are named <holder id>.jpg
insert into storage.buckets (id, name, public)
values ('holder-photos', 'holder-photos', false)
on conflict (id) do nothing;

-- Anyone with a role can view photos. Only admin+ can add, replace, or remove them.
create policy photos_read on storage.objects for select to authenticated
  using (bucket_id = 'holder-photos' and public.current_app_role() is not null);
create policy photos_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'holder-photos' and public.is_admin());
create policy photos_upd on storage.objects for update to authenticated
  using (bucket_id = 'holder-photos' and public.is_admin())
  with check (bucket_id = 'holder-photos' and public.is_admin());
create policy photos_del on storage.objects for delete to authenticated
  using (bucket_id = 'holder-photos' and public.is_admin());

-- Needed so admins can delete a chassis row when the field is cleared.
grant delete on holder_chassis to authenticated;
create policy chassis_del on holder_chassis for delete to authenticated using (is_admin());
