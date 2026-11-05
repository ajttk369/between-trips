import { publicUrl, requestOrigin, secureCookies } from './runtime.mjs';
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { applyMutation, createDocument } from './travel-domain.mjs';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const hash = value => createHash('sha256').update(value).digest('hex');
const uuid = value => { if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value || '')) fail(400, '올바른 여행 또는 항목 주소가 아닙니다.'); return value; };
const memberOf = (trip,user,owner=false) => { if (!trip || !trip.members.some(m=>m.id===user.id) || (owner && trip.owner!==user.id)) fail(403,'이 여행에 접근할 권한이 없습니다.'); };
const format = row => ({...row.document,id:row.id,owner:row.owner,members:row.members,version:row.version,updated:row.updated});
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(p=>p.trim().split('=')).filter(p=>p.length===2));
const cookieSuffix = () => `; HttpOnly; SameSite=Lax; Path=/${secureCookies() ? '; Secure' : ''}`;
function writeSession(res,session) {
  res.setHeader('Set-Cookie',[
    `travel_sb_access=${session.access_token}; Max-Age=${Math.max(1,session.expires_in || 3600)}${cookieSuffix()}`,
    `travel_sb_refresh=${session.refresh_token}; Max-Age=2592000${cookieSuffix()}`
  ]);
}
function clearSession(res) { res.setHeader('Set-Cookie',['travel_sb_access','travel_sb_refresh'].map(name=>`${name}=; Max-Age=0${cookieSuffix()}`)); }
const userView = user => user && ({id:user.id,email:user.email,name:String(user.user_metadata?.name || user.email?.split('@')[0] || '여행자').trim().slice(0,40) || '여행자'});
const messages = {
  TRAVEL_FORBIDDEN:[403,'이 여행에 접근할 권한이 없습니다.'],
  TRAVEL_UNAUTHORIZED:[401,'로그인이 필요합니다.'],
  TRAVEL_NOT_FOUND:[404,'여행을 찾을 수 없습니다.'],
  TRAVEL_CONFLICT:[409,'상대방이 먼저 변경했습니다. 최신 내용을 확인한 뒤 다시 저장해주세요. 입력 내용은 그대로 유지됩니다.'],
  TRAVEL_INVITE_EXPIRED:[404,'만료되었거나 취소된 초대입니다. 새 초대를 요청해주세요.'],
  TRAVEL_FULL:[409,'이 여행은 이미 두 사람이 함께하고 있습니다.'],
  TRAVEL_OWNER:[400,'여행 소유자는 제외할 수 없습니다.'],
  TRAVEL_INVALID:[400,'입력 형식을 확인해주세요.']
};
export function cloudError(error) {
  for(const [key,[status,message]] of Object.entries(messages)) if(error.message?.includes(key)) fail(status,message);
  if(['PGRST205','PGRST202','42P01','42883'].includes(error.code)) fail(503,'Supabase 여행 테이블 준비가 필요합니다. /setup.html 안내에 따라 setup.sql을 실행해주세요.');
  fail(503,'Supabase에 연결하지 못했습니다. 프로젝트 상태와 서버 연결 설정을 확인해주세요.');
}

export function createCloudApi({ readBody, config, url=process.env.SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY, fetchImpl=globalThis.fetch }={}) {
  if(!url || !key) throw new Error('Supabase 모드에는 SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.');
  const transport=(input,init)=>fetchImpl(input,{...init,signal:AbortSignal.timeout(12000)});
  const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:transport}};
  const admin=createClient(url,key,options),authClient=()=>createClient(url,key,options);
  const attempts=new Map(),refreshing=new Map(),streams=new Set();
  let healthCache=null;
  async function health(force=false) {
    if(!force && healthCache?.until>Date.now()) return healthCache.value;
    let value;
    try {
      const {error}=await admin.from('travel_workspaces').select('id').limit(0).retry(false);
      value=error?{ready:false,reason:['PGRST205','42P01'].includes(error.code)?'schema':'connection',message:['PGRST205','42P01'].includes(error.code)?'여행 테이블을 준비해주세요.':'Supabase 연결을 확인해주세요.'}:{ready:true};
    } catch { value={ready:false,reason:'connection',message:'Supabase 주소에 연결할 수 없습니다. 프로젝트 상태를 확인해주세요.'}; }
    healthCache={value,until:Date.now()+10000};return value;
  }
  async function ready() { const h=await health();if(!h.ready)fail(503,h.reason==='schema'?'Supabase 여행 테이블 준비가 필요합니다. /setup.html 안내를 확인해주세요.':h.message); }
  async function userOf(req,res) {
    const c=cookies(req);let access=c.travel_sb_access;
    const refresh=c.travel_sb_refresh;
    if(!access && !refresh)return null;
    // 토큰의 사용자 ID는 읽지 않습니다. 검증은 항상 Auth 서버 getUser로 수행합니다.
    let expiredSoon=false;
    try{expiredSoon=JSON.parse(Buffer.from((access || '').split('.')[1] || '', 'base64url')).exp*1000 < Date.now()+45000;}catch{expiredSoon=!access;}
    let result;
    if(access && !expiredSoon) {
      result=await authClient().auth.getUser(access);
      if(result.error && ![401,403].includes(result.error.status)) fail(503,'로그인 상태 확인에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
    if((!result?.data?.user || expiredSoon) && refresh && res && !res.headersSent) {
      const k=hash(refresh);
      if(!refreshing.has(k)) refreshing.set(k,authClient().auth.refreshSession({refresh_token:refresh}).then(value=>{setTimeout(()=>refreshing.delete(k),3000).unref();return value;},error=>{refreshing.delete(k);throw error;}));
      const updated=await refreshing.get(k);
      if(updated.error) {
        if(![400,401,403].includes(updated.error.status)) fail(503,'로그인 연결을 복구하지 못했습니다. 잠시 후 다시 시도해주세요.');
        clearSession(res);return null;
      }
      if(updated.data.session) { access=updated.data.session.access_token;writeSession(res,updated.data.session);result=await authClient().auth.getUser(access); }
    }
    return userView(result?.data?.user);
  }
  async function getTrip(id,user,owner=false) {
    uuid(id);const {data,error}=await admin.from('travel_workspaces').select('*').eq('id',id).maybeSingle();
    if(error)cloudError(error);const trip=data?format(data):null;memberOf(trip,user,owner);return trip;
  }
  async function command(action,user,args={}) {
    const {data,error}=await admin.rpc('travel_command',{p_action:action,p_actor:user.id,p_name:user.name,...args}).retry(false);
    if(error)cloudError(error);return data;
  }
  async function auth(req,res,parts,json) {
    if(req.method==='GET')return json({user:await userOf(req,res)});
    if(req.method!=='POST')fail(405,'허용되지 않은 요청입니다.');
    const body=await readBody(req);
    if(parts[1]==='logout') {
      const token=cookies(req).travel_sb_access;
      if(token) { try{await admin.auth.admin.signOut(token,'local');}catch{} }
      clearSession(res);return json({ok:true});
    }
    if(!['login','register'].includes(parts[1]))fail(404,'없는 기능입니다.');
    await ready();
    const email=String(body.email||'').trim().toLowerCase(),password=String(body.password||'');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)fail(400,'이메일 형식을 확인해주세요.');
    if(password.length<10||password.length>200)fail(400,'비밀번호는 10~200자로 입력해주세요.');
    const rateKey=hash(`${req.socket.remoteAddress}:${email}`),previous=attempts.get(rateKey),count=previous?.until>Date.now()?previous.count+1:1;
    if(count>15)fail(429,'잠시 후 다시 시도해주세요.');
    attempts.set(rateKey,{count,until:Date.now()+600000});if(attempts.size>5000)for(const[k,v]of attempts)if(v.until<Date.now())attempts.delete(k);
    let result;
    if(parts[1]==='register') {
      const name=String(body.name||'').trim().slice(0,40);if(!name)fail(400,'이름을 입력해주세요.');
      result=await authClient().auth.signUp({email,password,options:{data:{name},emailRedirectTo:publicUrl()||requestOrigin(req)}});
    } else result=await authClient().auth.signInWithPassword({email,password});
    if(result.error) {
      const code=result.error.code;
      if(code==='email_not_confirmed')fail(403,'가입 이메일의 인증 링크를 누른 뒤 로그인해주세요.');
      if(code==='invalid_credentials')fail(401,'이메일 또는 비밀번호가 맞지 않습니다.');
      if(code==='user_already_exists')fail(409,'이미 가입된 계정입니다. 로그인해주세요.');
      if(code==='over_email_send_rate_limit'||result.error.status===429)fail(429,'인증 메일 발송 한도에 도달했습니다. 잠시 후 다시 시도해주세요.');
      if(code==='signup_disabled')fail(403,'Supabase에서 새 회원가입이 비활성화되어 있습니다.');
      fail(400,'인증 요청을 완료하지 못했습니다. 입력 정보와 Supabase Auth 설정을 확인해주세요.');
    }
    if(!result.data.session) return json({user:null,confirmationRequired:true,message:'가입 이메일로 인증 링크를 보냈어요. 인증을 완료한 뒤 이 화면에서 로그인해주세요.'});
    const user=userView(result.data.user);
    const {error}=await admin.from('travel_profiles').upsert({id:user.id,name:user.name});if(error)cloudError(error);
    attempts.delete(rateKey);writeSession(res,result.data.session);return json({user});
  }
  async function handle(req,res,urlObj) {
    const parts=urlObj.pathname.split('/').filter(Boolean).slice(1),method=req.method;
    const json=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    if(parts[0]==='config')return json({...config,storage:'supabase',storageStatus:await health(),setupUrl:'/setup.html',supabaseDashboardUrl:'https://supabase.com/dashboard/project/'+new URL(url).hostname.split('.')[0]});
    if(parts[0]==='health')return json({storage:'supabase',...await health(true)});
    if(parts[0]==='auth')return auth(req,res,parts,json);
    await ready();const user=await userOf(req,res);if(!user)fail(401,'로그인이 필요합니다.');
    if(parts[0]==='join'&&method==='POST') {
      const b=await readBody(req);if(!/^[a-f0-9]{48}$/.test(b.code||''))fail(400,'초대 코드를 확인해주세요.');
      return json(await command('join',user,{p_token:hash(b.code)}));
    }
    if(parts[0]!=='trips')fail(404,'없는 기능입니다.');
    if(parts.length===1) {
      if(method==='GET') { const {data,error}=await admin.from('travel_workspaces').select('*').contains('members',[{id:user.id}]).order('updated',{ascending:false});if(error)cloudError(error);return json(data.map(format)); }
      if(method==='POST') { const body=await readBody(req),doc=createDocument(body,user);return json(await command('create',user,{p_trip:randomUUID(),p_document:doc}),201); }
      fail(405,'허용되지 않은 요청입니다.');
    }
    const id=uuid(parts[1]),trip=await getTrip(id,user);
    if(parts[2]==='events'&&method==='GET') {
      if(config.liveMode==='poll')return json({error:'이 배포에서는 여행 조회 API를 주기적으로 확인합니다.'},405);
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
      res.write('event: ready\ndata: {}\n\n');let version=trip.version,busy=false;
      const stream={res,timer:null};streams.add(stream);
      const started=Date.now();
      stream.timer=setInterval(async()=>{
        if(busy)return;busy=true;
        try {
          // 주기적으로 일반 HTTP 인증으로 돌아가 세션 만료와 로그아웃을 재검증합니다.
          if(Date.now()-started>60000){res.write('event: auth_refresh\ndata: {}\n\n');res.end();return;}
          const {data:current,error}=await admin.from('travel_workspaces').select('id,owner,members,version').eq('id',id).maybeSingle();if(error)cloudError(error);memberOf(current,user);
          if(current.version!==version){version=current.version;res.write(`event: change\ndata: ${JSON.stringify({id})}\n\n`);}else res.write(': heartbeat\n\n');
        } catch(error) {
          if(error.status===403){res.write('event: access\ndata: {}\n\n');res.end();}
          else {res.write('event: unavailable\ndata: {}\n\n');res.end();}
        } finally{busy=false;}
      },2000);
      req.on('close',()=>{clearInterval(stream.timer);streams.delete(stream);});return;
    }
    if(parts[2]==='invites') {
      memberOf(trip,user,true);
      if(method==='GET') {const {data,error}=await admin.from('travel_invites').select('id,expires,used').eq('trip_id',id).eq('used',false).gt('expires',Date.now());if(error)cloudError(error);return json(data);}
      if(method==='POST'){const code=randomBytes(24).toString('hex'),result=await command('invite',user,{p_trip:id,p_invite:randomUUID(),p_token:hash(code)});return json({...result,code});}
      if(method==='DELETE')return json(await command('revoke',user,{p_trip:id,p_invite:uuid(parts[3])}));
      fail(405,'허용되지 않은 요청입니다.');
    }
    if(parts[2]==='members'&&method==='DELETE')return json(await command('remove',user,{p_trip:id,p_member:uuid(parts[3])}));
    if(parts[2]==='export'&&method==='GET')return json({...trip,schemaVersion:1});
    if(method==='GET')return json(trip);
    if(method==='DELETE'){await readBody(req);return json(await command('delete',user,{p_trip:id}));}
    if(method!=='PATCH')fail(405,'허용되지 않은 요청입니다.');
    const body=await readBody(req);
    if(body.version!==trip.version)cloudError({message:'TRAVEL_CONFLICT'});
    const {id:ignoredId,owner:ignoredOwner,members:ignoredMembers,updated:ignoredUpdated,version:ignoredVersion,...doc}=trip;
    applyMutation(doc,body,user);
    return json(await command('save',user,{p_trip:id,p_version:body.version,p_document:doc}));
  }
  return {handle,userOf,health,close(){for(const s of streams){clearInterval(s.timer);s.res.end();}streams.clear();}};
}
