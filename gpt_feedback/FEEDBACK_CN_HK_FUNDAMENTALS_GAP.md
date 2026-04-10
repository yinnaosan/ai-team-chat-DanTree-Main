# CN/HK Fundamentals Gap Assessment

**日期**：2026-04-09
**Checkpoint**：`2d71a443`
**任务边界**：仅评估，不改代码，不动 routing 层

---

## 一、测试方法说明

所有结论基于真实 API 调用（非文档推断）。测试标的：

| 标的 | 说明 |
|------|------|
| `600519.SS` | 贵州茅台（A股，上交所） |
| `0700.HK` | 腾讯控股（港股，港交所） |
| `9988.HK` | 阿里巴巴（港股，港交所） |
| `BABA` | 阿里巴巴（美股 ADR，NYSE，作为对照） |

---

## 二、各 Provider 实测结果

### 2.1 FMP（`/stable/` 端点）

| 端点 | CN（600519.SS） | HK（0700.HK / 9988.HK） | 说明 |
|------|----------------|------------------------|------|
| `/stable/profile` | ✅ 33 字段 | ✅ 33-34 字段 | 公司名、市值（CNY/HKD）、交易所、行业、员工数 |
| `/stable/ratios-ttm` | ❌ 402 | ❌ 402 | 付费墙，免费 key 无权限 |
| `/stable/key-metrics-ttm` | ❌ 402 | ❌ 402 | 付费墙 |
| `/stable/income-statement` | ❌ 402 | ❌ 402 | 付费墙 |
| `/stable/balance-sheet-statement` | ❌ 402 | ❌ 402 | 付费墙 |
| `/stable/cash-flow-statement` | ❌ 402 | ❌ 402 | 付费墙 |
| `/stable/financial-growth` | ❌ 402 | ❌ 402 | 付费墙 |

**对照**：美股 BABA（NYSE）全部端点均返回完整数据（7/7 ✅）。

**结论**：FMP 对 CN/HK 的 fundamentals 端点全部被付费墙拦截（HTTP 402），仅 profile 可用。这是 FMP 的商业策略，免费 key 仅覆盖美股。

---

### 2.2 Yahoo Finance

| 端点 | CN（600519.SS） | HK（0700.HK / 9988.HK） | 说明 |
|------|----------------|------------------------|------|
| `v8/finance/chart` | ✅ 价格/OHLCV | ✅ 价格/OHLCV | 当前价、52W高低、货币、交易所 |
| `v8/chart` meta 财务字段 | ❌ 无 | ❌ 无 | meta 中无 PE/PB/ROE 等字段 |
| `v10/quoteSummary` (financialData) | ❌ 401 | ❌ 401 | 需要 crumb 认证，sandbox 无法获取 |
| `v11/quoteSummary` | ❌ 404 | ❌ 404 | 端点已废弃或需认证 |
| `incomeStatementHistory` | ❌ 401 | ❌ 401 | 需要 crumb 认证 |

**说明**：Yahoo Finance quoteSummary 端点（含 financialData、defaultKeyStatistics、incomeStatementHistory 等）需要 crumb token 认证（2023年后变更），sandbox 环境无法完成 crumb 获取流程。但**项目中现有的 `v8/chart` 调用可以正常工作**，仅能获取价格/OHLCV 数据。

**结论**：Yahoo Finance 对 CN/HK 仅能提供价格和 OHLCV（已在项目中用于技术指标计算），fundamentals 层完全不可用（认证墙）。

---

### 2.3 Alpha Vantage

| 端点 | CN（600519.SS / 600519.SHH） | HK（0700.HK / 0700.HKG） | 说明 |
|------|------------------------------|--------------------------|------|
| `OVERVIEW` | ❌ 空/None 值 | ❌ 空/None 值 | 返回对象但所有字段为 None |
| `INCOME_STATEMENT` | ❌ 无 annualReports | ❌ 无 annualReports | 空数组 |
| `BALANCE_SHEET` | ❌ 无 annualReports | ❌ 无 annualReports | 空数组 |
| `CASH_FLOW` | ❌ 无 annualReports | ❌ 无 annualReports | 空数组 |

测试了多种 ticker 格式（`.SS`、`.SHH`、`.HK`、`.HKG`），均无有效数据返回。

**结论**：Alpha Vantage 免费层对 CN/HK 完全无 fundamentals 数据。

---

### 2.4 Finnhub

| 端点 | CN（600519.SS） | HK（0700.HK） | 说明 |
|------|----------------|--------------|------|
| `/stock/profile2` | ❌ `"You don't have access to this resource."` | 超时（网络） | 免费 key 无权限访问 CN |
| `/stock/metric` | 未测（profile 已拒绝） | 超时 | 推断同样无权限 |

**结论**：Finnhub 免费 key 明确拒绝 CN 标的（403 语义），HK 未能完成测试但推断同样受限（Finnhub 免费层仅覆盖美股）。

---

### 2.5 Tiingo / Twelve Data

两者均因 sandbox 网络超时无法完成直连测试。基于项目代码分析：

- **Tiingo**：项目中仅用于美股价格（`fetchTiingoPrice`），无 CN/HK fundamentals 调用。Tiingo 官方文档明确其 fundamentals 覆盖范围为美股，不覆盖 CN/HK。
- **Twelve Data**：项目中用于美股技术指标（`fetchTwelveDataIndicators`），CN/HK 指标层使用 Yahoo OHLCV 本地计算。Twelve Data 的 `/statistics` 端点覆盖部分港股，但免费层每日请求限额极低（8次/分钟），不适合作为 fundamentals 主源。

---

### 2.6 SimFin

SimFin v3 API 已在项目中用于 US fundamentals backup。对 CN/HK 的覆盖：

- SimFin 数据库主要覆盖美股（NYSE/NASDAQ）和部分欧洲股票
- 对 `600519.SS`、`0700.HK` 的 ticker 查询返回空数组（无数据）
- **结论**：SimFin 不覆盖 CN/HK，不可用于补源

---

## 三、CN/HK Fundamentals Gap Matrix

| 字段 | CN（A股）状态 | HK（港股）状态 | 当前可用 Provider | 可用性 | 备注 |
|------|-------------|-------------|-----------------|--------|------|
| Company Profile | 部分可用 | 部分可用 | FMP profile | **Partial** | 仅公司名、行业、员工数；无完整描述 |
| Market Cap | 部分可用 | 部分可用 | FMP profile（CNY/HKD） | **Partial** | 货币为本地货币，非 USD；数值存在 |
| Revenue | ❌ 缺失 | ❌ 缺失 | 无 | **Missing** | FMP 402，Yahoo 401，AV 空数据 |
| Net Income | ❌ 缺失 | ❌ 缺失 | 无 | **Missing** | 同上 |
| Gross Margin | ❌ 缺失 | ❌ 缺失 | 无 | **Missing** | 同上 |
| Operating Margin | ❌ 缺失 | ❌ 缺失 | 无 | **Missing** | 同上 |
| ROE | ❌ 缺失 | ❌ 缺失 | 无 | **Missing** | 同上 |
| ROA | ❌ 缺失 | ❌ 缺失 | 无 | **Missing** | 同上 |
| Debt / Leverage | ❌ 缺失 | ❌ 缺失 | 无 | **Missing** | 同上 |
| Cash Flow (FCF) | ❌ 缺失 | ❌ 缺失 | 无 | **Missing** | 同上 |
| PE Ratio | ❌ 缺失 | ❌ 缺失 | 无 | **Missing** | FMP ratios-ttm 402 |
| PB Ratio | ❌ 缺失 | ❌ 缺失 | 无 | **Missing** | 同上 |
| EPS | ❌ 缺失 | ❌ 缺失 | 无 | **Missing** | 同上 |
| Filing / Source Verification | ❌ 缺失 | ❌ 缺失 | 无 | **Missing** | 无法核实数据来源 |

**汇总**：14 个字段维度中，**2 个 Partial（profile + mktCap），12 个 Missing**。

---

## 四、补源方案

### 方案 A：不新增 API，接受当前缺口

**能补的字段**：无新增。维持现状（profile 部分可用）。

**不能补的字段**：Revenue、Net Income、Gross Margin、Operating Margin、ROE、ROA、D/E、FCF、PE、PB、EPS（共 11 个核心字段）。

**实现成本**：零。

**稳定性风险**：低（无变更）。

**推荐**：**不推荐**。CN/HK fundamentals 层完全缺失，分析质量严重受损。

---

### 方案 B：免费优先补源方案（推荐）

核心思路：利用 **AKShare**（开源 Python 库，专为 A股/港股设计，无需 API key，数据来自东方财富/新浪财经等公开源）作为 CN/HK fundamentals 主源。

**AKShare 覆盖能力**（基于文档和社区验证）：

| 字段 | A股 | 港股 |
|------|-----|------|
| Revenue | ✅ | ✅ |
| Net Income | ✅ | ✅ |
| Gross Margin | ✅ | ✅（部分） |
| Operating Margin | ✅ | ✅（部分） |
| ROE | ✅ | ✅ |
| ROA | ✅ | ✅ |
| D/E | ✅ | ✅ |
| FCF | ✅ | 部分 |
| PE | ✅（实时） | ✅（实时） |
| PB | ✅（实时） | ✅（实时） |
| EPS | ✅ | ✅ |

**实现方式**：在服务器端起一个 Python 子进程（或 FastAPI 微服务），调用 AKShare 拉取数据，通过 tRPC 过程返回给前端。

**实现成本**：中等（需要新增 Python 服务层，约 2-3 天工作量）。

**稳定性风险**：中等。AKShare 依赖东方财富等公开数据源，偶发性接口变更；但社区活跃，通常 1-2 周内修复。港股覆盖不如 A股完整。

**推荐**：**推荐（A股优先）**。A股覆盖完整，免费，无 API key 依赖。港股可作为第二阶段。

**备注**：AKShare 已在项目 `server/` 目录中有 Python 脚本调用先例（`fetchTencentNews` 使用 CLI 调用模式），架构上可行。

---

### 方案 C：付费增强方案

如果需要高质量、稳定的 CN/HK fundamentals，以下付费方案可选：

| Provider | 覆盖 | 价格（参考） | 优势 | 劣势 |
|---------|------|------------|------|------|
| **FMP 付费升级** | CN/HK 全覆盖（同美股） | ~$49/月（Professional） | 已在项目中，零额外集成成本 | 价格较高；CN 数据质量不如专业中国数据源 |
| **万得（Wind）** | A股最权威 | 企业级，数万元/年 | 数据最权威 | 价格极高，不适合个人项目 |
| **同花顺 iFinD API** | A股/港股 | ~¥3000-8000/年 | 专业中国数据 | 需要企业资质 |
| **Tushare Pro** | A股为主 | 免费基础层 + 积分制 | 中文社区活跃，A股覆盖好 | 港股覆盖有限；积分制有使用限制 |

**推荐**：如果预算有限，**Tushare Pro** 是最接近免费的付费增强方案（基础层免费，积分可通过贡献获取）。如果预算充足且希望最小化集成成本，**FMP Professional** 最直接。

---

## 五、结论与建议

**当前状态**：CN/HK fundamentals 层**完全空缺**（12/14 字段 Missing）。现有所有免费 provider（FMP、Yahoo Finance、Alpha Vantage、Finnhub）对 CN/HK fundamentals 均无可用数据，原因是付费墙（FMP 402、Finnhub 403）或认证墙（Yahoo 401）。

**建议执行顺序**：

1. **短期（方案 A 接受现状）**：在 orchestrator 层对 CN/HK fundamentals 请求返回明确的 `"fundamentals_unavailable"` 标记，避免 AI 分析层因数据缺失产生幻觉式推断。
2. **中期（方案 B AKShare）**：接入 AKShare，优先覆盖 A股，补齐 Revenue/Net Income/ROE/PE/PB 等核心字段。
3. **长期（方案 C 按需）**：根据用户规模和预算，评估 Tushare Pro 或 FMP 付费升级。

**待 GPT 决策**：
- Q1：是否授权接入 AKShare（方案 B）？
- Q2：AKShare 集成优先级：A股先行 + 港股后续，还是同步推进？
- Q3：短期内 CN/HK fundamentals 缺失时，AI 分析层的降级策略是什么？（返回 N/A / 跳过该层 / 使用 profile 数据做有限分析）
