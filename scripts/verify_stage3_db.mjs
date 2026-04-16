/**
 * Phase 4C Stage 3 — 直接 TiDB 查询验证
 * 不需要服务器运行，只需 DATABASE_URL 环境变量
 * 用法: DATABASE_URL=mysql://user:pass@host:port/db node scripts/verify_stage3_db.mjs
 *
 * 验证项目:
 *   G1 — metadata.structured_analysis 顶层字段存在
 *   G2 — metadata.answerObject.structured_analysis 存在
 *   G3 — 全部 5 个子字段非空
 */
import mysql from "mysql2/promise";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL 未设置");
  process.exit(1);
}

// Phase 4C Stage 3 代码推送时间戳（2be1a7d commit: 2026-04-16）
// 查询该时间点之后的 assistant 消息
const AFTER_TS = "2026-04-16 00:00:00";

// 目标 convIds（已知含 AAPL/NVDA/TSLA 等分析）
const TARGET_CONV_IDS = [990007, 990009, 1020001, 1020002, 990012];

console.log("\n═══════════════════════════════════════════════════════");
console.log("  Phase 4C Stage 3 — TiDB 直接查询验证");
console.log("  验证: structured_analysis 是否流入 metadata DB");
console.log("═══════════════════════════════════════════════════════\n");

const conn = await mysql.createConnection(DATABASE_URL);

try {
  // 1. 查询 Stage 3 commit 之后的最新 assistant 消息
  const placeholders = TARGET_CONV_IDS.map(() => "?").join(",");
  const [rows] = await conn.execute(
    `SELECT id, conversationId, metadata, createdAt
     FROM messages
     WHERE role = 'assistant'
       AND conversationId IN (${placeholders})
       AND createdAt > ?
     ORDER BY createdAt DESC
     LIMIT 10`,
    [...TARGET_CONV_IDS, AFTER_TS]
  );

  console.log(`查询到 ${rows.length} 条 Stage 3 之后的 assistant 消息\n`);

  if (rows.length === 0) {
    console.log("⚠ 没有找到 Stage 3 之后的消息。可能需要先跑一次分析。");
    console.log("  请运行: JWT_SECRET=$JWT_SECRET VITE_APP_ID=$VITE_APP_ID node verify_phase4c_stage3.mjs");
    await conn.end();
    process.exit(2);
  }

  // 2. 逐条检查 structured_analysis
  let pass_g1 = 0, pass_g2 = 0, pass_g3 = 0, total_with_ao = 0;
  const SUBFIELDS = ["primary_bull","primary_bear","primary_risk_condition","confidence_summary","stance_rationale"];

  for (const row of rows) {
    const meta = typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata;
    if (!meta?.answerObject) continue;
    total_with_ao++;

    const sa_top = meta.structured_analysis;
    const sa_ao = meta.answerObject?.structured_analysis;

    if (sa_top) pass_g1++;
    if (sa_ao) pass_g2++;

    const g3 = sa_top && SUBFIELDS.every(f => typeof sa_top[f] === "string" && sa_top[f].trim().length > 0);
    if (g3) pass_g3++;

    // 打印每条结果摘要
    const convId = row.conversationId;
    const ts = row.createdAt.toISOString?.().slice(0,19) ?? row.createdAt;
    const verdict = meta.answerObject?.verdict?.slice(0,40) ?? "—";
    console.log(`  msgId=${row.id} conv=${convId} [${ts}]`);
    console.log(`    verdict: "${verdict}"`);
    console.log(`    G1 structured_analysis(top): ${sa_top ? "✓" : "✗"}`);
    console.log(`    G2 structured_analysis(answerObject): ${sa_ao ? "✓" : "✗"}`);
    if (sa_top) {
      console.log(`    G3 subfields: ${SUBFIELDS.map(f => sa_top[f] ? "✓" : "✗").join(" ")}`);
      if (sa_top.primary_bull) console.log(`       primary_bull: "${sa_top.primary_bull.slice(0,50)}"`);
      if (sa_top.stance_rationale) console.log(`       stance: "${sa_top.stance_rationale.slice(0,50)}"`);
    }
    console.log();
  }

  // 3. 最终判定
  console.log("───────────────────────────────────────────────────────");
  console.log(`  消息总数(含answerObject): ${total_with_ao}`);
  console.log(`  G1 pass: ${pass_g1}/${total_with_ao}`);
  console.log(`  G2 pass: ${pass_g2}/${total_with_ao}`);
  console.log(`  G3 pass: ${pass_g3}/${total_with_ao}`);
  console.log("───────────────────────────────────────────────────────");

  const FINAL = total_with_ao > 0 && pass_g1 === total_with_ao && pass_g2 === total_with_ao && pass_g3 === total_with_ao;
  console.log(`\n  FINAL: ${FINAL ? "PASS ✓ — structured_analysis 已写入 DB" : pass_g1 > 0 ? "PARTIAL — 部分消息包含 structured_analysis" : "FAIL ✗ — 无消息包含 structured_analysis"}`);
  console.log("═══════════════════════════════════════════════════════\n");

  await conn.end();
  process.exit(FINAL ? 0 : 1);

} catch (err) {
  console.error("DB 查询错误:", err.message);
  await conn.end();
  process.exit(1);
}
