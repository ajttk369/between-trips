import {test} from 'node:test';
import assert from 'node:assert/strict';
import {budgetOf} from '../public/domain.js';
import {createDocument,applyMutation} from '../travel-domain.mjs';
import {createTaskUpdates} from '../public/task-updates.js';
const actor={id:'a',name:'나'},partner={id:'b',name:'동행'};
function trip(){return {...createDocument({name:'테스트',country:'한국',city:'서울',type:'domestic',start:'2027-01-01',end:'2027-01-03'},actor),id:'trip',version:1,owner:'a',members:[actor,partner]};}
const expense=(id,amount,payer,excludeFromSettlement=false)=>({id,name:id,date:'2027-01-01',amount,currency:'KRW',payer,share:50,excludeFromSettlement});
test('정산 제외 지출도 전체·카테고리·날짜별 지출에는 포함하고 정산만 제외한다',()=>{
  const doc=trip();doc.expenses=[expense('선물',10000,'a',true),expense('공동식사',20000,'b')];const b=budgetOf(doc);
  assert.equal(b.spent,30000);assert.equal(b.byDate['2027-01-01'],30000);assert.equal(b.categories['기타'],30000);assert.equal(b.settlement,-10000);assert.equal(b.excludedCount,1);
});
test('결제한 숙소·예약의 제외 옵션과 연결한 실제 지출의 옵션을 구분한다',()=>{
  const doc=trip();doc.stays=[{id:'s',name:'숙소',status:'예약 완료',checkIn:doc.start,cost:10000,currency:'KRW',payer:'a',share:50,paid:true,excludeFromSettlement:true}];
  doc.reservations=[{id:'r',name:'예약',date:doc.start,cost:2000,currency:'KRW',payer:'a',share:50,paid:true}];
  assert.equal(budgetOf(doc).spent,12000);assert.equal(budgetOf(doc).settlement,1000);
  doc.expenses=[{...expense('e',9000,'a'),sourceId:'s'}];assert.equal(budgetOf(doc).spent,11000);assert.equal(budgetOf(doc).settlement,5500);
  doc.expenses[0].excludeFromSettlement=true;assert.equal(budgetOf(doc).spent,11000);assert.equal(budgetOf(doc).settlement,1000);
});
test('기존 기록은 정산에 포함하며 제외 상태는 수정·내보내기 재가져오기에도 유지한다',()=>{
  const doc=trip();applyMutation(doc,{action:'upsert',collection:'expenses',value:{...expense('',10000,'a'),name:'기존 지출'}},actor);assert.equal(doc.expenses[0].excludeFromSettlement,false);
  applyMutation(doc,{action:'upsert',collection:'expenses',value:{...doc.expenses[0],excludeFromSettlement:true}},actor);
  const {excludeFromSettlement,...oldForm}=doc.expenses[0];applyMutation(doc,{action:'upsert',collection:'expenses',value:{...oldForm,name:'이름만 수정'}},partner);assert.equal(doc.expenses[0].excludeFromSettlement,true);
  const imported=createDocument({import:{...doc,schemaVersion:1}},actor);assert.equal(imported.expenses[0].excludeFromSettlement,true);
  assert.throws(()=>applyMutation(doc,{action:'upsert',collection:'expenses',value:{...doc.expenses[0],excludeFromSettlement:'false'}},actor),/정산 포함/);
});
test('정산 제외 항목의 누락 환율·이전 참여자는 정산 경고에 섞이지 않는다',()=>{
  const doc=trip();doc.expenses=[{...expense('개인지출',10000,'former',true),currency:'JPY'}];const b=budgetOf(doc);assert.deepEqual(b.missing,['JPY']);assert.deepEqual(b.settlementMissing,[]);assert.deepEqual(b.invalidPayers,[]);assert.equal(b.settlement,0);
});
function taskFixture(send){let doc={...trip(),tasks:[{id:'one',name:'여권',assignee:'a',note:'원본 메모',done:false},{id:'two',name:'충전기',done:false}]},account='a',failures=[];const updates=createTaskUpdates({scope:()=>account+'/'+doc.id,getTrip:()=>doc,send:async(...args)=>send(...args),read:async()=>doc,commit:value=>doc=value,change(){},error:e=>failures.push(e)});return {updates,failures,get doc(){return doc;},set doc(value){doc=value;},switchAccount(){account='b';}};}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('체크는 요청 완료 전 반영되고 다른 항목 요청은 최신 버전으로 차례대로 보낸다',async()=>{
  let resolve;const calls=[],f=taskFixture(async(id,body)=>{calls.push(body);if(calls.length===1)await new Promise(r=>resolve=r);const doc=structuredClone(f.doc);doc.tasks.find(t=>t.id===body.itemId).done=body.done;doc.version++;return doc;});
  f.updates.toggle('one');assert.equal(f.updates.value(f.doc.tasks[0]),true);assert.equal(f.doc.tasks[0].done,false);f.updates.toggle('two');assert.equal(calls.length,1);
  resolve();await flush();assert.deepEqual(calls.map(c=>c.version),[1,2]);assert.equal(f.doc.tasks[1].done,true);assert.equal(f.updates.isPending('one'),false);assert.ok(!('value'in calls[0]));
});
test('연속 체크·해제는 마지막 선택을 저장하고 실패하면 표시를 원래대로 되돌린다',async()=>{
  let resolve;const f=taskFixture(async(id,body)=>{if(!resolve)await new Promise(r=>resolve=r);const doc=structuredClone(f.doc);doc.tasks.find(t=>t.id===body.itemId).done=body.done;doc.version++;return doc;});
  f.updates.toggle('one');f.updates.toggle('one');assert.equal(f.updates.value(f.doc.tasks[0]),false);resolve();await flush();assert.equal(f.doc.tasks[0].done,false);
  const failed=taskFixture(async()=>{throw Error('연결 실패');});failed.updates.toggle('one');assert.equal(failed.updates.value(failed.doc.tasks[0]),true);await flush();assert.equal(failed.updates.value(failed.doc.tasks[0]),false);assert.equal(failed.failures.length,1);
});
test('버전 충돌은 최신 문서를 읽고 체크 필드만 재시도하며 동행의 메모를 보존한다',async()=>{
  let calls=0;const f=taskFixture(async(id,body)=>{if(!calls++){f.doc={...f.doc,version:2,tasks:f.doc.tasks.map(t=>({...t,note:'동행이 변경'}))};throw Object.assign(Error('충돌'),{status:409});}const doc=structuredClone(f.doc);assert.equal(body.version,2);applyMutation(doc,body,actor);doc.version++;return doc;});f.updates.toggle('one');await flush();assert.equal(f.doc.tasks[0].done,true);assert.equal(f.doc.tasks[0].note,'동행이 변경');
});
test('계정이 바뀐 뒤 도착한 체크 응답은 새 계정 화면에 적용하지 않는다',async()=>{
  let resolve;const f=taskFixture(async()=>new Promise(r=>resolve=r));f.updates.toggle('one');f.switchAccount();resolve({...f.doc,version:2,tasks:[]});await flush();assert.equal(f.doc.tasks.length,2);assert.equal(f.updates.isPending('one'),false);
});
