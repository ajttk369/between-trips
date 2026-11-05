export const travelPhotos = [
  {src:'/images/travel/tokyo-evening.jpg',alt:'노을 진 하늘과 불이 켜진 도쿄타워',label:'도쿄의 저녁',position:'28% 50%'},
  {src:'/images/travel/fuji-sunset.jpg',alt:'벚꽃과 붉은 오층탑 너머로 보이는 후지산',label:'벚꽃 너머 후지산',position:'58% 50%'},
  {src:'/images/travel/japan-street.jpg',alt:'산을 배경으로 전통 가옥이 늘어선 일본의 조용한 골목',label:'천천히 걷는 골목',position:'50% 55%'},
  {src:'/images/travel/kyoto-pagoda.jpg',alt:'따뜻한 햇빛이 비치는 교토의 오층탑과 돌계단',label:'교토의 오후',position:'42% 50%'}
];
const choice={index:0,paused:false};
const glyph=path=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="${path}"/></svg>`;
const pauseIcon=glyph('M9 5v14M15 5v14'),playIcon=glyph('m9 5 10 7-10 7V5Z');
export function galleryMarkup(kind='intro') {
  const photo=travelPhotos[choice.index];
  return `<section class="travel-gallery gallery-${kind}" data-travel-gallery role="region" aria-roledescription="슬라이드 쇼" aria-label="여행 사진"><img class="gallery-photo" src="${photo.src}" alt="${photo.alt}" style="object-position:${photo.position}" decoding="async"><div class="gallery-shade"></div><div class="gallery-caption"><span class="gallery-photo-label">${photo.label}</span><div class="gallery-controls"><button type="button" data-gallery-action="previous" aria-label="이전 사진">${glyph('m15 6-6 6 6 6')}</button><span class="gallery-count" aria-hidden="true">${choice.index+1} / ${travelPhotos.length}</span><button type="button" data-gallery-action="next" aria-label="다음 사진">${glyph('m9 6 6 6-6 6')}</button><button type="button" data-gallery-action="pause" aria-label="사진 자동 넘김 멈추기" aria-pressed="${choice.paused}">${choice.paused?playIcon:pauseIcon}</button></div></div><div class="gallery-dots" role="group" aria-label="사진 선택">${travelPhotos.map((p,i)=>`<button type="button" data-gallery-index="${i}" aria-label="${i+1}번째 사진: ${p.label}" aria-pressed="${i===choice.index}"><span></span></button>`).join('')}</div><span class="sr-only gallery-announcement" aria-live="polite"></span></section>`;
}
export function mountGallery(root,{motion=window.matchMedia('(prefers-reduced-motion: reduce)'),createImage=()=>new Image(),setTimer=setTimeout,clearTimer=clearTimeout,visibility=document}={}) {
  let timer=null,disposed=false,busy=false,hovered=false,touch=null,generation=0;
  const photo=root.querySelector('.gallery-photo'),label=root.querySelector('.gallery-photo-label'),count=root.querySelector('.gallery-count'),announcement=root.querySelector('.gallery-announcement'),pause=root.querySelector('[data-gallery-action="pause"]'),dots=[...root.querySelectorAll('[data-gallery-index]')],failed=new Set();
  function schedule(){clearTimer(timer);timer=null;if(!disposed&&!busy&&!choice.paused&&!motion.matches&&!visibility.hidden&&!hovered&&!root.matches(':focus-within')&&failed.size<travelPhotos.length)timer=setTimer(()=>{const next=Array.from({length:travelPhotos.length},(_,i)=>(choice.index+i+1)%travelPhotos.length).find(i=>!failed.has(i));if(next!==undefined)show(next,false);},6500);}
  function updateControls(){pause.innerHTML=choice.paused?playIcon:pauseIcon;pause.disabled=motion.matches;pause.setAttribute('aria-pressed',String(choice.paused));pause.setAttribute('aria-label',motion.matches?'모션 줄이기 설정에 따라 자동 넘김 중지':choice.paused?'사진 자동 넘김 시작하기':'사진 자동 넘김 멈추기');}
  async function show(index,manual=true){
    if(disposed)return;const next=(index+travelPhotos.length)%travelPhotos.length,id=++generation,target=travelPhotos[next];busy=true;clearTimer(timer);
    try{
      const image=createImage();image.src=target.src;await image.decode();if(disposed||id!==generation)return;
      failed.delete(next);choice.index=next;photo.src=target.src;photo.alt=target.alt;photo.style.objectPosition=target.position;label.textContent=target.label;count.textContent=`${next+1} / ${travelPhotos.length}`;
      dots.forEach((dot,i)=>dot.setAttribute('aria-pressed',String(i===next)));
      if(manual)announcement.textContent=`${next+1}번째 사진, ${target.label}`;
      if(!motion.matches)photo.animate?.([{opacity:.5},{opacity:1}],{duration:400,easing:'ease-out'});
    }catch{if(!disposed&&id===generation){failed.add(next);announcement.textContent='사진을 불러오지 못했어요. 다른 사진을 선택해주세요.';}}
    finally{if(!disposed&&id===generation){busy=false;schedule();}}
  }
  const onClick=e=>{const button=e.target.closest('button');if(!button||!root.contains(button))return;if(button.dataset.galleryIndex!==undefined){show(Number(button.dataset.galleryIndex));return;}const action=button.dataset.galleryAction;if(action==='pause'){choice.paused=!choice.paused;updateControls();schedule();}else if(action==='next'||action==='previous')show(choice.index+(action==='next'?1:-1));};
  const enter=e=>{if(e.pointerType==='mouse'){hovered=true;schedule();}},leave=()=>{hovered=false;schedule();};
  const focus=()=>schedule(),blur=e=>{if(!root.contains(e.relatedTarget))setTimer(schedule,0);};
  const down=e=>{if(e.pointerType==='touch'&&!e.target.closest('button'))touch={x:e.clientX,y:e.clientY};};
  const up=e=>{if(!touch)return;const dx=e.clientX-touch.x,dy=e.clientY-touch.y;touch=null;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5)show(choice.index+(dx<0?1:-1));};
  const cancel=()=>{touch=null;};
  const listeners=[['click',onClick],['pointerenter',enter],['pointerleave',leave],['focusin',focus],['focusout',blur],['pointerdown',down],['pointerup',up],['pointercancel',cancel]];
  const motionChanged=()=>{updateControls();schedule();};
  listeners.forEach(([event,handler])=>root.addEventListener(event,handler));visibility.addEventListener('visibilitychange',schedule);motion.addEventListener('change',motionChanged);updateControls();schedule();
  return ()=>{disposed=true;generation++;clearTimer(timer);listeners.forEach(([event,handler])=>root.removeEventListener(event,handler));visibility.removeEventListener('visibilitychange',schedule);motion.removeEventListener('change',motionChanged);};
}
export function initTravelGalleries(container=document){const disposers=[...container.querySelectorAll('[data-travel-gallery]')].map(root=>mountGallery(root));return ()=>disposers.forEach(dispose=>dispose());}
