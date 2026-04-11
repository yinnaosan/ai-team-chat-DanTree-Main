# Regression Baseline Report
**TASK_REF:** MANUS_NON_JIN10_PREP_V1  
**Date:** 2026-04-11  
**Baseline captured after:** OI-001-B rpa.ts migration

---

## 总体结果

| 指标 | 数值 |
|------|------|
| Test Files | 6 failed / 93 passed / 99 total |
| Tests | 42 failed / 2043 passed / 2085 total |
| TSC | 0 errors |
| Duration | ~28s |

---

## 失败文件清单

| 文件 | 失败数 | 根因分类 |
|------|--------|----------|
| `server/chat.test.ts` | 16 | PRE-EXISTING: `checkUserActivated` mock 缺失 |
| `server/model_router.test.ts` | 6 | PRE-EXISTING: PRODUCTION_ROUTING_MAP 路由期望 vs 实际不符 |
| `server/access.test.ts` | 7 | PRE-EXISTING: `checkUserActivated` mock 缺失 + `access.listCodes`/`revokeCode` 路由不存在 |
| `server/dataSourceRegistry.test.ts` | 6 | PRE-EXISTING: 注册表 ID 数量期望 vs 实际不符 |
| `server/llmProviders.test.ts` | 1 | PRE-EXISTING: `recommendModel("agentic_tasks")` 期望 `gpt-5.4`，实际返回 `claude-sonnet-4-6` |
| `server/financeDatabaseApi.test.ts` | 6 | PRE-EXISTING: FinanceDatabase API 返回空数据（外部依赖） |

---

## 各文件失败详情

### 1. server/chat.test.ts（16 failures）

**根因：** `vi.mock("./db")` 未导出 `checkUserActivated`，导致所有需要 `requireAccess` 的 procedure 调用失败。

```
[vitest] No "checkUserActivated" export is defined on the "./db" mock.
```

**影响范围：** `chat.getMessages`、`chat.submitTask`、`chat.getTasks`、`rpa.*`、`dbConnect.*`、`conversation.*` 等 16 个测试。

**与 rpa.ts 迁移的关系：** 无关。`chat.test.ts` 通过 `vi.mock("./rpa")` 完整替换 rpa 模块，不依赖 `callOpenAI` 内部实现。这些失败是 `db.ts` mock 不完整的问题，与本次迁移无关。

**修复方向（供 GPT 参考）：** 在 `chat.test.ts` 的 `vi.mock("./db", ...)` 中补充 `checkUserActivated: vi.fn().mockResolvedValue(true)` 导出。

---

### 2. server/model_router.test.ts（6 failures）

**根因：** 测试期望 `PRODUCTION_ROUTING_MAP` 中 `research`、`narrative`、`summarization` 路由到 `anthropic`，但实际路由到 `openai`。

```
AssertionError: expected 'openai' to be 'anthropic'
```

**失败测试：**
- `TC-MR-01`: `should throw on invalid task_type string` — modelRouter 在开发态不验证 task_type（fallback 到 `default`），测试期望抛出 `Invalid task_type`
- `TC-MR-01`: `should throw on empty string task_type` — 同上
- `TC-MR-04`: `should route research to anthropic in production` — PRODUCTION_ROUTING_MAP.research = "openai"，期望 "anthropic"
- `TC-MR-04`: `should route narrative to anthropic in production` — 同上
- `TC-MR-04`: `should route summarization to anthropic in production` — 同上
- `TC-MR-04`: `routingFor() should return correct provider/model in production` — 同上

**与 rpa.ts 迁移的关系：** 无关。这些是 `model_router.ts` 的 PRODUCTION_ROUTING_MAP 配置与测试期望不一致，是 OI-001 系列的待解决项。

**修复方向（供 GPT 参考）：** 需要确认 OI-001 的最终决策：`research`/`narrative`/`summarization` 是否应路由到 `anthropic`，若是则修改 `PRODUCTION_ROUTING_MAP`；若否则修改测试期望。

---

### 3. server/access.test.ts（7 failures）

**根因：** 混合两类问题：
1. `checkUserActivated` mock 缺失（同 chat.test.ts）
2. `access.listCodes`、`access.revokeCode` 在 `appRouter` 中不存在（`TRPCError: No procedure found on path "access,listCodes"`）

**与 rpa.ts 迁移的关系：** 无关。

---

### 4. server/dataSourceRegistry.test.ts（6 failures）

**根因：** 注册表 ID 数量期望 35，实际 34（缺少 1 个 ID）；`buildCitationSummary` 的 `latencyMs=-1` 跳过逻辑、`hasEvidenceToBasis` 逻辑、`sourcingBlock` 日期格式、`citationToApiSources` 返回条目数量均与测试期望不符。

```
expected 34 to be 35 // Object.is equality
expected '[SOURCE_GATING|CRITICAL]...' to contain '2026'
```

**与 rpa.ts 迁移的关系：** 无关。

---

### 5. server/llmProviders.test.ts（1 failure）

**根因：** `recommendModel("agentic_tasks")` 期望返回 `gpt-5.4`，实际返回 `claude-sonnet-4-6`。

```
AssertionError: expected 'claude-sonnet-4-6' to be 'gpt-5.4'
```

**与 rpa.ts 迁移的关系：** 无关。

---

### 6. server/financeDatabaseApi.test.ts（6 failures）

**根因：** FinanceDatabase API 返回空数据（外部依赖不可用或数据为空），导致 ticker 分类、行业对标、报告格式化等测试失败。

```
expected '## 全球股票分类（FinanceDatabase）\n\n> No mo…' to contain 'Apple'
```

**与 rpa.ts 迁移的关系：** 无关。

---

## 与 OI-001-B 迁移的关联性分析

**结论：上述 42 个失败测试全部为 PRE-EXISTING failures，与本次 rpa.ts 迁移无关。**

验证依据：
1. `chat.test.ts` 通过 `vi.mock("./rpa")` 完整替换 rpa 模块，不依赖 `callOpenAI` 内部实现
2. `model_router.test.ts` 测试 `model_router.ts` 本身，与 `rpa.ts` 无依赖关系
3. `access.test.ts`、`dataSourceRegistry.test.ts`、`llmProviders.test.ts`、`financeDatabaseApi.test.ts` 均与 `rpa.ts` 无依赖关系
4. TSC 0 errors 确认迁移后类型安全

---

## 通过测试覆盖（93 files / 2043 tests）

以下文件全部通过，覆盖了 rpa.ts 迁移的关键周边模块：

| 文件 | 测试数 | 说明 |
|------|--------|------|
| `server/level12_5_semantic_surface.test.ts` | 38 | PATH-A / unifiedSemanticState 全链路 |
| `server/level12_4_semantic_activation.test.ts` | 28 | semantic activation 核心逻辑 |
| `server/semantic_aggregator.test.ts` | 32 | 语义聚合器 |
| `server/semantic_protocol.test.ts` | 42 | 语义协议 |
| `server/semantic_packet_builders.test.ts` | 29 | 语义包构建 |
| `server/level11.test.ts` | 15 | Level11 多资产引擎 |
| `server/level9.test.ts` | 24 | Level9 |
| `server/level7.test.ts` | 35 | Level7 pipeline |
| `server/level10.test.ts` | 17 | Level10 策略版本 |
| `server/e2e.test.ts` | 25 | 端到端场景 |
| `server/codeExecution.test.ts` | 20 | 代码执行 |
| `server/autoChart.test.ts` | 5 | 自动图表 |
| ... | ... | 共 93 个文件 |

---

## 下一步建议（供 GPT 决策）

| 优先级 | 文件 | 修复方向 |
|--------|------|----------|
| P1 | `server/chat.test.ts` | 补充 `checkUserActivated` mock 导出 |
| P1 | `server/access.test.ts` | 同上 + 确认 `access.listCodes`/`revokeCode` 路由是否已实现 |
| P2 | `server/model_router.test.ts` | 确认 OI-001 PRODUCTION_ROUTING_MAP 最终决策 |
| P3 | `server/dataSourceRegistry.test.ts` | 确认注册表 ID 数量（34 vs 35）和 citation 逻辑 |
| P3 | `server/llmProviders.test.ts` | 确认 `agentic_tasks` 的目标 provider |
| P4 | `server/financeDatabaseApi.test.ts` | 外部依赖问题，需要 mock 或真实 API |
