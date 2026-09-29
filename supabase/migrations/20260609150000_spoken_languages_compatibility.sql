-- Multi-language profile support and compatibility reasons.

alter type public.language_code add value if not exists 'IT';

alter table public.profiles
add column if not exists spoken_languages public.language_code[] not null default '{}';

update public.profiles
set spoken_languages = array[language]::public.language_code[]
where language is not null
  and (spoken_languages is null or spoken_languages = '{}'::public.language_code[]);

create index if not exists profiles_spoken_languages_idx
on public.profiles using gin (spoken_languages);

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
  compatibility_reasons text[]
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
  ),
  scored as (
    select
      p.id,
      p.nickname,
      null::text as discord_username,
      null::text as discord_id,
      p.avatar_url,
      p.region,
      p.language,
      coalesce(nullif(p.spoken_languages, '{}'::public.language_code[]), array[p.language]) as spoken_languages,
      p.approximate_level,
      p.favorite_maps,
      p.play_styles,
      p.objectives,
      p.schedule,
      p.bio,
      p.onboarding_complete,
      p.last_active_at,
      least(100,
        25 * case when coalesce(nullif(p.spoken_languages, '{}'::public.language_code[]), array[p.language]) @> array[me.language] then 1 else 0 end +
        15 * case when coalesce(nullif(p.spoken_languages, '{}'::public.language_code[]), array[p.language]) && coalesce(nullif(me.spoken_languages, '{}'::public.language_code[]), array[me.language]) then 1 else 0 end +
        20 * case when p.region = me.region then 1 else 0 end +
        15 * case when p.objectives && me.objectives then 1 else 0 end +
        15 * case when p.favorite_maps && me.favorite_maps then 1 else 0 end +
        10 * case when p.play_styles && me.play_styles then 1 else 0 end +
        10 * case when p.schedule && me.schedule then 1 else 0 end +
        5 * case when abs(coalesce(p.approximate_level, 1) - coalesce(me.approximate_level, 1)) <= 15 then 1 else 0 end
      )::int as compatibility_score,
      array_remove(array[
        case when coalesce(nullif(p.spoken_languages, '{}'::public.language_code[]), array[p.language]) @> array[me.language]
          then 'Habla ' || case me.language
            when 'ES' then 'español'
            when 'EN' then 'inglés'
            when 'FR' then 'francés'
            when 'DE' then 'alemán'
            when 'PT' then 'portugués'
            when 'RU' then 'ruso'
            when 'IT' then 'italiano'
            else lower(me.language::text)
          end
        end,
        case when p.region = me.region then 'Misma región ' || p.region::text end,
        case when p.objectives && me.objectives then 'Ambos buscáis ' || lower((select objective::text from unnest(p.objectives) objective where objective = any(me.objectives) limit 1)) end,
        case when p.favorite_maps && me.favorite_maps then 'Coincidís en ' || (select map::text from unnest(p.favorite_maps) map where map = any(me.favorite_maps) limit 1) end,
        case when p.play_styles && me.play_styles then 'Estilo compatible: ' || (select style::text from unnest(p.play_styles) style where style = any(me.play_styles) limit 1) end,
        case when p.schedule && me.schedule then 'Horario de ' || lower((select slot::text from unnest(p.schedule) slot where slot = any(me.schedule) limit 1)) || ' compatible' end,
        case when abs(coalesce(p.approximate_level, 1) - coalesce(me.approximate_level, 1)) <= 15 then 'Nivel parecido' end
      ], null) as compatibility_reasons
    from public.profiles p
    cross join me
    where p.id <> auth.uid()
      and p.onboarding_complete = true
      and not exists (
        select 1 from public.swipes s where s.swiper_id = auth.uid() and s.target_id = p.id
      )
      and not public.is_blocked(auth.uid(), p.id)
  )
  select
    scored.id,
    scored.nickname,
    scored.discord_username,
    scored.discord_id,
    scored.avatar_url,
    scored.region,
    scored.language,
    scored.spoken_languages,
    scored.approximate_level,
    scored.favorite_maps,
    scored.play_styles,
    scored.objectives,
    scored.schedule,
    scored.bio,
    scored.onboarding_complete,
    scored.compatibility_score,
    scored.compatibility_reasons
  from scored
  order by scored.compatibility_score desc, scored.last_active_at desc nulls last
  limit greatest(1, least(p_limit, 50));
$$;
