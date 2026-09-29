-- Beta hardening migration for existing EscapeMate Supabase projects.

alter type public.eft_map add value if not exists 'Icebreaker';

update public.raid_now_posts
set closed_at = now()
where closed_at is null
  and expires_at <= now();

with ranked_open_posts as (
  select
    id,
    row_number() over (partition by profile_id order by created_at desc) as rn
  from public.raid_now_posts
  where closed_at is null
)
update public.raid_now_posts p
set closed_at = now()
from ranked_open_posts r
where p.id = r.id
  and r.rn > 1;

create table if not exists public.profile_contacts (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  discord_username text,
  discord_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.profile_contacts (profile_id, discord_username, discord_id)
select id, discord_username, discord_id
from public.profiles
where discord_username is not null
   or discord_id is not null
on conflict (profile_id) do update
set
  discord_username = coalesce(excluded.discord_username, public.profile_contacts.discord_username),
  discord_id = coalesce(excluded.discord_id, public.profile_contacts.discord_id),
  updated_at = now();

update public.profiles
set discord_username = null,
    discord_id = null
where discord_username is not null
   or discord_id is not null;

alter table public.profile_contacts enable row level security;

drop trigger if exists profile_contacts_touch_updated_at on public.profile_contacts;
create trigger profile_contacts_touch_updated_at
before update on public.profile_contacts
for each row execute function public.touch_updated_at();

create unique index if not exists raid_now_one_active_per_user_idx
on public.raid_now_posts (profile_id)
where closed_at is null;

create or replace function public.can_access_match(p_match_id uuid, p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.matches m
    where m.id = p_match_id
      and p_profile_id in (m.profile_one, m.profile_two)
      and not public.is_blocked(m.profile_one, m.profile_two)
  );
$$;

create or replace function public.touch_match_activity(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_access_match(p_match_id, auth.uid()) then
    raise exception 'Not allowed';
  end if;

  update public.matches
  set last_message_at = now()
  where id = p_match_id;
end;
$$;

drop policy if exists "Participants update match activity" on public.matches;

drop policy if exists "Matched users see profile contacts" on public.profile_contacts;
create policy "Matched users see profile contacts"
on public.profile_contacts for select
to authenticated
using (
  profile_id = auth.uid()
  or exists (
    select 1
    from public.matches m
    where auth.uid() in (m.profile_one, m.profile_two)
      and profile_id in (m.profile_one, m.profile_two)
      and not public.is_blocked(m.profile_one, m.profile_two)
  )
);

drop policy if exists "Users insert own profile contact" on public.profile_contacts;
create policy "Users insert own profile contact"
on public.profile_contacts for insert
to authenticated
with check (profile_id = auth.uid());

drop policy if exists "Users update own profile contact" on public.profile_contacts;
create policy "Users update own profile contact"
on public.profile_contacts for update
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create or replace function public.get_swipe_candidates(p_limit int default 20)
returns table (
  id uuid,
  nickname text,
  discord_username text,
  discord_id text,
  avatar_url text,
  region public.region,
  language public.language_code,
  approximate_level int,
  favorite_maps public.eft_map[],
  play_styles public.play_style[],
  objectives public.raid_objective[],
  schedule public.schedule_slot[],
  bio text,
  onboarding_complete boolean,
  compatibility_score int
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select *
    from public.profiles
    where id = auth.uid()
  )
  select
    p.id,
    p.nickname,
    null::text as discord_username,
    null::text as discord_id,
    p.avatar_url,
    p.region,
    p.language,
    p.approximate_level,
    p.favorite_maps,
    p.play_styles,
    p.objectives,
    p.schedule,
    p.bio,
    p.onboarding_complete,
    least(100,
      15 * case when p.region = me.region then 1 else 0 end +
      20 * case when p.language = me.language then 1 else 0 end +
      15 * case when p.favorite_maps && me.favorite_maps then 1 else 0 end +
      15 * case when p.play_styles && me.play_styles then 1 else 0 end +
      15 * case when p.objectives && me.objectives then 1 else 0 end +
      10 * case when p.schedule && me.schedule then 1 else 0 end +
      10 * case when abs(coalesce(p.approximate_level, 1) - coalesce(me.approximate_level, 1)) <= 15 then 1 else 0 end
    )::int as compatibility_score
  from public.profiles p
  cross join me
  where p.id <> auth.uid()
    and p.onboarding_complete = true
    and not exists (
      select 1 from public.swipes s where s.swiper_id = auth.uid() and s.target_id = p.id
    )
    and not public.is_blocked(auth.uid(), p.id)
  order by compatibility_score desc, p.last_active_at desc nulls last
  limit greatest(1, least(p_limit, 50));
$$;

drop policy if exists "Participants see messages" on public.messages;
create policy "Participants see messages"
on public.messages for select
to authenticated
using (public.can_access_match(match_id, auth.uid()));

drop policy if exists "Participants send messages" on public.messages;
create policy "Participants send messages"
on public.messages for insert
to authenticated
with check (
  sender_id = auth.uid()
  and public.can_access_match(match_id, auth.uid())
);
