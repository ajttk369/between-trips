import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readJsonBody, publicUrl, requestOrigin, secureCookies } from '../runtime.mjs';
import { createApp } from '../server.mjs';
import handler from '../api/handler.js';

test('Vercel이 미리 파싱한 JSON과 일반 HTTP body를 모두 처리',async()=>{
  assert.deepEqual(await readJsonBody({body:{email:'test@example.test'}}),{email:'test@example.test'});
  assert.deepEqual(await readJsonBody({body:Buffer.from('{"ok":true}')}),{ok:true});
  assert.deepEqual(await readJsonBody(Readable.from(['{"name":"여행"}'])),{name:'여행'});
  await assert.rejects(readJsonBody({body:'{invalid'}),e=>e.status===400);
  await assert.rejects(readJsonBody({body:{note:'a'.repeat(2_000_001)}}),e=>e.status===413);
});

test('클라우드 모드는 로컬 디렉터리나 SQLite 파일을 생성하지 않는다',async()=>{
  const before={...process.env};
  try{
    Object.assign(process.env,{STORAGE_BACKEND:'supabase',SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-server-only-key'});
    const dataDir=path.resolve('test-output',`must-not-exist-${randomUUID()}`);
    const app=createApp({dataDir});assert.equal(app.db,null);assert.equal(existsSync(dataDir),false);
    await new Promise(resolve=>app.server.close(resolve));
  }finally{for(const k of Object.keys(process.env))if(!(k in before))delete process.env[k];Object.assign(process.env,before);}
});

test('Vercel API 진입점: 환경변수 검사·경로 변환·HTTPS 출처·Secure 쿠키',async()=>{
  const before={...process.env};
  const invoke=async(route,{method='GET',body,origin}={})=>{
    const req={url:'/api/handler?__route='+encodeURIComponent(route),query:{__route:route},method,body,headers:{host:'our-trip.vercel.app','content-type':'application/json',...(origin?{origin}:{})},socket:{remoteAddress:'127.0.0.1'}};
    const res={headers:{},setHeader(k,v){this.headers[k]=v;},writeHead(status,h={}){this.status=status;Object.assign(this.headers,h);this.headersSent=true;},end(body){this.body=body;}};
    await handler(req,res);return {status:res.status,headers:res.headers,data:JSON.parse(res.body),url:req.url};
  };
  try{
    delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SERVICE_ROLE_KEY;delete process.env.PUBLIC_URL;
    assert.equal((await invoke('auth')).status,503);
    Object.assign(process.env,{STORAGE_BACKEND:'supabase',SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-key',VERCEL_PROJECT_PRODUCTION_URL:'our-trip.vercel.app'});
    const me=await invoke('auth');assert.equal(me.status,200);assert.equal(me.data.user,null);assert.equal(me.url,'/api/auth');
    const logout=await invoke('auth/logout',{method:'POST',body:{},origin:'https://our-trip.vercel.app'});assert.equal(logout.status,200);assert.ok(logout.headers['Set-Cookie'].every(c=>c.includes('; Secure')));
    assert.equal((await invoke('auth/logout',{method:'POST',body:{},origin:'https://other.example'})).status,403);
    assert.equal(publicUrl(),'https://our-trip.vercel.app');assert.equal(requestOrigin({headers:{host:'our-trip.vercel.app'}}),'https://our-trip.vercel.app');assert.equal(secureCookies(),true);
  }finally{for(const k of Object.keys(process.env))if(!(k in before))delete process.env[k];Object.assign(process.env,before);}
});

test('배포 설정은 API 함수와 정적 파일을 분리하고 비밀 파일을 제외',()=>{
  const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.equal(config.outputDirectory,'dist');assert.equal(config.rewrites[0].source,'/api/:path*');
  const ignore=readFileSync(new URL('../.vercelignore',import.meta.url),'utf8');assert.match(ignore,/(^|\n)\.env(\n|$)/);assert.match(ignore,/data\//);
  for(const f of ['index.html','app.js','vendor/leaflet.js','setup.sql'])assert.ok(existsSync(new URL('../dist/'+f,import.meta.url)),f);
  for(const f of ['.env','data/travel.sqlite','server.mjs'])assert.equal(existsSync(new URL('../dist/'+f,import.meta.url)),false,f);
});
