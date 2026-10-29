'use strict';
process.env.RATE_LIMIT = '5';
const test = require('node:test');
const assert = require('node:assert/strict');
const server = require('../server.js');

let base;
test.before(async () => { await new Promise((r) => server.listen(0, '127.0.0.1', r)); base = 'http://127.0.0.1:' + server.address().port; });
test.after(() => server.close());

test('serves pages, health check and SEO files', async () => {
  for (const p of ['/', '/privacy.html', '/disclaimer.html', '/robots.txt', '/sitemap.xml', '/healthz', '/js/config.js']) {
    assert.equal((await fetch(base + p)).status, 200, p);
  }
  const home = await fetch(base + '/');
  assert.ok(home.headers.get('content-security-policy'));
});
test('blocks path traversal and bad methods', async () => {
  assert.equal((await fetch(base + '/%2e%2e/server.js')).status, 404);
  assert.equal((await fetch(base + '/', { method: 'POST' })).status, 405);
});
test('rate limits /api/prices and rejects unknown coins/currencies', async () => {
  const bad = base + '/api/prices?ids=notacoin&vs=inr';
  for (let i = 0; i < 5; i++) assert.equal((await fetch(bad)).status, 400);
  const r = await fetch(bad);
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get('retry-after')) > 0);
});
