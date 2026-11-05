const databaseName='between-trips-offline-v1';
export function offlineDates(trip){
  const dates=new Set(trip.itinerary.map(i=>i.date));
  for(let day=Date.parse(trip.start+'T12:00:00Z'),end=Date.parse(trip.end+'T12:00:00Z'),n=0;day<=end&&n<367;day+=86400000,n++)dates.add(new Date(day).toISOString().slice(0,10));
  return [...dates].sort();
}
export function offlineSnapshot(trip,userId,now=new Date()) {
  const location = p => ({id:p.id,name:p.name,address:p.address||'',checkIn:p.checkIn||'',checkOut:p.checkOut||'',checkInTime:p.checkInTime||'',checkOutTime:p.checkOutTime||'',status:p.status||''});
  return {id:trip.id,userId,name:trip.name,city:trip.city,country:trip.country,start:trip.start,end:trip.end,savedAt:now.toISOString(),version:trip.version,stays:trip.stays.map(location),places:trip.places.map(location),itinerary:trip.itinerary.map(i=>({id:i.id,placeId:i.placeId,name:i.name,date:i.date,startTime:i.startTime,endTime:i.endTime,duration:i.duration,category:i.category,mode:i.mode,done:Boolean(i.done)}))};
}
async function openStore(){return new Promise((resolve,reject)=>{const r=indexedDB.open(databaseName,1);r.onupgradeneeded=()=>r.result.createObjectStore('trips',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('이 브라우저에서 오프라인 저장을 사용할 수 없어요.'));});}
async function run(mode,operation){const db=await openStore();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('trips',mode),request=operation(tx.objectStore('trips'));tx.oncomplete=()=>resolve(request?.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('오프라인 저장이 중단됐어요.'));});}finally{db.close();}}
export const listOffline=()=>run('readonly',store=>store.getAll());
export const saveOffline=(trip,userId)=>run('readwrite',store=>store.put(offlineSnapshot(trip,userId)));
export const removeOffline=id=>run('readwrite',store=>store.delete(id));
export const clearOffline=()=>run('readwrite',store=>store.clear());
