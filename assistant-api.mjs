import { randomUUID } from 'node:crypto';
import { applyPlannerChanges, generatePlan } from './ai-planner.mjs';
import { daysBetween } from './public/domain.js';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export function assistantError(error){
  const messages={AI_BUSY:[409,'추천을 만들고 있어요. 잠시 기다려주세요.'],AI_LIMIT:[429,'오늘의 AI 추천 횟수를 모두 사용했어요. 내일 다시 이용해주세요.'],AI_CHAT_CONFLICT:[409,'다른 화면에서 대화나 제안이 변경됐어요. 대화를 다시 불러와주세요.'],TRAVEL_CONFLICT:[409,'동행이 일정을 변경했어요. 최신 일정을 기준으로 다시 제안해달라고 요청해주세요.'],TRAVEL_FORBIDDEN:[403,'이 여행에 접근할 권한이 없습니다.']};
  for(const [code,[status,message]]of Object.entries(messages))if(error.message?.includes(code))fail(status,message);
  if(['PGRST205','PGRST202','42P01','42883'].includes(error.code))fail(503,'AI 도우미 저장소 준비가 필요해요. 관리자가 AI 설정 SQL을 실행한 뒤 이용할 수 있어요.');
  fail(503,'AI 대화를 저장하지 못했어요. 연결을 확인하고 다시 시도해주세요.');
}
export function createAssistantApi({admin,readBody,generate=generatePlan}){
  async function chatFor(trip,user){
    const {data,error}=await admin.from('travel_ai_chats').select('version,messages,proposal,pending_until').eq('trip_id',trip.id).eq('user_id',user.id).maybeSingle();
    if(error)assistantError(error);
    return data?{version:data.version,messages:data.messages,proposal:data.proposal,pending:Boolean(data.pending_until&&Date.parse(data.pending_until)>Date.now()),pendingUntil:data.pending_until}:{version:0,messages:[],proposal:null,pending:false};
  }
  async function command(action,trip,user,args={}){
    const {data,error}=await admin.rpc('travel_ai_command',{p_action:action,p_trip:trip.id,p_actor:user.id,...args}).retry(false);
    if(error)assistantError(error);return data;
  }
  return async function assistant(req,res,parts,json,trip,user){
    if(req.method==='GET')return json({conversation:await chatFor(trip,user),configured:Boolean(process.env.OPENAI_API_KEY)});
    if(req.method!=='POST')fail(405,'허용되지 않은 요청입니다.');
    const body=await readBody(req);
    if(parts[3]==='apply'){
      const conversation=await chatFor(trip,user),proposal=conversation.proposal;
      if(!proposal||proposal.id!==body.proposalId||conversation.version!==body.version)fail(409,'적용할 제안이 변경됐어요. 대화를 다시 불러와주세요.');
      if(proposal.baseVersion!==trip.version)fail(409,'동행이 일정을 변경했어요. 최신 일정을 기준으로 다시 제안해달라고 요청해주세요.');
      const {id,owner,members,updated,version,...document}=structuredClone(trip);
      applyPlannerChanges(document,proposal.changes,user);
      return json(await command('apply',trip,user,{p_request:proposal.id,p_expected:conversation.version,p_trip_version:proposal.baseVersion,p_document:document}));
    }
    if(parts[3])fail(404,'없는 AI 기능입니다.');
    if(!process.env.OPENAI_API_KEY)fail(503,'AI 여행 도우미 연결을 준비 중이에요.');
    const message=String(body.message||'').trim();
    if(!message||message.length>2000)fail(400,'요청을 1~2,000자로 입력해주세요.');
    if(!Number.isInteger(body.version)||body.version<0)fail(400,'대화를 다시 불러와주세요.');
    const scopeDate=String(body.scopeDate||'');if(scopeDate&&!daysBetween(trip.start,trip.end).includes(scopeDate))fail(400,'여행 기간 안의 날짜를 선택해주세요.');
    const dailyLimit=Number(process.env.AI_DAILY_LIMIT||30),userLimit=Number(process.env.AI_USER_DAILY_LIMIT||10);
    if(!Number.isInteger(dailyLimit)||!Number.isInteger(userLimit)||dailyLimit<1||userLimit<1||dailyLimit>10000||userLimit>10000)fail(503,'AI 사용 한도 설정을 확인해주세요.');
    const requestId=randomUUID();
    const conversation=await command('begin',trip,user,{p_request:requestId,p_expected:body.version,p_trip_version:trip.version,p_message:message,p_daily_limit:dailyLimit,p_user_limit:userLimit});
    try{
      const result=await generate({trip,conversation,message,scopeDate,signal:AbortSignal.timeout(45000)});
      return json({conversation:await command('finish',trip,user,{p_request:requestId,p_result:result})});
    }catch(error){
      let message='추천을 만들지 못했어요. 잠시 후 다시 보내주세요.',status=502;
      if(error.status===429){status=429;message='AI 서비스의 사용 한도에 도달했어요. 잠시 후 다시 시도해주세요.';}
      else if(error.status===401||error.status===403){status=503;message='AI 서비스 연결 설정을 확인해야 해요.';}
      else if(['APIConnectionTimeoutError','TimeoutError','AbortError'].includes(error.name)){status=504;message='추천 시간이 길어졌어요. 하루나 한두 장소로 범위를 줄여 요청해주세요.';}
      else if([400,409,422,502,503].includes(error.status)){status=error.status;message=error.message;}
      try{await command('fail',trip,user,{p_request:requestId,p_message:message});}catch{}
      console.error('AI 여행 도우미 요청 실패',{status:error.status||null,code:typeof error.code==='string'?error.code:null});
      fail(status,message);
    }
  };
}
