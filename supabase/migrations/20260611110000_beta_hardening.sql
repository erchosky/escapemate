-- Beta hardening: persistent rate limits, admin report roles and internal badge counts.
-- Run after the existing beta security migrations.

create table if not exists public.rate_limit_buckets (
  key text primary key,
  count int not null default 0 check (count >= 0),
  reset_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists rate_limit_buckets_reset_at_idx on public.rate_limit_buckets (reset_at);

alter table public.rate_limit_buckets enable row level security;
revoke all on public.rate_limit_buckets from anon, authenticated;

create or replace function public.check_rate_limit(
  p_key text,
  p_limit int,
  p_window_seconds int
)
returns table (allowed boolean, remaining int, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  bucket record;
begin
  if p_key is null
    or char_length(p_key) < 3
    or p_limit < 1
    or p_window_seconds < 1
    or auth.uid() is null
    or position(auth.uid()::text in p_key) = 0
  then
    return query select false, 0, now();
    return;
  end if;

  delete from public.rate_limit_buckets
  where reset_at < now() - interval '1 day';

  insert into public.rate_limit_buckets as buckets (key, count, reset_at, updated_at)
  values (p_key, 1, now() + make_interval(secs => p_window_seconds), now())
  on conflict (key) do update
    set count = case
          when buckets.reset_at <= now() then 1
          else buckets.count + 1
        end,
        reset_at = case
          when buckets.reset_at <= now() then now() + make_interval(secs => p_window_seconds)
          else buckets.reset_at
        end,
        updated_at = now()
  returning buckets.count, buckets.reset_at into bucket;

  return query
  select
    bucket.count <= p_limit,
    greatest(0, p_limit - bucket.count),
    bucket.reset_at;
end;
$$;

grant execute on function public.check_rate_limit(text, int, int) to authenticated;

create table if not exists public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('admin')),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

alter table public.user_roles enable row level security;
revoke all on public.user_roles from anon, authenticated;

create or replace function public.is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles roles
    where roles.user_id = p_user_id
      and roles.role = 'admin'
  )
  and p_user_id = auth.uid();
$$;

grant execute on function public.is_admin(uuid) to authenticated;

alter table public.reports
  add column if not exists reviewed_at timestamptz;

alter table public.reports
  drop column if exists reviewed_by,
  drop column if exists admin_note;

drop policy if exists "Admins see reports" on public.reports;
create policy "Admins see reports"
on public.reports for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "Admins update reports" on public.reports;
create policy "Admins update reports"
on public.reports for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create table if not exists public.match_reads (
  match_id uuid not null references public.matches(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (match_id, profile_id)
);

alter table public.match_reads enable row level security;

drop policy if exists "Participants see match reads" on public.match_reads;
create policy "Participants see match reads"
on public.match_reads for select
to authenticated
using (profile_id = auth.uid() and public.can_access_match(match_id, auth.uid()));

drop policy if exists "Participants upsert own match reads" on public.match_reads;
create policy "Participants upsert own match reads"
on public.match_reads for insert
to authenticated
with check (profile_id = auth.uid() and public.can_access_match(match_id, auth.uid()));

drop policy if exists "Participants update own match reads" on public.match_reads;
create policy "Participants update own match reads"
on public.match_reads for update
to authenticated
using (profile_id = auth.uid() and public.can_access_match(match_id, auth.uid()))
with check (profile_id = auth.uid() and public.can_access_match(match_id, auth.uid()));

grant select, insert, update on public.match_reads to authenticated;

create or replace function public.get_app_badges()
returns table (
  unread_messages int,
  new_matches int,
  quest_help_responses int,
  open_reports int,
  is_admin boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_is_admin boolean;
begin
  if v_user is null then
    return query select 0, 0, 0, 0, false;
    return;
  end if;

  v_is_admin := public.is_admin(v_user);

  return query
  select
    (
      select count(*)::int
      from public.messages msg
      join public.matches m on m.id = msg.match_id
      left join public.match_reads reads
        on reads.match_id = msg.match_id
       and reads.profile_id = v_user
      where v_user in (m.profile_one, m.profile_two)
        and msg.sender_id <> v_user
        and msg.created_at > coalesce(reads.last_read_at, 'epoch'::timestamptz)
        and not public.is_blocked(m.profile_one, m.profile_two)
    ) as unread_messages,
    (
      select count(*)::int
      from public.matches m
      where v_user in (m.profile_one, m.profile_two)
        and m.created_at > now() - interval '7 days'
        and not public.is_blocked(m.profile_one, m.profile_two)
    ) as new_matches,
    (
      select count(*)::int
      from public.quest_help_responses response
      join public.quest_help_posts post on post.id = response.post_id
      where post.user_id = v_user
        and response.responder_id <> v_user
    ) as quest_help_responses,
    (
      select case
        when v_is_admin then (select count(*)::int from public.reports where status = 'open')
        else 0
      end
    ) as open_reports,
    v_is_admin as is_admin;
end;
$$;

grant execute on function public.get_app_badges() to authenticated;

drop policy if exists "Users insert own quest help responses" on public.quest_help_responses;
create policy "Users insert own quest help responses"
on public.quest_help_responses for insert
to authenticated
with check (
  responder_id = auth.uid()
  and exists (
    select 1
    from public.quest_help_posts post
    where post.id = post_id
      and post.user_id <> auth.uid()
      and post.status = 'Activa'
      and post.expires_at > now()
      and not public.is_blocked(auth.uid(), post.user_id)
  )
);

create or replace function public.create_swipe(p_target_id uuid, p_decision public.swipe_decision)
returns table (matched boolean, match_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_one uuid;
  v_two uuid;
  v_match_id uuid;
  v_allowed boolean;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  select allowed into v_allowed
  from public.check_rate_limit('db:swipe:' || v_user::text, 80, 60);

  if not coalesce(v_allowed, false) then
    raise exception 'Rate limited';
  end if;

  if v_user = p_target_id then
    raise exception 'Cannot swipe yourself';
  end if;

  if public.is_blocked(v_user, p_target_id) then
    raise exception 'Blocked profile';
  end if;

  insert into public.swipes (swiper_id, target_id, decision)
  values (v_user, p_target_id, p_decision)
  on conflict (swiper_id, target_id)
  do update set decision = excluded.decision, created_at = now();

  if p_decision = 'like' and exists (
    select 1
    from public.swipes
    where swiper_id = p_target_id
      and target_id = v_user
      and decision = 'like'
  ) then
    v_one := least(v_user, p_target_id);
    v_two := greatest(v_user, p_target_id);

    insert into public.matches (profile_one, profile_two)
    values (v_one, v_two)
    on conflict (profile_one, profile_two) do update set last_message_at = public.matches.last_message_at
    returning id into v_match_id;

    return query select true, v_match_id;
    return;
  end if;

  return query select false, null::uuid;
end;
$$;

drop policy if exists "Participants send messages" on public.messages;
create policy "Participants send messages"
on public.messages for insert
to authenticated
with check (
  sender_id = auth.uid()
  and public.can_access_match(match_id, auth.uid())
  and (select allowed from public.check_rate_limit('db:message:' || auth.uid()::text || ':' || match_id::text, 10, 60))
);

drop policy if exists "Users insert own raid posts" on public.raid_now_posts;
create policy "Users insert own raid posts"
on public.raid_now_posts for insert
to authenticated
with check (
  profile_id = auth.uid()
  and (select allowed from public.check_rate_limit('db:raid-now:create:' || auth.uid()::text, 6, 3600))
);

drop policy if exists "Users insert own quest help posts" on public.quest_help_posts;
create policy "Users insert own quest help posts"
on public.quest_help_posts for insert
to authenticated
with check (
  user_id = auth.uid()
  and (select allowed from public.check_rate_limit('db:quest-help:create:' || auth.uid()::text, 10, 3600))
);

drop policy if exists "Users create reports" on public.reports;
create policy "Users create reports"
on public.reports for insert
to authenticated
with check (
  reporter_id = auth.uid()
  and (select allowed from public.check_rate_limit('db:report:' || auth.uid()::text, 5, 3600))
);

drop policy if exists "Users manage own blocks" on public.blocks;
create policy "Users manage own blocks"
on public.blocks for all
to authenticated
using (blocker_id = auth.uid())
with check (
  blocker_id = auth.uid()
  and (select allowed from public.check_rate_limit('db:block:' || auth.uid()::text, 20, 3600))
);

drop policy if exists "Users insert own tarkov stats" on public.profile_tarkov_stats;
create policy "Users insert own tarkov stats"
on public.profile_tarkov_stats for insert
to authenticated
with check (
  user_id = auth.uid()
  and (select allowed from public.check_rate_limit('db:tarkov-sync:' || auth.uid()::text, 8, 3600))
);

drop policy if exists "Users update own tarkov stats" on public.profile_tarkov_stats;
create policy "Users update own tarkov stats"
on public.profile_tarkov_stats for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and (select allowed from public.check_rate_limit('db:tarkov-sync:' || auth.uid()::text, 8, 3600))
);
