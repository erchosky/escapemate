-- EscapeMate MVP schema
-- Run this in the Supabase SQL editor, then enable Discord OAuth in Auth providers.

create extension if not exists "pgcrypto";

create type public.region as enum ('EU', 'NA', 'LATAM', 'ASIA');
create type public.language_code as enum ('ES', 'EN', 'FR', 'DE', 'PT', 'RU', 'IT');
create type public.eft_map as enum (
  'Customs',
  'Factory',
  'Woods',
  'Shoreline',
  'Interchange',
  'Reserve',
  'Lighthouse',
  'Streets of Tarkov',
  'Ground Zero',
  'The Lab',
  'Terminal',
  'The Labyrinth',
  'Icebreaker'
);
create type public.play_style as enum (
  'Chill',
  'Tryhard',
  'PvP',
  'Loot goblin',
  'Rat',
  'Sniper',
  'Sherpa',
  'New player',
  'Quest focused'
);
create type public.raid_objective as enum (
  'Misiones',
  'Loot runs',
  'PvP',
  'Aprender',
  'Farmear dinero',
  'Labs',
  'Boss hunting',
  'Scav runs',
  'Night raids'
);
create type public.schedule_slot as enum ('Mañana', 'Tarde', 'Noche', 'Madrugada', 'Fines de semana');
create type public.swipe_decision as enum ('like', 'pass');
create type public.report_status as enum ('open', 'reviewed', 'dismissed', 'actioned');
create type public.premium_tier as enum ('free', 'founder', 'premium');
create type public.quest_help_type as enum (
  'Necesito ayuda',
  'Ofrezco ayuda / Sherpa',
  'Busco dúo para quest',
  'Busco squad para quest',
  'Busco PvP',
  'Busco loot run',
  'Busco aprender mapa'
);
create type public.quest_help_status as enum ('Activa', 'Cerrada', 'Expirada');
create type public.game_mode as enum ('PvP', 'PvE');
create type public.post_response_status as enum ('pending', 'accepted', 'declined');
create type public.review_tag as enum (
  'Buena comunicación',
  'Chill',
  'Ayudó en quest',
  'Tóxico',
  'Abandonó raid',
  'Recomendado'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 2 and 32),
  avatar_url text,
  region public.region,
  language public.language_code,
  spoken_languages public.language_code[] not null default '{}',
  approximate_level int check (approximate_level between 1 and 79),
  favorite_maps public.eft_map[] not null default '{}',
  play_styles public.play_style[] not null default '{}',
  objectives public.raid_objective[] not null default '{}',
  schedule public.schedule_slot[] not null default '{}',
  game_modes public.game_mode[] not null default '{PvP}',
  bio text check (char_length(coalesce(bio, '')) <= 240),
  onboarding_complete boolean not null default false,
  is_premium boolean not null default false,
  premium_tier public.premium_tier not null default 'free',
  last_active_at timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profile_contacts (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  discord_username text,
  discord_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.player_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  preferred_regions public.region[] not null default '{}',
  preferred_languages public.language_code[] not null default '{}',
  preferred_maps public.eft_map[] not null default '{}',
  preferred_styles public.play_style[] not null default '{}',
  preferred_objectives public.raid_objective[] not null default '{}',
  level_min int check (level_min is null or level_min between 1 and 79),
  level_max int check (level_max is null or level_max between 1 and 79),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profile_tarkov_stats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  tarkov_profile_url text,
  tarkov_player_id text,
  profile_mode text,
  stats_json jsonb,
  level int check (level is null or level between 1 and 79),
  survival_rate numeric(5, 2) check (survival_rate is null or (survival_rate >= 0 and survival_rate <= 100)),
  kd numeric(8, 2) check (kd is null or kd >= 0),
  raids int check (raids is null or raids >= 0),
  hours int check (hours is null or hours >= 0),
  pmc_kills int check (pmc_kills is null or pmc_kills >= 0),
  last_synced_at timestamptz,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.quest_help_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  quest_id text,
  quest_name text not null check (char_length(quest_name) between 2 and 120),
  map public.eft_map not null,
  region public.region not null,
  language public.language_code not null,
  playstyle public.play_style,
  game_mode public.game_mode not null default 'PvP',
  request_type public.quest_help_type not null,
  description text check (char_length(coalesce(description, '')) <= 500),
  status public.quest_help_status not null default 'Activa',
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.quest_help_responses (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.quest_help_posts(id) on delete cascade,
  responder_id uuid not null references public.profiles(id) on delete cascade,
  message text check (char_length(coalesce(message, '')) <= 500),
  created_at timestamptz not null default now(),
  unique (post_id, responder_id)
);

create table public.profile_tags (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  tag text not null check (char_length(tag) between 2 and 40),
  created_at timestamptz not null default now(),
  unique (profile_id, tag)
);

create table public.swipes (
  swiper_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  decision public.swipe_decision not null,
  created_at timestamptz not null default now(),
  primary key (swiper_id, target_id),
  check (swiper_id <> target_id)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  profile_one uuid not null references public.profiles(id) on delete cascade,
  profile_two uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  last_message_preview text,
  last_message_sender_id uuid references public.profiles(id) on delete set null,
  check (profile_one < profile_two),
  unique (profile_one, profile_two)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create table public.match_reads (
  match_id uuid not null references public.matches(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (match_id, profile_id)
);

create table public.profile_reviews (
  id uuid primary key default gen_random_uuid(),
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  reviewed_id uuid not null references public.profiles(id) on delete cascade,
  match_id uuid references public.matches(id) on delete set null,
  tags public.review_tag[] not null default '{}',
  note text check (char_length(coalesce(note, '')) <= 500),
  is_visible boolean not null default false,
  created_at timestamptz not null default now(),
  check (reviewer_id <> reviewed_id)
);

create table public.raid_now_posts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  map public.eft_map not null,
  objective public.raid_objective not null,
  players_needed int not null check (players_needed between 1 and 4),
  language public.language_code not null,
  region public.region not null,
  style public.play_style not null,
  game_mode public.game_mode not null default 'PvP',
  notes text check (char_length(coalesce(notes, '')) <= 180),
  expires_at timestamptz not null default (now() + interval '90 minutes'),
  closed_at timestamptz,
  accepted_count int not null default 0 check (accepted_count >= 0),
  created_at timestamptz not null default now()
);

create unique index raid_now_one_active_per_user_idx
on public.raid_now_posts (profile_id)
where closed_at is null;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(reason) between 2 and 80),
  details text check (char_length(coalesce(details, '')) <= 500),
  status public.report_status not null default 'open',
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_id)
);

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('admin')),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create unlogged table public.rate_limit_buckets (
  key text primary key,
  count int not null default 0 check (count >= 0),
  reset_at timestamptz not null,
  updated_at timestamptz not null default now()
);

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

create index swipes_target_idx on public.swipes (target_id, decision);
create index matches_profile_one_idx on public.matches (profile_one);
create index matches_profile_two_idx on public.matches (profile_two);
create index messages_match_created_idx on public.messages (match_id, created_at);
create index reports_reported_idx on public.reports (reported_id, status);
create index rate_limit_buckets_reset_at_idx on public.rate_limit_buckets (reset_at);
create index quest_help_user_idx on public.quest_help_posts (user_id, status);
create index profile_reviews_reviewed_idx on public.profile_reviews (reviewed_id, is_visible);
create index profiles_active_pool_idx on public.profiles (last_active_at desc)
  include (region, language, spoken_languages, game_modes)
  where onboarding_complete;
create index blocks_blocked_idx on public.blocks (blocked_id, blocker_id);
create index raid_now_open_idx on public.raid_now_posts (created_at desc) where closed_at is null;
create index quest_help_open_idx on public.quest_help_posts (created_at desc) where status = 'Activa';
create index reports_status_created_idx on public.reports (status, created_at desc);
create index raid_now_responses_responder_idx on public.raid_now_responses (responder_id);
create index quest_help_responses_responder_idx on public.quest_help_responses (responder_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

create trigger profile_contacts_touch_updated_at
before update on public.profile_contacts
for each row execute function public.touch_updated_at();

create trigger player_preferences_touch_updated_at
before update on public.player_preferences
for each row execute function public.touch_updated_at();

create trigger profile_tarkov_stats_touch_updated_at
before update on public.profile_tarkov_stats
for each row execute function public.touch_updated_at();

create trigger quest_help_posts_touch_updated_at
before update on public.quest_help_posts
for each row execute function public.touch_updated_at();

create or replace function public.is_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b)
       or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

create or replace function public.is_match_participant(p_match_id uuid, p_profile_id uuid)
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
  );
$$;

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
        case when points.shared_game_modes @> array['PvE'::public.game_mode] then 'compat.gameMode.sharedPve' end,
        case when points.candidate_speaks_my_language then 'compat.language.speaksYourLanguage'
             when points.has_shared_language and points.shared_languages @> array['EN'::public.language_code] then 'compat.language.sharedEnglish'
             when points.has_shared_language then 'compat.language.sharedLanguage'
        end,
        case when points.same_region then 'compat.region.same:region=' || points.region::text
             when points.compatible_region then 'compat.region.compatible'
        end,
        case when points.has_shared_schedule and points.shared_schedule @> array['Fines de semana'::public.schedule_slot] then 'compat.schedule.sharedWeekends'
             when points.has_shared_schedule then 'compat.schedule.compatible'
        end,
        case when points.same_primary_objective then
          case points.my_objectives[1]
            when 'Misiones'::public.raid_objective then 'compat.objective.sharedQuests'
            when 'PvP'::public.raid_objective then 'compat.objective.sharedPvp'
            else 'compat.objective.shared:objective=' || points.my_objectives[1]::text
          end
          when points.has_shared_objectives then 'compat.objective.compatible:objective=' || points.shared_objectives[1]::text
        end,
        case when points.has_shared_maps then 'compat.map.shared:map=' || points.shared_maps[1]::text end,
        case when points.sherpa_new_player then 'compat.style.sherpaNewPlayer'
             when points.has_shared_styles then 'compat.style.similar'
        end,
        case
          when points.huge_experience_gap and (
            (coalesce(points.hours, 0) > coalesce(points.my_hours, 0) and points.effective_styles @> array['Sherpa'::public.play_style]) or
            (coalesce(points.my_hours, 0) > coalesce(points.hours, 0) and points.my_styles @> array['Sherpa'::public.play_style])
          ) then 'compat.experience.veteranHelper'
          when points.experience_points >= 7 then 'compat.experience.similar'
        end
      ], null) as compatibility_reasons,
      array_remove(array[
        case when not points.has_shared_language then 'compat.warning.noSharedLanguage' end,
        case when not points.same_region and not points.compatible_region then 'compat.warning.distantRegion' end,
        case when not points.has_shared_schedule then 'compat.warning.poorSchedule' end,
        case when points.objective_pvp_learning_penalty then 'compat.warning.pvpVsLearning' end,
        case when points.tryhard_chill then 'compat.warning.differentPace' end,
        case when points.pvp_new_without_sherpa then 'compat.warning.pvpWithNewPlayer' end,
        case when points.huge_experience_gap and not (
          (coalesce(points.hours, 0) > coalesce(points.my_hours, 0) and points.effective_styles @> array['Sherpa'::public.play_style]) or
          (coalesce(points.my_hours, 0) > coalesce(points.hours, 0) and points.my_styles @> array['Sherpa'::public.play_style])
        ) then 'compat.warning.largeExperienceGap' end
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

create or replace function public.get_latest_match_messages(p_match_ids uuid[])
returns table (match_id uuid, body text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select latest.match_id, latest.body, latest.created_at
  from (
    select
      msg.match_id,
      msg.body,
      msg.created_at,
      row_number() over (partition by msg.match_id order by msg.created_at desc, msg.id desc) as rn
    from public.messages msg
    where msg.match_id = any(coalesce(p_match_ids, '{}'::uuid[]))
      and public.can_access_match(msg.match_id, auth.uid())
  ) latest
  where latest.rn = 1;
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

alter table public.profiles enable row level security;
alter table public.profile_contacts enable row level security;
alter table public.player_preferences enable row level security;
alter table public.profile_tarkov_stats enable row level security;
alter table public.quest_help_posts enable row level security;
alter table public.quest_help_responses enable row level security;
alter table public.profile_reviews enable row level security;
alter table public.profile_tags enable row level security;
alter table public.swipes enable row level security;
alter table public.matches enable row level security;
alter table public.messages enable row level security;
alter table public.match_reads enable row level security;
alter table public.raid_now_posts enable row level security;
alter table public.reports enable row level security;
alter table public.user_roles enable row level security;
alter table public.blocks enable row level security;
alter table public.rate_limit_buckets enable row level security;
alter table public.raid_now_responses enable row level security;

create policy "Profiles are visible to authenticated users"
on public.profiles for select
to authenticated
using (not public.is_blocked((select auth.uid()), id));

create policy "Users insert own profile"
on public.profiles for insert
to authenticated
with check (id = (select auth.uid()));

create policy "Users update own profile"
on public.profiles for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

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
  game_modes,
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
  game_modes,
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
  game_modes,
  bio,
  onboarding_complete,
  last_active_at
) on public.profiles to authenticated;
grant select on public.public_profiles_view to authenticated;
grant select on public.public_raid_now_posts_view to authenticated;
grant select on public.public_quest_help_posts_view to authenticated;

-- Data API grants are explicit so clean installs also work on Supabase projects
-- created after automatic public-schema exposure was disabled in 2026.
grant usage on schema public to authenticated, service_role;
revoke all on table
  public.profiles,
  public.profile_contacts,
  public.player_preferences,
  public.profile_tarkov_stats,
  public.quest_help_posts,
  public.quest_help_responses,
  public.profile_tags,
  public.swipes,
  public.matches,
  public.messages,
  public.match_reads,
  public.profile_reviews,
  public.raid_now_posts,
  public.raid_now_responses,
  public.reports,
  public.user_roles,
  public.blocks,
  public.rate_limit_buckets
from anon;
grant select, insert, update on table public.profile_contacts to authenticated;
grant select, insert, update, delete on table public.player_preferences to authenticated;
grant select, insert, update on table public.profile_tarkov_stats to authenticated;
grant select, insert on table public.quest_help_posts to authenticated;
grant select, insert on table public.quest_help_responses to authenticated;
grant select, insert, update, delete on table public.profile_tags to authenticated;
grant select, insert, update on table public.swipes to authenticated;
grant select on table public.matches to authenticated;
grant select, insert on table public.messages to authenticated;
grant select, insert, update on table public.match_reads to authenticated;
grant select, insert on table public.profile_reviews to authenticated;
grant select, insert on table public.raid_now_posts to authenticated;
grant select, insert on table public.raid_now_responses to authenticated;
grant select, insert, update on table public.reports to authenticated;
grant select, insert, update, delete on table public.blocks to authenticated;
revoke all on table public.user_roles, public.rate_limit_buckets from authenticated;
grant select, insert, update, delete on table
  public.profiles,
  public.profile_contacts,
  public.player_preferences,
  public.profile_tarkov_stats,
  public.quest_help_posts,
  public.quest_help_responses,
  public.profile_tags,
  public.swipes,
  public.matches,
  public.messages,
  public.match_reads,
  public.profile_reviews,
  public.raid_now_posts,
  public.raid_now_responses,
  public.reports,
  public.user_roles,
  public.blocks,
  public.rate_limit_buckets
to service_role;

revoke all on function public.is_blocked(uuid, uuid) from public;
revoke all on function public.is_match_participant(uuid, uuid) from public;
revoke all on function public.can_access_match(uuid, uuid) from public;
revoke all on function public.touch_match_activity(uuid) from public;
revoke all on function public.check_rate_limit(text, int, int) from public;
revoke all on function public.is_admin(uuid) from public;
revoke all on function public.get_swipe_candidates(int) from public;
revoke all on function public.get_public_tarkov_stats(uuid[]) from public;
revoke all on function public.create_swipe(uuid, public.swipe_decision) from public;
revoke all on function public.get_app_badges() from public;
revoke all on function public.get_latest_match_messages(uuid[]) from public;
revoke all on function public.close_raid_now_post(uuid) from public;
revoke all on function public.close_quest_help_post(uuid) from public;
revoke all on function public.touch_updated_at() from public;
revoke all on function public.close_expired_raid_now_posts() from public;
revoke all on function public.decide_post_response(text, uuid, boolean) from public;
revoke all on function public.delete_my_account() from public;
revoke all on function public.on_message_inserted() from public;
revoke all on function public.broadcast_message() from public;
revoke all on function public.cleanup_expired_content() from public;
grant execute on function public.is_blocked(uuid, uuid) to authenticated;
grant execute on function public.is_match_participant(uuid, uuid) to authenticated;
grant execute on function public.can_access_match(uuid, uuid) to authenticated;
grant execute on function public.touch_match_activity(uuid) to authenticated;
grant execute on function public.check_rate_limit(text, int, int) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.get_swipe_candidates(int) to authenticated;
grant execute on function public.get_public_tarkov_stats(uuid[]) to authenticated;
grant execute on function public.create_swipe(uuid, public.swipe_decision) to authenticated;
grant execute on function public.get_app_badges() to authenticated;
grant execute on function public.get_latest_match_messages(uuid[]) to authenticated;
grant execute on function public.close_raid_now_post(uuid) to authenticated;
grant execute on function public.close_quest_help_post(uuid) to authenticated;
grant execute on function public.decide_post_response(text, uuid, boolean) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.cleanup_expired_content() to service_role;
revoke all on public.rate_limit_buckets from anon, authenticated;
revoke all on public.user_roles from anon, authenticated;

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

create policy "Users insert own profile contact"
on public.profile_contacts for insert
to authenticated
with check (profile_id = (select auth.uid()));

create policy "Users update own profile contact"
on public.profile_contacts for update
to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));

create policy "Users manage own preferences"
on public.player_preferences for all
to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));

create policy "Users see own tarkov stats"
on public.profile_tarkov_stats for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Users insert own tarkov stats"
on public.profile_tarkov_stats for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and (select allowed from public.check_rate_limit('db:tarkov-sync:' || (select auth.uid())::text, 8, 3600))
);

create policy "Users update own tarkov stats"
on public.profile_tarkov_stats for update
to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and (select allowed from public.check_rate_limit('db:tarkov-sync:' || (select auth.uid())::text, 8, 3600))
);

create policy "Active quest help posts visible"
on public.quest_help_posts for select
to authenticated
using (status = 'Activa' and expires_at > now());

create policy "Users insert own quest help posts"
on public.quest_help_posts for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and (select allowed from public.check_rate_limit('db:quest-help:create:' || (select auth.uid())::text, 10, 3600))
);

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

create policy "Review authors see own future reviews"
on public.profile_reviews for select
to authenticated
using (reviewer_id = (select auth.uid()) or (reviewed_id = (select auth.uid()) and is_visible = true));

create policy "Users insert own future reviews"
on public.profile_reviews for insert
to authenticated
with check (reviewer_id = (select auth.uid()));

create policy "Profile tags visible"
on public.profile_tags for select
to authenticated
using (not public.is_blocked((select auth.uid()), profile_id));

create policy "Users manage own tags"
on public.profile_tags for all
to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));

create policy "Users see own swipes"
on public.swipes for select
to authenticated
using (swiper_id = (select auth.uid()));

create policy "Users insert own swipes"
on public.swipes for insert
to authenticated
with check (swiper_id = (select auth.uid()) and not public.is_blocked((select auth.uid()), target_id));

create policy "Users update own swipes"
on public.swipes for update
to authenticated
using (swiper_id = (select auth.uid()))
with check (swiper_id = (select auth.uid()));

create policy "Participants see matches"
on public.matches for select
to authenticated
using ((select auth.uid()) in (profile_one, profile_two) and not public.is_blocked(profile_one, profile_two));

create policy "Participants see messages"
on public.messages for select
to authenticated
using (public.can_access_match(match_id, (select auth.uid())));

create policy "Participants send messages"
on public.messages for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and public.can_access_match(match_id, (select auth.uid()))
  and (select allowed from public.check_rate_limit('db:message:' || (select auth.uid())::text || ':' || match_id::text, 10, 60))
);

create policy "Participants see match reads"
on public.match_reads for select
to authenticated
using (profile_id = (select auth.uid()) and public.can_access_match(match_id, (select auth.uid())));

create policy "Participants upsert own match reads"
on public.match_reads for insert
to authenticated
with check (profile_id = (select auth.uid()) and public.can_access_match(match_id, (select auth.uid())));

create policy "Participants update own match reads"
on public.match_reads for update
to authenticated
using (profile_id = (select auth.uid()) and public.can_access_match(match_id, (select auth.uid())))
with check (profile_id = (select auth.uid()) and public.can_access_match(match_id, (select auth.uid())));

grant select, insert, update on public.match_reads to authenticated;

create policy "Active raid posts visible"
on public.raid_now_posts for select
to authenticated
using (
  closed_at is null
  and expires_at > now()
  and not public.is_blocked((select auth.uid()), profile_id)
);

create policy "Users insert own raid posts"
on public.raid_now_posts for insert
to authenticated
with check (
  profile_id = (select auth.uid())
  and (select allowed from public.check_rate_limit('db:raid-now:create:' || (select auth.uid())::text, 6, 3600))
);

create policy "Users create reports"
on public.reports for insert
to authenticated
with check (
  reporter_id = (select auth.uid())
  and (select allowed from public.check_rate_limit('db:report:' || (select auth.uid())::text, 5, 3600))
);

create policy "Users see own reports"
on public.reports for select
to authenticated
using (reporter_id = (select auth.uid()));

create policy "Admins see reports"
on public.reports for select
to authenticated
using (public.is_admin((select auth.uid())));

create policy "Admins update reports"
on public.reports for update
to authenticated
using (public.is_admin((select auth.uid())))
with check (public.is_admin((select auth.uid())));

create policy "Users manage own blocks"
on public.blocks for all
to authenticated
using (blocker_id = (select auth.uid()))
with check (
  blocker_id = (select auth.uid())
  and (select allowed from public.check_rate_limit('db:block:' || (select auth.uid())::text, 20, 3600))
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Avatar images are public"
on storage.objects for select
using (bucket_id = 'avatars');

create policy "Users upload own avatars"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and array_length(storage.foldername(name), 1) = 1
  and storage.filename(name) ~ '^avatar\.(jpg|jpeg|png|webp)$'
);

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

create policy "Users delete own avatar"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and array_length(storage.foldername(name), 1) = 1
  and storage.filename(name) ~ '^avatar\.(jpg|jpeg|png|webp)$'
);
