/* Site settings. Edit this file, no other code changes needed. */
window.SITE_CONFIG = {
  // Plausible Analytics: put your site domain here (e.g. 'mycrypto.in') to switch it on. Blank = no tracking.
  analytics: { plausibleDomain: '' },

  // Affiliate links. A link shows only when url starts with https://. Paste your own referral URLs.
  referrals: [
    { name: 'Binance',  url: '' },
    { name: 'CoinDCX',  url: '' },
    { name: 'Coinbase', url: '' },
    { name: 'Kraken',   url: '' }
  ],

  // Exchange fee presets (percent, entry-tier spot TAKER rates). Re-check before launch and every few months.
  fees: [
    { name: 'Binance', fee: 0.1, verified: '2026-10-28',
      note: 'Standard spot rate for regular users. Paying fees in BNB can lower it.' },
    { name: 'Coinbase Advanced (US)', fee: 0.9, verified: '2026-10-28',
      note: 'Entry tier taker rate after the September 2026 change. Lower in some regions. Simple Buy costs more.' },
    { name: 'Kraken Pro', fee: 0.8, verified: '2026-10-28',
      note: 'Entry tier taker rate. Varies by region. Kraken Instant Buy costs more.' }
  ]
};
