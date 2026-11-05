-- 기존 프로젝트: SQL Editor에서 한 번 실행합니다.
-- 참여 중인 여행이 있는 Auth 계정 삭제를 트랜잭션 안에서 차단합니다.
begin;
create or replace function public.travel_guard_user_delete()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  lock table public.travel_workspaces in share row exclusive mode;
  if exists(select 1 from public.travel_workspaces where owner=old.id or members @> jsonb_build_array(jsonb_build_object('id',old.id))) then
    raise exception 'TRAVEL_MEMBER_HAS_TRIPS';
  end if;
  return old;
end;
$$;
revoke all on function public.travel_guard_user_delete() from public,anon,authenticated;
drop trigger if exists travel_guard_user_delete on auth.users;
create trigger travel_guard_user_delete before delete on auth.users for each row execute function public.travel_guard_user_delete();
create or replace function public.travel_admin_delete_ready()
returns boolean language sql security definer set search_path=public as $$
 select exists(select 1 from pg_trigger where tgname='travel_guard_user_delete' and tgrelid='auth.users'::regclass and tgenabled='O');
$$;
revoke all on function public.travel_admin_delete_ready() from public,anon,authenticated;
grant execute on function public.travel_admin_delete_ready() to service_role;
commit;
