do $$
begin
  if pg_catalog.to_regprocedure('public.aexos_ingest(text,jsonb)') is null then
    raise exception 'EXPECTED_INGEST_FUNCTION_MISSING';
  end if;
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
