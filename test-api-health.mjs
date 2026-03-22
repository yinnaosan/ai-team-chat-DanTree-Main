// Test SimFin and Alpha Vantage health from Node.js
const SF_KEY = "728bbdab-a951-4577-99b0-1b348bf93783";
const AV_KEY = "RTEA1T8M5T0PXQZR";

console.log("=== Testing SimFin ===");
try {
  const res = await fetch(
    "https://backend.simfin.com/api/v3/companies/statements/compact?ticker=AAPL&statements=derived&period=FY",
    {
      headers: { Authorization: `api-key ${SF_KEY}`, Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    }
  );
  console.log("SimFin status:", res.status);
  const data = await res.json();
  console.log("SimFin ok:", Array.isArray(data) ? `array[${data.length}]` : JSON.stringify(data).slice(0, 200));
} catch (e) {
  console.log("SimFin error:", e.message, e.cause?.code || "");
}

console.log("\n=== Testing Alpha Vantage ===");
try {
  const res = await fetch(
    `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=AAPL&apikey=${AV_KEY}`,
    { signal: AbortSignal.timeout(12000) }
  );
  console.log("AV status:", res.status);
  const data = await res.json();
  if (data["Note"] || data["Information"]) {
    console.log("AV rate-limited:", data["Note"] ?? data["Information"]);
  } else {
    console.log("AV ok:", JSON.stringify(data).slice(0, 200));
  }
} catch (e) {
  console.log("AV error:", e.message, e.cause?.code || "");
}
