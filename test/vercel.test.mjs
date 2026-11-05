import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { existsSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readJsonBody, publicUrl, requestOrigin, secureCookies, contentSecurityPolicy } from '../runtime.mjs';
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

test('실제 HTTP와 Vercel의 CSP가 Google 지도·검색을 허용하고 임의 스크립트는 차단한다',async t=>{
  const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
  const deployed=config.headers.find(h=>h.source==='/(.*)').headers.find(h=>h.key==='Content-Security-Policy').value;
  assert.equal(deployed,contentSecurityPolicy,'정적 페이지와 서버의 보안 정책이 다르면 배포 후 지도가 차단됨');
  const directives=Object.fromEntries(deployed.split(';').map(s=>s.trim().split(/\s+/)).filter(p=>p[0]).map(([name,...values])=>[name,values]));
  const allows=(directive,url)=>directives[directive].includes(new URL(url).origin);
  for(const script of ['https://maps.googleapis.com/maps/api/js','https://maps.googleapis.com/maps-api-v3/api/js/module.js','https://maps.gstatic.com/maps-api-v3/api/js/module.js'])assert.equal(allows('script-src',script),true,script);
  for(const endpoint of ['https://places.googleapis.com/v1/places:searchText','https://mapsresources-pa.googleapis.com/v1/tiles','https://maps.googleapis.com/maps/api/mapsjs/mapConfigs'])assert.equal(allows('connect-src',endpoint),true,endpoint);
  assert.equal(allows('script-src','https://attacker.example/script.js'),false);assert.equal(allows('script-src','https://storage.googleapis.com/untrusted/script.js'),false);
  assert.ok(!directives['script-src'].includes("'unsafe-inline'"));assert.ok(!directives['script-src'].includes("'unsafe-eval'"));assert.deepEqual(directives['frame-ancestors'],["'none'"]);
  const previous=process.env.STORAGE_BACKEND;process.env.STORAGE_BACKEND='sqlite';
  const app=createApp({dataDir:mkdtempSync(path.join(tmpdir(),'travel-csp-'))});
  if(previous===undefined)delete process.env.STORAGE_BACKEND;else process.env.STORAGE_BACKEND=previous;
  t.after(()=>app.close());app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
  const base='http://127.0.0.1:'+app.server.address().port;
  for(const route of ['/','/google-maps.js','/api/auth']){
    const response=await fetch(base+route);assert.equal(response.status,200);assert.equal(response.headers.get('content-security-policy'),contentSecurityPolicy,route);await response.text();
  }
});
