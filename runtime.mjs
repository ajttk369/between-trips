// Keep this in sync with vercel.json; the deployment test checks both policies.
// Only the Google Maps SDK hosts may execute scripts. Other providers are called server-side.
export const contentSecurityPolicy = "default-src 'self'; script-src 'self' https://maps.googleapis.com https://maps.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; connect-src 'self' https://maps.googleapis.com https://mapsresources-pa.googleapis.com https://places.googleapis.com https://maps.gstatic.com https://csi.gstatic.com https://www.google.com; font-src 'self' https://fonts.gstatic.com; worker-src 'self' blob:; frame-src https://www.google.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
export function requestOrigin(req) {
  return `${process.env.VERCEL || req.socket?.encrypted ? 'https' : 'http'}://${req.headers.host}`;
}
export function publicUrl() {
  if (process.env.PUBLIC_URL) return new URL(process.env.PUBLIC_URL).origin;
  const domain = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  return process.env.VERCEL && domain ? `https://${domain}` : '';
}
export const secureCookies = () => Boolean(process.env.VERCEL) || process.env.COOKIE_SECURE === 'true';
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export async function readJsonBody(req) {
  let raw;
  // Vercel의 Node 함수는 JSON body를 미리 파싱할 수 있습니다.
  if (req.body !== undefined) {
    if (Buffer.isBuffer(req.body)) raw = req.body.toString('utf8');
    else if (typeof req.body === 'string') raw = req.body;
    else {
      if (Buffer.byteLength(JSON.stringify(req.body)) > 2_000_000) fail(413, '파일 또는 입력 내용은 2MB 이하여야 합니다.');
      return req.body;
    }
  } else {
    let size = 0; const chunks = [];
    for await (const chunk of req) {
      size += Buffer.byteLength(chunk);
      if (size > 2_000_000) fail(413, '파일 또는 입력 내용은 2MB 이하여야 합니다.');
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    raw = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.byteLength(raw) > 2_000_000) fail(413, '파일 또는 입력 내용은 2MB 이하여야 합니다.');
  try { return JSON.parse(raw || '{}'); } catch { fail(400, '올바른 JSON 형식이 아닙니다.'); }
}
