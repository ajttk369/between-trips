// Personal, unsubmitted UI choices only. Shared trip data remains in the database.
const prefix='travel-review-v1:';
const keyFor=(user,trip,proposal)=>prefix+[user,trip,proposal].map(encodeURIComponent).join(':');
const validPoint=p=>typeof p.lat==='number'&&Number.isFinite(p.lat)&&Math.abs(p.lat)<=90&&typeof p.lng==='number'&&Number.isFinite(p.lng)&&Math.abs(p.lng)<=180;
function cleanReview(proposal,value){
  if(!value||value.proposalId!==proposal.id||!Array.isArray(value.selected)||value.selected.length>20)return null;
  const ids=new Set(proposal.changes.map(c=>c.changeId));
  const selected=[...new Set(value.selected.filter(id=>ids.has(id)))],locations={};
  for(const [id,p]of Object.entries(value.locations||{}).slice(0,20)){
    if(!ids.has(id)||!p||typeof p!=='object')continue;
    const address=String(p.address||'').slice(0,1000);
    if(typeof p.googlePlaceId==='string'&&/^[A-Za-z0-9_-]{1,255}$/.test(p.googlePlaceId))locations[id]={googlePlaceId:p.googlePlaceId,address,lat:null,lng:null};
    else if(validPoint(p))locations[id]={lat:p.lat,lng:p.lng,address};
  }
  return {proposalId:proposal.id,selected,locations,scopeDate:String(value.scopeDate||'').slice(0,10),expanded:Boolean(value.expanded),savedAt:value.savedAt};
}
export function readReview(storage,user,trip,proposal,now=Date.now()){
  const key=keyFor(user,trip,proposal.id),raw=storage.getItem(key);if(!raw)return null;
  try{if(raw.length>30000)throw Error('oversized');const value=JSON.parse(raw);if(!Number.isFinite(value.savedAt)||now-value.savedAt>7*86400000||value.savedAt>now+60000){storage.removeItem(key);return null;}return cleanReview(proposal,value);}catch{storage.removeItem(key);return null;}
}
export function writeReview(storage,user,trip,proposal,value,now=Date.now()){
  const cleaned=cleanReview(proposal,{...value,proposalId:proposal.id,savedAt:now});if(!cleaned)throw Error('검토 상태를 저장하지 못했어요.');
  storage.setItem(keyFor(user,trip,proposal.id),JSON.stringify(cleaned));
}
export function removeReview(storage,user,trip,proposalId){storage.removeItem(keyFor(user,trip,proposalId));}
