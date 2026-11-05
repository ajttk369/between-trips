import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

export async function cloudFixture(){
  const db=new PGlite(),tokens=new Map(),users=new Map();
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);');
  await db.exec(readFileSync(new URL('../../supabase/schema.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../../supabase/ai.sql',import.meta.url),'utf8'));
  const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
  function session(actor){const access=`${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:actor.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.${randomUUID()}`;tokens.set(access,actor);return{user:actor,access_token:access,refresh_token:'fixture-refresh',expires_in:3600,token_type:'bearer'};}
  async function register(email,name='검증용 여행자'){
    const user={id:randomUUID(),email,user_metadata:{name}};users.set(email,user);
    await db.query('insert into auth.users values($1)',[user.id]);await db.query('insert into travel_profiles values($1,$2)',[user.id,name]);
    const auth=session(user);return{user:{id:user.id,name,email},cookie:'travel_sb_access='+auth.access_token,actor:user};
  }
  async function fetchImpl(input,init={}){
    const url=new URL(String(input)),headers=new Headers(init.headers),method=init.method||'GET',body=init.body?JSON.parse(init.body):{};
    if(url.pathname==='/auth/v1/user'){const actor=tokens.get((headers.get('Authorization')||'').replace(/^Bearer /,''));return actor?response(actor):response({code:'bad_jwt',message:'invalid token'},401);}
    if(url.pathname==='/auth/v1/token'){const actor=users.get(body.email);return actor?response(session(actor)):response({code:'invalid_credentials',message:'Invalid credentials'},400);}
    if(url.pathname==='/auth/v1/signup'){const existing=users.get(body.email);const actor=existing||(await register(body.email,body.data?.name)).actor;return response(session(actor));}
    if(url.pathname.startsWith('/auth/v1/logout'))return response({});
    try{
      if(url.pathname.startsWith('/rest/v1/rpc/')){
        const name=url.pathname.split('/').at(-1);if(!['travel_command','travel_ai_command'].includes(name))throw Error('Unexpected RPC');
        const keys=Object.keys(body);if(keys.some(k=>!/^p_[a-z_]+$/.test(k)))throw Error('Invalid RPC argument');
        const result=await db.query(`select public.${name}(${keys.map((k,i)=>`${k}=>$${i+1}`).join(',')}) result`,keys.map(k=>body[k]));
        return response(result.rows[0].result);
      }
      const table=url.pathname.split('/').at(-1);
      if(!['travel_profiles','travel_workspaces','travel_invites','travel_ai_chats','travel_ai_limits'].includes(table))throw Error('Unexpected table');
      if(method==='POST'&&table==='travel_profiles'){const row=Array.isArray(body)?body[0]:body;await db.query('insert into travel_profiles values($1,$2) on conflict(id) do update set name=excluded.name',[row.id,row.name]);return response(null,201);}
      if(method!=='GET')throw Error('Unexpected method');
      const select=url.searchParams.get('select')||'*';if(!/^[a-z_*,]+$/.test(select))throw Error('Invalid select');
      const params=[],where=[];
      for(const [column,value]of url.searchParams){
        if(['select','order','limit'].includes(column))continue;
        if(!['id','trip_id','user_id','token','used','expires','members'].includes(column))throw Error('Unexpected filter');
        const op=value.slice(0,value.indexOf('.')),argument=value.slice(value.indexOf('.')+1);params.push(op==='cs'?JSON.stringify(JSON.parse(argument)):argument);
        const operator={eq:'=',gt:'>',cs:'@>'}[op];if(!operator)throw Error('Invalid operator');where.push(`${column} ${operator} $${params.length}${op==='cs'?'::jsonb':''}`);
      }
      const order=url.searchParams.get('order'),limit=url.searchParams.get('limit');
      const result=await db.query(`select ${select} from ${table}${where.length?' where '+where.join(' and '):''}${order==='updated.desc'?' order by updated desc':''}${limit==='0'?' limit 0':''}`,params);
      if(headers.get('Accept')?.includes('vnd.pgrst.object'))return response(result.rows[0]||null);
      return response(result.rows);
    }catch(error){return response({code:error.code||'22P02',message:error.message},400);}
  }
  return{db,register,fetchImpl,close:()=>db.close()};
}
