import {createTaskUpdates} from './task-updates.js';
import {galleryMarkup,initTravelGalleries} from './travel-gallery.js';
import {attachmentBytes,attachmentLimit,attachmentTypes} from './attachment-data.js';
import {listOffline,saveOffline,removeOffline,clearOffline} from './offline-store.js';
import { readReview, writeReview, removeReview } from './review-state.js';
import { configureGoogleMaps, clearGoogleLocations, googleLocation, loadGoogleMaps, searchGooglePlaces, resolveGooglePlaces, googleCityCenter, createGoogleMap } from './google-maps.js';
import { daysBetween, distance, hasCoords, converted, budgetOf, itineraryWarnings, recommendations, travelClock, nextTravelStop, mergeLocationCandidate, overviewForDay, journeyOverview } from './domain.js';

const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const paths = { plane:'m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13', grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z', pin:'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z', heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z', calendar:'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z', plus:'M12 5v14M5 12h14', arrow:'M5 12h14m-6-6 6 6-6 6', chevron:'m9 5 7 7-7 7', back:'m15 18-6-6 6-6', down:'m6 9 6 6 6-6', up:'m6 15 6-6 6 6', check:'m5 12 4 4L19 6', close:'m6 6 12 12M6 18 18 6', share:'M16 5a3 3 0 1 0 6 0 3 3 0 0 0-6 0ZM2 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0ZM16 19a3 3 0 1 0 6 0 3 3 0 0 0-6 0ZM8 11l8-5M8 13l8 5', hotel:'M3 21V7h18v14M8 7V3h8v4M8 11h1m6 0h1m-8 4h1m6 0h1m-6 6v-3h4v3', wallet:'M3 6V4h15v4M3 6v13h18V8H5a2 2 0 0 1-2-2ZM16 12h5v4h-5z', list:'M8 6h13M8 12h13M8 18h13M3 6h.1M3 12h.1M3 18h.1', bag:'M5 7h14l2 14H3L5 7ZM8 8V6a4 4 0 1 1 8 0v2', search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z', edit:'m16 3 5 5-13 13H3v-5L16 3ZM14 5l5 5', trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7', logout:'M9 3H3v18h6M9 12h12m-4-4 4 4-4 4', lock:'M6 10h12v11H6zM8 10V6a4 4 0 1 1 8 0v4', clock:'M12 7v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z', link:'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2', chat:'M21 11a9 9 0 0 1-9 9H3l1-5a9 9 0 1 1 17-4Z', download:'M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6', upload:'M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5', spark:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z', coffee:'M3 3h14v12a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V3ZM17 5h2a3 3 0 1 1 0 6h-2M2 23h18', food:'M4 2v7a3 3 0 0 0 6 0V2M7 2v20M20 2c-4 2-5 9-1 10h1M20 2v20', car:'m5 6 2-4h10l2 4 2 3v10h-3v-3H6v3H3V9l2-3ZM3 10h18M6 13h.1M18 13h.1', walk:'M15 5h.1M12 8l-3 5-4 1M12 8l4 4 4 1M12 8l2 8 4 5M14 16l-4 5M17 3a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z', map:'m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6ZM9 3v15M15 6v15', users:'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M12 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM17 2a4 4 0 0 1 0 8M23 21v-2a4 4 0 0 0-3-3.8', refresh:'M20 8V3l-3 3M4 16v5l3-3M20 8a8 8 0 0 0-14-3M4 16a8 8 0 0 0 14 3' };
const icon = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.pin}"/></svg>`;
const catIcon = c => ({ '식사':'food', '카페':'coffee', '쇼핑':'bag', '숙소':'hotel', '이동':'car' }[c] || 'pin');
const linkHost = url => {try{return new URL(url).hostname.replace(/^www\./,'');}catch{return '관련 페이지';}};
const categories = ['관광','식사','카페','쇼핑','숙소','이동','기타'];
const currencies = ['KRW','JPY','USD','EUR','GBP','CNY','TWD','THB','VND','AUD','SGD'];
const num = x => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(Number(x) || 0);
const money = (n, c = 'KRW') => new Intl.NumberFormat('ko-KR', { style:'currency', currency:c, maximumFractionDigits: c === 'KRW' || c === 'JPY' ? 0 : 2 }).format(Number(n) || 0);
const dateShort = d => d ? `${Number(d.slice(5,7))}.${Number(d.slice(8,10))}` : '';
const weekday = d => new Intl.DateTimeFormat('ko-KR',{weekday:'short',timeZone:'UTC'}).format(new Date(`${d}T12:00:00Z`));
const today = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
const km = d => d == null ? '위치 미등록' : d < 1000 ? `${Math.round(d)}m` : `${(d/1000).toFixed(1)}km`;
const act = (action, label, cls = 'btn secondary', attrs = '') => `<button type="button" class="${cls}" data-action="${action}" ${attrs}>${label}</button>`;
const iBtn = (action, name, label, attrs = '') => act(action,icon(name),'icon-btn',`aria-label="${label}" title="${label}" ${attrs}`);
const brand = `<div class="brand"><span class="brand-symbol"><img src="/travel-logo.png?v=1" width="38" height="38" alt=""></span><div>여행의 사이<small>BETWEEN OUR TRIPS</small></div></div>`;
const state = { user:null, trips:[], trip:null, tab:'itinerary', day:'', filter:'all', category:'all', listFilter:'upcoming', selected:null, mapMode:false, config:{}, routes:{}, save:'저장 완료', stream:null, connected:false, aiChats:{}, aiDrafts:{}, aiDates:{}, aiSelections:{}, aiLocations:{}, aiExpanded:{}, reviewError:false, quickExpanded:false, journeyMode:null, expandedEvents:new Set(), mapWide:false, mapFocus:'all', placeSelection:[], offlineIds:new Set(), offlineVersions:{} };
let disposeGallery=()=>{};
let modalRevision = null,locationPicker=null,locationMarker=null,mapRenderToken=0,pickerToken=0,googlePickerReady=Promise.resolve();
function disposeLocationPicker(){pickerToken++;locationPicker?.remove();locationPicker=null;locationMarker=null;}
let map, mapLayer, mapSizeTimer, toastTimer, modalHandler, authMode = 'login', inviteValue = new URLSearchParams(location.search).get('invite') || '';

function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 5000); }
async function api(url, options = {}) {
  const response = await fetch(`/api${url}`, { ...options, headers:{ 'Content-Type':'application/json', ...options.headers }, body: options.body ? JSON.stringify(options.body) : undefined });
  let data; try { data = await response.json(); } catch { throw new Error('서버 응답을 확인할 수 없어요. 연결 후 다시 시도해주세요.'); }
  if (!response.ok) { const error = new Error(data.error || '요청에 실패했어요.'); error.status = response.status; throw error; }
  return data;
}
function setSave(value) { state.save = value; const el = $('.save-state'); if (el) el.innerHTML = `<span class="status-dot ${value !== '저장 완료' ? 'pending' : ''}"></span>${esc(value)}`; }
function disposeMap() { clearTimeout(mapSizeTimer); if (map) { map.stop();map.remove(); map = null; mapLayer = null; } }
function pollTrip(id) {
  let closed=false,timer=null;const controller=new AbortController();
  const watcher={close(){closed=true;clearTimeout(timer);controller.abort();}};state.stream=watcher;
  const check=async()=>{
    if(closed||state.trip?.id!==id)return;
    try {
      if(!document.hidden){
        const trip=await api('/trips/'+id,{signal:controller.signal});
        if(closed||state.trip?.id!==id)return;
        state.connected=true;
        if(trip.version>state.trip.version){state.trip=trip;state.routes={};state.trips=state.trips.map(t=>t.id===id?trip:t);render();}
        updateConnection();
      }
    }catch(error){
      if(closed||error.name==='AbortError')return;
      state.connected=false;updateConnection();
      if(error.status===401){await forgetOffline();watcher.close();state.user=null;state.trip=null;render();toast('다시 로그인해주세요.');return;}
      if(error.status===403){await removeOffline(id).catch(()=>{});state.offlineIds.delete(id);watcher.close();state.trip=null;state.trips=state.trips.filter(t=>t.id!==id);try{await loadTrips();}catch{}render();toast('여행 접근 권한이 변경되었어요.');return;}
    }finally{if(!closed)timer=setTimeout(check,4000);}
  };
  check();
}
function streamTrip() {
  state.stream?.close(); state.stream = null; state.connected = false;
  if (!state.trip) return;
  if(state.config.liveMode==='poll'){pollTrip(state.trip.id);return;}
  const id = state.trip.id, stream = new EventSource(`/api/trips/${id}/events`); state.stream = stream;
  stream.addEventListener('ready', () => { state.connected = true; updateConnection(); refreshTrip(id); });
  stream.addEventListener('change', () => refreshTrip(id));
  stream.addEventListener('auth_refresh',async()=>{stream.close();try{const{user}=await api('/auth');if(!user){state.user=null;state.trip=null;render();return;}if(state.trip?.id===id)streamTrip();}catch{state.connected=false;updateConnection();}});
  stream.addEventListener('unavailable',()=>{state.connected=false;updateConnection();});
  stream.addEventListener('access', () => { stream.close(); state.trip = null; state.save = '접근 권한 변경'; loadTrips().then(render).catch(e=>toast(e.message)); toast('여행 접근 권한이 변경되었어요.'); });
  stream.onerror = () => { state.connected = false; updateConnection(); };
}
function updateConnection() { const el = $('#connection'); if (el) el.textContent = state.connected ? '함께 보는 중 · 변경 사항 자동 반영' : '연결 확인 중 · 자동 재연결'; }
async function refreshTrip(id) {
  try { const t = await api(`/trips/${id}`); if (state.trip?.id !== id) return; if (t.version > state.trip.version) { state.trip = t; state.routes = {}; state.trips = state.trips.map(x=>x.id===id?t:x); render(); } }
  catch(e) { if (e.status === 401 || e.status === 403) { await removeOffline(id).catch(()=>{});state.offlineIds.delete(id);state.stream?.close(); toast(e.message); } }
}
async function openCurrentTripOrDashboard(){const t=state.trips.find(t=>nextTravelStop(t).during);if(t&&!inviteValue)await openTrip(t.id);else render();}
async function loadTrips() { state.trips = await api('/trips');await reconcileOffline(); }
async function openTrip(id) {
  try { state.trip = await api(`/trips/${id}`); state.day = nextTravelStop(state.trip).date; state.tab = 'itinerary'; state.journeyMode=null;state.expandedEvents.clear();state.filter = 'all'; state.category = 'all'; state.routes={}; state.selected = null; location.hash = `trip=${id}`; streamTrip(); render(); }
  catch(e) { toast(e.message); }
}
async function mutate(payload, expected = state.trip.version) {
  const id = state.trip.id; if($('#modal').open && modalRevision!=null)expected=modalRevision; setSave('저장 중…');
  try { const t = await api(`/trips/${id}`,{method:'PATCH',body:{...payload,version:expected}}); state.trip=t; state.routes={}; state.trips=state.trips.map(x=>x.id===id?t:x); setSave('저장 완료'); render(); return t; }
  catch(e) { setSave('저장 실패 · 다시 시도'); if (e.status===409) await refreshTrip(id); throw e; }
}
const taskUpdates=createTaskUpdates({
  scope:()=>`${state.user?.id||''}/${state.trip?.id||''}`,
  getTrip:()=>state.trip,
  send:(id,body)=>api('/trips/'+id,{method:'PATCH',body,signal:AbortSignal.timeout(10000)}),
  read:id=>api('/trips/'+id,{signal:AbortSignal.timeout(10000)}),
  commit:trip=>{state.trip=trip;state.trips=state.trips.map(t=>t.id===trip.id?trip:t);},
  change:(busy,failed)=>{setSave(busy?'저장 중…':failed?'저장 실패 · 다시 시도':'저장 완료');updateTaskView();},
  error:error=>toast('체크 상태를 저장하지 못했어요. '+(error.message||'연결 후 다시 눌러주세요.'))
});
function updateTaskView(){
  if(state.tab!=='tasks'||!state.trip)return;const view=$('#tasks-view');if(!view)return;
  const focused=document.activeElement,action=view.contains(focused)?focused.dataset.action:null,id=focused?.dataset.id;
  view.outerHTML=renderTasks();
  if(action&&id)$('#tasks-view').querySelector(`[data-action="${action}"][data-id="${id}"]`)?.focus({preventScroll:true});
}
const memberName = id => state.trip?.members.find(m=>m.id===id)?.name || '이전 참여자';
const avatars = members => `<div class="avatars">${members.map((m,i)=>`<span class="avatar ${i?'second':''}" title="${esc(m.name)}">${esc(m.name.slice(0,1))}</span>`).join('')}</div>`;
function empty(title, description, button = '', ic = 'pin') { return `<div class="empty">${icon(ic)}<h3>${title}</h3><p>${description}</p>${button}</div>`; }

function render() {
  disposeGallery();
  const retained=map?.provider==='google'&&state.trip&&state.tab==='itinerary'?map:null;
  if(!retained)disposeMap();mapRenderToken++;
  if (!state.user) { renderAuth(); return; }
  const trip = state.trip;
  if(trip)syncOffline(trip);
  $('#app').innerHTML = `<div class="shell ${trip?'has-trip':''}"><aside class="sidebar">${brand}<div class="nav-label">여행 관리</div>${act('home',`${icon('grid')}<span>내 여행</span><span class="count">${state.trips.length}</span>`,`nav-btn ${!trip?'active':''}`)}${act('join',`${icon('users')}<span>초대받은 여행 참여</span>`,'nav-btn')}${act('import',`${icon('upload')}<span>여행 가져오기</span>`,'nav-btn')}<div class="nav-label">최근 여행</div>${state.trips.slice(0,4).map(t=>act('open-trip',`${icon(t.type==='domestic'?'map':'plane')}<span>${esc(t.name)}</span>`,`nav-btn ${trip?.id===t.id?'active':''}`,`data-id="${t.id}"`)).join('')}<div class="sidebar-bottom"><div class="profile"><span class="avatar">${esc(state.user.name.slice(0,1))}</span><div class="profile-text"><strong>${esc(state.user.name)}</strong><span>여행 계정</span></div>${iBtn('logout','logout','로그아웃')}</div></div></aside><div class="workspace"><header class="topbar">${act('mobile-menu',icon('list'),'icon-btn mobile-menu-button','aria-label="여행 메뉴 열기"')}${brand}${trip?'<strong class="mobile-trip-title">'+esc(trip.name)+'</strong>':''}<div class="breadcrumb">${icon('grid')}<span>워크스페이스</span>${icon('chevron')}<strong>${trip?esc(trip.name):'내 여행'}</strong></div><div class="topbar-right">${trip?`<span class="save-state"><span class="status-dot ${state.save!=='저장 완료'?'pending':''}"></span>${esc(state.save)}</span>${avatars(trip.members)}`:`<span class="muted small">${esc(state.user.name)}님의 여행 공간</span>`}${trip?act('share',`${icon('share')}<span>함께 계획하기</span>`,'btn soft'):''}${iBtn('logout','logout','로그아웃')}</div></header><main class="main">${trip?renderTrip():renderDashboard()}</main></div></div>`;
  if(retained&&$('#map'))$('#map').replaceWith(retained.node);
  if (trip && state.tab==='itinerary') initMap();
  disposeGallery=initTravelGalleries();
  document.querySelectorAll('.sidebar .nav-btn').forEach(button=>button.setAttribute('aria-label',button.textContent.trim()));
  updateConnection();
  if(trip&&state.tab==='assistant')afterAssistantRender();
  if(trip&&usingGoogle()&&!$('.journey-view')&&(!$('#map')||!$('#map').offsetParent))resolveGooglePlaces([...trip.places,...trip.stays,...Object.entries(state.aiLocations).filter(([key])=>key.startsWith(trip.id+':'+state.aiChats[trip.id]?.proposal?.id+':')).map(([,value])=>value)]).then(changed=>{if(changed&&state.trip?.id===trip.id)render();}).catch(()=>toast('Google 장소 위치를 불러오지 못했어요. 지도 연결을 확인해주세요.'));
}
function renderAuth() {
  disposeGallery();
  $('#app').innerHTML=`<main class="auth-page"><section class="auth-story">${brand}<div class="auth-story-copy"><div class="eyebrow">여행 계획</div><h1>여행 계획을<br>함께 정리하세요.</h1><p>장소를 저장하고 날짜별 일정을 만드세요.<br>동행과 함께 수정할 수 있어요.</p></div>${galleryMarkup('auth')}</section><section class="auth-form-wrap"><div class="auth-box"><div class="eyebrow">여행의 사이</div><h2>${authMode==='login'?'로그인':'회원가입'}</h2><p>${inviteValue?'로그인하면 초대받은 여행에 참여할 수 있어요.':authMode==='register'?'이름과 이메일을 입력해 계정을 만드세요.':'이메일과 비밀번호로 로그인하세요.'}</p><div class="auth-tabs">${act('auth-login','로그인',authMode==='login'?'active':'')}${act('auth-register','회원가입',authMode==='register'?'active':'')}</div>${state.config.storage==='supabase'?`<div class="info-note" style="margin-bottom:18px">${state.config.storageStatus?.ready?'Supabase Auth · 여행 기록은 클라우드에 저장돼요.':`${esc(state.config.storageStatus?.message||'Supabase 연결 준비가 필요해요.')} <a href="/setup.html" style="text-decoration:underline">연결 준비 안내 →</a>`}</div>`:''}<form id="auth-form" class="stack">${authMode==='register'?field('name','이름','',{required:true,placeholder:'이름 또는 닉네임',max:40,autocomplete:'nickname'}):''}${field('email','이메일','',{type:'email',required:true,placeholder:'hello@example.com',autocomplete:'email'})}${field('password','비밀번호','',{type:'password',required:true,minlength:10,max:200,placeholder:'10자 이상 입력해주세요',autocomplete:authMode==='login'?'current-password':'new-password'})}<div class="form-error" id="auth-error"></div><button class="btn primary" type="submit">${authMode==='login'?'로그인':'계정 만들기'}${icon('arrow')}</button></form><p class="auth-note">${icon('lock')} 여행 기록은 초대된 두 사람에게만 보여요.<br>같은 여행에 접속하면 변경 사항이 자동으로 반영돼요.<br><a href="/privacy.html" target="_blank" rel="noopener">개인정보 안내</a> · <a href="/terms.html" target="_blank" rel="noopener">이용 안내</a></p></div></section></main>`;
  disposeGallery=initTravelGalleries();
  $('#auth-form').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,b=Object.fromEntries(new FormData(form)),button=form.querySelector('button[type=submit]');button.disabled=true;$('#auth-error').textContent='';try{const result=await api(`/auth/${authMode}`,{method:'POST',body:b});if(result.confirmationRequired){authMode='login';renderAuth();$('#auth-error').textContent=result.message;return;}state.user=result.user;await loadTrips();await openCurrentTripOrDashboard();if(inviteValue)joinDialog(inviteValue);}catch(error){$('#auth-error').textContent=error.message;}finally{button.disabled=false;}};
}
function tripCard(t) {
  const count = daysBetween(t.start,t.end).length, d = Math.ceil((Date.parse(`${t.start}T00:00:00+09:00`)-Date.now())/86400000);
  return `<button class="trip-card" data-action="open-trip" data-id="${t.id}"><div class="trip-cover ${t.type==='domestic'?'domestic':''}">${t.image?`<img src="${esc(t.image)}" alt="${esc(t.city)} 여행 대표 이미지" loading="lazy">`:''}<span class="badge">${t.sample?'샘플 여행':t.type==='domestic'?'국내여행':'해외여행'}</span><span class="days">${d>0?`D-${d}`:t.end<today()?'다녀온 여행':'여행 중'}</span></div><div class="trip-card-content"><h3>${esc(t.name)}</h3><p>${icon('pin')}${esc(t.country)} · ${esc(t.city)}</p><p class="metric-line">${t.start.replaceAll('-','.')} — ${t.end.replaceAll('-','.')}<span class="tag">${count-1}박 ${count}일</span></p><div class="trip-card-foot">${avatars(t.members)}<span>저장한 장소 ${t.places.length} · 일정 ${t.itinerary.length}</span></div></div></button>`;
}
function renderDashboard() {
  const upcoming=state.trips.filter(t=>t.end>=today()).toSorted((a,b)=>a.start.localeCompare(b.start)),past=state.trips.filter(t=>t.end<today()).toSorted((a,b)=>b.end.localeCompare(a.end)),shown=state.listFilter==='past'?past:upcoming;
  return `<div class="heading"><div><h1>내 여행</h1><p>${state.trips.length?'다가오는 여행을 준비하고 지난 여행을 돌아보세요.':'첫 여행을 만들고 동행을 초대하세요.'}</p></div>${act('new-trip',icon('plus')+'새 여행','btn primary')}</div>${!state.trips.length?'<section class="welcome-hero"><div class="hero-copy"><div class="eyebrow">여행 준비</div><h2>가고 싶은 곳을 저장하고<br>일정을 함께 정리하세요.</h2><p>국내·해외 여행의 숙소, 일정, 준비물과 지출을<br>한곳에 기록하세요.</p></div>'+galleryMarkup('intro')+'</section>':''}${inviteValue?'<div class="intro-banner">'+icon('users')+'<span class="grow">함께 여행하자는 초대가 도착했어요.</span>'+act('join','초대 확인','btn soft sm')+'</div>':''}<div class="dashboard-list-head"><div class="filter-row">${act('list-upcoming','예정된 여행 <span>'+upcoming.length+'</span>','pill '+(state.listFilter==='upcoming'?'active':''))}${act('list-past','지난 여행 <span>'+past.length+'</span>','pill '+(state.listFilter==='past'?'active':''))}</div><div class="row wrap">${act('join',icon('users')+'초대 코드로 참여','btn ghost sm')}${act('more','가져오기 · 샘플','btn ghost sm')}</div></div><div class="trip-grid">${shown.map(tripCard).join('')}${shown.length?'<button class="new-card" data-action="new-trip"><span>+</span><strong>다음 여행 추가하기</strong></button>':''}</div>${!shown.length&&state.trips.length?empty(state.listFilter==='past'?'아직 지난 여행이 없어요':'예정된 여행이 없어요','새 여행을 만들거나 다른 여행 목록을 확인하세요.','','calendar'):''}<p class="footer-note">© 여행의 사이 · <a href="/privacy.html" target="_blank" rel="noopener">개인정보 안내</a> · <a href="/terms.html" target="_blank" rel="noopener">이용 안내</a></p>`;
}
function renderMobileTripTools(){
  const t=state.trip,more=!['itinerary','places'].includes(state.tab);
  return '<nav class="mobile-trip-nav" aria-label="여행 하단 메뉴">'+
    act('tab',icon('calendar')+'<span>일정</span>',state.tab==='itinerary'&&!state.mapMode?'active':'',`data-tab="itinerary" data-view="list" aria-pressed="${state.tab==='itinerary'&&!state.mapMode}"`)+
    act('tab',icon('heart')+'<span>장소</span>',state.tab==='places'?'active':'',`data-tab="places" aria-pressed="${state.tab==='places'}"`)+
    act('tab',icon('map')+'<span>지도</span>',state.tab==='itinerary'&&state.mapMode?'active':'',`data-tab="itinerary" data-view="map" aria-pressed="${state.tab==='itinerary'&&state.mapMode}"`)+
    act('mobile-trip-more',icon('list')+'<span>더보기</span>',more?'active':'')+'</nav>'+act('mobile-add',icon('plus')+'추가','btn primary mobile-add-button');
}
function mobileTripMore(){
  const choices=[['stays','hotel','숙소·예약'],['tasks','bag','준비물'],['budget','wallet','예산·정산'],['assistant','spark','AI 도우미']];
  modal('여행 메뉴','<div class="mobile-more-grid">'+choices.map(([key,ic,label])=>act('tab',icon(ic)+label,'btn secondary',`data-tab="${key}" data-mobile-nav="true"`)).join('')+'</div><div class="divider"></div><div class="mobile-menu-list">'+act('edit-trip',icon('edit')+'여행 정보 수정','btn ghost','data-mobile-nav="true"')+act('offline-save',icon('download')+'오프라인 저장','btn ghost','data-mobile-nav="true"')+act('export',icon('download')+'여행 파일 내보내기','btn ghost','data-mobile-nav="true"')+act('home',icon('back')+'내 여행 목록','btn ghost','data-mobile-nav="true"')+(state.trip.owner===state.user.id?act('delete-trip',icon('trash')+'여행 삭제','btn danger','data-mobile-nav="true"'):'')+'</div>','',null);
}
function mobileAddDialog(){
  modal('무엇을 추가할까요?','<div class="mobile-more-grid">'+[['new-itinerary','calendar','일정'],['new-place','pin','장소'],['new-expense','wallet','지출'],['new-task','bag','준비물'],['new-stay','hotel','숙소'],['new-reservation','plane','예약']].map(([action,ic,label])=>act(action,icon(ic)+label,'btn secondary','data-mobile-nav="true"')).join('')+'</div>','',null);
}
function renderDayOverview(){
  if(!window.matchMedia('(max-width: 760px)').matches)return renderTravelQuick();
  const stay=overviewForDay(state.trip,state.day).stay;
  return '<details class="mobile-day-overview"><summary>'+icon('hotel')+'<span>'+esc(stay?.name||'숙소·하루 요약')+'</span><small>요약 보기</small>'+icon('down')+'</summary>'+renderTravelQuick()+'</details>';
}
function settlementField(item={}){
  return '<label class="settlement-option span2"><input type="checkbox" name="includeSettlement" '+(item.excludeFromSettlement!==true?'checked':'')+'><span><strong>정산에 포함</strong><small>끄면 지출 합계에는 남고, 두 사람 사이 정산에서는 제외돼요.</small></span></label>';
}
function foldAdditionalFields(kind){
  const fields={itinerary:['duration','mode','category','cost','currency','link','note'],places:['lat','lng','photo','link','note','cost','currency'],stays:['lat','lng','photo','link','note','bookingNumber','share'],reservations:['address','bookingNumber','share','link','note'],expenses:['share','sourceId','note']}[kind];
  const grid=$('#modal-form .form-grid');if(!grid||!fields)return;
  const labels=fields.map(name=>$(`[name="${name}"]`)?.closest('.field')).filter(Boolean);
  if(!labels.length)return;
  const details=document.createElement('details');details.className='additional-fields span2';details.innerHTML='<summary>추가 정보</summary><div class="form-grid"></div>';labels.forEach(label=>details.querySelector('.form-grid').append(label));grid.append(details);
}
function renderTrip() {
  const t=state.trip, tabs=[['itinerary','calendar','일정'],['places','heart','함께 저장한 장소'],['stays','hotel','숙소·예약'],['tasks','bag','준비물'],['budget','wallet','예산'],['assistant','spark','AI 여행 도우미']];
  return `${renderMobileTripTools()}<p class="mobile-trip-context">${esc(t.country)} · ${esc(t.city)}<span>${dateShort(t.start)} — ${dateShort(t.end)}</span></p>${t.sample?`<div class="intro-banner">${icon('spark')}<span class="grow">샘플 여행입니다. 장소·날짜·환율은 사용 방법을 보여주기 위한 예시이며 실제 예약이 아닙니다.</span>${act('delete-trip','샘플 삭제','btn ghost sm')}</div>`:''}<section class="trip-banner"><img class="trip-mini-cover" src="${esc(t.image||'/scene.svg')}" alt="여행 대표 이미지"><div class="trip-title"><div class="row"><span class="badge">${t.type==='domestic'?'국내여행':'해외여행'}</span><span class="muted small">${esc(t.country)} · ${esc(t.city)}</span></div><h1>${esc(t.name)}</h1><div class="trip-meta"><span>${icon('calendar')}${t.start.replaceAll('-','.')} — ${t.end.replaceAll('-','.')}</span><span>${daysBetween(t.start,t.end).length-1}박 ${daysBetween(t.start,t.end).length}일</span><span>${icon('users')}${t.members.map(m=>esc(m.name)).join(' · ')}${t.members.length===1?' · 동행을 초대해보세요':''}</span></div></div><div class="trip-actions">${act('home',`${icon('back')}<span>내 여행</span>`,'btn ghost sm')}${iBtn('edit-trip','edit','여행 정보 수정','data-mobile-label="수정"')}${act('offline-save',icon('download')+'<span>오프라인 저장</span>','btn secondary sm')}${iBtn('export','download','여행 JSON 내보내기','data-mobile-label="내보내기"')}${iBtn('delete-trip','trash','여행 삭제','data-mobile-label="삭제"')}</div></section>${t.note?`<p class="section-hint">${esc(t.note)}</p>`:''}<nav class="tabs" aria-label="여행 메뉴">${tabs.map(([key,ic,label])=>act('tab',`${icon(ic)}${label}`,`tab ${state.tab===key?'active':''}`,`data-tab="${key}" aria-pressed="${state.tab===key}"`)).join('')}</nav>${renderUndo()}${state.tab==='itinerary'?renderItinerary():state.tab==='places'?renderPlaces():state.tab==='stays'?renderStays():state.tab==='tasks'?renderTasks():state.tab==='assistant'?renderAssistant():renderBudget()}${renderActivity()}<p class="footer-note" id="connection"></p>`;
}
const usingGoogle=()=>Boolean(state.config.googleMapsBrowserKey);
const locationOf=p=>usingGoogle()?googleLocation(p):p?.googlePlaceId?{...p,lat:null,lng:null}:p;
const placeFor = item => locationOf([...state.trip.places,...state.trip.stays].find(p=>p.id===item.placeId));
function dayItems() { return state.trip.itinerary.filter(i=>i.date===state.day); }
function directionsLink(a,b,mode='walk') {
  const q = p => hasCoords(p)?`${p.lat},${p.lng}`:p?.address||p?.name||'';
  return `https://www.google.com/maps/dir/?${new URLSearchParams({api:'1',origin:q(a),destination:q(b),...(a?.googlePlaceId?{origin_place_id:a.googlePlaceId}:{}),...(b?.googlePlaceId?{destination_place_id:b.googlePlaceId}:{}),travelmode:mode==='drive'?'driving':mode==='transit'?'transit':'walking'})}`;
}
function searchLink(p) {const point=locationOf(p);return 'https://www.google.com/maps/search/?'+new URLSearchParams({api:'1',query:point.googlePlaceId?point.name:hasCoords(point)?`${point.lat},${point.lng}`:point.address||point.name,...(point.googlePlaceId?{query_place_id:point.googlePlaceId}:{})});}
const external = (url,label,cls='btn ghost sm') => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" class="${cls}">${label}</a>`;
const mapLinks = (p,label='지도 보기') => external(searchLink(p),label) + (state.trip.type==='domestic' ? external('https://map.naver.com/p/search/'+encodeURIComponent(p.address||p.name),'네이버 지도') : '');
function renderItineraryCard(item,index){
  const place=placeFor(item),open=state.expandedEvents.has(item.id),dateCount=dayItems().length;
  return `<article class="timeline-card compact-event ${state.selected===item.id?'selected':''}" data-event-id="${item.id}"><span class="timeline-number">${index+1}</span><div class="event-card-top"><span class="timeline-time">${item.startTime||'시간 미정'}${item.endTime?` — ${item.endTime}`:''}</span><span class="badge ${item.category==='숙소'?'beige':''}">${esc(item.category)}</span></div><h4><button type="button" data-action="select-item" data-id="${item.id}">${esc(item.name)}</button></h4><details class="event-details" data-event-details="${item.id}" ${open?'open':''}><summary aria-label="${esc(item.name)} 상세 정보"><span class="when-closed">상세 보기</span><span class="when-open">상세 접기</span>${icon('down')}</summary><div class="event-details-body">${place?.address?`<p class="event-address">${icon('pin')}${esc(place.address)}</p>`:''}${item.note?`<p class="event-note">${esc(item.note)}</p>`:''}<div class="event-facts">${item.duration?'<span>'+item.duration+'분 머물기</span>':''}<span>${item.cost?money(item.cost,item.currency):'예상 비용 미입력'}</span><span>이동 · ${item.mode==='drive'?'자동차':item.mode==='transit'?'대중교통':'도보'}</span></div><div class="btn-row">${place?mapLinks(place,'지도·길찾기'):''}${item.link?external(item.link,icon('link')+'예약·관련 링크'):''}</div><div class="timeline-controls">${iBtn('move-up','up','일정 위로 이동',`data-id="${item.id}" ${index===0?'disabled':''}`)}${iBtn('move-down','down','일정 아래로 이동',`data-id="${item.id}" ${index===dateCount-1?'disabled':''}`)}${iBtn('transfer-event','calendar','일정 복사 또는 날짜 이동',`data-id="${item.id}"`)}${iBtn('edit-item','edit','일정 수정',`data-id="${item.id}" data-kind="itinerary"`)}${iBtn('delete-item','trash','일정 삭제',`data-id="${item.id}" data-kind="itinerary"`)}</div></div></details></article>`;
}
function renderItineraryMode(journey,overview){
  return '<div class="itinerary-view-switch" role="group" aria-label="일정 화면 선택">'+act('itinerary-view',icon('calendar')+'일정 보기',journey?'':'active',`data-mode="plan" aria-pressed="${!journey}"`)+act('itinerary-view',icon('walk')+(overview.during?'여행 중 보기':'여행 화면 미리보기'),journey?'active':'',`data-mode="journey" aria-pressed="${journey}"`)+'</div>';
}
function destinationButton(place,label,mode='walk'){
  if(!place||!(place.name||place.address||hasCoords(place)))return '';
  const query={api:'1',destination:hasCoords(place)?place.lat+','+place.lng:place.address||place.name,travelmode:mode==='drive'?'driving':mode==='transit'?'transit':'walking',...(place.googlePlaceId?{destination_place_id:place.googlePlaceId}:{})};
  return external('https://www.google.com/maps/dir/?'+new URLSearchParams(query),icon('pin')+label,'btn primary');
}
function renderJourneyEvent(item,label,primary=false){
  const linked=placeFor(item),place=linked||item;
  return '<article class="journey-stop '+(primary?'journey-next':'journey-current')+'"><span class="journey-label">'+esc(label)+'</span><div class="journey-stop-heading"><span class="journey-time">'+esc(item.startTime||'시간 미정')+(item.endTime?' — '+esc(item.endTime):'')+'</span><span class="badge">'+esc(item.category)+'</span></div><h3>'+act('journey-event',esc(item.name),'journey-name',`data-id="${item.id}" data-date="${item.date}"`)+'</h3>'+(place.address?'<p class="journey-address">'+esc(place.address)+'</p>':'')+'<div class="btn-row">'+(linked?destinationButton(place,'길찾기',item.mode):'')+act('journey-event','일정 상세','btn secondary',`data-id="${item.id}" data-date="${item.date}"`)+'</div></article>';
}
function renderJourneyView(overview=journeyOverview(state.trip)){
  const {active,next,following,stay,preview,finished}=overview,t=state.trip,p=locationOf(stay);
  const note=preview?(travelClock(t).date<t.start?'출발 전 미리보기':'지난 여행 미리보기'):'입력한 일정 시간 기준';
  return '<section class="journey-view" aria-label="여행 중 화면"><header class="journey-heading"><div><span class="eyebrow">'+(preview?'미리보기':'여행 중')+'</span><h2>'+dateShort(overview.date)+' '+esc(t.city)+'</h2><p>'+esc(note)+'</p></div><div class="journey-clock"><strong>'+esc(overview.time)+'</strong><span>'+(overview.timeZone==='UTC'?'UTC 기준':'현지 시각')+'</span></div></header><div class="journey-stops">'+(active?renderJourneyEvent(active,'지금 일정 · 시간 기준'): '')+(next?renderJourneyEvent(next,preview?'첫 장소':'다음 장소',true):'<article class="journey-stop journey-empty"><h3>'+(finished?'오늘 예정된 일정이 끝났어요.':active?'다음 일정이 없습니다.':'등록된 일정이 없습니다.')+'</h3><p>'+(finished?'오늘 숙소와 예약 정보를 확인하세요.':'장소를 추가하거나 전체 일정을 확인하세요.')+'</p>'+act('itinerary-view','전체 일정 보기','btn secondary','data-mode="plan"')+'</article>')+(following?'<p class="journey-following"><span>'+esc(following.startTime||'시간 미정')+' · '+esc(following.name)+'</span>'+act('journey-event','보기','btn ghost sm',`data-id="${following.id}" data-date="${following.date}"`)+'</p>':'')+'</div><section class="journey-stay"><div><span class="journey-label">'+(stay?.checkOut===overview.date?'체크아웃 숙소':'오늘 숙소')+'</span><h3>'+esc(stay?.name||'예약 완료한 숙소가 없습니다.')+'</h3>'+(stay?'<p>'+esc(stay.address||'주소를 등록해주세요.')+'</p><small>체크인 '+dateShort(stay.checkIn)+' '+esc(stay.checkInTime||'')+' · 체크아웃 '+dateShort(stay.checkOut)+' '+esc(stay.checkOutTime||'')+'</small>':'')+'</div><div class="btn-row">'+(stay?destinationButton(p,'숙소 길찾기'):'')+act('tab','숙소·예약 보기','btn secondary','data-tab="stays"')+'</div></section><div class="journey-footer">'+act('itinerary-view',preview?'해당 날짜 전체 일정':'오늘 전체 일정','btn secondary','data-mode="plan"')+act('tab',icon('bag')+'준비물','btn ghost','data-tab="tasks"')+'</div></section>';
}
function refreshTravelClock(){
  if(!state.trip||document.hidden||$('#modal').open)return;
  const journey=$('.journey-view');
  if(journey){const current=journeyOverview(state.trip);if(current.date!==state.day){state.day=current.date;render();return;}if(!current.during&&state.journeyMode===null){render();return;}journey.outerHTML=renderJourneyView(current);}
  else{const quick=$('.travel-quick');if(quick)quick.outerHTML=renderTravelQuick();}
}
function segment(a,b) {
  const pa=placeFor(a),pb=placeFor(b),d=distance(pa,pb),key=`${a.id}:${b.id}:${b.mode}`,r=state.routes[key];
  return `<div class="route-between">${icon(b.mode==='drive'?'car':b.mode==='transit'?'map':'walk')}<span>${r?.available?`실제 경로 ${km(r.distance)} · 약 ${Math.ceil(r.seconds/60)}분`:`${d!=null?`직선 ${km(d)}`:'위치 미등록'} · 이동 시간 확인 필요`}</span>${hasCoords(pa)&&hasCoords(pb)&&state.config.routing?act('route',r?.loading?'확인 중…':'경로 확인','',`data-from="${a.id}" data-to="${b.id}"`):''}${external(directionsLink(pa||a,pb||b,b.mode),'길찾기','')}</div>`;
}
function renderItinerary() {
  const t=state.trip,days=daysBetween(t.start,t.end),extras=[...new Set(t.itinerary.map(i=>i.date).filter(d=>!days.includes(d)))].sort();
  if (![...days,...extras].includes(state.day)) state.day=t.start;
  const journey=journeyOverview(t),inJourney=state.journeyMode??(journey.during&&state.day===journey.date&&!state.mapMode);
  if(inJourney){state.day=journey.date;return renderItineraryMode(true,journey)+renderJourneyView(journey);}
  const items=dayItems(),routeSeconds=Object.fromEntries(Object.entries(state.routes).filter(([,v])=>v.available).map(([k,v])=>[k,v.seconds]));
  const warnings=itineraryWarnings(items,t,routeSeconds);let total=0,unknown=0,realDistance=0,realSeconds=0,known=0;
  for(let i=0;i<items.length-1;i++){const d=distance(placeFor(items[i]),placeFor(items[i+1]));if(d==null)unknown++;else total+=d;const r=state.routes[`${items[i].id}:${items[i+1].id}:${items[i+1].mode}`];if(r?.available){realDistance+=r.distance;realSeconds+=r.seconds;known++;}}
  const itinerary = items.map((item,i)=>renderItineraryCard(item,i)+(i<items.length-1?segment(item,items[i+1]):'')).join('');
  return `${renderItineraryMode(false,journey)}${usingGoogle()&&items.some(i=>placeFor(i)?.googlePlaceId)?'<div class="maps-attribution" translate="no">Google Maps</div>':''}<div class="day-strip">${days.map((d,i)=>act('day',`<small>DAY ${String(i+1).padStart(2,'0')}</small><strong>${dateShort(d)} <span class="small">${weekday(d)}</span></strong>`,`day ${state.day===d?'active':''}`,`data-date="${d}"`)).join('')}${extras.map(d=>act('day',`<small>기간 밖 일정</small><strong>${dateShort(d)}</strong>`,`day ${state.day===d?'active':''}`,`data-date="${d}"`)).join('')}</div>${renderDayOverview()}<div class="mobile-toggle">${act('show-list',`${icon('list')} 일정 목록`,!state.mapMode?'active':'')}${act('show-map',`${icon('map')} 지도 보기`,state.mapMode?'active':'')}</div><div class="planner-grid ${state.mapWide?'map-wide':''} ${state.mapMode?'show-map':''}"><section class="panel"><div class="panel-head"><div><h3>${dateShort(state.day)} ${weekday(state.day)}요일의 여행</h3><p>저장한 장소를 연결해 하루를 만들어보세요.</p></div>${items.length?act('new-itinerary',`${icon('plus')}일정 추가`,'btn soft sm'):''}</div><div class="row between" style="margin-bottom:18px"><span class="small muted">${items.length?`${items.length}개의 일정${items.length>1?` · 확인된 직선 합계 ${km(total)}`:''}`:'장소를 추가하면 동선을 확인할 수 있어요.'}</span><div class="row">${act('sort-time','시간순 정렬','btn ghost sm')}${act('recommend',`${icon('spark')}코스 제안`,'btn ghost sm')}</div></div>${known?`<div class="info-note" style="margin-bottom:15px">조회한 실제 경로 합계 ${km(realDistance)} · 약 ${Math.ceil(realSeconds/60)}분 (${known}/${Math.max(0,items.length-1)}개 구간)</div>`:''}${warnings.map(w=>`<div class="warning">${esc(w)}</div>`).join('')}<div class="timeline">${items.length?itinerary:empty('등록된 일정이 없습니다','일정을 추가하거나 저장한 장소를 선택하세요. 동행도 수정할 수 있어요.',act('new-itinerary',`${icon('plus')}첫 일정 추가`,'btn primary sm'),'calendar')}</div>${items.length?`<div class="info-note" style="margin-top:18px">${state.config.routing?'구간별 ‘경로 확인’으로 실제 거리와 소요 시간을 조회할 수 있어요.':'이동 시간은 길찾기에서 확인해주세요. 지도 선과 직선거리는 실제 도로 경로와 달라요.'}${unknown?` 위치가 없는 ${unknown}개 구간은 합계에서 제외했어요.`:''}</div>`:''}</section><section class="map-panel"><div class="map-head"><strong>${icon('map')} ${dateShort(state.day)} 동선</strong><div class="row"><span>번호는 방문 순서예요</span>${act('toggle-map-size',state.mapWide?'기본 크기':'지도 크게 보기','btn secondary sm',`aria-expanded="${state.mapWide}"`)}</div></div><div id="map" aria-label="일정 장소 지도"></div><div class="map-view-actions">${act('map-all','오늘 동선 전체','btn secondary sm')}${act('map-stay','숙소로 이동','btn secondary sm',visibleDayStays().length?'':'disabled')}${external('/offline.html','저장한 일정 보기')}</div><div class="map-footer">${icon('pin')}<span><strong>일정 장소 ${items.filter(x=>hasCoords(placeFor(x))).length}개 · 숙소 ${visibleDayStays().length}개</strong> · 점선은 장소를 연결한 직선입니다.</span></div></section></div>${items.length?act('new-itinerary',`${icon('plus')}일정 추가`,'btn primary floating-action'):''}`;
}
async function initGoogleItineraryMap(token){
  const element=$('#map'),trip=state.trip;if(!element||!trip)return;
  try{
    await loadGoogleMaps();
    const changed=await resolveGooglePlaces([...trip.places,...trip.stays]);
    if(token!==mapRenderToken||!element.isConnected)return;
    if(changed){render();return;}
    const items=dayItems(),points=items.map((item,i)=>({item,p:placeFor(item),i})).filter(x=>hasCoords(x.p));
    const stays=trip.stays.map(locationOf).filter(s=>hasCoords(s)&&s.status==='예약 완료'&&s.checkIn<=state.day&&s.checkOut>=state.day);
    const stored=[...stays,...trip.places.map(locationOf).filter(hasCoords)];
    const fallback=trip.type==='domestic'?{lat:36.4,lng:127.8}:{lat:35.68,lng:139.76};
    const center=points[0]?.p||stored[0]||await googleCityCenter(trip.city,trip.country)||fallback;
    if(token!==mapRenderToken||!element.isConnected)return;
    if(!map||map.provider!=='google'){const created=await createGoogleMap(element,{center,zoom:14});if(token!==mapRenderToken||!element.isConnected){created.remove();return;}map=created;}
    const groups=new Map();for(const point of points){const key=`${point.p.lat},${point.p.lng}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(point);}
    const pins=[...groups.values()].map(group=>({position:{lat:Number(group[0].p.lat),lng:Number(group[0].p.lng)},label:group.map(p=>p.i+1).join('·'),title:group.map(p=>`${p.i+1}. ${p.item.name}`).join(' / '),active:group.some(p=>p.item.id===state.selected),onClick:()=>{state.selected=group[0].item.id;render();}}));
    for(const stay of stays)if(!points.some(p=>p.p.id===stay.id))pins.push({position:{lat:Number(stay.lat),lng:Number(stay.lng)},label:'숙소',title:stay.name});
    const focusStay=state.mapFocus==='stay'?stays[0]:null;
    map.update({center:{lat:Number((focusStay||center).lat),lng:Number((focusStay||center).lng)},zoom:focusStay||points.length===1||!points.length&&stays.length?16:14,pins,line:points.map(p=>({lat:Number(p.p.lat),lng:Number(p.p.lng)})),boundsPoints:focusStay?[]:[...points.map(p=>({lat:Number(p.p.lat),lng:Number(p.p.lng)})),...stays.map(s=>({lat:Number(s.lat),lng:Number(s.lng)}))]});
  }catch(error){if(token!==mapRenderToken||!element.isConnected)return;disposeMap();element.innerHTML=`<div class="map-unavailable"><p>${esc(error.message)}</p>${act('retry-map','지도 다시 시도','btn secondary sm')}</div>`;}
}
async function initGooglePicker(container,center,valid){
  const token=++pickerToken;
  const picker=await createGoogleMap(container,{center,zoom:valid?17:13,onClick:position=>{if($('[name=googlePlaceId]'))$('[name=googlePlaceId]').value='';if($('[name=source]'))$('[name=source]').value='직접 지도 위치 확인';$('[name=lat]').value=position.lat.toFixed(6);$('[name=lng]').value=position.lng.toFixed(6);picker.setPoint(position);}});
  if(token!==pickerToken||!container.isConnected||!$('#modal').open){picker.remove();return;}
  locationPicker=picker;if(valid)picker.setPoint(center);
}
function initMap() {
  if (!$('#map')||!$('#map').offsetParent) return;
  if(usingGoogle()){initGoogleItineraryMap(mapRenderToken).catch(()=>{});return;}
  if (!window.L) { $('#map').innerHTML='<p class="map-unavailable">지도를 불러오지 못했어요. 서버 연결과 설치 상태를 확인해주세요.</p>';return; }
  const items=dayItems(),points=items.map((item,i)=>({item,p:placeFor(item),i})).filter(x=>hasCoords(x.p));
  const stays=visibleDayStays(),all=[...stays,...state.trip.places.map(locationOf).filter(hasCoords)],center=points[0]?.p||all[0]||{lat:state.trip.type==='domestic'?36.4:35.68,lng:state.trip.type==='domestic'?127.8:139.76};
  map=L.map('map',{zoomControl:true,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false}).setView([center.lat,center.lng],points.length||all.length?12:state.trip.type==='domestic'?6:4);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'}).addTo(map);
  mapLayer=L.layerGroup().addTo(map);
  const line=[];
  const groups=new Map();for(const point of points){line.push([point.p.lat,point.p.lng]);const key=`${point.p.lat},${point.p.lng}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(point);}
  for(const group of groups.values()){const {p,item}=group[0],active=group.some(x=>state.selected===x.item.id),numbers=group.map(x=>x.i+1).join('·');const marker=L.marker([p.lat,p.lng],{icon:L.divIcon({className:'numbered-marker',html:`<div class="map-pin ${active?'active':''}"><span>${numbers}</span></div>`,iconSize:[33,33],iconAnchor:[16,33]})}).addTo(mapLayer);marker.bindTooltip(group.map(x=>`${x.i+1}. ${esc(x.item.name)}`).join('<br>'),{direction:'top',offset:[0,-30]});marker.on('click',()=>{state.selected=item.id;render();});if(active)marker.openTooltip();}
  for(const stay of stays)if(!points.some(p=>p.p.id===stay.id)){const marker=L.marker([stay.lat,stay.lng],{icon:L.divIcon({className:'numbered-marker',html:'<div class="map-pin hotel-pin"><span>숙소</span></div>',iconSize:[42,36],iconAnchor:[21,36]})}).addTo(mapLayer);marker.bindTooltip(esc(stay.name));}
  if(line.length>1){L.polyline(line,{color:'#7298c9',weight:2.5,dashArray:'6,8',opacity:.8}).addTo(mapLayer);map.fitBounds(line,{padding:[45,45],maxZoom:15});}
  const focusStay=state.mapFocus==='stay'?stays[0]:null,bounds=[...line,...stays.map(s=>[s.lat,s.lng])];
  if(focusStay)map.setView([focusStay.lat,focusStay.lng],16);else if(bounds.length>1)map.fitBounds(bounds,{padding:[45,45],maxZoom:16});else if(bounds.length===1)map.setView(bounds[0],16);
  const currentMap=map;mapSizeTimer=setTimeout(()=>{if(map===currentMap)currentMap.invalidateSize();},100);
}
function renderPlaces() {
  const t=state.trip;state.placeSelection=state.placeSelection.filter(id=>t.places.some(p=>p.id===id));let places=t.places.map(locationOf).filter(p=>state.filter==='mine'?p.createdBy===state.user.id:state.filter==='partner'?p.createdBy!==state.user.id:state.filter==='both'?t.members.length===2&&t.members.every(m=>p.likes.includes(m.id)):true).filter(p=>state.category==='all'||p.category===state.category);
  return `<div class="section-title"><div><h3>저장한 장소 <span>${t.places.length}</span></h3><p class="muted small" style="margin-top:7px">가고 싶은 장소를 저장하고 일정에 추가하세요.</p></div><div class="row">${act('recommend',`${icon('spark')}추천`,'btn secondary sm')}${act('new-place',`${icon('plus')}장소 저장`,'btn primary sm')}</div></div><div class="filter-row">${[['all','전체'],['mine','내가 저장'],['partner','상대가 저장'],['both','둘 다 가고 싶은 곳']].map(([key,label])=>act('place-filter',label,`pill ${state.filter===key?'active':''}`,`data-filter="${key}"`)).join('')}<select id="category-filter" class="pill" aria-label="장소 카테고리"><option value="all">모든 카테고리</option>${categories.map(c=>`<option ${state.category===c?'selected':''}>${c}</option>`).join('')}</select></div>${places.length?`<div class="bulk-place-toolbar">${act('select-visible-places','현재 목록 선택','btn secondary sm',`data-ids="${places.map(p=>p.id).join(',')}"`)}${act('clear-place-selection','선택 해제','btn ghost sm')}<strong>${state.placeSelection.length}개 선택</strong>${act('schedule-many','선택한 장소 일정에 추가','btn primary sm',state.placeSelection.length?'':'disabled')}</div><div class="place-grid">${places.map(p=>`<article class="place-card"><label class="place-select"><input type="checkbox" data-place-select="${p.id}" ${state.placeSelection.includes(p.id)?'checked':''}>일정에 넣을 장소 선택</label><div class="place-art">${p.photo?`<img src="${esc(p.photo)}" alt="${esc(p.name)}" loading="lazy">`:icon(catIcon(p.category))}<span class="badge">${esc(p.category)}</span>${act('like',icon('heart'),`like-button ${p.likes.includes(state.user.id)?'liked':''}`,`data-id="${p.id}" aria-label="${p.likes.includes(state.user.id)?'가고 싶어요 취소':'가고 싶어요'}"`)}</div><div class="place-body"><h3>${esc(p.name)}</h3><div class="place-address">${esc(p.address||'주소를 추가해주세요')}</div><div class="verification-tags"><span class="badge ${hasCoords(p)?'green':'beige'}">${hasCoords(p)?'지도 위치 등록됨':'지도 위치 확인 필요'}</span><span class="badge beige">영업시간 확인 필요</span>${p.costKnown===false?'<span class="badge beige">가격 확인 필요</span>':''}</div>${p.note?`<details class="place-note"><summary>메모 보기</summary><p>${esc(p.note)}</p></details>`:''}<div class="like-names">${p.likes.length?`${icon('heart')} ${p.likes.map(memberName).map(esc).join(' · ')} 님이 가고 싶어해요`:'마음에 들면 하트를 눌러보세요.'}</div><div class="row between" style="margin-top:8px"><span class="small muted">${p.costKnown===false?'가격 확인 필요':p.cost?money(p.cost,p.currency):'비용 미정'}</span>${mapLinks(p)}</div><div class="place-foot"><span>${esc(memberName(p.createdBy))} 저장</span><div class="place-footer-actions">${iBtn('comments','chat',`댓글 ${p.comments.length}개`, `data-id="${p.id}"`)}${iBtn('edit-item','edit','장소 수정',`data-id="${p.id}" data-kind="places"`)}${act('delete-item',`${icon('trash')}삭제`,'btn danger sm place-delete',`data-id="${p.id}" data-kind="places" aria-label="${esc(p.name)} 장소 삭제"`)}${act('schedule-place',`${icon('plus')}일정`,'btn soft sm',`data-id="${p.id}"`)}</div></div><div class="metric-line">출처: ${p.googlePlaceId?'<span class="maps-attribution" translate="no">Google Maps</span>':esc(p.source)}${p.link?` · ${external(p.link,'관련 출처 보기')}`:''} · 영업시간·가격은 방문 전 확인</div></div></article>`).join('')}</div>`:empty('저장한 장소가 없습니다','장소를 검색하거나 직접 입력해 저장하세요.',act('new-place',`${icon('plus')}장소 저장하기`,'btn primary'),'heart')}${act('new-place',`${icon('plus')}장소 저장`,'btn primary floating-action')}`;
}
function renderStays() {
  const t=state.trip;
  return `<div class="section-title"><div><h3>숙소 목록</h3><p class="small muted" style="margin-top:7px">숙소 후보와 예약 정보를 관리하세요.</p></div>${act('new-stay',`${icon('plus')}숙소 등록`,'btn primary sm')}</div>${t.stays.length?`<div class="stay-grid">${t.stays.map(locationOf).map(s=>`<article class="stay-card"><div class="row between"><span class="badge ${s.status==='예약 완료'?'green':s.status==='취소'?'red':'beige'}">${esc(s.status)}</span><div>${iBtn('edit-item','edit','숙소 수정',`data-kind="stays" data-id="${s.id}"`)}${iBtn('delete-item','trash','숙소 삭제',`data-kind="stays" data-id="${s.id}"`)}</div></div><h3>${esc(s.name)}</h3><p>${esc(s.address||'주소 미등록')}</p><div class="row wrap" style="margin-top:13px"><span class="tag">체크인 ${dateShort(s.checkIn)} ${s.checkInTime||''}</span><span class="tag">체크아웃 ${dateShort(s.checkOut)} ${s.checkOutTime||''}</span></div><div class="price">${money(s.cost,s.currency)} <small>전체 숙박 비용${s.paid?' · 결제 완료':''}${s.excludeFromSettlement?' · 정산 제외':''}</small></div>${s.bookingNumber?`<p>예약번호 ${esc(s.bookingNumber)}</p>`:''}${attachmentList(s,'stays')}${s.note?`<p style="margin-top:8px">${esc(s.note)}</p>`:''}<div class="distance-list">${t.places.filter(hasCoords).slice(0,3).map(p=>`<div class="row between"><span>${esc(p.name)}</span><strong>직선 ${km(distance(s,p))}</strong></div>`).join('')||'장소와 숙소 위치를 등록하면 거리를 비교할 수 있어요.'}</div><div class="btn-row"><div>${mapLinks(s,'지도')}${s.link?external(s.link,'예약 링크'):''}</div>${s.status!=='취소'?act('apply-stay','하루 동선에 적용','btn soft sm',`data-id="${s.id}"`):''}</div></article>`).join('')}</div>${t.stays.length>1?`<section class="panel" style="margin-top:20px"><h3>숙소 후보 비교</h3><div class="overflow"><table class="comparison"><thead><tr><th>숙소</th><th>상태</th><th>전체 비용</th><th>원화 환산</th><th>기간</th></tr></thead><tbody>${t.stays.map(s=>`<tr><td>${esc(s.name)}</td><td>${esc(s.status)}</td><td>${money(s.cost,s.currency)}</td><td>${converted(s.cost,s.currency,t.rates)==null?'환율 입력 필요':money(converted(s.cost,s.currency,t.rates))}</td><td>${s.checkIn} — ${s.checkOut}</td></tr>`).join('')}</tbody></table></div></section>`:''}`:empty('등록된 숙소가 없습니다','숙소 후보나 예약한 숙소를 등록하세요. 예약 완료 숙소만 예상 예산에 반영됩니다.',act('new-stay',`${icon('plus')}숙소 등록`,'btn primary'),'hotel')}<div class="section-title"><h3>교통편 · 기타 예약 <span>${t.reservations.length}</span></h3>${act('new-reservation',`${icon('plus')}예약 추가`,'btn secondary sm')}</div>${t.reservations.map(r=>`<article class="list-card"><div class="row between"><div><span class="badge">${esc(r.category||'예약')}</span><h3 style="margin-top:10px">${esc(r.name)}</h3></div><div>${iBtn('edit-item','edit','예약 수정',`data-id="${r.id}" data-kind="reservations"`)}${iBtn('delete-item','trash','예약 삭제',`data-id="${r.id}" data-kind="reservations"`)}</div></div><div class="details">${r.date} ${r.startTime||''}${r.endTime?` — ${r.endTime}`:''}<br>${esc(r.address)}${r.bookingNumber?`<br>예약번호 ${esc(r.bookingNumber)}`:''}<br>${money(r.cost,r.currency)} · ${r.paid?'결제 완료':'결제 전'}${r.excludeFromSettlement?' · 정산 제외':''}${r.note?`<br>${esc(r.note)}`:''}</div>${attachmentList(r,'reservations')}${r.link?external(r.link,`${icon('link')}예약 확인`):''}</article>`).join('')||'<p class="small muted">항공·기차·버스·입장권 예약을 한곳에 모아보세요.</p>'}`;
}
function renderTasks() {
  const tasks=state.trip.tasks.map(task=>({...task,done:taskUpdates.value(task)})),done=tasks.filter(x=>x.done).length;
  return `<div id="tasks-view"><div class="section-title"><div><h3>출발 전, 함께 체크해요</h3><p class="small muted" style="margin-top:7px">챙길 것과 할 일을 나누면 준비도 더 가벼워져요.</p></div>${act('new-task',`${icon('plus')}할 일 추가`,'btn primary sm')}</div><div class="panel" style="margin-bottom:22px"><div class="row between"><strong class="small">여행 준비 ${tasks.length?Math.round(done/tasks.length*100):0}%</strong><span class="small muted">${done} / ${tasks.length} 완료</span></div><div class="progress"><span style="width:${tasks.length?done/tasks.length*100:0}%"></span></div></div>${['할 일','준비물'].map(c=>`<div class="section-title"><h3>${c}</h3><span class="small muted">${tasks.filter(x=>x.category===c).length}개</span></div><div class="checklist">${tasks.filter(x=>x.category===c).map(task=>`<article class="task ${task.done?'done':''} ${taskUpdates.isPending(task.id)?'task-pending':''}" data-task-id="${task.id}">${act('toggle-task',task.done?icon('check'):'','task-check',`data-id="${task.id}" aria-pressed="${task.done}" aria-label="${esc(task.name)} ${task.done?'완료 취소':'완료'}"`)}<div class="grow"><strong class="task-name">${esc(task.name)}</strong><div class="task-meta">${task.assignee?esc(memberName(task.assignee)):'담당자 미정'}${task.note?` · ${esc(task.note)}`:''}</div></div>${iBtn('edit-item','edit','할 일 수정',`data-kind="tasks" data-id="${task.id}"`)}</article>`).join('')||'<p class="small muted">아직 등록된 항목이 없어요.</p>'}</div>`).join('')}</div>`;
}
function renderBudget() {
  const t=state.trip,b=budgetOf(t),rateText=Object.entries(t.rates).filter(([c])=>c!=='KRW').map(([c,v])=>`1 ${c} = ${num(v)}원`).join(' · '),other=b.partner;
  const settlement=!other?'동행을 초대하면 정산 금액을 확인할 수 있어요.':Math.abs(b.settlement)<.5?'두 사람의 정산이 맞아요.':`${esc(b.settlement>0?other.name:memberName(t.owner))} → ${esc(b.settlement>0?memberName(t.owner):other.name)} ${money(Math.abs(b.settlement))}`;
  return `<div class="section-title"><div><h3>여행 예산과 지출</h3><p class="small muted" style="margin-top:7px">예상 비용과 실제 지출을 확인하세요.</p></div><div class="row">${act('rates','환율 설정','btn secondary sm')}${act('new-expense',`${icon('plus')}지출 기록`,'btn primary sm')}</div></div><div class="info-note">${rateText?`직접 입력한 환율 · ${esc(rateText)}`:'환율이 아직 없어요. 해외 통화는 환율을 입력한 뒤 원화로 합산해요.'} · 실시간 환율이 아닙니다.</div>${b.missing.length?`<div class="warning">${b.missing.join(', ')} 환율이 필요해요. 원화 지출 합계는 이 통화를 제외한 부분 합계입니다.</div>`:''}${b.invalidPayers.length?'<div class="warning">이전 참여자가 결제한 지출이 있어요. 결제자를 수정해야 정확히 정산할 수 있어요.</div>':''}<div class="budget-stats"><div class="budget-stat"><label>전체 예상 비용</label><strong>${money(b.planned)}</strong><p class="small muted">예약 완료 숙소 + 예약 + 일정 비용</p></div><div class="budget-stat blue"><label>실제 지출</label><strong>${money(b.spent)}</strong><p class="small muted">결제 완료 예약 + 기록한 지출</p></div><div class="budget-stat"><label>설정한 여행 예산</label><strong>${t.budget?money(t.budget,t.currency):'미설정'}</strong><p class="small muted">${b.limit>0?`원화 기준 잔여 ${money(b.limit-b.spent)}`:'여행 정보 수정에서 예산을 설정해요.'}</p></div></div><div class="budget-grid"><section class="panel"><div class="panel-head"><h3>실제 지출 내역</h3><span class="small muted">${b.actual.length}건</span></div>${b.actual.length?b.actual.map(e=>`<div class="expense-row"><span class="expense-icon">${icon(catIcon(e.category))}</span><div class="expense-info"><strong>${esc(e.name)}</strong><small>${dateShort(e.date)} · ${esc(memberName(e.payer))} 결제${e.sourceId?' · 예약/일정 연결':''}${e.excludeFromSettlement?' · 정산 제외':''}</small></div><div class="expense-price">${money(e.amount,e.currency)}<small>${converted(e.amount,e.currency,t.rates)==null?'환율 필요':money(converted(e.amount,e.currency,t.rates))}</small></div>${e.kind?iBtn('edit-item','edit','원본 예약 수정',`data-kind="${e.kind}" data-id="${e.id}"`):iBtn('edit-item','edit','지출 수정',`data-kind="expenses" data-id="${e.id}"`)}</div>`).join(''):'<p class="small muted">아직 기록한 지출이 없어요.</p>'}<div class="divider"></div><h4>예상 비용 내역</h4>${b.estimates.filter(e=>e.amount>0).map(e=>`<div class="expense-row"><div class="expense-info"><strong>${esc(e.name)}</strong><small>${e.date} · ${esc(e.category)}</small></div><span class="small">${money(e.amount,e.currency)}</span>${act('record-estimate','지출 연결','btn ghost sm',`data-id="${e.id}"`)}</div>`).join('')||'<p class="small muted" style="margin-top:12px">숙소·예약·일정에 비용을 입력해보세요.</p>'}</section><div class="stack"><section class="panel"><div class="panel-head"><h3>둘 사이의 정산</h3>${icon('users')}</div><p style="color:var(--blue);font-weight:650;font-size:15px">${settlement}</p>${b.settlementMissing.length?'<p class="warning">'+esc(b.settlementMissing.join(', '))+' 환율이 없어 정산이 미완성입니다.</p>':''}<p class="small muted" style="margin-top:12px">각 지출의 ‘결제자 외 1인 부담 비율’을 기준으로 계산해요. 기본값은 50%예요. 정산 제외 지출 ${b.excludedCount}건은 지출 합계에만 포함됩니다.</p></section><section class="panel"><h3>카테고리별 실제 지출</h3>${Object.entries(b.categories).map(([c,n])=>`<div class="bar-row"><div class="row between"><span>${esc(c)}</span><span>${money(n)}</span></div><div class="bar"><span style="width:${b.spent?n/b.spent*100:0}%"></span></div></div>`).join('')||'<p class="small muted" style="margin-top:15px">지출을 기록하면 여기에 보여요.</p>'}</section><section class="panel"><h3>날짜별 실제 지출</h3>${Object.entries(b.byDate).sort().map(([d,n])=>`<div class="row between" style="margin-top:12px;font-size:11px"><span class="muted">${d}</span><strong>${money(n)}</strong></div>`).join('')||'<p class="small muted" style="margin-top:15px">날짜별 지출이 여기에 보여요.</p>'}</section></div></div>`;
}

function visibleDayStays(){return state.trip.stays.map(locationOf).filter(s=>hasCoords(s)&&s.status==='예약 완료'&&s.checkIn<=state.day&&s.checkOut>=state.day);}
function renderTravelQuick(){
  if(state.tab!=='itinerary')return '';
  const t=state.trip,available=[...daysBetween(t.start,t.end),...t.itinerary.map(i=>i.date)],date=available.includes(state.day)?state.day:t.start;state.day=date;
  const q=overviewForDay(t,date),next=q.next,p=next?placeFor(next)||next:null,stay=locationOf(q.stay);
  const destinationLink=(place,label,cls='btn secondary sm')=>external('https://www.google.com/maps/dir/?'+new URLSearchParams({api:'1',destination:hasCoords(place)?place.lat+','+place.lng:place.address||place.name,...(place.googlePlaceId?{destination_place_id:place.googlePlaceId}:{})}),label,cls);
  const applied=stay&&t.itinerary.some(i=>i.date===date&&i.placeId===stay.id&&['숙소 출발','숙소 도착'].includes(i.note));
  return '<section class="travel-quick quick-compact" aria-label="선택 날짜 여행 요약"><div class="quick-compact-head"><div><h2>'+dateShort(date)+' 여행 요약 <small>'+q.items.length+'개 일정</small></h2><p>'+esc(q.timeZone==='UTC'?'현재 시간 (UTC)':t.city+' 현재 시간')+' '+q.time+'</p></div>'+act('toggle-quick',state.quickExpanded?'상세 접기':'상세 보기','btn ghost sm','aria-expanded="'+state.quickExpanded+'"')+'</div><div class="quick-summary"><div><span class="summary-label">'+(q.during?'다음 장소':'첫 장소')+'</span><strong>'+esc(next?next.name:q.items.length?'남은 일정 없음':'등록된 일정 없음')+'</strong>'+(next?destinationLink(p,'길찾기'):'')+'</div><div><span class="summary-label">'+dateShort(date)+(stay?.checkOut===date?' 체크아웃':' 숙소')+'</span><strong>'+esc(stay?stay.name:'예약 완료 숙소 없음')+'</strong>'+(stay?destinationLink(stay,'숙소 길찾기'):'')+'</div></div>'+(state.quickExpanded?'<div class="quick-expanded"><div><h3>첫 장소</h3><p>'+esc(next?(next.startTime||'시간 미정')+' · '+(p.address||next.note||next.name):'일정에 장소를 추가하면 여기에 표시됩니다.')+'</p></div><div><h3>'+dateShort(date)+' 숙소</h3><p>'+esc(stay?stay.address||'주소를 추가해주세요.':'숙소·예약에서 숙소를 등록하세요.')+'</p>'+(stay?'<div class="btn-row">'+act('quick-stay',applied?'숙소 동선 등록됨':'숙소 출발·도착 일정 추가','btn secondary sm','data-id="'+stay.id+'" data-date="'+date+'" '+(applied?'disabled':''))+'</div>':act('tab','숙소 등록','btn secondary sm','data-tab="stays"'))+'</div></div>':'')+'</section>';
}
function renderUndo(){
  const entries=(state.trip.deleted||[]).filter(d=>d.actor===state.user.id&&d.expires>Date.now()).slice().reverse();
  if(!entries.length)return '';
  return '<div class="undo-banner" role="status"><span><strong>'+esc(entries[0].title)+'</strong> 삭제됨 <small>30분 안에 취소할 수 있어요.</small></span>'+act('undo-delete','삭제 취소','btn secondary sm','data-id="'+entries[0].id+'"')+'</div>';
}
function renderActivity(){
  const list=(state.trip.activity||[]).slice().reverse();
  const latest=list.find(a=>a.actor!==state.user.id)||list[0];
  const sentence=a=>`${a.actor===state.user.id?'내가':memberName(a.actor)==='이전 참여자'?a.name:memberName(a.actor)} ${a.title} · ${a.action}`;
  return `<details class="recent-changes"><summary>${icon('users')}<span>${latest?esc(sentence(latest)):'함께 만드는 여행의 변경 기록이 여기에 표시돼요.'}</span><small>최근 변경 보기</small></summary><ol>${list.length?list.map(a=>`<li><span>${esc(sentence(a))}</span><time datetime="${esc(a.at)}">${esc(new Date(a.at).toLocaleString('ko-KR',{timeZone:travelClock(state.trip).timeZone,month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}))}</time></li>`).join(''):'<li>아직 변경 기록이 없어요.</li>'}</ol></details>`;
}
function deleteItemDialog(kind,id){
  const item=state.trip[kind]?.find(x=>x.id===id),version=state.trip.version;if(!item){toast('이미 삭제된 항목이에요.');return;}
  const linked=state.trip.itinerary.filter(x=>x.placeId===(kind==='places'?id:item.placeId));
  const saved=kind==='itinerary'&&state.trip.places.find(x=>x.id===item.placeId);
  let options='';
  if(kind==='places')options=`<div class="delete-options"><label><input type="radio" name="scope" value="saved" checked><span><strong>저장 목록에서만 삭제</strong><small>연결된 일정 ${linked.length}개는 이름·날짜를 유지해요.</small></span></label>${linked.length?`<label><input type="radio" name="scope" value="all"><span><strong>저장 장소와 연결된 일정 모두 삭제</strong><small>날짜별 일정 ${linked.length}개에서도 함께 빼요.</small></span></label>`:''}</div>`;
  if(kind==='itinerary')options=`<div class="delete-options"><label><input type="radio" name="scope" value="event" checked><span><strong>이 일정에서만 빼기</strong><small>저장한 장소와 다른 날짜의 일정은 유지해요.</small></span></label>${saved?`<label><input type="radio" name="scope" value="both"><span><strong>이 일정과 저장 장소 삭제</strong><small>다른 일정 ${Math.max(0,linked.length-1)}개는 남고 장소 연결만 해제해요.</small></span></label>`:''}</div>`;
  modal('어디에서 삭제할까요?',`<p><strong>${esc(item.name)}</strong></p><p class="small muted">삭제 내용은 동행의 화면에도 반영돼요.</p>${options}`,'선택한 범위 삭제',async b=>{await mutate({action:'delete',collection:kind,itemId:id,deleteLinked:b.scope==='all',deletePlace:b.scope==='both'},version);toast('선택한 범위에서 삭제했어요.');});
}
function assistantSelection(id,proposal){
  if(!proposal)return [];
  if(state.aiSelections[id]?.proposalId!==proposal.id){
    let cached=null;try{cached=readReview(localStorage,state.user.id,id,proposal);}catch{state.reviewError=true;}
    state.aiSelections[id]={proposalId:proposal.id,ids:cached?.selected||proposal.changes.map(c=>c.changeId)};
    if(cached){for(const [changeId,location]of Object.entries(cached.locations))state.aiLocations[id+':'+proposal.id+':'+changeId]=location;if(daysBetween(state.trip.start,state.trip.end).includes(cached.scopeDate))state.aiDates[id]=cached.scopeDate;state.aiExpanded[id]=cached.expanded;}
  }
  return state.aiSelections[id].ids;
}
function assistantLocation(c,id=state.trip.id){const p=state.aiLocations[id+':'+state.aiChats[id]?.proposal?.id+':'+c.changeId];return p?.googlePlaceId?locationOf(p):p;}
function rememberAssistantReview(id=state.trip?.id){
  const proposal=state.aiChats[id]?.proposal;if(!proposal||!state.user)return;
  const locations={};for(const c of proposal.changes){const p=state.aiLocations[id+':'+proposal.id+':'+c.changeId];if(p)locations[c.changeId]=p;}
  try{writeReview(localStorage,state.user.id,id,proposal,{selected:assistantSelection(id,proposal),locations,scopeDate:state.aiDates[id]??state.day,expanded:state.aiExpanded[id]});state.reviewError=false;}catch{state.reviewError=true;toast('이 브라우저에 검토 내용을 저장하지 못했어요. 새로고침 전에 일정에 반영해주세요.');}
}
function assistantLocationDialog(changeId){
  const id=state.trip.id,proposal=state.aiChats[id]?.proposal,c=proposal?.changes.find(c=>c.changeId===changeId);if(!c)return;
  const location=assistantLocation(c)||{},key=`${id}:${proposal.id}:${c.changeId}`;
  modal('추천 장소의 위치 확인',`<p class="section-hint">${esc(c.name)} · 후보의 이름과 주소를 확인한 뒤 지도 위치를 저장하세요.</p><input type="hidden" name="name" value="${esc(c.name)}"><div class="search-box"><label class="field"><span>주소·장소 검색</span><input id="place-query" aria-label="장소 검색어" value="${esc((state.trip.city+' '+c.name+' '+c.address).slice(0,200))}"></label>${act('search-place',icon('search')+'위치 후보 검색','btn secondary')}<div class="search-results" id="search-results"></div></div><div class="form-grid"><input type="hidden" name="googlePlaceId" value="${esc(location.googlePlaceId||'')}">${field('address','확인한 주소',location.address||c.address,{wide:true})}${field('lat','위도',location.lat??'',{type:'number',min:-90,max:90,required:true})}${field('lng','경도',location.lng??'',{type:'number',min:-180,max:180,required:true})}</div><div class="btn-row">${act('pick-location',icon('map')+'지도 펼치기·접기','btn secondary')}${external(searchLink(c),'Google Maps에서 확인')}</div><p class="info-note">${state.config.search?'주소 검색 결과는 위치 후보예요. 실제 장소가 맞는지 확인하세요.':'주소 검색 연결 전에는 지도에서 위치를 누르거나 확인한 좌표를 입력하세요.'}</p><label class="confirm-location"><input type="checkbox" name="confirmed" required>지도에서 이 장소의 위치를 확인했어요</label>`,'확인한 위치 사용',async b=>{if(state.trip?.id!==id||state.aiChats[id]?.proposal?.id!==proposal.id)throw Error('제안이 변경됐어요. 새 제안에서 위치를 확인해주세요.');const lat=Number(b.lat),lng=Number(b.lng);if(!b.confirmed||b.lat===''||b.lng===''||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)throw Error('위도와 경도를 올바르게 입력해주세요.');state.aiLocations[key]={lat,lng,address:b.address.trim(),...(b.googlePlaceId?{googlePlaceId:b.googlePlaceId}:{})};rememberAssistantReview(id);render();toast('위치를 확인했어요. 변경안을 반영하면 지도에 연결돼요.');});
  pickLocation();if(state.config.search)searchPlace();
}
let assistantTimer=null;
function renderAssistant(){
  const t=state.trip,chat=state.aiChats[t.id]||{},proposal=chat.proposal,selection=assistantSelection(t.id,proposal),date=state.aiDates[t.id]??state.day??t.start;
  const examples=['숙소를 기준으로 오늘 점심, 조용한 카페, 관광지 2곳을 추천해줘','방금 제안한 카페를 다른 곳으로 바꾸고 저녁 맛집도 추가해줘','둘째 날은 걷는 거리를 줄이고 기존 관광 일정 시간을 조정해줘'];
  const disabled=chat.sending||chat.pending||!state.config.aiConfigured||chat.loading||Boolean(chat.loadFailed);
  return '<section class="assistant-intro"><div><span class="eyebrow">AI 추천</span><h2>숙소와 일정에 맞는 장소 추천</h2><p>날짜와 동선을 함께 보고 추천해요. 마음에 드는 제안은 공동 일정에 반영하세요.</p></div><span class="assistant-spark">'+icon('spark')+'</span></section><div class="assistant-grid"><section class="panel assistant-chat"><div class="panel-head"><div><h3>AI 여행 도우미</h3><p>대화는 나만 볼 수 있고, 반영한 일정은 동행과 공유돼요.</p></div>'+act('ai-refresh',icon('refresh'),'btn ghost sm','aria-label="대화 다시 불러오기"')+'</div><div id="ai-messages" class="assistant-messages" aria-live="polite">'+(chat.messages?.length?chat.messages.map(m=>'<article class="assistant-message '+(m.role==='user'?'from-user':'from-ai')+'"><span>'+ (m.role==='user'?'나':'여행 도우미')+'</span><p>'+esc(m.content)+'</p></article>').join(''):'<div class="assistant-welcome">'+icon('spark')+'<h3>추천받고 싶은 내용을 입력하세요</h3><p>예: “체크인 전에 숙소 근처에서 점심 먹고 카페에 들르고 싶어.”</p></div>')+(chat.sending||chat.pending?'<div class="assistant-thinking">숙소와 날짜에 맞는 장소를 찾아보고 있어요…</div>':'')+'</div>'+(chat.error?'<div class="form-error">'+esc(chat.error)+'</div>':'')+(!state.config.aiConfigured?'<div class="info-note">AI 도우미 연결을 준비 중이에요. 기존 여행 일정과 저장한 장소는 계속 이용할 수 있어요.</div>':'')+'<form id="assistant-form" class="assistant-compose"><label class="field"><span>추천할 날짜</span><select id="ai-scope-date" '+(chat.sending?'disabled':'')+'><option value="">전체 여행</option>'+daysBetween(t.start,t.end).map(d=>'<option value="'+d+'" '+(date===d?'selected':'')+'>'+d+' ('+weekday(d)+')</option>').join('')+'</select></label><label class="field"><span>추천하거나 바꾸고 싶은 내용</span><textarea id="ai-message" maxlength="2000" required placeholder="숙소 근처 맛집과 카페를 추천해줘. 저녁은 다른 곳으로 바꿔줘." '+(disabled?'disabled':'')+'>'+esc(state.aiDrafts[t.id]||'')+'</textarea></label><div class="row between"><span class="small muted">입력한 요청·숙소 위치·여행 일정이 OpenAI로 전송됩니다.</span><button class="btn primary" type="submit" '+(disabled?'disabled':'')+'>'+icon('spark')+(chat.sending||chat.pending?'추천 만드는 중':'보내기')+'</button></div></form></section><aside class="assistant-proposal panel '+(state.aiExpanded[t.id]?'proposal-open':'')+'" id="ai-proposal"><div class="panel-head"><div><h3>추천 변경안</h3><p>체크한 항목만 반영해요. 제외한 항목은 현재 일정에 영향을 주지 않아요.</p></div><span class="badge">'+(proposal?.changes.length||0)+'개</span></div>'+act('ai-toggle-proposal','추천 변경안 '+(proposal?.changes.length||0)+'개 '+(state.aiExpanded[t.id]?'접기':'보기'),'btn soft proposal-toggle','aria-expanded="'+Boolean(state.aiExpanded[t.id])+'"')+'<div class="proposal-content">'+(state.reviewError?'<p class="warning">검토 내용을 이 브라우저에 저장하지 못했어요. 새로고침 전에 반영해주세요.</p>':'<p class="review-storage-note">선택한 항목과 확인한 위치는 이 브라우저에 저장됩니다.</p>')+(proposal?'<div class="selection-toolbar">'+act('ai-select-all','전체 선택','btn ghost sm')+act('ai-select-none','선택 해제','btn ghost sm')+'<strong>'+selection.length+'개 선택</strong></div>':'')+(proposal?proposal.changes.map(c=>'<article class="assistant-change '+(selection.includes(c.changeId)?'is-selected':'is-skipped')+'"><label class="ai-select"><input type="checkbox" data-ai-select="'+c.changeId+'" '+(selection.includes(c.changeId)?'checked':'')+' '+(chat.applying?'disabled':'')+'><span>'+esc(c.name||c.beforeName)+' 반영</span></label><div class="row between"><span class="badge '+(c.operation==='remove'?'red':c.operation==='update'?'beige':'green')+'">'+({add:'추가',update:'수정',remove:'삭제'}[c.operation])+'</span><span class="small muted">'+(c.target==='places'?'저장 목록':esc(c.date)+' '+esc(c.startTime||'시간 미정'))+'</span></div><h4>'+esc(c.name||c.beforeName)+'</h4>'+(c.operation==='update'&&c.beforeName!==c.name?'<p>이전: '+esc(c.beforeName)+'</p>':'')+'<p>'+esc(c.reason||c.note||'요청한 변경')+'</p>'+(c.address?'<p>'+esc(assistantLocation(c)?.address||c.address)+'</p>':'')+(c.operation!=='remove'?'<div class="metric-line">'+esc(c.category)+' · '+(c.costKnown?money(c.cost,c.currency):'가격 확인 필요')+(c.placeId||assistantLocation(c)||c.target==='itinerary'&&!c.sourceUrls?.length?'':' · 새 장소 위치 확인 필요')+'</div>':'')+(c.operation!=='remove'&&!c.placeId&&(c.target==='places'||c.sourceUrls?.length)?'<div class="ai-location-status">'+(assistantLocation(c)?'<span class="badge green">지도 위치 확인됨</span>':'<span class="badge beige">지도 위치 확인 필요</span>')+act('ai-location',icon('map')+(assistantLocation(c)?'위치 다시 확인':'지도에서 확인'),'btn secondary sm','data-change="'+c.changeId+'"')+'</div>':'')+(c.sourceUrls||[]).map(u=>external(u,'출처 · '+esc(linkHost(u)),'assistant-source')).join('')+'</article>').join(''):'<div class="assistant-no-proposal">'+icon('calendar')+'<p>대화를 보내면 여기에 변경안이 보여요.<br>반영 전까지 현재 일정은 유지됩니다.</p></div>')+(proposal?.issues?.length?'<div class="warning">'+proposal.issues.map(esc).join('<br>')+'</div>':'')+(proposal&&proposal.baseVersion!==t.version?'<div class="warning">동행이 일정을 변경했어요. “최신 일정 기준으로 다시 제안해줘”라고 보내주세요.</div>':'')+(proposal?act('ai-apply',icon('check')+'선택한 '+selection.length+'개 공동 일정에 반영','btn primary assistant-apply',!selection.length||proposal.baseVersion!==t.version||chat.sending||chat.pending||chat.applying?'disabled':''):'')+act('ai-see-plan',icon('calendar')+'현재 일정 보기','btn secondary assistant-apply')+'<div class="info-note" style="margin-top:16px">검색 출처가 있어도 미래 날짜의 영업·가격·이동 시간은 방문 전 확인해주세요. 새 장소의 좌표는 장소 편집에서 확인할 수 있어요.</div></div></aside></div><div class="assistant-examples">'+examples.map(m=>act('ai-example',esc(m),'pill','data-message="'+esc(m)+'"')).join('')+'</div>'+(proposal?act('ai-mobile-review',icon('list')+'추천 변경안 '+proposal.changes.length+'개 보기','btn primary floating-action ai-review-fab'):'');
}
function afterAssistantRender(){const box=$('#ai-messages');if(box)box.scrollTop=box.scrollHeight;clearTimeout(assistantTimer);const chat=state.aiChats[state.trip.id];if(chat?.pending&&!chat.sending)assistantTimer=setTimeout(()=>{if(state.trip&&state.tab==='assistant')loadAssistant();},3000);}
async function loadAssistant(){
  const id=state.trip.id,account=state.user.id;clearTimeout(assistantTimer);
  if(!state.config.aiConfigured){state.aiChats[id]={version:0,messages:[],proposal:null};render();return;}
  state.aiChats[id]={...state.aiChats[id],loading:true};render();
  try{const result=await api('/trips/'+id+'/assistant');if(state.user?.id!==account)return;state.aiChats[id]={...result.conversation,loading:false,loadFailed:false,error:''};}catch(e){if(state.user?.id!==account)return;state.aiChats[id]={...state.aiChats[id],loading:false,loadFailed:true,error:e.message};}
  if(state.trip?.id===id&&state.tab==='assistant')render();
}
async function sendAssistant(){
  const id=state.trip.id,account=state.user.id,chat=state.aiChats[id]||{version:0},message=(state.aiDrafts[id]||'').trim();if(!message||chat.sending||chat.pending)return;
  state.aiChats[id]={...chat,sending:true,error:'',messages:[...(chat.messages||[]),{role:'user',content:message}]};state.aiDrafts[id]='';render();
  try{const result=await api('/trips/'+id+'/assistant',{method:'POST',body:{message,version:chat.version,scopeDate:state.aiDates[id]??state.day??state.trip.start}});if(state.user?.id!==account)return;state.aiChats[id]={...result.conversation,sending:false,error:''};}
  catch(e){if(state.user?.id!==account)return;state.aiDrafts[id]=message;try{const result=await api('/trips/'+id+'/assistant');if(state.user?.id!==account)return;state.aiChats[id]={...result.conversation,sending:false,error:e.message};}catch{if(state.user?.id!==account)return;state.aiChats[id]={...chat,sending:false,error:e.message};}}
  if(state.trip?.id===id&&state.tab==='assistant')render();
}
async function applyAssistant(){const id=state.trip.id,account=state.user.id,chat=state.aiChats[id];if(!chat?.proposal||chat.applying)return;state.aiChats[id]={...chat,applying:true};render();try{const result=await api('/trips/'+id+'/assistant/apply',{method:'POST',body:{proposalId:chat.proposal.id,version:chat.version,changeIds:assistantSelection(id,chat.proposal),locations:chat.proposal.changes.filter(c=>assistantSelection(id,chat.proposal).includes(c.changeId)&&assistantLocation(c,id)).map(c=>({changeId:c.changeId,...assistantLocation(c,id)}))}});if(state.user?.id!==account)return;if(state.trip?.id===id){state.trip=result.trip;state.routes={};}state.trips=state.trips.map(t=>t.id===id?result.trip:t);state.aiChats[id]={...result.conversation,error:''};try{removeReview(localStorage,state.user.id,id,chat.proposal.id);}catch{}delete state.aiSelections[id];toast('공동 여행 일정에 반영했어요.');}catch(e){if(state.user?.id!==account)return;state.aiChats[id]={...chat,applying:false,error:e.message};if(state.trip?.id===id)await refreshTrip(id);}if(state.trip?.id===id)render();}

function field(name,label,value='',options={}) {
  const attrs=`name="${name}" ${options.required?'required':''} ${options.min!=null?`min="${options.min}"`:''} ${options.max!=null?(options.type==='number'?`max="${options.max}"`:`maxlength="${options.max}"`):''} ${options.minlength?`minlength="${options.minlength}"`:''} ${options.autocomplete?`autocomplete="${options.autocomplete}"`:''}`;
  const element=options.options?`<select ${attrs}>${options.options.map(o=>{const v=typeof o==='string'?o:o.value,l=typeof o==='string'?o:o.label;return `<option value="${esc(v)}" ${String(value)===String(v)?'selected':''}>${esc(l)}</option>`;}).join('')}</select>`:options.area?`<textarea ${attrs} placeholder="${esc(options.placeholder||'')}">${esc(value)}</textarea>`:`<input ${attrs} type="${options.type||'text'}" value="${esc(value)}" ${options.type==='number'?'step="any"':''} placeholder="${esc(options.placeholder||'')}" ${options.readonly?'readonly':''}>`;
  return `<label class="field ${options.wide?'span2':''}"><span>${label}${options.required?' <span class="muted">*</span>':''}</span>${element}${options.hint?`<small>${options.hint}</small>`:''}</label>`;
}
const selectMembers = () => state.trip.members.map(m=>({value:m.id,label:m.name}));
function modal(title,body,submit,onSubmit,opts={}) {
  const el=$('#modal');el.className=body.includes('class="form-grid"')?'form-dialog':'sheet-dialog';disposeLocationPicker();if(el.open)el.close(); modalHandler=onSubmit; modalRevision=state.trip?.version??null;
  el.innerHTML=`<form id="modal-form"><div class="modal-head"><h2 id="modal-title">${title}</h2>${iBtn('close-modal','close','닫기')}</div><div class="modal-body">${body}<div id="modal-error" class="form-error" style="margin-top:15px"></div></div><div class="modal-foot">${act('close-modal',opts.cancel||'닫기','btn secondary')}${submit?`<button type="submit" class="btn primary">${submit}</button>`:''}</div></form>`;
  el.showModal();
  $('#modal-form').onsubmit=async e=>{e.preventDefault();if(!modalHandler)return;const form=e.currentTarget,button=form.querySelector('[type=submit]');button.disabled=true;$('#modal-error').textContent='';try{const close=await modalHandler(Object.fromEntries(new FormData(form)),form);if(close!==false)el.close();}catch(error){if($('#modal-error')){ $('#modal-error').textContent=error.message; if(error.status===409 && modalRevision!=null && state.trip?.version>modalRevision)showConflict(form); }else toast(error.message);}finally{button.disabled=false;}};
}
function showConflict(form){
  const latest=form.dataset.kind?state.trip[form.dataset.kind]?.find(x=>x.id===form.dataset.itemId):state.trip;
  const rows=[];
  if(latest)for(const fieldEl of form.elements){const key=fieldEl.name;if(!key||fieldEl.type==='hidden'||fieldEl.type==='submit'||fieldEl.type==='button')continue;let value=key.startsWith('rate_')?state.trip.rates[key.slice(5)]:latest[key];if(value==null)continue;if(Array.isArray(value))value=value.join(' · ');if(typeof value==='boolean')value=value?'완료':'미완료';const label=fieldEl.closest('label')?.querySelector('span')?.textContent||key;rows.push('<div><strong>'+esc(label)+':</strong> '+esc(String(value)||'미입력')+'</div>');}
  const box=document.createElement('div');box.innerHTML='<details style="margin:12px 0"><summary>최신 저장 내용 보기</summary><div style="margin-top:10px;font-size:11px">'+(rows.join('')||'여행의 다른 항목이 변경되었어요. 입력 내용은 유지되어 있어요.')+'</div></details>'+act('review-conflict','최신 내용을 확인했어요 · 입력 유지','btn secondary sm','data-version="'+state.trip.version+'"');$('#modal-error').append(box);
}
function tripDialog(edit=false) {
  const t=edit?state.trip:{type:'overseas',currency:'JPY',country:'',city:'',start:'',end:'',rates:{KRW:1},interests:[]}; const version=t.version;
  const content=`<div class="form-grid">${field('name','여행 이름',t.name,{required:true,wide:true,placeholder:'예: 둘이 떠나는 첫 일본 여행',max:100})}${field('type','여행 구분',t.type,{options:[{value:'overseas',label:'해외여행'},{value:'domestic',label:'국내여행'}]})}${field('currency','기본 통화',t.currency,{options:currencies})}${field('timeZone','여행지 시간대',t.timeZone||'',{options:[{value:'',label:'자동 (한국·일본 외에는 시간대 선택)'},...new Set([t.timeZone||'UTC','Asia/Seoul','Asia/Tokyo','Asia/Taipei','Asia/Shanghai','Asia/Bangkok','Asia/Singapore','Europe/Paris','Europe/London','America/New_York','America/Los_Angeles','Pacific/Honolulu','Australia/Sydney'])]})}${field('country','국가',t.country,{required:true,placeholder:'예: 일본'})}${field('city','도시',t.city,{required:true,placeholder:'여행할 도시를 입력해주세요'})}${field('start','출발일',t.start,{type:'date',required:true})}${field('end','종료일',t.end,{type:'date',required:true})}${field('companion','동행인 메모',t.companion,{placeholder:'예: 우리 둘'})}${field('budget','여행 예산 (기본 통화)',t.budget||'',{type:'number',min:0})}${field('image','대표 이미지 URL',t.image,{type:'url',wide:true,placeholder:'https://… (비워두면 기본 일러스트)'})}${field('note','여행 메모',t.note,{area:true,wide:true})}<label class="field span2"><span>우리의 관심사</span><div class="filter-row" style="margin:0">${categories.filter(c=>!['숙소','이동','기타'].includes(c)).map(c=>`<label class="pill"><input type="checkbox" name="interests" value="${c}" ${t.interests?.includes(c)?'checked':''}>${c}</label>`).join('')}</div></label></div>${edit?'<p class="info-note" style="margin-top:18px">기간을 줄여도 기존 일정은 지워지지 않아요. 기간 밖 일정은 별도 날짜 탭으로 보존돼요.</p>':''}`;
  modal(edit?'여행 정보 수정':'새 여행',content,edit?'변경 내용 저장':'여행 만들기',async(b,f)=>{if(b.end<b.start)throw new Error('종료일은 출발일 이후로 선택해주세요.');b.interests=new FormData(f).getAll('interests');b.rates=edit?state.trip.rates:{KRW:1};b.sample=edit?state.trip.sample:false;if(b.type==='domestic'){b.currency='KRW';b.country='대한민국';}if(edit){await mutate({action:'meta',value:b},version);}else{const created=await api('/trips',{method:'POST',body:b});await loadTrips();await openTrip(created.id);toast('새 여행이 만들어졌어요.');}});
  $('[name=type]').onchange=e=>{if(e.target.value==='domestic'){$('[name=country]').value='대한민국';$('[name=currency]').value='KRW';}};
}
function paymentFields(o={}) { return `${field('cost','전체 비용',o.cost||'',{type:'number',min:0})}${field('currency','통화',o.currency||state.trip.currency,{options:currencies})}${field('payer','결제자',o.payer||state.user.id,{options:selectMembers()})}${field('share','결제자 외 1인 부담 (%)',o.share??50,{type:'number',min:0,max:100,hint:'50%이면 반반, 0%이면 결제자가 전액 부담해요.'})}<label class="pill span2"><input type="checkbox" name="paid" ${o.paid?'checked':''}>결제 완료 — 지출에 반영</label>${settlementField(o)}`; }
function itemDialog(kind,id='',defaults={}) {
  const t=state.trip,old=t[kind].find(x=>x.id===id),o=locationOf(old)||defaults,version=t.version;let files=structuredClone(old?.attachments||[]);
  const titles={places:'장소',itinerary:'일정',stays:'숙소',reservations:'예약',tasks:'할 일',expenses:'지출'};let body='';
  if(kind==='places'||kind==='stays') {
    body=`<div class="search-box"><span class="small muted">장소명·주소 검색</span><div class="row" style="margin-top:8px"><input id="place-query" placeholder="도시와 장소명 또는 주소" aria-label="장소 검색어" value="${esc([o.name,o.address,t.city].filter(Boolean).join(' ').slice(0,200))}">${act('search-place',icon('search')+'검색','btn primary sm')}</div><div class="search-results" id="search-results"></div><p class="small muted" style="margin-top:9px">${state.config.search?'검색 결과를 선택하면 주소와 좌표가 채워져요.':'온라인 검색 미연결 · 직접 입력하거나 지도에서 위치를 선택할 수 있어요.'}</p></div><div class="form-grid"><input type="hidden" name="googlePlaceId" value="${esc(o.googlePlaceId||'')}">${field('name',kind==='stays'?'숙소 이름':'장소 이름',o.name,{required:true,wide:true})}${kind==='places'?field('category','카테고리',o.category||'관광',{options:categories}):''}${kind==='places'?field('cost','예상 비용',o.cost||'',{type:'number',min:0}):''}${kind==='places'?field('currency','통화',o.currency||t.currency,{options:currencies}):''}${field('address','주소',o.address,{wide:true})}${field('lat','위도',o.lat??'',{type:'number',min:-90,max:90,placeholder:'예: 35.6812'})}${field('lng','경도',o.lng??'',{type:'number',min:-180,max:180,placeholder:'예: 139.7671'})}<div class="span2 row wrap">${act('pick-location',`${icon('map')}지도에서 위치 선택`,'btn soft sm')}${external(searchLink(o.name||o.address?o:{name:t.city,address:t.city+' '+t.country}),'Google Maps에서 확인')}<span class="small muted">위치가 있어야 거리와 지도 핀이 표시돼요.</span></div>${field('link','지도·예약·블로그 링크',o.link,{type:'url',wide:true,hint:'링크의 정보는 자동으로 가져오지 않아요. 이름·주소를 직접 확인해주세요.'})}${field('photo','사진 URL',o.photo,{type:'url',wide:true})}`;
    if(kind==='stays')body+=`${field('checkIn','체크인 날짜',o.checkIn||t.start,{type:'date',required:true})}${field('checkInTime','체크인 시간',o.checkInTime||'',{type:'time'})}${field('checkOut','체크아웃 날짜',o.checkOut||t.end,{type:'date',required:true})}${field('checkOutTime','체크아웃 시간',o.checkOutTime||'',{type:'time'})}${field('status','예약 상태',o.status||'후보',{options:['후보','예약 완료','취소']})}${field('bookingNumber','예약번호',o.bookingNumber)}${paymentFields(o)}`;
    body+=`${field('note','메모',o.note,{area:true,wide:true})}<input type="hidden" name="source" value="${esc(o.source||'직접 등록')}"></div>`;
  }else if(kind==='itinerary') {
    const all=[...t.places,...t.stays];
    body=`<div class="form-grid">${field('placeId','저장한 장소에서 선택',o.placeId||'',{wide:true,options:[{value:'',label:'장소 없이 직접 일정 입력'},...all.map(p=>({value:p.id,label:`[${p.category}] ${p.name}`}))]})}${field('name','일정 이름',o.name,{required:true,wide:true,placeholder:'예: 공항 도착, 동네 산책'})}${field('date','일정 날짜',o.date||state.day||t.start,{type:'date',required:true})}${field('category','카테고리',o.category||'관광',{options:categories})}${field('startTime','시작 시간',o.startTime,{type:'time'})}${field('endTime','종료 시간',o.endTime,{type:'time'})}${field('duration','체류 시간 (분)',o.duration||'',{type:'number',min:0,max:1440})}${field('mode','이곳까지 이동 수단',o.mode||'walk',{options:[{value:'walk',label:'도보'},{value:'drive',label:'자동차'},{value:'transit',label:'대중교통 (외부 길찾기)'}]})}${field('cost','예상 비용',o.cost||'',{type:'number',min:0})}${field('currency','통화',o.currency||t.currency,{options:currencies})}${field('link','예약·관련 링크',o.link,{type:'url',wide:true})}${field('note','메모',o.note,{area:true,wide:true})}</div><p class="info-note" style="margin-top:16px">시간은 여행지 현지 시각으로 입력해주세요. 날짜를 바꾸면 해당 날짜로 이동해요. 숙소 비용은 숙소에서 한 번만 합산돼요.</p>`;
  }else if(kind==='reservations')body=`<div class="form-grid">${field('name','예약 이름',o.name,{required:true,wide:true})}${field('category','예약 종류',o.category||'항공',{options:['항공','기차','버스','렌터카','입장권','식당','기타']})}${field('date','날짜',o.date||state.day||t.start,{type:'date',required:true})}${field('startTime','시작 시간',o.startTime,{type:'time'})}${field('endTime','종료 시간',o.endTime,{type:'time'})}${field('bookingNumber','예약번호',o.bookingNumber,{wide:true})}${field('address','주소·출발/도착 정보',o.address,{wide:true})}${field('link','예약 링크',o.link,{type:'url',wide:true})}${paymentFields(o)}${field('note','메모',o.note,{area:true,wide:true})}</div>`;
  else if(kind==='tasks')body=`<div class="form-grid">${field('name','할 일·준비물 이름',o.name,{required:true,wide:true})}${field('category','구분',o.category||'할 일',{options:['할 일','준비물']})}${field('assignee','담당자',o.assignee||'',{options:[{value:'',label:'아직 정하지 않음'},...selectMembers()]})}${field('note','메모',o.note,{area:true,wide:true})}<label class="pill span2"><input type="checkbox" name="done" ${o.done?'checked':''}>완료했어요</label></div>`;
  else if(kind==='expenses') {
    const estimates=budgetOf(t).estimates;
    body=`<div class="form-grid">${settlementField(o)}${field('name','지출 이름',o.name,{required:true,wide:true})}${field('date','지출 날짜',o.date||state.day||t.start,{type:'date',required:true})}${field('category','카테고리',o.category||'기타',{options:categories})}${field('amount','실제 결제 금액',o.amount??'',{type:'number',required:true,min:0})}${field('currency','통화',o.currency||t.currency,{options:currencies})}${field('payer','결제한 사람',o.payer||state.user.id,{options:selectMembers()})}${field('share','결제자 외 1인 부담 (%)',o.share??50,{type:'number',min:0,max:100})}${field('sourceId','기존 예약·일정과 연결',o.sourceId||'',{wide:true,options:[{value:'',label:'별도 지출'},...estimates.map(x=>({value:x.id,label:x.name}))],hint:'이미 결제 완료한 예약과 연결하면 실제 지출은 이 기록으로 대체돼요.'})}${field('note','메모',o.note,{area:true,wide:true})}</div>`;
  }
  if(['stays','reservations'].includes(kind))body+=attachmentEditor(files);
  modal(`${old?'수정할':'새로 저장할'} ${titles[kind]}`,body,old?'변경 내용 저장':'저장하기',async(b,f)=>{for(const key of ['paid','done'])b[key]=new FormData(f).has(key);if(['stays','reservations','expenses'].includes(kind))b.excludeFromSettlement=!new FormData(f).has('includeSettlement');if(old)b.id=old.id;if(['stays','reservations'].includes(kind))b.attachments=files;await mutate({action:'upsert',collection:kind,value:b},version);toast('저장했어요.');});
  if(['stays','reservations'].includes(kind))bindAttachmentEditor(()=>files,value=>{files=value;});
  foldAdditionalFields(kind);
  $('#modal-form').dataset.kind=kind;$('#modal-form').dataset.itemId=id;
  if(old){const holder=document.createElement('div');holder.className='grow';holder.innerHTML=act('delete-item',`${icon('trash')}삭제`,'btn danger sm',`data-id="${old.id}" data-kind="${kind}"`);$('.modal-foot').prepend(holder);}
  if(kind==='itinerary')$('[name=placeId]').onchange=e=>{const p=allPlaces().find(x=>x.id===e.target.value);if(p){$('[name=name]').value=p.name;$('[name=category]').value=p.category;$('[name=cost]').value=p.category==='숙소'?0:p.cost;$('[name=currency]').value=p.currency;}};
  if(kind==='expenses')$('[name=sourceId]').onchange=e=>{const p=budgetOf(t).estimates.find(x=>x.id===e.target.value);if(p){$('[name=name]').value=p.name;$('[name=amount]').value=p.amount;$('[name=currency]').value=p.currency;$('[name=category]').value=categories.includes(p.category)?p.category:'기타';$('[name=includeSettlement]').checked=p.excludeFromSettlement!==true;}};
}
const allPlaces=()=>[...state.trip.places,...state.trip.stays];
let searchResults=[];
async function searchPlace(){
  const query=$('#place-query').value.trim().slice(0,200);if(!query)return;const target=$('#search-results');target.textContent='장소를 찾고 있어요…';
  try{
    let result;
    if(usingGoogle()){
      if(!$('#location-picker'))await pickLocation();else await googlePickerReady;
      if(locationPicker?.provider!=='google')throw Error('Google 지도를 먼저 불러와주세요. API 연결 설정을 확인해주세요.');
      result={results:await searchGooglePlaces(query)};
    }else result=await api('/search?q='+encodeURIComponent(query));
    if(!target.isConnected)return;searchResults=result.results||[];
    target.innerHTML=searchResults.map((p,i)=>act('choose-search',esc(p.name)+'<small>'+esc(p.address)+'</small><small class="'+(p.precision==='area'?'search-warning':'')+'">'+(p.precision==='area'?'지역·도로 중심 — 정확한 건물 위치가 아닙니다.':'건물·주소 후보 — 실제 위치를 확인하세요.')+'</small>','search-result','data-index="'+i+'" '+(p.precision==='area'?'disabled':''))).join('')||'<p class="small muted">'+esc(result.message||'검색 결과가 없어요. 숙소 이름 + 도시로 검색하거나 지도에서 위치를 선택해주세요.')+'</p>';
  }catch(error){if(target.isConnected)target.textContent=error.message;}
}
function chooseSearchResult(index){
  const candidate=searchResults[index],form=$('#modal-form');if(!candidate||!form)return;
  const merged=mergeLocationCandidate(Object.fromEntries(new FormData(form)),candidate);
  for(const key of ['name','address','link','lat','lng','googlePlaceId','source'])if($('[name='+key+']')&&merged[key]!=null)$('[name='+key+']').value=merged[key];
  showLocationMarker();$('#search-results').innerHTML='<p class="small muted">위치 후보를 선택했어요. 입력한 숙소 이름·주소는 유지했어요. 지도에서 실제 건물인지 확인한 뒤 저장하세요.</p>';
}
function pickLocation(){
  let container=$('#location-picker');if(container){disposeLocationPicker();container.remove();return;}
  if(!usingGoogle()&&!window.L){toast('지도를 불러오지 못했어요. 좌표를 직접 입력해주세요.');return;}
  container=document.createElement('div');container.id='location-picker';container.setAttribute('aria-label','장소 위치 선택 지도');container.style.cssText='height:260px;border-radius:12px;margin-bottom:18px;';$('.modal-body').prepend(container);
  const valid=$('[name=lat]').value!==''&&$('[name=lng]').value!=='',base=state.trip.stays.find(hasCoords)||state.trip.places.find(hasCoords)||{lat:state.trip.type==='domestic'?36.3:35.68,lng:state.trip.type==='domestic'?127.8:139.76};
  if(usingGoogle()){googlePickerReady=initGooglePicker(container,valid?{lat:Number($('[name=lat]').value),lng:Number($('[name=lng]').value)}:base,valid).catch(error=>{if(container.isConnected)container.textContent=error.message;});return googlePickerReady;}
  locationPicker=L.map(container,{zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false}).setView(valid?[Number($('[name=lat]').value),Number($('[name=lng]').value)]:[base.lat,base.lng],valid?16:state.trip.stays.some(hasCoords)?13:6);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(locationPicker);
  if(valid)locationMarker=L.marker([Number($('[name=lat]').value),Number($('[name=lng]').value)]).addTo(locationPicker);
  locationPicker.on('click',e=>{if($('[name=googlePlaceId]'))$('[name=googlePlaceId]').value='';$('[name=lat]').value=e.latlng.lat.toFixed(6);$('[name=lng]').value=e.latlng.lng.toFixed(6);showLocationMarker();});
  container.scrollIntoView({block:'center',behavior:'smooth'});toast('지도에서 원하는 위치를 눌러주세요.');
}
function showLocationMarker(){
  if(!locationPicker||$('[name=lat]').value===''||$('[name=lng]').value==='')return;
  const lat=Number($('[name=lat]').value),lng=Number($('[name=lng]').value);if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)return;
  if(locationPicker.provider==='google'){locationPicker.setPoint({lat,lng});return;}
  locationMarker?.remove();locationMarker=L.marker([lat,lng]).addTo(locationPicker);locationPicker.setView([lat,lng],16);
}
function joinDialog(code=inviteValue){modal('함께하는 여행에 참여하기',`<p class="section-hint">상대방에게 받은 초대 링크나 코드를 붙여 넣어주세요.</p>${field('code','초대 링크 또는 코드',code,{required:true,area:true})}`,'여행에 참여하기',async b=>{let code=b.code.trim();try{code=new URL(code).searchParams.get('invite')||code;}catch{}const trip=await api('/join',{method:'POST',body:{code}});inviteValue='';history.replaceState(null,'',location.pathname);await loadTrips();await openTrip(trip.id);toast('이제 둘이 함께 여행을 준비할 수 있어요.');});}
async function shareDialog(){const t=state.trip,owner=t.owner===state.user.id;let invites=[];if(owner)invites=await api(`/trips/${t.id}/invites`);modal('동행과 여행 공유',`<p class="section-hint">초대한 동행만 이 여행을 보고 수정할 수 있어요.</p><div>${t.members.map(m=>`<div class="share-member"><span class="avatar">${esc(m.name.slice(0,1))}</span><div class="grow"><strong>${esc(m.name)}</strong><p class="small muted">${m.role==='owner'?'여행 소유자':'동행 · 보기 및 편집 가능'}</p></div>${owner&&m.id!==state.user.id?act('remove-member','참여 해제','btn danger sm',`data-id="${m.id}"`):''}</div>`).join('')}</div><div id="invite-result" style="margin-top:20px"></div>${owner&&t.members.length<2?`<div style="margin-top:20px">${act('create-invite',`${icon('link')}7일 초대 링크 만들기`,'btn primary')}<p class="small muted" style="margin-top:10px">링크를 받은 사람은 계정을 만든 뒤 참여할 수 있어요.<br>두 사람은 일정과 예약 정보를 함께 보고 수정할 수 있어요.</p></div>`:''}${invites.map(i=>`<div class="row between" style="margin-top:15px"><span class="small muted">대기 중인 초대 · ${new Date(i.expires).toLocaleDateString('ko-KR')} 만료</span>${act('revoke-invite','초대 취소','btn ghost sm',`data-id="${i.id}"`)}</div>`).join('')}`,'',null);}
function ratesDialog(){const t=state.trip,used=[...new Set([t.currency,...t.itinerary.map(x=>x.currency),...t.stays.map(x=>x.currency),...t.expenses.map(x=>x.currency),...t.reservations.map(x=>x.currency),...Object.keys(t.rates),'JPY','USD'])].filter(c=>c!=='KRW'),version=t.version;modal('원화 환산 기준 설정',`<p class="section-hint">현지 통화 1단위가 몇 원인지 입력해주세요. 비워둔 통화는 원화 합계에서 제외돼요.</p><div class="form-grid">${used.map(c=>field(`rate_${c}`,`1 ${c} = 원`,t.rates[c]||'',{type:'number',min:.000001})).join('')}</div><div class="info-note" style="margin-top:18px">엔화는 ‘100엔’이 아닌 ‘1엔’ 기준이에요. 예를 들어 100엔=900원이면 9를 입력해요.</div>`,'환율 저장',async b=>{const rates={...state.trip.rates,KRW:1};for(const[k,v]of Object.entries(b)){if(v)rates[k.slice(5)]=Number(v);else delete rates[k.slice(5)];}await mutate({action:'meta',value:{...state.trip,rates}},version);});}
function commentsDialog(id){const p=state.trip.places.find(x=>x.id===id),version=state.trip.version;modal(esc(p.name),`<div class="row between"><span class="badge">함께 남기는 메모</span>${external(searchLink(p),'지도 보기')}</div><div style="margin:12px 0 23px">${p.comments.map(c=>`<article class="comment"><strong>${esc(memberName(c.author))}</strong><small>${new Date(c.at).toLocaleString('ko-KR')}</small><p>${esc(c.text)}</p></article>`).join('')||'<p class="small muted" style="padding:15px 0">아직 댓글이 없어요. 같이 하고 싶은 걸 남겨보세요.</p>'}</div>${field('comment','댓글','',{required:true,area:true,max:1000,placeholder:'여기는 저녁에 가면 좋을 것 같아!'})}`,'댓글 남기기',async b=>{await mutate({action:'comment',itemId:id,value:b.comment},version);});}
function recommendDialog(){const t=state.trip,day=state.day||t.start,list=recommendations(t,day);modal('저장한 장소로 코스 추천',`<div class="info-note">저장한 장소에서 두 사람의 하트, 관심사, 예산과 숙소·장소 사이 직선거리를 참고해 제안해요. 영업시간과 실제 교통 경로는 반영하지 않았어요.</div><p class="small muted" style="margin-top:15px">제안 날짜 ${day} · ${daysBetween(t.start,t.end).length}일 여행 · ${esc(t.interests.join(' · ')||'관심사 미설정')}</p>${list.map((p,i)=>`<article class="recommendation"><div class="row between"><strong>${i+1}. ${esc(p.name)}</strong>${act('schedule-place','검토 후 일정 추가','btn soft sm',`data-id="${p.id}"`)}</div><p>${p.reasons.map(esc).join(' · ')}</p><p>출처: 내 여행에 저장한 장소 · ${esc(p.source)}</p></article>`).join('')||'<p class="muted small" style="margin-top:20px">아직 일정에 넣지 않은 장소를 저장해주세요. 새로운 장소는 AI 여행 도우미에서 추천받을 수 있어요.</p>'}`,'',null);}

async function handleAction(action,el){const id=el.dataset.id,kind=el.dataset.kind;
  switch(action){
    case 'auth-login':authMode='login';renderAuth();break;case 'auth-register':authMode='register';renderAuth();break;
    case 'logout':await forgetOffline();await api('/auth/logout',{method:'POST',body:{}});state.stream?.close();state.trip=null;state.user=null;state.trips=[];state.aiChats={};state.aiSelections={};state.aiLocations={};state.aiDates={};state.aiExpanded={};state.aiDrafts={};state.reviewError=false;clearGoogleLocations();disposeMap();render();break;
    case 'home':state.stream?.close();state.trip=null;state.save='저장 완료';location.hash='';await loadTrips();render();break;
    case 'open-trip':await openTrip(id);break;case 'new-trip':tripDialog();break;case 'edit-trip':tripDialog(true);break;
    case 'list-upcoming':state.listFilter='upcoming';render();break;case 'list-past':state.listFilter='past';render();break;
    case 'tab':state.tab=el.dataset.tab;if(el.dataset.view)state.mapMode=el.dataset.view==='map';if(el.dataset.view==='map')state.journeyMode=false;render();if(state.tab==='assistant')await loadAssistant();break;case 'day':state.journeyMode=false;state.mapFocus='all';state.day=el.dataset.date;state.quickExpanded=false;state.selected=null;render();break;
    case 'mobile-menu':modal('여행 메뉴',`<p class="section-hint">${esc(state.user.name)}님의 여행</p><div class="mobile-menu-list">${act('home',icon('grid')+'내 여행','btn secondary','data-mobile-nav="true"')}${act('new-trip',icon('plus')+'새 여행','btn secondary','data-mobile-nav="true"')}${act('join',icon('users')+'초대 코드로 참여','btn secondary','data-mobile-nav="true"')}${act('import',icon('upload')+'여행 가져오기','btn secondary','data-mobile-nav="true"')}${external('/offline.html','기기에 저장한 일정','btn secondary')}${act('logout',icon('logout')+'로그아웃','btn ghost','data-mobile-nav="true"')}</div>`,'',null);break;
    case 'mobile-trip-more':mobileTripMore();break;case 'mobile-add':mobileAddDialog();break;
    case 'reload-page':location.reload();break;
    case 'itinerary-view':state.journeyMode=el.dataset.mode==='journey';state.mapMode=false;if(state.journeyMode)state.day=journeyOverview(state.trip).date;render();break;
    case 'journey-event':state.journeyMode=false;state.day=el.dataset.date;state.selected=id;state.expandedEvents.add(id);render();document.querySelector('[data-event-id="'+id+'"]')?.scrollIntoView({block:'center',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});break;
    case 'toggle-quick':state.quickExpanded=!state.quickExpanded;render();break;
    case 'toggle-map-size':state.mapWide=!state.mapWide;render();break;
    case 'quick-stay':await mutate({action:'stayDay',stayId:id,date:el.dataset.date});toast('숙소를 출발·도착 일정에 추가했어요.');break;
    case 'undo-delete':await mutate({action:'restore',deletionId:id});toast('삭제한 항목을 복구했어요.');break;
    case 'map-all':state.mapFocus='all';render();break;case 'map-stay':state.mapFocus='stay';render();break;
    case 'offline-save':offlineDialog();break;
    case 'remove-offline':state.offlineIds.delete(id);delete state.offlineVersions[id];await offlineQueue;await removeOffline(id);$('#modal').close();toast('이 기기에 저장한 일정을 삭제했어요.');break;
    case 'transfer-event':transferEventDialog(id);break;
    case 'select-visible-places':state.placeSelection=[...new Set([...state.placeSelection,...el.dataset.ids.split(',').filter(Boolean)])].slice(0,100);render();break;
    case 'clear-place-selection':state.placeSelection=[];render();break;case 'schedule-many':scheduleManyDialog();break;
    case 'attachment-open':openAttachment(kind,id,Number(el.dataset.index));break;
    case 'show-list':state.mapMode=false;render();break;case 'show-map':state.mapMode=true;render();break;
    case 'new-place':itemDialog('places');break;case 'new-itinerary':itemDialog('itinerary');break;case 'new-stay':itemDialog('stays');break;case 'new-reservation':itemDialog('reservations');break;case 'new-task':itemDialog('tasks');break;case 'new-expense':itemDialog('expenses');break;
    case 'edit-item':itemDialog(kind,id);break;
    case 'schedule-place':{const p=allPlaces().find(x=>x.id===id);itemDialog('itinerary','',{placeId:p.id,name:p.name,category:p.category,cost:p.cost,currency:p.currency});break;}
    case 'delete-item':deleteItemDialog(kind,id);break;
    case 'delete-trip':{if(state.trip.owner!==state.user.id){toast('여행 소유자만 삭제할 수 있어요.');break;}const tid=state.trip.id;modal('여행을 삭제할까요?',`<p><strong>${esc(state.trip.name)}</strong></p><p class="small muted" style="margin-top:10px">여행과 함께 저장된 기록이 삭제돼요. 필요한 기록은 먼저 내보내기로 보관해주세요.</p>`,'여행 삭제',async()=>{await api(`/trips/${tid}`,{method:'DELETE',body:{}});state.stream?.close();state.trip=null;await removeOffline(tid).catch(()=>{});state.offlineIds.delete(tid);location.hash='';await loadTrips();render();});break;}
    case 'like':await mutate({action:'like',itemId:id});break;case 'comments':commentsDialog(id);break;
    case 'place-filter':state.filter=el.dataset.filter;render();break;
    case 'select-item':state.selected=id;render();break;
    case 'move-up':case 'move-down':{const order=state.trip.itinerary.map(x=>x.id),daily=dayItems().map(x=>x.id),at=daily.indexOf(id),other=daily[at+(action==='move-up'?-1:1)];if(!other)break;const a=order.indexOf(id),b=order.indexOf(other);[order[a],order[b]]=[order[b],order[a]];await mutate({action:'reorder',ids:order});break;}
    case 'sort-time':{const sorted=dayItems().toSorted((a,b)=>(a.startTime||'99:99').localeCompare(b.startTime||'99:99'));let i=0;await mutate({action:'reorder',ids:state.trip.itinerary.map(x=>x.date===state.day?sorted[i++].id:x.id)});break;}
    case 'toggle-task':taskUpdates.toggle(id);break;
    case 'search-place':await searchPlace();break;
    case 'choose-search':{chooseSearchResult(Number(el.dataset.index));break;}
    case 'retry-map':render();break;
    case 'pick-location':pickLocation();break;
    case 'close-modal':$('#modal').close();break;case 'review-conflict':modalRevision=Number(el.dataset.version);$('#modal-error').textContent='최신 저장 내용을 확인했어요. 현재 입력을 적용하려면 저장 버튼을 다시 눌러주세요.';break;case 'join':joinDialog();break;case 'share':await shareDialog();break;
    case 'create-invite':{const result=await api(`/trips/${state.trip.id}/invites`,{method:'POST',body:{}}),base=state.config.publicUrl||location.origin,url=`${base}/?invite=${result.code}`;$('#invite-result').innerHTML=`<p class="small muted" style="margin-bottom:9px">이 링크를 상대방에게 보내주세요.</p><div class="share-code">${esc(url)}</div><div class="row" style="margin-top:10px">${act('copy',`${icon('link')}링크 복사`,'btn soft sm',`data-value="${esc(url)}"`)}${act('revoke-invite','초대 취소','btn ghost sm',`data-id="${result.id}"`)}</div><p class="small muted" style="margin-top:10px">초대 코드: ${result.code}</p>`;el.disabled=true;break;}
    case 'copy':try{await navigator.clipboard.writeText(el.dataset.value);toast('초대 링크를 복사했어요.');}catch{toast('위의 링크를 선택해 복사해주세요.');}break;
    case 'revoke-invite':await api(`/trips/${state.trip.id}/invites/${id}`,{method:'DELETE',body:{}});await shareDialog();toast('초대를 취소했어요.');break;
    case 'remove-member':{const tid=state.trip.id;modal('동행의 참여를 해제할까요?','<p class="small muted">동행은 이 여행에 접근할 수 없게 돼요. 기존 기록은 유지돼요.</p>','참여 해제',async()=>{state.trip=await api(`/trips/${tid}/members/${id}`,{method:'DELETE',body:{}});render();});break;}
    case 'apply-stay':{const s=state.trip.stays.find(x=>x.id===id),version=state.trip.version;const choices=daysBetween(s.checkIn,s.checkOut).map(d=>({value:d,label:`${d} (${weekday(d)})`}));modal('숙소를 하루 동선에 연결',`<p class="section-hint">${esc(s.name)}을 선택한 날짜의 첫 장소와 마지막 장소로 추가해요. 숙박 비용은 다시 더하지 않아요.</p>${field('date','적용할 날짜',choices.some(x=>x.value===state.day)?state.day:s.checkIn,{options:choices})}`,'출발·도착지로 추가',b=>mutate({action:'stayDay',stayId:id,date:b.date},version));break;}
    case 'quick-day':state.day=el.dataset.date;state.tab='itinerary';state.mapMode=false;render();break;
    case 'ai-mobile-review':state.aiExpanded[state.trip.id]=true;rememberAssistantReview();render();$('#ai-proposal')?.scrollIntoView({block:'start',behavior:'smooth'});break;
    case 'ai-location':assistantLocationDialog(el.dataset.change);break;
    case 'ai-toggle-proposal':state.aiExpanded[state.trip.id]=!state.aiExpanded[state.trip.id];rememberAssistantReview();render();break;
    case 'ai-select-all':case 'ai-select-none':{const p=state.aiChats[state.trip.id]?.proposal;if(p)state.aiSelections[state.trip.id]={proposalId:p.id,ids:action==='ai-select-all'?p.changes.map(c=>c.changeId):[]};rememberAssistantReview();render();break;}
    case 'ai-refresh':await loadAssistant();break;case 'ai-example':state.aiDrafts[state.trip.id]=el.dataset.message;render();break;case 'ai-apply':await applyAssistant();break;case 'ai-see-plan':if(state.aiDates[state.trip.id])state.day=state.aiDates[state.trip.id];state.tab='itinerary';render();break;case 'rates':ratesDialog();break;case 'recommend':recommendDialog();break;
    case 'record-estimate':{const e=budgetOf(state.trip).estimates.find(x=>x.id===id),old=state.trip.expenses.find(x=>x.sourceId===id);itemDialog('expenses',old?.id||'',{name:e.name,date:e.date,category:e.category,amount:e.amount,currency:e.currency,sourceId:id,excludeFromSettlement:e.excludeFromSettlement});break;}
    case 'route':{const a=state.trip.itinerary.find(x=>x.id===el.dataset.from),b=state.trip.itinerary.find(x=>x.id===el.dataset.to),key=`${a.id}:${b.id}:${b.mode}`;el.disabled=true;el.textContent='확인 중…';try{state.routes[key]=await api('/route',{method:'POST',body:{from:placeFor(a),to:placeFor(b),mode:b.mode}});if(!state.routes[key].available)toast(state.routes[key].message);render();}catch(e){el.disabled=false;el.textContent='경로 재시도';throw e;}break;}
    case 'export':{const content=await api(`/trips/${state.trip.id}/export`);const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(content,null,2)],{type:'application/json'}));a.href=url;a.download=`${state.trip.name.replace(/[\\/:*?"<>|]/g,'_')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);break;}
    case 'import':importTrip();break;
    case 'more':modal('여행 기록 가져오기',`<div class="stack">${act('import',`${icon('upload')}JSON 파일 가져오기`,'btn secondary')}${act('sample',`${icon('spark')}일본 여행 샘플 만들어보기`,'btn soft')}<p class="small muted">샘플은 내 계정에 별도 여행으로 만들어지고 언제든 삭제할 수 있어요. 실제 예약이나 확정 일정이 아닙니다.</p></div>`,'',null);break;
    case 'sample':$('#modal').close();await createSample();break;
  }
}
$('#modal').addEventListener('close',()=>{if(!$('#modal').open)disposeLocationPicker();});
document.addEventListener('click',e=>{const el=e.target.closest('[data-action]');if(el?.dataset.mobileNav)$('#modal').close();if(el)handleAction(el.dataset.action,el).catch(error=>toast(error.message));});
document.addEventListener('submit',e=>{if(e.target.id==='assistant-form'){e.preventDefault();sendAssistant().catch(error=>toast(error.message));}});
document.addEventListener('input',e=>{if(['lat','lng'].includes(e.target.name)&&$('#modal').open){if($('[name=googlePlaceId]'))$('[name=googlePlaceId]').value='';if($('[name=source]'))$('[name=source]').value='직접 좌표 확인';showLocationMarker();}if(e.target.id==='ai-message'&&state.trip)state.aiDrafts[state.trip.id]=e.target.value;});
document.addEventListener('change',e=>{if(e.target.dataset.placeSelect){const id=e.target.dataset.placeSelect;state.placeSelection=e.target.checked?[...new Set([...state.placeSelection,id])]:state.placeSelection.filter(x=>x!==id);render();return;}if(e.target.dataset.aiSelect&&state.trip){const id=state.trip.id,p=state.aiChats[id]?.proposal,ids=assistantSelection(id,p),key=e.target.dataset.aiSelect;state.aiSelections[id]={proposalId:p.id,ids:e.target.checked?[...new Set([...ids,key])]:ids.filter(x=>x!==key)};rememberAssistantReview(id);render();return;}if(e.target.id==='ai-scope-date'&&state.trip){state.aiDates[state.trip.id]=e.target.value;rememberAssistantReview();}if(e.target.id==='category-filter'){state.category=e.target.value;render();}});
document.addEventListener('keydown',e=>{if(e.target.id==='place-query'&&e.key==='Enter'){e.preventDefault();searchPlace();}});
window.addEventListener('online',()=>{if(state.trip)refreshTrip(state.trip.id);});
async function importTrip(){const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.onchange=async()=>{try{const file=input.files[0];if(!file)return;if(file.size>2e6)throw new Error('파일은 2MB 이하여야 해요.');const data=JSON.parse(await file.text());modal('여행 파일 가져오기',`<p><strong>${esc(data.name||'여행')}</strong>을 새 여행으로 가져올까요?</p><p class="small muted" style="margin-top:12px">공유 권한은 복사하지 않아요. 작성자와 결제자는 가져오는 계정으로 설정되며 하트·댓글은 초기화돼요.</p>`,'새 여행으로 가져오기',async()=>{const t=await api('/trips',{method:'POST',body:{import:data}});await loadTrips();await openTrip(t.id);toast('여행을 가져왔어요. 동행을 다시 초대할 수 있어요.');});}catch(e){toast(e.message);}};input.click();}
async function createSample(){
  const start=new Date(Date.now()+30*86400000).toISOString().slice(0,10),end=new Date(Date.parse(start)+3*86400000).toISOString().slice(0,10);
  const t=await api('/trips',{method:'POST',body:{name:'느리게 걷는 도쿄 · 샘플',type:'overseas',country:'일본',city:'도쿄',start,end,currency:'JPY',rates:{KRW:1,JPY:9},budget:120000,sample:true,interests:['관광','카페'],note:'사용 방법을 보여주는 샘플입니다. 날짜·예산·환율은 예시이며 실제 예약이 아닙니다.'}});
  state.trip=t;
  for(const p of [{name:'센소지',address:'도쿄 다이토구 아사쿠사 2-3-1',lat:35.7148,lng:139.7967,category:'관광',note:'샘플 · 아침에 가볍게 산책하기',cost:0},{name:'우에노 공원',address:'도쿄 다이토구 우에노코엔',lat:35.7153,lng:139.7731,category:'관광',note:'샘플 · 느긋하게 걷고 싶은 곳',cost:0},{name:'도쿄 스카이트리',address:'도쿄 스미다구 오시아게 1-1-2',lat:35.7101,lng:139.8107,category:'관광',note:'샘플 · 운영시간과 입장료는 직접 확인해주세요',cost:0}])await mutate({action:'upsert',collection:'places',value:{...p,currency:'JPY',source:'샘플 · 위치 참고용'}});
  const [a,b]=state.trip.places;await mutate({action:'upsert',collection:'itinerary',value:{placeId:a.id,date:start,startTime:'09:00',duration:90,currency:'JPY',mode:'walk'}});await mutate({action:'upsert',collection:'itinerary',value:{placeId:b.id,date:start,startTime:'12:00',duration:120,currency:'JPY',mode:'transit'}});
  await mutate({action:'upsert',collection:'tasks',value:{name:'여권 유효기간 확인하기',category:'할 일',assignee:state.user.id}});await loadTrips();await openTrip(t.id);toast('샘플 여행을 만들었어요. 자유롭게 둘러보세요.');
}
function scheduleManyDialog(){
  const ids=[...state.placeSelection],t=state.trip,version=t.version;
  if(!ids.length)return;
  modal('선택한 장소 일정에 추가',`<p class="section-hint">${ids.length}개 장소를 시간 미정으로 추가합니다. 같은 날짜에 이미 있는 장소는 선택에서 제외해주세요.</p>${field('date','추가할 날짜',state.day||t.start,{options:daysBetween(t.start,t.end).map(d=>({value:d,label:d+' ('+weekday(d)+')'}))})}<ol class="selection-preview">${ids.map(id=>'<li>'+esc(t.places.find(p=>p.id===id)?.name||'삭제된 장소')+'</li>').join('')}</ol>`,'일정에 추가',async b=>{await mutate({action:'scheduleMany',placeIds:ids,date:b.date},version);state.placeSelection=[];state.day=b.date;state.tab='itinerary';state.mapFocus='all';render();toast(ids.length+'개 장소를 추가했어요.');});
}
function transferEventDialog(id){
  const t=state.trip,item=t.itinerary.find(i=>i.id===id),version=t.version;if(!item)return;
  modal('일정 복사·이동',`<p class="section-hint">${esc(item.name)} · ${item.date}</p><div class="form-grid">${field('mode','작업','copy',{options:[{value:'copy',label:'다른 날짜에 복사'},{value:'move',label:'다른 날짜로 이동'}]})}${field('date','대상 날짜',daysBetween(t.start,t.end).find(d=>d!==item.date)||item.date,{options:daysBetween(t.start,t.end)})}<label class="form-checkbox span2"><input type="checkbox" name="clearTimes" checked>시간은 비우고 날짜에 맞춰 다시 정하기</label></div><p class="info-note">장소, 체류 시간, 메모와 관련 링크를 함께 가져갑니다. 복사한 일정의 예상 비용도 예산에 반영돼요.</p>`,'적용',async(b,f)=>{await mutate({action:'transferItinerary',itemId:id,date:b.date,mode:b.mode,clearTimes:new FormData(f).has('clearTimes')},version);state.day=b.date;state.mapFocus='all';render();toast(b.mode==='copy'?'일정을 복사했어요.':'일정을 이동했어요.');});
}
function attachmentList(item,kind){
  return (item.attachments||[]).length?'<div class="attachment-list">'+item.attachments.map((file,index)=>act('attachment-open',icon('download')+esc(file.name)+' <span class="small">'+Math.ceil(file.size/1024)+'KB</span>','btn secondary sm',`data-kind="${kind}" data-id="${item.id}" data-index="${index}"`)).join('')+'</div>':'';
}
function attachmentEditor(files){
  return '<section class="attachment-editor"><h3>예약 확인 자료</h3><p class="section-hint">이미지·PDF를 최대 2개, 각각 350KB까지 첨부할 수 있어요. 여행 참여자만 열람할 수 있습니다.</p><label class="field"><span>파일 추가</span><input type="file" id="booking-files" accept="image/png,image/jpeg,image/webp,application/pdf" multiple></label><div id="attachment-drafts">'+attachmentDrafts(files)+'</div><p id="attachment-error" class="form-error" role="alert"></p></section>';
}
function attachmentDrafts(files){return files.map((f,index)=>'<div class="attachment-draft"><span>'+esc(f.name)+' · '+Math.ceil(f.size/1024)+'KB</span><button type="button" class="btn ghost sm" data-remove-attachment="'+index+'">삭제</button></div>').join('');}
function bindAttachmentEditor(get,set){
  const input=$('#booking-files'),holder=$('#attachment-drafts'),error=$('#attachment-error'),form=$('#modal-form');
  holder.onclick=e=>{const button=e.target.closest('[data-remove-attachment]');if(button){set(get().filter((_,i)=>i!==Number(button.dataset.removeAttachment)));holder.innerHTML=attachmentDrafts(get());error.textContent='';}};
  input.onchange=async()=>{const submit=form.querySelector('[type=submit]');submit.disabled=true;input.disabled=true;error.textContent='';try{
    const selected=[...input.files];if(get().length+selected.length>2)throw Error('파일은 최대 2개까지 첨부할 수 있어요.');
    const added=[];for(const f of selected){if(!attachmentTypes.includes(f.type)||f.size>attachmentLimit)throw Error('PNG·JPG·WebP·PDF 파일을 각각 350KB 이하로 선택해주세요.');const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('파일을 읽지 못했어요.'));reader.readAsDataURL(f);});const item={name:f.name,type:f.type,size:f.size,data};attachmentBytes(item);added.push(item);}
    if(form.isConnected&&$('#modal').open){set([...get(),...added]);holder.innerHTML=attachmentDrafts(get());}
  }catch(e){error.textContent=e.message;}finally{input.value='';input.disabled=false;submit.disabled=false;}};
}
function openAttachment(kind,id,index){
  if(!['stays','reservations'].includes(kind))return;const file=state.trip[kind].find(i=>i.id===id)?.attachments?.[index];if(!file)return;
  const bytes=attachmentBytes(file),url=URL.createObjectURL(new Blob([bytes],{type:file.type}));
  modal('예약 확인 자료',`${file.type.startsWith('image/')?'<img class="booking-preview" src="'+esc(file.data)+'" alt="'+esc(file.name)+'">':'<p>PDF 파일을 내려받아 확인하세요.</p>'}<a class="btn primary" href="${url}" download="${esc(file.name)}">${icon('download')}파일 다운로드</a>`,'',null);
  $('#modal').addEventListener('close',()=>URL.revokeObjectURL(url),{once:true});
}
let offlineQueue=Promise.resolve();
async function reconcileOffline(){
  try{const saved=await listOffline();for(const item of saved)if(item.userId!==state.user?.id||!state.trips.some(t=>t.id===item.id))await removeOffline(item.id);state.offlineIds=new Set(saved.filter(item=>item.userId===state.user?.id&&state.trips.some(t=>t.id===item.id)).map(item=>item.id));for(const trip of state.trips)syncOffline(trip);}catch{/* Opt-in saving remains available when storage becomes accessible. */}
}
function syncOffline(trip){
  if(!state.offlineIds.has(trip.id)||state.offlineVersions[trip.id]===trip.version)return;
  const account=state.user.id;state.offlineVersions[trip.id]=trip.version;
  offlineQueue=offlineQueue.catch(()=>{}).then(async()=>{if(state.user?.id===account&&state.offlineIds.has(trip.id))await saveOffline(trip,account);}).catch(()=>{delete state.offlineVersions[trip.id];toast('기기에 저장한 일정을 갱신하지 못했어요. 오프라인 저장을 다시 눌러주세요.');});
}
async function forgetOffline(){state.offlineIds.clear();state.offlineVersions={};await offlineQueue.catch(()=>{});await clearOffline().catch(()=>{});}
function offlineDialog(){
  const trip=state.trip,account=state.user.id,saved=state.offlineIds.has(trip.id);
  modal('이 기기에서 오프라인으로 보기',`<p>인터넷이 없어도 일정과 숙소 주소를 확인할 수 있도록 이 기기에 보관합니다.</p><p class="section-hint">예약번호·첨부 파일·메모·지도·AI 대화는 저장하지 않아요. 로그아웃하면 삭제됩니다. 본인 기기에서만 사용해주세요.</p><div class="btn-row">${external('/offline.html','저장한 일정 열기','btn secondary')}${saved?act('remove-offline','이 여행 저장 해제','btn danger sm',`data-id="${trip.id}"`):''}</div>`,'기기에 저장',async()=>{
    if(!('serviceWorker' in navigator))throw Error('이 브라우저는 오프라인 보기를 지원하지 않아요.');
    const registration=await navigator.serviceWorker.register('/sw.js');
    await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('오프라인 화면 준비가 늦어지고 있어요. 잠시 후 다시 저장해주세요.')),12000))]);
    if(!registration.active)throw Error('오프라인 화면을 준비 중이에요. 잠시 후 다시 저장해주세요.');
    if(state.user?.id!==account||state.trip?.id!==trip.id)throw Error('현재 여행에서 다시 저장해주세요.');
    await saveOffline(state.trip,account);state.offlineIds.add(trip.id);state.offlineVersions[trip.id]=state.trip.version;toast('이 기기에 저장했어요. 연결 중에는 최신 일정으로 갱신됩니다.');
  });
}
async function start(){
  const token=++startToken;clearTimeout(bootTimer);
  if(/(?:access_token|error_description)=/.test(location.hash))history.replaceState(null,'',location.pathname+location.search);
  if(!state.user)bootTimer=setTimeout(()=>{const boot=$('.boot');if(token===startToken&&boot){const hint=document.createElement('div');hint.className='boot-recovery';hint.innerHTML='<p>연결이 평소보다 오래 걸리고 있어요.</p>'+act('reload-page','다시 시도','btn secondary')+external('/offline.html','저장한 일정 보기');boot.append(hint);}},8000);
  try{[state.config,{user:state.user}]=await Promise.all([api('/config'),api('/auth')]);if(token!==startToken)return;configureGoogleMaps(state.config.googleMapsBrowserKey);if(state.user){await loadTrips();const id=new URLSearchParams(location.hash.slice(1)).get('trip');if(id&&state.trips.some(t=>t.id===id))await openTrip(id);else await openCurrentTripOrDashboard();if(inviteValue)joinDialog(inviteValue);}else{await forgetOffline();render();}}
  catch(e){if(token!==startToken)return;$('#app').innerHTML=`<div class="boot">${brand}<p>${esc(e.message)}</p>${act('retry','다시 시도','btn primary')}${external('/offline.html','기기에 저장한 일정 보기')}</div>`;document.querySelector('[data-action=retry]').onclick=start;}
  finally{clearTimeout(bootTimer);}
}
let startToken=0,bootTimer;
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
start();
setInterval(refreshTravelClock,60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshTravelClock();});

window.matchMedia('(max-width: 1000px)').addEventListener('change',()=>{if(state.user&&state.trip&&state.tab==='itinerary'&&!$('#modal').open)render();});

window.matchMedia('(max-width: 760px)').addEventListener('change',()=>{if(state.user&&!$('#modal').open)render();});

document.addEventListener('toggle',event=>{const id=event.target.dataset?.eventDetails;if(id){if(event.target.open)state.expandedEvents.add(id);else state.expandedEvents.delete(id);}},true);
