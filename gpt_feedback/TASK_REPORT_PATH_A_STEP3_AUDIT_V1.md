# PATH-A / Step3 Linkage Audit Report
**TASK_REF:** MANUS_NON_JIN10_PREP_V1  
**Date:** 2026-04-11  
**Status:** AUDIT ONLY — 现状说明，无实现修改

---

## 重要说明

本报告严格基于实际代码路径、函数签名、当前文件内容输出。无法确认的地方明确标注"无法确认"，不做猜测。

---

## 一、PATH-A 现状链路

### 1.1 触点定位

**PATH-A = level11Analysis 从 danTreeSystem.ts 注入 deepResearchEngine.ts 的路径**

| 步骤 | 文件 | 函数/位置 | 状态 |
|------|------|-----------|------|
| Step A1 | `danTreeSystem.ts:384-396` | `runLevel11Analysis()` 调用 | ✅ 已实现 |
| Step A2 | `danTreeSystem.ts:397-408` | `level11Analysis` 注入 `DeepResearchContextMap.ctx` | ✅ 已实现 |
| Step A3 | `deepResearchEngine.ts:56` | `DeepResearchContextMap.level11Analysis` 字段定义 | ✅ 已定义 |
| Step A4 | `deepResearchEngine.ts:1173-1178` | `buildSemanticActivationResult({ level11Analysis: ctx.level11Analysis })` | ✅ 已传入 |
| Step A5 | `deepResearchEngine.ts:1190-1200` | `composeResearchNarrative(..., level11Analysis)` | ✅ 已传入 |

### 1.2 断点分析

**PATH-A 当前状态：PARTIAL（功能性连通，但数据质量受限）**

断点在 Step A1：`runLevel11Analysis()` 的输入数据质量受限。

```ts
// danTreeSystem.ts:388-393
level11Analysis = runLevel11Analysis({
  assetInput: { ticker: signal.ticker, sector: (signal as any).sector ?? "technology" },
  driverContext: { ticker: signal.ticker, sector: ..., regime_tag: regimeForDR.regime_tag },
  incentiveContext: { ticker: signal.ticker },   // ← 只有 ticker，无实际 incentive 数据
  sentimentContext: { ticker: signal.ticker },   // ← 只有 ticker，无实际 sentiment 数据
});
```

`incentiveContext` 和 `sentimentContext` 仅传入 `ticker`，无实际数据填充。`level11Analysis` 的 `real_drivers` 等字段依赖这些输入，当前输出质量受限。

### 1.3 composeResearchNarrative 中的 level11Analysis 使用

`deepResearchEngine.ts:762-800`（实际代码）：当 `level11Analysis` 存在时，注入 `core_reality`、`scenario_map_summary` 等字段到叙事中。当前数据质量受限，但链路本身是通的。

---

## 二、Step3 Injection 现状链路

### 2.1 __unifiedSemanticState 生成路径

| 步骤 | 文件 | 函数/位置 | 状态 |
|------|------|-----------|------|
| Gen-1 | `deepResearchEngine.ts:1169-1186` | `buildSemanticActivationResult()` → `unifiedSemanticState` | ✅ 生成 |
| Gen-2 | `deepResearchEngine.ts:1217` | `return { ..., unifiedSemanticState }` | ✅ 挂在 DeepResearchOutput |
| Gen-3 | `danTreeSystem.ts:432-437` | `firstSemanticState` 提取 → `enrichedOutput.__unifiedSemanticState` | ✅ 挂在 pipelineOutput |

### 2.2 __unifiedSemanticState 当前未 attach 到 multiAgentResult 的原因

**当前状态：`__unifiedSemanticState` 挂在 `enrichedOutput`（即 `pipelineOutput`），而非 `multiAgentResult`。**

`multiAgentResult` 在 `routers.ts:2010-2058` 中生成，是独立的 `runMultiAgentAnalysis()` 调用结果。`danTreeSystem.ts` 的 `enrichedOutput` 是 `runDanTreeSystem()` 的返回值，两者在 `routers.ts` 中是**不同的执行路径**，没有交叉。

具体：
- `runDanTreeSystem()` 在 `routers.ts` 中的调用位置：无法确认（需要进一步搜索 routers.ts 中的 `runDanTreeSystem` 调用点）
- `multiAgentResult` 在 `routers.ts:2013` 中生成，是分析主流程的一部分
- `__unifiedSemanticState` 目前只在 `danTreeSystem.ts` 内部的 `enrichedOutput` 上存在，未传递到 `routers.ts` 的分析主流程

### 2.3 Step3 中的 semanticEnvelopeBlock（当前实现）

`routers.ts:2263-2286`：Step3 中有一个**独立的** `semanticEnvelopeBlock` 构建路径：

```ts
// routers.ts:2267-2284
const semanticResult = buildSemanticActivationResult({ entity: primaryTicker, timeframe: "mid" });
if (semanticResult.unifiedState) {
  const env = buildSynthesisSemanticEnvelope(semanticResult.unifiedState);
  semanticEnvelopeBlock = [...].join("\n");
}
```

**关键发现：** 这个路径**不使用** `level11Analysis`，直接用 `entity` 和 `timeframe` 构建语义状态。这意味着 Step3 注入的语义状态是"entity-only fallback"，不包含 PATH-A 传入的 `level11Analysis` 数据。

`routers.ts:2313`：`semanticEnvelopeBlock` 已注入 Step3 prompt：
```ts
${semanticEnvelopeBlock ? '\n' + semanticEnvelopeBlock : ''}
```

**结论：Step3 injection 当前状态 = WIRED but INACTIVE（语义状态注入已接线，但未使用 level11Analysis 数据）**

---

## 三、OI-L12-003-B 断点定位

**OI-L12-003-B：Attach `__unifiedSemanticState` to `multiAgentResult` so Step3 injection activates。**

当前断点：
1. `danTreeSystem.ts` 中的 `enrichedOutput.__unifiedSemanticState` 未传递到 `routers.ts` 的分析主流程
2. `routers.ts` 中的 `multiAgentResult` 未接收 `__unifiedSemanticState`
3. `routers.ts:2267` 的 `buildSemanticActivationResult` 调用不使用 `level11Analysis`

**未来 Level12.4 的真实改动点（仅列出，不实现）：**

| 文件 | 改动点 | 说明 |
|------|--------|------|
| `routers.ts` | `semanticEnvelopeBlock` 构建处（约第 2267 行） | 改为使用含 `level11Analysis` 的 `unifiedSemanticState` |
| `routers.ts` | `multiAgentResult` 生成后 | 调用 `attachUnifiedSemanticState()` 挂载语义状态 |
| `danTreeSystem.ts` | `enrichedOutput` 返回路径 | 确认 `__unifiedSemanticState` 能传递到 `routers.ts` 调用方 |

---

## 四、相关工具函数现状

`level12_4_semantic_activation.ts` 已提供 `attachUnifiedSemanticState()` 函数（第 353-358 行），可安全挂载 `__unifiedSemanticState` 到任意对象。该函数已就绪，等待 Level12.4 实现时调用。

---

## 五、总结

| 项目 | 当前状态 | 说明 |
|------|----------|------|
| PATH-A 连通性 | PARTIAL | 链路通，但 incentiveContext/sentimentContext 数据质量受限 |
| Step3 semanticEnvelopeBlock | WIRED | 已注入 Step3 prompt，但使用 entity-only fallback |
| `__unifiedSemanticState` → `multiAgentResult` | NOT ATTACHED | OI-L12-003-B 的核心断点 |
| `attachUnifiedSemanticState()` 工具 | READY | 已实现，等待 Level12.4 调用 |
