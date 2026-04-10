# FMP ROE 补源 + SimFin fyear 动态化 反馈包

**日期**：2026-04-09
**Checkpoint**：`2d71a443`
**修改范围**：仅 `server/dataLayerFetchers.ts`（`fetchFMPFundamentals` + `fetchSimFinFundamentals`）
**TSC**：0 errors

---

## 执行内容

### Q1：FMP key-metrics-ttm 补 ROE

- 在 `fetchFMPFundamentals` 中新增第三个并行请求：`/stable/key-metrics-ttm`
- 仅用于补 `_kmRoe`，失败时静默（try/catch，不影响 profile 和 ratios 主链）
- ROE 取值链：`r.returnOnEquityTTM ?? r.roeTTM ?? r.returnOnEquity ?? _kmRoe`

**验证结果**：

| Ticker | ratios-ttm ROE | key-metrics-ttm ROE | 最终 ROE |
|--------|---------------|---------------------|---------|
| AAPL | N/A（无字段） | 159.94% | **159.94%** ✅ |
| MSFT | N/A（无字段） | 33.61% | **33.61%** ✅ |

---

### Q2：PE 字段（维持现状）

- 主字段继续使用 `priceToEarningsRatioTTM`（TTM PE）
- Forward PE 不混入，结构不变

---

### Q3：SimFin fyear 动态化

- 旧：写死 `fyear=2024`
- 新：`currentFyear = new Date().getFullYear() - 1`，先试 `currentFyear`，无数据则 fallback 到 `currentFyear - 1`
- 当前执行：`currentFyear = 2025`，SimFin 已有 FY2025 数据

**验证结果**：

| Ticker | 使用 fyear | Revenue | FiscalYear |
|--------|-----------|---------|-----------|
| AAPL | 2025 | 416.16B | 2025 ✅ |
| MSFT | 2025 | 281.72B | 2025 ✅ |

（比之前写死 FY2024 更新了一个财年）

---

## 当前 US fundamentals 完整状态

| Provider | 状态 | 关键字段 |
|---------|------|---------|
| FMP profile | active | 公司名、市值（marketCap）、股价、Beta |
| FMP ratios-ttm | active | PE、PB、PS、EV/EBITDA、净利率、毛利率、EBIT Margin |
| FMP key-metrics-ttm | active（补充） | ROE（仅补缺口，失败静默） |
| SimFin pl | active | Revenue、Gross Profit、Net Income、R&D、SG&A |
| SimFin derived | active | 毛利率、ROE、ROIC、EPS、FCF、EBITDA |

---

## 待 GPT 决策的问题（如有）

目前无阻塞项。以下为可选优化方向：

1. **FMP key-metrics-ttm 其他缺口字段**：该端点还有 `debtToEquityTTM`、`currentRatioTTM`、`freeCashFlowYieldTTM` 等。是否需要补充到 ratios 块？
2. **SimFin FY2025 数据完整性**：FY2025 数据可能部分公司尚未完整入库（SimFin 通常滞后 1-2 个月）。是否需要在 fallback 逻辑中加一个数据完整性检查（如 Revenue > 0）？
