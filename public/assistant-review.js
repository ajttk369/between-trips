// Shared review rules; no account data or browser storage access.
export function needsCompletedReview(c,trip){const old=trip?.[c.target]?.find(item=>item.id===c.id);return Boolean(c.requiresCompletedConfirmation||c.before?.done||old?.done||c.target==='places'&&old&&trip.itinerary.some(item=>item.placeId===old.id&&item.done));}
export function defaultChangeIds(proposal,trip){return (proposal?.changes||[]).filter(c=>c.operation!=='remove'&&!needsCompletedReview(c,trip)).map(c=>c.changeId);}
export function initialChangeIds(proposal,trip,cached){
  const defaults=defaultChangeIds(proposal,trip),valid=new Set((proposal?.changes||[]).map(c=>c.changeId));
  return cached?cached.selected.filter(id=>valid.has(id)&&(defaults.includes(id)||cached.policyVersion===2)):defaults;
}
export function reviewSnapshot(item,trip){
  if(!item)return null;
  const place=trip&&[...trip.places,...trip.stays].find(p=>p.id===item.placeId);
  return Object.fromEntries(['name','date','startTime','endTime','duration','cost','currency','category','mode','done','placeId','costKnown'].map(key=>[key,item[key]??null]).concat([['address',place?.address||item.address||'']]));
}
export function reviewResult(change,trip){
  const before=change.before||reviewSnapshot(trip?.[change.target]?.find(item=>item.id===change.id),trip);
  const after=change.after||{...change,cost:change.costKnown?change.cost:(before?.cost??change.cost),currency:change.costKnown?change.currency:(before?.currency||change.currency)};
  return {before,after};
}
export function reviewDifferences(change,trip){
  const {before,after}=reviewResult(change,trip);
  if(!before||change.operation!=='update')return [];
  return [['name','장소'],['date','날짜'],['startTime','시작'],['endTime','종료'],['duration','머무는 시간'],['mode','이동 수단'],['address','주소'],['cost','예상 비용'],['currency','통화']].filter(([key])=>String(before[key]??'')!==String(after[key]??'')).map(([key,label])=>({key,label,before:before[key],after:after[key]}));
}
