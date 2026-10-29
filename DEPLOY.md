# Launch checklist

## 1. Set your domain and contact details (once, before deploying)
```
node scripts/set-domain.js https://your-domain.com
```
This updates canonical links, sitemap, robots.txt and the contact email on the privacy page (`contact@your-domain.com`). If that mailbox does not exist, edit `public/privacy.html`.

## 2. Fill in `public/js/config.js`
- `analytics.plausibleDomain`: your domain, after creating a site at plausible.io. Blank = no analytics.
- `referrals[].url`: your affiliate links (must start with `https://`). Blank links stay hidden.
- `fees`: re-check each rate (see PROJECT_MEMORY.md for sources) and update `verified`.

## 3. Deploy (pick one)
**Render (easiest)**
1. Push this folder to a GitHub repository.
2. Render dashboard, New, Blueprint (reads `render.yaml`) or New Web Service: runtime Node, start command `npm start`.
3. Set env var `TRUST_PROXY=1` (needed so rate limiting sees real visitor IPs).
4. Settings, Custom Domains: add your domain and follow the DNS instructions. HTTPS is automatic.

**Railway**
1. New Project, Deploy from GitHub repo. Add variable `TRUST_PROXY=1`.
2. Settings, Networking: Generate Domain or add a custom domain. HTTPS is automatic.

**Your own VPS**
1. Install Node 20, copy the folder, run `PORT=3000 TRUST_PROXY=1 node server.js` under pm2 or systemd.
2. Put Caddy in front for automatic HTTPS: a Caddyfile of `your-domain.com { reverse_proxy localhost:3000 }`.

**Static only (Netlify/Vercel/Cloudflare Pages)**: publish `public/`. Prices then load straight from CoinGecko in the browser and there is no server-side rate limiting.
Note: the Content-Security-Policy header is set by `server.js`; static hosts need their own headers config if you want it.

## 4. After launch
- Open `/healthz` (should say ok) and the home page; check a live price loads.
- Submit `https://your-domain.com/sitemap.xml` in Google Search Console.
- Click each referral button once to confirm the link works.
- Run `npm test` after any change.

## Environment variables
| Name | Default | Purpose |
|---|---|---|
| PORT | 3000 | Port to listen on |
| TRUST_PROXY | off | Set to `1` behind Render/Railway/nginx/Caddy |
| RATE_LIMIT | 30 | Max /api/prices requests per IP per minute |
