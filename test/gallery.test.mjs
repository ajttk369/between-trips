import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
let generation=0;
function eventTarget(){const listeners=new Map();return {listeners,addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:(type,fn)=>{if(listeners.get(type)===fn)listeners.delete(type);},emit(type,event={}){listeners.get(type)?.(event);}};}
async function fixture({reduced=false,decode=async()=>{}}={}){
  const module=await import('../public/travel-gallery.js?test='+generation++),timers=new Map();let serial=0;
  const element=dataset=>({dataset,attrs:{},style:{},setAttribute(key,value){this.attrs[key]=value;},closest(){return this;},animate(){}});
  const photo=element({}),label=element({}),count=element({}),announcement=element({}),pause=element({galleryAction:'pause'}),next=element({galleryAction:'next'}),previous=element({galleryAction:'previous'}),dots=module.travelPhotos.map((_,i)=>element({galleryIndex:String(i)}));
  const controls=[pause,next,previous,...dots],root={...eventTarget(),focused:false,matches(){return this.focused;},contains:el=>controls.includes(el),querySelector:selector=>({'.gallery-photo':photo,'.gallery-photo-label':label,'.gallery-count':count,'.gallery-announcement':announcement,'[data-gallery-action="pause"]':pause}[selector]),querySelectorAll:()=>dots};
  const motion={...eventTarget(),matches:reduced},visibility={...eventTarget(),hidden:false};
  const dispose=module.mountGallery(root,{motion,visibility,createImage:()=>({decode}),setTimer:(fn,ms)=>{const id=++serial;timers.set(id,{fn,ms});return id;},clearTimer:id=>timers.delete(id)});
  const flush=async()=>{await new Promise(resolve=>setImmediate(resolve));};
  const click=async button=>{root.emit('click',{target:button});await flush();};
  const tick=async()=>{const [id,timer]=[...timers].find(([,t])=>t.ms===6500)||[];assert.ok(timer,'auto timer missing');timers.delete(id);timer.fn();await flush();};
  return {...module,root,motion,visibility,photo,label,count,announcement,pause,next,previous,dots,timers,dispose,click,tick,flush};
}
test('사진 4장은 로컬 배포 자산이고 모든 선택 버튼에 설명이 있다',async()=>{
  const f=await fixture();assert.equal(f.travelPhotos.length,4);for(const p of f.travelPhotos)assert.ok(existsSync(new URL('../public'+p.src,import.meta.url)));
  const html=f.galleryMarkup();assert.equal((html.match(/data-gallery-index=/g)||[]).length,4);assert.ok(html.includes('사진 자동 넘김'));f.dispose();
});
test('자동 넘김·이전·다음·직접 선택은 사진과 접근성 상태를 함께 갱신한다',async()=>{
  const f=await fixture();await f.tick();assert.equal(f.photo.src,f.travelPhotos[1].src);assert.equal(f.dots[1].attrs['aria-pressed'],'true');assert.equal(f.announcement.textContent,undefined);
  await f.click(f.previous);assert.equal(f.photo.src,f.travelPhotos[0].src);assert.ok(f.announcement.textContent.includes('1번째'));
  await f.click(f.dots[3]);assert.equal(f.photo.alt,f.travelPhotos[3].alt);await f.click(f.next);assert.equal(f.photo.src,f.travelPhotos[0].src);f.dispose();
});
test('정지 버튼은 자동 전환을 멈추고 수동 이동은 계속 허용한다',async()=>{
  const f=await fixture();await f.click(f.pause);assert.equal(f.pause.attrs['aria-pressed'],'true');assert.equal(f.timers.size,0);
  await f.click(f.next);assert.equal(f.photo.src,f.travelPhotos[1].src);assert.equal(f.timers.size,0);await f.click(f.pause);assert.equal(f.timers.size,1);f.dispose();
});
test('호버·키보드 초점·백그라운드·모션 줄이기는 자동 재생을 막는다',async()=>{
  const f=await fixture();f.root.emit('pointerenter',{pointerType:'mouse'});assert.equal(f.timers.size,0);f.root.emit('pointerleave');assert.equal(f.timers.size,1);
  f.root.focused=true;f.root.emit('focusin');assert.equal(f.timers.size,0);f.root.focused=false;
  f.visibility.hidden=true;f.visibility.emit('visibilitychange');assert.equal(f.timers.size,0);f.visibility.hidden=false;f.visibility.emit('visibilitychange');assert.equal(f.timers.size,1);
  f.motion.matches=true;f.motion.emit('change');assert.equal(f.pause.disabled,true);assert.equal(f.timers.size,0);f.dispose();
});
test('화면을 떠난 뒤 늦게 로드된 사진은 DOM을 바꾸지 않고 타이머·이벤트를 정리한다',async()=>{
  let resolve;const f=await fixture({decode:()=>new Promise(r=>resolve=r)});f.root.emit('click',{target:f.next});f.dispose();resolve();await f.flush();assert.equal(f.photo.src,undefined);assert.equal(f.timers.size,0);assert.equal(f.root.listeners.size,0);assert.equal(f.visibility.listeners.size,0);assert.equal(f.motion.listeners.size,0);
});
test('가로 터치는 사진을 넘기고 세로 스크롤은 그대로 둔다',async()=>{
  const f=await fixture(),surface={closest:()=>null};f.root.emit('pointerdown',{pointerType:'touch',clientX:200,clientY:80,target:surface});f.root.emit('pointerup',{clientX:100,clientY:85});await f.flush();assert.equal(f.photo.src,f.travelPhotos[1].src);
  f.root.emit('pointerdown',{pointerType:'touch',clientX:200,clientY:80,target:surface});f.root.emit('pointerup',{clientX:190,clientY:200});await f.flush();assert.equal(f.photo.src,f.travelPhotos[1].src);f.dispose();
});
test('실패한 사진은 자동 전환에서 건너뛰고 다른 사진을 보여준다',async()=>{
  let calls=0;const f=await fixture({decode:async()=>{if(!calls++)throw Error('image failed');}});await f.tick();assert.ok(f.announcement.textContent.includes('불러오지 못'));await f.tick();assert.equal(f.photo.src,f.travelPhotos[2].src);f.dispose();
});
