/**
 * 窄验证脚本 — Patch A/B 验证
 * 验证以下两点：
 * 1. Patch B: danTreeSystem catch 块返回 guardStatus="critical"（而非 "healthy"）
 * 2. Patch A: 当 agent 成功数 < ceil(activeRoles.length/2) 时，
 *    - analysisSucceeded = false
 *    - directorSummary = ""（空字符串，触发 DIRECT_ANALYSIS 降级）
 *    - agents = []（空数组，防止污染 taxonomy）
 */

import { readFileSync } from "fs";

// ─── 验证 Patch B ───────────────────────────────────────────────────────────
console.log("\n=== Patch B 验证：danTreeSystem.ts catch 块 guardStatus ===");

const danTreeContent = readFileSync("server/danTreeSystem.ts", "utf-8");
const catchBlock = danTreeContent.slice(
  danTreeContent.indexOf("} catch (err) {"),
  danTreeContent.indexOf("} catch (err) {") + 600
);

const hasCritical = catchBlock.includes('guardStatus: "critical"');
const hasHealthy = catchBlock.includes('guardStatus: "healthy"');

console.log(`  catch 块包含 guardStatus: "critical" → ${hasCritical ? "✅ PASS" : "❌ FAIL"}`);
console.log(`  catch 块不含 guardStatus: "healthy"  → ${!hasHealthy ? "✅ PASS" : "❌ FAIL"}`);

if (!hasCritical || hasHealthy) {
  console.error("  [Patch B] FAILED");
  process.exit(1);
}
console.log("  [Patch B] PASSED\n");

// ─── 验证 Patch A ───────────────────────────────────────────────────────────
console.log("=== Patch A 验证：multiAgentAnalysis.ts 门控逻辑 ===");

const maContent = readFileSync("server/multiAgentAnalysis.ts", "utf-8");

// 1. FALLBACK_VERDICT 常量存在
const hasFallbackConst = maContent.includes('const FALLBACK_VERDICT = "分析失败（数据不足或 API 错误）"');
console.log(`  FALLBACK_VERDICT 常量定义存在       → ${hasFallbackConst ? "✅ PASS" : "❌ FAIL"}`);

// 2. isAgentFallback 函数存在
const hasIsAgentFallback = maContent.includes("function isAgentFallback(agent: AgentAnalysis): boolean");
console.log(`  isAgentFallback() 函数定义存在      → ${hasIsAgentFallback ? "✅ PASS" : "❌ FAIL"}`);

// 3. 门控逻辑：successfulAgents + requiredSuccessCount
const hasGate = maContent.includes("const successfulAgents = agents.filter(a => !isAgentFallback(a))");
const hasRequired = maContent.includes("const requiredSuccessCount = Math.ceil(activeRoles.length / 2)");
console.log(`  successfulAgents 过滤逻辑存在       → ${hasGate ? "✅ PASS" : "❌ FAIL"}`);
console.log(`  requiredSuccessCount = ceil(n/2)    → ${hasRequired ? "✅ PASS" : "❌ FAIL"}`);

// 4. 门控阻断时返回空 agents 和空 directorSummary
const hasEmptyAgents = maContent.includes("agents: [],            // 空数组：防止 agentTaxonomyNormalizer 产出错误分类");
const hasEmptyDirector = maContent.includes('directorSummary: "",   // 空字符串：防止注入 Step3 提示词');
console.log(`  门控阻断时 agents: []               → ${hasEmptyAgents ? "✅ PASS" : "❌ FAIL"}`);
console.log(`  门控阻断时 directorSummary: ""      → ${hasEmptyDirector ? "✅ PASS" : "❌ FAIL"}`);

// 5. 门控阻断时 analysisSucceeded: false
const hasSucceededFalse = maContent.includes("analysisSucceeded: false,");
console.log(`  门控阻断时 analysisSucceeded: false → ${hasSucceededFalse ? "✅ PASS" : "❌ FAIL"}`);

// 6. 正常路径时 analysisSucceeded: true
const hasSucceededTrue = maContent.includes("analysisSucceeded: true,");
console.log(`  正常路径时 analysisSucceeded: true  → ${hasSucceededTrue ? "✅ PASS" : "❌ FAIL"}`);

// 7. MultiAgentResult 接口包含三个新字段
const hasInterfaceFields = 
  maContent.includes("analysisSucceeded: boolean;") &&
  maContent.includes("successfulAgentCount: number;") &&
  maContent.includes("requiredAgentCount: number;");
console.log(`  MultiAgentResult 接口含三个新字段   → ${hasInterfaceFields ? "✅ PASS" : "❌ FAIL"}`);

// 8. 验证 DIRECT_ANALYSIS 降级路径（routers.ts 中的 falsy 判断）
const routersContent = readFileSync("server/routers.ts", "utf-8");
const hasDirectAnalysisFallback = routersContent.includes('"[DIRECT_ANALYSIS: 直接基于 MANUS_DATA_REPORT 分析]"');
const hasFalsyCheck = routersContent.includes("const phaseABlock = multiAgentBlock");
console.log(`  routers.ts 含 DIRECT_ANALYSIS 降级 → ${hasDirectAnalysisFallback ? "✅ PASS" : "❌ FAIL"}`);
console.log(`  routers.ts 含 multiAgentBlock falsy → ${hasFalsyCheck ? "✅ PASS" : "❌ FAIL"}`);

const allPassed = hasFallbackConst && hasIsAgentFallback && hasGate && hasRequired &&
  hasEmptyAgents && hasEmptyDirector && hasSucceededFalse && hasSucceededTrue &&
  hasInterfaceFields && hasDirectAnalysisFallback && hasFalsyCheck && hasCritical && !hasHealthy;

console.log(`\n${"─".repeat(60)}`);
console.log(`  [Patch A/B] 总体结果: ${allPassed ? "✅ ALL PASSED" : "❌ SOME FAILED"}`);
console.log(`${"─".repeat(60)}\n`);

if (!allPassed) process.exit(1);
