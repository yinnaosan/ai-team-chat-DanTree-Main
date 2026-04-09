import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load env
const envFile = path.resolve(__dirname, "../.env");
const env = fs.readFileSync(envFile, "utf8").split("\n").reduce((a, l) => {
  const idx = l.indexOf("=");
  if (idx > 0) {
    const k = l.slice(0, idx).trim();
    const v = l.slice(idx + 1).trim().replace(/^"|"$/g, "");
    a[k] = v;
  }
  return a;
}, {});

const FINNHUB_KEY = env.FINNHUB_API_KEY;
const TIINGO_KEY = env.TIINGO_API_KEY;
const TWELVE_KEY = env.TWELVE_DATA_API_KEY;
const FMP_KEY = env.FMP_API_KEY;

function get(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (r) => {
      let d = "";
      r.on("data", (c) => (d += c));
      r.on("end", () => {
        try { resolve({ status: r.statusCode, data: JSON.parse(d) }); }
        catch { resolve({ status: r.statusCode, data: d.slice(0, 200) }); }
      });
    }).on("error", (e) => resolve({ status: "ERR", data: e.message }));
  });
}

async function main() {
  console.log("=".repeat(60));
  console.log("A股 / 港股 数据源稳定性检测");
  console.log("=".repeat(60));

  const tests = [
    // Yahoo Finance (free, no key)
    { name: "Yahoo Finance — A股 600519.SS", url: "https://query1.finance.yahoo.com/v8/finance/chart/600519.SS?interval=1d&range=5d" },
    { name: "Yahoo Finance — 港股 0700.HK", url: "https://query1.finance.yahoo.com/v8/finance/chart/0700.HK?interval=1d&range=5d" },
    { name: "Yahoo Finance — 港股 9988.HK (阿里)", url: "https://query1.finance.yahoo.com/v8/finance/chart/9988.HK?interval=1d&range=5d" },
    // Finnhub
    { name: "Finnhub — A股 600519.SS", url: `https://finnhub.io/api/v1/quote?symbol=600519.SS&token=${FINNHUB_KEY}` },
    { name: "Finnhub — 港股 0700.HK", url: `https://finnhub.io/api/v1/quote?symbol=0700.HK&token=${FINNHUB_KEY}` },
    // Tiingo
    { name: "Tiingo — A股 600519.SS", url: `https://api.tiingo.com/tiingo/daily/600519.SS/prices?startDate=2026-04-01&token=${TIINGO_KEY}` },
    { name: "Tiingo — 港股 0700.HK", url: `https://api.tiingo.com/tiingo/daily/0700.HK/prices?startDate=2026-04-01&token=${TIINGO_KEY}` },
    // Twelve Data
    { name: "Twelve Data — A股 600519", url: `https://api.twelvedata.com/quote?symbol=600519&exchange=XSHG&apikey=${TWELVE_KEY}` },
    { name: "Twelve Data — 港股 0700", url: `https://api.twelvedata.com/quote?symbol=0700&exchange=XHKG&apikey=${TWELVE_KEY}` },
    // FMP
    { name: "FMP — A股 600519.SS", url: `https://financialmodelingprep.com/stable/profile?symbol=600519.SS&apikey=${FMP_KEY}` },
    { name: "FMP — 港股 0700.HK", url: `https://financialmodelingprep.com/stable/profile?symbol=0700.HK&apikey=${FMP_KEY}` },
  ];

  for (const t of tests) {
    const result = await get(t.url);
    let status = "❌ failed";
    let detail = "";

    if (result.status === 200) {
      const d = result.data;
      // Yahoo
      if (d?.chart?.result?.[0]?.meta?.regularMarketPrice) {
        status = "✅ active";
        detail = `Price: ${d.chart.result[0].meta.regularMarketPrice} ${d.chart.result[0].meta.currency}`;
      }
      // Finnhub
      else if (d?.c && d.c > 0) {
        status = "✅ active";
        detail = `Price: ${d.c}`;
      }
      // Tiingo
      else if (Array.isArray(d) && d.length > 0 && d[0]?.close) {
        status = "✅ active";
        detail = `Close: ${d[0].close}`;
      }
      // Twelve Data
      else if (d?.close && !d?.code) {
        status = "✅ active";
        detail = `Close: ${d.close}`;
      }
      // FMP
      else if (Array.isArray(d) && d.length > 0 && d[0]?.symbol) {
        status = "✅ active";
        detail = `Symbol: ${d[0].symbol}, Exchange: ${d[0].exchangeShortName}`;
      }
      // Error responses
      else if (d?.error || d?.code || d?.['Error Message'] || (typeof d === 'string' && d.includes('error'))) {
        status = "⚠️  no data";
        detail = JSON.stringify(d).slice(0, 100);
      } else {
        status = "⚠️  empty";
        detail = JSON.stringify(d).slice(0, 100);
      }
    } else {
      detail = `HTTP ${result.status}: ${JSON.stringify(result.data).slice(0, 80)}`;
    }

    console.log(`\n${t.name}`);
    console.log(`  ${status}  ${detail}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("结论见上方");
  console.log("=".repeat(60));
}

main().catch(console.error);
