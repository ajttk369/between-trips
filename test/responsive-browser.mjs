// Windows Edge의 격리된 프로필과 테스트 DB만 사용합니다. 운영 서비스에는 연결하지 않습니다.
import {createApp} from '../server.mjs';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {once} from 'node:events';
import assert from 'node:assert/strict';
Object.assign(process.env,{STORAGE_BACKEND:'sqlite',GOOGLE_MAPS_API_KEY:'',GEOAPIFY_API_KEY:'',OPENAI_API_KEY:'',PUBLIC_URL:'',COOKIE_SECURE:'false'});delete process.env.VERCEL;
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
    for(const tab of ['itinerary','places','stays','tasks','budget','assistant']){await click('[data-tab="'+tab+'"]');await sleep(80);await fits(tab+' '+width);}
    await click('[data-tab="itinerary"]');
    if(width<=1000){assert.ok(await evaluate(`document.querySelector('.mobile-toggle').offsetHeight>0`));await click('[data-action="show-map"]');await wait(`document.querySelector('#map').offsetHeight>0`);await fits('map '+width);if(width===768)await screenshot('map-tablet');await click('[data-action="show-list"]');}
    if(width===375)await screenshot('itinerary-mobile');if(width===1440)await screenshot('itinerary-desktop');
    await click('[data-action="new-itinerary"]');await fits('form '+width);if(width<=760)assert.ok(await evaluate(`parseFloat(getComputedStyle(document.querySelector('dialog input')).fontSize)>=16`));await click('[data-action="close-modal"]');
    if(width<=760){await click('[data-action="mobile-menu"]');await wait(`!!document.querySelector('.mobile-menu-list')`);await fits('menu '+width);await click('[data-action="close-modal"]');}
  }
  assert.deepEqual(errors,[]);console.log('PASS: real Edge layout checks at 320/375/760/768/1000/1024/1440px, six tabs, tablet map switch, dialogs, mobile menu and gallery controls.');
}finally{try{if(ws?.readyState===1)await command('Browser.close');}catch{}ws?.close();browser?.kill();await app.close();}
