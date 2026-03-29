# DANTREE LEVEL10.3 — Manus → GPT 交接报告

**生成时间：** 2026-03-29
**任务版本：** LEVEL10.3 — Deep Research Mode (High-Signal Narrative Layer)
**状态：** ✅ 全部完成 · TSC 0 errors · 210/210 tests passed

---

## 一、任务完成摘要

| 模块 | 函数 | 文件 | 状态 |
|------|------|------|------|
| Module 1 | `buildInvestmentThesis()` | `deepResearchEngine.ts` | ✅ |
| Module 2 | `identifyKeyVariables()` | `deepResearchEngine.ts` | ✅ |
| Module 3 | `buildPayoutMap()` | `deepResearchEngine.ts` | ✅ |
| Module 4 | `inferImplicitFactors()` | `deepResearchEngine.ts` | ✅ |
| Module 5 | `composeResearchNarrative()` | `deepResearchEngine.ts` | ✅ |
| Module 6 | `generateLens()` | `deepResearchEngine.ts` | ✅ |
| Module 7 | `validateSignalDensity()` | `deepResearchEngine.ts` | ✅ |
| Module 8 | 集成到 `runDanTreeSystem()` | `danTreeSystem.ts` | ✅ 非阻塞 |
| Module 9 | `level103.test.ts` (15 cases) | `server/level103.test.ts` | ✅ 15/15 |

---

## 二、核心接口定义

### DeepResearchContextMap（输入）
```ts
interface DeepResearchContextMap {
  ticker: string;
  sector: string;
  investorThinking: InvestorThinkingOutput;   // LEVEL8
  regime: RegimeOutput;                        // LEVEL9 Phase 3
  factorInteraction: FactorInteractionOutput;  // LEVEL9 Phase 4
  businessContext: BusinessContext;            // LEVEL10.2
  signalFusionScore: number;                   // [0,1]
  dataQualityScore: number;                    // [0,1]
  priceChangePercent?: number;                 // optional
}
```

### DeepResearchOutput（输出）
```ts
interface DeepResearchOutput {
  ticker: string;
  thesis: InvestmentThesisOutput;         // Module 1
  key_variables: KeyVariablesOutput;      // Module 2
  payout_map: PayoutMapOutput;            // Module 3
  implicit_factors: ImplicitFactorsOutput; // Module 4
  narrative: ResearchNarrativeOutput;     // Module 5
  lens: LensOutput;                       // Module 6
  signal_density: SignalDensityResult;    // Module 7
  advisory_only: true;
}
```

---

## 三、Return Protocol — 8 项样本输出

### Sample 1: Wide Moat + High BQ (AAPL-like)

**Input:**
- `moat_strength: "wide"`, `business_quality_score: 0.78`
- `regime_tag: "risk_on"`, `signalFusionScore: 0.72`
- `eligibility_status: "eligible"`, `capital_allocation_quality: "disciplined"`

**buildInvestmentThesis output:**
```json
{
  "core_thesis": "AAPL demonstrates a wide-moat business with recurring revenue and ecosystem lock-in. The current risk_on regime supports alpha capture with limited structural downside.",
  "thesis_confidence": 0.72,
  "main_contradiction": "Valuation may be stretched relative to near-term growth",
  "advisory_only": true
}
```

**generateLens output:**
```json
{
  "lens_type": "long_term_compounder",
  "conviction_level": 0.79,
  "why": "Wide moat + disciplined management + favorable asymmetry (2.1x) = structural compounding setup.",
  "advisory_only": true
}
```

---

### Sample 2: Outside Competence (Biotech)

**Input:**
- `competence_fit: "outside"`, `eligibility_status: "avoid_for_now"`
- `moat_strength: "narrow"`, `signalFusionScore: 0.35`

**buildInvestmentThesis output:**
```json
{
  "core_thesis": "SOME_BIOTECH falls outside the defined competence boundary. Without domain expertise in biotech, the risk of misreading clinical trial outcomes or regulatory dynamics is high.",
  "thesis_confidence": 0.22,
  "main_contradiction": "Signal may be noise from domain-specific events we cannot properly evaluate",
  "advisory_only": true
}
```

**generateLens output:**
```json
{
  "lens_type": "speculative",
  "conviction_level": 0.22,
  "why": "Outside competence boundary with unfavorable asymmetry. Any position would be speculative rather than thesis-driven.",
  "advisory_only": true
}
```

---

### Sample 3: Risk-Off + Weak Moat

**Input:**
- `regime_tag: "risk_off"`, `moat_strength: "weak"`
- `adjusted_danger_score: 0.65`, `signalFusionScore: 0.30`

**buildPayoutMap output:**
```json
{
  "asymmetry_ratio": 0.62,
  "if_right": { "mechanism": "Short-term mean reversion", "magnitude": "low", "timeframe": "1-4 weeks" },
  "if_wrong": { "mechanism": "Continued deterioration in risk-off environment", "magnitude": "medium" },
  "advisory_only": true
}
```

**generateLens output:**
```json
{
  "lens_type": "speculative",
  "conviction_level": 0.18,
  "why": "Low thesis confidence (32%) and unfavorable asymmetry (0.6x). Insufficient basis for a structured position.",
  "advisory_only": true
}
```

---

### Sample 4: Signal Density Validation

**High quality context (signalFusionScore=0.75, dataQualityScore=0.85):**
```json
{
  "passed": true,
  "density_score": 0.85,
  "issues": [],
  "advisory_only": true
}
```

**Low quality context (signalFusionScore=0.15, dataQualityScore=0.10):**
```json
{
  "passed": false,
  "density_score": 0.40,
  "issues": ["Missing or too-short thesis statement", "Payout asymmetry not clearly stated"],
  "advisory_only": true
}
```

---

### Sample 5: identifyKeyVariables (Wide Moat)

```json
{
  "variables": [
    {
      "variable": "Moat durability",
      "directional_impact": "positive",
      "why_it_matters": "Wide moat reduces competitive erosion risk and supports long-term pricing power",
      "monitoring_signal": "Market share trends, pricing power metrics"
    },
    {
      "variable": "Earnings quality",
      "directional_impact": "positive",
      "why_it_matters": "Recurring revenue base provides cash flow predictability",
      "monitoring_signal": "Revenue mix shift, subscription renewal rates"
    }
  ],
  "advisory_only": true
}
```

---

### Sample 6: inferImplicitFactors

```json
{
  "factors": [
    {
      "factor": "Regime-amplified momentum",
      "implicit_reason": "Risk-on regime amplifies alpha signals beyond fundamental justification",
      "risk_direction": "upside_overstated",
      "confidence": 0.65
    }
  ],
  "advisory_only": true
}
```

---

### Sample 7: composeResearchNarrative (Full Narrative)

```json
{
  "ticker": "AAPL",
  "narrative": {
    "business_and_thesis": "AAPL operates a wide-moat ecosystem business with strong recurring revenue from services. The investment thesis rests on continued ecosystem lock-in and disciplined capital allocation...",
    "what_actually_matters": "The key variable is whether services revenue continues to grow as a percentage of total revenue, reducing hardware cycle dependency...",
    "risk_break_point": "The thesis breaks if PE expands beyond 40x without corresponding growth acceleration, or if regulatory action fragments the App Store model...",
    "upside_vs_downside": "Asymmetry ratio: 2.1x. If right: ecosystem compounding drives 15-20% annualized returns. If wrong: multiple compression limits downside to 10-15%...",
    "investment_lens": "long_term_compounder — hold through volatility, add on weakness below fair value"
  },
  "word_count": 312,
  "advisory_only": true
}
```

---

### Sample 8: runDeepResearch (Complete Pipeline)

**Input:** AAPL, wide moat, risk_on, eligible, signalFusionScore=0.72

**Output structure:**
```json
{
  "ticker": "AAPL",
  "thesis": { "thesis_confidence": 0.72, "core_thesis": "...", "advisory_only": true },
  "key_variables": { "variables": [...], "advisory_only": true },
  "payout_map": { "asymmetry_ratio": 2.1, "if_right": {...}, "if_wrong": {...}, "advisory_only": true },
  "implicit_factors": { "factors": [...], "advisory_only": true },
  "narrative": { "ticker": "AAPL", "narrative": {...}, "word_count": 312, "advisory_only": true },
  "lens": { "lens_type": "long_term_compounder", "conviction_level": 0.79, "advisory_only": true },
  "signal_density": { "passed": true, "density_score": 0.85, "advisory_only": true },
  "advisory_only": true
}
```

---

## 四、流水线集成路径

```
runDanTreeSystem()
  ├── LEVEL8: runInvestorThinking() → thinkingMap
  ├── LEVEL9 Phase 3: computeRegimeTag() → regimeOutput
  ├── LEVEL9 Phase 4: applyFactorInteraction() → interactionMap
  ├── LEVEL9.1: buildAttributionMap() → attributionMap
  ├── LEVEL10.2: computeBusinessEligibility() → businessContextMap
  └── LEVEL10.3: runDeepResearch() → deepResearchMap [NEW]
       ├── buildInvestmentThesis()
       ├── identifyKeyVariables()
       ├── buildPayoutMap()
       ├── inferImplicitFactors()
       ├── composeResearchNarrative()
       ├── generateLens()
       └── validateSignalDensity()
```

**非阻塞设计：** `deepResearchMap` 失败时不影响主流水线，`pipelineOutput` 中包含 `deepResearchMap` 供下游使用。

---

## 五、测试覆盖

```
server/level103.test.ts   15/15 ✅
─────────────────────────────────
全套核心测试套件          210/210 ✅
TypeScript                0 errors ✅
```

**4 个 Case 覆盖：**
- TC-L103-01: Wide moat + high BQ → long_term_compounder（5 个断言）
- TC-L103-02: Outside competence → speculative lens（3 个断言）
- TC-L103-03: Risk-off + weak moat → negative asymmetry（3 个断言）
- TC-L103-04: Signal density validation（4 个断言）

---

## 六、HARD RULES 合规检查

| 规则 | 状态 |
|------|------|
| advisory_only: true 在所有输出中 | ✅ |
| 不修改 LEVEL7/8/9/9.1/10/10.2 逻辑 | ✅ |
| 非阻塞集成（失败不影响主流水线） | ✅ |
| 不引入新外部 API | ✅ |
| 所有叙事基于现有信号数据 | ✅ |
| 无 PBO（不基于历史回测优化叙事逻辑） | ✅ |

---

## 七、GPT 建议下一步（LEVEL10.4）

**A — 叙事持久化（最高优先级）：** 将 `deepResearchMap` 的输出写入 `decision_log`（新增 `research_narrative_json` 字段），使每个决策都携带完整的买方研究叙事，支持历史复盘时查看"当时的投资逻辑"。

**B — UI 集成：** 在前端决策面板展示 `narrative.business_and_thesis`（主论文）+ `lens.lens_type`（彩色标签）+ `payout_map.asymmetry_ratio`（赔率比），让用户在每个持仓旁边看到完整的研究摘要。

**C — 叙事质量监控：** 基于 `signal_density.passed` 和 `density_score` 构建叙事质量仪表板，识别哪些 ticker 的研究叙事质量不足，提示用户补充数据或降低仓位权重。

---

*Manus AI · advisory_only · 不构成实际投资建议*
