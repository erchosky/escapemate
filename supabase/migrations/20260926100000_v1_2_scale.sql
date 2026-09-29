begin;

-- EscapeMate 1.2 — scalability
-- * get_swipe_candidates scores an indexed pool of ≤ 450 recently active players instead of
--   every profile (≈375 ms → a few ms at 50k profiles) and returns public stats in the same call.
-- * matches keep a summary of their last message (trigger), so badges and the match list no
--   longer scan messages; sending a message also marks the chat as read for the sender.
-- * Chat realtime moves from Postgres Changes to Broadcast from the database (private
--   channels authorised by RLS), which is what Supabase recommends at scale.
-- * RLS policies call (select auth.uid()) once per statement instead of once per row.
-- * rate_limit_buckets is UNLOGGED and swept probabilistically; cleanup_expired_content()
--   runs every 10 minutes when pg_cron is available.
-- * Raid Now posts count accepted players and stop taking requests once full.

alter table public.profiles alter column last_active_at set default now();
update public.profiles set last_active_at = coalesce(updated_at, created_at) where last_active_at is null;

alter table public.matches
  add column last_message_preview text,
  add column last_message_sender_id uuid references public.profiles(id) on delete set null;

update public.matches m
set last_message_at = latest.created_at,
    last_message_preview = left(latest.body, 140),
    last_message_sender_id = latest.sender_id
from (
  select distinct on (match_id) match_id, created_at, body, sender_id
  from public.messages
  order by match_id, created_at desc, id desc
) latest
where latest.match_id = m.id;

alter table public.raid_now_posts
  add column accepted_count int not null default 0 check (accepted_count >= 0);

update public.raid_now_posts post
set accepted_count = (
  select count(*) from public.raid_now_responses response
  where response.post_id = post.id and response.status = 'accepted'
);

alter table public.rate_limit_buckets set unlogged;

drop index if exists public.profiles_matching_idx;
drop index if exists public.profiles_spoken_languages_idx;
drop index if exists public.raid_now_active_idx;
drop index if exists public.quest_help_active_idx;
-- Covering index: the swipe pool is read index-only, in activity order.
create index profiles_active_pool_idx on public.profiles (last_active_at desc)
  include (region, language, spoken_languages, game_modes)
  where onboarding_complete;
create index blocks_blocked_idx on public.blocks (blocked_id, blocker_id);
create index raid_now_open_idx on public.raid_now_posts (created_at desc) where closed_at is null;
create index quest_help_open_idx on public.quest_help_posts (created_at desc) where status = 'Activa';
create index reports_status_created_idx on public.reports (status, created_at desc);
create index raid_now_responses_responder_idx on public.raid_now_responses (responder_id);
create index quest_help_responses_responder_idx on public.quest_help_responses (responder_id);

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
  v_uid text := auth.uid()::text;
  v_limit int;
  v_window_seconds int;
  v_prefix text;
  v_subject text;
  v_uuid_pattern text := '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
begin
  if p_key is null
    or char_length(p_key) < 3
    or char_length(p_key) > 140
    or p_limit < 1
    or p_window_seconds < 1
    or auth.uid() is null
  then
    return query select false, 0, now();
    return;
  end if;

  if p_key = 'swipe:' || v_uid or p_key = 'db:swipe:' || v_uid then
    v_limit := 80;
    v_window_seconds := 60;
  elsif p_key = 'raid-now:create:' || v_uid or p_key = 'db:raid-now:create:' || v_uid then
    v_limit := 6;
    v_window_seconds := 3600;
  elsif p_key = 'quest-help:create:' || v_uid or p_key = 'db:quest-help:create:' || v_uid then
    v_limit := 10;
    v_window_seconds := 3600;
  elsif p_key = 'report:' || v_uid or p_key = 'db:report:' || v_uid then
    v_limit := 5;
    v_window_seconds := 3600;
  elsif p_key = 'block:' || v_uid or p_key = 'db:block:' || v_uid then
    v_limit := 20;
    v_window_seconds := 3600;
  elsif p_key = 'tarkov-sync:' || v_uid or p_key = 'db:tarkov-sync:' || v_uid then
    v_limit := 8;
    v_window_seconds := 3600;
  elsif p_key = 'profile:onboarding:' || v_uid then
    v_limit := 10;
    v_window_seconds := 3600;
  elsif p_key = 'profile:languages:' || v_uid then
    v_limit := 20;
    v_window_seconds := 3600;
  elsif p_key = 'raid-now:close:' || v_uid then
    v_limit := 30;
    v_window_seconds := 3600;
  elsif p_key = 'quest-help:close:' || v_uid then
    v_limit := 30;
    v_window_seconds := 3600;
  elsif p_key = 'admin:report-status:' || v_uid then
    v_limit := 40;
    v_window_seconds := 3600;
  elsif p_key = 'post-response:' || v_uid or p_key = 'db:post-response:' || v_uid then
    v_limit := 20;
    v_window_seconds := 3600;
  elsif p_key = 'post-response:decide:' || v_uid or p_key = 'db:post-response:decide:' || v_uid then
    v_limit := 60;
    v_window_seconds := 3600;
  elsif p_key = 'profile:avatar:' || v_uid then
    v_limit := 10;
    v_window_seconds := 3600;
  elsif p_key = 'account:delete:' || v_uid then
    v_limit := 3;
    v_window_seconds := 3600;
  else
    v_prefix := 'message:' || v_uid || ':';
    if left(p_key, char_length(v_prefix)) = v_prefix then
      v_subject := substring(p_key from char_length(v_prefix) + 1);
      if v_subject ~* v_uuid_pattern then
        v_limit := 10;
        v_window_seconds := 60;
      end if;
    end if;

    v_prefix := 'message-history:' || v_uid || ':';
    if v_limit is null and left(p_key, char_length(v_prefix)) = v_prefix then
      v_subject := substring(p_key from char_length(v_prefix) + 1);
      if v_subject ~* v_uuid_pattern then
        v_limit := 30;
        v_window_seconds := 60;
      end if;
    end if;

    v_prefix := 'db:message:' || v_uid || ':';
    if v_limit is null and left(p_key, char_length(v_prefix)) = v_prefix then
      v_subject := substring(p_key from char_length(v_prefix) + 1);
      if v_subject ~* v_uuid_pattern then
        v_limit := 10;
        v_window_seconds := 60;
      end if;
    end if;
  end if;

  if v_limit is null
    or p_limit <> v_limit
    or p_window_seconds <> v_window_seconds
  then
    return query select false, 0, now();
    return;
  end if;

  -- Sweeping on ~1% of calls keeps the table small without a DELETE on every request;
  -- cleanup_expired_content() also sweeps it when pg_cron is available.
  if random() < 0.01 then
    delete from public.rate_limit_buckets as stale
    where stale.reset_at < now() - interval '1 day';
  end if;

  insert into public.rate_limit_buckets as buckets (key, count, reset_at, updated_at)
  values (p_key, 1, now() + make_interval(secs => v_window_seconds), now())
  on conflict (key) do update
    set count = case
          when buckets.reset_at <= now() then 1
          else buckets.count + 1
        end,
        reset_at = case
          when buckets.reset_at <= now() then now() + make_interval(secs => v_window_seconds)
          else buckets.reset_at
        end,
        updated_at = now()
  returning buckets.count, buckets.reset_at into bucket;

  return query
  select
    bucket.count <= v_limit,
    greatest(0, v_limit - bucket.count),
    bucket.reset_at;
end;
$$;

create or replace function public.decide_post_response(p_kind text, p_response_id uuid, p_accept boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_owner uuid;
  v_responder uuid;
  v_status public.post_response_status;
  v_message text;
  v_existing_match uuid;
  v_match_id uuid;
  v_allowed boolean;
begin
  if v_user is null then
    raise exception 'auth required' using errcode = '28000';
  end if;

  select allowed into v_allowed
  from public.check_rate_limit('db:post-response:decide:' || v_user::text, 60, 3600);

  if not coalesce(v_allowed, false) then
    raise exception 'Rate limited';
  end if;

  if p_kind = 'raid_now' then
    select post.profile_id, response.responder_id, response.status, response.message, response.match_id
    into v_owner, v_responder, v_status, v_message, v_existing_match
    from public.raid_now_responses response
    join public.raid_now_posts post on post.id = response.post_id
    where response.id = p_response_id
    for update of response;
  elsif p_kind = 'quest_help' then
    select post.user_id, response.responder_id, response.status, response.message, response.match_id
    into v_owner, v_responder, v_status, v_message, v_existing_match
    from public.quest_help_responses response
    join public.quest_help_posts post on post.id = response.post_id
    where response.id = p_response_id
    for update of response;
  else
    raise exception 'invalid kind' using errcode = '22023';
  end if;

  if v_owner is null or v_owner <> v_user then
    raise exception 'response not found' using errcode = 'P0002';
  end if;

  if v_status <> 'pending' then
    return v_existing_match;
  end if;

  if public.is_blocked(v_owner, v_responder) then
    raise exception 'Blocked profile';
  end if;

  if p_accept then
    insert into public.matches (profile_one, profile_two)
    values (least(v_owner, v_responder), greatest(v_owner, v_responder))
    on conflict (profile_one, profile_two) do update set last_message_at = public.matches.last_message_at
    returning id into v_match_id;

    if nullif(trim(coalesce(v_message, '')), '') is not null then
      insert into public.messages (match_id, sender_id, body)
      values (v_match_id, v_responder, left(trim(v_message), 1000));

      update public.matches set last_message_at = now() where id = v_match_id;
    end if;
  end if;

  if p_kind = 'raid_now' then
    if p_accept then
      update public.raid_now_posts
      set accepted_count = accepted_count + 1
      where id = (select post_id from public.raid_now_responses where id = p_response_id);
    end if;

    update public.raid_now_responses
    set status = case when p_accept then 'accepted'::public.post_response_status else 'declined'::public.post_response_status end,
        match_id = v_match_id,
        decided_at = now()
    where id = p_response_id;
  else
    update public.quest_help_responses
    set status = case when p_accept then 'accepted'::public.post_response_status else 'declined'::public.post_response_status end,
        match_id = v_match_id,
        decided_at = now()
    where id = p_response_id;
  end if;

  return v_match_id;
end;
$$;

-- Keeps the match summary current and marks the chat as read for whoever just wrote.
create or replace function public.on_message_inserted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.matches
  set last_message_at = new.created_at,
      last_message_preview = left(new.body, 140),
      last_message_sender_id = new.sender_id
  where id = new.match_id;

  insert into public.match_reads (match_id, profile_id, last_read_at)
  values (new.match_id, new.sender_id, new.created_at)
  on conflict (match_id, profile_id)
  do update set last_read_at = greatest(public.match_reads.last_read_at, excluded.last_read_at);

  return null;
end;
$$;

create trigger messages_after_insert
after insert on public.messages
for each row execute function public.on_message_inserted();

-- Broadcast each new message on the private channel "match:<id>". Realtime authorises
-- subscribers through the realtime.messages policy below, once per join instead of per event.
create or replace function public.broadcast_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform realtime.broadcast_changes(
    'match:' || new.match_id::text,
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    null
  );
  return null;
end;
$$;

do $$
begin
  if to_regproc('realtime.broadcast_changes') is not null then
    execute 'create trigger messages_broadcast after insert on public.messages for each row execute function public.broadcast_message()';
  end if;

  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists "Match participants receive chat broadcasts" on realtime.messages';
    execute $policy$
      create policy "Match participants receive chat broadcasts"
      on realtime.messages for select
      to authenticated
      using (
        realtime.messages.extension = 'broadcast'
        and case
          when (select realtime.topic()) ~ '^match:[0-9a-f-]{36}$'
            then public.can_access_match(substring((select realtime.topic()) from 7)::uuid, (select auth.uid()))
          else false
        end
      )
    $policy$;
  end if;

  -- Chat no longer uses Postgres Changes; decoding every message for it is wasted work.
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    execute 'alter publication supabase_realtime drop table public.messages';
  end if;
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'matches') then
    execute 'alter publication supabase_realtime drop table public.matches';
  end if;
end;
$$;

-- Housekeeping. Scheduled every 10 minutes when pg_cron exists; safe to run by hand otherwise.
create or replace function public.cleanup_expired_content()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.raid_now_posts
  set closed_at = expires_at
  where closed_at is null
    and expires_at <= now();

  update public.quest_help_posts
  set status = 'Expirada'
  where status = 'Activa'
    and expires_at <= now();

  delete from public.rate_limit_buckets as stale
  where stale.reset_at < now() - interval '1 day';
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('escapemate-cleanup', '*/10 * * * *', 'select public.cleanup_expired_content()');
  end if;
end;
$$;

-- A full Raid Now post stops accepting requests.
drop policy if exists "Users respond to active raid posts" on public.raid_now_responses;

create policy "Users respond to active raid posts"
on public.raid_now_responses for insert
to authenticated
with check (
  responder_id = (select auth.uid())
  and status = 'pending'
  and match_id is null
  and exists (
    select 1
    from public.raid_now_posts post
    where post.id = post_id
      and post.profile_id <> (select auth.uid())
      and post.closed_at is null
      and post.expires_at > now()
      and post.accepted_count < post.players_needed
      and not public.is_blocked((select auth.uid()), post.profile_id)
  )
  and (select allowed from public.check_rate_limit('db:post-response:' || (select auth.uid())::text, 20, 3600))
);

drop function if exists public.get_swipe_candidates(int);

create or replace function public.get_swipe_candidates(p_limit int default 20)
returns table (
  id uuid,
  nickname text,
  discord_username text,
  discord_id text,
  avatar_url text,
  region public.region,
  language public.language_code,
  spoken_languages public.language_code[],
  approximate_level int,
  favorite_maps public.eft_map[],
  play_styles public.play_style[],
  objectives public.raid_objective[],
  schedule public.schedule_slot[],
  bio text,
  onboarding_complete boolean,
  compatibility_score int,
  compatibility_reasons text[],
  compatibility_warnings text[],
  shared_languages public.language_code[],
  shared_maps public.eft_map[],
  shared_objectives public.raid_objective[],
  shared_styles public.play_style[],
  game_modes public.game_mode[],
  last_active_at timestamptz,
  tarkov_level int,
  tarkov_survival_rate numeric,
  tarkov_kd numeric,
  tarkov_raids int,
  tarkov_hours int,
  tarkov_pmc_kills int,
  has_public_stats boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with me_base as (
    select
      p.id,
      p.region,
      p.language,
      coalesce(nullif(p.spoken_languages, '{}'::public.language_code[]), array[p.language]::public.language_code[]) as spoken_languages,
      p.approximate_level,
      p.favorite_maps,
      p.play_styles,
      p.objectives,
      p.schedule,
      coalesce(nullif(p.game_modes, '{}'::public.game_mode[]), array['PvP']::public.game_mode[]) as game_modes
    from public.profiles p
    where p.id = auth.uid()
  ),
  me as (
    select
      me_base.*,
      coalesce(nullif(pref.preferred_regions, '{}'::public.region[]), array[me_base.region]::public.region[]) as preferred_regions,
      coalesce(nullif(pref.preferred_languages, '{}'::public.language_code[]), me_base.spoken_languages) as preferred_languages,
      coalesce(nullif(pref.preferred_maps, '{}'::public.eft_map[]), me_base.favorite_maps) as effective_maps,
      coalesce(nullif(pref.preferred_styles, '{}'::public.play_style[]), me_base.play_styles) as effective_styles,
      coalesce(nullif(pref.preferred_objectives, '{}'::public.raid_objective[]), me_base.objectives) as effective_objectives,
      pref.level_min,
      pref.level_max,
      stats.level as real_level,
      stats.hours,
      stats.raids,
      stats.survival_rate,
      stats.kd,
      stats.pmc_kills
    from me_base
    left join public.player_preferences pref on pref.profile_id = me_base.id
    left join public.profile_tarkov_stats stats on stats.user_id = me_base.id
  ),
  -- Scoring every profile made this RPC O(total players). Instead read the 4,000 most
  -- recently active players straight from the covering index (index-only, stops at the
  -- limit), keep the unswiped ones in a reachable region who share a language, plus a
  -- recency-only slice so the queue never runs dry. Only that pool (≤ 300 rows) is scored.
  recent as materialized (
    select p.id, p.region, p.language, p.spoken_languages, p.game_modes, p.last_active_at
    from public.profiles p
    where p.onboarding_complete = true
      and p.last_active_at > now() - interval '60 days'
    order by p.last_active_at desc
    limit 4000
  ),
  pool as (
    select candidate.id, me.id as me_id
    from me
    cross join lateral (
      (
        select r.id
        from recent r
        where r.id <> me.id
          and coalesce(nullif(r.game_modes, '{}'::public.game_mode[]), array['PvP']::public.game_mode[]) && me.game_modes
          and r.region = any(me.preferred_regions || case me.region
            when 'LATAM'::public.region then array['EU', 'NA']::public.region[]
            when 'EU'::public.region then array['LATAM']::public.region[]
            when 'NA'::public.region then array['LATAM']::public.region[]
            else '{}'::public.region[]
          end)
          and coalesce(nullif(r.spoken_languages, '{}'::public.language_code[]), array[r.language]::public.language_code[]) && me.spoken_languages
          and not exists (select 1 from public.swipes s where s.swiper_id = me.id and s.target_id = r.id)
        order by r.last_active_at desc
        limit 200
      )
      union
      (
        select r.id
        from recent r
        where r.id <> me.id
          and coalesce(nullif(r.game_modes, '{}'::public.game_mode[]), array['PvP']::public.game_mode[]) && me.game_modes
          and not exists (select 1 from public.swipes s where s.swiper_id = me.id and s.target_id = r.id)
        order by r.last_active_at desc
        limit 100
      )
    ) candidate
  ),
  candidate_base as (
    select
      p.id,
      p.nickname,
      null::text as discord_username,
      null::text as discord_id,
      p.avatar_url,
      p.region,
      p.language,
      coalesce(nullif(p.spoken_languages, '{}'::public.language_code[]), array[p.language]::public.language_code[]) as spoken_languages,
      p.approximate_level,
      p.favorite_maps,
      p.play_styles,
      p.objectives,
      p.schedule,
      p.bio,
      p.onboarding_complete,
      p.last_active_at,
      coalesce(nullif(p.game_modes, '{}'::public.game_mode[]), array['PvP']::public.game_mode[]) as game_modes,
      coalesce(nullif(pref.preferred_maps, '{}'::public.eft_map[]), p.favorite_maps) as effective_maps,
      coalesce(nullif(pref.preferred_styles, '{}'::public.play_style[]), p.play_styles) as effective_styles,
      coalesce(nullif(pref.preferred_objectives, '{}'::public.raid_objective[]), p.objectives) as effective_objectives,
      stats.level as real_level,
      stats.hours,
      stats.raids,
      stats.survival_rate,
      stats.kd,
      stats.pmc_kills,
      stats.user_id is not null as has_public_stats
    from pool
    join public.profiles p on p.id = pool.id
    left join public.player_preferences pref on pref.profile_id = p.id
    left join public.profile_tarkov_stats stats on stats.user_id = p.id and stats.is_public = true
    where not public.is_blocked(pool.me_id, p.id)
      and not exists (
        select 1 from public.matches m
        where m.profile_one = least(pool.me_id, p.id)
          and m.profile_two = greatest(pool.me_id, p.id)
      )
  ),
  base as (
    select
      c.*,
      me.language as my_language,
      me.spoken_languages as my_spoken_languages,
      me.preferred_languages as my_preferred_languages,
      me.region as my_region,
      me.preferred_regions as my_preferred_regions,
      me.effective_maps as my_maps,
      me.effective_styles as my_styles,
      me.effective_objectives as my_objectives,
      me.schedule as my_schedule,
      coalesce(me.real_level, me.approximate_level) as my_level,
      coalesce(c.real_level, c.approximate_level) as candidate_level,
      me.hours as my_hours,
      me.raids as my_raids,
      array(
        select distinct lang
        from unnest(c.spoken_languages) lang
        where lang = any(me.spoken_languages)
        order by lang
      ) as shared_languages,
      array(
        select distinct map
        from unnest(c.effective_maps) map
        where map = any(me.effective_maps)
        order by map
      ) as shared_maps,
      array(
        select distinct objective
        from unnest(c.effective_objectives) objective
        where objective = any(me.effective_objectives)
        order by objective
      ) as shared_objectives,
      array(
        select distinct style
        from unnest(c.effective_styles) style
        where style = any(me.effective_styles)
        order by style
      ) as shared_styles,
      array(
        select distinct slot
        from unnest(c.schedule) slot
        where slot = any(me.schedule)
        order by slot
      ) as shared_schedule,
      array(
        select distinct mode
        from unnest(c.game_modes) mode
        where mode = any(me.game_modes)
        order by mode
      ) as shared_game_modes
    from candidate_base c
    cross join me
    where c.game_modes && me.game_modes
  ),
  scoring as (
    select
      base.*,
      cardinality(base.shared_languages) > 0 as has_shared_language,
      cardinality(base.shared_schedule) > 0 as has_shared_schedule,
      base.spoken_languages @> array[base.my_language]::public.language_code[] as candidate_speaks_my_language,
      base.spoken_languages @> array['EN'::public.language_code] and base.my_spoken_languages @> array['EN'::public.language_code] as both_speak_en,
      base.region = base.my_region as same_region,
      (
        (base.region = 'EU'::public.region and base.my_region = 'LATAM'::public.region) or
        (base.region = 'LATAM'::public.region and base.my_region = 'EU'::public.region) or
        (base.region = 'NA'::public.region and base.my_region = 'LATAM'::public.region) or
        (base.region = 'LATAM'::public.region and base.my_region = 'NA'::public.region)
      ) as compatible_region,
      cardinality(base.shared_maps) > 0 as has_shared_maps,
      base.shared_maps && array['Customs'::public.eft_map, 'Woods'::public.eft_map, 'Ground Zero'::public.eft_map] as has_shared_easy_map,
      cardinality(base.shared_objectives) > 0 as has_shared_objectives,
      base.effective_objectives[1] is not null and base.effective_objectives[1] = base.my_objectives[1] as same_primary_objective,
      cardinality(base.shared_styles) > 0 as has_shared_styles,
      (
        (base.effective_styles @> array['Sherpa'::public.play_style] and base.my_styles @> array['New player'::public.play_style]) or
        (base.my_styles @> array['Sherpa'::public.play_style] and base.effective_styles @> array['New player'::public.play_style])
      ) as sherpa_new_player,
      (
        (base.effective_styles @> array['Tryhard'::public.play_style] and base.my_styles @> array['Chill'::public.play_style]) or
        (base.my_styles @> array['Tryhard'::public.play_style] and base.effective_styles @> array['Chill'::public.play_style])
      ) as tryhard_chill,
      (
        (base.effective_styles @> array['PvP'::public.play_style] and base.my_styles @> array['New player'::public.play_style]) or
        (base.my_styles @> array['PvP'::public.play_style] and base.effective_styles @> array['New player'::public.play_style])
      ) and not (
        base.effective_styles @> array['Sherpa'::public.play_style] or base.my_styles @> array['Sherpa'::public.play_style]
      ) as pvp_new_without_sherpa,
      (
        (
          base.effective_objectives @> array['PvP'::public.raid_objective] and
          (base.my_objectives @> array['Aprender'::public.raid_objective] or base.my_styles @> array['New player'::public.play_style])
        ) or
        (
          base.my_objectives @> array['PvP'::public.raid_objective] and
          (base.effective_objectives @> array['Aprender'::public.raid_objective] or base.effective_styles @> array['New player'::public.play_style])
        )
      ) and not (
        base.effective_styles @> array['Sherpa'::public.play_style] or base.my_styles @> array['Sherpa'::public.play_style]
      ) as objective_pvp_learning_penalty,
      (
        (base.my_hours is not null and base.hours is not null and abs(base.my_hours - base.hours) > 1000) or
        (base.my_raids is not null and base.raids is not null and abs(base.my_raids - base.raids) > 800)
      ) as huge_experience_gap
    from base
  ),
  points as (
    select
      scoring.*,
      case
        when scoring.candidate_speaks_my_language then 25
        when scoring.has_shared_language then 18
        when scoring.both_speak_en then 8
        else -25
      end as language_points,
      case
        when scoring.same_region or scoring.region = any(scoring.my_preferred_regions) then 15
        when scoring.compatible_region then 8
        else 0
      end as region_points,
      case
        when scoring.has_shared_schedule then 15
        when scoring.schedule @> array['Fines de semana'::public.schedule_slot] and scoring.my_schedule @> array['Fines de semana'::public.schedule_slot] then 8
        else -15
      end as schedule_points,
      (
        case
          when scoring.same_primary_objective then 15
          when scoring.has_shared_objectives then 10
          else 0
        end -
        case when scoring.objective_pvp_learning_penalty then 8 else 0 end
      ) as objective_points,
      case
        when scoring.has_shared_maps then 10
        when scoring.has_shared_easy_map then 5
        else 0
      end as map_points,
      (
        case
          when scoring.sherpa_new_player then 15
          when scoring.has_shared_styles then 10
          else 0
        end -
        case when scoring.tryhard_chill then 5 else 0 end -
        case when scoring.pvp_new_without_sherpa then 8 else 0 end
      ) as style_points,
      least(10,
        case
          when scoring.huge_experience_gap and (
            (coalesce(scoring.hours, 0) > coalesce(scoring.my_hours, 0) and scoring.effective_styles @> array['Sherpa'::public.play_style]) or
            (coalesce(scoring.my_hours, 0) > coalesce(scoring.hours, 0) and scoring.my_styles @> array['Sherpa'::public.play_style])
          ) then 4
          when scoring.huge_experience_gap then 0
          else
            case when scoring.my_level is not null and scoring.candidate_level is not null and abs(scoring.my_level - scoring.candidate_level) <= 15 then 4 else 0 end +
            case
              when scoring.my_hours is not null and scoring.hours is not null and abs(scoring.my_hours - scoring.hours) <= 300 then 3
              when scoring.my_hours is not null and scoring.hours is not null and abs(scoring.my_hours - scoring.hours) <= 1000 then 2
              else 0
            end +
            case
              when scoring.my_raids is not null and scoring.raids is not null and abs(scoring.my_raids - scoring.raids) <= 200 then 3
              when scoring.my_raids is not null and scoring.raids is not null and abs(scoring.my_raids - scoring.raids) <= 800 then 1
              else 0
            end
        end
      ) as experience_points
    from scoring
  ),
  final as (
    select
      points.*,
      greatest(0, least(
        100,
        case when not points.has_shared_language then 55 else 100 end,
        case when not points.has_shared_schedule then 70 else 100 end,
        points.language_points + points.region_points + points.schedule_points + points.objective_points + points.map_points + points.style_points + points.experience_points
      ))::int as compatibility_score,
      array_remove(array[
        case when points.shared_game_modes @> array['PvE'::public.game_mode] then 'Ambos jugáis PvE' end,
        case when points.candidate_speaks_my_language then 'Habla tu idioma'
             when points.has_shared_language and points.shared_languages @> array['EN'::public.language_code] then 'Compartís inglés'
             when points.has_shared_language then 'Compartís idioma'
        end,
        case when points.same_region then 'Misma región ' || points.region::text
             when points.compatible_region then 'Región compatible'
        end,
        case when points.has_shared_schedule and points.shared_schedule @> array['Fines de semana'::public.schedule_slot] then 'Coincidís fines de semana'
             when points.has_shared_schedule then 'Horario compatible'
        end,
        case when points.same_primary_objective then
          case points.my_objectives[1]
            when 'Misiones'::public.raid_objective then 'Ambos buscáis misiones'
            when 'PvP'::public.raid_objective then 'Ambos vais a PvP'
            else 'Ambos buscáis ' || lower(points.my_objectives[1]::text)
          end
          when points.has_shared_objectives then 'Objetivo compatible: ' || points.shared_objectives[1]::text
        end,
        case when points.has_shared_maps then 'Coincidís en ' || points.shared_maps[1]::text end,
        case when points.sherpa_new_player then 'Sherpa ideal para novato'
             when points.has_shared_styles then 'Estilos parecidos'
        end,
        case
          when points.huge_experience_gap and (
            (coalesce(points.hours, 0) > coalesce(points.my_hours, 0) and points.effective_styles @> array['Sherpa'::public.play_style]) or
            (coalesce(points.my_hours, 0) > coalesce(points.hours, 0) and points.my_styles @> array['Sherpa'::public.play_style])
          ) then 'Veterano dispuesto a ayudar'
          when points.experience_points >= 7 then 'Experiencia parecida'
        end
      ], null) as compatibility_reasons,
      array_remove(array[
        case when not points.has_shared_language then 'No compartís idioma' end,
        case when not points.same_region and not points.compatible_region then 'Región lejana' end,
        case when not points.has_shared_schedule then 'Horarios poco compatibles' end,
        case when points.objective_pvp_learning_penalty then 'Objetivos PvP y aprendizaje pueden chocar' end,
        case when points.tryhard_chill then 'Ritmo de juego distinto' end,
        case when points.pvp_new_without_sherpa then 'PvP con jugador nuevo puede ser duro' end,
        case when points.huge_experience_gap and not (
          (coalesce(points.hours, 0) > coalesce(points.my_hours, 0) and points.effective_styles @> array['Sherpa'::public.play_style]) or
          (coalesce(points.my_hours, 0) > coalesce(points.hours, 0) and points.my_styles @> array['Sherpa'::public.play_style])
        ) then 'Diferencia grande de experiencia' end
      ], null) as compatibility_warnings
    from points
  )
  select
    final.id,
    final.nickname,
    final.discord_username,
    final.discord_id,
    final.avatar_url,
    final.region,
    final.language,
    final.spoken_languages,
    final.approximate_level,
    final.favorite_maps,
    final.play_styles,
    final.objectives,
    final.schedule,
    final.bio,
    final.onboarding_complete,
    final.compatibility_score,
    final.compatibility_reasons,
    final.compatibility_warnings,
    final.shared_languages,
    final.shared_maps,
    final.shared_objectives,
    final.shared_styles,
    final.game_modes,
    final.last_active_at,
    final.real_level,
    final.survival_rate,
    final.kd,
    final.raids,
    final.hours,
    final.pmc_kills,
    final.has_public_stats
  from final
  order by final.compatibility_score desc, final.last_active_at desc nulls last
  limit greatest(1, least(p_limit, 50));
$$;

create or replace function public.get_app_badges()
returns table (
  unread_messages int,
  new_matches int,
  quest_help_responses int,
  raid_now_responses int,
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
    return query select 0, 0, 0, 0, 0, false;
    return;
  end if;

  v_is_admin := public.is_admin(v_user);

  -- unread_messages counts conversations whose last message is from the other player and
  -- newer than our last read. The summary lives on matches, so no message scan is needed.
  return query
  with my_matches as (
    select m.id, m.profile_one, m.profile_two, m.created_at, m.last_message_at, m.last_message_sender_id
    from public.matches m
    where m.profile_one = v_user
    union all
    select m.id, m.profile_one, m.profile_two, m.created_at, m.last_message_at, m.last_message_sender_id
    from public.matches m
    where m.profile_two = v_user
  ),
  visible as (
    select my_matches.*, reads.last_read_at
    from my_matches
    left join public.match_reads reads
      on reads.match_id = my_matches.id
     and reads.profile_id = v_user
    where not public.is_blocked(my_matches.profile_one, my_matches.profile_two)
  )
  select
    (
      select count(*)::int
      from visible
      where visible.last_message_sender_id is not null
        and visible.last_message_sender_id <> v_user
        and visible.last_message_at > coalesce(visible.last_read_at, 'epoch'::timestamptz)
    ) as unread_messages,
    (
      select count(*)::int
      from visible
      where visible.created_at > now() - interval '7 days'
        and visible.last_read_at is null
    ) as new_matches,
    (
      select count(*)::int
      from public.quest_help_posts post
      join public.quest_help_responses response on response.post_id = post.id
      where post.user_id = v_user
        and post.status = 'Activa'
        and post.expires_at > now()
        and response.status = 'pending'
        and response.responder_id <> v_user
    ) as quest_help_responses,
    (
      select count(*)::int
      from public.raid_now_posts post
      join public.raid_now_responses response on response.post_id = post.id
      where post.profile_id = v_user
        and post.closed_at is null
        and post.expires_at > now()
        and response.status = 'pending'
        and not public.is_blocked(v_user, response.responder_id)
    ) as raid_now_responses,
    (
      select case
        when v_is_admin then (select count(*)::int from public.reports where status = 'open')
        else 0
      end
    ) as open_reports,
    v_is_admin as is_admin;
end;
$$;

-- RLS: wrap auth.uid() so Postgres evaluates it once per statement (Supabase RLS performance guide).
drop policy if exists "Profiles are visible to authenticated users" on public.profiles;
create policy "Profiles are visible to authenticated users"
on public.profiles for select
to authenticated
using (not public.is_blocked((select auth.uid()), id));

drop policy if exists "Users insert own profile" on public.profiles;
create policy "Users insert own profile"
on public.profiles for insert
to authenticated
with check (id = (select auth.uid()));

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
on public.profiles for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists "Matched users see profile contacts" on public.profile_contacts;
create policy "Matched users see profile contacts"
on public.profile_contacts for select
to authenticated
using (
  profile_id = (select auth.uid())
  or exists (
    select 1
    from public.matches m
    where (select auth.uid()) in (m.profile_one, m.profile_two)
      and profile_id in (m.profile_one, m.profile_two)
      and not public.is_blocked(m.profile_one, m.profile_two)
  )
);

drop policy if exists "Users insert own profile contact" on public.profile_contacts;
create policy "Users insert own profile contact"
on public.profile_contacts for insert
to authenticated
with check (profile_id = (select auth.uid()));

drop policy if exists "Users update own profile contact" on public.profile_contacts;
create policy "Users update own profile contact"
on public.profile_contacts for update
to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));

drop policy if exists "Users manage own preferences" on public.player_preferences;
create policy "Users manage own preferences"
on public.player_preferences for all
to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));

drop policy if exists "Users see own tarkov stats" on public.profile_tarkov_stats;
create policy "Users see own tarkov stats"
on public.profile_tarkov_stats for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users insert own tarkov stats" on public.profile_tarkov_stats;
create policy "Users insert own tarkov stats"
on public.profile_tarkov_stats for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and (select allowed from public.check_rate_limit('db:tarkov-sync:' || (select auth.uid())::text, 8, 3600))
);

drop policy if exists "Users update own tarkov stats" on public.profile_tarkov_stats;
create policy "Users update own tarkov stats"
on public.profile_tarkov_stats for update
to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and (select allowed from public.check_rate_limit('db:tarkov-sync:' || (select auth.uid())::text, 8, 3600))
);

drop policy if exists "Users insert own quest help posts" on public.quest_help_posts;
create policy "Users insert own quest help posts"
on public.quest_help_posts for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and (select allowed from public.check_rate_limit('db:quest-help:create:' || (select auth.uid())::text, 10, 3600))
);

drop policy if exists "Quest help responses visible to post owner or responder" on public.quest_help_responses;
create policy "Quest help responses visible to post owner or responder"
on public.quest_help_responses for select
to authenticated
using (
  responder_id = (select auth.uid())
  or exists (
    select 1 from public.quest_help_posts p
    where p.id = post_id and p.user_id = (select auth.uid())
  )
);

drop policy if exists "Users insert own quest help responses" on public.quest_help_responses;
create policy "Users insert own quest help responses"
on public.quest_help_responses for insert
to authenticated
with check (
  responder_id = (select auth.uid())
  and status = 'pending'
  and match_id is null
  and exists (
    select 1
    from public.quest_help_posts post
    where post.id = post_id
      and post.user_id <> (select auth.uid())
      and post.status = 'Activa'
      and post.expires_at > now()
      and not public.is_blocked((select auth.uid()), post.user_id)
  )
  and (select allowed from public.check_rate_limit('db:post-response:' || (select auth.uid())::text, 20, 3600))
);

drop policy if exists "Raid responses visible to post owner or responder" on public.raid_now_responses;
create policy "Raid responses visible to post owner or responder"
on public.raid_now_responses for select
to authenticated
using (
  responder_id = (select auth.uid())
  or exists (
    select 1 from public.raid_now_posts p
    where p.id = post_id and p.profile_id = (select auth.uid())
  )
);

drop policy if exists "Review authors see own future reviews" on public.profile_reviews;
create policy "Review authors see own future reviews"
on public.profile_reviews for select
to authenticated
using (reviewer_id = (select auth.uid()) or (reviewed_id = (select auth.uid()) and is_visible = true));

drop policy if exists "Users insert own future reviews" on public.profile_reviews;
create policy "Users insert own future reviews"
on public.profile_reviews for insert
to authenticated
with check (reviewer_id = (select auth.uid()));

drop policy if exists "Profile tags visible" on public.profile_tags;
create policy "Profile tags visible"
on public.profile_tags for select
to authenticated
using (not public.is_blocked((select auth.uid()), profile_id));

drop policy if exists "Users manage own tags" on public.profile_tags;
create policy "Users manage own tags"
on public.profile_tags for all
to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));

drop policy if exists "Users see own swipes" on public.swipes;
create policy "Users see own swipes"
on public.swipes for select
to authenticated
using (swiper_id = (select auth.uid()));

drop policy if exists "Users insert own swipes" on public.swipes;
create policy "Users insert own swipes"
on public.swipes for insert
to authenticated
with check (swiper_id = (select auth.uid()) and not public.is_blocked((select auth.uid()), target_id));

drop policy if exists "Users update own swipes" on public.swipes;
create policy "Users update own swipes"
on public.swipes for update
to authenticated
using (swiper_id = (select auth.uid()))
with check (swiper_id = (select auth.uid()));

drop policy if exists "Participants see matches" on public.matches;
create policy "Participants see matches"
on public.matches for select
to authenticated
using ((select auth.uid()) in (profile_one, profile_two) and not public.is_blocked(profile_one, profile_two));

drop policy if exists "Participants see messages" on public.messages;
create policy "Participants see messages"
on public.messages for select
to authenticated
using (public.can_access_match(match_id, (select auth.uid())));

drop policy if exists "Participants send messages" on public.messages;
create policy "Participants send messages"
on public.messages for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and public.can_access_match(match_id, (select auth.uid()))
  and (select allowed from public.check_rate_limit('db:message:' || (select auth.uid())::text || ':' || match_id::text, 10, 60))
);

drop policy if exists "Participants see match reads" on public.match_reads;
create policy "Participants see match reads"
on public.match_reads for select
to authenticated
using (profile_id = (select auth.uid()) and public.can_access_match(match_id, (select auth.uid())));

drop policy if exists "Participants upsert own match reads" on public.match_reads;
create policy "Participants upsert own match reads"
on public.match_reads for insert
to authenticated
with check (profile_id = (select auth.uid()) and public.can_access_match(match_id, (select auth.uid())));

drop policy if exists "Participants update own match reads" on public.match_reads;
create policy "Participants update own match reads"
on public.match_reads for update
to authenticated
using (profile_id = (select auth.uid()) and public.can_access_match(match_id, (select auth.uid())))
with check (profile_id = (select auth.uid()) and public.can_access_match(match_id, (select auth.uid())));

drop policy if exists "Active raid posts visible" on public.raid_now_posts;
create policy "Active raid posts visible"
on public.raid_now_posts for select
to authenticated
using (
  closed_at is null
  and expires_at > now()
  and not public.is_blocked((select auth.uid()), profile_id)
);

drop policy if exists "Users insert own raid posts" on public.raid_now_posts;
create policy "Users insert own raid posts"
on public.raid_now_posts for insert
to authenticated
with check (
  profile_id = (select auth.uid())
  and (select allowed from public.check_rate_limit('db:raid-now:create:' || (select auth.uid())::text, 6, 3600))
);

drop policy if exists "Users create reports" on public.reports;
create policy "Users create reports"
on public.reports for insert
to authenticated
with check (
  reporter_id = (select auth.uid())
  and (select allowed from public.check_rate_limit('db:report:' || (select auth.uid())::text, 5, 3600))
);

drop policy if exists "Users see own reports" on public.reports;
create policy "Users see own reports"
on public.reports for select
to authenticated
using (reporter_id = (select auth.uid()));

drop policy if exists "Admins see reports" on public.reports;
create policy "Admins see reports"
on public.reports for select
to authenticated
using (public.is_admin((select auth.uid())));

drop policy if exists "Admins update reports" on public.reports;
create policy "Admins update reports"
on public.reports for update
to authenticated
using (public.is_admin((select auth.uid())))
with check (public.is_admin((select auth.uid())));

drop policy if exists "Users manage own blocks" on public.blocks;
create policy "Users manage own blocks"
on public.blocks for all
to authenticated
using (blocker_id = (select auth.uid()))
with check (
  blocker_id = (select auth.uid())
  and (select allowed from public.check_rate_limit('db:block:' || (select auth.uid())::text, 20, 3600))
);

drop policy if exists "Users upload own avatars" on storage.objects;
create policy "Users upload own avatars"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and array_length(storage.foldername(name), 1) = 1
  and storage.filename(name) ~ '^avatar\.(jpg|jpeg|png|webp)$'
);

drop policy if exists "Users update own avatars" on storage.objects;
create policy "Users update own avatars"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and array_length(storage.foldername(name), 1) = 1
  and storage.filename(name) ~ '^avatar\.(jpg|jpeg|png|webp)$'
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and array_length(storage.foldername(name), 1) = 1
  and storage.filename(name) ~ '^avatar\.(jpg|jpeg|png|webp)$'
);

drop policy if exists "Users delete own avatar" on storage.objects;
create policy "Users delete own avatar"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and array_length(storage.foldername(name), 1) = 1
  and storage.filename(name) ~ '^avatar\.(jpg|jpeg|png|webp)$'
);

revoke all on function public.on_message_inserted() from public;
revoke all on function public.broadcast_message() from public;
revoke all on function public.cleanup_expired_content() from public;
revoke all on function public.get_swipe_candidates(int) from public;
revoke all on function public.get_app_badges() from public;
grant execute on function public.get_swipe_candidates(int) to authenticated;
grant execute on function public.get_app_badges() to authenticated;
grant execute on function public.cleanup_expired_content() to service_role;

commit;
