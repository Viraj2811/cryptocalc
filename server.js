'use strict';
// Zero-dependency server: serves /public and proxies CoinGecko prices with a 60s cache.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const TTL_MS = 60 * 1000;
const cache = new Map();

// Only these coins and currencies can be requested (keeps the cache small and blocks abuse).
const ALLOWED_IDS = new Set(['bitcoin', 'ethereum', 'tether', 'binancecoin', 'solana', 'ripple', 'usd-coin', 'dogecoin', 'cardano', 'tron', 'litecoin']);
const ALLOWED_VS = new Set(['inr', 'usd', 'eur', 'gbp', 'aed', 'aud', 'cad', 'sgd', 'jpy']);

// Per-IP rate limit for /api/prices. Set TRUST_PROXY=1 when running behind Render/Railway/nginx.
const RATE_LIMIT = Number(process.env.RATE_LIMIT) || 30; // requests per minute per IP
const WINDOW_MS = 60 * 1000;
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const hits = new Map();
function clientIp(req) {
  if (TRUST_PROXY) {
    const parts = String(req.headers['x-forwarded-for'] || '').split(',').map((x) => x.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1]; // last hop is added by our own proxy, so it can't be spoofed
  }
  return req.socket.remoteAddress || 'unknown';
}
function retryAfter(ip) {
  const now = Date.now();
  let e = hits.get(ip);
  if (!e || now > e.reset) { e = { n: 0, reset: now + WINDOW_MS }; hits.set(ip, e); }
  e.n++;
  return e.n > RATE_LIMIT ? Math.ceil((e.reset - now) / 1000) : 0;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (now > v.reset) hits.delete(k); }, WINDOW_MS).unref();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8'
};
const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' https://plausible.io; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://api.coingecko.com https://plausible.io; frame-ancestors 'self'; base-uri 'self'; form-action 'none'"
};

async function getPrices(ids, vs) {
  const key = ids + '|' + vs;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL_MS) return { body: hit.body, state: 'HIT' };
  const url = 'https://api.coingecko.com/api/v3/simple/price?ids=' +
    encodeURIComponent(ids) + '&vs_currencies=' + encodeURIComponent(vs);
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error('Upstream status ' + r.status);
    const body = await r.text();
    JSON.parse(body); // reject malformed upstream data
    if (cache.size > 200) cache.clear();
    cache.set(key, { t: Date.now(), body });
    return { body, state: 'MISS' };
  } catch (err) {
    if (hit) return { body: hit.body, state: 'STALE' }; // serve old data rather than fail
    throw err;
  }
}

function send(res, status, headers, body) {
  res.writeHead(status, Object.assign({}, SECURITY, headers));
  res.end(body);
}

async function handle(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { Allow: 'GET, HEAD' }, 'Method not allowed');
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch (e) { return send(res, 400, {}, 'Bad request'); }

  if (url.pathname === '/healthz') return send(res, 200, { 'Content-Type': 'text/plain' }, 'ok');

  if (url.pathname === '/api/prices') {
    const wait = retryAfter(clientIp(req));
    if (wait) return send(res, 429, { 'Content-Type': 'application/json', 'Retry-After': String(wait) }, '{"error":"Too many requests. Try again shortly."}');
    const ids = url.searchParams.get('ids') || '';
    const vs = (url.searchParams.get('vs') || '').toLowerCase();
    if (!ids.split(',').every((x) => ALLOWED_IDS.has(x)) || !ALLOWED_VS.has(vs)) {
      return send(res, 400, { 'Content-Type': 'application/json' }, '{"error":"Invalid ids or vs parameter"}');
    }
    try {
      const out = await getPrices(ids, vs);
      return send(res, 200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Cache': out.state }, out.body);
    } catch (e) {
      return send(res, 502, { 'Content-Type': 'application/json' }, '{"error":"Price source unavailable"}');
    }
  }

  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch (e) { return send(res, 400, {}, 'Bad request'); }
  let file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, {}, 'Forbidden');
  try { if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html'); } catch (e) { /* handled below */ }
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { 'Content-Type': 'text/plain' }, 'Not found');
    const ext = path.extname(file).toLowerCase();
    send(res, 200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    }, req.method === 'HEAD' ? undefined : data);
  });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch(() => send(res, 500, { 'Content-Type': 'text/plain' }, 'Server error'));
});
if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => console.log('Crypto calculator running on http://localhost:' + PORT));
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
module.exports = server;
