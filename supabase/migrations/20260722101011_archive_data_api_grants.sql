-- Supabase stopped exposing new public tables to the Data API by default in 2026.
-- Keep Data API privileges explicit and let RLS decide which rows are accessible.

grant usage on schema public to authenticated, service_role;

revoke all on table
  public.profiles,
  public.profile_contacts,
  public.player_preferences,
  public.profile_tarkov_stats,
  public.quest_help_posts,
  public.quest_help_responses,
  public.profile_tags,
  public.swipes,
  public.matches,
  public.messages,
  public.match_reads,
  public.profile_reviews,
  public.raid_now_posts,
  public.reports,
  public.user_roles,
  public.blocks,
  public.rate_limit_buckets
from anon;

grant select, insert, update on table public.profile_contacts to authenticated;
grant select, insert, update, delete on table public.player_preferences to authenticated;
grant select, insert, update on table public.profile_tarkov_stats to authenticated;
grant select, insert on table public.quest_help_posts to authenticated;
grant select, insert on table public.quest_help_responses to authenticated;
grant select, insert, update, delete on table public.profile_tags to authenticated;
grant select, insert, update on table public.swipes to authenticated;
grant select on table public.matches to authenticated;
grant select, insert on table public.messages to authenticated;
grant select, insert, update on table public.match_reads to authenticated;
grant select, insert on table public.profile_reviews to authenticated;
grant select, insert on table public.raid_now_posts to authenticated;
grant select, insert, update on table public.reports to authenticated;
grant select, insert, update, delete on table public.blocks to authenticated;

revoke all on table public.user_roles, public.rate_limit_buckets from authenticated;

grant select, insert, update, delete on table
  public.profiles,
  public.profile_contacts,
  public.player_preferences,
  public.profile_tarkov_stats,
  public.quest_help_posts,
  public.quest_help_responses,
  public.profile_tags,
  public.swipes,
  public.matches,
  public.messages,
  public.match_reads,
  public.profile_reviews,
  public.raid_now_posts,
  public.reports,
  public.user_roles,
  public.blocks,
  public.rate_limit_buckets
to service_role;
