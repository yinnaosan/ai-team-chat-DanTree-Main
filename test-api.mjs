import { fetchStockDataForTask } from './server/realtime-data.ts';

async function main() {
  console.log("=== Testing Yahoo Finance API ===");
  try {
    const result = await fetchStockDataForTask("分析苹果 2025 年 Q1 财报");
    if (result) {
      console.log("Yahoo Finance returned data, length:", result.length);
      console.log("First 500 chars:", result.substring(0, 500));
    } else {
      console.log("Yahoo Finance returned NULL/empty");
    }
  } catch (e) {
    console.error("Yahoo Finance ERROR:", e.message);
  }
}

main().catch(console.error);
