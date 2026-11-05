import {test} from 'node:test';
import assert from 'node:assert/strict';
import {journeyOverview} from '../public/domain.js';
const trip={country:'일본',city:'도쿄',timeZone:'Asia/Tokyo',start:'2027-01-01',end:'2027-01-03',stays:[{id:'s',name:'숙소',checkIn:'2027-01-01',checkOut:'2027-01-03',status:'예약 완료'}],itinerary:[{id:'a',name:'산책',date:'2027-01-01',startTime:'10:00',duration:60},{id:'b',name:'점심',date:'2027-01-01',startTime:'13:00',endTime:'14:00'},{id:'c',name:'저녁',date:'2027-01-01',startTime:'18:00',duration:60}]};
test('현지 시각으로 현재 일정·다음 장소·이후 일정·숙소를 고른다',()=>{
  const q=journeyOverview(trip,new Date('2027-01-01T01:30:00Z'));assert.equal(q.time,'10:30');assert.equal(q.active.id,'a');assert.equal(q.next.id,'b');assert.equal(q.following.id,'c');assert.equal(q.stay.id,'s');assert.equal(q.preview,false);
});
test('아직 시작하지 않은 일정은 현재로 표시하지 않고 종료 시각에는 다음 일정으로 넘어간다',()=>{
  let q=journeyOverview(trip,new Date('2026-12-31T23:00:00Z'));assert.equal(q.date,'2027-01-01');assert.equal(q.active,null);assert.equal(q.next.id,'a');
  q=journeyOverview(trip,new Date('2027-01-01T02:00:00Z'));assert.equal(q.active,null);assert.equal(q.next.id,'b');
});
test('시간이 없는 장소를 임의로 진행 중이라 표시하지 않고 지난 시간의 일정은 제외한다',()=>{
  const doc={...trip,itinerary:[...trip.itinerary,{id:'u',name:'시간 미정 카페',date:trip.start,startTime:''}]};
  const q=journeyOverview(doc,new Date('2027-01-01T12:00:00Z'));assert.equal(q.active,null);assert.equal(q.next.id,'u');assert.equal(q.finished,false);
});
test('종료·체류 시간 없는 일정도 시작 시각에는 다음 장소로 보여준다',()=>{
  const doc={...trip,itinerary:[{id:'point',name:'출발',date:trip.start,startTime:'10:00'}]};const q=journeyOverview(doc,new Date('2027-01-01T01:00:00Z'));assert.equal(q.active,null);assert.equal(q.next.id,'point');
});
test('여행 전후는 미리보기이고 일정 종료·빈 날짜를 구분한다',()=>{
  const before=journeyOverview(trip,new Date('2026-12-15T00:00:00Z'));assert.equal(before.preview,true);assert.equal(before.date,trip.start);assert.equal(before.next.id,'a');assert.equal(before.active,null);
  const after=journeyOverview(trip,new Date('2027-01-10T00:00:00Z'));assert.equal(after.preview,true);assert.equal(after.date,trip.end);assert.equal(after.active,null);assert.equal(after.stay.id,'s');
  const finished=journeyOverview(trip,new Date('2027-01-01T12:00:00Z'));assert.equal(finished.finished,true);assert.equal(finished.next,null);
  const empty=journeyOverview({...trip,itinerary:[]},new Date('2027-01-01T12:00:00Z'));assert.equal(empty.finished,false);assert.equal(empty.items.length,0);
});
