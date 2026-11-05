import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDocument,applyMutation} from '../travel-domain.mjs';
import {journeyOverview} from '../public/domain.js';
import {createTaskUpdates} from '../public/task-updates.js';
const actor={id:'one',name:'나'},partner={id:'two',name:'동행'};
function fixture(){const doc={...createDocument({name:'여행',country:'일본',city:'도쿄',start:'2027-01-01',end:'2027-01-03'},actor),id:'trip',version:1};for(const [name,startTime]of [['공항','10:00'],['식당','12:00']])applyMutation(doc,{action:'upsert',collection:'itinerary',value:{name,date:doc.start,startTime,note:'예약 메모',cost:2000,currency:'JPY'}},actor);return doc;}
test('방문 완료·이동 수단만 바꿔도 메모·비용·시간·작성자는 보존되고 완료는 가져오기에도 유지된다',()=>{
 const doc=fixture(),original=structuredClone(doc.itinerary[0]);
 applyMutation(doc,{action:'itineraryDone',itemId:original.id,done:true},partner);
 applyMutation(doc,{action:'itineraryMode',itemId:original.id,mode:'transit'},partner);
 for(const key of ['note','cost','currency','startTime','createdBy'])assert.equal(doc.itinerary[0][key],original[key]);
 assert.equal(doc.itinerary[0].done,true);assert.equal(doc.itinerary[0].mode,'transit');
 const imported=createDocument({import:{...doc,schemaVersion:1}},partner);assert.equal(imported.itinerary[0].done,true);
 const {done,...oldForm}=doc.itinerary[0];applyMutation(doc,{action:'upsert',collection:'itinerary',value:{...oldForm,note:'새 메모'}},partner);assert.equal(doc.itinerary[0].done,true);
 applyMutation(doc,{action:'transferItinerary',mode:'copy',itemId:original.id,date:'2027-01-02'},actor);assert.equal(doc.itinerary.at(-1).done,false);
 applyMutation(doc,{action:'transferItinerary',mode:'move',itemId:original.id,date:'2027-01-03'},actor);assert.equal(doc.itinerary.find(i=>i.id===original.id).done,true);
 assert.throws(()=>applyMutation(doc,{action:'itineraryDone',itemId:original.id,done:'true'},actor),/체크 상태/);
 assert.throws(()=>applyMutation(doc,{action:'itineraryMode',itemId:original.id,mode:'fly'},actor),/이동 수단/);
});
test('여행 중 다음 장소는 완료한 일정을 건너뛴다',()=>{
 const doc=fixture();doc.itinerary[0].done=true;const overview=journeyOverview(doc,new Date('2027-01-01T00:00:00Z'));assert.equal(overview.next.name,'식당');
 doc.itinerary[1].done=true;assert.equal(journeyOverview(doc,new Date('2027-01-01T00:00:00Z')).finished,true);
});
test('완료 체크 충돌 시 동행이 바꾼 메모와 이동 수단을 덮어쓰지 않고 재시도한다',async()=>{
 let doc=fixture(),calls=0,errors=[];const id=doc.itinerary[0].id;
 const updates=createTaskUpdates({collection:'itinerary',action:'itineraryDone',scope:()=>doc.id,getTrip:()=>doc,read:async()=>doc,commit:value=>doc=value,change(){},error:e=>errors.push(e),send:async(_,body)=>{assert.equal(body.action,'itineraryDone');if(!calls++){doc={...doc,version:2,itinerary:doc.itinerary.map(i=>({...i,note:'동행 메모',mode:'transit'}))};throw Object.assign(Error('충돌'),{status:409});}const latest=structuredClone(doc);applyMutation(latest,body,actor);latest.version++;return latest;}});
 updates.toggle(id);assert.equal(updates.value(doc.itinerary[0]),true);await new Promise(resolve=>setImmediate(resolve));assert.equal(doc.itinerary[0].done,true);assert.equal(doc.itinerary[0].note,'동행 메모');assert.equal(doc.itinerary[0].mode,'transit');assert.deepEqual(errors,[]);
});
