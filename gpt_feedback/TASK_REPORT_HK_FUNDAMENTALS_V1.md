# DanTree 任务报告 — HK Fundamentals Layer Integration v1.0

**日期**：2026-04-10  
**Checkpoint**：`2560d7a4`  
**执行方**：Manus  
**报告对象**：GPT  

---

## 一、OI 决议确认

| OI ID | 状态 | 说明 |
|-------|------|------|
| OI-L12-001 | DEFERRED | ExperienceLayerInsight 继续使用自然语言字符串，本任务未触碰 |
| OI-L12-002-A | DEFERRED | narrative routing 暂不调整 |
| OI-L12-002-B | DEFERRED | synthesis 输出继续自然语言 |
| OI-L12-003-A | DEFERRED | level11Analysis ctx 扩展后续处理 |
| OI-L12-003-B | DEFERRED | `__unifiedSemanticState` attachment 后续处理 |
| OI-001-B | DEFERRED | rpa.ts migration 不在本任务范围 |

所有 DEFERRED 项均未被本任务触碰，状态保持不变。

---

## 二、CHANGELOG 执行情况

### 2.1 ADDED_FILES

| 文件 | 状态 | 说明 |
|------|------|------|
| `china-fundamentals-service/hk_akshare_provider.py` | ✅ 完成 | AKShare 港股 provider，PE/PB 实时计算 |
| `server/hkFundamentals.test.ts` | ✅ 完成 | 14 个集成测试，全部通过 |

### 2.2 MODIFIED_FILES

| 文件 | 状态 | 变更内容 |
|------|------|---------|
| `china-fundamentals-service/main.py` | ✅ 完成 | 新增 `/fundamentals/hk` 端点，HK provider 注册 |
| `china-fundamentals-service/akshare_provider.py` | ✅ 完成 | CN dividendYield 修复（`stock_history_dividend_detail`） |
| `china-fundamentals-service/baostock_provider.py` | ✅ 完成（前置任务） | `bs.login()` 加 15s 线程超时 |
| `server/fetchChinaFundamentals.ts` | ✅ 完成 | 新增 `fetchHKFundamentals()` 函数 |
| `server/dataRoutingOrchestrator.ts` | ✅ 完成 | 新增 HK fundamentals 路由分支（`market === "HK"` 时触发） |
| `server/dataSourceRegistry.ts` | ✅ 完成 | 注册 `hk_akshare` 数据源；`FIELD_FALLBACK_MAP` 添加 `hk_akshare` |
| `client/src/lib/marketUtils.ts` | ✅ 完成（前置任务） | `detectMarketType` 识别 `.SS/.SH/.SZ` → `cn` |
| `client/src/pages/ResearchWorkspaceVNext.tsx` | ✅ 完成（前置任务） | `inferMarketFromKey` 对 `.SS/.SH/.SZ` 返回 `"CN"` |

### 2.3 INTERFACE_CHANGES

无接口变更（NONE，符合预期）。

### 2.4 PIPELINE_STATUS_CHANGES

| Pipeline | 变更前 | 变更后 |
|----------|--------|--------|
| HK fundamentals | INACTIVE（完全缺失） | **ACTIVE** |
| CN fundamentals | 挂起（BaoStock 无超时） | **ACTIVE**（BaoStock 超时 → AKShare fallback） |
| CN dividendYield | null（未实现） | **ACTIVE**（历史分红计算） |
| Market badge (A股) | 错误（显示 US） | **FIXED**（显示 CN） |

---

## 三、实测数据

### 3.1 HK Fundamentals — 1810.HK（小米）

```
source:        hk_akshare
status:        active
coverageScore: 0.7859
period:        FY2025 (2025-12-31)

PE:            19.07  (price 30.9 / EPS 1.62)
PB:            3.01   (price 30.9 / BVPS 10.26)
ROE:           18.31%
ROA:           9.14%
grossMargin:   22.26%
netMargin:     9.09%
revenue:       4572.87亿 HKD
netIncome:     416.43亿 HKD
revenueGrowth: +24.97% YoY
netIncomeGrowth: +76.02% YoY
```

### 3.2 CN Fundamentals — 600916.SS（中国黄金）

```
source:        akshare
status:        fallback_used  (BaoStock 15s 超时 → AKShare)
coverageScore: 0.9455
latency:       ~36s total (15s BaoStock timeout + 18s AKShare)

PE:            45.90
PB:            2.11
ROE:           4.65%
revenue:       457.64亿 CNY
netIncome:     3.35亿 CNY
period:        Q3 2025 (2025-09-30)
```

### 3.3 CN Fundamentals — 600519.SS（贵州茅台）

```
source:        akshare
status:        active
coverageScore: 0.9455
dividendYield: 已修复（从 null → 历史分红计算值）
```

---

## 四、evidenceScore 修复链路（前置任务 CN_FUNDAMENTALS_V1.3）

本任务依赖的前置修复（已在 checkpoint `4f1b3b1b` 完成）：

| 根因 | 修复 |
|------|------|
| `bs.login()` 无超时，在沙箱网络下永久挂起 | `baostock_provider.py` 加 15s 线程超时；`main.py` 加 `asyncio.wait_for(20s)` |
| CN fundamentals fetcher key `"china_fundamentals"` 未在 registry 注册，citation 系统跳过 | `dataRoutingOrchestrator.ts` 改为 `"baostock"` |
| `FIELD_FALLBACK_MAP` 中 `financials.income` 无 `"baostock"`，标记为 missingBlocking (-20分) | `dataSourceRegistry.ts` 四个字段添加 `"baostock"`；`supportsFields` 扩展 |

**evidenceScore 预期变化**：从 9/100 → 40-60/100（待端到端验证）。

---

## 五、TEST_POLICY 执行情况

| 测试类型 | 要求 | 执行情况 |
|---------|------|---------|
| coverage assertions | `>= threshold`（不要 `===`） | ✅ 全部使用 `toBeGreaterThanOrEqual` |
| fallback 必须真实触发 | 不能只单独跑 provider | ✅ `override=baostock_disabled` 测试真实触发 fallback |
| TSC: 0 new errors | 无新增 TS 错误 | ✅ `npx tsc --noEmit` 0 errors |
| 每个 provider 必须有独立验证 | 1810.HK + 0700.HK 独立验证 | ✅ 两个标的独立测试 |
| snapshot vs historical 必须分开验证 | 分开测试 | ✅ 独立 describe 块 |

**测试结果**：`hkFundamentals.test.ts` — **14/14 passed** ✅

```
✓ 1810.HK: coverageScore >= 0.6
✓ 1810.HK: core fields (roe, netMargin, revenue, netIncome) non-null
✓ 1810.HK: PE and PB computed from live price (positive, reasonable range)
✓ 1810.HK: markdown text contains HK-specific labels
✓ 0700.HK: coverageScore >= 0.5
✓ 1810.HK: periodEndDate and periodType populated
✓ 600519.SS: coverageScore >= 0.8 (AKShare high quality)
✓ 600916.SS: returns data (BaoStock timeout → AKShare fallback)
✓ 600519.SS: markdown contains A股-specific labels
✓ 600519: AKShare fallback triggered when BaoStock disabled
✓ 600519: returns null when all CN providers disabled
✓ hk_akshare is registered in DATA_SOURCE_REGISTRY
✓ FIELD_FALLBACK_MAP includes hk_akshare for financials.income
✓ FIELD_FALLBACK_MAP includes hk_akshare for valuation.pe
```

---

## 六、已知缺口与后续建议

### 6.1 HK PS ratio 缺失

`ps=null`（需要 `shares_outstanding`，当前接口不直接返回）。

**建议**：在 `hk_akshare_provider.py` 中通过 `market_cap / revenue` 反推 PS，或从 `ak.stock_individual_basic_info_hk_xq` 获取总股本。优先级：低（PE/PB 已覆盖核心估值需求）。

### 6.2 CN 首次请求延迟 ~36s

BaoStock 在沙箱网络下必然超时（15s），加上 AKShare 拉取（18s），总延迟约 36s。

**建议**：将 BaoStock 超时从 15s 降至 5s（实测必然超时，无需等待），可将总延迟降至 ~23s。或在服务启动时对常用标的预拉取并缓存（TTL 6h）。

### 6.3 HK dividendYield 仍为 null

`stock_hk_dividend_payout_em` 返回空 DataFrame（接口失效）。

**建议**：尝试 `ak.stock_hk_cash_dividend_em()` 或从年报数据中提取分红信息。优先级：低。

### 6.4 evidenceScore 端到端验证待完成

当前 evidenceScore 提升（9/100 → 预期 40-60/100）尚未通过完整分析流程验证（仅 Python 微服务层验证）。

**建议**：以 `600916.SS` 和 `1810.HK` 各发起一次完整分析，截图 evidenceScore 数值，确认修复效果。

---

## 七、文件变更清单（本任务 checkpoint `2560d7a4`）

```
china-fundamentals-service/
  hk_akshare_provider.py    [NEW]  HK AKShare provider
  main.py                   [MOD]  /fundamentals/hk 端点
  akshare_provider.py       [MOD]  CN dividendYield 修复
  baostock_provider.py      [MOD]  bs.login() 15s 超时（前置任务）

server/
  fetchChinaFundamentals.ts [MOD]  fetchHKFundamentals() 函数
  dataRoutingOrchestrator.ts[MOD]  HK fundamentals 路由分支
  dataSourceRegistry.ts     [MOD]  hk_akshare 注册 + FIELD_FALLBACK_MAP
  hkFundamentals.test.ts    [NEW]  14 个集成测试

client/src/
  lib/marketUtils.ts        [MOD]  detectMarketType .SS/.SH/.SZ → cn（前置任务）
  pages/ResearchWorkspaceVNext.tsx [MOD] inferMarketFromKey → CN（前置任务）
```

---

## 八、待 GPT 决策

1. **HK PS ratio 补全**：是否授权在 `hk_akshare_provider.py` 中通过 `market_cap / revenue` 反推 PS？
2. **BaoStock 超时缩短**：是否将 BaoStock 超时从 15s 降至 5s（减少首次请求延迟）？
3. **evidenceScore 端到端验证**：是否需要 Manus 发起完整分析流程截图验证 evidenceScore 提升？
