import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDocument,applyMutation} from '../travel-domain.mjs';
import {overviewForDay} from '../public/domain.js';
import {readReview,writeReview,removeReview} from '../public/review-state.js';
import {selectPlannerChanges,applyPlannerChanges} from '../ai-planner.mjs';
const actor={id:randomUUID(),name:'나'},partner={id:randomUUID(),name:'동행'};
const meta={name:'도쿄 여행',country:'일본',city:'도쿄',type:'overseas',start:'2027-01-01',end:'2027-01-03',currency:'JPY'};
function fixture(){
  const doc=createDocument(meta,actor);
  applyMutation(doc,{action:'upsert',collection:'places',value:{name:'카페',address:'주소',category:'카페',lat:35.6,lng:139.7}},actor);
  for(const date of ['2027-01-01','2027-01-02'])applyMutation(doc,{action:'upsert',collection:'itinerary',value:{placeId:doc.places[0].id,date,startTime:'12:00',duration:60}},actor);
  applyMutation(doc,{action:'upsert',collection:'stays',value:{name:'첫 숙소',checkIn:meta.start,checkOut:'2027-01-02',status:'예약 완료'}},actor);
  applyMutation(doc,{action:'upsert',collection:'stays',value:{name:'둘째 숙소',checkIn:'2027-01-02',checkOut:meta.end,status:'예약 완료'}},actor);
  return doc;
}
test('선택 날짜 요약은 첫날에 고정되지 않고 그날 숙소·일정을 표시한다',()=>{
  const doc=fixture(),now=new Date('2026-11-05T00:00:00Z');
  assert.equal(overviewForDay(doc,'2027-01-01',now).stay.name,'첫 숙소');
  const second=overviewForDay(doc,'2027-01-02',now);assert.equal(second.stay.name,'둘째 숙소');assert.equal(second.next.date,'2027-01-02');assert.equal(second.during,false);
  assert.equal(overviewForDay(doc,'2027-01-03',now).stay.name,'둘째 숙소');
});
test('삭제 취소는 저장 목록만 / 연결 일정 포함 / 일정과 저장 장소를 원래 ID로 복구한다',()=>{
  for(const scope of ['place','cascade','event','both']){
    const doc=fixture(),before=structuredClone(doc),event=['event','both'].includes(scope);
    applyMutation(doc,{action:'delete',collection:event?'itinerary':'places',itemId:event?doc.itinerary[0].id:doc.places[0].id,deleteLinked:scope==='cascade',deletePlace:scope==='both'},actor);
    const entry=doc.deleted.at(-1);assert.ok(entry);applyMutation(doc,{action:'restore',deletionId:entry.id},actor);
    assert.deepEqual(doc.places,before.places,scope);assert.deepEqual(doc.itinerary,before.itinerary,scope);assert.equal(doc.activity.at(-1).action,'삭제 취소');assert.equal(doc.deleted.length,0);
  }
});
test('삭제 취소는 그 사이 동행이 추가·수정한 기록을 덮어쓰지 않는다',()=>{
  const doc=fixture();applyMutation(doc,{action:'delete',collection:'places',itemId:doc.places[0].id},actor);const entry=doc.deleted.at(-1);
  const event=doc.itinerary[0];applyMutation(doc,{action:'upsert',collection:'itinerary',value:{...event,name:'동행이 고친 이름',note:'다른 곳에서 만나기'}},partner);
  applyMutation(doc,{action:'upsert',collection:'tasks',value:{name:'새 할 일'}},partner);
  applyMutation(doc,{action:'restore',deletionId:entry.id},actor);
  assert.equal(doc.itinerary[0].name,'동행이 고친 이름');assert.equal(doc.itinerary[0].note,'다른 곳에서 만나기');assert.equal(doc.itinerary[0].placeId,'');
  assert.equal(doc.itinerary[1].placeId,doc.places[0].id);assert.equal(doc.tasks[0].name,'새 할 일');
});
test('다른 사람·만료·중복 장소의 삭제 취소를 막는다',()=>{
  let doc=fixture();applyMutation(doc,{action:'delete',collection:'places',itemId:doc.places[0].id},actor);let entry=doc.deleted.at(-1);
  assert.throws(()=>applyMutation(doc,{action:'restore',deletionId:entry.id},partner),e=>e.status===403);
  applyMutation(doc,{action:'upsert',collection:'places',value:{name:'카페',address:'주소',category:'카페'}},actor);
  assert.throws(()=>applyMutation(doc,{action:'restore',deletionId:entry.id},actor),e=>e.status===409);assert.equal(doc.places.length,1);
  doc=fixture();applyMutation(doc,{action:'delete',collection:'places',itemId:doc.places[0].id},actor);entry=doc.deleted.at(-1);entry.expires=Date.now()-1;
  assert.throws(()=>applyMutation(doc,{action:'restore',deletionId:entry.id},actor),e=>e.status===410);
});
function memoryStorage(){const data=new Map();return{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k),data};}
const proposal={id:'proposal-1',changes:[{changeId:'a',operation:'add',target:'places',name:'검토 카페',category:'카페',address:'직접 입력한 주소',sourceUrls:['https://example.org/cafe'],currency:'JPY',cost:0,costKnown:false,note:'',reason:''},{changeId:'b'}]};
test('AI 검토는 새로 읽어도 선택·위치가 유지되고 계정·여행·새 제안은 분리된다',()=>{
  const storage=memoryStorage(),now=Date.now();
  writeReview(storage,actor.id,'trip-1',proposal,{selected:['a'],locations:{a:{lat:35,lng:139,address:'내가 확인한 주소'}},scopeDate:'2027-01-02',expanded:true},now);
  const restored=readReview(storage,actor.id,'trip-1',proposal,now);assert.deepEqual(restored.selected,['a']);assert.equal(restored.locations.a.lat,35);assert.equal(restored.expanded,true);
  assert.equal(readReview(storage,partner.id,'trip-1',proposal,now),null);assert.equal(readReview(storage,actor.id,'trip-2',proposal,now),null);assert.equal(readReview(storage,actor.id,'trip-1',{...proposal,id:'proposal-2'},now),null);
  writeReview(storage,actor.id,'trip-1',proposal,{selected:[],locations:{}},now);assert.deepEqual(readReview(storage,actor.id,'trip-1',proposal,now).selected,[]);
  removeReview(storage,actor.id,'trip-1',proposal.id);assert.equal(readReview(storage,actor.id,'trip-1',proposal,now),null);
});
test('Google 검토 위치는 장소 ID만 저장하고 새로고침 후 좌표 없이도 반영 가능하다',()=>{
  const storage=memoryStorage(),now=Date.now();writeReview(storage,actor.id,'trip-1',proposal,{selected:['a'],locations:{a:{googlePlaceId:'ChIJ_checked',lat:35.123,lng:139.123,address:'내 주소'}}},now);
  const restored=readReview(storage,actor.id,'trip-1',proposal,now);assert.equal(restored.locations.a.lat,null);assert.equal(restored.locations.a.lng,null);assert.ok(![...storage.data.values()][0].includes('35.123'));
  const doc=createDocument(meta,actor);applyPlannerChanges(doc,selectPlannerChanges(proposal,{changeIds:restored.selected,locations:[{changeId:'a',...restored.locations.a}]}),actor);
  assert.equal(doc.places[0].googlePlaceId,'ChIJ_checked');assert.equal(doc.places[0].lat,null);
  assert.equal(readReview(storage,actor.id,'trip-1',proposal,now+8*86400000),null);
});
