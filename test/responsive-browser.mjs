// Windows Edge의 격리된 프로필과 테스트 DB만 사용합니다. 운영 서비스에는 연결하지 않습니다.
import {createApp} from '../server.mjs';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {once} from 'node:events';
import assert from 'node:assert/strict';
Object.assign(process.env,{STORAGE_BACKEND:'sqlite',GOOGLE_MAPS_API_KEY:'',GEOAPIFY_API_KEY:'',OPENAI_API_KEY:'',PUBLIC_URL:'',COOKIE_SECURE:'false',ADMIN_USERNAME:'admin',ADMIN_PASSWORD:'qa-admin-pass'});delete process.env.VERCEL;
const folder=path.resolve('test-output/responsive-qa');mkdirSync(folder,{recursive:true});
const app=createApp({dataDir:path.join(folder,'data-'+Date.now())});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');const origin='http://127.0.0.1:'+app.server.address().port;
const runId=Date.now();let browser,ws,serial=0;const pending=new Map(),errors=[];const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function command(method,params={}){const id=++serial;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},12000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const result=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;}
async function wait(expression){for(let i=0;i<60;i++){if(await evaluate(expression))return;await sleep(150);}throw Error('UI timeout '+expression);}
const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
async function screenshot(name){const {data}=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(path.join(folder,name+'.png'),Buffer.from(data,'base64'));}
async function viewport(width){await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<=760});await sleep(200);}
async function fits(label){const metrics=await evaluate(`({width:innerWidth,scroll:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth),over:[...document.querySelectorAll('main, .topbar, dialog[open]')].filter(e=>e.offsetWidth).map(e=>({name:e.className||e.tagName,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right}))})`);assert.ok(metrics.scroll<=metrics.width+1,label+' overflow '+JSON.stringify(metrics));for(const box of metrics.over)assert.ok(box.left>=-1&&box.right<=metrics.width+1,label+' '+JSON.stringify(box));}
try{
  browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-sandbox','--disable-features=RendererCodeIntegrity','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions','--remote-debugging-port=0','--user-data-dir='+path.join(folder,'profile-'+runId),origin],{windowsHide:true,stdio:'ignore'});
  const portFile=path.join(folder,'profile-'+runId,'DevToolsActivePort');for(let i=0;i<100&&!existsSync(portFile);i++)await sleep(100);if(!existsSync(portFile))throw Error('Edge debugging did not start');
  const port=readFileSync(portFile,'utf8').split('\n')[0];const target=await(await fetch('http://127.0.0.1:'+port+'/json/new?'+encodeURIComponent(origin),{method:'PUT'})).json();
  ws=new WebSocket(target.webSocketDebuggerUrl);await once(ws,'open');ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){const item=pending.get(message.id);if(item){pending.delete(message.id);message.error?item.reject(Error(JSON.stringify(message.error))):item.resolve(message.result);}}else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);});
  await command('Page.enable');await command('Runtime.enable');await command('Network.enable');await command('Network.setBlockedURLs',{urls:['https://*']});
  await viewport(1440);await command('Page.navigate',{url:origin});await wait(`!!document.querySelector('[data-travel-gallery]')`);await screenshot('login-desktop');
  const before=await evaluate(`document.querySelector('.gallery-count').textContent`);await click('[data-gallery-action="next"]');await wait(`document.querySelector('.gallery-count').textContent!==${JSON.stringify(before)}`);assert.ok(await evaluate(`document.querySelector('.gallery-photo').naturalWidth>0`));
  await click('[data-gallery-action="pause"]');assert.equal(await evaluate(`document.querySelector('[data-gallery-action="pause"]').getAttribute('aria-pressed')`),'true');
  for(const width of [320,375,760,768,1024,1440]){await viewport(width);await fits('login '+width);if(width===375)await screenshot('login-mobile');}
  function client(){let cookie='';return async(route,method='GET',body)=>{const res=await fetch(origin+'/api'+route,{method,headers:{'Content-Type':'application/json',Cookie:cookie},body:body?JSON.stringify(body):undefined});if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];const value=await res.json();if(!res.ok)throw Error(JSON.stringify(value));return {value,cookie};};}
  const api=client(),other=client();const account=await api('/auth/register','POST',{name:'샘플 사용자',email:'layout@example.test',password:'preview-password-123'});await other('/auth/register','POST',{name:'동행 샘플',email:'partner@example.test',password:'preview-password-123'});
  let trip=(await api('/trips','POST',{name:'샘플 · 둘이 걷는 도쿄 여행',country:'일본',city:'도쿄',type:'overseas',start:'2027-01-01',end:'2027-01-04',currency:'JPY',rates:{KRW:1,JPY:9}})).value;
  const invite=(await api('/trips/'+trip.id+'/invites','POST',{})).value;trip=(await other('/join','POST',{code:invite.code})).value;
  async function add(collection,value){trip=(await api('/trips/'+trip.id,'PATCH',{version:trip.version,action:'upsert',collection,value})).value;}
  for(const [name,category,lat,lng]of [['샘플 · 산책하며 들르는 관광지','관광',35.68,139.76],['샘플 · 긴 이름의 조용한 동네 카페','카페',35.69,139.77],['샘플 · 저녁 식사','식사',35.7,139.78]])await add('places',{name,category,address:'일본 도쿄 신주쿠구 · 화면 검증용 긴 주소입니다.',lat,lng,cost:2000,currency:'JPY',note:'샘플 메모입니다. '.repeat(12)});
  for(const [i,p]of trip.places.entries())await add('itinerary',{placeId:p.id,date:trip.start,startTime:['10:00','13:00','18:00'][i],duration:60,cost:2000,currency:'JPY',note:'샘플 일정 메모'});
  await add('stays',{name:'샘플 · 도쿄 숙소',address:'샘플 숙소 주소',checkIn:trip.start,checkOut:trip.end,status:'예약 완료',lat:35.675,lng:139.755,cost:30000,currency:'JPY'});
  await add('reservations',{name:'샘플 · 공항에서 도심으로 가는 기차 예약',date:trip.start,cost:3000,currency:'JPY',note:'실제 예약이 아닙니다.'});await add('tasks',{name:'샘플 · 여권과 예약 정보를 함께 확인하기',category:'할 일',assignee:account.value.user.id});await add('expenses',{name:'샘플 · 교통비',date:trip.start,amount:3000,currency:'JPY',payer:account.value.user.id,share:50});
  const cookie=account.cookie.split('=');await command('Network.setCookie',{name:cookie[0],value:cookie.slice(1).join('='),url:origin});
  await command('Page.navigate',{url:origin+'/?qa=1#trip='+trip.id});try{await wait(`!!document.querySelector('.trip-banner')`);}catch(error){console.log('UI diagnostic',await evaluate(`document.body.innerText`),errors);throw error;}
  for(const width of [320,375,760,768,1000,1024,1440]){
    await viewport(width);
    for(const tab of ['itinerary','places','stays','tasks','budget','assistant']){if(width<=760&&!['itinerary','places'].includes(tab)){await click('[data-action="mobile-trip-more"]');await click('dialog [data-tab="'+tab+'"]');}else await click('[data-tab="'+tab+'"]');await sleep(80);await fits(tab+' '+width);}
    await click('[data-tab="itinerary"]');
    if(width<=1000){if(width<=760){assert.ok(await evaluate(`document.querySelector('.mobile-trip-nav').offsetHeight>0`));await click('.mobile-trip-nav [data-view="map"]');}else{assert.ok(await evaluate(`document.querySelector('.mobile-toggle').offsetHeight>0`));await click('[data-action="show-map"]');}await wait(`document.querySelector('#map').offsetHeight>0`);await fits('map '+width);if(width===768)await screenshot('map-tablet');if(width<=760)await click('.mobile-trip-nav [data-view="list"]');else await click('[data-action="show-list"]');}
    assert.equal(await evaluate(`document.querySelectorAll('[data-action="route"],.route-query-slot').length`),0);assert.equal(await evaluate(`document.querySelector('.route-summary')?.textContent`),'이동');
    const routeAlignment=await evaluate(`(()=>{const rows=[...document.querySelectorAll('.route-actions')];const coordinates=rows.map(row=>{const select=row.querySelector('select').getBoundingClientRect(),link=row.querySelector('a').getBoundingClientRect(),button=row.querySelector('button')?.getBoundingClientRect();return {selectX:select.x,linkX:link.x,centerGap:Math.abs(select.y+select.height/2-link.y-link.height/2),buttonGap:button?Math.abs(button.y+button.height/2-link.y-link.height/2):0}});return coordinates})()`);
    assert.ok(routeAlignment.every(row=>Math.abs(row.selectX-routeAlignment[0].selectX)<1&&Math.abs(row.linkX-routeAlignment[0].linkX)<1&&row.centerGap<1&&row.buttonGap<1),JSON.stringify({width,routeAlignment}));await fits('route alignment '+width);
    if(width===375)await screenshot('itinerary-mobile');if(width===1440)await screenshot('itinerary-desktop');
    if(width<=760){await click('[data-action="mobile-add"]');await click('dialog [data-action="new-itinerary"]');}else await click('[data-action="new-itinerary"]');await fits('form '+width);if(width<=760)assert.ok(await evaluate(`parseFloat(getComputedStyle(document.querySelector('dialog input')).fontSize)>=16`));await click('[data-action="close-modal"]');
    if(width<=760){await click('[data-action="mobile-menu"]');await wait(`!!document.querySelector('.mobile-menu-list')`);await fits('menu '+width);await click('[data-action="close-modal"]');}
  }
  await viewport(375);await click('[data-action="mobile-trip-more"]');await click('dialog [data-tab="tasks"]');
  const checkbox='[data-action="toggle-task"]';
  assert.equal(await evaluate(`(()=>{document.querySelector('button[data-action="toggle-task"]').click();return document.querySelector('button[data-action="toggle-task"]').getAttribute('aria-pressed');})()`),'true');
  await wait(`!document.querySelector('.task-pending')`);
  const alignment=await evaluate(`(()=>{const b=document.querySelector('button[data-action="toggle-task"]').getBoundingClientRect(),s=document.querySelector('button[data-action="toggle-task"] svg').getBoundingClientRect();return {x:Math.abs((b.left+b.right-s.left-s.right)/2),y:Math.abs((b.top+b.bottom-s.top-s.bottom)/2)}})()`);assert.ok(alignment.x<1&&alignment.y<1,JSON.stringify(alignment));await fits('checked task mobile');await screenshot('tasks-mobile');
  await click('[data-action="mobile-trip-more"]');await click('dialog [data-tab="budget"]');await click('[data-action="mobile-add"]');await click('dialog [data-action="new-expense"]');
  assert.ok(await evaluate(`document.querySelector('[name="includeSettlement"]').checked`));
  await evaluate(`document.querySelector('[name="name"]').value='샘플 · 내가 내는 선물';document.querySelector('[name="amount"]').value='1000';document.querySelector('[name="includeSettlement"]').checked=false;document.querySelector('#modal-form').requestSubmit();`);
  await wait(`!document.querySelector('#modal').open`);const saved=(await api('/trips/'+trip.id)).value;assert.equal(saved.expenses.at(-1).excludeFromSettlement,true);assert.equal(saved.tasks[0].done,true);await fits('expense mobile');
  await click('.mobile-trip-nav [data-view="list"]');assert.equal(await evaluate(`document.querySelectorAll('.event-details[open]').length`),0);
  await click('[data-event-details] summary');await wait(`document.querySelector('[data-event-details]').open`);
  await click('[data-action="select-item"]');assert.ok(await evaluate(`document.querySelector('[data-event-details]').open`));await screenshot('expanded-event-mobile');
  await click('[data-event-details] summary');await wait(`!document.querySelector('[data-event-details]').open`);await screenshot('compact-event-mobile');
  await click('.day-overview>summary');await wait(`document.querySelector('.day-overview').open`);assert.ok(await evaluate(`document.querySelector('.day-overview .quick-expanded')!==null`));await fits('expanded day overview mobile');await click('.day-overview>summary');
  const completedId=trip.itinerary[0].id,completeButton='[data-action="toggle-event-done"][data-id="'+completedId+'"]';
  assert.equal(await evaluate(`(()=>{const button=document.querySelector(${JSON.stringify(completeButton)});button.click();return button.getAttribute('aria-pressed')})()`),'true');
  await wait(`!document.querySelector('.event-complete.pending')`);assert.equal((await other('/trips/'+trip.id)).value.itinerary[0].done,true);await fits('itinerary completed mobile');await screenshot('completed-event-mobile');
  await command('Page.reload',{ignoreCache:true});await wait(`!!document.querySelector(${JSON.stringify(completeButton)})`);assert.equal(await evaluate(`document.querySelector(${JSON.stringify(completeButton)}).getAttribute('aria-pressed')`),'true');
  await click(completeButton);await wait(`!document.querySelector('.event-complete.pending')`);
  const modeId=trip.itinerary[1].id;
  await evaluate(`(()=>{const select=document.querySelector('[data-route-mode="${modeId}"]');select.value='transit';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await wait(`document.querySelector('[data-route-mode="${modeId}"]')?.value==='transit'&&!document.querySelector('[data-route-mode="${modeId}"]').disabled`);assert.equal((await other('/trips/'+trip.id)).value.itinerary[1].mode,'transit');assert.ok(await evaluate(`document.querySelector('[data-route-mode="${modeId}"]').parentElement.querySelector('a').href.includes('travelmode=transit')`));
  await viewport(1440);await evaluate(`(()=>{const panel=document.querySelector('.planner-grid>.panel');panel.style.minHeight='1600px';window.scrollTo(0,document.querySelector('.planner-grid').getBoundingClientRect().top+window.scrollY+120)})()`);await sleep(100);
  const sticky=await evaluate(`({position:getComputedStyle(document.querySelector('.planner-grid>.map-panel')).position,top:document.querySelector('.planner-grid>.map-panel').getBoundingClientRect().top})`);assert.equal(sticky.position,'sticky');assert.ok(Math.abs(sticky.top-92)<2,JSON.stringify(sticky));await screenshot('sticky-map-desktop');
  await evaluate(`document.querySelector('.planner-grid>.panel').style.minHeight='';window.scrollTo(0,0)`);await viewport(375);
  await click('[data-mode="journey"]');await wait(`!!document.querySelector('.journey-view')`);assert.ok(await evaluate(`document.querySelector('.journey-view').innerText.includes('미리보기')`));await fits('journey preview mobile');
  await command('Page.addScriptToEvaluateOnNewDocument',{source:`{const RealDate=Date;const instant='2027-01-01T01:30:00Z';globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[instant]));}static now(){return new RealDate(instant).getTime();}};}`});
  await command('Page.reload',{ignoreCache:true});await wait(`!!document.querySelector('.journey-view')`);
  assert.equal(await evaluate(`document.querySelector('.journey-next h3').textContent`),trip.places[1].name);
  for(const width of [320,375,768,1440]){await viewport(width);await fits('during-trip '+width);if(width===375)await screenshot('journey-mobile');if(width===1440)await screenshot('journey-desktop');}
  await click('.journey-next [data-action="journey-event"]');await wait(`!document.querySelector('.journey-view')`);assert.ok(await evaluate(`!!document.querySelector('.event-details[open]')`));
  await viewport(375);await click('[data-action="mobile-trip-more"]');await click('dialog [data-tab="budget"]');
  const sourceId=trip.itinerary[0].id,sourceButton=`[data-action="record-estimate"][data-id="${sourceId}"]`;
  await click(sourceButton);assert.equal(await evaluate(`document.querySelector('[name="syncEstimate"]').checked`),false);
  await evaluate(`document.querySelector('[name="amount"]').value='58000';document.querySelector('[name="currency"]').value='KRW';document.querySelector('#modal-form').requestSubmit();`);await wait(`!document.querySelector('#modal').open`);
  let linked=(await api('/trips/'+trip.id)).value;assert.equal(linked.itinerary[0].cost,2000);assert.equal(linked.expenses.find(e=>e.sourceId===sourceId).amount,58000);
  const count=linked.expenses.length;assert.equal(await evaluate(`document.querySelector(${JSON.stringify(sourceButton)}).textContent`),'지출 수정');
  await click(sourceButton);assert.equal(await evaluate(`document.querySelector('[name="amount"]').value`),'58000');assert.equal(await evaluate(`document.querySelector('[name="currency"]').value`),'KRW');
  await evaluate(`document.querySelector('[name="syncEstimate"]').checked=true;document.querySelector('#modal-form').requestSubmit();`);await wait(`!document.querySelector('#modal').open`);
  linked=(await api('/trips/'+trip.id)).value;assert.equal(linked.itinerary[0].cost,58000);assert.equal(linked.itinerary[0].currency,'KRW');assert.equal(linked.expenses.length,count);await fits('linked estimate mobile');await screenshot('linked-expense-mobile');
  await command('Page.navigate',{url:origin+'/admin.html'});await wait(`!!document.querySelector('#admin-login')`);await fits('admin login');
  await evaluate(`document.querySelector('#admin-login [name="username"]').value='admin';document.querySelector('#admin-login [name="password"]').value='qa-admin-pass';document.querySelector('#admin-login').requestSubmit();`);await wait(`document.querySelectorAll('.user-card').length===2`);
  for(const width of [320,375,768,1440]){await viewport(width);await fits('admin '+width);await click('[data-edit="'+account.value.user.id+'"]');await fits('admin editor '+width);assert.equal(await evaluate(`document.querySelector('#user-password').value`),'');await click('[data-close]');}
  await viewport(375);await click('[data-edit="'+account.value.user.id+'"]');await evaluate(`document.querySelector('#user-name').value='관리자가 수정한 이름';document.querySelector('#user-email').value='updated-layout@example.test';document.querySelector('#user-form').requestSubmit();`);await wait(`!document.querySelector('#user-editor').open`);await wait(`document.querySelector('#user-list').innerText.includes('updated-layout@example.test')`);await screenshot('admin-mobile');
  await click('#logout');await wait(`!!document.querySelector('#admin-login')`);assert.equal(await evaluate(`document.querySelectorAll('.user-card').length`),0);
  assert.deepEqual(errors,[]);console.log('PASS: responsive layouts, task checks, settlement exclusion, compact cards, during-trip screen, linked actual editing and optional estimate synchronization.');
}finally{try{if(ws?.readyState===1)await command('Browser.close');}catch{}ws?.close();browser?.kill();await app.close();}
