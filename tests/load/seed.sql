-- Synthetic community for load tests: 50k profiles, ~1M swipes, 25k matches, 100k messages,
-- 2k open Raid Now posts. Run on a throwaway database created by scripts/load-test.mjs.
insert into auth.users (id) select gen_random_uuid() from generate_series(1, 50000);

insert into public.profiles (id, nickname, region, language, spoken_languages, approximate_level, favorite_maps, play_styles, objectives, schedule, game_modes, onboarding_complete, last_active_at)
select u.id, 'P' || row_number() over (),
  (array['EU','NA','LATAM','ASIA'])[1 + (random()*3)::int]::public.region,
  (array['ES','EN','FR','DE','PT','RU','IT'])[1 + (random()*6)::int]::public.language_code,
  array[(array['ES','EN','FR','DE'])[1 + (random()*3)::int]]::public.language_code[],
  1 + (random()*70)::int,
  array[(array['Customs','Woods','Reserve','Shoreline','Interchange'])[1 + (random()*4)::int]]::public.eft_map[],
  array[(array['Chill','Tryhard','PvP','Sherpa','New player'])[1 + (random()*4)::int]]::public.play_style[],
  array[(array['Misiones','Loot runs','PvP','Aprender'])[1 + (random()*3)::int]]::public.raid_objective[],
  array[(array['Mañana','Tarde','Noche','Madrugada'])[1 + (random()*3)::int]]::public.schedule_slot[],
  case when random() < 0.2 then '{PvE}' when random() < 0.1 then '{PvP,PvE}' else '{PvP}' end::public.game_mode[],
  true, now() - (random() * interval '120 days')
from auth.users u;

create table ids as select id, row_number() over () as n from public.profiles;

insert into public.swipes (swiper_id, target_id, decision)
select a.id, b.id, case when random() < 0.4 then 'like' else 'pass' end::public.swipe_decision
from ids a cross join generate_series(1, 20) g join ids b on b.n = ((a.n + g.g) % 50000) + 1
on conflict do nothing;

insert into public.matches (profile_one, profile_two)
select least(a.id, b.id), greatest(a.id, b.id)
from ids a join ids b on b.n = ((a.n + 777) % 50000) + 1
where a.n % 2 = 0
on conflict do nothing;

insert into public.messages (match_id, sender_id, body, created_at)
select m.id, case when random() < .5 then m.profile_one else m.profile_two end, 'msg', now() - random() * interval '10 days'
from public.matches m cross join generate_series(1, 4);

insert into public.raid_now_posts (profile_id, map, objective, players_needed, language, region, style, expires_at)
select id, 'Customs', 'Misiones', 3, 'ES', 'EU', 'Chill', now() + interval '60 minutes'
from ids where n <= 2000;

drop table ids;
create table bench_users as select row_number() over (order by id) as n, id from public.profiles;
alter table bench_users add primary key (n);
create table bench_matches as select row_number() over (order by id) as n, id, profile_one from public.matches;
alter table bench_matches add primary key (n);
grant select on bench_users, bench_matches to authenticated;
vacuum analyze;
