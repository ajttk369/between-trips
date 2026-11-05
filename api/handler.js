import { createApp } from '../server.mjs';

let app;
// 정적 화면은 CDN에서, /api/* 요청은 이 Node 함수에서 처리합니다.
export default async function handler(req, res) {
  try {
    if ((process.env.STORAGE_BACKEND && process.env.STORAGE_BACKEND !== 'supabase') || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      res.writeHead(503, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' });
      return res.end(JSON.stringify({ error:'Vercel 환경변수에 STORAGE_BACKEND=supabase, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY를 설정하고 다시 배포해주세요.' }));
    }
    process.env.STORAGE_BACKEND = 'supabase';
    process.env.VERCEL = '1';
    app ||= createApp();
    const url = new URL(req.url, 'https://localhost');
    const captured = req.query?.__route ?? url.searchParams.get('__route');
    if (captured != null) {
      const route = Array.isArray(captured) ? captured.join('/') : String(captured);
      if (!/^[a-zA-Z0-9/_-]{1,500}$/.test(route)) {
        res.writeHead(400, { 'Content-Type':'application/json; charset=utf-8' });
        return res.end(JSON.stringify({error:'올바른 API 주소가 아닙니다.'}));
      }
      url.pathname = `/api/${route}`;
      url.searchParams.delete('__route');
      req.url = url.pathname + url.search;
    }
    await app.handler(req,res);
  } catch {
    if (res.headersSent) return res.end();
    res.writeHead(503, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' });
    res.end(JSON.stringify({error:'앱 서버를 준비하지 못했습니다. Vercel 환경변수와 실행 로그를 확인해주세요.'}));
  }
}
