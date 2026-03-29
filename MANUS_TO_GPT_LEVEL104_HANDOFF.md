# MANUS → GPT 交接报告：LEVEL10.4 Experience Persistence & Learning Layer

**日期：** 2026-03-29  
**版本：** LEVEL10.4  
**状态：** ✅ 全部完成 | TSC 0 errors | 12/12 新测试通过 | 1326/1332 回归测试通过（6个预存失败与本次无关）

---

## 一、任务概述

LEVEL10.4 在 LEVEL10.3-C（Experience Layer 实时快照）的基础上，新增了**历史经验学习层**：从 `decision_log` 表中读取历史决策记录，分析跨周期的 drift 趋势、confidence 轨迹和行为模式演变，并将学习洞察注入研究叙事和决策回放。

---

## 二、完成的核心变更

### 1. `server/experienceLearningEngine.ts`（新建文件）

| 函数 | 功能 |
|------|------|
| `getExperienceHistory(ticker)` | 从 `decision_log` 读取历史 `experience_context_json`，返回 `ExperienceHistoryRecord[]` |
| `analyzeThesisDriftHistory(history)` | 分析 drift 方向分布、连续 streak、主导趋势 |
| `analyzeConfidenceTrajectory(history)` | 线性回归检测 confidence 趋势（uptrend/downtrend/volatile/flat） |
| `analyzeBehaviorEvolution(history)` | 管理层行为 + 市场行为的跨周期演变分析 |
| `generateExperienceInsight(drift, confidence, behavior)` | 综合三维分析，输出 meta_insight + learning_signal + recommended_adjustment |
| `buildExperienceHistorySummary(ticker)` | 主入口：组合以上所有分析，返回 `ExperienceHistorySummary` |

**关键设计原则：**
- 所有输出均包含 `advisory_only: true`
- `getExperienceHistory` 在 DB 不可用时返回空数组（非阻塞）
- `buildExperienceHistorySummary` 在 `record_count === 0` 时返回空摘要

### 2. `server/deepResearchEngine.ts`（升级）

**变更点：**

| 变更 | 说明 |
|------|------|
| 新增 import | `buildExperienceHistorySummary, ExperienceHistorySummary` from `./experienceLearningEngine` |
| `ResearchNarrativeOutput.narrative` | 新增 `experience_learning_insight?: string` 字段 |
| `composeResearchNarrative()` | 新增第 8 个参数 `experienceLearningInsightText?`，注入 Section 8 |
| `runDeepResearch()` | 升级为 `async`，集成 `buildExperienceHistorySummary`（非阻塞 try/catch） |
| `DeepResearchOutput` | 新增 `experience_history?: ExperienceHistorySummaryEmbed` 字段 |

**非阻塞设计：** experience history 失败不影响主流水线，`experience_history` 字段为可选。

### 3. `server/portfolioPersistence.ts`（升级）

**变更点：**

| 变更 | 说明 |
|------|------|
| `ReplayResult` 接口 | 新增 `experience_context` 字段（8个子字段，全部可为 null） |
| `replayDecision()` | 从 `decisions[0].experienceContextJson` 解析并返回 `experience_context` |

**`experience_context` 字段结构：**
```ts
experience_context: {
  drift_direction: string | null;
  drift_intensity: number | null;
  confidence_level: number | null;
  confidence_trend: string | null;
  management_behavior: string | null;
  market_behavior: string | null;
  gradient_risk_state: string | null;
  gradient_risk_score: number | null;
} | null
```

### 4. `server/danTreeSystem.ts`（修复）

- `deepResearchMap.set(signal.ticker, await runDeepResearch(ctx))` — 修复 async 调用

### 5. `server/level104.test.ts`（新建）

**4 个测试 describe，12 个 it 用例：**

| 测试 | 覆盖内容 |
|------|----------|
| TC-L104-01 | `analyzeThesisDriftHistory`：空历史、持续弱化、持续强化 |
| TC-L104-02 | `analyzeConfidenceTrajectory`：不足记录、下降趋势、上升趋势 |
| TC-L104-03 | `generateExperienceInsight`：无信号、弱化+置信度下降的组合信号 |
| TC-L104-04 | `runDeepResearch` async：Promise 验证、向后兼容、experience_history 可选、非阻塞 |

### 6. 回归修复：level103/103b/103c.test.ts

- 使用 Python 脚本批量将 `runDeepResearch(ctx)` 改为 `await runDeepResearch(ctx)`
- 对应 `it()` 改为 `it("...", async () => {`
- 44 个测试全部通过

---

## 三、数据流图

```
decision_log (DB)
    │
    ▼
getExperienceHistory(ticker)
    │ ExperienceHistoryRecord[]
    ▼
analyzeThesisDriftHistory()  ──→  DriftHistoryAnalysis
analyzeConfidenceTrajectory() ──→ ConfidenceTrajectory
analyzeBehaviorEvolution()   ──→  BehaviorEvolution
    │
    ▼
generateExperienceInsight()  ──→  ExperienceMetaInsight
    │
    ▼
buildExperienceHistorySummary()  ──→  ExperienceHistorySummary
    │
    ├──→ runDeepResearch() [async]
    │       ├── experience_history (embed in DeepResearchOutput)
    │       └── experience_learning_insight (inject into narrative)
    │
    └──→ replayDecision()
             └── experience_context (in ReplayResult)
```

---

## 四、接口变更速查

### `DeepResearchOutput`（新增字段）
```ts
experience_history?: {
  record_count: number;
  dominant_drift_trend: "strengthening" | "weakening" | "mixed";
  confidence_trend: "uptrend" | "downtrend" | "volatile" | "flat";
  pattern_consistency: number;
  meta_insight: string;
  recommended_adjustment: string;
  advisory_only: true;
}
```

### `ResearchNarrativeOutput.narrative`（新增字段）
```ts
experience_learning_insight?: string;
// 格式: "[Experience Learning — N historical records] {meta_insight} Recommended adjustment: {recommended_adjustment}"
```

### `ReplayResult`（新增字段）
```ts
experience_context: {
  drift_direction: string | null;
  drift_intensity: number | null;
  confidence_level: number | null;
  confidence_trend: string | null;
  management_behavior: string | null;
  market_behavior: string | null;
  gradient_risk_state: string | null;
  gradient_risk_score: number | null;
} | null
```

---

## 五、测试结果

| 测试文件 | 通过 | 失败 | 备注 |
|----------|------|------|------|
| level104.test.ts | 12 | 0 | 新增 LEVEL10.4 测试 |
| level103.test.ts | 15 | 0 | 修复 async 调用 |
| level103b.test.ts | 18 | 0 | 修复 async 调用 |
| level103c.test.ts | 11 | 0 | 修复 async 调用 |
| 其余 69 个文件 | 1270 | 0 | 全部通过 |
| financeDatabaseApi.test.ts | 4 | 6 | **预存失败**（Python 子进程依赖，与 LEVEL10.4 无关） |
| **合计** | **1326** | **6** | 6个预存失败不影响本次验收 |

**TSC 编译：0 errors ✅**

---

## 六、合规性检查

- [x] `advisory_only: true` 在所有新输出中强制存在
- [x] 无 `auto_trade_allowed` 字段
- [x] Experience Learning 层为**非阻塞**（DB 失败不影响主流水线）
- [x] 无硬编码端口号
- [x] 无本地媒体文件
- [x] 所有 LLM 调用在服务端（无客户端 API key 暴露）

---

## 七、GPT 下一步建议

### 可选 LEVEL10.5 方向（供参考）

1. **Experience-Driven Sizing Adjustment**：将 `recommended_adjustment` 中的"Reduce 20-30%"解析为具体的 position sizing 乘数，注入 `buildPayoutMap()` 的 `asymmetry_ratio` 计算。

2. **Cross-Ticker Pattern Correlation**：当多个持仓同时出现 `persistent_weakening_detected`，触发 portfolio-level 风险预警（而非单 ticker 预警）。

3. **Experience History UI**：在前端 `/replay` 页面展示 `experience_context` 字段，让用户看到每次决策时的历史学习状态。

4. **Confidence Decay Model**：如果 `confidence_trend === "downtrend"` 且 `current_vs_peak < 0.7`，自动降低该 ticker 在 `fuseMultipleSignals()` 中的权重。

---

*本报告由 Manus 生成，供 GPT 团队接收和下一步规划使用。*  
*advisory_only: true — 所有分析仅供参考，不构成投资建议。*
