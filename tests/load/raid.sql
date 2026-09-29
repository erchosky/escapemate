\set n random(1, 50000)
begin;
select set_config('request.jwt.claim.sub', (select id::text from bench_users where n = :n), true);
set local role authenticated;
select count(*) from (select id from public.raid_now_posts where closed_at is null and expires_at > now() order by created_at desc limit 50) x;
commit;
