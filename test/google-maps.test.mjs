import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDocument,applyMutation} from '../travel-domain.mjs';
import {mergeLocationCandidate} from '../public/domain.js';
import {prepareProposal,selectPlannerChanges,applyPlannerChanges} from '../ai-planner.mjs';
const actor={id:randomUUID(),name:'여행자'};
const meta={name:'도쿄 여행',country:'일본',city:'도쿄',type:'overseas',start:'2027-01-01',end:'2027-01-03',currency:'JPY'};
const fresh=()=>import('../public/google-maps.js?test='+randomUUID());
test('지역 중심은 선택하지 않고 건물 후보도 예약 이름·전체 주소를 덮어쓰지 않는다',()=>{
  const input={name:'Patio Higashi-Shinjuku',address:'1-chome-3-11 Okubo, Shinjuku City, Tokyo 169-0072 일본',link:'https://booking.example/confirmation'};
  assert.throws(()=>mergeLocationCandidate(input,{name:'大久保',address:'大久保, 신주쿠구',lat:35.7,lng:139.7,precision:'area'}),/지역/);
  const result=mergeLocationCandidate(input,{name:'검색에서 찾은 다른 명칭',address:'축약 주소',lat:35.69,lng:139.71,source:'Geoapify',precision:'place'});
  assert.equal(result.name,input.name);assert.equal(result.address,input.address);assert.equal(result.link,input.link);assert.equal(result.lat,35.69);
  const google=mergeLocationCandidate(input,{name:'Google 검색 이름',address:'Google 주소',lat:35,lng:139,googlePlaceId:'ChIJ_test',source:'Google Places',precision:'place'});
  assert.equal(google.name,input.name);assert.equal(google.address,input.address);assert.equal(google.googlePlaceId,'ChIJ_test');
});
test('Google 장소는 ID만 영구 저장하고 검색 좌표는 기록·내보내기에 남기지 않는다',()=>{
  const doc=createDocument(meta,actor);
  applyMutation(doc,{action:'upsert',collection:'stays',value:{name:'내 예약 숙소',address:'내 예약 주소',checkIn:meta.start,checkOut:meta.end,googlePlaceId:'ChIJ_test',lat:35.69,lng:139.7}},actor);
  assert.equal(doc.stays[0].googlePlaceId,'ChIJ_test');assert.equal(doc.stays[0].lat,null);assert.equal(doc.stays[0].lng,null);
  const old=doc.stays[0];applyMutation(doc,{action:'upsert',collection:'stays',value:{...old,googlePlaceId:'',lat:35.68,lng:139.76}},actor);
  assert.equal(doc.stays[0].googlePlaceId,'');assert.equal(doc.stays[0].lat,35.68);
});
test('Google 검색은 필요한 필드만 요청하고 지역 결과를 구분하며 위치를 페이지 메모리에 둔다',async t=>{
  const previous=globalThis.google;t.after(()=>{if(previous===undefined)delete globalThis.google;else globalThis.google=previous;});
  let request;
  class Place{static async searchByText(body){request=body;return{places:[{id:'ChIJ_area',displayName:'오쿠보',formattedAddress:'지역 주소',types:['sublocality_level_1'],location:{lat:()=>35,lng:()=>139}},{id:'ChIJ_hotel',displayName:'숙소',formattedAddress:'건물 주소',types:['lodging','establishment'],location:{lat:()=>35.1,lng:()=>139.1}}]};}}
  globalThis.google={maps:{Map:class{},importLibrary:async()=>({Place})}};
  const api=await fresh();api.configureGoogleMaps('test-browser-key');const result=await api.searchGooglePlaces('도쿄 숙소');
  assert.equal(result[0].precision,'area');assert.equal(result[1].precision,'place');assert.equal(request.maxResultCount,6);assert.ok(!request.fields.includes('reviews'));assert.ok(!request.fields.includes('photos'));
  const saved={googlePlaceId:'ChIJ_hotel',lat:null,lng:null,name:'사용자 이름'};
  assert.equal(api.googleLocation(saved).lat,35.1);assert.equal(saved.lat,null);
  api.clearGoogleLocations();assert.equal(api.googleLocation(saved).lat,null);
});
test('장소 ID 위치 조회는 동시 요청을 합치고 결과를 영구 기록에 섞지 않는다',async t=>{
  const previous=globalThis.google;t.after(()=>{if(previous===undefined)delete globalThis.google;else globalThis.google=previous;});let calls=0;
  class Place{constructor({id}){this.id=id;}async fetchFields(body){calls++;assert.deepEqual(body.fields,['location']);await Promise.resolve();this.location={lat:()=>35.68,lng:()=>139.76};}}
  globalThis.google={maps:{Map:class{},importLibrary:async()=>({Place})}};
  const api=await fresh();api.configureGoogleMaps('test-only');const items=[{googlePlaceId:'ChIJ_abc',lat:null,lng:null}];
  await Promise.all([api.resolveGooglePlaces(items),api.resolveGooglePlaces(items)]);assert.equal(calls,1);assert.equal(api.googleLocation(items[0]).lat,35.68);assert.equal(items[0].lat,null);
  assert.equal(await api.resolveGooglePlaces(items),false);
});
test('Google SDK는 키와 한국어 옵션으로 한 번 로드하며 실패 후 재시도할 수 있다',async t=>{
  const oldGoogle=globalThis.google,oldDocument=globalThis.document;
  t.after(()=>{if(oldGoogle===undefined)delete globalThis.google;else globalThis.google=oldGoogle;if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;delete globalThis.travelGoogleReady;});
  delete globalThis.google;let scripts=[];
  globalThis.document={createElement(){return{remove(){}};},head:{append(script){scripts.push(script);}}};
  const api=await fresh();api.configureGoogleMaps('browser-test');const first=api.loadGoogleMaps(),second=api.loadGoogleMaps();assert.equal(first,second);assert.equal(scripts.length,1);
  const url=new URL(scripts[0].src);assert.equal(url.origin,'https://maps.googleapis.com');assert.equal(url.searchParams.get('language'),'ko');assert.equal(url.searchParams.get('key'),'browser-test');
  scripts[0].onerror();await assert.rejects(first,/Google 지도/);
  const retried=api.loadGoogleMaps();assert.equal(scripts.length,2);globalThis.google={maps:{Map:class{}}};globalThis.travelGoogleReady();await retried;
});
test('AI 추천 위치를 Google 장소 ID로 연결해도 좌표를 영구 저장하지 않는다',()=>{
  const trip={...createDocument(meta,actor),owner:actor.id,version:1},url='https://example.org/place';
  const {proposal}=prepareProposal({reply:'추천',changes:[{operation:'add',target:'places',id:'',placeId:'',name:'사용자가 요청한 숙소 주변 카페',category:'카페',date:'',startTime:'',endTime:'',duration:60,cost:null,currency:'JPY',mode:'walk',address:'기존 주소',note:'',reason:'',sourceUrls:[url]}]},{output:[{type:'web_search_call',action:{sources:[{url}]}}]},trip);
  const id=proposal.changes[0].changeId;
  applyPlannerChanges(trip,selectPlannerChanges(proposal,{changeIds:[id],locations:[{changeId:id,googlePlaceId:'ChIJ_checked',lat:35.6,lng:139.7,address:'사용자가 확인한 주소'}]}),actor);
  assert.equal(trip.places[0].googlePlaceId,'ChIJ_checked');assert.equal(trip.places[0].lat,null);assert.equal(trip.places[0].address,'사용자가 확인한 주소');
});
test('Google 지도는 업데이트 시 기존 지도를 재사용하고 종료 시 핀·경로·이벤트를 정리한다',async t=>{
  const oldGoogle=globalThis.google,oldDocument=globalThis.document;
  t.after(()=>{if(oldGoogle===undefined)delete globalThis.google;else globalThis.google=oldGoogle;if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;});
  let loads=0,markers=0,removed=0,cleaned=0;
  const pane={append(){markers++;}};
  class FakeMap{constructor(){loads++;this.zoom=17;}addListener(){return{remove(){cleaned++;}};}setCenter(){}setZoom(z){this.zoom=z;}getZoom(){return this.zoom;}fitBounds(){}}
  class OverlayView{static preventMapHitsAndGesturesFrom(){}setMap(map){if(map){this.onAdd();this.draw();}else this.onRemove();}getPanes(){return{overlayMouseTarget:pane};}getProjection(){return{fromLatLngToDivPixel:()=>({x:12,y:34})};}}
  class LatLngBounds{extend(){}}
  class Polyline{setMap(map){if(!map)cleaned++;}}
  globalThis.document={createElement(){return{style:{},setAttribute(){},remove(){removed++;}};}};
  globalThis.google={maps:{Map:FakeMap,OverlayView,LatLng:class{},LatLngBounds,Polyline,event:{trigger(){},addListenerOnce(target,event,callback){callback();},clearInstanceListeners(){cleaned++;}}}};
  const api=await fresh();api.configureGoogleMaps('test-only');const node={replaceChildren(){cleaned++;}},position={lat:35,lng:139};
  const map=await api.createGoogleMap(node,{center:position,onClick(){}});
  map.update({center:position,pins:[{position,label:'1',title:'카페'}],line:[position,{lat:35.1,lng:139.1}]});
  map.update({center:position,pins:[{position,label:'2',title:'숙소'}]});
  assert.equal(loads,1);assert.equal(markers,2);assert.equal(removed,1);
  map.remove();assert.equal(removed,2);assert.ok(cleaned>=3);
  map.update({center:position,pins:[{position,label:'3',title:'제거 후'}]});assert.equal(markers,2);
});
