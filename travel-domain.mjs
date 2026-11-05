import { randomUUID } from 'node:crypto';
const uid = () => randomUUID();
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const text = (value, max = 3000) => String(value ?? '').trim().slice(0, max);
const required = (value, label, max = 200) => { const v = text(value, max); if (!v) fail(400, `${label}을(를) 입력해주세요.`); return v; };
const collections = ['places', 'itinerary', 'stays', 'reservations', 'tasks', 'expenses'];
const categories = ['관광', '식사', '카페', '쇼핑', '숙소', '이동', '기타'];
const currencies = ['KRW', 'JPY', 'USD', 'EUR', 'GBP', 'CNY', 'TWD', 'THB', 'VND', 'AUD', 'SGD'];
const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const date = (v, label, optional = false) => { if (optional && !v) return ''; if (!isDate(v)) fail(400, `${label}을(를) 올바르게 입력해주세요.`); return v; };
const time = v => { if (!v) return ''; if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) fail(400, '시간을 확인해주세요.'); return v; };
const number = (v, min = 0, max = 1e12) => { const n = Number(v || 0); if (!Number.isFinite(n) || n < min || n > max) fail(400, '숫자 범위를 확인해주세요.'); return n; };
const link = v => { if (!v) return ''; try { const u = new URL(v); if (['https:', 'http:'].includes(u.protocol)) return u.href.slice(0, 3000); } catch {} fail(400, 'http 또는 https 링크를 입력해주세요.'); };
const currency = v => currencies.includes(v) ? v : 'KRW';

export function validateMeta(input) {
  const start = date(input.start, '출발일'), end = date(input.end, '종료일');
  if (end < start || (Date.parse(end) - Date.parse(start)) / 86400000 > 366) fail(400, '여행 기간은 출발일 이후부터 최대 367일까지 설정해주세요.');
  const rates = { KRW: 1 };
  for (const [key, value] of Object.entries(input.rates || {})) if (currencies.includes(key) && key !== 'KRW') rates[key] = number(value, .000001, 1e9);
  let timeZone=input.timeZone||(['일본','Japan','JP'].includes(input.country)?'Asia/Tokyo':['대한민국','한국','South Korea','KR'].includes(input.country)||input.type==='domestic'?'Asia/Seoul':'UTC');
  try{new Intl.DateTimeFormat('ko-KR',{timeZone}).format();}catch{fail(400,'여행 시간대를 확인해주세요.');}
  return { timeZone, name: required(input.name, '여행 이름', 100), type: input.type === 'domestic' ? 'domestic' : 'overseas', country: required(input.country, '국가', 80), city: required(input.city, '도시', 100), start, end, companion: text(input.companion, 100), image: link(input.image), note: text(input.note), currency: input.type === 'domestic' ? 'KRW' : currency(input.currency), rates, interests: Array.isArray(input.interests) ? input.interests.filter(x => categories.includes(x)) : [], budget: number(input.budget), sample: Boolean(input.sample) };
}

export function cleanItem(kind, input, doc, actor, old) {
  const item = { id: old?.id || uid(), createdBy: old?.createdBy || actor, createdAt: old?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
  if (kind === 'places' || kind === 'stays') {
    Object.assign(item, { name: required(input.name, '장소 이름'), address: text(input.address, 1000), category: kind === 'stays' ? '숙소' : (categories.includes(input.category) ? input.category : '관광'), link: link(input.link), photo: link(input.photo), note: text(input.note), cost: number(input.cost), currency: currency(input.currency), source: text(input.source, 300) || '직접 등록', costKnown: input.costKnown!==undefined?Boolean(input.costKnown):(old?.costKnown??true), hoursVerified: old?.hoursVerified??false });
    const hasLat = input.lat !== '' && input.lat != null, hasLng = input.lng !== '' && input.lng != null;
    if (hasLat !== hasLng) fail(400, '위도와 경도를 함께 입력해주세요.');
    item.lat = hasLat ? number(input.lat, -90, 90) : null;
    item.lng = hasLng ? number(input.lng, -180, 180) : null;
    if (kind === 'places') { item.likes = old?.likes || []; item.comments = old?.comments || []; }
    else {
      Object.assign(item, { checkIn: date(input.checkIn, '체크인 날짜'), checkOut: date(input.checkOut, '체크아웃 날짜'), checkInTime: time(input.checkInTime), checkOutTime: time(input.checkOutTime), bookingNumber: text(input.bookingNumber, 200), status: ['후보', '예약 완료', '취소'].includes(input.status) ? input.status : '후보', paid: Boolean(input.paid), payer: text(input.payer, 100) || actor, share: number(input.share ?? 50, 0, 100) });
      if (item.checkOut < item.checkIn) fail(400, '체크아웃 날짜를 확인해주세요.');
    }
  } else if (kind === 'itinerary') {
    const place = [...doc.places, ...doc.stays].find(x => x.id === input.placeId);
    Object.assign(item, { placeId: place?.id || '', name: place?.name || required(input.name, '일정 이름'), date: date(input.date, '일정 날짜'), startTime: time(input.startTime), endTime: time(input.endTime), duration: number(input.duration, 0, 1440), cost: number(input.cost), currency: currency(input.currency), category: place?.category || (categories.includes(input.category) ? input.category : '기타'), note: text(input.note), link: link(input.link), mode: ['walk', 'drive', 'transit'].includes(input.mode) ? input.mode : 'walk' });
    if (item.startTime && item.endTime && item.endTime < item.startTime) fail(400, '종료 시간은 시작 시간 이후여야 합니다.');
  } else if (kind === 'reservations') {
    Object.assign(item, { name: required(input.name, '예약 이름'), category: text(input.category, 100), date: date(input.date, '예약 날짜'), startTime: time(input.startTime), endTime: time(input.endTime), bookingNumber: text(input.bookingNumber, 200), address: text(input.address, 1000), link: link(input.link), note: text(input.note), cost: number(input.cost), currency: currency(input.currency), paid: Boolean(input.paid), payer: text(input.payer, 100) || actor, share: number(input.share ?? 50, 0, 100) });
    if (item.startTime && item.endTime && item.endTime < item.startTime) fail(400, '종료 시간은 시작 시간 이후여야 합니다.');
  } else if (kind === 'tasks') {
    Object.assign(item, { name: required(input.name, '할 일'), category: input.category === '준비물' ? '준비물' : '할 일', assignee: text(input.assignee, 100), done: Boolean(input.done), note: text(input.note) });
  } else if (kind === 'expenses') {
    const source = text(input.sourceId, 100);
    if (source && ![...doc.itinerary, ...doc.stays, ...doc.reservations].some(x => x.id === source)) fail(400, '연결된 비용 항목이 없습니다.');
    if (source && doc.expenses.some(x => x.sourceId === source && x.id !== old?.id)) fail(409, '이미 실제 지출이 연결되어 있습니다.');
    Object.assign(item, { name: required(input.name, '지출 이름'), date: date(input.date, '지출 날짜'), category: categories.includes(input.category) ? input.category : '기타', amount: number(input.amount), currency: currency(input.currency), payer: text(input.payer, 100) || actor, share: number(input.share ?? 50, 0, 100), note: text(input.note), sourceId: source });
  }
  return item;
}


export function applyMutation(doc, body, user) {
      const before=body.collection?doc[body.collection]?.find(x=>x.id===(body.itemId||body.value?.id)):null;
      let activityName=before?.name||body.value?.name||'';
      if (body.action === 'meta') Object.assign(doc, validateMeta(body.value));
      else if (body.action === 'upsert') {
        const kind = body.collection; if (!collections.includes(kind)) fail(400, '잘못된 항목입니다.');
        const old = doc[kind].find(x => x.id === body.value?.id);
        if (body.value?.id && !old) fail(404, '항목이 삭제되었습니다.');
        if (doc[kind].length >= 1000 && !old) fail(400, '항목은 최대 1,000개까지 저장할 수 있습니다.');
        const item = cleanItem(kind, body.value || {}, doc, user.id, old);
        activityName=item.name;
        if (kind === 'places' && doc.places.some(x => x.id !== item.id && x.name.toLowerCase() === item.name.toLowerCase() && x.address === item.address)) fail(409, '이미 저장한 장소입니다. 기존 장소를 확인해주세요.');
        if (old) doc[kind][doc[kind].indexOf(old)] = item;
        else if (kind === 'itinerary') {
          const before = doc.itinerary.findIndex(x => x.date === item.date && ((item.startTime && x.startTime && item.startTime < x.startTime) || x.note === '숙소 도착'));
          if (before >= 0) doc.itinerary.splice(before, 0, item); else doc.itinerary.push(item);
        } else doc[kind].push(item);
        if (kind === 'places' || kind === 'stays') for (const event of doc.itinerary) if (event.placeId === item.id) { event.name = item.name; event.category = item.category; }
      } else if (body.action === 'delete') {
        if (!collections.includes(body.collection)) fail(400, '잘못된 항목입니다.');
        if (!before) fail(404,'이미 삭제된 항목입니다.');
        const removePlaces=new Set();
        if (body.collection==='itinerary'&&body.deletePlace&&before.placeId&&doc.places.some(x=>x.id===before.placeId))removePlaces.add(before.placeId);
        if (body.collection==='places')removePlaces.add(before.id);
        if(body.collection==='places'&&body.deleteLinked)doc.itinerary=doc.itinerary.filter(x=>x.placeId!==before.id);
        doc.places=doc.places.filter(x=>!removePlaces.has(x.id));
        for(const item of doc.itinerary)if(removePlaces.has(item.placeId)||(body.collection==='stays'&&item.placeId===before.id))item.placeId='';
        doc[body.collection]=doc[body.collection].filter(x=>x.id!==body.itemId);

      } else if (body.action === 'like' || body.action === 'comment') {
        const p = doc.places.find(x => x.id === body.itemId); if (!p) fail(404, '장소를 찾을 수 없습니다.');
        if (body.action === 'like') p.likes = p.likes.includes(user.id) ? p.likes.filter(x => x !== user.id) : [...p.likes, user.id];
        else { if (p.comments.length >= 500) fail(400, '댓글 수가 너무 많습니다.'); p.comments.push({ id: uid(), author: user.id, text: required(body.value, '댓글', 1000), at: new Date().toISOString() }); }
      } else if (body.action === 'reorder') {
        const ids = body.ids;
        if (!Array.isArray(ids) || ids.length !== doc.itinerary.length || new Set(ids).size !== ids.length || ids.some(v => !doc.itinerary.some(x => x.id === v))) fail(400, '일정 순서가 올바르지 않습니다.');
        doc.itinerary = ids.map(v => doc.itinerary.find(x => x.id === v));
      } else if (body.action === 'stayDay') {
        const stay = doc.stays.find(x => x.id === body.stayId);
        if (!stay || stay.status === '취소') fail(400, '숙소를 확인해주세요.');
        const day = date(body.date, '날짜');
        if (day < stay.checkIn || day > stay.checkOut) fail(400, '숙박 기간에 포함된 날짜를 선택해주세요.');
        const first = cleanItem('itinerary', { name: stay.name, placeId: stay.id, date: day, category: '숙소', note: '숙소 출발', currency: doc.currency }, doc, user.id);
        const last = cleanItem('itinerary', { name: stay.name, placeId: stay.id, date: day, category: '숙소', note: '숙소 도착', currency: doc.currency }, doc, user.id);
        if (doc.itinerary.some(x => x.date === day && x.placeId === stay.id && ['숙소 출발', '숙소 도착'].includes(x.note))) fail(409, '이 날짜에 이미 숙소 동선이 적용되어 있습니다.');
        const same = doc.itinerary.filter(x => x.date === day); doc.itinerary = [...doc.itinerary.filter(x => x.date !== day), first, ...same, last];
      } else fail(400, '지원하지 않는 변경입니다.');
  const labels={places:'장소',itinerary:'일정',stays:'숙소',reservations:'예약',tasks:'할 일',expenses:'지출'};
  const action=body.action==='delete'?'삭제':body.action==='upsert'?(before?'수정':'추가'):body.action==='reorder'?'순서 변경':body.action==='like'?'가고 싶어요 변경':body.action==='comment'?'댓글 추가':body.action==='meta'?'여행 정보 수정':'숙소 동선 추가';
  if(!activityName)activityName=body.action==='meta'?doc.name:body.itemId?doc.places.find(x=>x.id===body.itemId)?.name||'':'';
  doc.activity=[...(Array.isArray(doc.activity)?doc.activity:[]).slice(-29),{id:uid(),actor:user.id,name:text(user.name,40)||'동행',action,collection:body.collection||'',title:text(activityName,200)||labels[body.collection]||'여행',at:new Date().toISOString()}];
  return doc;
}

export function createDocument(body, user) {
 const imported=body.import,input=imported||body;
  const doc = { ...validateMeta(input), ...Object.fromEntries(collections.map(k => [k, []])) };
      if (imported) {
        if (imported.schemaVersion !== 1) fail(400, '지원하지 않는 여행 파일입니다.');
        const ids = new Map();
        for (const kind of collections) {
          const list = imported[kind] || []; if (!Array.isArray(list) || list.length > 1000) fail(400, '가져올 항목 수가 너무 많거나 형식이 잘못되었습니다.');
          for (const original of list) {
            const item = cleanItem(kind, { ...original, placeId: ids.get(original.placeId) || '', sourceId: ids.get(original.sourceId) || '', payer: user.id, assignee: original.assignee ? user.id : '' }, doc, user.id);
            ids.set(original.id, item.id); doc[kind].push(item);
          }
        }
      }
 return doc;
}
