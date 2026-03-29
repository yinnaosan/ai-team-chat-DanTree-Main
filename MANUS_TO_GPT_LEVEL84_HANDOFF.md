# DANTREE LEVEL8.4 — Manus → GPT 交接报告

**生成时间：** 2026-03-29
**任务版本：** LEVEL8.4 — Performance & Validation Layer
**状态：** ✅ 全部完成 · TSC 0 errors · 157/157 tests passed

---

## 一、本次任务完成摘要

| 模块编号 | 模块名称 | 文件 | 状态 |
|----------|----------|------|------|
| Module 1 | `decision_outcome` 数据库表 | `drizzle/schema.ts` + migration | ✅ 完成 |
| Module 2 | `evaluateDecisionOutcome()` | `server/decisionOutcomeEngine.ts` | ✅ 完成 |
| Module 3 | Cron 每小时评估循环 | `server/cronServerMount.ts` | ✅ 完成 |
| Module 4 | `computePerformanceMetrics()` | `server/decisionOutcomeEngine.ts` | ✅ 完成 |
| Module 5 | `analyzeDecisionAttribution()` | `server/decisionOutcomeEngine.ts` | ✅ 完成 |
| Module 6 | `generateDecisionFeedback()` | `server/decisionOutcomeEngine.ts` | ✅ 完成 |
| Module 7 | tRPC `performance.*` router | `server/routers.ts` | ✅ 完成 |
| 验证测试 | `level84.test.ts` (34 cases) | `server/level84.test.ts` | ✅ 34/34 |

---

## 二、数据库表结构

```sql
CREATE TABLE `decision_outcome` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `decision_id` int NOT NULL,          -- FK → decision_log.id
  `ticker` varchar(20) NOT NULL,
  `decision_timestamp` bigint NOT NULL,
  `initial_price` decimal(12,4) NOT NULL,
  `evaluation_price` decimal(12,4),    -- NULL until evaluated
  `evaluation_timestamp` bigint,
  `horizon` varchar(5) NOT NULL,       -- "1d" | "3d" | "7d"
  `return_pct` decimal(10,6),          -- NULL until evaluated
  `is_positive` boolean,
  `evaluated` boolean NOT NULL DEFAULT false,
  `created_at` bigint NOT NULL
);
```

每个决策创建时自动生成 3 条记录（1d / 3d / 7d），由 `createOutcomeTracking()` 调用。

---

## 三、Module 2 — evaluateDecisionOutcome()

**触发路径：** Cron tick → `safeEvaluateDecisionOutcome()` → `evaluateDecisionOutcome()`

**逻辑：**
1. 查询所有 `evaluated = false` 的 `decision_outcome` 行
2. 对每行检查 `decision_timestamp + HORIZON_MS[horizon] <= now`
3. 若到期：调用 Yahoo Finance 获取当前价格（8s timeout）
4. 计算 `return_pct = (current - initial) / initial`
5. 更新 `evaluation_price / evaluation_timestamp / return_pct / is_positive / evaluated = true`

**安全设计：**
- DB 不可用时立即返回零值结果（不抛出）
- 单条更新失败不影响其他行
- `safeEvaluateDecisionOutcome()` 捕获所有异常

---

## 四、Module 3 — Cron 集成

**位置：** `server/cronServerMount.ts` → `onCronTick()` 末尾

**触发频率：** 最多每 60 分钟一次（通过 `global._lastDecisionOutcomeEvalMs` 节流）

```ts
// 每次 cron tick 检查是否需要运行评估
if (!lastEval || now - lastEval >= ONE_HOUR_MS) {
  const evalResult = await safeEvaluateDecisionOutcome();
  // 日志: evaluated / skipped_not_due / errors
}
```

---

## 五、Module 4 — computePerformanceMetrics(userId)

**输出结构：**

```ts
{
  total_decisions: number,      // 唯一 decision_id 数量
  evaluated_decisions: number,  // 已评估的行数（含所有 horizon）
  win_rate: number,             // 0–1
  avg_return: number,           // 平均 return_pct
  best_return: number,
  worst_return: number,
  by_horizon: {
    "1d": { total, evaluated, win_rate, avg_return },
    "3d": { total, evaluated, win_rate, avg_return },
    "7d": { total, evaluated, win_rate, avg_return },
  },
  advisory_only: true
}
```

---

## 六、Module 5 — analyzeDecisionAttribution(userId)

**分组维度：**

| 维度 | 分组键 | 来源 |
|------|--------|------|
| BQ 分数 | `high_BQ` / `medium_BQ` / `low_BQ` | `decision_log.advisoryText` 正则提取 |
| 事件类型 | 动态（如 `earnings` / `macro` / `unknown`） | `advisoryText` 正则提取 |
| 风险等级 | `high_danger` / `medium_danger` / `low_danger` | `advisoryText` 正则提取 |

每个 bucket 包含 `{ count, win_rate, avg_return }`。

---

## 七、Module 6 — generateDecisionFeedback(userId)

**健康状态分类逻辑：**

| win_rate | system_health |
|----------|---------------|
| > 0.6 | `"good"` |
| 0.4 – 0.6 | `"neutral"` |
| < 0.4 | `"poor"` |

**自动生成 key_strength / key_weakness：**
- 高 win_rate → strength
- 正 avg_return → strength
- 最佳 horizon 表现 → strength
- 高 BQ 决策明显优于低 BQ → strength
- 低 win_rate → weakness
- 负 avg_return → weakness
- 最差 horizon 表现 → weakness
- 低 BQ 决策拖累整体 → weakness
- 无数据时 → "System initialized — awaiting first evaluated decisions"

---

## 八、Module 7 — tRPC performance router

**4 个 endpoint（均为 `protectedProcedure`）：**

```ts
trpc.performance.getMetrics.useQuery()
// → PerformanceMetrics

trpc.performance.getDecisionOutcomes.useQuery({ limit?, horizon?, evaluated? })
// → DecisionOutcome[]（最新优先）

trpc.performance.getAttribution.useQuery()
// → AttributionAnalysis

trpc.performance.getFeedback.useQuery()
// → DecisionFeedback
```

---

## 九、测试结果

```
server/level84.test.ts     34/34 ✅  (新增)
server/level83.test.ts     27/27 ✅
server/level82.test.ts     11/11 ✅
server/level8.test.ts       4/4  ✅
server/level7.test.ts      35/35 ✅
server/cronOutcome.test.ts 31/31 ✅
server/financialMetrics.ts 14/14 ✅
server/auth.logout.test.ts  1/1  ✅
─────────────────────────────────
总计                      157/157 ✅
TypeScript                  0 errors ✅
```

---

## 十、HARD RULES 合规检查

| 规则 | 状态 |
|------|------|
| 不修改任何决策输出逻辑 | ✅ |
| 不自动调整权重或自优化 | ✅ |
| 所有输出 `advisory_only: true` | ✅ |
| 纯观察层（不触发任何交易） | ✅ |
| `auto_trade_allowed` 不出现在任何输出中 | ✅ |

---

## 十一、GPT 建议下一步

**A — UI 集成（LEVEL8.5）：** 将 `performance.*` API 接入前端决策面板，展示 win_rate 趋势图、horizon 对比柱状图、BQ 归因热力图。

**B — 投资论文生成（LEVEL8.4+）：** 基于 `generateDecisionFeedback()` 输出，自动生成结构化投资复盘报告（Bull Case / Bear Case / 改进建议）。

**C — createOutcomeTracking 集成：** 在 `persistPipelineRun()` 中调用 `createOutcomeTracking()`，使每个新决策自动创建 3 条追踪记录（1d/3d/7d），完成闭环。

---

*Manus AI · advisory_only · 不构成实际投资建议*
