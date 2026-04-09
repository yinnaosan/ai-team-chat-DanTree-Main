#!/usr/bin/env node
// Diagnose US fundamentals layer: FMP + SimFin
import { execSync } from "child_process";

// Read env from the project
const envOutput = execSync("cat /home/ubuntu/ai-team-chat/.env 2>/dev/null || echo ''").toString();
const envMap = {};
for (const line of envOutput.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) envMap[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

// Also check process.env (injected by Manus)
const FMP_KEY = process.env.FMP_API_KEY || envMap.FMP_API_KEY;
const SIMFIN_KEY = process.env.SIMFIN_API_KEY || envMap.SIMFIN_API_KEY;

console.log("=== Fundamentals Diagnosis ===");
console.log("FMP key:", FMP_KEY ? FMP_KEY.slice(0, 8) + "..." : "MISSING");
console.log("SimFin key:", SIMFIN_KEY ? SIMFIN_KEY.slice(0, 8) + "..." : "MISSING");
console.log("");

async function testFMP(ticker) {
  console.log(`--- FMP: ${ticker} ---`);
  
  // Test profile
  try {
    const r = await fetch(`https://financialmodelingprep.com/stable/profile?symbol=${ticker}&apikey=${FMP_KEY}`, {
      signal: AbortSignal.timeout(10000)
    });
    console.log(`  profile: HTTP ${r.status}`);
    const d = await r.json();
    if (Array.isArray(d) && d[0]?.symbol) {
      console.log(`  profile: OK — ${d[0].companyName}, mktCap=${d[0].mktCap}`);
    } else {
      console.log(`  profile: BAD response — ${JSON.stringify(d).slice(0, 150)}`);
    }
  } catch (e) {
    console.log(`  profile: ERROR — ${e.message}`);
  }

  // Test ratios-ttm
  try {
    const r = await fetch(`https://financialmodelingprep.com/stable/ratios-ttm?symbol=${ticker}&apikey=${FMP_KEY}`, {
      signal: AbortSignal.timeout(10000)
    });
    console.log(`  ratios-ttm: HTTP ${r.status}`);
    const d = await r.json();
    if (Array.isArray(d) && d[0]?.peRatioTTM) {
      console.log(`  ratios-ttm: OK — PE=${d[0].peRatioTTM?.toFixed(2)}, ROE=${d[0].returnOnEquityTTM?.toFixed(4)}`);
    } else {
      console.log(`  ratios-ttm: BAD response — ${JSON.stringify(d).slice(0, 150)}`);
    }
  } catch (e) {
    console.log(`  ratios-ttm: ERROR — ${e.message}`);
  }

  // Test income-statement (alternative)
  try {
    const r = await fetch(`https://financialmodelingprep.com/stable/income-statement?symbol=${ticker}&period=annual&limit=1&apikey=${FMP_KEY}`, {
      signal: AbortSignal.timeout(10000)
    });
    console.log(`  income-statement: HTTP ${r.status}`);
    const d = await r.json();
    if (Array.isArray(d) && d[0]?.revenue) {
      console.log(`  income-statement: OK — revenue=${d[0].revenue}, netIncome=${d[0].netIncome}`);
    } else {
      console.log(`  income-statement: BAD — ${JSON.stringify(d).slice(0, 150)}`);
    }
  } catch (e) {
    console.log(`  income-statement: ERROR — ${e.message}`);
  }
}

async function testSimFin(ticker) {
  console.log(`--- SimFin: ${ticker} ---`);
  
  // v2 API
  try {
    const r = await fetch(
      `https://simfin.com/api/v2/companies/statements?ticker=${ticker}&statement=pl&period=ttm&api-key=${SIMFIN_KEY}`,
      { signal: AbortSignal.timeout(10000) }
    );
    console.log(`  v2 pl/ttm: HTTP ${r.status}`);
    const d = await r.json();
    if (d?.error) {
      console.log(`  v2 pl/ttm: ERROR — ${d.error}`);
    } else if (Array.isArray(d) && d[0]?.data) {
      console.log(`  v2 pl/ttm: OK — ${JSON.stringify(d[0].data).slice(0, 150)}`);
    } else {
      console.log(`  v2 pl/ttm: BAD — ${JSON.stringify(d).slice(0, 200)}`);
    }
  } catch (e) {
    console.log(`  v2 pl/ttm: ERROR — ${e.message}`);
  }

  // Try annual instead of ttm
  try {
    const r = await fetch(
      `https://simfin.com/api/v2/companies/statements?ticker=${ticker}&statement=pl&period=annual&api-key=${SIMFIN_KEY}`,
      { signal: AbortSignal.timeout(10000) }
    );
    console.log(`  v2 pl/annual: HTTP ${r.status}`);
    const d = await r.json();
    if (d?.error) {
      console.log(`  v2 pl/annual: ERROR — ${d.error}`);
    } else if (Array.isArray(d) && d[0]?.data) {
      console.log(`  v2 pl/annual: OK — ${JSON.stringify(d[0].data).slice(0, 150)}`);
    } else {
      console.log(`  v2 pl/annual: BAD — ${JSON.stringify(d).slice(0, 200)}`);
    }
  } catch (e) {
    console.log(`  v2 pl/annual: ERROR — ${e.message}`);
  }
}

await testFMP("AAPL");
console.log("");
await testSimFin("AAPL");
console.log("");
await testFMP("MSFT");
