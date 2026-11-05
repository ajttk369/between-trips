import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {publicUrl,requestOrigin,secureCookies} from './runtime.mjs';
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const hash=value=>createHash('sha256').update(String(value)).digest('hex');
const equal=(a,b)=>timingSafeEqual(Buffer.from(hash(a),'hex'),Buffer.from(hash(b),'hex'));
const uuid=value=>{if(!/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value||''))fail(400,'회원 ID를 확인해주세요.');return value;};
export function validateAdminChanges(body){
  if(Object.keys(body).some(key=>!['name','email','password','revision'].includes(key)))fail(400,'변경할 수 없는 회원 항목입니다.');
  const name=String(body.name??'').trim(),email=String(body.email??'').trim().toLowerCase();
  if(!name||name.length>40)fail(400,'이름은 1~40자로 입력해주세요.');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)fail(400,'로그인 이메일을 확인해주세요.');
  if(body.password&&(!(typeof body.password==='string')||body.password.length<10||body.password.length>200))fail(400,'회원의 새 비밀번호는 10~200자로 입력해주세요.');
  return {name,email,...(body.password?{password:body.password}:{})};
}
export function createAdminApi({store,readBody,secret=randomBytes(32).toString('hex'),credentials=()=>({username:process.env.ADMIN_USERNAME||'admin',password:process.env.ADMIN_PASSWORD||''})}){
  const attempts=new Map(),revoked=new Map(),ttl=30*60*1000;
  const signingKey=()=>createHmac('sha256',secret).update(JSON.stringify(credentials())).digest();
  const sign=body=>createHmac('sha256',signingKey()).update(body).digest('hex');
  function sessionOf(req){
    const token=/(?:^|;\s*)travel_admin=([A-Za-z\d_-]+\.[a-f\d]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];
    if(!token||token.length>1000||revoked.has(hash(token)))return null;
    const [body,signature]=token.split('.');if(!equal(sign(body),signature))return null;
    try{const value=JSON.parse(Buffer.from(body,'base64url').toString());return value.username===credentials().username&&value.expires>Date.now()?{...value,token}:null;}catch{return null;}
  }
  function cookie(res,token,maxAge){res.setHeader('Set-Cookie',`travel_admin=${token}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=${maxAge}${secureCookies()?'; Secure':''}`);}
  return async(req,res,url)=>{
    const parts=url.pathname.split('/').filter(Boolean).slice(2),method=req.method;
    const json=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    const config=credentials();
    if(!['GET','POST','PATCH','DELETE'].includes(method))fail(405,'허용되지 않은 요청입니다.');
    if(method!=='GET'){
      const origin=req.headers.origin;if(!origin||![requestOrigin(req),publicUrl()].includes(origin))fail(403,'같은 사이트에서 요청해주세요.');
      if(!req.headers['content-type']?.startsWith('application/json'))fail(415,'JSON 요청이 필요합니다.');
    }
    if(!config.password){if(method==='GET'&&parts[0]==='auth')return json({configured:false,authenticated:false});fail(503,'Vercel 환경변수에 ADMIN_USERNAME과 ADMIN_PASSWORD를 설정하고 다시 배포해주세요.');}
    const session=sessionOf(req);
    if(parts[0]==='auth'&&parts.length===1&&method==='GET')return json({configured:true,authenticated:Boolean(session),...(session?{username:session.username}:{})});
    if(parts[0]==='login'&&parts.length===1&&method==='POST'){
      const address=hash(req.socket?.remoteAddress||'unknown'),now=Date.now();
      for(const [key,value]of attempts)if(value.until<=now)attempts.delete(key);
      for(const [key,expires]of revoked)if(expires<=now)revoked.delete(key);
      if(attempts.size>=2000&&!attempts.has(address))fail(429,'잠시 후 다시 로그인해주세요.');
      const previous=attempts.get(address);if(previous?.count>=5)fail(429,'로그인 시도가 많습니다. 15분 후 다시 시도해주세요.');
      const body=await readBody(req);attempts.set(address,{count:(previous?.count||0)+1,until:previous?.until||now+15*60000});
      if(!equal(body.username||'',config.username)||!equal(body.password||'',config.password))fail(401,'관리자 아이디 또는 비밀번호가 맞지 않습니다.');
      attempts.delete(address);const value={username:config.username,expires:now+ttl,nonce:randomBytes(16).toString('hex')},encoded=Buffer.from(JSON.stringify(value)).toString('base64url');cookie(res,encoded+'.'+sign(encoded),ttl/1000);return json({ok:true,username:config.username});
    }
    if(!session)fail(401,'관리자 로그인이 필요합니다.');
    if(parts[0]==='logout'&&parts.length===1&&method==='POST'){revoked.set(hash(session.token),session.expires);cookie(res,'',0);return json({ok:true});}
    if(parts[0]!=='users')fail(404,'없는 관리 기능입니다.');
    if(parts.length===1&&method==='GET'){
      const page=Number(url.searchParams.get('page')||0);if(!Number.isInteger(page)||page<0||page>500)fail(400,'페이지를 확인해주세요.');
      const search=String(url.searchParams.get('q')||'').trim();if(search.length>200)fail(400,'검색어는 200자 이내로 입력해주세요.');
      return json(await store.list(page,search));
    }
    if(parts.length===2&&method==='DELETE'){
      const id=uuid(parts[1]),body=await readBody(req),current=await store.get(id);
      if(!current)fail(404,'여행 앱 회원을 찾을 수 없습니다.');
      if(body.revision!==current.revision)fail(409,'회원 정보가 변경됐습니다. 다시 조회해주세요.');
      if(body.email!==current.email)fail(400,'삭제할 회원의 이메일을 정확히 입력해주세요.');
      await store.remove(id,current.revision);return json({ok:true,message:'회원 계정을 삭제했습니다.'});
    }
    if(parts.length!==2||method!=='PATCH')fail(405,'허용되지 않은 요청입니다.');
    const id=uuid(parts[1]),body=await readBody(req),changes=validateAdminChanges(body),current=await store.get(id);
    if(!current)fail(404,'여행 앱 회원을 찾을 수 없습니다.');
    if(!body.revision||!equal(body.revision,current.revision))fail(409,'회원 정보가 변경됐습니다. 목록을 새로고침하고 다시 수정해주세요.');
    return json({user:await store.update(id,changes,current.revision),message:changes.password?'회원 정보와 새 비밀번호를 저장했습니다.':'회원 정보를 저장했습니다.'});
  };
}

export function createLocalAdminStore({db,derive,onRename=()=>{}}){
  const view=row=>row&&({id:row.id,email:row.email,name:row.name,confirmed:true,created:row.created||'',lastLogin:row.last_login||'',trips:db.prepare('SELECT t.id,t.owner,t.document FROM trips t JOIN members m ON m.trip_id=t.id WHERE m.user_id=?').all(row.id).map(t=>{const d=JSON.parse(t.document);return {id:t.id,name:d.name,start:d.start,end:d.end,role:t.owner===row.id?'owner':'editor'};}),revision:hash(JSON.stringify([row.id,row.email,row.name,row.password]))});
  return {async get(id){return view(db.prepare('SELECT * FROM users WHERE id=?').get(id))||null;},async list(page,search=''){const q='%'+search.replace(/[\\%_]/g,'\\$&')+'%',rows=db.prepare("SELECT * FROM users WHERE name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\' ORDER BY id LIMIT 21 OFFSET ?").all(q,q,q,page*20);return {users:rows.slice(0,20).map(view),page,hasMore:rows.length>20};},async remove(id,revision){
    db.exec('BEGIN IMMEDIATE');try{const current=view(db.prepare('SELECT * FROM users WHERE id=?').get(id));if(!current||current.revision!==revision)fail(409,'회원 정보가 변경됐습니다. 다시 조회해주세요.');if(current.trips.length)fail(409,'참여 중인 여행을 먼저 정리해주세요. 공동 여행은 소유권을 이전하거나 참여 해제해야 합니다.');db.prepare('DELETE FROM users WHERE id=?').run(id);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
  },async update(id,changes,revision){
    let password;
    if(changes.password){const salt=randomBytes(16).toString('hex');password=salt+':'+(await derive(changes.password,salt,64)).toString('hex');}
    let trips=[];db.exec('BEGIN IMMEDIATE');
    try{
      const old=db.prepare('SELECT * FROM users WHERE id=?').get(id);if(!old)fail(404,'회원을 찾을 수 없습니다.');if(view(old).revision!==revision)fail(409,'회원 정보가 변경됐습니다. 다시 조회해주세요.');
      if(old.name!==changes.name){trips=db.prepare('SELECT trip_id FROM members WHERE user_id=?').all(id).map(row=>row.trip_id);for(const trip of trips)db.prepare('UPDATE trips SET version=version+1,updated=? WHERE id=?').run(new Date().toISOString(),trip);}
      db.prepare('UPDATE users SET name=?,email=?,password=? WHERE id=?').run(changes.name,changes.email,password||old.password,id);
      if(password||changes.email!==old.email)db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');if(error.code?.includes('SQLITE')&&String(error.message).includes('UNIQUE'))fail(409,'이미 사용 중인 이메일입니다.');throw error;}
    trips.forEach(onRename);return view(db.prepare('SELECT * FROM users WHERE id=?').get(id));
  }};
}

export function createCloudAdminStore(client){
  const errorOf=error=>{if(error)fail(error.status===422||error.status===400?400:503,error.code==='email_exists'||error.code==='email_address_not_authorized'?'사용 중이거나 사용할 수 없는 이메일입니다.':'회원 정보를 변경하지 못했습니다. 입력 정보와 Supabase 상태를 확인해주세요.');};
  const view=(profile,user)=>({id:profile.id,name:profile.name,email:user.email||'',confirmed:Boolean(user.email_confirmed_at),created:user.created_at||'',lastLogin:user.last_sign_in_at||'',revision:hash(JSON.stringify([profile.id,profile.name,user.email,user.updated_at]))});
  async function tripsOf(id){const {data,error}=await client.from('travel_workspaces').select('id,owner,document').contains('members',JSON.stringify([{id}]));errorOf(error);return (data||[]).map(t=>({id:t.id,name:t.document.name,start:t.document.start,end:t.document.end,role:t.owner===id?'owner':'editor'}));}
  async function get(id){const {data:profile,error}=await client.from('travel_profiles').select('id,name').eq('id',id).maybeSingle();errorOf(error);if(!profile)return null;const auth=await client.auth.admin.getUserById(id);errorOf(auth.error);return auth.data.user?view(profile,auth.data.user):null;}
  async function renameTrips(id,name){
    const {data:rows,error}=await client.from('travel_workspaces').select('id,members,version').contains('members',JSON.stringify([{id}]));errorOf(error);
    for(const initial of rows||[]){let row=initial,done=false;for(let i=0;i<4;i++){
      if(!row||!row.members.some(m=>m.id===id&&m.name!==name)){done=true;break;}
      const result=await client.from('travel_workspaces').update({members:row.members.map(m=>m.id===id?{...m,name}:m),version:row.version+1,updated:new Date().toISOString()}).eq('id',row.id).eq('version',row.version).select('id').maybeSingle();errorOf(result.error);if(result.data){done=true;break;}
      const fresh=await client.from('travel_workspaces').select('id,members,version').eq('id',row.id).maybeSingle();errorOf(fresh.error);row=fresh.data;
    }if(!done)fail(409,'회원 정보는 저장됐지만 여행 이름 표시는 아직 갱신되지 않았습니다. 다시 저장해주세요.');}
  }
  return {async get(id){const user=await get(id);return user?{...user,trips:await tripsOf(id)}:null;},async list(page,search=''){
    const matches=[],q=search.toLowerCase();let offset=0,finished=false;
    while(!finished&&matches.length<(page+1)*20+1){
      const {data,error}=await client.from('travel_profiles').select('id,name').order('id').range(offset,offset+199);errorOf(error);const profiles=data||[];finished=profiles.length<200;offset+=200;
      for(let i=0;i<profiles.length;i+=5){const batch=await Promise.all(profiles.slice(i,i+5).map(async profile=>{const response=await client.auth.admin.getUserById(profile.id);errorOf(response.error);return response.data.user?view(profile,response.data.user):null;}));matches.push(...batch.filter(user=>user&&[user.name,user.email,user.id].some(value=>value.toLowerCase().includes(q))));}
    }
    const users=await Promise.all(matches.slice(page*20,page*20+20).map(async user=>({...user,trips:await tripsOf(user.id)})));
    return {users,page,hasMore:matches.length>(page+1)*20};
  },async remove(id,revision){
    const current=await get(id);if(!current||current.revision!==revision)fail(409,'회원 정보가 변경됐습니다. 다시 조회해주세요.');
    if((await tripsOf(id)).length)fail(409,'참여 중인 여행을 먼저 정리해주세요. 공동 여행은 소유권을 이전하거나 참여 해제해야 합니다.');
    const ready=await client.rpc('travel_admin_delete_ready');if(ready.error||ready.data!==true)fail(503,'Supabase SQL Editor에서 supabase/admin.sql을 먼저 실행해주세요.');
    const result=await client.auth.admin.deleteUser(id);if(result.error)fail(409,'계정을 삭제하지 못했습니다. 참여 여행과 다른 앱의 연결 데이터를 확인해주세요.');
  },async update(id,changes){
    const previous=await client.auth.admin.getUserById(id);errorOf(previous.error);
    const attributes={email:changes.email,...(previous.data.user.email!==changes.email?{email_confirm:true}:{}),user_metadata:{...previous.data.user.user_metadata,name:changes.name},...(changes.password?{password:changes.password}:{})};
    const auth=await client.auth.admin.updateUserById(id,attributes);errorOf(auth.error);
    const profile=await client.from('travel_profiles').upsert({id,name:changes.name});
    if(profile.error)fail(503,'인증 정보는 저장됐지만 이름 반영이 완료되지 않았습니다. 같은 내용으로 다시 저장해주세요.');
    await renameTrips(id,changes.name);return get(id);
  }};
}
