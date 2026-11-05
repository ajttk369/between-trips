import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server.mjs';
import { daysBetween, distance, converted, budgetOf, itineraryWarnings } from '../public/domain.js';

const empty = { places:[], itinerary:[], stays:[], reservations:[], tasks:[], expenses:[], rates:{KRW:1}, members:[] };
const meta = { name:'테스트 여행',type:'overseas',country:'일본',city:'도쿄',start:'2027-01-10',end:'2027-01-13',currency:'JPY',rates:{KRW:1,JPY:9},budget:100000 };

test('날짜·직선거리·미입력 환율을 명확하게 구분한다',()=>{
  assert.deepEqual(daysBetween('2028-02-28','2028-03-01'),['2028-02-28','2028-02-29','2028-03-01']);
  assert.equal(distance({lat:null,lng:null},{lat:35,lng:139}),null);
  assert.equal(distance({lat:35,lng:139},{lat:35,lng:139}),0);
  assert.ok(distance({lat:35,lng:139},{lat:36,lng:139})>110000);
  assert.equal(converted(1000,'JPY',{}),null);
  assert.equal(converted(1000,'JPY',{JPY:9}),9000);
});
test('숙소 중복·취소·후보·연결 지출을 제외해 비용과 정산을 계산한다',()=>{
  const trip={...empty,owner:'a',members:[{id:'a'},{id:'b'}],rates:{KRW:1,JPY:9},currency:'JPY',budget:100000,
    stays:[{id:'s',status:'예약 완료',cost:10000,currency:'JPY',paid:true,payer:'a',share:50,checkIn:'2027-01-10'},{id:'c',status:'후보',cost:20000,currency:'JPY'},{id:'x',status:'취소',cost:40000,currency:'JPY'}],
    itinerary:[{id:'i',category:'숙소',cost:10000,currency:'JPY'},{id:'f',category:'식사',cost:1000,currency:'JPY'}],
    expenses:[{id:'e',sourceId:'s',amount:9000,currency:'JPY',payer:'b',share:50,category:'숙소',date:'2027-01-10'}]};
  const b=budgetOf(trip);assert.equal(b.planned,99000);assert.equal(b.spent,81000);assert.equal(b.actual.length,1);assert.equal(b.settlement,-40500);
});
test('이동 시간과 일정 겹침을 검사한다',()=>{
  const items=[{id:'a',name:'관광',startTime:'10:00',duration:60},{id:'b',name:'식사',startTime:'11:10',mode:'walk'}];
  assert.equal(itineraryWarnings(items,empty).length,0);
  assert.equal(itineraryWarnings(items,empty,{'a:b:walk':1200}).length,1);
});

test('두 계정 공동 편집·충돌·권한·초대 취소·재시작 저장 전체 흐름', async t=>{
  const parent=path.resolve('test-output');
  const { mkdirSync }=await import('node:fs');mkdirSync(parent,{recursive:true});
  const dataDir=mkdtempSync(path.join(parent,'integration-'));
  let app=createApp({dataDir});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
  let base=`http://127.0.0.1:${app.server.address().port}`;
  t.after(()=>app.close());
  function client(){let cookie='';return async(route,method='GET',body)=>{
    const res=await fetch(base+'/api'+route,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
    if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];
    return {status:res.status,data:await res.json(),cookie};
  };}
  const a=client(),b=client(),stranger=client();
  const ua=(await a('/auth/register','POST',{name:'하늘',email:'a@test.local',password:'password123!'})).data.user;
  const ub=(await b('/auth/register','POST',{name:'바다',email:'b@test.local',password:'password123!'})).data.user;
  await stranger('/auth/register','POST',{name:'다른 사람',email:'c@test.local',password:'password123!'});
  let trip=(await a('/trips','POST',meta)).data;const id=trip.id;
  assert.equal((await stranger(`/trips/${id}`)).status,403);
  assert.equal((await b(`/trips/${id}`)).status,403);
  let inv=(await a(`/trips/${id}/invites`,'POST',{})).data;
  await a(`/trips/${id}/invites/${inv.id}`,'DELETE',{});
  assert.equal((await b('/join','POST',{code:inv.code})).status,404);
  inv=(await a(`/trips/${id}/invites`,'POST',{})).data;
  trip=(await b('/join','POST',{code:inv.code})).data;
  assert.equal(trip.members.length,2);
  assert.equal((await stranger('/join','POST',{code:inv.code})).status,404);
  const initial=trip.version;
  let result=await b(`/trips/${id}`,'PATCH',{version:initial,action:'upsert',collection:'places',value:{name:'센소지',address:'도쿄',lat:35.7148,lng:139.7967,currency:'JPY',cost:1000,createdBy:ua.id}});
  assert.equal(result.status,200);trip=result.data;const p=trip.places[0];assert.equal(p.createdBy,ub.id);
  assert.equal((await a(`/trips/${id}`,'PATCH',{version:initial,action:'meta',value:{...meta,name:'덮어쓰기'}})).status,409);
  assert.equal((await a(`/trips/${id}`)).data.name,meta.name);
  assert.equal((await a(`/trips/${id}`,'PATCH',{version:trip.version,action:'upsert',collection:'places',value:{name:'센소지',address:'도쿄'}})).status,409);
  trip=(await a(`/trips/${id}`,'PATCH',{version:trip.version,action:'like',itemId:p.id})).data;
  trip=(await b(`/trips/${id}`,'PATCH',{version:trip.version,action:'like',itemId:p.id})).data;
  assert.equal(trip.places[0].likes.length,2);
  trip=(await b(`/trips/${id}`,'PATCH',{version:trip.version,action:'comment',itemId:p.id,value:'아침에 가자!'})).data;
  assert.equal(trip.places[0].comments[0].author,ub.id);
  trip=(await a(`/trips/${id}`,'PATCH',{version:trip.version,action:'upsert',collection:'stays',value:{name:'테스트 숙소',checkIn:'2027-01-10',checkOut:'2027-01-13',status:'예약 완료',cost:30000,currency:'JPY',lat:35.68,lng:139.76}})).data;
  const sid=trip.stays[0].id;
  trip=(await a(`/trips/${id}`,'PATCH',{version:trip.version,action:'upsert',collection:'itinerary',value:{placeId:p.id,date:'2027-01-11',startTime:'10:00',endTime:'11:00',currency:'JPY',cost:1000}})).data;
  trip=(await a(`/trips/${id}`,'PATCH',{version:trip.version,action:'stayDay',stayId:sid,date:'2027-01-11'})).data;
  assert.equal(trip.itinerary.length,3);
  assert.equal(budgetOf(trip).planned,279000);
  assert.equal((await a(`/trips/${id}`,'PATCH',{version:trip.version,action:'upsert',collection:'itinerary',value:{name:'틀린 시간',date:'2027-01-11',startTime:'12:00',endTime:'10:00'}})).status,400);
  trip=(await a(`/trips/${id}`,'PATCH',{version:trip.version,action:'meta',value:{...trip,end:'2027-01-10'}})).data;
  assert.equal(trip.itinerary.length,3,'기간을 줄여도 일정 보존');
  assert.equal((await a(`/trips/${id}`,'PATCH',{version:trip.version,action:'upsert',collection:'itinerary',value:{name:'틀린 날짜',date:'2027-02-30'}})).status,400);
  assert.equal((await a(`/trips/${id}`,'PATCH',{version:trip.version,action:'upsert',collection:'places',value:{name:'위험 링크',link:'javascript:alert(1)'}})).status,400);
  const cookie=(await a('/auth')).cookie;
  const abort=new AbortController();const sse=await fetch(base+`/api/trips/${id}/events`,{headers:{Cookie:cookie},signal:abort.signal});const reader=sse.body.getReader();
  assert.match(new TextDecoder().decode((await reader.read()).value),/event: ready/);
  trip=(await b(`/trips/${id}`,'PATCH',{version:trip.version,action:'upsert',collection:'tasks',value:{name:'여권 확인',category:'할 일'}})).data;
  const event=await Promise.race([reader.read(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('SSE 알림 시간 초과')),2500).unref())]);
  assert.match(new TextDecoder().decode(event.value),/event: change/);abort.abort();
  const exported=(await a(`/trips/${id}/export`)).data;
  const imported=(await a('/trips','POST',{import:exported})).data;
  assert.equal(imported.places.length,1);assert.notEqual(imported.places[0].id,p.id);assert.equal(imported.members.length,1);assert.equal(imported.places[0].likes.length,0);
  assert.equal(imported.itinerary.find(i=>i.category!=='숙소').placeId,imported.places[0].id);
  trip=(await a(`/trips/${id}/members/${ub.id}`,'DELETE',{})).data;
  assert.equal(trip.members.length,1);assert.equal((await b(`/trips/${id}`)).status,403);
  assert.equal((await b(`/trips/${id}`,'PATCH',{version:trip.version,action:'like',itemId:p.id})).status,403);
  app.close();await once(app.server,'close');
  app=createApp({dataDir});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');base=`http://127.0.0.1:${app.server.address().port}`;
  assert.equal((await a(`/trips/${id}`)).data.tasks[0].name,'여권 확인','재시작 후 데이터와 세션 유지');
  assert.equal((await a('/search?q=도쿄')).data.configured,false);
  assert.equal((await a('/route','POST',{mode:'transit'})).data.available,false);
  const outsiderRes=await fetch(base+`/api/trips/${id}`,{method:'DELETE',headers:{Cookie:cookie,Origin:'https://other.example','Content-Type':'application/json'},body:'{}'});
  assert.equal(outsiderRes.status,403);
  assert.equal((await a(`/trips/${id}`,'DELETE',{})).status,200);
  assert.equal((await a(`/trips/${id}`)).status,403);
});
