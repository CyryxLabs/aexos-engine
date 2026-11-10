-- AEX-4.31: additive schema for the separate dashboard project only.
begin;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists aexos_private;
revoke all on schema aexos_private from public, anon;
grant usage on schema aexos_private to authenticated, service_role;

create table public.aexos_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (length(label) between 1 and 64 and label !~ '[[:cntrl:]]'),
  epoch uuid not null default gen_random_uuid(),
  identity_epoch uuid not null default gen_random_uuid(),
  minimum_schema_version integer not null default 2 check (minimum_schema_version in (1,2)),
  created_at timestamptz not null default now()
);
create index aexos_projects_owner on public.aexos_projects(owner_id);
create table aexos_private.tokens (
  project_id uuid primary key references public.aexos_projects(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  last_ingest_at timestamptz,
  last_sequence bigint not null default 0
);
alter table aexos_private.tokens enable row level security;
revoke all on aexos_private.tokens from public, anon, authenticated;
grant all on aexos_private.tokens to service_role;
create table public.aexos_snapshots (
  project_id uuid primary key references public.aexos_projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  epoch uuid not null,
  sequence bigint not null check (sequence > 0),
  observed_at bigint not null,
  received_at timestamptz not null default now(),
  payload jsonb not null check (octet_length(payload::text) <= 262144)
);
create index aexos_snapshots_owner on public.aexos_snapshots(owner_id);
create table public.aexos_events (
  project_id uuid not null references public.aexos_projects(id) on delete cascade,
  event_id text not null check (event_id ~ '^[0-9a-f]{64}$'),
  owner_id uuid not null references auth.users(id) on delete cascade,
  observed_at bigint not null,
  received_at timestamptz not null default now(),
  payload jsonb not null,
  primary key(project_id,event_id)
);
create index aexos_events_owner on public.aexos_events(owner_id);
create index aexos_events_retention on public.aexos_events(project_id,observed_at desc,event_id);

-- Supabase manages auth.sessions with RLS and does not delegate its grants.
-- The existing platform postgres owner is used only inside these fixed,
-- private, search-path-empty functions; no login or new privileged role exists.
create function aexos_private.session_live() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and coalesce((auth.jwt()->>'is_anonymous')::boolean,false) = false
    and exists (select 1 from auth.sessions s where s.user_id=auth.uid()
      and s.id::text=auth.jwt()->>'session_id'
      and (s.not_after is null or s.not_after > now()));
$$;
revoke all on function aexos_private.session_live() from public, anon;
grant execute on function aexos_private.session_live() to authenticated;
create function public.aexos_session_live() returns boolean
language sql stable security invoker set search_path = '' as $$ select aexos_private.session_live(); $$;
revoke all on function public.aexos_session_live() from public, anon;
grant execute on function public.aexos_session_live() to authenticated;

alter table public.aexos_projects enable row level security;
alter table public.aexos_snapshots enable row level security;
alter table public.aexos_events enable row level security;
revoke all on public.aexos_projects,public.aexos_snapshots,public.aexos_events from public,anon,authenticated;
grant select on public.aexos_projects,public.aexos_snapshots,public.aexos_events to authenticated;
grant all on public.aexos_projects,public.aexos_snapshots,public.aexos_events to service_role;
create policy owner_read on public.aexos_projects for select to authenticated
  using (owner_id=(select auth.uid()) and (select aexos_private.session_live()));
create policy owner_read on public.aexos_snapshots for select to authenticated
  using (owner_id=(select auth.uid()) and (select aexos_private.session_live()));
create policy owner_read on public.aexos_events for select to authenticated
  using (owner_id=(select auth.uid()) and (select aexos_private.session_live())
    and observed_at>=extract(epoch from now()-interval '24 hours')*1000);

-- Fixed setup reaches private credential state only after checking the live
-- owner. Request input never selects an owner or constructs SQL.
create function aexos_private.manage_project(p_label text, p_project uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_project public.aexos_projects; v_token text;
begin
  if auth.uid() is null or not aexos_private.session_live() then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  -- Serialize quota and token rotation for this owner, across function instances.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  if p_project is null then
    if p_label is null or length(btrim(p_label)) not between 1 and 64 or p_label ~ '[[:cntrl:]]' then raise exception 'INVALID_LABEL' using errcode='22023'; end if;
    if (select count(*) from public.aexos_projects where owner_id=auth.uid()) >= 100 then raise exception 'PROJECT_LIMIT' using errcode='22023'; end if;
    insert into public.aexos_projects(owner_id,label) values(auth.uid(),btrim(p_label)) returning * into v_project;
  else
    -- Rotation changes no key columns. Keep foreign-key KEY SHARE available
    -- to an ingest that already holds the token row, avoiding a lock cycle.
    select * into v_project from public.aexos_projects where id=p_project and owner_id=auth.uid() for no key update;
    if not found then raise exception 'PROJECT_NOT_FOUND' using errcode='42501'; end if;
    update public.aexos_projects set epoch=gen_random_uuid(),minimum_schema_version=2 where id=p_project returning * into v_project;
  end if;
  v_token := translate(rtrim(encode(extensions.gen_random_bytes(32),'base64'),'='),'+/','-_');
  insert into aexos_private.tokens(project_id,token_hash,expires_at) values(v_project.id,encode(extensions.digest(v_token,'sha256'),'hex'),now()+interval '30 days')
    on conflict(project_id) do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at,last_ingest_at=null,last_sequence=0;
  return jsonb_build_object('id',v_project.id,'label',v_project.label,'epoch',v_project.epoch,'identityEpoch',v_project.identity_epoch,'token',v_token,'expiresAt',now()+interval '30 days');
end;
$$;
revoke all on function aexos_private.manage_project(text,uuid) from public,anon;
grant execute on function aexos_private.manage_project(text,uuid) to authenticated;
create function public.aexos_manage_project(p_label text default null,p_project uuid default null) returns jsonb
language sql security invoker set search_path = '' as $$ select aexos_private.manage_project(p_label,p_project); $$;
revoke all on function public.aexos_manage_project(text,uuid) from public,anon;
grant execute on function public.aexos_manage_project(text,uuid) to authenticated;

-- Only the authenticated Edge service can call this transaction. Token and
-- binding checks also happen here, so a rotation racing ingestion fails closed.
create function public.aexos_ingest(p_token_hash text,p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_token aexos_private.tokens; v_project public.aexos_projects; v_sequence bigint; v_now timestamptz := clock_timestamp();
begin
  select * into v_token from aexos_private.tokens where token_hash=p_token_hash for update;
  if not found or v_token.expires_at<=v_now then raise exception 'INGEST_DENIED' using errcode='28000'; end if;
  select * into v_project from public.aexos_projects where id=v_token.project_id;
  if (p_payload->>'projectId') is distinct from v_project.id::text or (p_payload->>'epoch') is distinct from v_project.epoch::text then raise exception 'INGEST_DENIED' using errcode='28000'; end if;
  if (p_payload->>'schemaVersion') is distinct from '1' and (p_payload->>'schemaVersion') is distinct from '2' then raise exception 'INGEST_DENIED' using errcode='28000'; end if;
  if (p_payload->>'schemaVersion') is distinct from '2' and v_project.minimum_schema_version=2 then raise exception 'INGEST_DENIED' using errcode='28000'; end if;
  if (p_payload->>'schemaVersion')='2' and (p_payload->>'identityEpoch') is distinct from v_project.identity_epoch::text then raise exception 'INGEST_DENIED' using errcode='28000'; end if;
  v_sequence := (p_payload->>'sequence')::bigint;
  if v_sequence<=v_token.last_sequence then raise exception 'OLD_SEQUENCE' using errcode='22023', detail=v_token.last_sequence::text; end if;
  if v_token.last_ingest_at is not null and v_now-v_token.last_ingest_at<interval '4 seconds' then raise exception 'RATE_LIMIT' using errcode='P0001'; end if;
  if octet_length(p_payload::text)>262144 or jsonb_array_length(p_payload->'events')>200 or jsonb_array_length(p_payload->'sessions')>200 then raise exception 'ROW_LIMIT' using errcode='22023'; end if;
  update aexos_private.tokens set last_sequence=v_sequence,last_ingest_at=v_now where project_id=v_project.id;
  insert into public.aexos_snapshots(project_id,owner_id,epoch,sequence,observed_at,received_at,payload)
    values(v_project.id,v_project.owner_id,v_project.epoch,v_sequence,(p_payload->>'observedAt')::bigint,v_now,p_payload)
    on conflict(project_id) do update set owner_id=excluded.owner_id,epoch=excluded.epoch,sequence=excluded.sequence,observed_at=excluded.observed_at,received_at=excluded.received_at,payload=excluded.payload;
  insert into public.aexos_events(project_id,event_id,owner_id,observed_at,received_at,payload)
    select v_project.id,e->>'id',v_project.owner_id,(e->>'timestamp')::bigint,v_now,e from jsonb_array_elements(p_payload->'events') e
    where (e->>'timestamp')::bigint >= extract(epoch from v_now-interval '24 hours')*1000
    on conflict(project_id,event_id) do nothing;
  delete from public.aexos_events where project_id=v_project.id and
    (observed_at<extract(epoch from v_now-interval '24 hours')*1000 or event_id not in
      (select event_id from public.aexos_events where project_id=v_project.id order by observed_at desc,event_id limit 200));
  return jsonb_build_object('accepted',true,'sequence',v_sequence);
end;
$$;
revoke all on function public.aexos_ingest(text,jsonb) from public,anon,authenticated;
grant execute on function public.aexos_ingest(text,jsonb) to service_role;
commit;
