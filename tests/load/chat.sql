\set m random(1, 25000)
begin;
select set_config('request.jwt.claim.sub', (select profile_one::text from bench_matches where n = :m), true);
set local role authenticated;
insert into public.messages (match_id, sender_id, body) select id, profile_one, 'gg' from bench_matches where n = :m;
commit;
