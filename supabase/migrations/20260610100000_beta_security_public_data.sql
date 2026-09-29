-- Beta security hardening: keep Discord private, expose only safe profile/stats columns.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'discord_username'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'discord_id'
  ) then
    execute $copy_contacts$
      insert into public.profile_contacts (profile_id, discord_username, discord_id)
      select id, discord_username, discord_id
      from public.profiles
      where discord_username is not null
         or discord_id is not null
      on conflict (profile_id) do update
      set
        discord_username = coalesce(public.profile_contacts.discord_username, excluded.discord_username),
        discord_id = coalesce(public.profile_contacts.discord_id, excluded.discord_id),
        updated_at = now()
    $copy_contacts$;

    execute $clear_profiles$
      update public.profiles
      set discord_username = null,
          discord_id = null
      where discord_username is not null
         or discord_id is not null
    $clear_profiles$;
  end if;
end $$;

alter table public.profiles
drop column if exists discord_username,
drop column if exists discord_id;

create or replace view public.public_profiles_view
with (security_invoker = true)
as
select
  id,
  nickname,
  avatar_url,
  region,
  language,
  spoken_languages,
  approximate_level,
  favorite_maps,
  play_styles,
  objectives,
  schedule,
  bio,
  onboarding_complete,
  last_active_at
from public.profiles
where onboarding_complete = true;

create or replace view public.public_raid_now_posts_view
with (security_invoker = true)
as
select
  r.id,
  r.profile_id,
  r.map,
  r.objective,
  r.players_needed,
  r.language,
  r.region,
  r.style,
  r.notes,
  r.expires_at,
  r.created_at,
  p.nickname as profile_nickname,
  p.avatar_url as profile_avatar_url
from public.raid_now_posts r
join public.profiles p on p.id = r.profile_id
where r.closed_at is null
  and r.expires_at > now();

create or replace view public.public_quest_help_posts_view
with (security_invoker = true)
as
select
  q.id,
  q.user_id,
  q.quest_id,
  q.quest_name,
  q.map,
  q.region,
  q.language,
  q.playstyle,
  q.request_type,
  q.description,
  q.status,
  q.expires_at,
  q.created_at,
  q.updated_at,
  p.nickname as profile_nickname,
  p.avatar_url as profile_avatar_url
from public.quest_help_posts q
join public.profiles p on p.id = q.user_id
where q.status = 'Activa'
  and q.expires_at > now();

create or replace function public.get_public_tarkov_stats(p_user_ids uuid[])
returns table (
  user_id uuid,
  level int,
  survival_rate numeric(5, 2),
  kd numeric(8, 2),
  raids int,
  hours int,
  pmc_kills int,
  last_synced_at timestamptz,
  is_public boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.user_id,
    s.level,
    s.survival_rate,
    s.kd,
    s.raids,
    s.hours,
    s.pmc_kills,
    s.last_synced_at,
    s.is_public
  from public.profile_tarkov_stats s
  where s.is_public = true
    and s.user_id = any(p_user_ids)
    and not public.is_blocked(auth.uid(), s.user_id);
$$;

drop policy if exists "Public tarkov stats visible" on public.profile_tarkov_stats;
drop policy if exists "Users see own tarkov stats" on public.profile_tarkov_stats;
create policy "Users see own tarkov stats"
on public.profile_tarkov_stats for select
to authenticated
using (user_id = auth.uid());

revoke select, insert, update on public.profiles from authenticated;
grant select (
  id,
  nickname,
  avatar_url,
  region,
  language,
  spoken_languages,
  approximate_level,
  favorite_maps,
  play_styles,
  objectives,
  schedule,
  bio,
  onboarding_complete,
  last_active_at
) on public.profiles to authenticated;
grant insert (
  id,
  nickname,
  avatar_url,
  region,
  language,
  spoken_languages,
  approximate_level,
  favorite_maps,
  play_styles,
  objectives,
  schedule,
  bio,
  onboarding_complete,
  last_active_at
) on public.profiles to authenticated;
grant update (
  id,
  nickname,
  avatar_url,
  region,
  language,
  spoken_languages,
  approximate_level,
  favorite_maps,
  play_styles,
  objectives,
  schedule,
  bio,
  onboarding_complete,
  last_active_at
) on public.profiles to authenticated;
grant select on public.public_profiles_view to authenticated;
grant select on public.public_raid_now_posts_view to authenticated;
grant select on public.public_quest_help_posts_view to authenticated;
revoke all on function public.get_public_tarkov_stats(uuid[]) from public;
grant execute on function public.get_public_tarkov_stats(uuid[]) to authenticated;
