-- v1.3: get_swipe_candidates devuelve códigos de compatibilidad en lugar de frases en español.
--
-- Antes la función devolvía textos ("Misma región EU") que el cliente traducía a códigos con
-- expresiones regulares. Ahora devuelve directamente el código y sus parámetros
-- ("compat.region.same:region=EU"). El cliente acepta ambos formatos, así que la app funciona
-- antes y después de aplicar esta migración. Solo cambia el texto de las razones y avisos;
-- el cálculo de compatibilidad es idéntico al de 20260926100000_v1_2_scale.sql.

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
