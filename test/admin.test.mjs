import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync} from 'node:fs';
import {once} from 'node:events';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {createApp} from '../server.mjs';
import {createCloudAdminStore} from '../admin-api.mjs';
import {cloudFixture} from './fixtures/cloud.mjs';

test('관리자 전용 인증·권한·회원 변경·비밀번호 재설정·여행 유지·로그인 제한',async t=>{
  const previous={...process.env};Object.assign(process.env,{STORAGE_BACKEND:'sqlite',ADMIN_USERNAME:'admin',ADMIN_PASSWORD:''});delete process.env.VERCEL;delete process.env.PUBLIC_URL;
  mkdirSync('test-output',{recursive:true});const app=createApp({dataDir:mkdtempSync(path.resolve('test-output/admin-'))});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');const base='http://127.0.0.1:'+app.server.address().port;
  t.after(()=>{app.close();for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);});
  function client(){let cookie='';return async(route,method='GET',body,extra={})=>{const response=await fetch(base+'/api'+route,{method,headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json',...extra},body:body?JSON.stringify(body):undefined});const value=await response.json();if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return {status:response.status,data:value,cookie,headers:response.headers};};}
  const member=client(),admin=client(),outsider=client();const account=(await member('/auth/register','POST',{name:'기존 이름',email:'old@admin.test',password:'original-password-123'})).data.user;
  const trip=(await member('/trips','POST',{name:'보존할 여행',country:'일본',city:'도쿄',start:'2027-01-01',end:'2027-01-03'})).data;
  assert.equal((await member('/admin/users')).status,503);process.env.ADMIN_PASSWORD='1234';
  assert.equal((await member('/admin/users')).status,401);assert.equal((await outsider('/admin/login','POST',{username:'admin',password:'1234'},{Origin:'https://other.example'})).status,403);
  const login=await admin('/admin/login','POST',{username:'admin',password:'1234'});assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/HttpOnly; SameSite=Strict; Path=\/api\/admin/);const savedCookie=login.cookie;
  const list=(await admin('/admin/users')).data;assert.equal(list.users.length,1);let user=list.users[0];assert.equal(user.id,account.id);assert.ok(!JSON.stringify(list).includes('password'));assert.ok(!JSON.stringify(list).includes('original-password'));
  const invalid=await admin('/admin/users/'+user.id,'PATCH',{name:'새 이름',email:'new@admin.test',password:'1234',revision:user.revision});assert.equal(invalid.status,400);
  const updated=await admin('/admin/users/'+user.id,'PATCH',{name:'새 이름',email:'new@admin.test',password:'new-password-12345',revision:user.revision});assert.equal(updated.status,200);assert.equal(updated.data.user.id,account.id);assert.equal(updated.data.user.name,'새 이름');assert.equal(updated.data.user.email,'new@admin.test');assert.ok(!JSON.stringify(updated.data).includes('new-password'));
  assert.equal(app.db.prepare('SELECT name FROM users WHERE id=?').get(account.id).name,'새 이름');assert.notEqual(app.db.prepare('SELECT password FROM users WHERE id=?').get(account.id).password,'new-password-12345');
  assert.equal((await member('/auth')).data.user,null);assert.equal((await member('/auth/login','POST',{email:'old@admin.test',password:'original-password-123'})).status,401);assert.equal((await member('/auth/login','POST',{email:'new@admin.test',password:'new-password-12345'})).status,200);
  const kept=(await member('/trips/'+trip.id)).data;assert.equal(kept.name,'보존할 여행');assert.equal(kept.members[0].id,account.id);assert.equal(kept.members[0].name,'새 이름');assert.ok(kept.version>trip.version);
  assert.equal((await admin('/admin/users/'+user.id,'PATCH',{name:'되돌리기',email:'old@admin.test',revision:user.revision})).status,409);
  assert.equal((await admin('/admin/users/'+randomUUID(),'PATCH',{name:'다른 앱',email:'other@admin.test',revision:user.revision})).status,404);
  await admin('/admin/logout','POST',{});assert.equal((await outsider('/admin/users','GET',null,{Cookie:savedCookie})).status,401);
  for(let i=0;i<5;i++)assert.equal((await admin('/admin/login','POST',{username:'admin',password:'wrong'})).status,401);assert.equal((await admin('/admin/login','POST',{username:'admin',password:'1234'})).status,429);
  const config=JSON.stringify((await member('/config')).data);assert.ok(!config.includes('ADMIN_PASSWORD'));assert.ok(!config.includes('1234'));
});

test('Supabase 관리자는 여행 프로필만 다루고 이름 변경은 동행 편집을 보존하며 반영한다',async t=>{
  const fixture=await cloudFixture();t.after(()=>fixture.close());const registered=await fixture.register('travel@admin.test','여행 회원'),actor=registered.actor;
  actor.user_metadata.preference='보존';actor.updated_at='2026-01-01T00:00:00Z';actor.email_confirmed_at='2026-01-01T00:00:00Z';
  const outside=randomUUID();await fixture.db.query('insert into auth.users values($1)',[outside]);const authCalls=[],users=new Map([[actor.id,actor]]);let conflicted=false;
  const fetchImpl=async(input,init={})=>{
    const url=new URL(String(input)),headers=new Headers(init.headers),method=init.method||'GET',body=init.body?JSON.parse(init.body):{};
    const response=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
    if(url.pathname==='/rest/v1/travel_profiles'&&method==='GET'&&url.searchParams.has('offset')){assert.equal(url.searchParams.get('offset'),'0');url.searchParams.delete('offset');return fixture.fetchImpl(url.toString(),init);}
    if(url.pathname.startsWith('/auth/v1/admin/users/')){assert.equal(headers.get('Authorization'),'Bearer server-only-admin-test');const id=url.pathname.split('/').at(-1);authCalls.push({id,method,body});assert.notEqual(id,outside);const user=users.get(id);if(method==='PUT'){Object.assign(user,{email:body.email,user_metadata:body.user_metadata,updated_at:new Date().toISOString()});}return response({user});}
    if(url.pathname==='/rest/v1/travel_workspaces'&&method==='PATCH'){
      const id=url.searchParams.get('id').slice(3),version=Number(url.searchParams.get('version').slice(3));
      if(!conflicted){conflicted=true;await fixture.db.query("update travel_workspaces set version=version+1,document=jsonb_set(document,'{note}','\"동행이 방금 저장\"') where id=$1",[id]);return response([]);}
      const result=await fixture.db.query('update travel_workspaces set members=$1::jsonb,version=$2,updated=$3 where id=$4 and version=$5 returning id',[JSON.stringify(body.members),body.version,body.updated,id,version]);return response(result.rows);
    }
    return fixture.fetchImpl(input,init);
  };
  const client=createClient('https://admin-fixture.supabase.test','server-only-admin-test',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:fetchImpl}});
  const tripId=randomUUID();await client.rpc('travel_command',{p_action:'create',p_trip:tripId,p_actor:actor.id,p_name:'여행 회원',p_document:{name:'여행',note:'원래 메모'}});
  const store=createCloudAdminStore(client),list=await store.list(0);assert.equal(list.users.length,1);assert.equal(await store.get(outside),null);
  const updated=await store.update(actor.id,{name:'새 여행 이름',email:'changed@admin.test',password:'new-password-12345'});
  assert.equal(updated.name,'새 여행 이름');assert.equal(updated.email,'changed@admin.test');assert.ok(!JSON.stringify(updated).includes('password'));assert.equal(actor.user_metadata.preference,'보존');
  const put=authCalls.find(call=>call.method==='PUT');assert.equal(put.body.password,'new-password-12345');assert.equal(put.body.email_confirm,true);
  const row=(await fixture.db.query('select * from travel_workspaces where id=$1',[tripId])).rows[0];assert.equal(row.members[0].name,'새 여행 이름');assert.equal(row.document.note,'동행이 방금 저장');assert.equal(row.version,3);
});
