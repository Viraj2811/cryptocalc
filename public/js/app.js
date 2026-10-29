(function () {
  'use strict';

  var COINS = [
    { id: 'bitcoin', sym: 'BTC', name: 'Bitcoin' }, { id: 'ethereum', sym: 'ETH', name: 'Ethereum' },
    { id: 'tether', sym: 'USDT', name: 'Tether' }, { id: 'binancecoin', sym: 'BNB', name: 'BNB' },
    { id: 'solana', sym: 'SOL', name: 'Solana' }, { id: 'ripple', sym: 'XRP', name: 'XRP' },
    { id: 'usd-coin', sym: 'USDC', name: 'USD Coin' }, { id: 'dogecoin', sym: 'DOGE', name: 'Dogecoin' },
    { id: 'cardano', sym: 'ADA', name: 'Cardano' }, { id: 'tron', sym: 'TRX', name: 'TRON' },
    { id: 'litecoin', sym: 'LTC', name: 'Litecoin' }
  ];
  var CURRENCIES = [
    ['INR', 'Indian rupee'], ['USD', 'US dollar'], ['EUR', 'Euro'], ['GBP', 'British pound'],
    ['AED', 'UAE dirham'], ['AUD', 'Australian dollar'], ['CAD', 'Canadian dollar'], ['SGD', 'Singapore dollar'], ['JPY', 'Japanese yen']
  ];
  var CFG = window.SITE_CONFIG || {};
  var FEES = CFG.fees || [];
  var EXCHANGES = [['Custom', '']].concat(FEES.map(function (f) { return [f.name + ' (' + f.fee + '%)', String(f.fee)]; }));
  var STORE_KEY = 'cryptoCalc.v1';

  var $ = function (id) { return document.getElementById(id); };
  var state = { mode: 'budget', prices: {}, priceCur: null, priceEdited: false, reqId: 0 };

  /* ---------- helpers ---------- */
  function parse(v) {
    var s = String(v == null ? '' : v).replace(/[,\s]/g, '');
    if (s === '') return NaN;
    return /^\d*\.?\d+$|^\d+\.$/.test(s) ? parseFloat(s) : NaN;
  }
  function parseOpt(v) { return String(v).trim() === '' ? 0 : parse(v); } // blank optional fields count as 0
  function curCode() { return $('currency').value; }
  function coin() { return COINS.filter(function (c) { return c.id === $('coin').value; })[0] || COINS[0]; }
  function money(v) {
    var big = Math.abs(v) >= 1 || v === 0;
    try {
      return new Intl.NumberFormat(curCode() === 'INR' ? 'en-IN' : undefined, {
        style: 'currency', currency: curCode(), minimumFractionDigits: big ? 2 : 4, maximumFractionDigits: big ? 2 : 6
      }).format(v);
    } catch (e) { return v.toFixed(2) + ' ' + curCode(); }
  }
  function symbol() {
    try {
      var p = new Intl.NumberFormat(undefined, { style: 'currency', currency: curCode(), currencyDisplay: 'narrowSymbol' }).formatToParts(0);
      for (var i = 0; i < p.length; i++) if (p[i].type === 'currency') return p[i].value;
    } catch (e) { /* fall through */ }
    return curCode();
  }
  function coinFmt(v) {
    var d = v >= 1000 ? 2 : v >= 1 ? 4 : 8;
    return new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: d }).format(v);
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function save() {
    try {
      var o = {};
      ['coin', 'currency', 'payPct', 'payFlat', 'feePct', 'spreadPct', 'exchange'].forEach(function (k) { o[k] = $(k).value; });
      o.gstOn = $('gstOn').checked;
      localStorage.setItem(STORE_KEY, JSON.stringify(o));
    } catch (e) { /* storage unavailable: ignore */ }
  }
  function load() {
    try {
      var o = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (!o) return;
      ['coin', 'currency', 'payPct', 'payFlat', 'feePct', 'spreadPct', 'exchange'].forEach(function (k) {
        if (o[k] != null) $(k).value = o[k];
      });
      $('gstOn').checked = !!o.gstOn;
      if (!$('coin').value) $('coin').selectedIndex = 0;
      if (!$('currency').value) $('currency').selectedIndex = 0;
      if (!$('exchange').value && $('exchange').selectedIndex < 0) $('exchange').selectedIndex = 0;
    } catch (e) { /* corrupted storage: ignore */ }
  }

  /* ---------- live prices ---------- */
  function fetchJson(url) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 8000) : null;
    return fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (r) {
      if (timer) clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }, function (e) { if (timer) clearTimeout(timer); throw e; });
  }
  function loadPrices() {
    var cur = curCode(), v = cur.toLowerCase(), id = ++state.reqId;
    var ids = COINS.map(function (c) { return c.id; }).join(',');
    var urls = ['/api/prices?ids=' + ids + '&vs=' + v,
      'https://api.coingecko.com/api/v3/simple/price?ids=' + ids + '&vs_currencies=' + v];
    setStatus('Fetching live price…', false);
    function attempt(i) {
      if (i >= urls.length) return Promise.reject(new Error('no source'));
      return fetchJson(urls[i]).then(function (j) {
        var out = {};
        COINS.forEach(function (c) { var p = j && j[c.id] && j[c.id][v]; if (typeof p === 'number' && p > 0) out[c.id] = p; });
        if (!Object.keys(out).length) throw new Error('empty');
        return out;
      }).catch(function () { return attempt(i + 1); });
    }
    attempt(0).then(function (out) {
      if (id !== state.reqId) return; // a newer request replaced this one
      state.prices = out; state.priceCur = cur;
      applyLivePrice(false);
    }, function () {
      if (id !== state.reqId) return;
      state.prices = {}; state.priceCur = null;
      setStatus('Live price unavailable. Type the price from your exchange.', true);
      render();
    });
  }
  function applyLivePrice(force) {
    var p = state.priceCur === curCode() ? state.prices[coin().id] : null;
    if (p && (force || !state.priceEdited)) {
      $('price').value = String(Number(p.toPrecision(10)));
      state.priceEdited = false;
    }
    if (p) setStatus(state.priceEdited ? 'You are using your own price.' : 'Live price from CoinGecko, updated ' + new Date().toLocaleTimeString() + '.', false);
    else if (state.priceCur === curCode()) setStatus('No live price for ' + coin().sym + '. Type one in.', true);
    render();
  }
  function setStatus(t, bad) { var s = $('price-status'); s.textContent = t; s.className = 'hint' + (bad ? ' bad' : ''); }

  /* ---------- render ---------- */
  var SEG = [['marketValue', 'c-coin'], ['spreadCost', 'c-spread'], ['fee', 'c-fee'], ['gst', 'c-gst'], ['payCharge', 'c-pay']];
  function inputs() {
    return {
      amount: parse($('amount').value), price: parse($('price').value),
      payPct: parseOpt($('payPct').value), payFlat: parseOpt($('payFlat').value),
      feePct: parseOpt($('feePct').value), spreadPct: parseOpt($('spreadPct').value),
      gstPct: $('gstOn').checked ? 18 : 0
    };
  }
  function render() {
    var i = inputs(), sym = coin().sym, budgetMode = state.mode === 'budget';
    var common = { price: i.price, payPct: i.payPct, payFlat: i.payFlat, feePct: i.feePct, gstPct: i.gstPct, spreadPct: i.spreadPct };
    var userTyped = $('amount').value.trim() !== '';
    var r = budgetMode
      ? window.Calc.computeBuy(Object.assign({ budget: i.amount }, common))
      : window.Calc.computeReverse(Object.assign({ coins: i.amount }, common));

    var errBox = $('errors'), result = $('result'), empty = $('empty');
    if (!r.ok) {
      result.hidden = true;
      if (!userTyped) { errBox.hidden = true; empty.hidden = false; return; }
      empty.hidden = true; errBox.hidden = false; errBox.textContent = '';
      var list = r.errors.slice();
      list.forEach(function (m) { errBox.appendChild(el('p', null, m)); });
      if (isNaN(i.amount) && userTyped) { errBox.textContent = ''; errBox.appendChild(el('p', null, 'Use numbers only, for example 10000 or 0.05.')); }
      return;
    }
    errBox.hidden = true; empty.hidden = true; result.hidden = false;

    if (budgetMode) {
      $('hero-label').textContent = 'You will receive about';
      $('hero').textContent = coinFmt(r.coins) + ' ' + sym;
      $('hero-sub').textContent = 'Worth ' + money(r.marketValue) + ' at the quoted price';
    } else {
      $('hero-label').textContent = 'You need to pay about';
      $('hero').textContent = money(r.budget);
      $('hero-sub').textContent = 'To receive ' + coinFmt(r.coins) + ' ' + sym;
    }

    var bar = $('bar'); bar.textContent = '';
    SEG.forEach(function (s) {
      var w = r.budget > 0 ? Math.max(0, r[s[0]] / r.budget * 100) : 0;
      if (w <= 0) return;
      var b = document.createElement('i'); b.style.width = w + '%'; b.style.background = 'var(--' + s[1] + ')'; bar.appendChild(b);
    });

    var rows = $('rows'); rows.textContent = '';
    function row(label, value, color, cls) {
      var li = el('li', cls || '');
      var l = el('span'); var d = el('span', 'dot'); if (color) d.style.background = 'var(--' + color + ')';
      l.appendChild(d); l.appendChild(document.createTextNode(label));
      li.appendChild(l); li.appendChild(el('span', null, value)); rows.appendChild(li);
    }
    row('Total you pay', money(r.budget), null, 'plain');
    row('Payment charges', '− ' + money(r.payCharge), 'c-pay');
    row('Exchange fee (' + i.feePct + '%)', '− ' + money(r.fee), 'c-fee');
    if (i.gstPct > 0) row('GST on fee (18%)', '− ' + money(r.gst), 'c-gst');
    if (i.spreadPct > 0) row('Spread or slippage', '− ' + money(r.spreadCost), 'c-spread');
    row('Value of coins you get', money(r.marketValue), 'c-coin', 'total');
    row('Effective price per ' + sym, money(r.effPrice), null, 'plain');

    var cost = $('cost'); cost.textContent = '';
    cost.appendChild(document.createTextNode('Total cost of buying: '));
    cost.appendChild(el('strong', null, money(r.totalCost) + ' (' + r.totalCostPct.toFixed(2) + '%)'));
    var w = $('warn'); w.hidden = !r.warning; w.textContent = r.warning;
  }

  /* ---------- setup ---------- */
  function setMode(m) {
    state.mode = m;
    $('tab-budget').classList.toggle('is-on', m === 'budget'); $('tab-budget').setAttribute('aria-pressed', m === 'budget');
    $('tab-coins').classList.toggle('is-on', m === 'coins'); $('tab-coins').setAttribute('aria-pressed', m === 'coins');
    $('amount').value = '';
    updateLabels(); render();
  }
  function updateLabels() {
    var b = state.mode === 'budget';
    $('amount-label').textContent = b ? 'Amount you will spend' : 'Coins you want to receive';
    $('amount-unit').textContent = b ? symbol() : coin().sym;
    $('amount').style.paddingLeft = b ? '' : '56px';
    $('amount').placeholder = b ? '10000' : '0.05';
    $('price-unit').textContent = symbol();
  }

  function feeNote() {
    var v = $('exchange').value, f = FEES.filter(function (x) { return String(x.fee) === v; })[0];
    $('fee-note').textContent = f ? f.note + ' Checked ' + f.verified + '.' : 'Enter the fee shown in your exchange app. Your own tier may differ.';
  }
  function track(name, props) { try { if (window.plausible) window.plausible(name, props ? { props: props } : undefined); } catch (e) { /* analytics must never break the tool */ } }
  function initAnalytics() {
    var d = (CFG.analytics || {}).plausibleDomain;
    if (!d) return;
    window.plausible = window.plausible || function () { (window.plausible.q = window.plausible.q || []).push(arguments); };
    var s = document.createElement('script'); s.defer = true; s.setAttribute('data-domain', d); s.src = 'https://plausible.io/js/script.js';
    document.head.appendChild(s);
  }
  function renderReferrals() {
    var list = (CFG.referrals || []).filter(function (r) { return /^https:\/\//.test(r.url || ''); });
    var box = $('referrals'), ul = $('referral-list'); ul.textContent = '';
    if (!list.length) { box.hidden = true; return; }
    list.forEach(function (r) {
      var li = el('li'), a = el('a', 'btn', 'Buy on ' + r.name);
      a.href = r.url; a.target = '_blank'; a.rel = 'sponsored nofollow noopener noreferrer';
      a.addEventListener('click', function () { track('Referral Click', { exchange: r.name }); });
      li.appendChild(a); ul.appendChild(li);
    });
    box.hidden = false;
  }
  function syncExchange() {
    var f = String(parseOpt($('feePct').value)), m = EXCHANGES.filter(function (x) { return x[1] === f; })[0];
    $('exchange').value = m ? m[1] : 'custom';
    feeNote();
  }

  function init() {
    COINS.forEach(function (c) { var o = el('option', null, c.name + ' (' + c.sym + ')'); o.value = c.id; $('coin').appendChild(o); });
    CURRENCIES.forEach(function (c) { var o = el('option', null, c[0] + ' · ' + c[1]); o.value = c[0]; $('currency').appendChild(o); });
    EXCHANGES.forEach(function (x) { var o = el('option', null, x[0]); o.value = x[1] === '' ? 'custom' : x[1]; $('exchange').appendChild(o); });
    load();
    syncExchange();
    renderReferrals();
    initAnalytics();
    updateLabels();

    $('tab-budget').addEventListener('click', function () { setMode('budget'); });
    $('tab-coins').addEventListener('click', function () { setMode('coins'); });
    ['amount', 'payPct', 'payFlat', 'feePct', 'spreadPct'].forEach(function (id) {
      $(id).addEventListener('input', function () {
        if (id === 'feePct') syncExchange();
        save(); render();
      });
    });
    $('price').addEventListener('input', function () { state.priceEdited = true; setStatus('You are using your own price.', false); render(); });
    $('gstOn').addEventListener('change', function () { save(); render(); });
    $('exchange').addEventListener('change', function () {
      if ($('exchange').value !== 'custom') $('feePct').value = $('exchange').value;
      feeNote(); save(); render();
    });
    $('pay-chips').addEventListener('click', function (e) {
      var pct = e.target && e.target.getAttribute && e.target.getAttribute('data-pct');
      if (pct == null) return;
      $('payPct').value = pct; save(); render();
    });
    $('coin').addEventListener('change', function () { state.priceEdited = false; $('price').value = ''; save(); updateLabels(); applyLivePrice(true); });
    $('currency').addEventListener('change', function () { state.priceEdited = false; $('price').value = ''; save(); updateLabels(); loadPrices(); render(); });
    $('price-live').addEventListener('click', function () { state.priceEdited = false; if (state.priceCur === curCode()) applyLivePrice(true); else loadPrices(); });
    $('price-refresh').addEventListener('click', function () { state.priceEdited = false; loadPrices(); });

    render();
    loadPrices();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
