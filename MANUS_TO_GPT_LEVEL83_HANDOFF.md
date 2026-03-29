# DANTREE LEVEL8.3 — Manus → GPT 交接报告

**生成时间：** 2026-03-28  
**任务版本：** LEVEL8.3 — Investor Thinking Layer + Signal Cache + Twelve Data Fallback  
**状态：** ✅ 全部完成 · TSC 0 errors · 94/94 tests passed

---

## 一、本次任务完成摘要

LEVEL8.3 在 LEVEL8.2（Live Signal Engine）基础上，新增了三个核心模块：

| 模块编号 | 模块名称 | 文件 | 状态 |
|----------|----------|------|------|
| Module 6 | Signal Cache (15min TTL) | `server/liveSignalEngine.ts` | ✅ 完成 |
| Module 7 | Twelve Data 备用数据源 | `server/liveSignalEngine.ts` | ✅ 完成 |
| Module 8 | Investor Thinking Layer (M1–M5) | `server/investorThinkingLayer.ts` | ✅ 完成 |
| 验证测试 | level83.test.ts (27 cases) | `server/level83.test.ts` | ✅ 27/27 |
| 回归修复 | level82.test.ts 缓存隔离修复 | `server/level82.test.ts` | ✅ 11/11 |

---

## 二、Module 6 — Signal Cache (15min TTL)

### 设计原则

信号缓存采用内存 Map 实现，以 ticker 为 key，存储 `{ signal, ts }` 对。TTL 为 **15 分钟（900,000ms）**，在 `getCachedSignal()` 读取时惰性过期（lazy expiry）。

### 导出 API

```typescript
export const SIGNAL_CACHE_TTL_MS = 15 * 60 * 1000; // 900,000ms

export function getCachedSignal(ticker: string): LiveSignal | null
export function setCachedSignal(ticker: string, signal: LiveSignal): void
export function clearSignalCache(): void
export function getSignalCacheSize(): number
```

### 缓存命中日志

当缓存命中时，引擎输出：
```
[SignalEngine] MSFT: cache hit (age=0s)
```

### 关键行为

- `buildSignalsFromLiveData()` 在每个 ticker 处理前先检查缓存
- 缓存命中时直接返回，**不发起任何 fetch 请求**
- 缓存未命中或已过期时，正常走完整数据获取流程，并在完成后调用 `setCachedSignal()` 存储结果

---

## 三、Module 7 — Twelve Data 备用数据源

### 触发条件

当 Yahoo Finance 的 quote 或 history 请求失败（`ok: false` 或 throw）时，自动触发 Twelve Data 备用路径。

### API 端点

```
历史数据: https://api.twelvedata.com/time_series?symbol={ticker}&interval=1day&outputsize=22&apikey={TWELVE_DATA_API_KEY}
实时报价: https://api.twelvedata.com/quote?symbol={ticker}&apikey={TWELVE_DATA_API_KEY}
```

### 数据流

```
Yahoo Finance (quote + history)
    ↓ 失败
Twelve Data (time_series + quote)
    ↓ 失败
中性信号 (momentum=0, volatility=0.5, valuation_proxy=0.5)
```

### metadata 标记

| 场景 | `fallback_used` | `sources` 包含 | `missing_fields` 包含 |
|------|-----------------|----------------|----------------------|
| Yahoo 成功 | `false` | `"Yahoo Finance"` | — |
| Twelve Data 成功 | `true` | `"Twelve Data (fallback)"` | — |
| 全部失败 | `true` | — | `"yahoo_quote"`, `"twelve_data"` |

### 环境变量

`TWELVE_DATA_API_KEY` 已在 `server/_core/env.ts` 第 53 行注册，已注入到 sandbox 环境。

---

## 四、Module 8 — Investor Thinking Layer

### 文件：`server/investorThinkingLayer.ts`

该文件包含 5 个子模块，构成完整的投资者思维管道：

#### Module 1 — `computeBusinessQuality()`

基于信号数据计算商业质量评分，无需额外 API 调用。

| 输入维度 | 影响方向 | 权重逻辑 |
|----------|----------|----------|
| `volatility < 0.2` | BQ ↑ +0.15 | 低波动 = 稳定商业 |
| `volatility > 0.65` | BQ ↓ -0.15 | 高波动 = 不稳定 |
| `valuation_proxy > 0.65` | BQ ↑ +0.12 | 估值吸引力强 |
| `valuation_proxy < 0.25` | BQ ↓ -0.12 | 估值过高或基本面弱 |
| `price_momentum ∈ (0.3, 0.7)` | BQ ↑ +0.08 | 一致正向动量 |
| `sector` | 混合 20% | 行业质量启发式 |
| `fallback_used` | BQ ↓ -0.05 | 数据不确定性惩罚 |

**行业质量映射（SECTOR_QUALITY_MAP）：**

| 行业 | 质量基准 |
|------|---------|
| technology | 0.75 |
| healthcare | 0.70 |
| consumer_staples | 0.72 |
| financials | 0.60 |
| energy | 0.45 |
| materials | 0.42 |

#### Module 2 — `applyEventImpactAdjustment()`

根据事件类型和严重程度调整各信号权重：

| 事件类型 | alpha_weight | risk_weight | macro_weight | momentum_weight | bias |
|----------|-------------|-------------|--------------|-----------------|------|
| `geopolitics` | ↓ (1-sev×0.3) | ↑ (1+sev×0.5) | ↑ (1+sev×0.3) | 1.0 | bearish |
| `policy` | ↓ (1-sev×0.2) | ↑ (1+sev×0.2) | ↑ (1+sev×0.8) | 1.0 | bearish/volatile |
| `earnings` | ↑ (1+sev×0.2) | ↑ (1+sev×0.15) | 1.0 | ↑ (1+sev×0.5) | bullish/bearish |
| `tech` (高BQ) | ↑ (1+sev×0.3) | 1.0 | 1.0 | 1.0 | bullish |
| `tech` (低BQ) | ↓ (1-sev×0.35) | ↑ (1+sev×0.4) | 1.0 | 1.0 | bearish |

所有权重均 clamp 到安全范围：alpha/risk/momentum ∈ [0.5, 1.5]，macro ∈ [0.5, 2.0]。

#### Module 3 — `applyFactorHierarchy()`

**BQ 门控规则：**
- 若 `business_quality_score < 0.35`，则 `adjusted_alpha_score` 上限为 **0.55**
- 确保低质量商业无法获得高 alpha 评级

**四维评分计算（事件权重调整后）：**

```
alpha_score  = f(momentum, volatility, valuation, sentiment) × alpha_weight
danger_score = f(volatility, momentum_inv, macro_abs) × risk_weight
trigger_score = f(event_severity, momentum, sentiment) × momentum_weight
memory_score = f(valuation, volatility_inv, sentiment)
```

#### Module 4 — `generateFalsification()`

**强制规则：每次决策必须包含至少 1 条伪证条件。**

触发条件覆盖：
- 高动量（均值回归风险）
- 高波动（不稳定性）
- 数据回退（数据质量不确定）
- 各类事件（earnings/geopolitics/policy/tech 专项风险）
- 低商业质量
- 高 alpha 评分（近期偏差风险）
- 高 danger 评分（guard 抑制风险）
- 高宏观敏感性

#### Module 5 — `runInvestorThinking()`

完整管道入口：

```typescript
export function runInvestorThinking(signal: LiveSignalData): InvestorThinkingOutput
```

执行顺序：M1 → M2 → M3 → M4 → 组装输出，所有输出均标注 `advisory_only: true`。

---

## 五、测试覆盖总结

### level83.test.ts — 27 个测试用例

| 模块 | 测试编号 | 测试内容 | 结果 |
|------|----------|----------|------|
| Module 6 | TC-L83-01 ~ 06 | 缓存空读、存取、TTL、清空、buildSignals 存储、缓存命中 | ✅ 6/6 |
| Module 7 | TC-L83-07 ~ 09 | Twelve Data 回退、双失败中性信号、source 标记 | ✅ 3/3 |
| Module 8 | TC-L83-10 ~ 27 | BQ 范围、波动惩罚、估值奖励、行业、事件调整、因子层级、伪证、完整管道 | ✅ 18/18 |

### 回归测试结果（全套）

```
server/level7.test.ts    35/35 ✅
server/level71.test.ts   10/10 ✅
server/level71b.test.ts   7/7  ✅
server/level8.test.ts     4/4  ✅
server/level82.test.ts   11/11 ✅  (修复了缓存隔离 bug)
server/level83.test.ts   27/27 ✅
─────────────────────────
总计                     94/94 ✅
TypeScript               0 errors ✅
```

---

## 六、level82.test.ts 回归修复说明

**问题：** TC-L82-04 使用 `MSFT` ticker 并成功写入缓存，TC-L82-05 同样使用 `MSFT`，但 `beforeEach` 未清除缓存，导致缓存命中返回旧结果（`fallback_used: false`），测试断言 `fallback_used: true` 失败。

**修复：** 在 level82.test.ts 的每个 `describe` 块的 `beforeEach` 中添加 `clearSignalCache()` 调用，确保测试间完全隔离。同时补充了 `clearSignalCache` 的导入。

---

## 七、HARD RULES 合规检查

| 规则 | 状态 |
|------|------|
| 不修改 Level7/7.1/8 逻辑 | ✅ 未修改任何 level7/8 核心文件 |
| 所有输出标注 `advisory_only: true` | ✅ `runInvestorThinking()` 返回值强制为 `advisory_only: true` |
| 不引入新 API（reuse existing signal data） | ✅ investorThinkingLayer.ts 无任何 fetch 调用 |
| 信号缓存 TTL = 15 分钟 | ✅ `SIGNAL_CACHE_TTL_MS = 15 * 60 * 1000` |
| Twelve Data 仅作备用源 | ✅ 仅在 Yahoo Finance 失败时触发 |

---

## 八、GPT 下一步建议

基于当前系统架构，建议 GPT 在下一阶段（LEVEL8.4 或 LEVEL9）考虑以下方向：

**方向 A — Investor Thinking 输出接入 UI**
将 `runInvestorThinking()` 的输出（BQ score、event_adjustment、falsification）集成到前端决策面板，为每个 ticker 展示"投资者思维层"分析卡片。

**方向 B — 论文/报告生成模块**
基于 `InvestorThinkingOutput` 构建 `generateInvestmentThesis()` 函数，自动生成结构化投资论文（bull case / bear case / falsification conditions）。

**方向 C — 历史回测集成**
将 Investor Thinking 评分与历史价格数据对比，验证 BQ gate 和 event adjustment 的预测有效性。

**方向 D — 多 ticker 批量分析**
扩展 `buildSignalsFromLiveData()` + `runInvestorThinking()` 为批量管道，支持对 watchlist 中所有 ticker 同时运行完整分析。

---

## 九、关键文件索引

| 文件 | 用途 |
|------|------|
| `server/liveSignalEngine.ts` | Module 6 (缓存) + Module 7 (Twelve Data) + 完整信号构建管道 |
| `server/investorThinkingLayer.ts` | Module 8 (M1–M5): BQ、事件调整、因子层级、伪证、完整管道 |
| `server/level83.test.ts` | LEVEL8.3 全部 27 个验证测试 |
| `server/level82.test.ts` | LEVEL8.2 测试（已修复缓存隔离 bug） |
| `server/_core/env.ts` | `TWELVE_DATA_API_KEY` 已在第 53 行注册 |

---

*本报告由 Manus AI 生成，供 ChatGPT 团队接收和后续任务规划使用。*  
*所有代码均为 advisory_only，不构成实际投资建议。*
