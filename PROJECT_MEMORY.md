# Project memory: Crypto Buy Calculator

Keep this file up to date. To resume work with Claude in a new chat, upload this zip or paste this file and say what to do next.
Last updated: 2026-10-28

## Goal
Tool #3 of a planned crypto tool suite: "How much crypto will I actually get?" Budget (or target coins) in, coins (or cash needed) out, after payment charges, exchange fee, GST and spread. Audience leans India (INR default, 18% GST option). Revenue plan: exchange referral links. Traffic plan: SEO.

## Roadmap (decided order)
1. DONE: Buy calculator (#3) with SEO content, legal pages, referral slots, analytics hook, rate limiting.
2. NEXT: Exchange Price Comparison Tool (#1). Link both tools together.
3. LATER: Fee calculator (#2) as a feature inside #3, withdrawal fee comparison (#4), amount-received calculator (#5).
Reasoning: #3 and #1 rated best value; #2 is a subset of #3; #4 changes often and risks wrong-network mistakes; #5 has low search demand.

## Architecture
- Zero dependencies. Node 18+ `server.js` serves `public/` and proxies CoinGecko at `/api/prices` (60s cache, stale on failure).
- `public/js/calc.js`: pure math (works in browser and Node, unit tested). `app.js`: UI. `config.js`: all site settings.
- Client price order: `/api/prices` first, then CoinGecko directly, then manual typing.
- Server hardening: coin/currency whitelist, per-IP rate limit (30/min, needs TRUST_PROXY=1 behind a host), path traversal guard, CSP and security headers, cache size cap.

## Math (do not change without updating tests)
```
payCharge = min(budget, budget*pay% + flat);  net = budget - payCharge
fee = net*fee%;  gst = fee*gst%;  tradeable = net - fee - gst
effPrice = price*(1+spread%);  coins = tradeable/effPrice
Reverse: tradeable = coins*effPrice; net = tradeable/(1 - fee%*(1+gst%)); budget = (net+flat)/(1 - pay%)
```
Identity checked in tests: payCharge + fee + gst + spreadCost + marketValue = budget.

## Fee presets (entry-tier spot TAKER, verified 2026-10-28)
| Exchange | Rate | Source notes |
|---|---|---|
| Binance | 0.10% | Regular user spot, 0.075% with BNB (several secondary sources agree; not checked on Binance's own page) |
| Coinbase Advanced (US) | 0.90% | Intro tier after the 16 Sep 2026 restructure (0.50% maker). Reported by Altrady (checked 21 Oct 2026) and DiarioBitcoin. Lower in EU/UK. Older 0.60% figure is outdated |
| Kraken Pro | 0.80% | kraken.com fee schedule shows Tier 1 0.40% maker / 0.80% taker; Kraken changed its Pro fees on 9 Jul 2026. Older 0.40% taker figure is outdated. Regional differences possible |
| CoinDCX (not added) | unclear | Sources conflict (0.20%, 0.45%, 0.50% base). No preset until confirmed on CoinDCX's own fee page |
TODO: confirm each on the exchange's own page, add Indian exchanges (CoinDCX, CoinSwitch, Mudrex), and recheck every 2-3 months. Update `verified` dates in `public/js/config.js`.

## Launch status (what is and is not done)
- DONE in code: SEO (title, meta, canonical, Open Graph, FAQ + WebApplication JSON-LD, how-it-works text, FAQ, sitemap, robots), privacy and disclaimer pages (templates), affiliate slots with sponsored disclosure, Plausible hook, rate limiting, render.yaml, Dockerfile, DEPLOY.md, 9 tests.
- NOT DONE (needs the owner):
  - [ ] Choose and register a domain, run `node scripts/set-domain.js https://domain`
  - [ ] Deploy (see DEPLOY.md), set TRUST_PROXY=1
  - [ ] Create Plausible site, set `plausibleDomain`
  - [ ] Sign up for exchange affiliate programs, paste URLs into `config.js`
  - [ ] Have a lawyer review privacy and disclaimer pages; set a real contact email
  - [ ] Verify fee presets on exchange pages; add an Open Graph image (none yet)
  - [ ] Submit sitemap in Google Search Console

## Known limits and ideas
- Fee presets are taker rates only; no maker/taker switch yet.
- TDS and income tax on selling are not calculated (only GST on fees).
- 11 coins and 9 currencies, hard-coded in `app.js` and the server whitelist (keep both lists in sync).
- Price comes from CoinGecko, not an exchange order book. The comparison tool (#1) should use exchange APIs.
- Ideas: share-result link, maker/taker toggle, Hindi/Gujarati text, more currencies.

## Commands
`npm start` (run), `npm test` (9 tests), `node scripts/set-domain.js https://domain` (set domain)

## Decisions log
- 2026-10-28: Chose zero-dependency Node + plain HTML/JS for easy, error-free deploys.
- 2026-10-28: Kept referral and analytics off by default so nothing ships half-configured.
- 2026-10-28: Removed unverified Indian exchange preset; corrected Coinbase and Kraken presets after fee research.
