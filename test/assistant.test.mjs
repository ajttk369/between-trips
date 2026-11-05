import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {createDocument} from '../travel-domain.mjs';
import {generatePlan,prepareProposal,applyPlannerChanges,plannerContext} from '../ai-planner.mjs';
import {createAssistantApi} from '../assistant-api.mjs';
import {cloudFixture} from './fixtures/cloud.mjs';

const meta={name:'여행 테스트',country:'일본',city:'도쿄',type:'overseas',start:'2027-01-01',end:'2027-01-04',currency:'JPY'};
const source='https://www.example.org/tokyo/cafe';
const searches={output:[{type:'web_search_call',action:{sources:[{url:source,title:'테스트용 카페 안내'}]}}]};
const stop=(overrides={})=>({operation:'add',target:'itinerary',id:'',placeId:'',name:'샘플 카페',category:'카페',date:'2027-01-02',startTime:'11:00',endTime:'12:00',duration:60,cost:null,currency:'JPY',mode:'walk',address:'도쿄 · 테스트 주소',note:'영업시간 확인 필요',reason:'숙소를 기준으로 제안',sourceUrls:[source],...overrides});

test('AI는 검색 출처와 여행 날짜가 있는 제안만 만들고 제안 전에는 기록을 바꾸지 않는다',()=>{
  const owner=randomUUID(),trip={...createDocument(meta,{id:owner}),owner,version:1};
  const before=structuredClone(trip);
  const result=prepareProposal({reply:'초안이에요',changes:[stop(),stop({name:'출처 없는 식당',sourceUrls:['https://invented.example/place']}),stop({name:'기간 밖',date:'2027-02-01'})]},searches,trip);
  assert.equal(result.proposal.changes.length,1);assert.equal(result.issues.length,2);assert.deepEqual(trip,before);
  const edited=structuredClone(trip);applyPlannerChanges(edited,result.proposal.changes,{id:owner});
  assert.equal(edited.itinerary.length,1);assert.equal(edited.places.length,1);assert.equal(edited.places[0].lat,null);assert.equal(edited.places[0].lng,null);
  const revised=prepareProposal({reply:'카페는 유지하고 시간을 바꿀게요',changes:[stop({startTime:'14:00',endTime:'15:00'})]},{output:[]},trip,result.proposal);
  assert.equal(revised.proposal.changes.length,1,'미적용 제안을 대화로 수정할 때 기존 검색 출처 유지');
});

test('시간만 수정할 때 기존 비용과 작성자를 보존하고 이미 적용된 일정은 update한다',()=>{
  const owner=randomUUID(),id=randomUUID(),trip={...createDocument(meta,{id:owner}),owner,version:1};
  trip.itinerary.push({id,name:'기존 일정',date:'2027-01-02',startTime:'09:00',endTime:'10:00',duration:60,category:'기타',cost:1000,currency:'USD',createdBy:owner,placeId:''});
  const result=prepareProposal({reply:'시간을 조정했어요',changes:[stop({operation:'update',id,name:'기존 일정',category:'기타',sourceUrls:[],startTime:'15:00',endTime:'16:00'})]},{output:[]},trip);
  applyPlannerChanges(trip,result.proposal.changes,{id:randomUUID()});
  assert.equal(trip.itinerary.length,1);assert.equal(trip.itinerary[0].startTime,'15:00');assert.equal(trip.itinerary[0].cost,1000);assert.equal(trip.itinerary[0].currency,'USD');assert.equal(trip.itinerary[0].createdBy,owner);
});

test('OpenAI 요청은 필요한 숙소·날짜만 전송하고 계정·예약번호를 제외한다',async()=>{
  const owner=randomUUID(),trip={...createDocument(meta,{id:owner}),owner,version:3,members:[{id:owner,name:'비공개 이름',email:'private@example.test'}]};
  trip.stays.push({id:randomUUID(),name:'테스트 숙소',address:'숙소 주소',lat:35.6,lng:139.7,checkIn:meta.start,checkOut:meta.end,status:'예약 완료',bookingNumber:'SECRET-RESERVATION'});
  assert.equal(JSON.stringify(plannerContext(trip,'2027-01-02')).includes('SECRET-RESERVATION'),false);
  let request;
  const client={responses:{async create(body){request=body;return{...searches,status:'completed',output_text:JSON.stringify({reply:'숙소 근처 카페 초안',changes:[stop()]})};}}};
  const result=await generatePlan({trip,conversation:{messages:[]},message:'카페 추천',scopeDate:'2027-01-02',client});
  assert.equal(request.store,false);assert.equal(request.tools[0].type,'web_search');assert.equal(request.text.format.strict,true);
  assert.equal(request.input.includes('SECRET-RESERVATION'),false);assert.equal(request.input.includes('private@example.test'),false);assert.equal(request.input.includes('숙소 주소'),true);assert.equal(result.proposal.baseVersion,3);
});

test('AI 대화 저장 → 제안 수정 → 공동 일정 반영을 실제 SQL과 SDK로 검증',async t=>{
  const fixture=await cloudFixture();t.after(()=>fixture.close());
  const original=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-key-never-used';t.after(()=>{if(original===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=original;});
  const {user}=await fixture.register('ai@test.local','여행자'),other=(await fixture.register('other@test.local')).user;
  const admin=createClient('https://fixture.supabase.test','test-only-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:fixture.fetchImpl}});
  const {data:trip,error}=await admin.rpc('travel_command',{p_action:'create',p_trip:randomUUID(),p_actor:user.id,p_name:user.name,p_document:createDocument(meta,user)});assert.ifError(error);
  let generation=0;
  const generate=async({trip,conversation})=>{generation++;return prepareProposal({reply:generation===1?'첫 카페 초안':'시간을 바꾼 초안',changes:[stop({startTime:generation===1?'11:00':'14:00',endTime:generation===1?'12:00':'15:00'})]},generation===1?searches:{output:[]},trip,conversation.proposal);};
  const api=createAssistantApi({admin,readBody:async r=>r.body,generate});
  const invoke=async(method,body,current=trip,actor=user,apply=false)=>{const req={method,body},res={writeHead(status){this.status=status;},end(body){this.data=JSON.parse(body);}};await api(req,res,['trips',trip.id,'assistant',...(apply?['apply']:[])],(data,status=200)=>{res.status=status;res.data=data;},current,actor);return res.data;};
  assert.equal((await invoke('GET')).conversation.version,0);
  let c=(await invoke('POST',{message:'숙소 근처 카페 추천',scopeDate:'2027-01-02',version:0})).conversation;
  assert.equal(c.messages.length,2);assert.equal(c.proposal.changes[0].startTime,'11:00');
  assert.equal((await fixture.db.query('select document from travel_workspaces')).rows[0].document.itinerary.length,0,'아직 저장 버튼을 누르지 않은 제안');
  c=(await invoke('POST',{message:'카페는 오후 2시로 바꿔줘',scopeDate:'2027-01-02',version:c.version})).conversation;
  assert.equal(c.messages.length,4);assert.equal(c.proposal.changes[0].startTime,'14:00');
  const result=await invoke('POST',{proposalId:c.proposal.id,version:c.version},trip,user,true);
  assert.equal(result.trip.itinerary.length,1);assert.equal(result.trip.itinerary[0].startTime,'14:00');assert.equal(result.trip.places[0].createdBy,user.id);assert.equal(result.conversation.proposal,null);
  assert.equal((await invoke('GET',undefined,result.trip,other)).conversation.messages.length,0,'다른 사용자의 AI 대화는 조회하지 않는다');
  await assert.rejects(invoke('POST',{proposalId:c.proposal.id,version:c.version},result.trip,user,true),e=>e.status===409,'같은 변경안을 두 번 반영하지 않는다');
});

test('AI SQL: 권한·사용 한도·중복 요청·늦은 응답·일정 충돌을 차단',async t=>{
  const fixture=await cloudFixture();t.after(()=>fixture.close());const {user}=await fixture.register('owner@test.local'),stranger=(await fixture.register('stranger@test.local')).user;
  const call=async(action,args={})=>(await fixture.db.query('select travel_ai_command(p_action=>$1,p_trip=>$2,p_actor=>$3,p_request=>$4,p_expected=>$5,p_message=>$6,p_result=>$7,p_document=>$8,p_trip_version=>$9,p_daily_limit=>$10,p_user_limit=>$11) result',[action,trip.id,args.actor||user.id,args.request||null,args.expected||0,args.message||'추천해줘',args.result||null,args.document||null,args.tripVersion??null,args.limit||2,args.userLimit||2])).rows[0].result;
  const trip=(await fixture.db.query('select travel_command(p_action=>$1,p_trip=>$2,p_actor=>$3,p_name=>$4,p_document=>$5) result',['create',randomUUID(),user.id,user.name,createDocument(meta,user)])).rows[0].result;
  await fixture.db.exec('set role authenticated;');await assert.rejects(fixture.db.query('select * from travel_ai_chats'),/permission denied/);await assert.rejects(fixture.db.query('select travel_ai_command($1,$2,$3)',['begin',trip.id,user.id]),/permission denied/);await fixture.db.exec('reset role;');
  await assert.rejects(call('begin',{actor:stranger.id,request:randomUUID()}),/TRAVEL_FORBIDDEN/);
  const first=randomUUID();let c=await call('begin',{request:first});assert.equal(c.pending,true);
  await assert.rejects(call('begin',{request:randomUUID(),expected:c.version}),/AI_BUSY/);
  await fixture.db.query("update travel_ai_chats set pending_until=now()-interval '1 second'");
  const second=randomUUID();c=await call('begin',{request:second,expected:c.version});
  await assert.rejects(call('finish',{request:first,result:{reply:'늦은 응답',proposal:null}}),/AI_CHAT_CONFLICT/);
  const proposal={id:randomUUID(),baseVersion:1,changes:[]};c=await call('finish',{request:second,result:{reply:'새 응답',proposal}});
  await fixture.db.query('update travel_workspaces set version=2 where id=$1',[trip.id]);
  await assert.rejects(call('apply',{request:proposal.id,expected:c.version,tripVersion:1,document:{name:'덮어쓰기'}}),/TRAVEL_CONFLICT/);
  await assert.rejects(call('begin',{request:randomUUID(),expected:c.version}),/AI_LIMIT/);
  assert.equal((await fixture.db.query('select document from travel_workspaces')).rows[0].document.name,meta.name);
});
