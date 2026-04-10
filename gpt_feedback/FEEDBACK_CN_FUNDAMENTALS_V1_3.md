# CN Fundamentals v1.3 — AKShare grossMargin Supplement

**Checkpoint**: (pending)
**TSC**: 0 errors
**Service version**: 1.2.0 (Python service, no version bump needed for single-field addition)

---

## 本轮变更

### 决策执行

| 决策 | 执行结果 |
|------|---------|
| Q1: efinance netIncome 保留（periodType=None 时不清空） | ✅ 当前代码已是正确行为，无需修改 |
| Q2: AKShare grossMargin 从 stock_financial_abstract 补充 | ✅ 已实现，验证通过 |
| Q3: HK fundamentals 保持 unavailable | ✅ 未动，下一轮单独评估 |

---

## AKShare grossMargin 实现细节

**字段来源**：`stock_financial_abstract`（`指标` 列）

**候选字段优先级**：
1. `销售毛利率(%)` → 不存在（FY2025 数据中无此字段）
2. `毛利率(%)` → 不存在
3. `毛利率` → **存在**，值为百分比格式（如 91.29）

**单位转换**：`91.29 / 100.0 = 0.9129`（decimal 格式）

**逻辑规则**：
- 只做直接字段提取，不做近似计算
- 三个候选都没有时返回 null
- 不影响 provider 成功判定（单字段失败不触发 fallback）
- 仅在 `stock_financial_analysis_indicator` 未能提供 grossMargin 时才尝试（`if gross_margin is None`）

---

## 验证结果

### AKShare Fallback（BaoStock 禁用）

```
source: akshare  confidence: medium  sourceType: community_aggregated
coverageScore: 0.9455  (v1.2 时为 0.8677，grossMargin 补充后提升)
periodType: Q3  periodEndDate: 2025-09-30
grossMargin: 91.29% (raw: 0.9129)  ← 新增，从 stock_financial_abstract.毛利率 直接提取
PE=28.17  PB=6.85  ROE=25.14%  netMargin=52.08%
Revenue=1309.04亿  NetIncome=646.27亿
missingFields: ['freeCashFlow', 'dividendYield']  (从 v1.2 的 4 个缩减到 2 个)
permanentlyUnavailable: ['freeCashFlow']
```

---

## 当前 AKShare 字段覆盖能力（v1.3）

| 字段 | 状态 | 来源接口 |
|------|------|---------|
| pe | ✅ 计算（市值/净利润） | stock_individual_info_em + stock_financial_abstract |
| pb | ✅ 计算（市值/净资产） | stock_individual_info_em + stock_financial_analysis_indicator |
| ps | ✅ 计算（市值/营收） | stock_individual_info_em + stock_financial_abstract |
| roe | ✅ | stock_financial_analysis_indicator |
| grossMargin | ✅ 直接字段 | stock_financial_abstract（`毛利率`） |
| netMargin | ✅ | stock_financial_analysis_indicator |
| revenue | ✅ 最新季报 | stock_financial_abstract |
| netIncome | ✅ 最新季报 | stock_financial_abstract |
| eps | ✅ | stock_financial_analysis_indicator |
| operatingMargin | ✅ | stock_financial_analysis_indicator |
| roa | ✅ | stock_financial_analysis_indicator |
| debtToEquity | ✅ 精确（负债/权益） | stock_financial_analysis_indicator |
| currentRatio | ✅ | stock_financial_analysis_indicator |
| cashFromOperations | ✅ | stock_financial_abstract |
| freeCashFlow | ❌ permanentlyUnavailable | — |
| revenueGrowthYoy | ✅ | stock_financial_analysis_indicator |
| netIncomeGrowthYoy | ✅ | stock_financial_analysis_indicator |
| bookValuePerShare | ✅ | stock_financial_analysis_indicator |
| dividendYield | ❌ null | 无直接接口 |
| sharesOutstanding | ✅ | stock_individual_info_em |

**AKShare coverageScore（v1.3）**：0.9455（core: 9/9=1.0, extended: 9/11=0.818）

---

## 三层 Provider 覆盖能力对比（最终）

| 字段 | BaoStock | AKShare | efinance |
|------|---------|---------|---------|
| grossMargin | ✅ | ✅（v1.3 新增） | ✅ |
| coverageScore | 0.8364 | 0.9455 | 0.4667 |
| confidence | high | medium | low |
| sourceType | official_free | community_aggregated | community_aggregated |

---

## 待 GPT 决策的问题

**Q1：AKShare dividendYield**
当前 AKShare 路径 dividendYield=null。`stock_financial_analysis_indicator` 有 `股息发放率(%)`（payout ratio，不是 yield）。如需 dividendYield，需要 `每股股息 / 股价`，但 AKShare 无直接的每股股息接口。是否接受 dividendYield 在 AKShare 路径永久为 null？

**Q2：HK fundamentals 时间表**
是否在下一轮评估 AKShare 港股接口（`stock_hk_spot_em` / `stock_hk_financial_em`）？
