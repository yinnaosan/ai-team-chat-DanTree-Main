import { fetchStockDataForTask } from './server/yahooFinance';

async function main() {
  console.log("=== Testing Yahoo Finance API ===");
  try {
    const result = await fetchStockDataForTask("分析苹果 2025 年 Q1 财报");
    if (result) {
      console.log("Yahoo Finance returned data, length:", result.length);
      console.log("First 800 chars:", result.substring(0, 800));
    } else {
      console.log("Yahoo Finance returned NULL/empty");
    }
  } catch (e: any) {
    console.error("Yahoo Finance ERROR:", e.message);
  }
}

main().catch(console.error);
