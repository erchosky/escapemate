-- Behavioural checks for supabase/schema.sql against a plain PostgreSQL with Supabase stubs.
-- Run with: npm run test:sql  (needs a local PostgreSQL; see scripts/sql-test.mjs)
-- Every check raises on failure, so psql -v ON_ERROR_STOP=1 exits non-zero.

\set ON_ERROR_STOP 1
set client_min_messages = warning;

insert into auth.users (id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222'),
  ('33333333-3333-4333-8333-333333333333'),
  ('44444444-4444-4444-8444-444444444444');

insert into public.profiles (id, nickname, region, language, spoken_languages, approximate_level, favorite_maps, play_styles, objectives, schedule, game_modes, onboarding_complete) values
  ('11111111-1111-4111-8111-111111111111', 'Alpha', 'EU', 'ES', '{ES,EN}', 30, '{Customs}', '{Chill}', '{Misiones}', '{Noche}', '{PvP}', true),
  ('22222222-2222-4222-8222-222222222222', 'Bravo', 'EU', 'ES', '{ES}', 32, '{Customs}', '{Chill}', '{Misiones}', '{Noche}', '{PvP,PvE}', true),
  ('33333333-3333-4333-8333-333333333333', 'Charlie', 'EU', 'ES', '{ES}', 28, '{Woods}', '{Sherpa}', '{Misiones}', '{Noche}', '{PvE}', true),
  ('44444444-4444-4444-8444-444444444444', 'Delta', 'NA', 'EN', '{EN}', 50, '{Factory}', '{PvP}', '{PvP}', '{Tarde}', '{PvP}', true);

insert into public.profile_contacts (profile_id, discord_username, discord_id) values
  ('11111111-1111-4111-8111-111111111111', 'alpha#1', '1001'),
  ('22222222-2222-4222-8222-222222222222', 'bravo#2', '1002'),
  ('33333333-3333-4333-8333-333333333333', 'charlie#3', '1003');

create or replace function pg_temp.as_user(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_id::text, false);
end;
$$;

create or replace function pg_temp.check(p_ok boolean, p_label text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then
    raise exception 'CHECK FAILED: %', p_label;
  end if;
  raise notice 'ok - %', p_label;
end;
$$;

set client_min_messages = notice;
set role authenticated;

-- 1. Rate limit RPC works and enforces its whitelist.
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select pg_temp.check((select allowed from public.check_rate_limit('swipe:11111111-1111-4111-8111-111111111111', 80, 60)), 'check_rate_limit allows a whitelisted key');
select pg_temp.check(not (select allowed from public.check_rate_limit('swipe:22222222-2222-4222-8222-222222222222', 80, 60)), 'check_rate_limit rejects another user key');
select pg_temp.check(not (select allowed from public.check_rate_limit('swipe:11111111-1111-4111-8111-111111111111', 9999, 60)), 'check_rate_limit rejects manipulated limits');
select pg_temp.check((select allowed from public.check_rate_limit('post-response:11111111-1111-4111-8111-111111111111', 20, 3600)), 'check_rate_limit accepts post-response key');

-- 2. Swipe candidates only share game modes, and never include existing matches.
select pg_temp.check(
  (select array_agg(nickname order by nickname) from public.get_swipe_candidates(20)) = array['Bravo', 'Delta'],
  'PvP-only player never sees PvE-only players'
);
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
select pg_temp.check(
  (select array_agg(nickname order by nickname) from public.get_swipe_candidates(20)) = array['Bravo'],
  'PvE-only player only sees PvE players'
);
select pg_temp.check(
  (select 'compat.gameMode.sharedPve' = any(compatibility_reasons) from public.get_swipe_candidates(20) where nickname = 'Bravo'),
  'shared PvE is surfaced as a compatibility reason'
);

-- 3. Mutual like creates a match; contacts unlock only after it.
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select pg_temp.check((select count(*) = 0 from public.profile_contacts where profile_id = '22222222-2222-4222-8222-222222222222'), 'Discord hidden before match');
select pg_temp.check(not (select matched from public.create_swipe('22222222-2222-4222-8222-222222222222', 'like')), 'first like does not match');
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select pg_temp.check((select matched from public.create_swipe('11111111-1111-4111-8111-111111111111', 'like')), 'mutual like matches');
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select pg_temp.check((select count(*) = 1 from public.profile_contacts where profile_id = '22222222-2222-4222-8222-222222222222'), 'Discord visible after match');
select pg_temp.check(
  not exists (select 1 from public.get_swipe_candidates(20) where nickname = 'Bravo'),
  'matched profiles leave the swipe queue'
);

-- 4. Chat inserts pass RLS (this used to fail through check_rate_limit).
insert into public.messages (match_id, sender_id, body)
select id, auth.uid(), 'Customs a las 22?' from public.matches limit 1;
select pg_temp.check((select count(*) = 1 from public.messages), 'match participant can send a message');
select pg_temp.as_user('44444444-4444-4444-8444-444444444444');
select pg_temp.check((select count(*) = 0 from public.messages), 'outsider cannot read the chat');

-- 5. Expired Raid Now posts no longer lock users out.
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
insert into public.raid_now_posts (profile_id, map, objective, players_needed, language, region, style, expires_at)
values (auth.uid(), 'Customs', 'Misiones', 2, 'ES', 'EU', 'Chill', now() - interval '1 minute');
insert into public.raid_now_posts (profile_id, map, objective, players_needed, language, region, style, game_mode)
values (auth.uid(), 'Woods', 'Misiones', 2, 'ES', 'EU', 'Chill', 'PvP');
reset role;
select pg_temp.check(
  (select count(*) = 1 from public.raid_now_posts where profile_id = '11111111-1111-4111-8111-111111111111' and closed_at is null),
  'new Raid Now post replaces the expired one'
);
set role authenticated;

-- 6. Responses: others can respond once, owner accepts, match + seeded chat are created.
select pg_temp.as_user('44444444-4444-4444-8444-444444444444');
insert into public.raid_now_responses (post_id, responder_id, message)
select id, auth.uid(), 'Voy con M4 y buen comms' from public.raid_now_posts where map = 'Woods';
select pg_temp.check((select count(*) = 1 from public.raid_now_responses), 'responder sees own response');

select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
do $$
begin
  insert into public.raid_now_responses (post_id, responder_id, status)
  select id, auth.uid(), 'accepted' from public.raid_now_posts where map = 'Woods';
  raise exception 'CHECK FAILED: responder could self-accept';
exception when insufficient_privilege then
  raise notice 'ok - responder cannot insert an accepted response';
end;
$$;

select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select pg_temp.check((select raid_now_responses = 1 from public.get_app_badges()), 'owner badge counts pending response');
select pg_temp.check(
  (select public.decide_post_response('raid_now', id, true) is not null from public.raid_now_responses),
  'owner accepts response and gets a match id'
);
select pg_temp.check((select raid_now_responses = 0 from public.get_app_badges()), 'accepted response clears badge');
select pg_temp.check(
  exists (
    select 1 from public.messages msg
    join public.matches m on m.id = msg.match_id
    where msg.body = 'Voy con M4 y buen comms' and msg.sender_id = '44444444-4444-4444-8444-444444444444'
  ),
  'accepted note seeds the chat'
);
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select pg_temp.check((select count(*) = 0 from public.raid_now_responses), 'third parties cannot read responses');

reset role;
select id as raid_response_id from public.raid_now_responses \gset
select set_config('em.raid_response_id', :'raid_response_id', false);
set role authenticated;
do $$
begin
  perform public.decide_post_response('raid_now', current_setting('em.raid_response_id')::uuid, false);
  raise exception 'CHECK FAILED: non-owner decided a response';
exception when no_data_found then
  raise notice 'ok - non-owner cannot decide responses';
end;
$$;

-- 7. Quest help response + decline.
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
insert into public.quest_help_posts (user_id, quest_name, map, region, language, request_type, game_mode)
values (auth.uid(), 'Shortage', 'Woods', 'EU', 'ES', 'Necesito ayuda', 'PvE');
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
insert into public.quest_help_responses (post_id, responder_id, message)
select id, auth.uid(), 'Te hago de sherpa' from public.quest_help_posts;
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
select pg_temp.check(
  (select public.decide_post_response('quest_help', id, false) is null from public.quest_help_responses),
  'owner can decline a quest help response'
);
select pg_temp.check((select status = 'declined' from public.quest_help_responses), 'declined status stored');

-- 8. Account deletion cascades.
select pg_temp.as_user('44444444-4444-4444-8444-444444444444');
select public.delete_my_account();
reset role;
select pg_temp.check(not exists (select 1 from public.profiles where id = '44444444-4444-4444-8444-444444444444'), 'account deletion removes the profile');
select pg_temp.check(not exists (select 1 from public.raid_now_responses where responder_id = '44444444-4444-4444-8444-444444444444'), 'account deletion removes responses');
