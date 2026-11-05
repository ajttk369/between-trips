import {listOffline,clearOffline,removeOffline,offlineDates} from './offline-store.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const target=document.getElementById('offline-content');
async function show(){
  try{
    let trips=await listOffline();
    if(navigator.onLine){
      try{
        const auth=await fetch('/api/auth',{cache:'no-store',signal:AbortSignal.timeout(7000)});
        if(auth.status===401||auth.status===403){await clearOffline();trips=[];}
        else if(auth.ok){const{user}=await auth.json();if(!user){await clearOffline();trips=[];}else{
          const others=trips.filter(trip=>trip.userId!==user.id);trips=trips.filter(trip=>trip.userId===user.id);
          for(const trip of others)await removeOffline(trip.id);
          for(const trip of [...trips]){const response=await fetch('/api/trips/'+encodeURIComponent(trip.id),{cache:'no-store',signal:AbortSignal.timeout(7000)});if([401,403,404].includes(response.status)){trips=trips.filter(item=>item.id!==trip.id);await removeOffline(trip.id);}}
        }}
      }catch{/* Offline snapshots remain readable when the network is unavailable. */}
    }
    target.innerHTML=trips.length?trips.map(trip=>{
      const dates=offlineDates(trip);
      return '<article><h2>'+esc(trip.name)+'</h2><p>'+esc(trip.country+' · '+trip.city)+'</p><time>마지막 저장 '+esc(new Date(trip.savedAt).toLocaleString('ko-KR'))+'</time>'+dates.map(date=>'<section class="day"><h3>'+esc(date)+'</h3>'+trip.stays.filter(s=>s.status==='예약 완료'&&s.checkIn<=date&&s.checkOut>=date).map(s=>'<p><strong>숙소 · '+esc(s.name)+'</strong>'+esc(s.address)+'<br>체크인 '+esc(s.checkIn+' '+s.checkInTime)+' / 체크아웃 '+esc(s.checkOut+' '+s.checkOutTime)+'</p>').join('')+'<ol>'+trip.itinerary.filter(i=>i.date===date).map(i=>{const p=[...trip.places,...trip.stays].find(p=>p.id===i.placeId);return '<li><strong>'+esc((i.startTime||'시간 미정')+(i.endTime?'–'+i.endTime:'')+' · '+i.name)+'</strong><span>'+esc(p?.address||'')+'</span></li>';}).join('')+'</ol>'+(trip.itinerary.some(i=>i.date===date)?'':'<p class="muted">등록된 일정 없음</p>')+'</section>').join('')+'</article>';
    }).join(''):'<p>이 기기에 저장한 일정이 없습니다. 인터넷에 연결한 뒤 여행에서 ‘오프라인 저장’을 눌러주세요.</p>';
  }catch(error){target.textContent=error.message;}
}
document.getElementById('remove-all').onclick=async()=>{try{await clearOffline();await show();}catch(error){target.textContent=error.message;}};
window.addEventListener('online',show);
show();
