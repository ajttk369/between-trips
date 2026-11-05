import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {once} from 'node:events';
import vm from 'node:vm';
import {createApp} from '../server.mjs';
import {createDocument,applyMutation} from '../travel-domain.mjs';
import {attachmentBytes,cleanAttachments,attachmentLimit} from '../public/attachment-data.js';
import {offlineSnapshot,offlineDates} from '../public/offline-store.js';

const actor={id:'a',name:'나'},partner={id:'b',name:'동행'};
const meta={name:'여행 도구 테스트',country:'일본',city:'도쿄',type:'overseas',start:'2027-01-01',end:'2027-01-03',currency:'JPY'};
const png={name:'예약.png',type:'image/png',data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jV1sAAAAASUVORK5CYII='};
const pdf=size=>({name:'예약.pdf',type:'application/pdf',data:'data:application/pdf;base64,'+Buffer.concat([Buffer.from('%PDF-'),Buffer.alloc(size-5)]).toString('base64')});
function fixture(){const doc=createDocument(meta,actor);for(const name of ['식당','카페'])applyMutation(doc,{action:'upsert',collection:'places',value:{name,category:'식사',cost:100,currency:'JPY'}},actor);return doc;}
test('여러 장소를 선택 순서대로 한 번에 추가하고 숙소 도착 전으로 배치한다',()=>{
  const doc=fixture();applyMutation(doc,{action:'upsert',collection:'itinerary',value:{name:'숙소',date:meta.start,note:'숙소 도착'}},actor);
  applyMutation(doc,{action:'scheduleMany',placeIds:doc.places.map(p=>p.id),date:meta.start},partner);
  assert.deepEqual(doc.itinerary.map(i=>i.name),['식당','카페','숙소']);assert.equal(doc.itinerary[0].createdBy,partner.id);assert.equal(doc.itinerary[0].startTime,'');assert.equal(doc.itinerary[0].cost,100);
  assert.throws(()=>applyMutation(doc,{action:'scheduleMany',placeIds:doc.places.map(p=>p.id),date:meta.start},actor),/이미 들어간/);
  assert.throws(()=>applyMutation(doc,{action:'scheduleMany',placeIds:[doc.places[0].id],date:'2027-02-01'},actor),/기간/);
});
test('일정 복사는 새 ID와 작성자를 쓰고 이동은 원래 ID·작성자·메모를 보존한다',()=>{
  const doc=fixture();applyMutation(doc,{action:'upsert',collection:'itinerary',value:{placeId:doc.places[0].id,date:meta.start,startTime:'10:00',endTime:'11:00',duration:60,note:'창가 자리',cost:200,currency:'JPY',link:'https://example.com/booking'}},actor);
  const original=structuredClone(doc.itinerary[0]);
  applyMutation(doc,{action:'transferItinerary',itemId:original.id,date:'2027-01-02',mode:'copy',clearTimes:true},partner);
  const copy=doc.itinerary[1];assert.notEqual(copy.id,original.id);assert.equal(copy.createdBy,partner.id);assert.equal(copy.startTime,'');assert.equal(copy.endTime,'');assert.equal(copy.duration,60);assert.equal(copy.note,original.note);assert.equal(copy.link,original.link);assert.equal(copy.cost,200);
  applyMutation(doc,{action:'transferItinerary',itemId:original.id,date:'2027-01-03',mode:'move'},partner);
  const moved=doc.itinerary.find(i=>i.id===original.id);assert.equal(moved.createdBy,actor.id);assert.equal(moved.startTime,'10:00');assert.equal(doc.itinerary.length,2);
  assert.throws(()=>applyMutation(doc,{action:'transferItinerary',itemId:original.id,date:'2028-01-01',mode:'copy'},actor),/기간/);
});
test('첨부 파일은 형식·실제 헤더·크기·개수와 가져오기 전체 용량을 검사한다',()=>{
  assert.ok(attachmentBytes(png).length>0);assert.equal(cleanAttachments([png])[0].name,'예약.png');
  assert.throws(()=>cleanAttachments([png,png,png]),/최대 2/);
  assert.throws(()=>attachmentBytes({...png,type:'image/jpeg'}),/파일만/);
  assert.throws(()=>attachmentBytes({name:'가짜.png',type:'image/png',data:'data:image/png;base64,'+Buffer.from('<svg onload="alert(1)">').toString('base64')}),/내용과/);
  assert.throws(()=>attachmentBytes(pdf(attachmentLimit+1)),/350KB|파일만/);
  const imported={...meta,schemaVersion:1,stays:[1,2].map(n=>({name:'숙소 '+n,checkIn:meta.start,checkOut:meta.end,attachments:[pdf(300000),pdf(300000)]}))};
  assert.throws(()=>createDocument({import:imported},actor),/합계는 1MB/);
});
test('오프라인 사본은 일정·주소만 담고 예약번호·파일·대화·메모·Google 좌표는 제외한다',()=>{
  const doc=fixture();doc.id='trip';doc.version=3;doc.note='비밀 여행 메모';doc.members=[{id:'a',email:'private@example.com'}];doc.aiChats={secret:'대화 비밀'};
  doc.stays=[{id:'s',name:'숙소',address:'직접 입력한 주소',checkIn:meta.start,checkOut:meta.end,bookingNumber:'SECRET-BOOKING',attachments:[png],lat:35,lng:139,googlePlaceId:'google-id',note:'비밀 메모'}];
  doc.itinerary=[{id:'i',name:'산책',date:meta.start,placeId:'s',note:'비밀 일정 메모'}];
  const snapshot=offlineSnapshot(doc,'a',new Date('2026-11-05T00:00:00Z')),json=JSON.stringify(snapshot);
  assert.equal(snapshot.savedAt,'2026-11-05T00:00:00.000Z');assert.equal(snapshot.stays[0].address,'직접 입력한 주소');assert.equal(snapshot.itinerary[0].name,'산책');
  for(const excluded of ['SECRET-BOOKING','attachments','비밀','private@example','google-id','"lat"','"lng"'])assert.ok(!json.includes(excluded),excluded);
  assert.deepEqual(offlineDates(snapshot),['2027-01-01','2027-01-02','2027-01-03']);
});
test('서비스 워커는 API·외부 지도·인증 응답을 캐시하지 않고 네트워크 단절 시 전용 읽기 화면을 연다',async()=>{
  const handlers={},cached=[];let networkFails=false;
  vm.runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),{URL,self:{location:{origin:'https://travel.test'},addEventListener:(type,fn)=>handlers[type]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{}}},caches:{open:async()=>({addAll:async assets=>cached.push(...assets)}),keys:async()=>[],match:async key=>'CACHED:'+key},fetch:async()=>{if(networkFails)throw Error('offline');return 'NETWORK';}});
  let task;handlers.install({waitUntil:promise=>task=promise});await task;assert.ok(cached.includes('/offline.html'));assert.ok(!cached.some(p=>p.includes('/api/')||p==='/index.html'));
  for(const url of ['https://travel.test/api/trips','https://maps.googleapis.com/test']){let intercepted=false;handlers.fetch({request:{url,method:'GET',mode:'cors'},respondWith:()=>intercepted=true});assert.equal(intercepted,false);}
  networkFails=true;let response;handlers.fetch({request:{url:'https://travel.test/',method:'GET',mode:'navigate'},respondWith:promise=>response=promise});assert.equal(await response,'CACHED:/offline.html');
});
test('공동 API에서 장소 일괄 추가·복사·첨부 공유·충돌 거절·외부인 차단·재시작을 검증한다',async t=>{
  const dataDir=mkdtempSync(path.resolve('test-output/travel-tools-'));let app=createApp({dataDir});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');let base='http://127.0.0.1:'+app.server.address().port;t.after(()=>app.close());
  function client(){let cookie='';return async(route,method='GET',body)=>{const response=await fetch(base+'/api'+route,{method,headers:{'Content-Type':'application/json',Cookie:cookie},body:body?JSON.stringify(body):undefined});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return {status:response.status,data:await response.json()};};}
  const a=client(),b=client(),other=client();for(const [call,name]of [[a,'a'],[b,'b'],[other,'other']])await call('/auth/register','POST',{name,email:name+'@tools.test',password:'password123!'});
  let trip=(await a('/trips','POST',meta)).data;const url='/trips/'+trip.id,invite=(await a(url+'/invites','POST',{})).data;trip=(await b('/join','POST',{code:invite.code})).data;
  for(const name of ['식당','카페'])trip=(await a(url,'PATCH',{version:trip.version,action:'upsert',collection:'places',value:{name,cost:100,currency:'JPY'}})).data;
  const old=trip.version;trip=(await b(url,'PATCH',{version:old,action:'scheduleMany',placeIds:trip.places.map(p=>p.id),date:meta.start})).data;
  assert.equal(trip.itinerary.length,2);assert.equal((await a(url,'PATCH',{version:old,action:'scheduleMany',placeIds:[trip.places[0].id],date:'2027-01-02'})).status,409);
  const before=trip.version;assert.equal((await a(url,'PATCH',{version:before,action:'scheduleMany',placeIds:[trip.places[0].id,'missing'],date:'2027-01-02'})).status,409);assert.equal((await a(url)).data.itinerary.length,2);assert.equal((await a(url)).data.version,before);
  trip=(await a(url,'PATCH',{version:trip.version,action:'transferItinerary',itemId:trip.itinerary[0].id,date:'2027-01-02',mode:'copy',clearTimes:true})).data;assert.equal(trip.itinerary.length,3);
  trip=(await b(url,'PATCH',{version:trip.version,action:'upsert',collection:'reservations',value:{name:'항공 예약',date:meta.start,attachments:[png]}})).data;const booking=trip.reservations[0];assert.equal((await a(url)).data.reservations[0].attachments[0].data,png.data);
  assert.equal((await other(url)).status,403);assert.equal((await other(url+'/export')).status,403);
  trip=(await a(url,'PATCH',{version:trip.version,action:'upsert',collection:'reservations',value:{...booking,name:'수정한 예약',attachments:undefined}})).data;assert.equal(trip.reservations[0].attachments.length,1);
  const exported=(await a(url+'/export')).data;assert.equal(exported.reservations[0].attachments[0].data,png.data);
  await app.close();app=createApp({dataDir});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');base='http://127.0.0.1:'+app.server.address().port;
  const reloaded=(await b(url)).data;assert.equal(reloaded.itinerary.length,3);assert.equal(reloaded.reservations[0].attachments[0].data,png.data);
});
