-- Tarkov profile linking, Quest Help, future reviews, and canonical map values.

alter type public.eft_map add value if not exists 'Streets of Tarkov';
alter type public.eft_map add value if not exists 'The Lab';
alter type public.eft_map add value if not exists 'Terminal';
alter type public.eft_map add value if not exists 'The Labyrinth';
alter type public.eft_map add value if not exists 'Icebreaker';

do $$
begin
  create type public.quest_help_type as enum (
    'Necesito ayuda',
    'Ofrezco ayuda / Sherpa',
    'Busco dúo para quest',
    'Busco squad para quest',
    'Busco PvP',
    'Busco loot run',
    'Busco aprender mapa'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.quest_help_status as enum ('Activa', 'Cerrada', 'Expirada');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.review_tag as enum (
    'Buena comunicación',
    'Chill',
    'Ayudó en quest',
    'Tóxico',
    'Abandonó raid',
    'Recomendado'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.profile_tarkov_stats (
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

create table if not exists public.quest_help_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  quest_id text,
  quest_name text not null check (char_length(quest_name) between 2 and 120),
  map public.eft_map not null,
  region public.region not null,
  language public.language_code not null,
  playstyle public.play_style,
  request_type public.quest_help_type not null,
  description text check (char_length(coalesce(description, '')) <= 500),
  status public.quest_help_status not null default 'Activa',
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quest_help_responses (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.quest_help_posts(id) on delete cascade,
  responder_id uuid not null references public.profiles(id) on delete cascade,
  message text check (char_length(coalesce(message, '')) <= 500),
  created_at timestamptz not null default now(),
  unique (post_id, responder_id)
);

create table if not exists public.profile_reviews (
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

create index if not exists quest_help_active_idx on public.quest_help_posts (status, expires_at, created_at desc);
create index if not exists quest_help_user_idx on public.quest_help_posts (user_id, status);
create index if not exists profile_reviews_reviewed_idx on public.profile_reviews (reviewed_id, is_visible);

alter table public.profile_tarkov_stats enable row level security;
alter table public.quest_help_posts enable row level security;
alter table public.quest_help_responses enable row level security;
alter table public.profile_reviews enable row level security;

drop trigger if exists profile_tarkov_stats_touch_updated_at on public.profile_tarkov_stats;
create trigger profile_tarkov_stats_touch_updated_at
before update on public.profile_tarkov_stats
for each row execute function public.touch_updated_at();

drop trigger if exists quest_help_posts_touch_updated_at on public.quest_help_posts;
create trigger quest_help_posts_touch_updated_at
before update on public.quest_help_posts
for each row execute function public.touch_updated_at();

drop policy if exists "Public tarkov stats visible" on public.profile_tarkov_stats;
drop policy if exists "Users see own tarkov stats" on public.profile_tarkov_stats;
create policy "Users see own tarkov stats"
on public.profile_tarkov_stats for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users insert own tarkov stats" on public.profile_tarkov_stats;
create policy "Users insert own tarkov stats"
on public.profile_tarkov_stats for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users update own tarkov stats" on public.profile_tarkov_stats;
create policy "Users update own tarkov stats"
on public.profile_tarkov_stats for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Active quest help posts visible" on public.quest_help_posts;
create policy "Active quest help posts visible"
on public.quest_help_posts for select
to authenticated
using (status = 'Activa' and expires_at > now());

drop policy if exists "Users insert own quest help posts" on public.quest_help_posts;
create policy "Users insert own quest help posts"
on public.quest_help_posts for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users update own quest help posts" on public.quest_help_posts;
create policy "Users update own quest help posts"
on public.quest_help_posts for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Quest help responses visible to post owner or responder" on public.quest_help_responses;
create policy "Quest help responses visible to post owner or responder"
on public.quest_help_responses for select
to authenticated
using (
  responder_id = auth.uid()
  or exists (
    select 1 from public.quest_help_posts p
    where p.id = post_id and p.user_id = auth.uid()
  )
);

drop policy if exists "Users insert own quest help responses" on public.quest_help_responses;
create policy "Users insert own quest help responses"
on public.quest_help_responses for insert
to authenticated
with check (responder_id = auth.uid());

drop policy if exists "Review authors see own future reviews" on public.profile_reviews;
create policy "Review authors see own future reviews"
on public.profile_reviews for select
to authenticated
using (reviewer_id = auth.uid() or (reviewed_id = auth.uid() and is_visible = true));

drop policy if exists "Users insert own future reviews" on public.profile_reviews;
create policy "Users insert own future reviews"
on public.profile_reviews for insert
to authenticated
with check (reviewer_id = auth.uid());
