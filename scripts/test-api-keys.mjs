// STEP 1: API Key Status Detection
import https from 'https';
import http from 'http';

const keys = {
  FMP: process.env.FMP_API_KEY,
  TWELVE_DATA: process.env.TWELVE_DATA_API_KEY,
  FINNHUB: process.env.FINNHUB_API_KEY,
  POLYGON: process.env.POLYGON_API_KEY,
  FRED: process.env.FRED_API_KEY,
  SIMFIN: process.env.SIMFIN_API_KEY,
  ALPHA_VANTAGE: process.env.ALPHA_VANTAGE_API_KEY,
  MARKETAUX: process.env.MARKETAUX_API_KEY,
  NEWS_API: process.env.NEWS_API_KEY,
  TIINGO: process.env.TIINGO_API_KEY,
  COINGECKO: process.env.COINGECKO_API_KEY,
  TENCENT_NEWS: '95b0b0c9-e4d0-458c-a271-ef0847d84283', // user provided
  QUIVER_QUANT: process.env.QUIVER_QUANT_API_KEY,
  FINVIZ: process.env.FINVIZ_API_KEY,
  POLYMARKET: process.env.POLYMARKET_API_KEY,
};

function fetchUrl(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: 8000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data.slice(0, 200) }); }
      });
    });
    req.on('error', (e) => resolve({ status: 'ERROR', body: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 'TIMEOUT', body: 'timeout' }); });
  });
}

function isValidData(body) {
  if (!body) return false;
  if (typeof body === 'string') {
    if (body.includes('Error') || body.includes('error') || body.includes('invalid') || body.includes('unauthorized')) return false;
    return body.length > 10;
  }
  if (typeof body === 'object') {
    const s = JSON.stringify(body);
    if (s.includes('"Error Message"') || s.includes('"error"') || s.includes('"message":"Invalid') || s.includes('"status":"error"')) return false;
    return true;
  }
  return false;
}

const tests = [
  {
    name: 'FMP (stable/profile)',
    key: 'FMP',
    test: async () => fetchUrl(`https://financialmodelingprep.com/stable/profile?symbol=AAPL&apikey=${keys.FMP}`),
    validate: (r) => r.status === 200 && Array.isArray(r.body) && r.body[0]?.symbol === 'AAPL'
  },
  {
    name: 'Twelve Data (quote)',
    key: 'TWELVE_DATA',
    test: async () => fetchUrl(`https://api.twelvedata.com/quote?symbol=AAPL&apikey=${keys.TWELVE_DATA}`),
    validate: (r) => r.status === 200 && r.body?.symbol === 'AAPL' && !r.body?.message?.includes('invalid')
  },
  {
    name: 'Finnhub (quote)',
    key: 'FINNHUB',
    test: async () => fetchUrl(`https://finnhub.io/api/v1/quote?symbol=AAPL&token=${keys.FINNHUB}`),
    validate: (r) => r.status === 200 && typeof r.body?.c === 'number' && r.body?.c > 0
  },
  {
    name: 'Polygon (ticker)',
    key: 'POLYGON',
    test: async () => fetchUrl(`https://api.polygon.io/v2/aggs/ticker/AAPL/range/1/day/2024-01-01/2024-01-05?apiKey=${keys.POLYGON}`),
    validate: (r) => r.status === 200 && r.body?.status === 'OK'
  },
  {
    name: 'FRED (series)',
    key: 'FRED',
    test: async () => fetchUrl(`https://api.stlouisfed.org/fred/series?series_id=GDP&api_key=${keys.FRED}&file_type=json`),
    validate: (r) => r.status === 200 && r.body?.seriess?.length > 0
  },
  {
    name: 'SimFin (company)',
    key: 'SIMFIN',
    test: async () => fetchUrl(`https://backend.simfin.com/api/v3/companies/list?api-key=${keys.SIMFIN}`),
    validate: (r) => r.status === 200 && Array.isArray(r.body)
  },
  {
    name: 'Alpha Vantage (quote)',
    key: 'ALPHA_VANTAGE',
    test: async () => fetchUrl(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=AAPL&apikey=${keys.ALPHA_VANTAGE}`),
    validate: (r) => r.status === 200 && r.body?.['Global Quote']?.['01. symbol'] === 'AAPL'
  },
  {
    name: 'Marketaux (news)',
    key: 'MARKETAUX',
    test: async () => fetchUrl(`https://api.marketaux.com/v1/news/all?symbols=AAPL&limit=1&api_token=${keys.MARKETAUX}`),
    validate: (r) => r.status === 200 && Array.isArray(r.body?.data)
  },
  {
    name: 'NewsAPI (headlines)',
    key: 'NEWS_API',
    test: async () => fetchUrl(`https://newsapi.org/v2/everything?q=AAPL&pageSize=1&apiKey=${keys.NEWS_API}`),
    validate: (r) => r.status === 200 && r.body?.status === 'ok'
  },
  {
    name: 'Tiingo (price)',
    key: 'TIINGO',
    test: async () => fetchUrl(`https://api.tiingo.com/tiingo/daily/AAPL?token=${keys.TIINGO}`),
    validate: (r) => r.status === 200 && r.body?.ticker === 'AAPL'
  },
  {
    name: 'Tencent News',
    key: 'TENCENT_NEWS',
    test: async () => fetchUrl(`https://api.inews.qq.com/newsqa/v1/query/pub/stocks/news?stock=AAPL&appkey=${keys.TENCENT_NEWS}`),
    validate: (r) => r.status === 200 && !JSON.stringify(r.body).includes('error')
  },
  {
    name: 'QuiverQuant',
    key: 'QUIVER_QUANT',
    test: async () => {
      if (!keys.QUIVER_QUANT) return { status: 'MISSING', body: 'no key' };
      return fetchUrl(`https://api.quiverquant.com/beta/live/congresstrading?ticker=AAPL&Authorization=Token ${keys.QUIVER_QUANT}`);
    },
    validate: (r) => r.status === 200 && Array.isArray(r.body)
  },
  {
    name: 'Finviz',
    key: 'FINVIZ',
    test: async () => {
      if (!keys.FINVIZ) return { status: 'MISSING', body: 'no key' };
      return fetchUrl(`https://elite.finviz.com/api/quote.ashx?t=AAPL&auth=${keys.FINVIZ}`);
    },
    validate: (r) => r.status === 200
  },
  {
    name: 'Polymarket',
    key: 'POLYMARKET',
    test: async () => {
      // Polymarket CLOB API is public (no key needed for read)
      return fetchUrl(`https://clob.polymarket.com/markets?limit=1`);
    },
    validate: (r) => r.status === 200 && (Array.isArray(r.body) || r.body?.data)
  },
];

console.log('\n=== STEP 1: API Key Status Report ===\n');

const results = [];
for (const t of tests) {
  const keyVal = keys[t.key];
  if (t.key !== 'TENCENT_NEWS' && t.key !== 'POLYMARKET' && !keyVal) {
    results.push({ name: t.name, status: 'missing_key', detail: 'env var not set' });
    continue;
  }
  try {
    const r = await t.test();
    if (r.status === 'MISSING') {
      results.push({ name: t.name, status: 'missing_key', detail: 'no key provided' });
    } else if (r.status === 'TIMEOUT') {
      results.push({ name: t.name, status: 'failed', detail: 'timeout' });
    } else if (r.status === 'ERROR') {
      results.push({ name: t.name, status: 'failed', detail: r.body });
    } else {
      const valid = t.validate(r);
      results.push({
        name: t.name,
        status: valid ? 'active' : 'failed',
        detail: valid ? `HTTP ${r.status} ✓` : `HTTP ${r.status} - ${JSON.stringify(r.body).slice(0, 120)}`
      });
    }
  } catch(e) {
    results.push({ name: t.name, status: 'failed', detail: e.message });
  }
}

// Print results
const statusEmoji = { active: '✅', missing_key: '❌', failed: '⚠️', disabled: '🚫' };
for (const r of results) {
  console.log(`${statusEmoji[r.status] || '?'} [${r.status.toUpperCase().padEnd(11)}] ${r.name.padEnd(25)} ${r.detail}`);
}

// Summary
const missing = results.filter(r => r.status === 'missing_key').map(r => r.name);
const failed = results.filter(r => r.status === 'failed').map(r => r.name);
const active = results.filter(r => r.status === 'active').map(r => r.name);

console.log('\n--- Summary ---');
console.log(`Active:      ${active.length} providers`);
console.log(`Missing key: ${missing.length} → ${missing.join(', ') || 'none'}`);
console.log(`Failed:      ${failed.length} → ${failed.join(', ') || 'none'}`);

if (missing.length > 0) {
  console.log('\nmissing_key:');
  missing.forEach(m => console.log(`- ${m}`));
}
