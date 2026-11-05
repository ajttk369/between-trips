// 격리된 화면 검증 서버. 운영 Supabase·OpenAI·디스크 데이터에 접근하지 않습니다.
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {cloudFixture} from './fixtures/cloud.mjs';
import {createDocument,applyMutation} from '../travel-domain.mjs';
import {prepareProposal} from '../ai-planner.mjs';
import {createApp} from '../server.mjs';

Object.assign(process.env,{STORAGE_BACKEND:'supabase',SUPABASE_URL:'https://fixture.supabase.test',SUPABASE_SERVICE_ROLE_KEY:'test-only-key',OPENAI_API_KEY:'test-only-no-network',PUBLIC_URL:'',COOKIE_SECURE:'false'});
delete process.env.VERCEL;
const fixture=await cloudFixture(),{user}=await fixture.register('preview@example.test','화면 검증');
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:fixture.fetchImpl}});
const start=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date()),end=new Date(Date.parse(start)+3*86400000).toISOString().slice(0,10),secondDay=new Date(Date.parse(start)+86400000).toISOString().slice(0,10);
const partner=(await fixture.register('partner@example.test','동행 샘플')).user;
const doc=createDocument({name:'샘플 · AI 화면 검증 여행',country:'일본',city:'도쿄',type:'overseas',start,end,currency:'JPY'},user);
applyMutation(doc,{action:'upsert',collection:'stays',value:{name:'샘플 숙소',address:'도쿄 · 검증용 주소',checkIn:start,checkOut:end,status:'예약 완료',cost:10000,currency:'JPY',lat:35.68,lng:139.76}},user);
applyMutation(doc,{action:'upsert',collection:'places',value:{name:'샘플 전망대',address:'도쿄 · 지도 표시 검증용 주소',lat:35.69,lng:139.77,category:'관광',note:'긴 메모 접기 확인용입니다. '.repeat(30)}},partner);
for(const date of [start,secondDay])applyMutation(doc,{action:'upsert',collection:'itinerary',value:{placeId:doc.places[0].id,date,duration:60}},partner);
const {data:trip,error}=await admin.rpc('travel_command',{p_action:'create',p_trip:randomUUID(),p_actor:user.id,p_name:user.name,p_document:doc});if(error)throw error;
await admin.rpc('travel_command',{p_action:'invite',p_trip:trip.id,p_actor:user.id,p_invite:randomUUID(),p_token:'0'.repeat(64)});
await admin.rpc('travel_command',{p_action:'join',p_actor:partner.id,p_name:partner.name,p_token:'0'.repeat(64)});
const source='https://www.example.org/preview',search={output:[{type:'web_search_call',action:{sources:[{url:source,title:'화면 검증용 샘플 출처'}]}}]};
let calls=0;
const planGenerator=async({trip,conversation})=>{
  calls++;
  const names=calls===1?['샘플 점심 식당','샘플 카페','샘플 관광지']:['샘플 점심 식당','변경한 샘플 카페','샘플 관광지','추가한 샘플 저녁'];
  return prepareProposal({reply:'화면 검증용 샘플입니다. 실제 장소 추천이 아닙니다. '+(calls===1?'숙소를 기준으로 세 곳을 제안했어요.':'카페를 바꾸고 저녁을 추가한 새 초안이에요.'),changes:names.map((name,i)=>({operation:'add',target:'itinerary',id:'',placeId:'',name,category:['식사','카페','관광','식사'][i],date:secondDay,startTime:['12:00','14:00','16:00','18:00'][i],endTime:['13:00','15:00','17:00','19:00'][i],duration:60,cost:null,currency:'JPY',mode:'walk',address:'화면 검증용 주소',note:'샘플',reason:'숙소와 선택 날짜를 참고한 화면 검증',sourceUrls:[source]}))},search,trip,conversation.proposal);
};
process.env.GEOAPIFY_API_KEY='fixture-not-a-real-key';
const serviceFetch=async()=>new Response(JSON.stringify({results:[{name:'검증용 위치 후보',formatted:'도쿄 · 샘플 확인 주소',lat:35.6812,lon:139.7671}]}),{headers:{'Content-Type':'application/json'}});
const app=createApp({cloudFetch:fixture.fetchImpl,planGenerator,serviceFetch});
app.server.listen(4324,'127.0.0.1',()=>console.log('샘플 검증 서버 http://localhost:4324 · preview@example.test / 임의의 10자 이상 비밀번호 · trip '+trip.id));
process.on('SIGINT',()=>{app.close();fixture.close().finally(()=>process.exit(0));});
