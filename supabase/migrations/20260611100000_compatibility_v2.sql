-- Compatibility V2 for swipe candidates.
-- Uses only data already stored in Supabase and returns public/safe fields.

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
  shared_styles public.play_style[]
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
      p.schedule
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
      ) as shared_schedule
    from candidate_base c
    cross join me
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
    final.shared_styles
  from final
  order by final.compatibility_score desc, final.last_active_at desc nulls last
  limit greatest(1, least(p_limit, 50));
$$;
