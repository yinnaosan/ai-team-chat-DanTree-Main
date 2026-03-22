/**
 * API 数据验证脚本
 * 测试每个 API 实际返回的最新数据日期，确认不是训练记忆数据
 */

const FRED_KEY = 'fc90d7149fbff8a90993d1a4d0829ba4';
const FINNHUB_KEY = process.env.FINNHUB_API_KEY;
const FMP_KEY = process.env.FMP_API_KEY;
const POLYGON_KEY = process.env.POLYGON_API_KEY;
const AV_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const NEWS_KEY = process.env.NEWS_API_KEY;
const MARKETAUX_KEY = process.env.MARKETAUX_API_KEY;
const TIINGO_KEY = process.env.TIINGO_API_KEY;
const COINGECKO_KEY = process.env.COINGECKO_API_KEY;
const SIMFIN_KEY = process.env.SIMFIN_API_KEY;

async function fetchJson(url, label) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { label, error: `HTTP ${res.status}` };
    return { label, data: await res.json() };
  } catch (e) {
    return { label, error: e.message };
  }
}

async function main() {
  console.log('=== API 实时数据验证 ===');
  console.log(`当前时间: ${new Date().toISOString()}\n`);

  const results = await Promise.all([
    // 1. Yahoo Finance - AAPL 最新价格
    fetchJson(
      'https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=1d',
      'Yahoo Finance (AAPL)'
    ),
    // 2. FRED - 联邦基金利率最新值
    fetchJson(
      `https://api.stlouisfed.org/fred/series/observations?series_id=FEDFUNDS&api_key=${FRED_KEY}&file_type=json&sort_order=desc&limit=1`,
      'FRED (联邦基金利率)'
    ),
    // 3. Finnhub - AAPL 实时报价
    fetchJson(
      `https://finnhub.io/api/v1/quote?symbol=AAPL&token=${FINNHUB_KEY}`,
      'Finnhub (AAPL 实时报价)'
    ),
    // 4. FMP - AAPL 最新股价
    fetchJson(
      `https://financialmodelingprep.com/stable/quote?symbol=AAPL&apikey=${FMP_KEY}`,
      'FMP (AAPL 报价)'
    ),
    // 5. Polygon - AAPL 昨收
    fetchJson(
      `https://api.polygon.io/v2/aggs/ticker/AAPL/prev?apiKey=${POLYGON_KEY}`,
      'Polygon (AAPL 昨收)'
    ),
    // 6. Alpha Vantage - AAPL 最新价格
    fetchJson(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=AAPL&apikey=${AV_KEY}`,
      'Alpha Vantage (AAPL)'
    ),
    // 7. NewsAPI - 最新新闻
    fetchJson(
      `https://newsapi.org/v2/top-headlines?category=business&pageSize=1&apiKey=${NEWS_KEY}`,
      'NewsAPI (最新商业新闻)'
    ),
    // 8. Marketaux - 最新金融新闻
    fetchJson(
      `https://api.marketaux.com/v1/news/all?symbols=AAPL&filter_entities=true&limit=1&api_token=${MARKETAUX_KEY}`,
      'Marketaux (AAPL 新闻)'
    ),
    // 9. Tiingo - AAPL 最新价格
    fetchJson(
      `https://api.tiingo.com/tiingo/daily/AAPL/prices?token=${TIINGO_KEY}&startDate=2026-03-01`,
      'Tiingo (AAPL 日线)'
    ),
    // 10. CoinGecko - BTC 最新价格
    fetchJson(
      `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_last_updated_at=true&x_cg_demo_api_key=${COINGECKO_KEY}`,
      'CoinGecko (BTC 价格)'
    ),
    // 11. World Bank - 最新 GDP 数据
    fetchJson(
      'https://api.worldbank.org/v2/country/US/indicator/NY.GDP.MKTP.KD.ZG?format=json&mrv=1&per_page=1',
      'World Bank (美国 GDP 增速)'
    ),
    // 12. GDELT - 最新新闻事件
    fetchJson(
      'https://api.gdeltproject.org/api/v2/doc/doc?query=market&mode=artlist&maxrecords=1&format=json',
      'GDELT (最新新闻)'
    ),
    // 13. ECB - 最新汇率
    fetchJson(
      'https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?lastNObservations=1&format=jsondata',
      'ECB (EUR/USD 汇率)'
    ),
    // 14. SimFin - AAPL 财务数据
    fetchJson(
      `https://backend.simfin.com/api/v3/companies/statements/compact?ticker=AAPL&statements=PL&period=TTM&api-key=${SIMFIN_KEY}`,
      'SimFin (AAPL 财务)'
    ),
  ]);

  // 解析并展示关键数据
  for (const r of results) {
    if (r.error) {
      console.log(`❌ ${r.label}: ${r.error}`);
      continue;
    }
    const d = r.data;
    let summary = '';

    if (r.label.includes('Yahoo')) {
      const ts = d?.chart?.result?.[0]?.meta?.regularMarketTime;
      const price = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
      const date = ts ? new Date(ts * 1000).toISOString().split('T')[0] : 'N/A';
      summary = `价格 $${price}, 日期 ${date}`;
    } else if (r.label.includes('FRED')) {
      const obs = d?.observations?.[0];
      summary = `利率 ${obs?.value}%, 日期 ${obs?.date}`;
    } else if (r.label.includes('Finnhub')) {
      const ts = d?.t ? new Date(d.t * 1000).toISOString().split('T')[0] : 'N/A';
      summary = `价格 $${d?.c}, 日期 ${ts}`;
    } else if (r.label.includes('FMP')) {
      const item = Array.isArray(d) ? d[0] : d;
      summary = `价格 $${item?.price}, 日期 ${item?.timestamp ? new Date(item.timestamp * 1000).toISOString().split('T')[0] : 'N/A'}`;
    } else if (r.label.includes('Polygon')) {
      const item = d?.results?.[0];
      const date = item?.t ? new Date(item.t).toISOString().split('T')[0] : 'N/A';
      summary = `收盘 $${item?.c}, 日期 ${date}`;
    } else if (r.label.includes('Alpha Vantage')) {
      const q = d?.['Global Quote'];
      summary = `价格 $${q?.['05. price']}, 日期 ${q?.['07. latest trading day']}`;
    } else if (r.label.includes('NewsAPI')) {
      const art = d?.articles?.[0];
      summary = `标题: "${art?.title?.substring(0, 50)}...", 日期 ${art?.publishedAt?.split('T')[0]}`;
    } else if (r.label.includes('Marketaux')) {
      const art = d?.data?.[0];
      summary = `标题: "${art?.title?.substring(0, 50)}...", 日期 ${art?.published_at?.split('T')[0]}`;
    } else if (r.label.includes('Tiingo')) {
      const item = Array.isArray(d) ? d[d.length - 1] : d;
      summary = `收盘 $${item?.close}, 日期 ${item?.date?.split('T')[0]}`;
    } else if (r.label.includes('CoinGecko')) {
      const btc = d?.bitcoin;
      const date = btc?.last_updated_at ? new Date(btc.last_updated_at * 1000).toISOString().split('T')[0] : 'N/A';
      summary = `BTC $${btc?.usd?.toLocaleString()}, 更新 ${date}`;
    } else if (r.label.includes('World Bank')) {
      const item = d?.[1]?.[0];
      summary = `GDP增速 ${item?.value}%, 年份 ${item?.date}`;
    } else if (r.label.includes('GDELT')) {
      const art = d?.articles?.[0];
      summary = `标题: "${art?.title?.substring(0, 50)}...", 日期 ${art?.seendate?.substring(0, 8)}`;
    } else if (r.label.includes('ECB')) {
      const obs = d?.dataSets?.[0]?.series?.['0:0:0:0:0']?.observations;
      const keys = obs ? Object.keys(obs) : [];
      const lastKey = keys[keys.length - 1];
      const val = obs?.[lastKey]?.[0];
      const timePeriods = d?.structure?.dimensions?.observation?.[0]?.values;
      const lastDate = timePeriods?.[parseInt(lastKey)]?.id;
      summary = `EUR/USD ${val}, 日期 ${lastDate}`;
    } else if (r.label.includes('SimFin')) {
      summary = `返回数据: ${JSON.stringify(d).substring(0, 100)}...`;
    } else {
      summary = JSON.stringify(d).substring(0, 100);
    }

    console.log(`✅ ${r.label}: ${summary}`);
  }

  console.log('\n=== 验证完成 ===');
}

main().catch(console.error);
