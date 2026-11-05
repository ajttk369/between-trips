import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {createDocument,applyMutation} from '../travel-domain.mjs';
import {prepareProposal,applyPlannerChanges,selectPlannerChanges,plannerContext} from '../ai-planner.mjs';
import {defaultChangeIds,initialChangeIds,reviewDifferences} from '../public/assistant-review.js';
import {createAssistantApi} from '../assistant-api.mjs';
import {cloudFixture} from './fixtures/cloud.mjs';
const actor={id:randomUUID(),name:'나'},source='https://example.org/cafe',search={output:[{type:'web_search_call',action:{sources:[{url:source,title:'장소 소개'}]}}]};
const meta={name:'여행',country:'일본',city:'도쿄',start:'2027-01-01',end:'2027-01-04',currency:'JPY'};
const change=(value={})=>({operation:'add',target:'itinerary',id:'',placeId:'',name:'새 카페',category:'카페',date:meta.start,startTime:'12:00',endTime:'13:00',duration:60,cost:null,currency:'JPY',mode:'transit',address:'도쿄 새 주소',note:'AI가 제안한 메모',reason:'추천 이유',sourceUrls:[source],...value});
function fixture(){const doc={...createDocument(meta,actor),owner:actor.id,version:1};applyMutation(doc,{action:'upsert',collection:'places',value:{name:'기존 카페',category:'카페',address:'기존 주소',googlePlaceId:'ChIJ_original',note:'직접 쓴 장소 메모',link:'https://example.org/my-booking',cost:123,currency:'USD'}},actor);applyMutation(doc,{action:'upsert',collection:'itinerary',value:{placeId:doc.places[0].id,date:meta.start,startTime:'10:00',endTime:'11:00',duration:60,note:'직접 쓴 예약 메모',cost:123,currency:'USD',done:true,link:'https://example.org/my-ticket'}},actor);return doc;}
test('AI 시간 수정은 연결 장소·개인 메모·완료·비용·예약 링크를 보존하고 추천 메모를 분리한다',()=>{
 const doc=fixture(),old=structuredClone(doc.itinerary[0]),raw=change({operation:'update',id:old.id,name:old.name,address:'',placeId:'',startTime:'15:00',endTime:'16:00',sourceUrls:[]});
 const {proposal}=prepareProposal({reply:'시간 변경',changes:[raw]},{output:[]},doc);assert.equal(proposal.changes[0].placeId,old.placeId);assert.equal(proposal.changes[0].requiresCompletedConfirmation,true);assert.deepEqual(defaultChangeIds(proposal,doc),[]);
 const diffs=reviewDifferences(proposal.changes[0],doc);assert.deepEqual(diffs.filter(r=>['cost','currency','name'].includes(r.key)),[]);assert.equal(diffs.find(r=>r.key==='startTime').before,'10:00');
 applyPlannerChanges(doc,proposal.changes,{id:randomUUID()});for(const key of ['placeId','note','done','cost','currency','link','createdBy'])assert.equal(doc.itinerary[0][key],old[key]);assert.ok(doc.itinerary[0].aiSuggestion.includes('추천 이유'));assert.equal(doc.itinerary[0].startTime,'15:00');
 const imported=createDocument({import:{...doc,schemaVersion:1}},actor);assert.equal(imported.itinerary[0].aiSuggestion,doc.itinerary[0].aiSuggestion);
});
test('장소 이름·주소를 바꾸면 이전 Google 장소 ID와 좌표를 제거하고 메모·하트는 유지한다',()=>{
 const doc=fixture(),old=doc.places[0];old.likes=['partner'];old.comments=[{text:'후기'}];
 const {proposal}=prepareProposal({reply:'장소 교체',changes:[change({operation:'update',target:'places',id:old.id,name:'다른 카페'})]},search,doc);applyPlannerChanges(doc,proposal.changes,actor);
 const updated=doc.places[0];assert.equal(updated.googlePlaceId,'');assert.equal(updated.lat,null);assert.equal(updated.lng,null);assert.equal(updated.note,old.note);assert.deepEqual(updated.likes,old.likes);assert.deepEqual(updated.comments,old.comments);assert.equal(updated.link,old.link);
 assert.deepEqual(updated.aiSources,[source]);
});
test('삭제·완료 항목은 기본 제외되며 서버도 별도 확인 없이는 반영을 거부한다',()=>{
 const doc=fixture(),c=change({operation:'remove',id:doc.itinerary[0].id}),{proposal}=prepareProposal({reply:'삭제 초안',changes:[c]},search,doc),id=proposal.changes[0].changeId;
 assert.deepEqual(defaultChangeIds(proposal,doc),[]);assert.throws(()=>selectPlannerChanges(proposal,{changeIds:[id]}),/삭제할 항목/);
 assert.deepEqual(initialChangeIds(proposal,doc,{selected:[id],policyVersion:1}),[]);assert.deepEqual(initialChangeIds(proposal,doc,{selected:[id],policyVersion:2}),[id]);
 assert.throws(()=>selectPlannerChanges(proposal,{changeIds:[id],confirmedDeleteIds:[id]}),/방문 완료/);
 assert.equal(selectPlannerChanges(proposal,{changeIds:[id],confirmedDeleteIds:[id],confirmedCompletedIds:[id]}).length,1);assert.equal(doc.itinerary.length,1);
});
test('새 일정이 중간에 삽입되어도 미리보기는 해당 새 항목을 가리키고 중복 추가를 거부한다',()=>{
 const doc=fixture();const {proposal,issues}=prepareProposal({reply:'오전 일정',changes:[change({name:'아침 카페',startTime:'08:00',endTime:'09:00'}),change({name:'아침 카페',startTime:'08:00',endTime:'09:00'})]},search,doc);
 assert.equal(proposal.changes.length,1);assert.equal(proposal.changes[0].after.name,'아침 카페');assert.equal(proposal.changes[0].after.startTime,'08:00');assert.equal(issues.length,1);
 const before=structuredClone(doc);assert.throws(()=>applyPlannerChanges(doc,[proposal.changes[0],{...proposal.changes[0],operation:'update',id:randomUUID()}],actor),/없어졌어요/);assert.deepEqual(doc,before);
});
test('AI가 덧붙인 좌표·완료 상태는 무시하고 새 장소에 다른 장소의 이전 출처를 재사용하지 않는다',()=>{
 const doc=fixture(),first=prepareProposal({reply:'새 장소',changes:[change({confirmedLocation:{lat:1,lng:2},done:true})]},search,doc);
 assert.equal(first.proposal.changes[0].confirmedLocation,undefined);assert.equal(first.proposal.changes[0].after.done,false);
 const second=prepareProposal({reply:'다른 장소',changes:[change({name:'다른 새 카페'})]},{output:[]},doc,first.proposal);assert.equal(second.proposal,null);assert.match(second.issues[0],/출처/);
});
test('선택 날짜와 완료 상태를 우선 전송하고 예약번호·개인 메모는 AI 입력에서 제외한다',()=>{
 const doc=fixture(),selected={...doc.itinerary[0],id:'selected',date:'2027-01-03',done:true};doc.itinerary=[...Array.from({length:200},(_,i)=>({...doc.itinerary[0],id:String(i)})),selected];doc.reservations=Array.from({length:31},(_,i)=>({date:i===30?selected.date:meta.start,category:'기차',bookingNumber:'PRIVATE',note:'비공개 메모'}));
 const context=plannerContext(doc,selected.date);assert.equal(context.itinerary[0].id,'selected');assert.equal(context.itinerary[0].done,true);assert.equal(context.itinerary.length,180);assert.equal(context.reservations[0].date,selected.date);assert.equal(context.contextLimits.itineraryTotal,201);assert.ok(!JSON.stringify(context).includes('PRIVATE'));assert.ok(!JSON.stringify(context).includes('직접 쓴 예약 메모'));
});
test('이전 형식의 제안도 현재 완료 상태를 검사하고 SQL 저장 전에 확인을 요구한다',async t=>{
 const f=await cloudFixture();t.after(()=>f.close());const {user}=await f.register('safety@example.test'),admin=createClient('https://fixture.supabase.test','test-only-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:f.fetchImpl}});
 const document=fixture(),trip=(await admin.rpc('travel_command',{p_action:'create',p_trip:randomUUID(),p_actor:user.id,p_name:user.name,p_document:document})).data;
 const id=trip.itinerary[0].id,proposal=prepareProposal({reply:'시간 변경',changes:[change({operation:'update',id,name:trip.itinerary[0].name,placeId:trip.itinerary[0].placeId,sourceUrls:[]})]},search,trip).proposal;delete proposal.changes[0].requiresCompletedConfirmation;
 const request=randomUUID();let c=(await admin.rpc('travel_ai_command',{p_action:'begin',p_trip:trip.id,p_actor:user.id,p_request:request,p_expected:0,p_message:'시간 변경',p_trip_version:1})).data;
 c=(await admin.rpc('travel_ai_command',{p_action:'finish',p_trip:trip.id,p_actor:user.id,p_request:request,p_result:{reply:'초안',proposal}})).data;
 const api=createAssistantApi({admin,readBody:async req=>req.body}),body={proposalId:proposal.id,version:c.version,changeIds:[proposal.changes[0].changeId]};
 await assert.rejects(api({method:'POST',body},{},['trips',trip.id,'assistant','apply'],()=>{},trip,user),/방문 완료/);
 assert.equal((await f.db.query('select version from travel_workspaces where id=$1',[trip.id])).rows[0].version,1);
 await api({method:'POST',body:{...body,confirmedCompletedIds:body.changeIds}},{},['trips',trip.id,'assistant','apply'],()=>{},trip,user);
 const stored=(await f.db.query('select document from travel_workspaces where id=$1',[trip.id])).rows[0].document;assert.equal(stored.itinerary[0].note,'직접 쓴 예약 메모');assert.equal(stored.itinerary[0].done,true);
});
