begin;
set local lock_timeout = '5s';
do $$
begin
  if pg_catalog.to_regprocedure('aexos_private.manage_project(text,uuid)') is null or pg_catalog.to_regprocedure('public.aexos_ingest(text,jsonb)') is null then
    raise exception 'EXPECTED_FUNCTION_MISSING';
  end if;
  -- Refuse unknown function, security or grant state before changing the schema.
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid=p.prolang
      where p.oid='aexos_private.manage_project(text,uuid)'::regprocedure and p.prosecdef and l.lanname='plpgsql'
      and pg_catalog.pg_get_userbyid(p.proowner)='postgres' and p.proconfig=array['search_path=""']
      and p.proacl @> array['postgres=X/postgres','authenticated=X/postgres']::aclitem[]
      and p.proacl <@ array['postgres=X/postgres','authenticated=X/postgres']::aclitem[])
    or not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid=p.prolang
      where p.oid='public.aexos_ingest(text,jsonb)'::regprocedure and not p.prosecdef and l.lanname='plpgsql'
      and pg_catalog.pg_get_userbyid(p.proowner)='postgres' and p.proconfig=array['search_path=""']
      and p.proacl @> array['postgres=X/postgres','service_role=X/postgres']::aclitem[]
      and p.proacl <@ array['postgres=X/postgres','service_role=X/postgres']::aclitem[])
    or pg_catalog.has_function_privilege('anon','aexos_private.manage_project(text,uuid)','EXECUTE')
    or not pg_catalog.has_function_privilege('authenticated','aexos_private.manage_project(text,uuid)','EXECUTE')
    or pg_catalog.has_function_privilege('anon','public.aexos_ingest(text,jsonb)','EXECUTE')
    or pg_catalog.has_function_privilege('authenticated','public.aexos_ingest(text,jsonb)','EXECUTE')
    or not pg_catalog.has_function_privilege('service_role','public.aexos_ingest(text,jsonb)','EXECUTE') then
    raise exception 'IDENTITY_PREFLIGHT_FUNCTION_SECURITY_OR_ACL_CHANGED';
  end if;
  if replace((select prosrc from pg_catalog.pg_proc where oid='aexos_private.manage_project(text,uuid)'::regprocedure),chr(13),'') is distinct from $approved_manage$
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
    select * into v_project from public.aexos_projects where id=p_project and owner_id=auth.uid() for update;
    if not found then raise exception 'PROJECT_NOT_FOUND' using errcode='42501'; end if;
    update public.aexos_projects set epoch=gen_random_uuid() where id=p_project returning * into v_project;
  end if;
  v_token := translate(rtrim(encode(extensions.gen_random_bytes(32),'base64'),'='),'+/','-_');
  insert into aexos_private.tokens(project_id,token_hash,expires_at) values(v_project.id,encode(extensions.digest(v_token,'sha256'),'hex'),now()+interval '30 days')
    on conflict(project_id) do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at,last_ingest_at=null,last_sequence=0;
  return jsonb_build_object('id',v_project.id,'label',v_project.label,'epoch',v_project.epoch,'token',v_token,'expiresAt',now()+interval '30 days');
end;
$approved_manage$ then
    raise exception 'IDENTITY_PREFLIGHT_MANAGE_FUNCTION_CHANGED';
  end if;
  if replace((select prosrc from pg_catalog.pg_proc where oid='public.aexos_ingest(text,jsonb)'::regprocedure),chr(13),'') is distinct from $approved_ingest$
declare v_token aexos_private.tokens; v_project public.aexos_projects; v_sequence bigint; v_now timestamptz := clock_timestamp();
begin
  select * into v_token from aexos_private.tokens where token_hash=p_token_hash for update;
  if not found or v_token.expires_at<=v_now then raise exception 'INGEST_DENIED' using errcode='28000'; end if;
  select * into v_project from public.aexos_projects where id=v_token.project_id;
  if (p_payload->>'projectId') is distinct from v_project.id::text or (p_payload->>'epoch') is distinct from v_project.epoch::text then raise exception 'INGEST_DENIED' using errcode='28000'; end if;
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
$approved_ingest$ then
    raise exception 'IDENTITY_PREFLIGHT_INGEST_FUNCTION_CHANGED';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='aexos_projects'
      and column_name in ('identity_epoch','minimum_schema_version')) then
    raise exception 'IDENTITY_EPOCH_RECOVERY_REQUIRES_RECONCILIATION';
  end if;
end;
$$;
alter table public.aexos_projects add column identity_epoch uuid, add column minimum_schema_version integer not null default 1 check (minimum_schema_version in (1,2));
update public.aexos_projects set identity_epoch=epoch;
alter table public.aexos_projects alter column identity_epoch set not null, alter column identity_epoch set default gen_random_uuid(), alter column minimum_schema_version set default 2;
create or replace function aexos_private.manage_project(p_label text, p_project uuid) returns jsonb
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
create or replace function public.aexos_ingest(p_token_hash text,p_payload jsonb) returns jsonb
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
commit;
