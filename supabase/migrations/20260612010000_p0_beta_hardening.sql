begin;

drop policy if exists "Users update own raid posts" on public.raid_now_posts;
drop policy if exists "Users update own quest help posts" on public.quest_help_posts;

create or replace function public.close_raid_now_post(post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'auth required' using errcode = '28000';
  end if;

  update public.raid_now_posts
  set closed_at = coalesce(closed_at, now())
  where id = post_id
    and profile_id = v_user
    and closed_at is null;

  if not found then
    raise exception 'post not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.close_quest_help_post(post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'auth required' using errcode = '28000';
  end if;

  update public.quest_help_posts
  set status = 'Cerrada',
      updated_at = now()
  where id = post_id
    and user_id = v_user
    and status = 'Activa';

  if not found then
    raise exception 'post not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.close_raid_now_post(uuid) from public;
revoke all on function public.close_quest_help_post(uuid) from public;
grant execute on function public.close_raid_now_post(uuid) to authenticated;
grant execute on function public.close_quest_help_post(uuid) to authenticated;

update storage.buckets
set public = true,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'avatars';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users upload own avatars" on storage.objects;
drop policy if exists "Users update own avatars" on storage.objects;
drop policy if exists "Users delete own avatar" on storage.objects;

create policy "Users upload own avatars"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
  and array_length(storage.foldername(name), 1) = 1
  and storage.filename(name) ~ '^avatar\.(jpg|jpeg|png|webp)$'
);

create policy "Users update own avatars"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
  and array_length(storage.foldername(name), 1) = 1
  and storage.filename(name) ~ '^avatar\.(jpg|jpeg|png|webp)$'
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
  and array_length(storage.foldername(name), 1) = 1
  and storage.filename(name) ~ '^avatar\.(jpg|jpeg|png|webp)$'
);

create policy "Users delete own avatar"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
  and array_length(storage.foldername(name), 1) = 1
  and storage.filename(name) ~ '^avatar\.(jpg|jpeg|png|webp)$'
);

commit;
