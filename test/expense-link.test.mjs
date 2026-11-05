import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDocument,applyMutation} from '../travel-domain.mjs';
import {budgetOf} from '../public/domain.js';
const user={id:'a',name:'나'};
function fixture(){
  const doc={...createDocument({name:'도쿄',country:'일본',city:'도쿄',start:'2026-12-31',end:'2027-01-03',currency:'JPY'},user),owner:'a',members:[user,{id:'b',name:'동행'}]};
  applyMutation(doc,{action:'upsert',collection:'stays',value:{name:'숙소',checkIn:doc.start,checkOut:doc.end,status:'예약 완료',cost:568505,currency:'KRW'}},user);
  applyMutation(doc,{action:'upsert',collection:'reservations',value:{name:'비행기',date:doc.start,cost:1120000,currency:'KRW'}},user);
  applyMutation(doc,{action:'upsert',collection:'itinerary',value:{name:'치이카와 파크',date:doc.start,cost:8000,currency:'JPY',note:'입장권 예약',duration:120}},user);
  applyMutation(doc,{action:'upsert',collection:'expenses',value:{name:'숙소',date:doc.start,amount:568505,currency:'KRW',sourceId:doc.stays[0].id,excludeFromSettlement:true}},user);
  applyMutation(doc,{action:'upsert',collection:'expenses',value:{name:'치이카와 파크',date:doc.start,amount:58000,currency:'KRW',sourceId:doc.itinerary[0].id,excludeFromSettlement:true}},user);
  return doc;
}
test('사진의 8,000엔 예상과 58,000원 실제 지출을 구분하고 실제 수정액을 연결해서 보여준다',()=>{
  const doc=fixture(),b=budgetOf(doc),park=b.estimates.find(x=>x.name==='치이카와 파크');
  assert.equal(b.spent,626505);assert.equal(b.planned,1688505);assert.equal(park.amount,8000);assert.equal(park.currency,'JPY');assert.equal(park.linkedExpense.amount,58000);assert.equal(park.linkedExpense.currency,'KRW');assert.deepEqual(b.plannedMissing,['JPY']);assert.deepEqual(b.spentMissing,[]);assert.equal(b.settlement,0);
});
test('실제만 수정하면 예상은 보존하고 함께 수정하면 금액·통화를 한 번에 갱신한다',()=>{
  const doc=fixture(),expense=doc.expenses[1];
  applyMutation(doc,{action:'upsert',collection:'expenses',value:{...expense,amount:59000},syncEstimate:false},user);assert.equal(doc.itinerary[0].cost,8000);assert.equal(doc.itinerary[0].currency,'JPY');assert.equal(budgetOf(doc).spent,627505);
  applyMutation(doc,{action:'upsert',collection:'expenses',value:{...doc.expenses[1],amount:58000},syncEstimate:true},user);
  assert.equal(doc.itinerary[0].cost,58000);assert.equal(doc.itinerary[0].currency,'KRW');assert.equal(doc.itinerary[0].note,'입장권 예약');assert.equal(doc.itinerary[0].duration,120);assert.equal(doc.expenses.length,2);assert.equal(doc.expenses[1].excludeFromSettlement,true);
  const b=budgetOf(doc);assert.equal(b.planned,1746505);assert.equal(b.spent,626505);assert.equal(b.settlement,0);assert.deepEqual(b.plannedMissing,[]);
});
test('숙소·예약 예상 비용 동기화도 결제 상태·정산 설정·예약 정보를 보존한다',()=>{
  for(const kind of ['stays','reservations']){
    const doc=fixture(),source=doc[kind][0];source.paid=true;source.excludeFromSettlement=true;source.bookingNumber='예약번호';
    const previous=doc.expenses.find(x=>x.sourceId===source.id);
    applyMutation(doc,{action:'upsert',collection:'expenses',value:{...(previous||{}),name:source.name,date:doc.start,amount:1000,currency:'JPY',sourceId:source.id},syncEstimate:true},user);
    const updated=doc[kind][0];assert.equal(updated.cost,1000);assert.equal(updated.currency,'JPY');assert.equal(updated.paid,true);assert.equal(updated.excludeFromSettlement,true);assert.equal(updated.bookingNumber,'예약번호');
  }
});
test('연결 없는 지출·잘못된 옵션으로 예상 비용을 갱신하지 않는다',()=>{
  const doc=fixture();assert.throws(()=>applyMutation(doc,{action:'upsert',collection:'expenses',value:{name:'별도 지출',date:doc.start,amount:1000,currency:'KRW'},syncEstimate:true},user),/연결한 지출/);assert.equal(doc.expenses.length,2);
  assert.throws(()=>applyMutation(doc,{action:'upsert',collection:'expenses',value:doc.expenses[1],syncEstimate:'true'},user),/수정 여부/);
});
