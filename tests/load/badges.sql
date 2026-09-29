\set n random(1, 50000)
begin;
select set_config('request.jwt.claim.sub', (select id::text from bench_users where n = :n), true);
set local role authenticated;
select * from public.get_app_badges();
commit;
