begin;

-- EscapeMate 1.1
-- 1. Fix: check_rate_limit failed on every call ("column reference reset_at is ambiguous"),
--    which blocked onboarding, swipes, chat and every rate-limited insert.
-- 2. Fix: an expired Raid Now post that was never closed kept the one-active-post index
--    busy forever, so the user could never publish again.
-- 3. PvP/PvE game modes on profiles and posts; swipe only pairs players that share a mode.
-- 4. Responses to Raid Now / Quest Help posts that the owner can accept (opens a match + chat).
-- 5. Self-service account deletion.

create type public.game_mode as enum ('PvP', 'PvE');
create type public.post_response_status as enum ('pending', 'accepted', 'declined');

alter table public.profiles
  add column game_modes public.game_mode[] not null default '{PvP}';
alter table public.raid_now_posts
  add column game_mode public.game_mode not null default 'PvP';
alter table public.quest_help_posts
  add column game_mode public.game_mode not null default 'PvP';

grant select (game_modes), insert (game_modes), update (game_modes) on public.profiles to authenticated;

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

  delete from public.rate_limit_buckets as stale
  where stale.reset_at < now() - interval '1 day';

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


-- Closing the caller's expired posts before every insert keeps the partial unique index
-- (one open post per user) from locking users out once a post expires unclosed.
create or replace function public.close_expired_raid_now_posts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.raid_now_posts
  set closed_at = expires_at
  where profile_id = new.profile_id
    and closed_at is null
    and expires_at <= now();

  return new;
end;
$$;

create trigger raid_now_posts_close_expired
before insert on public.raid_now_posts
for each row execute function public.close_expired_raid_now_posts();

alter table public.quest_help_responses
  add column status public.post_response_status not null default 'pending',
  add column match_id uuid references public.matches(id) on delete set null,
  add column decided_at timestamptz;

create table public.raid_now_responses (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.raid_now_posts(id) on delete cascade,
  responder_id uuid not null references public.profiles(id) on delete cascade,
  message text check (char_length(coalesce(message, '')) <= 280),
  status public.post_response_status not null default 'pending',
  match_id uuid references public.matches(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (post_id, responder_id)
);

create index raid_now_responses_post_idx on public.raid_now_responses (post_id, status);
create index quest_help_responses_post_idx on public.quest_help_responses (post_id, status);

alter table public.raid_now_responses enable row level security;

create policy "Raid responses visible to post owner or responder"
on public.raid_now_responses for select
to authenticated
using (
  responder_id = auth.uid()
  or exists (
    select 1 from public.raid_now_posts p
    where p.id = post_id and p.profile_id = auth.uid()
  )
);

create policy "Users respond to active raid posts"
on public.raid_now_responses for insert
to authenticated
with check (
  responder_id = auth.uid()
  and status = 'pending'
  and match_id is null
  and exists (
    select 1
    from public.raid_now_posts post
    where post.id = post_id
      and post.profile_id <> auth.uid()
      and post.closed_at is null
      and post.expires_at > now()
      and not public.is_blocked(auth.uid(), post.profile_id)
  )
  and (select allowed from public.check_rate_limit('db:post-response:' || auth.uid()::text, 20, 3600))
);

drop policy if exists "Users insert own quest help responses" on public.quest_help_responses;

create policy "Users insert own quest help responses"
on public.quest_help_responses for insert
to authenticated
with check (
  responder_id = auth.uid()
  and status = 'pending'
  and match_id is null
  and exists (
    select 1
    from public.quest_help_posts post
    where post.id = post_id
      and post.user_id <> auth.uid()
      and post.status = 'Activa'
      and post.expires_at > now()
      and not public.is_blocked(auth.uid(), post.user_id)
  )
  and (select allowed from public.check_rate_limit('db:post-response:' || auth.uid()::text, 20, 3600))
);

grant select, insert on table public.raid_now_responses to authenticated;
grant select, insert, update, delete on table public.raid_now_responses to service_role;

-- Owner accepts or declines a response. Accepting opens (or reuses) a match so both players
-- unlock chat and Discord, and seeds the chat with the responder's note.
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

-- Deleting the auth user cascades to the profile and every row that references it.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_allowed boolean;
begin
  if v_user is null then
    raise exception 'auth required' using errcode = '28000';
  end if;

  select allowed into v_allowed
  from public.check_rate_limit('account:delete:' || v_user::text, 3, 3600);

  if not coalesce(v_allowed, false) then
    raise exception 'Rate limited';
  end if;

  delete from auth.users where id = v_user;
end;
$$;

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
  last_active_at timestamptz
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
      stats.pmc_kills
    from public.profiles p
    left join public.player_preferences pref on pref.profile_id = p.id
    left join public.profile_tarkov_stats stats on stats.user_id = p.id and stats.is_public = true
    where p.id <> auth.uid()
      and p.onboarding_complete = true
      and not exists (
        select 1 from public.swipes s where s.swiper_id = auth.uid() and s.target_id = p.id
      )
      and not public.is_blocked(auth.uid(), p.id)
      and not exists (
        select 1 from public.matches m
        where m.profile_one = least(auth.uid(), p.id)
          and m.profile_two = greatest(auth.uid(), p.id)
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
    final.last_active_at
  from final
  order by final.compatibility_score desc, final.last_active_at desc nulls last
  limit greatest(1, least(p_limit, 50));
$$;


drop function if exists public.get_app_badges();

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
        and not exists (
          select 1 from public.match_reads reads
          where reads.match_id = m.id and reads.profile_id = v_user
        )
    ) as new_matches,
    (
      select count(*)::int
      from public.quest_help_responses response
      join public.quest_help_posts post on post.id = response.post_id
      where post.user_id = v_user
        and post.status = 'Activa'
        and post.expires_at > now()
        and response.responder_id <> v_user
        and response.status = 'pending'
    ) as quest_help_responses,
    (
      select count(*)::int
      from public.raid_now_responses response
      join public.raid_now_posts post on post.id = response.post_id
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


revoke all on function public.close_expired_raid_now_posts() from public;
revoke all on function public.decide_post_response(text, uuid, boolean) from public;
revoke all on function public.delete_my_account() from public;
revoke all on function public.get_swipe_candidates(int) from public;
revoke all on function public.get_app_badges() from public;
grant execute on function public.decide_post_response(text, uuid, boolean) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.get_swipe_candidates(int) to authenticated;
grant execute on function public.get_app_badges() to authenticated;

commit;
