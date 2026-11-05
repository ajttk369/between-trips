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
const doc=createDocument({name:'샘플 · AI 화면 검증 여행',country:'일본',city:'도쿄',type:'overseas',start:'2027-01-01',end:'2027-01-04',currency:'JPY'},user);
applyMutation(doc,{action:'upsert',collection:'stays',value:{name:'샘플 숙소',address:'도쿄 · 검증용 주소',checkIn:'2027-01-01',checkOut:'2027-01-04',status:'예약 완료',cost:10000,currency:'JPY',lat:35.68,lng:139.76}},user);
const {data:trip,error}=await admin.rpc('travel_command',{p_action:'create',p_trip:randomUUID(),p_actor:user.id,p_name:user.name,p_document:doc});if(error)throw error;
const source='https://www.example.org/preview',search={output:[{type:'web_search_call',action:{sources:[{url:source,title:'화면 검증용 샘플 출처'}]}}]};
let calls=0;
const planGenerator=async({trip,conversation})=>{
  calls++;
  const names=calls===1?['샘플 점심 식당','샘플 카페','샘플 관광지']:['샘플 점심 식당','변경한 샘플 카페','샘플 관광지','추가한 샘플 저녁'];
  return prepareProposal({reply:'화면 검증용 샘플입니다. 실제 장소 추천이 아닙니다. '+(calls===1?'숙소를 기준으로 세 곳을 제안했어요.':'카페를 바꾸고 저녁을 추가한 새 초안이에요.'),changes:names.map((name,i)=>({operation:'add',target:'itinerary',id:'',placeId:'',name,category:['식사','카페','관광','식사'][i],date:'2027-01-02',startTime:['12:00','14:00','16:00','18:00'][i],endTime:['13:00','15:00','17:00','19:00'][i],duration:60,cost:null,currency:'JPY',mode:'walk',address:'화면 검증용 주소',note:'샘플',reason:'숙소와 선택 날짜를 참고한 화면 검증',sourceUrls:[source]}))},search,trip,conversation.proposal);
};
const app=createApp({cloudFetch:fixture.fetchImpl,planGenerator});
app.server.listen(4324,'127.0.0.1',()=>console.log('샘플 검증 서버 http://localhost:4324 · preview@example.test / 임의의 10자 이상 비밀번호 · trip '+trip.id));
process.on('SIGINT',()=>{app.close();fixture.close().finally(()=>process.exit(0));});
