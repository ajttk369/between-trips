import { readJsonBody, publicUrl, requestOrigin, secureCookies } from './runtime.mjs';
import { validateMeta, cleanItem, applyMutation, createDocument } from './travel-domain.mjs';
export { validateMeta } from './travel-domain.mjs';
import { createCloudApi } from './supabase-api.mjs';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const derive = promisify(scrypt);
const hash = value => createHash('sha256').update(value).digest('hex');
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

export function createApp({ dataDir = process.env.DATA_DIR || path.join(root, 'data'), cloudFetch, planGenerator, serviceFetch=globalThis.fetch } = {}) {
  if(process.env.STORAGE_BACKEND&&!['sqlite','supabase'].includes(process.env.STORAGE_BACKEND))throw new Error('STORAGE_BACKEND는 sqlite 또는 supabase여야 합니다.');
  const cloudMode=process.env.STORAGE_BACKEND==='supabase';
  const db=cloudMode?null:(()=>{
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'travel.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS trips (id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), document TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, updated TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS members (trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id), role TEXT NOT NULL, PRIMARY KEY(trip_id,user_id));
    CREATE TABLE IF NOT EXISTS invites (id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE, token TEXT NOT NULL UNIQUE, expires INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);
  `);
  return db;
  })();
  const streams = new Set(), attempts = new Map(), cache = new Map();
  const userOf = req => {
    const token = /(?:^|;\s*)travel_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    return token ? db.prepare('SELECT u.id,u.name,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?').get(hash(token), Date.now()) : undefined;
  };
  const permission = (id, user, owner = false) => {
    const m = db.prepare('SELECT role FROM members WHERE trip_id=? AND user_id=?').get(id, user.id);
    if (!m || (owner && m.role !== 'owner')) fail(403, '이 여행에 접근할 권한이 없습니다.');
    return m;
  };
  const snapshot = id => {
    const row = db.prepare('SELECT * FROM trips WHERE id=?').get(id);
    if (!row) fail(404, '여행을 찾을 수 없습니다.');
    return { id, owner: row.owner, version: row.version, updated: row.updated, ...JSON.parse(row.document), members: db.prepare('SELECT u.id,u.name,m.role FROM members m JOIN users u ON u.id=m.user_id WHERE m.trip_id=? ORDER BY CASE m.role WHEN \'owner\' THEN 0 ELSE 1 END').all(id) };
  };
  const broadcast = id => {
    for (const stream of streams) {
      if (stream.tripId !== id) continue;
      if (!userOf(stream.req) || !db.prepare('SELECT 1 FROM members WHERE trip_id=? AND user_id=?').get(id, stream.userId)) { stream.res.write('event: access\ndata: {}\n\n'); stream.res.end(); streams.delete(stream); }
      else stream.res.write(`event: change\ndata: ${JSON.stringify({ id })}\n\n`);
    }
  };
  const transaction = fn => { db.exec('BEGIN IMMEDIATE'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  const save = (id, doc, version) => {
    const r = db.prepare('UPDATE trips SET document=?,version=version+1,updated=? WHERE id=? AND version=?').run(JSON.stringify(doc), new Date().toISOString(), id, version);
    if (!r.changes) fail(409, '상대방이 먼저 변경했습니다. 최신 내용을 확인한 뒤 다시 저장해주세요. 입력 내용은 그대로 유지됩니다.');
  };
  const readBody=readJsonBody;
  const session = (res, user) => {
    db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
    const token = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(token), user.id, Date.now() + 30 * 86400000);
    res.setHeader('Set-Cookie', `travel_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secureCookies() ? '; Secure' : ''}`);
  };
  const cloud=process.env.STORAGE_BACKEND==='supabase'?createCloudApi({readBody,fetchImpl:cloudFetch,planGenerator,config:{search:Boolean(process.env.GEOAPIFY_API_KEY||process.env.GOOGLE_MAPS_API_KEY),googleMapsBrowserKey:process.env.GOOGLE_MAPS_API_KEY||'',routing:Boolean(process.env.GEOAPIFY_API_KEY),publicUrl:publicUrl(),liveMode:process.env.VERCEL?'poll':'sse',currencies}}):null;
  async function api(req, res, url) {
    const method = req.method, parts = url.pathname.split('/').filter(Boolean).slice(1);
    const json = (data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    if (!['GET', 'HEAD'].includes(method)) {
      const expected = publicUrl() || requestOrigin(req);
      if (req.headers.origin && req.headers.origin !== expected && req.headers.origin !== requestOrigin(req)) fail(403, '허용되지 않은 요청 출처입니다.');
      if (!req.headers['content-type']?.startsWith('application/json')) fail(415, 'JSON 요청이 필요합니다.');
    }
    if(cloud && !['search','route'].includes(parts[0]))return cloud.handle(req,res,url);
    let user = cloud?await cloud.userOf(req,res):userOf(req);
    if (parts[0] === 'config') return json({ storage:'sqlite', search: Boolean(process.env.GEOAPIFY_API_KEY||process.env.GOOGLE_MAPS_API_KEY), googleMapsBrowserKey:process.env.GOOGLE_MAPS_API_KEY||'', routing: Boolean(process.env.GEOAPIFY_API_KEY), publicUrl: process.env.PUBLIC_URL || '', currencies });
    if (parts[0] === 'auth') {
      if (method === 'GET') return json({ user: user || null });
      const body = await readBody(req);
      if (parts[1] === 'logout') {
        const token = /travel_session=([a-f0-9]{64})/.exec(req.headers.cookie || '')?.[1];
        if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(hash(token));
        res.setHeader('Set-Cookie', 'travel_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
        for (const s of streams) if (s.userId === user?.id) { s.res.end(); streams.delete(s); }
        return json({ ok: true });
      }
      if (!['login', 'register'].includes(parts[1])) fail(404, '없는 기능입니다.');
      const email = required(body.email, '이메일', 254).toLowerCase();
      const password = String(body.password || '');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, '이메일 형식을 확인해주세요.');
      if (password.length < 10 || password.length > 200) fail(400, '비밀번호는 10~200자로 입력해주세요.');
      const key = `${req.socket.remoteAddress}:${email}`, recent = attempts.get(key);
      if (recent && recent.until > Date.now() && recent.count >= 15) fail(429, '잠시 후 다시 시도해주세요.');
      attempts.set(key, { count: recent?.until > Date.now() ? recent.count + 1 : 1, until: Date.now() + 600000 });
      if (attempts.size > 5000) for (const [k, v] of attempts) if (v.until < Date.now()) attempts.delete(k);
      if (parts[1] === 'register') {
        const name = required(body.name, '이름', 40), salt = randomBytes(16).toString('hex');
        const derived = await derive(password, salt, 64);
        user = { id: uid(), email, name };
        try { db.prepare('INSERT INTO users VALUES (?,?,?,?)').run(user.id, email, name, `${salt}:${derived.toString('hex')}`); }
        catch (e) { if (e.code?.includes('SQLITE')) fail(409, '이미 등록된 이메일입니다.'); throw e; }
      } else {
        const row = db.prepare('SELECT * FROM users WHERE email=?').get(email);
        const [salt, expected] = row?.password.split(':') || ['unknown-salt', '00'.repeat(64)];
        const actual = await derive(password, salt, 64);
        if (!row || !timingSafeEqual(actual, Buffer.from(expected, 'hex'))) fail(401, '이메일 또는 비밀번호가 맞지 않습니다.');
        user = { id: row.id, email: row.email, name: row.name };
      }
      attempts.delete(key); session(res, user); return json({ user });
    }
    if (!user) fail(401, '로그인이 필요합니다.');
    if (parts[0] === 'search' && method === 'GET') {
      if (!process.env.GEOAPIFY_API_KEY) return json({ configured: false, results: [], message: '온라인 검색이 연결되지 않았어요. 장소를 직접 등록하거나 지도에서 위치를 선택할 수 있어요.' });
      const q = required(url.searchParams.get('q'), '검색어', 200), key = `search:${q}`;
      if (cache.has(key) && cache.get(key).until > Date.now()) return json(cache.get(key).value);
      const target = new URL('https://api.geoapify.com/v1/geocode/search');
      target.search = new URLSearchParams({ text: q, format: 'json', limit: '6', lang: 'ko', apiKey: process.env.GEOAPIFY_API_KEY });
      const response = await serviceFetch(target, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) fail(502, '장소 검색 서비스에 연결하지 못했습니다. 직접 등록을 이용해주세요.');
      const data = await response.json();
      const value = { configured: true, results: (data.results || []).map(p => ({ name: p.name || p.address_line1, address: p.formatted, lat: p.lat, lng: p.lon, precision:['building','amenity'].includes(p.result_type)?'place':['street','suburb','district','city','county','postcode','state','country'].includes(p.result_type)?'area':'address', source: 'Geoapify · OpenStreetMap', link: `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=17/${p.lat}/${p.lon}` })) };
      if (cache.size > 2000) cache.clear(); cache.set(key, { value, until: Date.now() + 3600000 }); return json(value);
    }
    if (parts[0] === 'route' && method === 'POST') {
      const body = await readBody(req);
      if (!process.env.GEOAPIFY_API_KEY || body.mode === 'transit') return json({ available: false, message: body.mode === 'transit' ? '대중교통 시간표는 Google Maps에서 확인해주세요.' : '경로 서비스 미연결 · 직선거리만 표시합니다.' });
      const from = body.from, to = body.to;
      if (!from || !to || from.lat == null || from.lng == null || to.lat == null || to.lng == null) fail(400, '출발지와 도착지 좌표가 필요합니다.');
      const waypoints = `${number(from.lat, -90, 90)},${number(from.lng, -180, 180)}|${number(to.lat, -90, 90)},${number(to.lng, -180, 180)}`;
      const mode = body.mode === 'drive' ? 'drive' : 'walk', key = `${waypoints}:${mode}`;
      if (cache.has(key) && cache.get(key).until > Date.now()) return json(cache.get(key).value);
      const target = new URL('https://api.geoapify.com/v1/routing'); target.search = new URLSearchParams({ waypoints, mode, apiKey: process.env.GEOAPIFY_API_KEY });
      const response = await serviceFetch(target, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) return json({ available: false, message: '이 구간의 경로 정보를 확인할 수 없습니다.' });
      const feature = (await response.json()).features?.[0];
      const value = feature && Number.isFinite(feature.properties?.distance) && Number.isFinite(feature.properties?.time) ? { available: true, distance: feature.properties.distance, seconds: feature.properties.time, source: 'Geoapify · OpenStreetMap' } : { available: false, message: '지원되는 경로가 없습니다.' };
      if (cache.size > 2000) cache.clear(); cache.set(key, { value, until: Date.now() + 3600000 }); return json(value);
    }
    if (parts[0] === 'join' && method === 'POST') {
      const body = await readBody(req), code = required(body.code, '초대 코드', 500);
      const id = transaction(() => {
        const invitation = db.prepare('SELECT * FROM invites WHERE token=? AND used=0 AND expires>?').get(hash(code), Date.now());
        if (!invitation) fail(404, '만료되었거나 취소된 초대입니다. 새 초대를 요청해주세요.');
        if (db.prepare('SELECT 1 FROM members WHERE trip_id=? AND user_id=?').get(invitation.trip_id, user.id)) return invitation.trip_id;
        if (db.prepare('SELECT COUNT(*) AS n FROM members WHERE trip_id=?').get(invitation.trip_id).n >= 2) fail(409, '이 여행은 이미 두 사람이 함께하고 있습니다.');
        db.prepare('INSERT INTO members VALUES (?,?,?)').run(invitation.trip_id, user.id, 'editor');
        db.prepare('UPDATE invites SET used=1 WHERE trip_id=?').run(invitation.trip_id);
        db.prepare('UPDATE trips SET version=version+1 WHERE id=?').run(invitation.trip_id);
        return invitation.trip_id;
      }); broadcast(id); return json(snapshot(id));
    }
    if (parts[0] !== 'trips') fail(404, '요청한 기능을 찾을 수 없습니다.');
    if (parts.length === 1) {
      if (method === 'GET') return json(db.prepare('SELECT t.id FROM trips t JOIN members m ON m.trip_id=t.id WHERE m.user_id=? ORDER BY t.updated DESC').all(user.id).map(row => snapshot(row.id)));
      if (method !== 'POST') fail(405, '허용되지 않은 요청입니다.');
      const body = await readBody(req), imported = body.import, input = imported || body;
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
      const id = uid(); transaction(() => { db.prepare('INSERT INTO trips VALUES (?,?,?,?,?)').run(id, user.id, JSON.stringify(doc), 1, new Date().toISOString()); db.prepare('INSERT INTO members VALUES (?,?,?)').run(id, user.id, 'owner'); }); return json(snapshot(id), 201);
    }
    const id = parts[1]; permission(id, user);
    if (parts[2] === 'events' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('event: ready\ndata: {}\n\n');
      const stream = { res, req, tripId: id, userId: user.id }; streams.add(stream);
      const timer = setInterval(() => { if (!userOf(req)) { res.write('event: access\ndata: {}\n\n'); res.end(); } else res.write(': heartbeat\n\n'); }, 20000);
      req.on('close', () => { clearInterval(timer); streams.delete(stream); }); return;
    }
    if (parts[2] === 'invites') {
      permission(id, user, true);
      if (method === 'GET') return json(db.prepare('SELECT id,expires,used FROM invites WHERE trip_id=? AND used=0 AND expires>?').all(id, Date.now()));
      if (method === 'DELETE') { db.prepare('DELETE FROM invites WHERE trip_id=? AND id=?').run(id, parts[3] || ''); return json({ ok: true }); }
      if (method !== 'POST') fail(405, '허용되지 않은 요청입니다.');
      if (snapshot(id).members.length >= 2) fail(409, '이미 두 사람이 함께하고 있습니다.');
      const code = randomBytes(24).toString('hex'), inviteId = uid(), expires = Date.now() + 7 * 86400000;
      transaction(() => { db.prepare('DELETE FROM invites WHERE trip_id=?').run(id); db.prepare('INSERT INTO invites VALUES (?,?,?,?,0)').run(inviteId, id, hash(code), expires); });
      return json({ id: inviteId, code, expires });
    }
    if (parts[2] === 'members' && method === 'DELETE') {
      permission(id, user, true); const other = parts[3];
      if (other === user.id) fail(400, '여행 소유자는 제외할 수 없습니다.');
      transaction(() => { db.prepare('DELETE FROM members WHERE trip_id=? AND user_id=?').run(id, other || ''); db.prepare('DELETE FROM invites WHERE trip_id=?').run(id); db.prepare('UPDATE trips SET version=version+1 WHERE id=?').run(id); });
      broadcast(id); return json(snapshot(id));
    }
    if (parts[2] === 'export' && method === 'GET') return json({ ...snapshot(id), schemaVersion: 1 });
    if (method === 'GET') return json(snapshot(id));
    if (method === 'DELETE') {
      permission(id, user, true); await readBody(req);
      db.prepare('DELETE FROM trips WHERE id=?').run(id); broadcast(id); return json({ ok: true });
    }
    if (method !== 'PATCH') fail(405, '허용되지 않은 요청입니다.');
    const body = await readBody(req);
    transaction(() => {
      const row = db.prepare('SELECT * FROM trips WHERE id=?').get(id), doc = JSON.parse(row.document);
      if (row.version !== body.version) fail(409, '상대방이 먼저 변경했습니다. 최신 내용을 확인한 뒤 다시 저장해주세요. 입력 내용은 그대로 유지됩니다.');
      applyMutation(doc,body,user);
      save(id, doc, body.version);
    }); broadcast(id); return json(snapshot(id));
  }
  const handler=async (req,res)=>{
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      if (!['GET', 'HEAD'].includes(req.method)) fail(405, '허용되지 않은 요청입니다.');
      if(url.pathname==='/setup-ai.sql'){res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});return res.end(readFileSync(path.join(root,'supabase','ai.sql')));}
      if(url.pathname==='/setup.sql'){res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});return res.end(readFileSync(path.join(root,'supabase','schema.sql')));}
      let file;
      if (url.pathname.startsWith('/vendor/')) file = path.join(root, 'node_modules', 'leaflet', 'dist', decodeURIComponent(url.pathname.slice(8)));
      else file = path.join(root, 'public', url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
      const allowed = file.startsWith(path.join(root, 'public') + path.sep) || file.startsWith(path.join(root, 'node_modules', 'leaflet', 'dist') + path.sep);
      if (!allowed || !existsSync(file)) fail(404, '파일을 찾을 수 없습니다.');
      const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': url.pathname.startsWith('/vendor/') ? 'public, max-age=86400' : 'no-cache' }); res.end(req.method === 'HEAD' ? undefined : readFileSync(file));
    } catch (error) {
      if (res.headersSent) return res.end();
      if (!error.status) console.error(error);
      res.writeHead(error.status || 500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ error: error.status ? error.message : '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' }));
    }
  };
  const server=http.createServer(handler);
  server.on('close', () => { cloud?.close(); for (const s of streams) s.res.end(); db?.close(); });
  return { server, handler, db, close: () => { for (const s of streams) s.res.end(); server.close(); } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server } = createApp(); const port = Number(process.env.PORT || 4310), host = process.env.HOST || '0.0.0.0';
  server.listen(port, host, () => console.log(`여행의 사이 · http://localhost:${port}\n${process.env.STORAGE_BACKEND==='supabase'?'Supabase Auth · 클라우드 저장':'SQLite 저장'} · 같은 서버에 접속한 두 계정이 함께 사용합니다.`));
}
