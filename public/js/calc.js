/* Pure calculation logic (no DOM). Works in browsers and Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Calc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var LABELS = { payPct: 'Payment charge %', feePct: 'Exchange fee %', gstPct: 'GST %', spreadPct: 'Spread %', payFlat: 'Flat payment charge' };

  function validate(o) {
    var e = [];
    if (!(o.price > 0) || !isFinite(o.price)) e.push('Enter a price greater than zero.');
    ['payPct', 'feePct', 'gstPct', 'spreadPct'].forEach(function (k) {
      if (!(o[k] >= 0 && o[k] < 100)) e.push(LABELS[k] + ' must be between 0 and 99.99.');
    });
    if (!(o.payFlat >= 0) || !isFinite(o.payFlat)) e.push(LABELS.payFlat + ' cannot be negative.');
    if (!e.length && (o.feePct / 100) * (1 + o.gstPct / 100) >= 1) e.push('Exchange fee plus GST adds up to 100% or more.');
    return e;
  }

  /** Forward: how many coins for a given cash budget. */
  function computeBuy(o) {
    var errors = validate(o);
    if (!(o.budget > 0) || !isFinite(o.budget)) errors.unshift('Enter an amount greater than zero.');
    if (errors.length) return { ok: false, errors: errors };

    var payCharge = Math.min(o.budget, o.budget * o.payPct / 100 + o.payFlat);
    var net = o.budget - payCharge;
    var fee = net * o.feePct / 100;
    var gst = fee * o.gstPct / 100;
    var tradeable = Math.max(0, net - fee - gst);
    var effPrice = o.price * (1 + o.spreadPct / 100);
    var coins = tradeable / effPrice;
    var marketValue = coins * o.price;
    var spreadCost = tradeable - marketValue;
    var totalCost = o.budget - marketValue;
    return {
      ok: true, budget: o.budget, payCharge: payCharge, net: net, fee: fee, gst: gst,
      tradeable: tradeable, effPrice: effPrice, coins: coins, marketValue: marketValue,
      spreadCost: spreadCost, totalCost: totalCost, totalCostPct: totalCost / o.budget * 100,
      warning: net <= 0 ? 'Payment charges use up your whole amount.' : ''
    };
  }

  /** Reverse: how much cash is needed to end up with a target number of coins. */
  function computeReverse(o) {
    var errors = validate(o);
    if (!(o.coins > 0) || !isFinite(o.coins)) errors.unshift('Enter a coin amount greater than zero.');
    if (errors.length) return { ok: false, errors: errors };
    var tradeable = o.coins * o.price * (1 + o.spreadPct / 100);
    var net = tradeable / (1 - (o.feePct / 100) * (1 + o.gstPct / 100));
    var budget = (net + o.payFlat) / (1 - o.payPct / 100);
    var res = computeBuy({ budget: budget, price: o.price, payPct: o.payPct, payFlat: o.payFlat,
      feePct: o.feePct, gstPct: o.gstPct, spreadPct: o.spreadPct });
    if (res.ok) res.coins = o.coins; // exact target, avoids float drift
    return res;
  }

  return { computeBuy: computeBuy, computeReverse: computeReverse, validate: validate };
});
