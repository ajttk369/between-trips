export function daysBetween(start, end) {
  const result = []; if (!start || !end) return result;
  const finish = Date.parse(`${end}T00:00:00Z`);
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= finish && result.length < 367; t += 86400000) result.push(new Date(t).toISOString().slice(0, 10));
  return result;
}
export const hasCoords = p => p && p.lat != null && p.lng != null && p.lat !== '' && p.lng !== '' && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng));
export function distance(a, b) {
  if (!hasCoords(a) || !hasCoords(b)) return null;
  const rad = x => x * Math.PI / 180, dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function converted(value, code, rates = {}) {
  if (!Number(value)) return 0;
  if (code === 'KRW') return Number(value);
  return Number(rates[code]) > 0 ? Number(value) * Number(rates[code]) : null;
}
export function budgetOf(trip) {
  const estimates = [
    ...trip.stays.filter(x => x.status === '예약 완료').map(x => ({ ...x, category: '숙소', amount: x.cost, date: x.checkIn, kind: 'stays' })),
    ...trip.reservations.map(x => ({ ...x, category: '이동', amount: x.cost, kind: 'reservations' })),
    ...trip.itinerary.filter(x => x.category !== '숙소').map(x => ({ ...x, amount: x.cost, kind: 'itinerary' }))
  ];
  const linked = new Set(trip.expenses.map(x => x.sourceId).filter(Boolean));
  const actual = [...estimates.filter(x => x.paid && !linked.has(x.id)), ...trip.expenses];
  const missing = new Set(), sum = items => items.reduce((total, item) => { const n = converted(item.amount, item.currency, trip.rates); if (n == null) missing.add(item.currency); return total + (n || 0); }, 0);
  const planned = sum(estimates), spent = sum(actual), categories = {}, byDate = {};
  for (const item of actual) { const n = converted(item.amount, item.currency, trip.rates); if (n != null) { categories[item.category || '기타'] = (categories[item.category || '기타'] || 0) + n; byDate[item.date] = (byDate[item.date] || 0) + n; } }
  let settlement = 0;
  const owner = trip.owner, partner = trip.members.find(m => m.id !== owner);
  const invalidPayers = [];
  for (const item of actual) {
    const n = converted(item.amount, item.currency, trip.rates);
    if (n == null) continue;
    if (item.payer === owner) settlement += n * Number(item.share ?? 50) / 100;
    else if (partner && item.payer === partner.id) settlement -= n * Number(item.share ?? 50) / 100;
    else invalidPayers.push(item);
  }
  const limit = converted(trip.budget, trip.currency, trip.rates);
  if (limit == null) missing.add(trip.currency);
  return { estimates, actual, planned, spent, categories, byDate, settlement, partner, missing: [...missing], invalidPayers, limit };
}
export function itineraryWarnings(items, trip, routeSeconds = {}) {
  const mins = s => Number(s?.split(':')[0] || 0) * 60 + Number(s?.split(':')[1] || 0), warnings = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i], next = items[i + 1];
    const end = item.endTime ? mins(item.endTime) : item.startTime ? mins(item.startTime) + Number(item.duration || 0) : null;
    if (next?.startTime && end != null && item.startTime) {
      const seconds = routeSeconds[`${item.id}:${next.id}:${next.mode}`];
      if (end + Number(seconds || 0) / 60 > mins(next.startTime)) warnings.push(`${item.name} → ${next.name}: ${seconds ? '이동 시간을 포함하면 다음 일정에 늦을 수 있어요.' : '일정 시간이 겹쳐요.'}`);
    }
    const stay = trip.stays.find(s => s.id === item.placeId);
    if (stay && item.startTime) {
      if (item.note === '숙소 도착' && item.date === stay.checkIn && stay.checkInTime && item.startTime < stay.checkInTime) warnings.push(`${stay.name}: 체크인 시간 전 도착이에요.`);
      if (item.note === '숙소 출발' && item.date === stay.checkOut && stay.checkOutTime && item.startTime > stay.checkOutTime) warnings.push(`${stay.name}: 체크아웃 시간 이후 출발이에요.`);
    }
  }
  return warnings;
}
export function recommendations(trip, day) {
  const scheduled = new Set(trip.itinerary.map(x => x.placeId));
  const stay = trip.stays.find(s => s.status === '예약 완료' && s.checkIn <= day && s.checkOut >= day);
  let remaining = trip.places.filter(p => !scheduled.has(p.id));
  const ranked = [], slots = Math.min(5, remaining.length); let previous = stay;
  for (let i = 0; i < slots; i++) {
    const scored = remaining.map(p => {
      const reasons = [], both = trip.members.length === 2 && trip.members.every(m => p.likes.includes(m.id));
      let score = p.likes.length * 20;
      if (both) { score += 40; reasons.push('두 사람 모두 가고 싶어해요'); }
      if (trip.interests.includes(p.category)) { score += 20; reasons.push('여행 관심사와 맞아요'); }
      const d = distance(previous, p); if (d != null) { score += Math.max(0, 15 - d / 1000); reasons.push(`${ranked.length ? '이전 추천 장소' : '숙소'}에서 직선 ${(d / 1000).toFixed(1)}km`); }
      const cost = converted(p.cost, p.currency, trip.rates), limit = converted(trip.budget, trip.currency, trip.rates);
      if (cost != null && limit > 0 && cost > limit / Math.max(1, daysBetween(trip.start, trip.end).length)) score -= 30;
      if (!reasons.length) reasons.push('아직 일정에 넣지 않은 저장 장소예요');
      return { ...p, reasons, score };
    }).sort((a, b) => b.score - a.score);
    const chosen = scored[0]; ranked.push(chosen); previous = chosen; remaining = remaining.filter(p => p.id !== chosen.id);
  }
  return ranked;
}
