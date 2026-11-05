// Isolated PostgreSQL + fake model + headless Edge. No live OpenAI/Supabase calls.
import {createApp} from '../server.mjs';
import {createDocument,applyMutation} from '../travel-domain.mjs';
import {prepareProposal} from '../ai-planner.mjs';
import {cloudFixture} from './fixtures/cloud.mjs';
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {once} from 'node:events';
import assert from 'node:assert/strict';
Object.assign(process.env,{STORAGE_BACKEND:'supabase',SUPABASE_URL:'https://fixture.supabase.test',SUPABASE_SERVICE_ROLE_KEY:'test-only-key',OPENAI_API_KEY:'test-only-no-network',GOOGLE_MAPS_API_KEY:'',GEOAPIFY_API_KEY:'',PUBLIC_URL:'',COOKIE_SECURE:'false'});delete process.env.VERCEL;
const folder=path.resolve('test-output/assistant-qa');mkdirSync(folder,{recursive:true});
const fixture=await cloudFixture(),account=await fixture.register('review@example.test','검토 사용자');
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:fixture.fetchImpl}});
const doc=createDocument({name:'샘플 · AI 검토 테스트',country:'일본',city:'도쿄',start:'2027-01-01',end:'2027-01-03',currency:'JPY'},account.user);
applyMutation(doc,{action:'upsert',collection:'places',value:{name:'샘플 예약 식당',category:'식사',address:'사용자가 직접 입력한 주소',note:'직접 쓴 장소 메모',lat:35.68,lng:139.76}},account.user);
for(const [name,startTime,done]of [['샘플 예약 식당','12:00',false],['완료한 관광지','14:00',true],['삭제 검토 카페','16:00',false]])applyMutation(doc,{action:'upsert',collection:'itinerary',value:{name,placeId:name==='샘플 예약 식당'?doc.places[0].id:'',date:doc.start,startTime,duration:60,category:'기타',done,note:'사용자 예약 메모 보존',cost:2000,currency:'JPY'}},account.user);
const normalId=doc.itinerary[0].id,doneId=doc.itinerary[1].id,deleteId=doc.itinerary[2].id;
const trip=(await admin.rpc('travel_command',{p_action:'create',p_trip:randomUUID(),p_actor:account.user.id,p_name:account.user.name,p_document:doc})).data;
const source='https://example.org/ai-review',search={output:[{type:'web_search_call',action:{sources:[{url:source,title:'샘플 출처 — 검증용 장소 소개'}]}}]};
const make=value=>({operation:'add',target:'itinerary',id:'',placeId:'',name:'추가 검토 식당',category:'식사',date:doc.start,startTime:'18:00',endTime:'19:00',duration:60,cost:null,currency:'JPY',mode:'transit',address:'샘플 주소',note:'AI가 쓴 추천 메모',reason:'샘플 추천 이유',sourceUrls:[source],...value});
let lastProposal;
const planGenerator=async({trip,message})=>{
 if(message.includes('실패'))throw Error('fixture failure');
 const old=trip.itinerary.find(i=>i.id===normalId);
 const changes=[make({operation:'update',id:normalId,placeId:old.placeId,name:old.name,category:old.category,startTime:'13:00',endTime:'14:00',sourceUrls:[]})];
 if(trip.itinerary.some(i=>i.id===deleteId))changes.push(make({operation:'remove',id:deleteId,name:'삭제 검토 카페'}));
 if(trip.itinerary.some(i=>i.id===doneId))changes.push(make({operation:'update',id:doneId,name:'완료한 관광지',category:'기타',startTime:'15:00',endTime:'16:00',sourceUrls:[]}));
 if(!trip.itinerary.some(i=>i.name==='추가 검토 식당'))changes.push(make({}));
 const result=prepareProposal({reply:'샘플 변경안입니다. 검토 후 반영하세요.',changes},search,trip);lastProposal=result.proposal;return result;
};
const app=createApp({cloudFetch:fixture.fetchImpl,planGenerator});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');const origin='http://127.0.0.1:'+app.server.address().port;
const runId=Date.now();let browser,ws,serial=0;const pending=new Map(),errors=[];const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function command(method,params={}){const id=++serial;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},12000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const result=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;}
async function wait(expression){for(let i=0;i<60;i++){if(await evaluate(expression))return;await sleep(150);}throw Error('UI timeout '+expression+' '+await evaluate('document.body.innerText')); }
const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
async function screenshot(name){const {data}=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(path.join(folder,name+'.png'),Buffer.from(data,'base64'));}
async function viewport(width){await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<=760});await sleep(200);}
async function fits(label){const metrics=await evaluate(`({width:innerWidth,scroll:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth),over:[...document.querySelectorAll('main, .topbar, dialog[open]')].filter(e=>e.offsetWidth).map(e=>({name:e.className||e.tagName,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right}))})`);assert.ok(metrics.scroll<=metrics.width+1,label+' overflow '+JSON.stringify(metrics));for(const box of metrics.over)assert.ok(box.left>=-1&&box.right<=metrics.width+1,label+' '+JSON.stringify(box));}
try{
  browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-sandbox','--disable-features=RendererCodeIntegrity','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions','--remote-debugging-port=0','--user-data-dir='+path.join(folder,'profile-'+runId),origin],{windowsHide:true,stdio:'ignore'});
  const portFile=path.join(folder,'profile-'+runId,'DevToolsActivePort');for(let i=0;i<100&&!existsSync(portFile);i++)await sleep(100);if(!existsSync(portFile))throw Error('Edge debugging did not start');
  let port;for(let i=0;i<100;i++){try{port=readFileSync(portFile,'utf8').split('\n')[0];if(port)break;}catch{}await sleep(100);}if(!port)throw Error('Edge port file unavailable');const target=await(await fetch('http://127.0.0.1:'+port+'/json/new?'+encodeURIComponent(origin),{method:'PUT'})).json();
  ws=new WebSocket(target.webSocketDebuggerUrl);await once(ws,'open');ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){const item=pending.get(message.id);if(item){pending.delete(message.id);message.error?item.reject(Error(JSON.stringify(message.error))):item.resolve(message.result);}}else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);});
  await command('Page.enable');await command('Runtime.enable');await command('Network.enable');await command('Network.setBlockedURLs',{urls:['https://*']});

  const cookie=account.cookie.split('=');await command('Network.setCookie',{name:cookie[0],value:cookie.slice(1).join('='),url:origin});
  await command('Page.navigate',{url:origin+'/?qa='+runId+'#trip='+trip.id});await wait('!!document.querySelector(".trip-banner")');await click('[data-tab="assistant"]');await wait('!!document.querySelector("#ai-message")&&!document.querySelector("#ai-message").disabled');
  async function send(message){await evaluate('document.querySelector("#ai-message").value='+JSON.stringify(message)+';document.querySelector("#ai-message").dispatchEvent(new Event("input",{bubbles:true}));document.querySelector("#assistant-form").requestSubmit();');await wait('!document.querySelector("#ai-message").disabled');}
  await send('일정 시간을 조정하고 카페는 삭제해줘');await wait('document.querySelectorAll(".assistant-change").length===4');
  const proposal=lastProposal,remove=proposal.changes.find(c=>c.operation==='remove'),completed=proposal.changes.find(c=>c.id===doneId);
  assert.equal(await evaluate('document.querySelectorAll("[data-ai-select]:checked").length'),2);
  assert.equal(await evaluate('document.querySelector('+JSON.stringify('[data-ai-select="'+remove.changeId+'"]')+').checked'),false);assert.equal(await evaluate('document.querySelector('+JSON.stringify('[data-ai-select="'+completed.changeId+'"]')+').checked'),false);
  for(const width of [320,375,760,768,1000,1440]){
    await viewport(width);if(await evaluate('!document.querySelector(".proposal-content").offsetHeight'))await click('[data-action="ai-toggle-proposal"]');
    await fits('AI populated review '+width);assert.ok(await evaluate('document.querySelector(".ai-diff").innerText.includes("12:00")&&document.querySelector(".ai-diff").innerText.includes("13:00")'));
    const diff=await evaluate('(()=>{const el=document.querySelector(".ai-diff");return {width:el.clientWidth,scroll:el.scrollWidth}})()');assert.ok(diff.scroll<=diff.width+1,JSON.stringify({width,diff}));if(width===375){await evaluate('window.scrollTo(0,0)');await screenshot('assistant-chat-mobile');await evaluate('document.querySelector("#ai-proposal").scrollIntoView({block:"start"})');await screenshot('assistant-review-mobile');}if(width===1440){await evaluate('window.scrollTo(0,0)');await screenshot('assistant-review-desktop');}
  }
  await viewport(375);await click('[data-action="ai-select-all"]');assert.equal(await evaluate('document.querySelectorAll("[data-ai-select]:checked").length'),2);
  for(const c of [remove,completed])await evaluate('(()=>{const input=document.querySelector('+JSON.stringify('[data-ai-select="'+c.changeId+'"]')+');input.checked=true;input.dispatchEvent(new Event("change",{bubbles:true}));})()');
  await click('[data-action="ai-apply"]');await wait('document.querySelector("#modal").open');assert.equal(await evaluate('document.querySelector("#modal-form").checkValidity()'),false);await fits('AI confirmation mobile');await screenshot('assistant-delete-confirm-mobile');
  assert.equal((await fixture.db.query('select version from travel_workspaces where id=$1',[trip.id])).rows[0].version,1);
  await evaluate('document.querySelectorAll("#modal-form [type=checkbox][required]").forEach(input=>input.checked=true);document.querySelector("#modal-form").requestSubmit()');await wait('!document.querySelector("#modal").open');await wait('document.querySelectorAll(".assistant-change").length===0');
  let stored=(await fixture.db.query('select document from travel_workspaces where id=$1',[trip.id])).rows[0].document;
  assert.equal(stored.itinerary.find(i=>i.id===normalId).note,'사용자 예약 메모 보존');assert.equal(stored.itinerary.find(i=>i.id===normalId).startTime,'13:00');assert.equal(stored.itinerary.find(i=>i.id===doneId).done,true);assert.ok(!stored.itinerary.some(i=>i.id===deleteId));assert.ok(stored.itinerary.find(i=>i.name==='추가 검토 식당').aiSuggestion.includes('추천 이유'));
  await send('실패 검증');await wait('document.querySelector(".form-error")?.textContent.length>0');assert.equal(await evaluate('document.querySelector("#ai-message").value'),'실패 검증');
  await send('최신 제안을 만들어줘');await wait('document.querySelectorAll(".assistant-change").length>0');
  // A direct fixture write simulates a partner edit without a UI event notification.
  await fixture.db.query('update travel_workspaces set version=version+1 where id=$1',[trip.id]);
  await click('[data-action="ai-apply"]');await wait('!!document.querySelector("[data-action=ai-rebase]")');assert.equal(await evaluate('document.querySelector("[data-action=ai-apply]").disabled'),true);await click('[data-action="ai-rebase"]');assert.ok(await evaluate('document.querySelector("#ai-message").value.includes("최신 일정")'));
  assert.deepEqual(errors,[]);console.log('PASS: AI populated mobile/desktop review, delete/completed confirmation, real SQL apply, preserved notes, failed-send recovery and stale-proposal protection.');
}finally{try{if(ws?.readyState===1)await command('Browser.close');}catch{}ws?.close();browser?.kill();await app.close();await fixture.close();}
