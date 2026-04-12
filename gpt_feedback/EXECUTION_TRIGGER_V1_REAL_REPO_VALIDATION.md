# EXECUTION_TRIGGER_V1 — Real Repo Validation Report

**Date:** 2026-04-12
**Checkpoint:** `1df2e468`
**Delivery Source:** EXECUTION_TRIGGER_V1_DELIVERY.docx + pasted_content_9.txt

---

## 1. 实际修改文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `server/executionTrigger.ts` | 新增 | 规则引擎 + TriggerDecision schema + observability helpers |
| `server/executionTrigger.test.ts` | 新增 | 35 个测试用例（TC-TRIGGER-01 ~ TC-TRIGGER-10） |
| `server/_core/llm.ts` | 修改 | 新增 Layer 2 import + trigger 决策 + Layer 3 observability log |

**未修改（严格限定）：**
`server/model_router.ts` / `server/routers.ts` / `server/taskTypeBridge.ts` / `server/taskTypeBridge.test.ts` / 所有数据层文件

---

## 2. 循环依赖核验

```
_core/llm.ts
  → taskTypeBridge.ts (Layer 1)
  → executionTrigger.ts (Layer 2)
      → model_router.ts (TaskType 类型)
      → taskTypeBridge.ts (TriggerContext 类型)
```

**结论：单向依赖，无循环。** TSC 0 errors 确认。

---

## 3. invokeLLMWithRetry 透传核验

`invokeLLMWithRetry` 使用 `Parameters<typeof invokeLLM>[0]` 类型，直接透传整个 `params` 对象。
`triggerContext` 字段天然透传，无需修改 `invokeLLMWithRetry`。

---

## 4. 测试结果

### executionTrigger.test.ts（新增）

| Test Suite | 通过 | 失败 |
|-----------|------|------|
| TC-TRIGGER-01: Rule A | 4/4 | 0 |
| TC-TRIGGER-02: Rule B | 5/5 | 0 |
| TC-TRIGGER-03: Rule C | 3/3 | 0 |
| TC-TRIGGER-04: Rule D | 3/3 | 0 |
| TC-TRIGGER-05: Rule E | 3/3 | 0 |
| TC-TRIGGER-06: schema | 3/3 | 0 |
| TC-TRIGGER-07: backward compat | 4/4 | 0 |
| TC-TRIGGER-08: 4 real call sites | 4/4 | 0 |
| TC-TRIGGER-09: Bridge+Trigger integration | 3/3 | 0 |
| TC-TRIGGER-10: Observability | 3/3 | 0 |
| **合计** | **35/35** | **0** |

> 注：delivery 文档预期 34 tests，实际 35（TC-TRIGGER-02 多了 1 个 empty messages 边界测试）。

### OI-001 + Bridge 回归

| 文件 | 结果 |
|------|------|
| `model_router.test.ts` | 23/23 ✅ |
| `llmProviders.test.ts` | 24/24 ✅ |
| `taskTypeBridge.test.ts` | 22/22 ✅ |
| **合计** | **69/69** ✅ |

### TSC

```
npx tsc --noEmit → 0 errors ✅
```

---

## 5. 4 个真实调用点行为验证（TC-TRIGGER-08）

| 调用点 | source | 触发结果 | 命中规则 | priority | execution_target |
|--------|--------|---------|---------|----------|-----------------|
| Step3 主分析 | `step3_main` | TRIGGER | Rule D | medium | anthropic |
| DELIVERABLE 修复 | `repair_pass` | TRIGGER | Rule C + D | high | anthropic |
| 记忆摘要 | `memory_summary` | NO TRIGGER | Rule E | low | none |
| 标题生成 | `title_gen` | NO TRIGGER | Rule E | low | none |

---

## 6. _core/llm.ts isDev branch 三层架构（落仓后）

```
isDev branch:
  ├── Layer 1: TaskType Bridge
  │     resolveBridgedTaskType(triggerContext) → resolvedTaskType
  │
  ├── Layer 2: Execution Trigger System v1
  │     decideExecutionTrigger({ triggerContext, resolvedTaskType, messages })
  │     → TriggerDecision (advisory in v1, not affecting execution path)
  │
  ├── Layer 3: Observability
  │     [TaskTypeBridge] log (when non-default)
  │     [ExecutionTrigger] log (always)
  │
  └── modelRouter.generate(routerInput, resolvedTaskType)
        ← Claude Sonnet 4.6 (dev actual executor, unchanged)
```

---

## 7. 新增 failures

**0 个新增 failures。**

---

## 8. 关键设计决策记录

### 8.1 Rule E 优先级高于 Rule A

delivery 文档中 Rule E 是"阻止规则"，优先于所有触发规则。
测试 TC-TRIGGER-05 第 3 个用例验证了这一点：
`resolvedTaskType="execution"` + `source="title_gen"` → Rule E 阻止，NOT TRIGGER。

**是否符合 GPT 设计意图？** 请确认。

### 8.2 suggested_task_type 在 Rule C 时建议 structured_json

当 Rule C（repair_pass）命中且 Rule A 未命中时，`suggested_task_type` 改为 `"structured_json"`。
这是 delivery 文档的明确要求（TC-TRIGGER-03 第 2 个用例）。

### 8.3 v1 TriggerDecision 是 advisory

研发态下，TriggerDecision 不改变实际执行路径（Claude Sonnet 4.6 处理所有请求）。
`execution_target="anthropic"` 是逻辑目标，不是当前实际路径。
v2 才会根据 TriggerDecision 实际切换执行路径。

---

## 9. 待 GPT 决策的问题

### Q1: Rule E 是否应该阻止 Rule A？

当前实现：Rule E 先检查，命中则立即返回 NOT TRIGGER，Rule A 不执行。
边界场景：`resolvedTaskType="execution"` + `source="title_gen"` → NOT TRIGGER。
这意味着：即使是 execution 类型的任务，如果通过 title_gen 路径调用，也不触发执行层。
这个行为是否正确？还是 Rule A 应该能覆盖 Rule E？

### Q2: 剩余 14 个 invokeLLM 调用点

当前 routers.ts 共 18 个 invokeLLM 调用点，TaskType Bridge v1 只覆盖了 4 个。
其余 14 个仍走 `triggerContext=undefined` → `resolvedTaskType="default"` → NO TRIGGER。
是否需要系统性补全？优先级排序？

### Q3: 生产态 TriggerDecision 使用方式

v1 TriggerDecision 是 advisory。v2 生产态切换时：
- 是否直接用 `execution_target` 决定走 Claude 还是 GPT？
- 还是需要更复杂的 provider selection 逻辑？
- `suggested_task_type` 是否应该覆盖 `resolvedTaskType` 传入 `modelRouter.generate()`？

### Q4: formatTriggerDecisionLog 输出级别

当前所有 trigger log 都用 `console.info`（包括 NO_TRIGGER 路径）。
生产态下 NO_TRIGGER 路径的 log 量会很大（每次 invokeLLM 都输出）。
是否需要：
- NO_TRIGGER → `console.debug`（生产态可关闭）
- TRIGGER → `console.info`（保留）

---

## 10. 文件路径汇总

```
server/executionTrigger.ts          ← 新增（规则引擎）
server/executionTrigger.test.ts     ← 新增（35 tests）
server/_core/llm.ts                 ← 修改（Layer 2 + 3）
gpt_feedback/EXECUTION_TRIGGER_V1_REAL_REPO_VALIDATION.md  ← 本报告
```

---

*Checkpoint: `1df2e468` | TSC: 0 errors | Tests: 35 + 69 = 104 passed, 0 failed*
