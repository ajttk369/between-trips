-- AI 여행 도우미 추가 설정. 기존 여행 테이블을 만든 프로젝트의 SQL Editor에서 실행합니다.
begin;
create table if not exists public.travel_ai_chats (
  trip_id uuid not null references public.travel_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null default 0,
  messages jsonb not null default '[]'::jsonb,
  proposal jsonb,
  pending_request uuid,
  pending_until timestamptz,
  primary key(trip_id,user_id),
  check(jsonb_typeof(messages)='array')
);
create table if not exists public.travel_ai_limits (
  key text primary key,
  requests integer not null default 0,
  expires timestamptz not null
);
alter table public.travel_ai_chats enable row level security;
alter table public.travel_ai_limits enable row level security;
revoke all on public.travel_ai_chats,public.travel_ai_limits from anon,authenticated;
grant select,insert,update,delete on public.travel_ai_chats,public.travel_ai_limits to service_role;

create or replace function public.travel_ai_command(
  p_action text,p_trip uuid,p_actor uuid,p_request uuid default null,p_expected integer default 0,
  p_message text default '',p_result jsonb default null,p_document jsonb default null,
  p_trip_version integer default null,p_daily_limit integer default 30,p_user_limit integer default 10
) returns jsonb language plpgsql security invoker set search_path=public
as $$
declare
  workspace public.travel_workspaces;
  chat public.travel_ai_chats;
  bucket text := to_char(timezone('Asia/Seoul',clock_timestamp()),'YYYY-MM-DD');
  global_key text;
  user_key text;
  global_count integer;
  user_count integer;
  result jsonb;
begin
  -- 모든 작업은 여행 → 본인 대화 → 공통 이용 한도 순서로 잠급니다.
  select * into workspace from public.travel_workspaces where id=p_trip for update;
  if not found or p_actor is null or not workspace.members @> jsonb_build_array(jsonb_build_object('id',p_actor)) then raise exception 'TRAVEL_FORBIDDEN'; end if;
  insert into public.travel_ai_chats(trip_id,user_id) values(p_trip,p_actor) on conflict do nothing;
  select * into chat from public.travel_ai_chats where trip_id=p_trip and user_id=p_actor for update;
  if p_action='begin' then
    if p_trip_version is not null and workspace.version<>p_trip_version then raise exception 'TRAVEL_CONFLICT'; end if;
    if chat.version<>p_expected then raise exception 'AI_CHAT_CONFLICT'; end if;
    if chat.pending_until>now() then raise exception 'AI_BUSY'; end if;
    if char_length(trim(p_message)) not between 1 and 2000 or p_request is null then raise exception 'TRAVEL_INVALID'; end if;
    if p_daily_limit not between 1 and 10000 or p_user_limit not between 1 and 10000 then raise exception 'TRAVEL_INVALID'; end if;
    global_key:='global:'||bucket;user_key:='user:'||p_actor::text||':'||bucket;
    delete from public.travel_ai_limits where expires<now();
    insert into public.travel_ai_limits(key,expires) values(global_key,now()+interval '2 days'),(user_key,now()+interval '2 days') on conflict do nothing;
    select requests into global_count from public.travel_ai_limits where key=global_key for update;
    select requests into user_count from public.travel_ai_limits where key=user_key for update;
    if global_count>=p_daily_limit or user_count>=p_user_limit then raise exception 'AI_LIMIT'; end if;
    update public.travel_ai_limits set requests=requests+1 where key in(global_key,user_key);
    update public.travel_ai_chats set pending_request=p_request,pending_until=now()+interval '90 seconds',version=version+1,
      messages=coalesce((select jsonb_agg(value order by ord) from jsonb_array_elements(messages) with ordinality item(value,ord) where ord>jsonb_array_length(messages)-22),'[]'::jsonb)
        ||jsonb_build_array(jsonb_build_object('role','user','content',p_message,'at',now()))
      where trip_id=p_trip and user_id=p_actor returning * into chat;
  elsif p_action in('finish','fail') then
    if chat.pending_request is distinct from p_request then raise exception 'AI_CHAT_CONFLICT'; end if;
    if p_action='finish' and (jsonb_typeof(p_result) is distinct from 'object' or octet_length(p_result::text)>150000) then raise exception 'TRAVEL_INVALID'; end if;
    update public.travel_ai_chats set pending_request=null,pending_until=null,version=version+1,
      messages=messages||jsonb_build_array(jsonb_build_object('role','assistant','content',left(coalesce(p_result->>'reply',p_message),6000),'at',now())),
      proposal=case when p_action='finish' then nullif(p_result->'proposal','null'::jsonb) else proposal end
      where trip_id=p_trip and user_id=p_actor returning * into chat;
  elsif p_action='apply' then
    if chat.version<>p_expected or chat.proposal->>'id' is distinct from p_request::text then raise exception 'AI_CHAT_CONFLICT'; end if;
    if chat.pending_until>now() then raise exception 'AI_BUSY'; end if;
    if workspace.version is distinct from p_trip_version or (chat.proposal->>'baseVersion')::integer is distinct from p_trip_version then raise exception 'TRAVEL_CONFLICT'; end if;
    if jsonb_typeof(p_document) is distinct from 'object' or octet_length(p_document::text)>2000000 then raise exception 'TRAVEL_INVALID'; end if;
    update public.travel_workspaces set document=p_document,version=version+1,updated=now() where id=p_trip returning * into workspace;
    update public.travel_ai_chats set proposal=null,version=version+1,
      messages=messages||jsonb_build_array(jsonb_build_object('role','assistant','content','변경안을 공동 여행 일정에 반영했어요. 다음 요청은 반영된 일정을 기준으로 이어갈게요.','at',now()))
      where trip_id=p_trip and user_id=p_actor returning * into chat;
  else raise exception 'TRAVEL_INVALID';
  end if;
  result:=jsonb_build_object('version',chat.version,'messages',chat.messages,'proposal',chat.proposal,'pending',coalesce(chat.pending_until>now(),false),'pendingUntil',chat.pending_until);
  if p_action='apply' then
    result:=jsonb_build_object('conversation',result,'trip',workspace.document||jsonb_build_object('id',workspace.id,'owner',workspace.owner,'members',workspace.members,'version',workspace.version,'updated',workspace.updated));
  end if;
  return result;
end;
$$;
revoke all on function public.travel_ai_command(text,uuid,uuid,uuid,integer,text,jsonb,jsonb,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.travel_ai_command(text,uuid,uuid,uuid,integer,text,jsonb,jsonb,integer,integer,integer) to service_role;
commit;
