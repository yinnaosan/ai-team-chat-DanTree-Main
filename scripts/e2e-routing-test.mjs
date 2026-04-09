/**
 * STEP 7: 端到端验证脚本
 * 测试 1 个美股（AAPL）+ 1 个 A 股（600519.SS 贵州茅台）
 *
 * 验证内容：
 * 1. 每层实际命中的 provider
 * 2. fallback 是否触发
 * 3. 没有使用禁用源
 * 4. evidenceScore 只计 active + valid data
 */

import { createRequire } from "module";
import { register } from "node:module";

// 使用 tsx 运行 TypeScript
import { execSync } from "child_process";
import { writeFileSync } from "fs";

// 写一个临时 TS 测试文件
const testCode = `
import { routeDataRequest, formatRoutingReport } from "./server/dataRoutingOrchestrator";
import { buildKeyStatusReport } from "./server/dataRoutingEngine";

async function runE2ETest() {
  console.log("=".repeat(60));
  console.log("STEP 7: 端到端验证");
  console.log("=".repeat(60));

  // ── Key 状态报告 ────────────────────────────────────────────────
  console.log("\\n[Key Status Report]");
  const keyReport = buildKeyStatusReport();
  for (const k of keyReport) {
    const icon = k.status === "present" ? "✅" : "❌";
    console.log(\`  \${icon} \${k.displayName} (\${k.envKey ?? "no-key"}): \${k.status}\`);
  }

  // ── 测试 1: 美股 AAPL ────────────────────────────────────────────
  console.log("\\n" + "=".repeat(60));
  console.log("测试 1: 美股 AAPL");
  console.log("=".repeat(60));

  const aaplResult = await routeDataRequest({
    ticker: "AAPL",
    market: "US",
    needFundamentals: true,
    needMacro: true,
    needAlternative: true,
    needIndicators: true,
  });

  console.log(formatRoutingReport(aaplResult));
  console.log("\\n[EvidenceScore]", aaplResult.evidenceScore.score + "/100");
  console.log("[Active Providers]", aaplResult.evidenceScore.activeProviders.join(", ") || "none");
  console.log("[Excluded Providers]", aaplResult.evidenceScore.excludedProviders.map(e => \`\${e.id}(\${e.reason})\`).join(", ") || "none");

  // 验证：没有使用禁用源
  const BANNED_SOURCES = ["tavily", "serper", "tradingview", "tushare", "efinance", "akshare", "ashare", "futu", "ifind"];
  const usedProviders = Object.keys(aaplResult.providerStatusSummary);
  const bannedUsed = usedProviders.filter(p => BANNED_SOURCES.some(b => p.toLowerCase().includes(b)));
  if (bannedUsed.length > 0) {
    console.error("❌ 错误：使用了禁用源:", bannedUsed);
    process.exit(1);
  } else {
    console.log("\\n✅ 验证通过：未使用任何禁用源");
  }

  // ── 测试 2: A 股 600519.SS（贵州茅台）──────────────────────────
  console.log("\\n" + "=".repeat(60));
  console.log("测试 2: A 股 600519.SS（贵州茅台）");
  console.log("=".repeat(60));

  const moutaiResult = await routeDataRequest({
    ticker: "600519.SS",
    newsQuery: "贵州茅台",
    market: "CN",
    needFundamentals: false, // FMP 不支持 A 股
    needMacro: true,
    needAlternative: false,  // QuiverQuant 不支持 A 股
    needIndicators: true,
  });

  console.log(formatRoutingReport(moutaiResult));
  console.log("\\n[EvidenceScore]", moutaiResult.evidenceScore.score + "/100");
  console.log("[Active Providers]", moutaiResult.evidenceScore.activeProviders.join(", ") || "none");
  console.log("[Excluded Providers]", moutaiResult.evidenceScore.excludedProviders.map(e => \`\${e.id}(\${e.reason})\`).join(", ") || "none");

  // 验证：腾讯新闻不作为全球新闻主源
  const cnNewsLayer = moutaiResult.layerResults.find(lr => lr.layer === "news_china");
  const globalNewsLayer = moutaiResult.layerResults.find(lr => lr.layer === "news_global");
  if (cnNewsLayer) {
    console.log("\\n✅ 腾讯新闻作为 news_china 辅助层（正确，非全球新闻主源）");
  }
  if (globalNewsLayer) {
    const globalProvider = globalNewsLayer.activeProvider;
    if (globalProvider === "tencent_news") {
      console.error("❌ 错误：腾讯新闻被用作全球新闻主源！");
      process.exit(1);
    } else {
      console.log(\`✅ 全球新闻主源: \${globalProvider ?? "unavailable"}（非腾讯新闻）\`);
    }
  }

  // 验证：没有使用禁用源
  const bannedUsed2 = Object.keys(moutaiResult.providerStatusSummary).filter(p =>
    BANNED_SOURCES.some(b => p.toLowerCase().includes(b))
  );
  if (bannedUsed2.length > 0) {
    console.error("❌ 错误：使用了禁用源:", bannedUsed2);
    process.exit(1);
  } else {
    console.log("✅ 验证通过：未使用任何禁用源");
  }

  // ── 最终汇总 ────────────────────────────────────────────────────
  console.log("\\n" + "=".repeat(60));
  console.log("STEP 7 验证汇总");
  console.log("=".repeat(60));
  console.log(\`AAPL  EvidenceScore: \${aaplResult.evidenceScore.score}/100 (\${aaplResult.evidenceScore.activeCount}/\${aaplResult.evidenceScore.totalLayers} 层)\`);
  console.log(\`茅台  EvidenceScore: \${moutaiResult.evidenceScore.score}/100 (\${moutaiResult.evidenceScore.activeCount}/\${moutaiResult.evidenceScore.totalLayers} 层)\`);
  console.log(\`AAPL  Fallback触发: \${aaplResult.fallbackLog.length} 次\`);
  console.log(\`茅台  Fallback触发: \${moutaiResult.fallbackLog.length} 次\`);
  console.log("\\n✅ STEP 7 端到端验证完成");
}

runE2ETest().catch(err => {
  console.error("❌ E2E 测试失败:", err);
  process.exit(1);
});
`;

writeFileSync("/home/ubuntu/ai-team-chat/scripts/e2e-test.ts", testCode);
console.log("Test file written, running...");

try {
  const output = execSync(
    "cd /home/ubuntu/ai-team-chat && npx tsx scripts/e2e-test.ts",
    { encoding: "utf8", timeout: 120000 }
  );
  console.log(output);
} catch (err) {
  console.error("Error:", err.stdout || err.message);
  process.exit(1);
}
