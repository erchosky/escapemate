-- Minimal stand-ins for the Supabase pieces schema.sql relies on (auth, storage, roles, realtime).
-- Only for tests/sql against a disposable local PostgreSQL. Never run this on Supabase.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end;
$$;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;
create schema storage;
grant usage on schema storage to authenticated, anon;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
create function storage.filename(name text) returns text language sql immutable as $$ select (string_to_array(name,'/'))[array_length(string_to_array(name,'/'),1)] $$;
create publication supabase_realtime;

-- Realtime Broadcast stand-ins: broadcast_changes records what would be sent.
create schema realtime;
grant usage on schema realtime to authenticated, anon;
create table realtime.messages (
  id bigserial primary key,
  topic text not null,
  extension text not null,
  event text,
  payload jsonb,
  private boolean default true
);
alter table realtime.messages enable row level security;
grant select on realtime.messages to authenticated;
create function realtime.topic() returns text language sql stable as $$ select nullif(current_setting('realtime.topic', true), '') $$;
create function realtime.broadcast_changes(
  topic_name text,
  event_name text,
  operation text,
  table_name text,
  table_schema text,
  new record,
  old record,
  level text default 'ROW'
) returns void language plpgsql security definer as $$
begin
  insert into realtime.messages (topic, extension, event, payload)
  values (topic_name, 'broadcast', event_name, jsonb_build_object('record', to_jsonb(new), 'operation', operation, 'table', table_name));
end;
$$;
