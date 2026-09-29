-- Behaviour added in v1.2: match summaries, unread badges, broadcasts, full Raid Now posts,
-- housekeeping and the pooled swipe RPC.

\set ON_ERROR_STOP 1
set client_min_messages = warning;

insert into auth.users (id) values
  ('a1111111-1111-4111-8111-111111111111'),
  ('b2222222-2222-4222-8222-222222222222'),
  ('c3333333-3333-4333-8333-333333333333');

insert into public.profiles (id, nickname, region, language, spoken_languages, approximate_level, favorite_maps, play_styles, objectives, schedule, game_modes, onboarding_complete) values
  ('a1111111-1111-4111-8111-111111111111', 'Alpha', 'EU', 'ES', '{ES}', 30, '{Customs}', '{Chill}', '{Misiones}', '{Noche}', '{PvP}', true),
  ('b2222222-2222-4222-8222-222222222222', 'Bravo', 'EU', 'ES', '{ES}', 31, '{Customs}', '{Chill}', '{Misiones}', '{Noche}', '{PvP}', true),
  ('c3333333-3333-4333-8333-333333333333', 'Charlie', 'NA', 'EN', '{EN}', 50, '{Factory}', '{PvP}', '{PvP}', '{Tarde}', '{PvP}', true);

insert into public.profile_tarkov_stats (user_id, level, kd, raids, is_public)
values ('b2222222-2222-4222-8222-222222222222', 33, 2.5, 150, true);

insert into public.profile_tarkov_stats (user_id, level, kd, is_public)
values ('c3333333-3333-4333-8333-333333333333', 55, 9.1, false);

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

-- Swipe returns public stats in the same call and hides private ones.
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.check(
  (select has_public_stats and tarkov_level = 33 and tarkov_kd = 2.5 from public.get_swipe_candidates(20) where nickname = 'Bravo'),
  'swipe candidates carry public Tarkov stats'
);
select pg_temp.check(
  (select not has_public_stats and tarkov_level is null from public.get_swipe_candidates(20) where nickname = 'Charlie'),
  'private stats never reach the swipe'
);

-- Players inactive for 60+ days leave the queue.
reset role;
update public.profiles set last_active_at = now() - interval '90 days' where nickname = 'Charlie';
set role authenticated;
select pg_temp.check(
  not exists (select 1 from public.get_swipe_candidates(20) where nickname = 'Charlie'),
  'long-inactive players are not suggested'
);

-- Messages keep the match summary current, mark the sender as read and broadcast.
select public.create_swipe('b2222222-2222-4222-8222-222222222222', 'like');
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select public.create_swipe('a1111111-1111-4111-8111-111111111111', 'like');
select pg_temp.check((select new_matches = 1 from public.get_app_badges()), 'unopened match counts as new');

insert into public.messages (match_id, sender_id, body)
select id, auth.uid(), 'Customs a las 22?' from public.matches;

select pg_temp.check(
  (select last_message_preview = 'Customs a las 22?' and last_message_sender_id = auth.uid() from public.matches),
  'match summary follows the last message'
);
select pg_temp.check((select unread_messages = 0 and new_matches = 0 from public.get_app_badges()), 'sending marks the chat as read for the sender');

select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.check((select unread_messages = 1 from public.get_app_badges()), 'the other player sees one unread conversation');

reset role;
select pg_temp.check(
  (select count(*) = 1 from realtime.messages where topic like 'match:%' and payload -> 'record' ->> 'body' = 'Customs a las 22?'),
  'new messages are broadcast on the match topic'
);
select id as match_id from public.matches \gset
set role authenticated;

select set_config('realtime.topic', 'match:' || :'match_id', false);
select pg_temp.check((select count(*) = 1 from realtime.messages), 'participants may receive the match broadcast');
select pg_temp.as_user('c3333333-3333-4333-8333-333333333333');
select pg_temp.check((select count(*) = 0 from realtime.messages), 'outsiders cannot join the match channel');
select set_config('realtime.topic', 'match:not-a-uuid', false);
select pg_temp.check((select count(*) = 0 from realtime.messages), 'malformed topics are rejected without errors');

-- Raid Now: a full post stops taking requests.
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
insert into public.raid_now_posts (profile_id, map, objective, players_needed, language, region, style)
values (auth.uid(), 'Customs', 'Misiones', 1, 'ES', 'EU', 'Chill');

select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
insert into public.raid_now_responses (post_id, responder_id, message)
select id, auth.uid(), 'voy' from public.raid_now_posts;

select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select public.decide_post_response('raid_now', id, true) from public.raid_now_responses;
select pg_temp.check((select accepted_count = 1 from public.raid_now_posts), 'accepting fills a seat');

select pg_temp.as_user('c3333333-3333-4333-8333-333333333333');
do $$
begin
  insert into public.raid_now_responses (post_id, responder_id)
  select id, auth.uid() from public.raid_now_posts;
  raise exception 'CHECK FAILED: joined a full post';
exception when insufficient_privilege then
  raise notice 'ok - full posts reject new requests';
end;
$$;

-- Housekeeping closes expired content.
reset role;
update public.raid_now_posts set expires_at = now() - interval '1 minute';
insert into public.quest_help_posts (user_id, quest_name, map, region, language, request_type, expires_at)
values ('a1111111-1111-4111-8111-111111111111', 'Debut', 'Customs', 'EU', 'ES', 'Necesito ayuda', now() - interval '1 minute');
select public.cleanup_expired_content();
select pg_temp.check((select closed_at is not null from public.raid_now_posts), 'cleanup closes expired Raid Now posts');
select pg_temp.check((select status = 'Expirada' from public.quest_help_posts), 'cleanup expires Quest Help posts');

-- Only the service role may run housekeeping directly.
set role authenticated;
do $$
begin
  perform public.cleanup_expired_content();
  raise exception 'CHECK FAILED: authenticated users can run cleanup';
exception when insufficient_privilege then
  raise notice 'ok - cleanup is not exposed to players';
end;
$$;
