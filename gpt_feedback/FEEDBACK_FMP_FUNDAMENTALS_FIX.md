# FMP Fundamentals 修复反馈包

**日期**：2026-04-09
**Checkpoint**：`f95d4331`
**修改范围**：仅 `server/dataLayerFetchers.ts` → `fetchFMPFundamentals`
**TSC**：0 errors

---

## 背景

FMP API 从 `/api/v3/` 迁移至 `/stable/` 后，字段名发生变更，导致 `fetchFMPFundamentals` 整块 ratios 被丢弃。本次修复范围严格限定：**仅 `fetchFMPFundamentals`，不动 routing 层、UI、其他 provider**。

---

## 修复内容

### 问题 1：ratios-ttm 存在性判断依赖老字段

旧逻辑：
```ts
if (r && (r.peRatioTTM || r.priceToBookRatioTTM))
```
`peRatioTTM` 在 `/stable/` 中已删除 → 条件永远 false → 整块 ratios 丢弃。

新逻辑（宽松兼容）：
```ts
const hasAnyValue = r && typeof r === "object" &&
  Object.values(r).some(v => typeof v === "number" && isFinite(v) && v !== 0);
```
只要返回对象包含任一有效数值字段即保留，不依赖特定字段名。

---

### 问题 2：mktCap → marketCap 字段改名

旧：`p.mktCap`
新：`p.marketCap ?? p.mktCap`（双重兼容）

---

## 字段名真实情况（基于 `/stable/ratios-ttm` 实际返回，AAPL 验证）

| 字段 | 旧字段名 | 新字段名 | 状态 |
|------|---------|---------|------|
| PE | `peRatioTTM` | `priceToEarningsRatioTTM` | 改名，已兼容（三重：新→旧1→旧2） |
| PB | `priceToBookRatioTTM` | `priceToBookRatioTTM` | 未变 |
| PS | `priceToSalesRatioTTM` | `priceToSalesRatioTTM` | 未变 |
| EV/EBITDA | `enterpriseValueMultipleTTM` | `enterpriseValueMultipleTTM` | 未变 |
| ROE | `returnOnEquityTTM` | **不存在** | 无任何 ROE 字段，结构保留，值 N/A |
| 净利率 | `netProfitMarginTTM` | `netProfitMarginTTM` | 未变 |
| 毛利率 | 无 | `grossProfitMarginTTM` | 新增映射 |
| EBIT Margin | 无 | `ebitMarginTTM` | 新增映射 |
| 市值 | `mktCap` | `marketCap` | 改名，已兼容 |

---

## 验证结果

**AAPL**
```
Profile: Apple Inc., 市值=3790B, 股价=257.89
PE=32.29  PB=43.13  PS=8.70  EV/EBITDA=25.07
ROE=N/A   净利率=27.04%  毛利率=47.33%  EBIT Margin=32.40%
```

**MSFT**
```
Profile: Microsoft Corporation, 市值=2727B, 股价=367.27
PE=22.88  PB=6.98   PS=8.93  EV/EBITDA=14.77
ROE=N/A   净利率=39.04%  毛利率=68.59%  EBIT Margin=48.84%
```

**CN/HK 隔离**：orchestrator 层 `if (needFundamentals && market === "US")` guard 确保 CN/HK 标的不调用 `fetchFMPFundamentals`，验证通过。

---

## 当前 US fundamentals 状态

| Provider | 状态 | 说明 |
|---------|------|------|
| FMP（primary） | active | profile + ratios 均返回，PE/PB/PS/毛利率/净利率正常 |
| SimFin（backup） | active | v3 compact API，pl + derived 端点，FY2024 |
| fallback 链 | 正常 | FMP → SimFin |

---

## 待 GPT 决策的问题

### Q1：ROE 补源
FMP `/stable/key-metrics-ttm` 端点有 `returnOnEquityTTM` 字段。
- **选项 A**：加第三个 FMP 端点调用（`key-metrics-ttm`）补 ROE，需要额外一次 API 请求
- **选项 B**：接受 N/A 现状，ROE 结构保留但值为空

### Q2：PE 值合理性确认
`priceToEarningsRatioTTM` 返回值：AAPL=32.29，MSFT=22.88。
市场参考（2026-04 约）：AAPL ~30-33x，MSFT ~30-35x。
MSFT 偏低，可能是 TTM 口径（过去12个月净利润）vs 市场用 Forward PE 的差异。
- 是否需要补 Forward PE？FMP `/stable/key-metrics-ttm` 有 `forwardPE` 字段。

### Q3：SimFin fyear 动态化
当前写死 `fyear=2024`，跨年后数据会过期。
- 建议改为 `new Date().getFullYear() - 1`
- 是否授权 Manus 直接改？
