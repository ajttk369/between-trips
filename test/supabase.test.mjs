import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createDocument, applyMutation } from '../travel-domain.mjs';
import { createCloudApi } from '../supabase-api.mjs';

const metadata={name:'우리의 일본 여행',type:'overseas',country:'일본',city:'도쿄',start:'2027-01-01',end:'2027-01-04',currency:'JPY'};
const hash=s=>createHash('sha256').update(s).digest('hex');
const send=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});

test('Supabase SQL의 권한·초대·버전 충돌을 실제 PostgreSQL 엔진에서 검증',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create table public.analyses(id integer primary key, note text); insert into analyses values(1,\'포폴 기록 보존\');');
  const schema=readFileSync(new URL('../supabase/schema.sql',import.meta.url),'utf8');
  await db.exec(schema);await db.exec(schema);
  const users=[{id:randomUUID(),name:'하늘'},{id:randomUUID(),name:'바다'},{id:randomUUID(),name:'다른 사람'}];
  for(const user of users){await db.query('insert into auth.users values($1)',[user.id]);await db.query('insert into travel_profiles values($1,$2)',[user.id,user.name]);}
  await db.exec('set role authenticated;');
  await assert.rejects(db.query('select * from public.travel_workspaces'),/permission denied/);
  await assert.rejects(db.query('select public.travel_command($1,$2)', ['create',users[0].id]),/permission denied/);
  await db.exec('reset role;set role service_role;');
  const call=async(action,actor,args={})=>{
    const params={p_action:action,p_actor:actor.id,p_name:actor.name,...args};const keys=Object.keys(params);
    return (await db.query(`select public.travel_command(${keys.map((k,i)=>`${k} => $${i+1}`).join(',')}) result`,Object.values(params))).rows[0].result;
  };
  let trip=await call('create',users[0],{p_trip:randomUUID(),p_document:createDocument(metadata,users[0])});
  const inviteId=randomUUID(),code='a'.repeat(48);
  await call('invite',users[0],{p_trip:trip.id,p_invite:inviteId,p_token:hash(code)});
  await assert.rejects(call('revoke',users[2],{p_trip:trip.id,p_invite:inviteId}),/TRAVEL_FORBIDDEN/);
  trip=await call('join',users[1],{p_token:hash(code)});assert.equal(trip.members.length,2);
  await assert.rejects(call('join',users[2],{p_token:hash(code)}),/TRAVEL_INVITE_EXPIRED/);
  const base=trip.version;
  trip=await call('save',users[1],{p_trip:trip.id,p_version:base,p_document:{...createDocument(metadata,users[0]),note:'함께 저장'}});
  await assert.rejects(call('save',users[0],{p_trip:trip.id,p_version:base,p_document:{}}),/TRAVEL_CONFLICT/);
  await assert.rejects(call('save',users[2],{p_trip:trip.id,p_version:trip.version,p_document:{}}),/TRAVEL_FORBIDDEN/);
  await assert.rejects(call('delete',users[1],{p_trip:trip.id}),/TRAVEL_FORBIDDEN/);
  trip=await call('remove',users[0],{p_trip:trip.id,p_member:users[1].id});assert.equal(trip.members.length,1);
  await assert.rejects(call('save',users[1],{p_trip:trip.id,p_version:trip.version,p_document:{}}),/TRAVEL_FORBIDDEN/);
  const secondCode=hash('b'.repeat(48)),secondId=randomUUID();
  await call('invite',users[0],{p_trip:trip.id,p_invite:secondId,p_token:secondCode});
  await call('revoke',users[0],{p_trip:trip.id,p_invite:secondId});
  await assert.rejects(call('join',users[1],{p_token:secondCode}),/TRAVEL_INVITE_EXPIRED/);
  await call('delete',users[0],{p_trip:trip.id});
  await db.exec('reset role;');assert.equal((await db.query('select note from analyses')).rows[0].note,'포폴 기록 보존');
});

test('Supabase Auth 이메일 인증·서버 쿠키·키 비노출·장애 시 로컬 전환 차단',async()=>{
  const actor={id:randomUUID(),email:'cloud@example.test',user_metadata:{name:'클라우드 여행자'}};
  const jwt=`${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.signature`;
  const session={user:actor,access_token:jwt,refresh_token:'test-refresh-token',expires_in:3600,token_type:'bearer'};
  let signupConfirmed=false,down=false;const calls=[];
  const fakeFetch=async(input,init={})=>{
    const url=new URL(String(input));calls.push({path:url.pathname,headers:init.headers});
    if(down)return send({code:'PGRST000',message:'upstream down'},503);
    if(url.pathname==='/rest/v1/travel_workspaces')return send([]);
    if(url.pathname==='/rest/v1/travel_profiles')return send(null,201);
    if(url.pathname==='/auth/v1/signup')return signupConfirmed?send(session):send(actor);
    if(url.pathname==='/auth/v1/token')return send(session);
    if(url.pathname==='/auth/v1/user')return send(actor);
    throw Error('Unexpected mocked endpoint '+url.pathname);
  };
  const config={search:false,currencies:['KRW','JPY']};
  const make=()=>createCloudApi({url:'https://test.supabase.co',key:'test-server-only-secret',fetchImpl:fakeFetch,config,readBody:async req=>req.testBody});
  let api=make();
  const invoke=async(path,body,cookie='')=>{
    const req={method:body?'POST':'GET',headers:{cookie},socket:{remoteAddress:'127.0.0.1'},testBody:body};
    const res={headers:{},setHeader(k,v){this.headers[k]=v;},writeHead(status,headers){this.status=status;Object.assign(this.headers,headers);},end(body){this.body=body;}};
    await api.handle(req,res,new URL('https://travel.test/api'+path));return {status:res.status,data:JSON.parse(res.body),headers:res.headers};
  };
  const pending=await invoke('/auth/register',{name:'하늘',email:actor.email,password:'long-password-2026'});
  assert.equal(pending.data.confirmationRequired,true);assert.equal(pending.data.user,null);assert.equal(pending.headers['Set-Cookie'],undefined);
  signupConfirmed=true;
  const signed=await invoke('/auth/login',{email:actor.email,password:'long-password-2026'});
  assert.equal(signed.data.user.id,actor.id);assert.equal(signed.data.access_token,undefined);
  assert.equal(signed.headers['Set-Cookie'].length,2);assert.ok(signed.headers['Set-Cookie'].every(x=>x.includes('HttpOnly')&&x.includes('SameSite=Lax')));
  const cookie=signed.headers['Set-Cookie'].map(x=>x.split(';')[0]).join('; ');
  const me=await invoke('/auth',undefined,cookie);assert.equal(me.data.user.name,'클라우드 여행자');
  const c=await invoke('/config');assert.equal(c.data.storage,'supabase');assert.equal(JSON.stringify(c.data).includes('test-server-only-secret'),false);
  assert.ok(calls.some(x=>x.path==='/auth/v1/user'),'로그인 검증은 getUser로 서버에서 수행');
  down=true;api=make();
  await assert.rejects(invoke('/auth/login',{email:actor.email,password:'long-password-2026'}),e=>e.status===503);
});

test('클라우드와 로컬이 동일한 입력 검증·비용 보존 로직을 사용한다',()=>{
  const user={id:randomUUID()},doc=createDocument(metadata,user);
  applyMutation(doc,{action:'upsert',collection:'places',value:{name:'센소지',lat:35.71,lng:139.79,currency:'JPY'}},user);
  applyMutation(doc,{action:'upsert',collection:'itinerary',value:{placeId:doc.places[0].id,date:'2027-01-03',startTime:'10:00'}},user);
  applyMutation(doc,{action:'meta',value:{...doc,end:'2027-01-01'}},user);
  assert.equal(doc.itinerary.length,1);
  assert.throws(()=>applyMutation(doc,{action:'upsert',collection:'places',value:{name:'센소지'}},user),e=>e.status===409);
});

test('로그인 후 여행 목록을 JSONB로 조회하고 다른 사람의 비공개 여행은 제외',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec('create table travel_workspaces(id uuid primary key, owner uuid, document jsonb, members jsonb, version integer default 1, updated timestamptz default now());');
  const actor={id:randomUUID(),email:'traveler@example.test',user_metadata:{name:'여행자'}},other=randomUUID();
  const ownId=randomUUID(),foreignId=randomUUID();
  await db.query('insert into travel_workspaces(id,owner,document,members) values ($1,$2,$3,$4),($5,$6,$7,$8)',[
    ownId,actor.id,{name:'내 여행'},[{id:actor.id,name:'여행자',role:'owner'}],
    foreignId,other,{name:'다른 사람의 비공개 여행'},[{id:other,name:'다른 사람',role:'owner'}]
  ]);
  const token=`${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.signature`;
  let actualFilter;
  const fakeFetch=async(input)=>{
    const url=new URL(String(input));
    if(url.pathname==='/auth/v1/user')return send(actor);
    assert.equal(url.pathname,'/rest/v1/travel_workspaces');
    if(url.searchParams.get('limit')==='0')return send([]);
    actualFilter=url.searchParams.get('members');
    let filter;
    try { filter=JSON.parse(actualFilter.slice(3)); }
    catch { return send({code:'22P02',message:'invalid input syntax for type json'},400); }
    const result=await db.query('select * from travel_workspaces where members @> $1::jsonb order by updated desc',[filter]);
    return send(result.rows);
  };
  const api=createCloudApi({url:'https://test.supabase.co',key:'test-only-key',fetchImpl:fakeFetch,config:{},readBody:async()=>({})});
  const req={method:'GET',headers:{cookie:`travel_sb_access=${token}`},socket:{remoteAddress:'127.0.0.1'}};
  const res={writeHead(status){this.status=status;},end(body){this.data=JSON.parse(body);}};
  await api.handle(req,res,new URL('https://travel.test/api/trips'));
  assert.equal(res.status,200);
  assert.deepEqual(JSON.parse(actualFilter.slice(3)),[{id:actor.id}]);
  assert.deepEqual(res.data.map(x=>x.id),[ownId]);
  await db.query('delete from travel_workspaces where id=$1',[ownId]);
  await api.handle(req,res,new URL('https://travel.test/api/trips'));
  assert.deepEqual(res.data,[],'내 여행이 없으면 빈 목록을 반환한다');
});
