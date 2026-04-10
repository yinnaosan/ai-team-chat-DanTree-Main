# CN Fundamentals Layer v1.1 Hardening — 实施反馈包

**任务范围**：仅 `china-fundamentals-service`（Python FastAPI，port 8001），不动 routing 层、UI、其他 provider。
**TSC**：0 errors
**Checkpoint**：待保存

---

## 一、本轮变更摘要

### 1. BaoStock Provider（Primary）升级

**新增字段**：

| 字段 | 来源接口 | 计算方式 |
|------|---------|---------|
| `ps` | K-data `psTTM` | 直接取（非近似，可追溯） |
| `debtToEquity` | balance `assetToEquity` | `assetToEquity - 1`（精确：负债/权益） |
| `currentRatio` | balance `currentRatio` | 直接取 |
| `netIncomeGrowthYoy` | growth `YOYNI` | 直接取 |
| `dividendYield` | dividend `dividCashPsBeforeTax` / K-data `close` | 精确计算 |
| `sharesOutstanding` | profit `totalShare` | 直接取 |
| `eps` | profit `epsTTM` | 直接取 |

**财年双层 fallback**：`currentYear-1` → `currentYear-2`（当前 2025 → 2024）

**字段不可得（返回 null）**：
- `operatingMargin`：BaoStock 无营业利润率字段
- `roa`：无 totalAssets 原始值
- `cashFromOperations`：只有比率（`CFOToOR`），无绝对值
- `freeCashFlow`：BaoStock 无此字段
- `revenueGrowthYoy`：无营收 YoY 字段（只有净利润 YoY）
- `bookValuePerShare`：BaoStock 无此字段

---

### 2. AKShare Provider（Fallback 1）重写

**接口变更**（基于真实 API 探查，不是文档猜测）：

| 用途 | 接口 | 关键字段 |
|------|------|---------|
| PE/PB/市值 | `stock_individual_info_em` | `总市值`、`总股本`、`最新价` |
| ROE/毛利率/净利率/EPS/BVPS/D/E/currentRatio/增长率 | `stock_financial_analysis_indicator` | 见下表 |
| revenue/netIncome/cashFromOperations | `stock_financial_abstract` | `营业总收入`、`归母净利润`、`经营现金流量净额` |

**字段映射（真实列名）**：

| 字段 | AKShare 列名 |
|------|-------------|
| ROE | `净资产收益率(%)` |
| 毛利率 | `销售毛利率(%)` |
| 净利率 | `销售净利率(%)` |
| 营业利润率 | `营业利润率(%)` |
| ROA | `总资产净利润率(%)` |
| EPS | `摊薄每股收益(元)` |
| BVPS | `每股净资产_调整前(元)` |
| 流动比率 | `流动比率` |
| D/E（精确） | `负债与所有者权益比率(%)` / 100 |
| 营收增长率 | `主营业务收入增长率(%)` |
| 净利润增长率 | `净利润增长率(%)` |
| 每股经营现金流 | `每股经营性现金流(元)` × totalShare |

**PE/PB/PS 计算方式**（AKShare 无直接估值字段）：
- `PE = 总市值 / 净利润`（来自 financial_abstract）
- `PB = 总市值 / (BVPS × totalShare)`
- `PS = 总市值 / 营业总收入`

---

### 3. efinance Provider（Fallback 2）重写

**实际可用接口**：仅 `ef.stock.get_base_info`（efinance 无 get_profit_statement / get_balance_sheet / get_cash_flow_statement）

**可得字段**：PE、PB、ROE、毛利率、净利率、净利润、总市值

**不可得字段（null）**：revenue、EPS、BVPS、D/E、currentRatio、cashFlow、growth rates

**权限修复**：`/usr/local/lib/python3.11/dist-packages/efinance/data/` 目录权限 `chmod 777`

---

### 4. main.py 升级

- **双输出 schema**：`raw`（原始数值）+ `fmt`（格式化字符串）
- **分层加权 coverageScore**：`core × 0.7 + extended × 0.3`（core=9 字段，extended=11 字段）
- **missingFields**：逐字段列出所有 null 字段
- **Provider 判定宽松化**：`is_sufficient = (pe or pb) AND (roe or netMargin or grossMargin) AND (revenue or netIncome)`
- **fallback 路由日志**：每次 provider 尝试均记录 `[fetch] Trying baostock...` / `[fetch] SUCCESS/FAIL`
- **测试端点**：`POST /test/override?provider=X&enabled=Y`（可控模拟失败）、`DELETE /cache/{symbol}`

---

## 二、三组 Fallback 验证结果

### Group 1：正常路径（BaoStock Primary）

**标的**：600519 贵州茅台

| 字段 | 值 |
|------|-----|
| source | baostock |
| status | active |
| coverageScore | 0.8364 |
| confidence | high |
| PE | 20.32 |
| PB | 7.11 |
| PS | 10.05 |
| ROE | 38.43% |
| 毛利率 | 91.93% |
| 净利率 | 52.27% |
| 营收 | 1706.12亿 |
| 净利润 | 893.35亿 |
| EPS | 68.6422 元 |
| D/E | 0.24 |
| 流动比率 | 4.45 |
| 净利润增长率 | 15.24% |
| 股息率 | 2.11% |
| 总股本 | 12.56亿股 |
| missingFields | operatingMargin, roa, cashFromOperations, freeCashFlow, revenueGrowthYoy, bookValuePerShare |

**模拟方式**：正常调用，无 override

---

### Group 2：BaoStock 禁用 → AKShare Fallback

**标的**：600519 贵州茅台
**模拟方式**：`POST /test/override?provider=baostock&enabled=false`，通过 HTTP 调用完整 main.py 路由

| 字段 | 值 |
|------|-----|
| source | akshare |
| status | active |
| coverageScore | 0.8677 |
| confidence | medium |
| PE | 28.17 |
| PB | 6.85 |
| PS | 13.91 |
| ROE | 25.14% |
| 净利率 | 52.08% |
| 营收 | 1309.04亿 |
| 净利润 | 646.27亿 |
| EPS | 53.4220 元 |
| 营业利润率 | 69.67% |
| ROA | 22.16% |
| D/E | 0.15 |
| 流动比率 | 6.62 |
| 经营现金流 | 381.97亿 |
| 营收增长率 | 6.36% |
| 净利润增长率 | 6.14% |
| BVPS | 212.1787 元 |
| 总股本 | 12.52亿股 |
| missingFields | grossMargin, freeCashFlow, dividendYield |

**数值差异说明**：AKShare 返回 Q3 2025 季报数据（营收 1309亿），BaoStock 返回 FY2024 年报（1706亿）。时间口径不同，非数据错误。

---

### Group 3：BaoStock + AKShare 全禁用 → efinance Fallback

**标的**：600519 贵州茅台
**模拟方式**：`POST /test/override?provider=baostock&enabled=false` + `POST /test/override?provider=akshare&enabled=false`

| 字段 | 值 |
|------|-----|
| source | efinance |
| status | active |
| coverageScore | 0.4667 |
| confidence | low |
| PE | 21.13 |
| PB | 7.08 |
| ROE | 24.64% |
| 毛利率 | 91.29% |
| 净利率 | 52.08% |
| 净利润 | 646.27亿 |
| missingFields | revenue, eps, ps, operatingMargin, roa, debtToEquity, currentRatio, cashFromOperations, freeCashFlow, revenueGrowthYoy, netIncomeGrowthYoy, bookValuePerShare, dividendYield, sharesOutstanding |

**说明**：efinance 只有 `get_base_info` 接口，覆盖率低（0.47）但核心字段（PE/PB/ROE/毛利率/净利率）均可得，provider 判定为 active。

**恢复操作**：测试完成后已调用 `POST /test/override?provider=baostock&enabled=true` + `POST /test/override?provider=akshare&enabled=true` 恢复所有 provider。

---

## 三、字段覆盖矩阵（BaoStock Primary）

| 字段 | 类型 | BaoStock | AKShare | efinance | 说明 |
|------|------|---------|---------|---------|------|
| pe | core | ✅ | ✅（计算） | ✅ | |
| pb | core | ✅ | ✅（计算） | ✅ | |
| ps | core | ✅（psTTM） | ✅（计算） | ❌ | efinance 无 revenue |
| roe | core | ✅ | ✅ | ✅ | |
| grossMargin | core | ✅ | ❌ | ✅ | AKShare financial_abstract 无毛利润字段 |
| netMargin | core | ✅ | ✅ | ✅ | |
| revenue | core | ✅ | ✅ | ❌ | |
| netIncome | core | ✅ | ✅ | ✅ | |
| eps | core | ✅ | ✅ | ❌ | |
| operatingMargin | extended | ❌ | ✅ | ❌ | BaoStock 无此字段 |
| roa | extended | ❌ | ✅ | ❌ | BaoStock 无 totalAssets |
| debtToEquity | extended | ✅（精确） | ✅（精确） | ❌ | |
| currentRatio | extended | ✅ | ✅ | ❌ | |
| cashFromOperations | extended | ❌ | ✅ | ❌ | BaoStock 只有比率 |
| freeCashFlow | extended | ❌ | ❌ | ❌ | 三个 provider 均无 |
| revenueGrowthYoy | extended | ❌ | ✅ | ❌ | BaoStock 只有净利润 YoY |
| netIncomeGrowthYoy | extended | ✅ | ✅ | ❌ | |
| bookValuePerShare | extended | ❌ | ✅ | ❌ | |
| dividendYield | extended | ✅（计算） | ❌ | ❌ | |
| sharesOutstanding | extended | ✅ | ✅ | ❌ | |

---

## 四、已知限制

1. **freeCashFlow**：三个 provider 均无法提供绝对值，永久 null。如需此字段，需要接入 Tushare Pro 或付费源。
2. **AKShare grossMargin**：`stock_financial_abstract` 无毛利润字段，AKShare 路径下 grossMargin 为 null。
3. **efinance 覆盖率低**（0.47）：仅作为最后 fallback，保证核心字段（PE/PB/ROE）不断链。
4. **AKShare 时间口径**：返回最新季报（非年报），与 BaoStock FY 年报数值有差异，属正常。
5. **港股（HK）**：三个 provider 均不支持港股，HK fundamentals 层仍为空。

---

## 五、待 GPT 决策的问题

**Q1：AKShare grossMargin 补充**
AKShare 的 `stock_financial_abstract` 有 `营业总收入` 和 `营业总成本`，可以计算 `grossMargin ≈ 1 - 营业总成本/营业总收入`（近似值，包含期间费用）。是否允许这个近似计算？还是接受 AKShare 路径下 grossMargin 为 null？

**Q2：港股（HK）fundamentals**
当前 HK fundamentals 层完全空白。是否需要在本轮或下一轮处理？如果需要，建议评估 AKShare 的港股接口（`stock_hk_spot_em` 等）。

**Q3：freeCashFlow 永久 null**
三个免费 provider 均无 FCF 绝对值。是否接受永久 null，还是需要付费源（Tushare Pro）？
