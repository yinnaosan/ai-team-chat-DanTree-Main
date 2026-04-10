# CN Fundamentals v1.2 — Schema Hardening Feedback

**Checkpoint**: (pending)
**TSC**: 0 errors
**Service version**: 1.2.0

---

## 本轮变更内容

### 决策执行

| 决策 | 执行结果 |
|------|---------|
| Q1: periodType/periodEndDate | ✅ 三个 provider 均已补充，统一枚举格式 |
| Q2: permanentlyUnavailable 独立字段 | ✅ 固定值 `["freeCashFlow"]`，与 missingFields 分离 |
| Q3: sourceType 枚举规范化 | ✅ `official_free` / `community_aggregated`，移除 `fallback_2` 等流程型命名 |

---

## periodType / periodEndDate 映射规则

| Provider | periodType 来源 | periodEndDate 来源 |
|----------|---------------|-----------------|
| BaoStock | `statDate` 格式 `YYYY-Q1/Q2/Q3/Q4` → 月份推断 | `YYYY-03-31 / 06-30 / 09-30 / 12-31` |
| AKShare | `stock_financial_analysis_indicator` 最新列名（日期字符串）→ 月份推断 | 原始列名（如 `2025-09-30`） |
| efinance | `None`（`get_base_info` 无报告期信息） | `None` |

**推断规则**（统一）：
- 月份 03 → `Q1`，06 → `Q2`，09 → `Q3`，12 → `FY`

---

## sourceType 枚举

| Provider | sourceType | confidence |
|----------|-----------|-----------|
| BaoStock | `official_free` | `high` |
| AKShare | `community_aggregated` | `medium` |
| efinance | `community_aggregated` | `low` |

---

## permanentlyUnavailable

固定值：`["freeCashFlow"]`

说明：三个免费 provider（BaoStock / AKShare / efinance）均无 FCF 绝对值字段。该字段在 `missingFields` 中也会出现（当前 provider 缺失），但 `permanentlyUnavailable` 表示结构性不可得，不随 provider 切换而改变。

---

## 三组 Fallback 验证结果（v1.2）

### Group 1：正常路径（BaoStock Primary）

```
source: baostock  status: active  confidence: high
sourceType: official_free
coverageScore: 0.8364
periodType: FY  periodEndDate: 2024-12-31
permanentlyUnavailable: ['freeCashFlow']
missingFields: ['operatingMargin', 'roa', 'cashFromOperations', 'freeCashFlow', 'revenueGrowthYoy', 'bookValuePerShare']
PE=20.32  PB=7.11  PS=10.05  ROE=38.43%
Revenue=1706.12亿  NetIncome=893.35亿
```

### Group 2：BaoStock 禁用 → AKShare Fallback

模拟方式：HTTP POST `/test/override?provider=baostock&enabled=false`，清除缓存后重新请求完整 main.py 路由。

```
source: akshare  status: active  confidence: medium
sourceType: community_aggregated
coverageScore: 0.8677
periodType: Q3  periodEndDate: 2025-09-30
permanentlyUnavailable: ['freeCashFlow']
PE=28.17  PB=6.85  ROE=25.14%
Revenue=1309.04亿  NetIncome=646.27亿
D/E=0.15  currentRatio=6.62
```

> **注意**：AKShare 数据为 Q3 2025（最新季报），BaoStock 为 FY2024 年报。periodType + periodEndDate 已明确区分，下游不会误把不同口径当同口径比较。

### Group 3：BaoStock + AKShare 禁用 → efinance Fallback

模拟方式：HTTP POST `/test/override?provider=akshare&enabled=false`（baostock 已禁用），清除缓存后重新请求。

```
source: efinance  status: active  confidence: low
sourceType: community_aggregated
coverageScore: 0.4667
periodType: None  periodEndDate: None
permanentlyUnavailable: ['freeCashFlow']
PE=21.13  PB=7.08  ROE=24.64%
Revenue=N/A  NetIncome=646.27亿（来自 get_base_info）
```

> **说明**：efinance 仅 `get_base_info` 可用，无报告期信息（periodType=None），revenue 无法获取（N/A）。coverageScore=0.4667 属于低覆盖，confidence=low，下游应据此降低权重。

所有 overrides 已恢复（baostock=True, akshare=True）。

---

## 当前字段覆盖能力总结（v1.2）

| 字段 | BaoStock | AKShare | efinance |
|------|---------|---------|---------|
| pe | ✅ TTM | ✅ 计算（市值/净利润） | ✅ |
| pb | ✅ MRQ | ✅ 计算（市值/净资产） | ✅ |
| ps | ✅ TTM | ✅ 计算（市值/营收） | ❌ null |
| roe | ✅ | ✅ | ✅ |
| grossMargin | ✅ | ❌ null（不允许近似） | ✅ |
| netMargin | ✅ | ✅ | ✅ |
| revenue | ✅ FY | ✅ 最新季报 | ❌ null |
| netIncome | ✅ FY | ✅ 最新季报 | ✅ |
| eps | ✅ | ✅ | ❌ null |
| operatingMargin | ❌ null | ✅ | ❌ null |
| roa | ❌ null | ✅ | ❌ null |
| debtToEquity | ✅ 精确（assetToEquity-1） | ✅ 精确（负债/权益） | ❌ null |
| currentRatio | ✅ | ✅ | ❌ null |
| cashFromOperations | ❌ null（只有比率） | ✅ | ❌ null |
| freeCashFlow | ❌ permanentlyUnavailable | ❌ | ❌ |
| revenueGrowthYoy | ❌ null | ✅ | ❌ null |
| netIncomeGrowthYoy | ✅ | ✅ | ❌ null |
| bookValuePerShare | ❌ null | ✅ | ❌ null |
| dividendYield | ✅ 计算 | ❌ null | ❌ null |
| sharesOutstanding | ✅ | ✅ | ❌ null |

---

## 待 GPT 决策的问题

**Q1：efinance NetIncome 来源**
Group 3 中 efinance 的 `netIncome=646.27亿` 与 AKShare Q3 2025 的净利润一致，但 efinance 的 `get_base_info` 返回的是"归母净利润"（最新可得值，无明确报告期）。是否接受 efinance 的 netIncome 在 periodType=None 的情况下仍然输出？还是 periodType=None 时 netIncome 也应强制返回 null？

**Q2：AKShare grossMargin**
当前 AKShare 路径 grossMargin=null（因为不允许用营业总成本近似）。AKShare 的 `stock_financial_abstract` 有"毛利率"字段（来自 Sina 财报），但字段名不稳定（历史上有过变更）。是否允许尝试从 `stock_financial_abstract` 取 grossMargin，失败时返回 null（而不是完全不尝试）？

**Q3：HK fundamentals 时间表**
当前 HK fundamentals = unavailable。是否有计划在下一轮评估 AKShare 港股接口（`stock_hk_spot_em` / `stock_hk_financial_em`）？
