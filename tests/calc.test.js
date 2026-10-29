'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeBuy, computeReverse } = require('../public/js/calc.js');
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);
const base = { price: 5000000, payPct: 0, payFlat: 0, feePct: 0.1, gstPct: 18, spreadPct: 0 };

test('INR 10,000 with 0.1% fee + 18% GST', () => {
  const r = computeBuy({ ...base, budget: 10000 });
  near(r.fee, 10); near(r.gst, 1.8); near(r.coins, 9988.2 / 5000000);
});
test('every rupee is accounted for', () => {
  const r = computeBuy({ ...base, budget: 25000, payPct: 2.5, payFlat: 10, spreadPct: 0.3 });
  near(r.payCharge + r.fee + r.gst + r.spreadCost + r.marketValue, 25000, 1e-6);
});
test('zero fees buys at market price', () => {
  const r = computeBuy({ ...base, budget: 5000, feePct: 0, gstPct: 0 });
  near(r.coins, 0.001); near(r.totalCost, 0);
});
test('reverse round-trips with forward', () => {
  const o = { ...base, payPct: 2, payFlat: 5, spreadPct: 0.5 };
  const rev = computeReverse({ ...o, coins: 0.01 });
  const fwd = computeBuy({ ...o, budget: rev.budget });
  near(fwd.coins, 0.01, 1e-12);
});
test('flat charge larger than budget gives zero coins, no negatives', () => {
  const r = computeBuy({ ...base, budget: 5, payFlat: 20 });
  assert.equal(r.ok, true); assert.equal(r.coins, 0); assert.ok(r.warning);
});
test('rejects bad input', () => {
  assert.equal(computeBuy({ ...base, budget: 0 }).ok, false);
  assert.equal(computeBuy({ ...base, budget: NaN }).ok, false);
  assert.equal(computeBuy({ ...base, budget: 100, price: 0 }).ok, false);
  assert.equal(computeBuy({ ...base, budget: 100, feePct: 100 }).ok, false);
  assert.equal(computeBuy({ ...base, budget: 100, payPct: -1 }).ok, false);
  assert.equal(computeReverse({ ...base, coins: 0 }).ok, false);
});
