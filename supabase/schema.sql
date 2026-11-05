-- 여행의 사이: SQL Editor에서 이 파일 전체를 한 번 실행합니다.
-- 포폴분석 테이블과 기존 Auth 설정은 변경하지 않습니다.
begin;
create table if not exists public.travel_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40)
);
create table if not exists public.travel_workspaces (
  id uuid primary key,
  owner uuid not null references auth.users(id),
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  members jsonb not null check (jsonb_typeof(members) = 'array' and jsonb_array_length(members) between 1 and 2),
  version integer not null default 1,
  updated timestamptz not null default now()
);
create index if not exists travel_members_idx on public.travel_workspaces using gin(members jsonb_path_ops);
create table if not exists public.travel_invites (
  id uuid primary key,
  trip_id uuid not null references public.travel_workspaces(id) on delete cascade,
  token text not null unique check (char_length(token) = 64),
  expires bigint not null,
  used boolean not null default false
);
alter table public.travel_profiles enable row level security;
alter table public.travel_workspaces enable row level security;
alter table public.travel_invites enable row level security;
revoke all on public.travel_profiles, public.travel_workspaces, public.travel_invites from anon, authenticated;
grant select, insert, update, delete on public.travel_profiles, public.travel_workspaces, public.travel_invites to service_role;

-- RPC는 서버의 service_role로만 호출할 수 있습니다.
-- 서버는 Supabase Auth로 확인한 사용자 ID만 p_actor에 넣습니다.
create or replace function public.travel_command(
  p_action text, p_actor uuid, p_name text default '', p_trip uuid default null,
  p_version integer default null, p_document jsonb default null,
  p_token text default null, p_invite uuid default null, p_member uuid default null
) returns jsonb
language plpgsql security invoker set search_path = public
as $$
declare
  workspace public.travel_workspaces;
  invitation public.travel_invites;
  now_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000);
begin
  if p_actor is null or not exists(select 1 from public.travel_profiles where id = p_actor) then
    raise exception 'TRAVEL_UNAUTHORIZED';
  end if;
  if p_action = 'create' then
    if jsonb_typeof(p_document) is distinct from 'object' or octet_length(p_document::text) > 2000000 then raise exception 'TRAVEL_INVALID'; end if;
    insert into public.travel_workspaces(id, owner, document, members)
    values(p_trip, p_actor, p_document, jsonb_build_array(jsonb_build_object('id',p_actor,'name',left(p_name,40),'role','owner')))
    returning * into workspace;
  elsif p_action = 'join' then
    select * into invitation from public.travel_invites where token = p_token;
    if not found or invitation.used or invitation.expires <= now_ms then raise exception 'TRAVEL_INVITE_EXPIRED'; end if;
    select * into workspace from public.travel_workspaces where id = invitation.trip_id for update;
    if not found then raise exception 'TRAVEL_NOT_FOUND'; end if;
    -- 소유자의 초대 취소와 같은 잠금 순서를 사용하고 잠금 후 유효성을 재확인합니다.
    select * into invitation from public.travel_invites where token = p_token for update;
    if not found or invitation.used or invitation.expires <= now_ms then raise exception 'TRAVEL_INVITE_EXPIRED'; end if;
    if not workspace.members @> jsonb_build_array(jsonb_build_object('id',p_actor)) then
      if jsonb_array_length(workspace.members) >= 2 then raise exception 'TRAVEL_FULL'; end if;
      update public.travel_workspaces set members = members || jsonb_build_array(jsonb_build_object('id',p_actor,'name',left(p_name,40),'role','editor')),version = version + 1,updated = now()
      where id = workspace.id returning * into workspace;
      update public.travel_invites set used = true where trip_id = workspace.id;
    end if;
  else
    select * into workspace from public.travel_workspaces where id = p_trip for update;
    if not found or not workspace.members @> jsonb_build_array(jsonb_build_object('id',p_actor)) then raise exception 'TRAVEL_FORBIDDEN'; end if;
    if p_action = 'save' then
      if workspace.version is distinct from p_version then raise exception 'TRAVEL_CONFLICT'; end if;
      if jsonb_typeof(p_document) is distinct from 'object' or octet_length(p_document::text) > 2000000 then raise exception 'TRAVEL_INVALID'; end if;
      update public.travel_workspaces set document=p_document,version=version+1,updated=now() where id=p_trip returning * into workspace;
    else
      if workspace.owner <> p_actor then raise exception 'TRAVEL_FORBIDDEN'; end if;
      if p_action = 'delete' then
        delete from public.travel_workspaces where id=p_trip;
        return '{"ok":true}'::jsonb;
      elsif p_action = 'invite' then
        if jsonb_array_length(workspace.members) >= 2 then raise exception 'TRAVEL_FULL'; end if;
        delete from public.travel_invites where trip_id=p_trip;
        insert into public.travel_invites values(p_invite,p_trip,p_token,now_ms+604800000,false) returning * into invitation;
        return jsonb_build_object('id',invitation.id,'expires',invitation.expires);
      elsif p_action = 'revoke' then
        delete from public.travel_invites where id=p_invite and trip_id=p_trip;
        return '{"ok":true}'::jsonb;
      elsif p_action = 'remove' then
        if p_member = p_actor then raise exception 'TRAVEL_OWNER'; end if;
        update public.travel_workspaces set members=(select jsonb_agg(member) from jsonb_array_elements(members) member where member->>'id' <> p_member::text),version=version+1,updated=now() where id=p_trip returning * into workspace;
        delete from public.travel_invites where trip_id=p_trip;
      else raise exception 'TRAVEL_INVALID';
      end if;
    end if;
  end if;
  return workspace.document || jsonb_build_object('id',workspace.id,'owner',workspace.owner,'members',workspace.members,'version',workspace.version,'updated',workspace.updated);
end;
$$;
revoke all on function public.travel_command(text,uuid,text,uuid,integer,jsonb,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.travel_command(text,uuid,text,uuid,integer,jsonb,text,uuid,uuid) to service_role;
commit;
