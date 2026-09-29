-- Final beta hardening: strict persistent rate limits, explicit SECURITY DEFINER grants,
-- latest-message RPC and badge count correction.

create or replace function public.check_rate_limit(
  p_key text,
  p_limit int,
  p_window_seconds int
)
returns table (allowed boolean, remaining int, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  bucket record;
  v_uid text := auth.uid()::text;
  v_limit int;
  v_window_seconds int;
  v_prefix text;
  v_subject text;
  v_uuid_pattern text := '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
begin
  if p_key is null
    or auth.uid() is null
    or char_length(p_key) < 3
    or char_length(p_key) > 140
    or p_limit < 1
    or p_window_seconds < 1
  then
    return query select false, 0, now();
    return;
  end if;

  if p_key = 'swipe:' || v_uid or p_key = 'db:swipe:' || v_uid then
    v_limit := 80;
    v_window_seconds := 60;
  elsif p_key = 'raid-now:create:' || v_uid or p_key = 'db:raid-now:create:' || v_uid then
    v_limit := 6;
    v_window_seconds := 3600;
  elsif p_key = 'quest-help:create:' || v_uid or p_key = 'db:quest-help:create:' || v_uid then
    v_limit := 10;
    v_window_seconds := 3600;
  elsif p_key = 'report:' || v_uid or p_key = 'db:report:' || v_uid then
    v_limit := 5;
    v_window_seconds := 3600;
  elsif p_key = 'block:' || v_uid or p_key = 'db:block:' || v_uid then
    v_limit := 20;
    v_window_seconds := 3600;
  elsif p_key = 'tarkov-sync:' || v_uid or p_key = 'db:tarkov-sync:' || v_uid then
    v_limit := 8;
    v_window_seconds := 3600;
  elsif p_key = 'profile:onboarding:' || v_uid then
    v_limit := 10;
    v_window_seconds := 3600;
  elsif p_key = 'profile:languages:' || v_uid then
    v_limit := 20;
    v_window_seconds := 3600;
  elsif p_key = 'raid-now:close:' || v_uid then
    v_limit := 30;
    v_window_seconds := 3600;
  elsif p_key = 'quest-help:close:' || v_uid then
    v_limit := 30;
    v_window_seconds := 3600;
  elsif p_key = 'admin:report-status:' || v_uid then
    v_limit := 40;
    v_window_seconds := 3600;
  else
    v_prefix := 'message:' || v_uid || ':';
    if left(p_key, char_length(v_prefix)) = v_prefix then
      v_subject := substring(p_key from char_length(v_prefix) + 1);
      if v_subject ~* v_uuid_pattern then
        v_limit := 10;
        v_window_seconds := 60;
      end if;
    end if;

    v_prefix := 'message-history:' || v_uid || ':';
    if v_limit is null and left(p_key, char_length(v_prefix)) = v_prefix then
      v_subject := substring(p_key from char_length(v_prefix) + 1);
      if v_subject ~* v_uuid_pattern then
        v_limit := 30;
        v_window_seconds := 60;
      end if;
    end if;

    v_prefix := 'db:message:' || v_uid || ':';
    if v_limit is null and left(p_key, char_length(v_prefix)) = v_prefix then
      v_subject := substring(p_key from char_length(v_prefix) + 1);
      if v_subject ~* v_uuid_pattern then
        v_limit := 10;
        v_window_seconds := 60;
      end if;
    end if;
  end if;

  if v_limit is null
    or p_limit <> v_limit
    or p_window_seconds <> v_window_seconds
  then
    return query select false, 0, now();
    return;
  end if;

  delete from public.rate_limit_buckets
  where reset_at < now() - interval '1 day';

  insert into public.rate_limit_buckets as buckets (key, count, reset_at, updated_at)
  values (p_key, 1, now() + make_interval(secs => v_window_seconds), now())
  on conflict (key) do update
    set count = case
          when buckets.reset_at <= now() then 1
          else buckets.count + 1
        end,
        reset_at = case
          when buckets.reset_at <= now() then now() + make_interval(secs => v_window_seconds)
          else buckets.reset_at
        end,
        updated_at = now()
  returning buckets.count, buckets.reset_at into bucket;

  return query
  select
    bucket.count <= v_limit,
    greatest(0, v_limit - bucket.count),
    bucket.reset_at;
end;
$$;

create or replace function public.get_latest_match_messages(p_match_ids uuid[])
returns table (match_id uuid, body text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select latest.match_id, latest.body, latest.created_at
  from (
    select
      msg.match_id,
      msg.body,
      msg.created_at,
      row_number() over (partition by msg.match_id order by msg.created_at desc, msg.id desc) as rn
    from public.messages msg
    where msg.match_id = any(coalesce(p_match_ids, '{}'::uuid[]))
      and public.can_access_match(msg.match_id, auth.uid())
  ) latest
  where latest.rn = 1;
$$;

create or replace function public.get_app_badges()
returns table (
  unread_messages int,
  new_matches int,
  quest_help_responses int,
  open_reports int,
  is_admin boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_is_admin boolean;
begin
  if v_user is null then
    return query select 0, 0, 0, 0, false;
    return;
  end if;

  v_is_admin := public.is_admin(v_user);

  return query
  select
    (
      select count(*)::int
      from public.messages msg
      join public.matches m on m.id = msg.match_id
      left join public.match_reads reads
        on reads.match_id = msg.match_id
       and reads.profile_id = v_user
      where v_user in (m.profile_one, m.profile_two)
        and msg.sender_id <> v_user
        and msg.created_at > coalesce(reads.last_read_at, 'epoch'::timestamptz)
        and not public.is_blocked(m.profile_one, m.profile_two)
    ) as unread_messages,
    (
      select count(*)::int
      from public.matches m
      where v_user in (m.profile_one, m.profile_two)
        and m.created_at > now() - interval '7 days'
        and not public.is_blocked(m.profile_one, m.profile_two)
    ) as new_matches,
    (
      select count(*)::int
      from public.quest_help_responses response
      join public.quest_help_posts post on post.id = response.post_id
      where post.user_id = v_user
        and post.status = 'Activa'
        and post.expires_at > now()
        and response.responder_id <> v_user
    ) as quest_help_responses,
    (
      select case
        when v_is_admin then (select count(*)::int from public.reports where status = 'open')
        else 0
      end
    ) as open_reports,
    v_is_admin as is_admin;
end;
$$;

revoke all on function public.is_blocked(uuid, uuid) from public;
revoke all on function public.is_match_participant(uuid, uuid) from public;
revoke all on function public.can_access_match(uuid, uuid) from public;
revoke all on function public.touch_match_activity(uuid) from public;
revoke all on function public.check_rate_limit(text, int, int) from public;
revoke all on function public.is_admin(uuid) from public;
revoke all on function public.get_swipe_candidates(int) from public;
revoke all on function public.get_public_tarkov_stats(uuid[]) from public;
revoke all on function public.create_swipe(uuid, public.swipe_decision) from public;
revoke all on function public.get_app_badges() from public;
revoke all on function public.get_latest_match_messages(uuid[]) from public;
revoke all on function public.touch_updated_at() from public;

grant execute on function public.is_blocked(uuid, uuid) to authenticated;
grant execute on function public.is_match_participant(uuid, uuid) to authenticated;
grant execute on function public.can_access_match(uuid, uuid) to authenticated;
grant execute on function public.touch_match_activity(uuid) to authenticated;
grant execute on function public.check_rate_limit(text, int, int) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.get_swipe_candidates(int) to authenticated;
grant execute on function public.get_public_tarkov_stats(uuid[]) to authenticated;
grant execute on function public.create_swipe(uuid, public.swipe_decision) to authenticated;
grant execute on function public.get_app_badges() to authenticated;
grant execute on function public.get_latest_match_messages(uuid[]) to authenticated;
