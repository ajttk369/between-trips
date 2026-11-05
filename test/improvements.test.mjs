import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {createDocument,applyMutation} from '../travel-domain.mjs';
import {travelClock,nextTravelStop} from '../public/domain.js';
import {prepareProposal,selectPlannerChanges,applyPlannerChanges} from '../ai-planner.mjs';
import {createAssistantApi} from '../assistant-api.mjs';
import {cloudFixture} from './fixtures/cloud.mjs';
const meta={name:'두 사람의 여행',country:'일본',city:'도쿄',type:'overseas',start:'2027-01-01',end:'2027-01-03',currency:'JPY'};
const actor={id:randomUUID(),name:'하늘'};
function savedTrip(){
  const doc=createDocument(meta,actor);
  applyMutation(doc,{action:'upsert',collection:'places',value:{name:'테스트 카페',address:'주소',category:'카페',cost:300,currency:'JPY',lat:35,lng:139}},actor);
  for(const date of ['2027-01-01','2027-01-02'])applyMutation(doc,{action:'upsert',collection:'itinerary',value:{placeId:doc.places[0].id,date,startTime:'09:00',duration:60,currency:'JPY'}},actor);
  return doc;
}
test('삭제 범위: 저장 장소만 / 연결 일정 모두 / 한 일정과 저장 장소',()=>{
  let doc=savedTrip(),place=doc.places[0].id;
  applyMutation(doc,{action:'delete',collection:'places',itemId:place},actor);
  assert.equal(doc.places.length,0);assert.equal(doc.itinerary.length,2);assert.ok(doc.itinerary.every(i=>!i.placeId));
  doc=savedTrip();place=doc.places[0].id;
  applyMutation(doc,{action:'delete',collection:'places',itemId:place,deleteLinked:true},actor);
  assert.equal(doc.places.length,0);assert.equal(doc.itinerary.length,0);
  doc=savedTrip();applyMutation(doc,{action:'delete',collection:'itinerary',itemId:doc.itinerary[0].id,deletePlace:true},actor);
  assert.equal(doc.places.length,0);assert.equal(doc.itinerary.length,1);assert.equal(doc.itinerary[0].placeId,'');
  doc=savedTrip();applyMutation(doc,{action:'delete',collection:'itinerary',itemId:doc.itinerary[0].id},actor);
  assert.equal(doc.places.length,1);assert.equal(doc.itinerary.length,1);
});
test('최근 변경은 서버 사용자를 기록하고 개수를 제한하며 가져오기 때 복사하지 않는다',()=>{
  const doc=savedTrip();for(let i=0;i<40;i++)applyMutation(doc,{action:'like',itemId:doc.places[0].id},actor);
  assert.equal(doc.activity.length,30);assert.equal(doc.activity.at(-1).actor,actor.id);assert.equal(doc.activity.at(-1).action,'가고 싶어요 변경');
  const imported=createDocument({import:{...doc,schemaVersion:1}},actor);assert.equal(imported.activity,undefined);
  assert.throws(()=>applyMutation(doc,{action:'delete',collection:'places',itemId:randomUUID()},actor),e=>e.status===404);
});
test('현지 날짜와 다음 일정은 여행 시간대 및 체류 시간을 사용한다',()=>{
  const doc=savedTrip();assert.equal(doc.timeZone,'Asia/Tokyo');
  const instant=new Date('2027-01-01T00:30:00Z'),q=nextTravelStop(doc,instant);
  assert.equal(q.time,'09:30');assert.equal(q.next.name,'테스트 카페');assert.equal(q.during,true);
  assert.equal(travelClock({...doc,timeZone:'Pacific/Honolulu'},instant).date,'2026-12-31');
  assert.equal(nextTravelStop(doc,new Date('2026-12-01T00:00:00Z')).date,meta.start);
  assert.equal(nextTravelStop(doc,new Date('2027-02-01T00:00:00Z')).date,meta.end);
  assert.throws(()=>createDocument({...meta,timeZone:'bad-zone'},actor),e=>e.status===400);
});
const source='https://example.org/venue';
const change=name=>({operation:'add',target:'itinerary',id:'',placeId:'',name,category:'카페',date:'2027-01-02',startTime:'12:00',endTime:'13:00',duration:60,cost:null,currency:'JPY',mode:'walk',address:'주소',note:'',reason:'숙소 근처',sourceUrls:[source]});
const response={output:[{type:'web_search_call',action:{sources:[{url:source,title:'검증용 출처'}]}}]};
test('선택 반영은 서버 초안 ID만 허용하고 확인한 좌표만 연결한다',()=>{
  const trip={...createDocument(meta,actor),version:1,owner:actor.id};
  const {proposal}=prepareProposal({reply:'초안',changes:[change('카페 A'),change('카페 B')]},response,trip);
  const first=proposal.changes[0].changeId;
  const selected=selectPlannerChanges(proposal,{changeIds:[first],locations:[{changeId:first,lat:0,lng:139,address:'확인한 주소'}]});
  applyPlannerChanges(trip,selected,actor);
  assert.equal(trip.itinerary.length,1);assert.equal(trip.places.length,1);assert.equal(trip.places[0].lat,0);assert.equal(trip.places[0].lng,139);assert.equal(trip.places[0].address,'확인한 주소');assert.equal(trip.places[0].costKnown,false);
  for(const body of [{changeIds:[]},{changeIds:['fake']},{changeIds:[first,first]},{changeIds:[first],locations:[{changeId:first,lat:95,lng:0}]},{changeIds:[first],locations:[{changeId:proposal.changes[1].changeId,lat:35,lng:139}]}])assert.throws(()=>selectPlannerChanges(proposal,body),e=>e.status===400);
});
test('AI API 선택 반영과 좌표는 SQL 트랜잭션에 저장되고 다른 제안은 반영되지 않는다',async t=>{
  const fixture=await cloudFixture();t.after(()=>fixture.close());const {user}=await fixture.register('selection@test.local');
  const admin=createClient('https://fixture.supabase.test','test-only-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:fixture.fetchImpl}});
  const {data:trip,error}=await admin.rpc('travel_command',{p_action:'create',p_trip:randomUUID(),p_actor:user.id,p_name:user.name,p_document:createDocument(meta,user)});assert.ifError(error);
  const request=randomUUID();await admin.rpc('travel_ai_command',{p_action:'begin',p_trip:trip.id,p_actor:user.id,p_request:request,p_expected:0,p_message:'두 곳 추천'});
  const result=prepareProposal({reply:'두 곳',changes:[change('카페 A'),change('카페 B')]},response,trip);
  const {data:chat,error:finishError}=await admin.rpc('travel_ai_command',{p_action:'finish',p_trip:trip.id,p_actor:user.id,p_request:request,p_result:result});assert.ifError(finishError);
  const api=createAssistantApi({admin,readBody:async r=>r.body});let saved;
  const first=result.proposal.changes[0].changeId;
  await api({method:'POST',body:{proposalId:result.proposal.id,version:chat.version,changeIds:[first],locations:[{changeId:first,lat:35.68,lng:139.76,address:'확인한 주소'}]}},{},['trips',trip.id,'assistant','apply'],v=>saved=v,trip,user);
  assert.equal(saved.trip.itinerary.length,1);assert.equal(saved.trip.itinerary[0].name,'카페 A');assert.equal(saved.trip.places[0].lat,35.68);assert.equal(saved.conversation.proposal,null);assert.ok(saved.trip.activity.length);
  const stored=(await fixture.db.query('select document from travel_workspaces where id=$1',[trip.id])).rows[0].document;assert.equal(stored.itinerary.length,1);assert.equal(stored.places[0].address,'확인한 주소');
});
