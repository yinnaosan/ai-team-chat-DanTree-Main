// 直接运行健康检测，打印每个 API 的实际结果
// 用法: node --import tsx/esm run-health-check.mjs

import { checkHealth as checkFinnhub } from './server/finnhubApi.ts';
import { checkHealth as checkFmp } from './server/fmpApi.ts';
import { checkHealth as checkPolygon } from './server/polygonApi.ts';
import { checkHealth as checkAV } from './server/alphaVantageApi.ts';
import { pingCoinGecko } from './server/coinGeckoApi.ts';
import { checkECBHealth } from './server/ecbApi.ts';
import { checkHKEXHealth } from './server/hkexApi.ts';
import { checkNewsApiHealth } from './server/newsApi.ts';
import { checkMarketauxHealth } from './server/marketauxApi.ts';
import { checkSimFinHealth } from './server/simfinApi.ts';
import { checkTiingoHealth } from './server/tiingoApi.ts';
import { ENV } from './server/_core/env.ts';

console.log('=== ENV Keys ===');
console.log('FINNHUB:', ENV.FINNHUB_API_KEY ? ENV.FINNHUB_API_KEY.slice(0,8)+'...' : 'EMPTY');
console.log('FMP:', ENV.FMP_API_KEY ? ENV.FMP_API_KEY.slice(0,8)+'...' : 'EMPTY');
console.log('POLYGON:', ENV.POLYGON_API_KEY ? ENV.POLYGON_API_KEY.slice(0,8)+'...' : 'EMPTY');
console.log('ALPHA_VANTAGE:', ENV.ALPHA_VANTAGE_API_KEY ? ENV.ALPHA_VANTAGE_API_KEY.slice(0,8)+'...' : 'EMPTY');
console.log('COINGECKO:', ENV.COINGECKO_API_KEY ? ENV.COINGECKO_API_KEY.slice(0,8)+'...' : 'EMPTY');
console.log('NEWS_API:', ENV.NEWS_API_KEY ? ENV.NEWS_API_KEY.slice(0,8)+'...' : 'EMPTY');
console.log('MARKETAUX:', ENV.MARKETAUX_API_KEY ? ENV.MARKETAUX_API_KEY.slice(0,8)+'...' : 'EMPTY');
console.log('SIMFIN:', ENV.SIMFIN_API_KEY ? ENV.SIMFIN_API_KEY.slice(0,8)+'...' : 'EMPTY');
console.log('TIINGO:', ENV.TIINGO_API_KEY ? ENV.TIINGO_API_KEY.slice(0,8)+'...' : 'EMPTY');

console.log('\n=== Health Checks ===');

const results = await Promise.allSettled([
  checkFinnhub().then(r => ({ name: 'Finnhub', ok: r.ok, detail: r.detail })),
  checkFmp().then(r => ({ name: 'FMP', ok: r.ok, detail: r.detail })),
  checkPolygon().then(r => ({ name: 'Polygon', ok: r.ok, detail: r.detail })),
  checkAV().then(r => ({ name: 'AlphaVantage', ok: r.ok, detail: r.detail })),
  pingCoinGecko().then(ok => ({ name: 'CoinGecko', ok, detail: ok ? 'ping ok' : 'ping failed' })),
  checkECBHealth().then(r => ({ name: 'ECB', ok: r.ok, detail: r.detail || r.status })),
  checkHKEXHealth().then(r => ({ name: 'HKEXnews', ok: r.ok, detail: r.detail || r.status })),
  checkNewsApiHealth().then(ok => ({ name: 'NewsAPI', ok, detail: ok ? 'ok' : 'failed' })),
  checkMarketauxHealth().then(ok => ({ name: 'Marketaux', ok, detail: ok ? 'ok' : 'failed' })),
  checkSimFinHealth().then(ok => ({ name: 'SimFin', ok, detail: ok ? 'ok' : 'failed' })),
  checkTiingoHealth().then(ok => ({ name: 'Tiingo', ok, detail: ok ? 'ok' : 'failed' })),
]);

for (const r of results) {
  if (r.status === 'fulfilled') {
    const { name, ok, detail } = r.value;
    console.log(`${ok ? '✓' : '✗'} ${name}: ${detail}`);
  } else {
    console.log(`✗ ERROR: ${r.reason}`);
  }
}
