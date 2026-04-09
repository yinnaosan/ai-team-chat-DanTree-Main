import https from "https";

// Keys come from process.env (injected by the platform)
const FINNHUB_KEY = process.env.FINNHUB_API_KEY;
const TIINGO_KEY = process.env.TIINGO_API_KEY;
const TWELVE_KEY = process.env.TWELVE_DATA_API_KEY;
const FMP_KEY = process.env.FMP_API_KEY;

console.log("Keys present:", {
  finnhub: !!FINNHUB_KEY,
  tiingo: !!TIINGO_KEY,
  twelve: !!TWELVE_KEY,
  fmp: !!FMP_KEY,
});

function get(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 10000 }, (r) => {
      let d = "";
      r.on("data", (c) => (d += c));
      r.on("end", () => {
        try { resolve({ status: r.statusCode, data: JSON.parse(d) }); }
        catch { resolve({ status: r.statusCode, data: d.slice(0, 200) }); }
      });
    });
    req.on("error", (e) => resolve({ status: "ERR", data: e.message }));
    req.on("timeout", () => { req.destroy(); resolve({ status: "TIMEOUT", data: "timeout" }); });
  });
}

function checkResult(name, result) {
  const d = result.data;
  if (result.status !== 200) {
    console.log(`  ❌ ${name}: HTTP ${result.status}`);
    return;
  }
  // Yahoo Finance
  if (d?.chart?.result?.[0]?.meta?.regularMarketPrice) {
    const m = d.chart.result[0].meta;
    console.log(`  ✅ ${name}: ${m.regularMarketPrice} ${m.currency} (Yahoo)`);
    return;
  }
  // Finnhub
  if (d?.c && d.c > 0) {
    console.log(`  ✅ ${name}: ${d.c} (Finnhub)`);
    return;
  }
  // Tiingo
  if (Array.isArray(d) && d.length > 0 && d[0]?.close) {
    console.log(`  ✅ ${name}: close=${d[0].close} (Tiingo)`);
    return;
  }
  // Twelve Data
  if (d?.close && !d?.code) {
    console.log(`  ✅ ${name}: close=${d.close} (Twelve Data)`);
    return;
  }
  // FMP
  if (Array.isArray(d) && d.length > 0 && d[0]?.symbol) {
    console.log(`  ✅ ${name}: ${d[0].symbol} on ${d[0].exchangeShortName} (FMP)`);
    return;
  }
  // No data / error
  const snippet = JSON.stringify(d).slice(0, 120);
  if (snippet.includes("error") || snippet.includes("Error") || snippet.includes("Invalid") || snippet.includes("Forbidden")) {
    console.log(`  ⚠️  ${name}: no data — ${snippet}`);
  } else if (Array.isArray(d) && d.length === 0) {
    console.log(`  ⚠️  ${name}: empty array`);
  } else {
    console.log(`  ⚠️  ${name}: unexpected — ${snippet}`);
  }
}

async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("A股 / 港股 实时数据源稳定性检测");
  console.log("=".repeat(60));

  console.log("\n── Yahoo Finance（免费，无 key）──");
  checkResult("600519.SS (茅台)", await get("https://query1.finance.yahoo.com/v8/finance/chart/600519.SS?interval=1d&range=5d"));
  checkResult("000858.SZ (五粮液)", await get("https://query1.finance.yahoo.com/v8/finance/chart/000858.SZ?interval=1d&range=5d"));
  checkResult("0700.HK (腾讯)", await get("https://query1.finance.yahoo.com/v8/finance/chart/0700.HK?interval=1d&range=5d"));
  checkResult("9988.HK (阿里)", await get("https://query1.finance.yahoo.com/v8/finance/chart/9988.HK?interval=1d&range=5d"));

  console.log("\n── Finnhub ──");
  if (FINNHUB_KEY) {
    checkResult("600519.SS (茅台)", await get(`https://finnhub.io/api/v1/quote?symbol=600519.SS&token=${FINNHUB_KEY}`));
    checkResult("0700.HK (腾讯)", await get(`https://finnhub.io/api/v1/quote?symbol=0700.HK&token=${FINNHUB_KEY}`));
  } else {
    console.log("  ⚠️  FINNHUB_API_KEY not in env");
  }

  console.log("\n── Tiingo ──");
  if (TIINGO_KEY) {
    checkResult("600519.SS", await get(`https://api.tiingo.com/tiingo/daily/600519.SS/prices?startDate=2026-04-01&token=${TIINGO_KEY}`));
    checkResult("0700.HK", await get(`https://api.tiingo.com/tiingo/daily/0700.HK/prices?startDate=2026-04-01&token=${TIINGO_KEY}`));
  } else {
    console.log("  ⚠️  TIINGO_API_KEY not in env");
  }

  console.log("\n── Twelve Data ──");
  if (TWELVE_KEY) {
    checkResult("600519 (XSHG)", await get(`https://api.twelvedata.com/quote?symbol=600519&exchange=XSHG&apikey=${TWELVE_KEY}`));
    checkResult("0700 (XHKG)", await get(`https://api.twelvedata.com/quote?symbol=0700&exchange=XHKG&apikey=${TWELVE_KEY}`));
  } else {
    console.log("  ⚠️  TWELVE_DATA_API_KEY not in env");
  }

  console.log("\n── FMP ──");
  if (FMP_KEY) {
    checkResult("600519.SS profile", await get(`https://financialmodelingprep.com/stable/profile?symbol=600519.SS&apikey=${FMP_KEY}`));
    checkResult("0700.HK profile", await get(`https://financialmodelingprep.com/stable/profile?symbol=0700.HK&apikey=${FMP_KEY}`));
  } else {
    console.log("  ⚠️  FMP_API_KEY not in env");
  }

  console.log("\n" + "=".repeat(60));
}

main().catch(console.error);
