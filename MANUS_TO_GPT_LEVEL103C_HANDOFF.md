# DANTREE LEVEL10.3-C — Manus → GPT 交接报告

**生成时间：** 2026-03-29
**任务版本：** LEVEL10.3-C — Experience Layer (Adaptive Judgment)
**状态：** ✅ 全部完成 · TSC 0 errors · 239/239 tests passed

---

## 一、本次任务完成摘要

| 模块编号 | 模块名称 | 文件 | 状态 |
|----------|----------|------|------|
| Module 1 | `detectThesisDrift()` — 梯度漂移检测 | `server/experienceLayer.ts` | ✅ 完成 |
| Module 2 | `updateThesisConfidence()` — 连续置信度演化 | `server/experienceLayer.ts` | ✅ 完成 |
| Module 3 | `interpretManagementBehavior()` — 管理层行为解读 | `server/experienceLayer.ts` | ✅ 完成 |
| Module 4 | `analyzeMarketBehavior()` — 市场行为读取 | `server/experienceLayer.ts` | ✅ 完成 |
| Module 5 | `evaluateGradientRisk()` — 梯度风险模型 | `server/experienceLayer.ts` | ✅ 完成 |
| Module 6 | `composeResearchNarrative` 升级（Experience Insight 节） | `server/deepResearchEngine.ts` | ✅ 完成 |
| Module 7 | `buildTimeContext()` + `getTimeContext()` — 时间记忆 | `server/experienceLayer.ts` | ✅ 完成 |
| Module 8 | 集成到 `runDeepResearch()` 流水线（非阻塞） | `server/deepResearchEngine.ts` | ✅ 完成 |
| Module 9 | `level103c.test.ts` (11 cases) | `server/level103c.test.ts` | ✅ 11/11 |

---

## 二、核心接口定义

### Module 1 — DriftDetectionOutput
```ts
interface DriftDetectionOutput {
  drift_direction: "strengthening" | "weakening" | "unclear";
  drift_intensity: number;        // 0.0–1.0 (clamp of positive drift score)
  drift_signal: string;           // human-readable explanation
  confidence_change: number;      // suggested Δ (-0.15 to +0.15)
  advisory_only: true;
}
```
**关键行为：** `previous_drift_state === "none"` 时返回 `unclear` 建立基线，下一周期才激活检测。`drift_intensity` 在 strengthening 方向时为 0（负 driftScore 被 clamp）。

### Module 2 — ConfidenceUpdateOutput
```ts
interface ConfidenceUpdateOutput {
  updated_confidence: number;     // 0–1, clamped
  confidence_trend: "rising" | "falling" | "stable";
  reason: string;
  advisory_only: true;
}
```
**关键规则：** 每次最大变化 ±0.15，事件冲击时最大 ±0.20，置信度具有粘性（高置信需持续负面证据才下降）。

### Module 3 — ManagementBehaviorOutput
```ts
interface ManagementBehaviorOutput {
  behavior_pattern: BehaviorPattern;  // "capital_allocator" | "empire_builder" | "operator" | "communicator" | "unknown"
  behavior_confidence: number;
  interpretation: string;
  red_flags: string[];
  advisory_only: true;
}
```

### Module 4 — MarketBehaviorOutput
```ts
interface MarketBehaviorOutput {
  market_behavior: MarketBehaviorType;  // "accumulation" | "distribution" | "rotation" | "speculation"
  interpretation: string;
  implication_for_thesis: string;
  advisory_only: true;
}
```

### Module 5 — GradientRiskOutput
```ts
interface GradientRiskOutput {
  risk_state: RiskState;    // "safe" | "early_warning" | "elevated" | "critical"
  risk_score: number;       // 0.0–1.0
  primary_risk_driver: string;
  warnings: string[];
  recommended_action: string;
  advisory_only: true;
}
```

### Module 7 — TimeContextRecord
```ts
interface TimeContextRecord {
  ticker: string;
  previous_thesis_summary: string;
  previous_confidence: number;
  last_drift_state: "strengthening" | "weakening" | "unclear" | "none";
  last_market_behavior: MarketBehaviorType | "unknown";
  last_management_pattern: BehaviorPattern;
  last_risk_state: RiskState;
  recorded_at_ms: number;
  advisory_only: true;
}
```
**注意：** 当前为进程内 Map 存储（非持久化）。如需持久化，写入 DB 的 `experience_context` 字段（LEVEL10.4 建议）。

---

## 三、8 项 Return Protocol 样本输出

### Sample 1 — detectThesisDrift (strengthening)
```json
{
  "drift_direction": "strengthening",
  "drift_intensity": 0.0,
  "drift_signal": "[AAPL] Thesis is strengthening — supporting evidence is accumulating. Signal fusion score has improved (Δ+48.0%) — thesis support is building. Business quality is improving relative to prior low-confidence state.",
  "confidence_change": 0.08,
  "advisory_only": true
}
```

### Sample 2 — detectThesisDrift (weakening)
```json
{
  "drift_direction": "weakening",
  "drift_intensity": 0.45,
  "drift_signal": "[MSFT] Early thesis drift detected — monitor closely. Business quality score has deteriorated while prior confidence was high — quality-confidence gap is widening. Event shock detected — drift intensity amplified by near-term catalyst uncertainty. Regime has shifted to risk_off — macro headwind is creating thesis pressure.",
  "confidence_change": -0.135,
  "advisory_only": true
}
```

### Sample 3 — updateThesisConfidence (rising)
```json
{
  "updated_confidence": 0.73,
  "confidence_trend": "rising",
  "reason": "Confidence rose from 65% to 73% (Δ+8%) — Drift is strengthening, supporting evidence is building. Signal fusion score has improved (Δ+48.0%) — thesis support is building.",
  "advisory_only": true
}
```

### Sample 4 — interpretManagementBehavior (capital_allocator)
```json
{
  "behavior_pattern": "capital_allocator",
  "behavior_confidence": 0.82,
  "interpretation": "Management demonstrates disciplined capital allocation: buybacks at value, consistent ROIC improvement, and shareholder-aligned communication. This is a high-quality capital steward.",
  "red_flags": [],
  "advisory_only": true
}
```

### Sample 5 — analyzeMarketBehavior (accumulation)
```json
{
  "market_behavior": "accumulation",
  "interpretation": "Strong capital inflows with rising price action in a risk-on regime suggest institutional accumulation. Smart money appears to be building positions.",
  "implication_for_thesis": "Market behavior aligns with thesis — accumulation phase supports a constructive medium-term outlook.",
  "advisory_only": true
}
```

### Sample 6 — evaluateGradientRisk (early_warning)
```json
{
  "risk_state": "early_warning",
  "risk_score": 0.32,
  "primary_risk_driver": "Thesis drift detected — weakening direction with intensity 0.45.",
  "warnings": [
    "Early drift detected: [MSFT] Early thesis drift detected — monitor closely.",
    "Moderate risk-off regime — macro headwinds present."
  ],
  "recommended_action": "Monitor closely — reduce position size by 10-20% if drift continues for 2+ cycles.",
  "advisory_only": true
}
```

### Sample 7 — composeResearchNarrative (with Experience Layer Insight)
```
[EXPERIENCE LAYER INSIGHT]
Drift: strengthening (intensity: 0.00) — Signal fusion score has improved.
Confidence: 73% (↑ rising) — Drift is strengthening, supporting evidence is building.
Market: accumulation — Smart money appears to be building positions.
Management: capital_allocator — Management demonstrates disciplined capital allocation.
Risk State: safe (score: 0.12) — No significant risk factors detected.
```

### Sample 8 — runDeepResearch (DeepResearchOutput with experience)
```json
{
  "ticker": "AAPL",
  "thesis": { "primary_thesis": "...", "critical_driver": "iPhone upgrade cycle...", "failure_condition": "..." },
  "key_variables": [...],
  "payout_map": { "asymmetry_ratio": 2.8, "if_right": {...}, "if_wrong": {...} },
  "implicit_factors": [...],
  "judgment_tension": { "tension_type": "valuation_vs_quality", "tension_statement": "..." },
  "narrative": { "business_and_thesis": "...", "experience_layer_insight": "[EXPERIENCE LAYER INSIGHT]..." },
  "lens": { "lens_type": "compounder", "lens_rationale": "..." },
  "signal_density": { "passed": true, "density_score": 0.82 },
  "experience": { "drift": {...}, "confidence": {...}, "management": {...}, "market_behavior": {...}, "gradient_risk": {...} },
  "advisory_only": true
}
```

---

## 四、测试结果

```
server/level103c.test.ts    11/11 ✅
─────────────────────────────────────────────────────
核心回归套件（12 个文件）   239/239 ✅
TypeScript                  0 errors ✅
```

---

## 五、关键设计决策说明

**1. `drift_intensity` 在 strengthening 时为 0 的原因：**
`drift_intensity = max(0, min(1, driftScore))`，当 driftScore < 0（strengthening）时，clamp 后为 0。这是有意设计：intensity 代表"压力强度"，strengthening 方向下压力为 0，方向本身通过 `drift_direction` 表达。

**2. `previous_drift_state === "none"` 早期退出：**
首次运行时返回 `unclear` 建立基线，下一周期才激活完整检测。这防止了"无历史数据时的虚假漂移"。测试中需将 `previous_drift_state` 设为 `"unclear"` 以触发完整计算路径。

**3. 时间记忆为进程内存储：**
`timeContextStore` 是 `Map<string, TimeContextRecord>`，进程重启后清空。LEVEL10.4 建议将其持久化到 `decision_log` 的 `experience_context_json` 字段。

---

## 六、6 个 Final Questions 回答

**Q1: Experience Layer 是否会影响现有决策输出？**
不会。`runDeepResearch()` 中 Experience Layer 为非阻塞调用（try/catch），失败时 `experience` 字段为 `undefined`，所有现有字段保持不变。

**Q2: `buildTimeContext()` 何时被调用？**
在 `runExperienceLayer()` 内部自动调用，存储当前周期的完整状态供下次 `detectThesisDrift()` 使用。

**Q3: 如何区分"无历史"和"历史为 none"？**
`previous_drift_state === "none"` 表示系统第一次运行（无历史），直接返回 `unclear` 建立基线。`"unclear"` 表示有历史但漂移方向不明确，会触发完整计算。

**Q4: `confidence_change` 和 `updated_confidence` 的关系？**
`detectThesisDrift()` 返回建议的 `confidence_change`（Δ），`updateThesisConfidence()` 将其应用到 `previous_confidence` 上，产生 `updated_confidence`。两者独立调用，不自动链接。

**Q5: `evaluateGradientRisk()` 的 `risk_score` 如何计算？**
基于 4 个维度加权：drift_intensity × 0.4 + regime_stress × 0.25 + management_risk × 0.20 + market_behavior_risk × 0.15，上限 1.0。

**Q6: Experience Layer 的数据流路径？**
`runDeepResearch(ctx, experienceParams?)` → `runExperienceLayer(ctx, experienceParams)` → 5 个模块并行计算 → `buildTimeContext()` 存储 → `composeResearchNarrative()` 注入 Experience Insight 节 → `DeepResearchOutput.experience` 字段。

---

## 七、HARD RULES 合规检查

| 规则 | 状态 |
|------|------|
| 不修改 Level7/8/9/10/10.2/10.3/10.3-B 逻辑 | ✅ |
| 所有输出 `advisory_only: true` | ✅ |
| Experience Layer 为非阻塞（失败不影响主流程） | ✅ |
| 时间记忆不持久化到 DB（进程内存储） | ✅ |
| 不引入新外部 API | ✅ |

---

## 八、GPT 建议下一步（LEVEL10.4）

**A — 经验持久化（最高优先级）：** 在 `decision_log` 新增 `experience_context_json` 字段，将 `runExperienceLayer()` 的输出（drift/confidence/management/market/risk）写入 DB，使每个历史决策都携带完整的经验层快照，支持跨周期学习。

**B — 跨周期漂移追踪：** 基于持久化的 `experience_context_json`，构建 `analyzeThesisDriftHistory()` 函数，统计每个 ticker 的漂移方向分布（strengthening/weakening/unclear 各占比），识别"长期漂移趋势"。

**C — UI 集成：** 在前端决策面板展示 `gradient_risk.risk_state`（颜色编码：绿=safe / 黄=early_warning / 橙=elevated / 红=critical）+ `drift_direction`（箭头图标：↑ strengthening / ↓ weakening / → unclear），让用户一眼看到每个持仓的经验层状态。

---

*Manus AI · advisory_only · 不构成实际投资建议*
