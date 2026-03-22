# 投资研究助手 — 系统诊断报告（2026-03-22）

## 一、项目概况

| 项目 | 信息 |
|------|------|
| 项目名 | ai-team-chat（投资研究助手） |
| 技术栈 | React 19 + Tailwind 4 + Express 4 + tRPC 11 + Drizzle ORM + TiDB |
| 部署域名 | aiteamchat-sfk3bwgk.manus.space / aiteamchat-8wang6.manus.space |
| 最新版本 | 1c34082e |
| 代码总量 | server 约 18,000 行 / client 约 7,000 行 |

**核心功能**：用户输入投资分析任务（如"分析苹果 2025 年 Q1 财报"），系统通过三步骤流程（Step0 分类 → Step1 规划 → Step2 数据收集 → Step3 LLM 分析输出）自动调用 28 个数据源 API，收集结构化金融数据，最终由 LLM 生成带引用的投资分析报告。

---

## 二、核心架构 — 三步骤任务执行流程

### 2.1 完整执行链路（routers.ts `runCollaborationFlow`，2614 行）

```
用户提交任务 → submitTask (tRPC mutation)
  ↓
Step0: 任务分类（stock_analysis / macro_analysis / crypto_analysis / general_research）
  - 使用 invokeLLM 判断任务类型
  - 从任务描述中提取股票代码（extractTickers from yahooFinance.ts）
  ↓
Step1: 资源规划（GPT 或 invokeLLM）
  - 输入：任务描述 + 用户配置（investmentRules, taskInstruction）
  - 输出：RESOURCE_SPEC JSON（包含 apis[], hypothesisFields[], chartRequests[]）
  - 解析为 resourcePlan 对象（parseResourcePlan 函数）
  - 关键字段：dataSources.deepFinancials, dataSources.secFilings, dataSources.newsAndSentiment, dataSources.macroData
  ↓
Step2: 并行数据收集（Promise.allSettled）
  - 基础层（始终执行）：Yahoo Finance, FRED, World Bank, IMF
  - 深度财务层（deepFinancials=true 时）：FMP, SimFin, Tiingo, Finnhub, Polygon, Alpha Vantage
  - SEC 文件层（secFilings=true 时）：SEC EDGAR
  - 新闻情绪层（newsAndSentiment=true 时）：NewsAPI, Marketaux, GDELT
  - 宏观数据层（macroData=true 时）：ECB, BOE, HKMA
  - 搜索层（已关闭）：Serper, Tavily
  ↓
  数据合并为 structuredDataBlock（各 API 返回的 Markdown 格式数据拼接）
  ↓
Step2-B: LLM 数据分析（manusReport）
  - 输入：structuredDataBlock + webSearchStr（已关闭=空） + 用户配置
  - 输出：DATA_REPORT + [EVIDENCE_PACKET] JSON
  ↓
Step2-C: 证据验证（buildEvidencePacket from evidenceValidator.ts）
  - 输入：manusReport, hypothesisFields, fieldCoverage, apiHitStats
  - 输出：evidenceScore, outputMode (decisive/directional/framework_only), missingBlocking/Important/Optional
  ↓
Step3: 最终分析输出（流式 LLM 调用）
  - 输入：structuredDataBlock + manusReport + evidencePacket + 用户配置
  - 根据 outputMode 选择输出模板（decisive=完整分析 / directional=方向性建议 / framework_only=研究框架）
  - 流式写入消息，包含 metadata（evidenceScore, outputMode, apiSources, citationHits 等）
```

### 2.2 关键决策点

| 决策点 | 位置 | 当前逻辑 | 问题 |
|--------|------|----------|------|
| deepFinancials 是否启用 | routers.ts ~行 680 | 默认 false，依赖 Step1 GPT 输出的 RESOURCE_SPEC 中是否包含 fmp/simfin 等关键词 | **已修复**：当检测到 primaryTicker 时自动设为 true |
| evidenceScore 计算 | evidenceValidator.ts | **新逻辑**：基于 apiHitStats（API 实际命中数）计算，每个命中源 +12 分，≥3 源 +10 多样性加分 | **刚修复（18:14），尚未在实际任务中验证** |
| outputMode 判定 | evidenceValidator.ts | score ≥ 60 → decisive, ≥ 30 → directional, < 30 → framework_only | 阈值是否合理需要实际验证 |
| 搜索引擎调用 | routers.ts ~行 700, 920 | **已关闭**：两处搜索调用替换为 `Promise.resolve("")` | Serper/Tavily 全部跳过 |

---

## 三、数据源注册表（dataSourceRegistry.ts，1011 行）

### 3.1 已注册的 28 个数据源

| ID | 名称 | 类别 | costClass | 状态 |
|----|------|------|-----------|------|
| yahoo_finance | Yahoo Finance | 市场数据 | free | 有时 latencyMs=-1（被跳过） |
| finnhub | Finnhub | 市场数据 | free | 正常（180ms） |
| fmp | FMP | 市场数据 | freemium | 正常（400ms） |
| polygon | Polygon.io | 市场数据 | freemium | 正常（397ms） |
| alpha_vantage | Alpha Vantage | 市场数据 | freemium | 未确认 |
| tiingo | Tiingo | 市场数据 | freemium | 有时 fetch failed |
| simfin | SimFin | 财务报表 | freemium | **429 配额耗尽** |
| sec_edgar | SEC EDGAR | 监管文件 | free | 未确认 |
| fred | FRED | 宏观经济 | free | 未确认 |
| world_bank | World Bank | 宏观经济 | free | 未确认 |
| imf | IMF | 宏观经济 | free | 未确认 |
| ecb | ECB | 宏观经济 | free | 未确认 |
| boe | BOE | 宏观经济 | free | 未确认 |
| hkma | HKMA | 宏观经济 | free | 未确认 |
| news_api | NewsAPI | 新闻情绪 | freemium | 正常（68ms） |
| marketaux | Marketaux | 新闻情绪 | freemium | 正常（315ms） |
| gdelt | GDELT | 新闻情绪 | free | **429** |
| coingecko | CoinGecko | 加密货币 | free | 未确认 |
| baostock | Baostock | A股数据 | free | 未确认 |
| hkex | HKEX | 港股数据 | free | 未确认 |
| congress | Congress.gov | 政策法规 | free | 未确认 |
| court_listener | CourtListener | 法律案例 | free | 未确认 |
| gleif | GLEIF | 企业信息 | free | 未确认 |
| eur_lex | EUR-Lex | 欧盟法规 | free | 正常（0ms） |
| tavily | Tavily | 网页搜索 | paid | **已关闭（全部 403）** |
| serper | Serper | 网页搜索 | paid | **已关闭** |
| jina | Jina Reader | 网页抓取 | free | 未确认 |
| messari | Messari | 加密研究 | freemium | 未确认 |

### 3.2 FIELD_FALLBACK_MAP（字段级降级链）

```
blocking 字段（缺失则阻断输出）：
- price.current → sources: [yahoo_finance, fmp, finnhub, polygon, tiingo, coingecko]
- valuation.pe → sources: [fmp, tiingo, yahoo_finance, simfin, alpha_vantage]
- financials.income → sources: [fmp, sec_edgar, simfin, tiingo, alpha_vantage]

important 字段（缺失扣分但不阻断）：
- financials.balance_sheet → sources: [fmp, simfin, sec_edgar, tiingo]
- financials.cash_flow → sources: [fmp, simfin, sec_edgar, tiingo]
- macro.gdp → sources: [fred, world_bank, imf]
- macro.inflation → sources: [fred, world_bank, imf, ecb]
- macro.interest_rate → sources: [fred, ecb, boe, hkma]
- news.sentiment → sources: [marketaux, news_api, gdelt]

optional 字段（缺失轻微扣分）：
- insider.transactions → sources: [finnhub, sec_edgar]
- analyst.consensus → sources: [finnhub, fmp, polygon]
- technical.indicators → sources: [yahoo_finance, alpha_vantage, polygon]
```

---

## 四、关键模块代码逻辑

### 4.1 evidenceValidator.ts（513 行）— 证据评分与输出模式判定

```typescript
// 核心评分函数（刚重构，尚未实际验证）
function computeEvidenceScore(params): number {
  let score = 0;
  
  // 维度1：API 实际命中数据（主要依据）
  // apiHitStats = { hitCount, hitSourceIds, totalDataLength, whitelistedHitCount }
  score += apiHitStats.hitCount * 12;  // 每个命中源 +12 分
  if (apiHitStats.hitCount >= 3) score += 10;  // 多样性加分
  if (apiHitStats.whitelistedHitCount > 0) score += 5;  // 白名单加分
  
  // 维度2：LLM 解析的 facts（加分项，不再是唯一依据）
  score += facts.length * 3;
  // fresh/stale 调整...
  
  // 扣分项
  score -= hardMissingCount * 30;  // blocking 字段缺失重罚
  score -= missingOptionalCount * 1;  // optional 字段轻微扣分
  
  return Math.max(0, Math.min(100, score));
}

// 输出模式判定
function determineOutputMode(score, hardMissingCount, taskType): string {
  if (taskType === "stock_analysis" && hardMissingCount === 0) {
    // 股票分析特殊豁免：只要没有 blocking 缺失，至少 directional
    if (score >= 40) return "decisive";
    return "directional";
  }
  if (score >= 60) return "decisive";
  if (score >= 30) return "directional";
  return "framework_only";
}
```

**问题**：这个新评分逻辑刚在 18:14 修改，用户在 18:07 提交的任务使用的是旧逻辑（完全依赖 LLM facts，facts=0 → score=0）。

### 4.2 routers.ts Step2 数据收集（关键代码段）

```typescript
// 行 ~680: 智能默认值覆盖（刚添加）
if (primaryTicker) {
  resourcePlan.dataSources.deepFinancials = true;
  resourcePlan.dataSources.secFilings = true;
  resourcePlan.dataSources.newsAndSentiment = true;
}
if (taskType === "macro_analysis") {
  resourcePlan.dataSources.macroData = true;
}

// 行 ~700: 搜索已关闭
const searchPromise = Promise.resolve("");  // 原来是 searchForTask(...)

// 行 ~750: 基础数据收集（始终执行）
const [yahooResult, fredResult, worldBankResult, imfResult] = await Promise.allSettled([
  fetchStockDataForTask(taskDescription),
  fetchFredData(...),
  fetchWorldBankData(...),
  fetchImfData(...)
]);

// 行 ~800: 深度财务数据（deepFinancials=true 时）
if (resourcePlan.dataSources.deepFinancials && primaryTicker) {
  const [fmpResult, simfinResult, tiingoResult, finnhubResult, polygonResult, alphaVantageResult] = 
    await Promise.allSettled([
      fetchFmpData(primaryTicker),
      fetchSimFinData(primaryTicker),
      fetchTiingoData(primaryTicker),
      fetchFinnhubData(primaryTicker),
      fetchPolygonData(primaryTicker),
      fetchAlphaVantageData(primaryTicker)
    ]);
  // 格式化并追加到 structuredDataBlock
}

// 行 ~920: 精炼搜索（已关闭）
const refinedSearchPromise = Promise.resolve("");  // 原来是 searchFinancialNews(...)
```

### 4.3 Yahoo Finance（yahooFinance.ts，221 行）— extractTickers

```typescript
// 从任务描述中提取股票代码
export function extractTickers(text: string): string[] {
  // 1. 中文公司名映射（苹果→AAPL, 特斯拉→TSLA, 微软→MSFT 等 50+ 映射）
  // 2. 正则匹配 $AAPL 或 AAPL 格式
  // 3. 港股匹配 XXXX.HK（已修复：过滤 2020-2030 年份误匹配）
  // 4. A股匹配 6位数字.SH/.SZ
  
  // 问题：getStockData 只调用 get_stock_chart + get_stock_insights
  // 不调用财务报表 API，只返回价格和技术面简评
}
```

### 4.4 FMP API（fmpApi.ts，419 行）— 核心财务数据源

```typescript
export async function fetchFmpData(ticker: string): Promise<string> {
  // 并行获取 5 类数据：
  // 1. 实时报价（/quote/AAPL）
  // 2. 公司概况（/profile/AAPL）
  // 3. 损益表（/income-statement/AAPL?period=annual&limit=4）
  // 4. 资产负债表（/balance-sheet-statement/AAPL?period=annual&limit=4）
  // 5. 现金流量表（/cash-flow-statement/AAPL?period=annual&limit=4）
  
  // 注意：只获取 annual 数据，不获取 quarterly 数据！
  // 这是用户问"Q1 财报"时数据不足的原因之一
}
```

### 4.5 SimFin API（simfinApi.ts，470 行）— 季度数据能力

```typescript
// SimFin 有季度数据获取能力（fetchQuarterlyIncome）
// 但当前 SimFin API Key 配额已耗尽（429 错误）
// 即使可用，也只获取最近 4 个季度的损益表
```

### 4.6 Tiingo API（tiingoApi.ts，287 行）— 季度财报能力

```typescript
// Tiingo 有季度财务报表获取能力（/tiingo/fundamentals/{ticker}/statements）
// 获取最近 4 个季度的完整财报（损益表 + 资产负债表 + 现金流）
// 但有时 fetch failed（网络不稳定）
```

### 4.7 搜索模块（tavilySearch.ts，499 行）— 已关闭

```typescript
// Serper: 3 个 API Key 轮换
// Tavily: 4 个 API Key 轮换
// 已知 Bug（未修复，因为已关闭）：
// 1. Serper 返回 0 结果时被误判为引擎故障，设置 serperAllDown=true
// 2. serperAllDown 没有自动恢复机制，一旦设为 true 就永久失效
// 3. Tavily 4 个 Key 全部 403（可能是配额或封禁）
```

---

## 五、反复出现的核心问题

### 问题 1：evidenceScore 始终为 0 → outputMode 始终为 framework_only

**症状**：每次分析任务都返回"当前证据不足，以下为研究框架而非投资建议"，即使 API 返回了大量有效数据。

**根因链**：
1. **旧逻辑**：evidenceScore 完全依赖 Step2-B LLM 输出的 `[EVIDENCE_PACKET]` JSON 中的 `facts` 数组
2. LLM 经常不按格式输出（格式不标准、缺少 JSON 块、或 facts 为空数组）
3. facts = 0 → 基础分 = 0 → 加上 optional 字段扣分 → score = 0
4. score = 0 → outputMode = "framework_only"
5. Step3 prompt 收到 framework_only → 只输出研究框架，不给出实质性分析

**修复状态**：已重构为双维度评分（API 命中数为主 + LLM facts 为辅），但**尚未在实际任务中验证**。

### 问题 2：deepFinancials 默认为 false → FMP/SimFin 等核心数据源从未被调用

**症状**：系统只有 Yahoo Finance 的价格数据（无财务报表），缺少损益表/资产负债表/现金流等关键数据。

**根因**：
1. `parseResourcePlan` 中 `deepFinancials` 默认为 `false`
2. 只有当 Step1 GPT 输出的 RESOURCE_SPEC JSON 中包含 `fmp`、`simfin` 等 API 名称时才变为 `true`
3. 如果 Step1 GPT 没有在 JSON 中列出这些 API，deepFinancials 保持 false
4. FMP、SimFin、Tiingo、Finnhub、Polygon、Alpha Vantage 全部被跳过

**修复状态**：已添加智能默认值覆盖（检测到 primaryTicker 时自动启用），但**尚未在实际任务中验证**。

### 问题 3：FMP 只获取年度数据，不获取季度数据

**症状**：用户问"分析苹果 2025 年 Q1 财报"，但 FMP 只返回年度财务数据（FY2022-FY2025），没有季度数据。

**根因**：`fetchFmpData` 中 `period=annual`，没有 `period=quarter` 的调用。

**修复状态**：**未修复**。需要在 fmpApi.ts 中添加季度数据获取。

### 问题 4：SimFin API 配额耗尽（429）

**症状**：SimFin 所有请求返回 429 "You have exhausted your API Request Quota"。

**根因**：免费 API Key 的请求配额用完了。

**修复状态**：**未修复**。需要升级 SimFin API Key 或添加请求缓存/限流。

### 问题 5：Yahoo Finance latencyMs = -1（被跳过）

**症状**：Yahoo Finance 有时返回 latencyMs=-1，意味着请求被跳过或超时。

**根因**：不确定。可能是 `callDataApi` 的超时设置太短，或者 Yahoo Finance API 间歇性不可用。

**修复状态**：**未调查**。

### 问题 6：Tiingo 间歇性 fetch failed

**症状**：Tiingo 有时所有请求都返回 "TypeError: fetch failed"。

**根因**：网络连接不稳定或 Tiingo 服务器间歇性拒绝连接。

**修复状态**：**未修复**。需要添加重试机制。

### 问题 7：搜索引擎全线崩溃（已关闭但未根治）

**症状**：Serper 返回 0 结果 → 误判为引擎故障 → serperAllDown=true → 降级到 Tavily → 全部 403。

**根因**：
1. `searchFromUserLibrary` 用 `site:aqr.com OR site:ssrn.com` 限定域名搜索 → 0 结果
2. 0 结果被判定为 Serper 失败 → `serperAllDown = true`（永久）
3. Tavily 4 个 Key 全部 403

**修复状态**：**已关闭搜索功能**（绕过），但 bug 未修复。

### 问题 8：extractTickers 年份误匹配

**症状**："分析苹果 2025 年 Q1 财报"中的"2025"被匹配为港股代码 2025.HK。

**修复状态**：**已修复**（过滤 2020-2030 范围的数字）。

---

## 六、数据库 Schema（drizzle/schema.ts，228 行）

```sql
-- 核心表结构
users: id, openId, name, email, role(admin/user), loginMethod, lastSignedIn
conversations: id, title, userId, groupId, lastMessageAt, analysisMode, isArchived
conversation_groups: id, name, userId, color, sortOrder
messages: id, taskId, userId, role(user/assistant/system), content, conversationId, metadata(JSON)
tasks: id, description, status(pending/gpt_planning/manus_working/manus_analyzing/gpt_reviewing/streaming/completed/failed), conversationId, userId, manusResult, gptSummary, analysisMode, isPinned, isFavorite
rpa_configs: id, userId, openaiApiKey, openaiModel, investmentRules(JSON), taskInstruction(TEXT), dataLibrary(TEXT), trustedSourcesConfig(JSON)
attachments: id, messageId, fileName, fileUrl, fileKey, mimeType, fileSize
memory_context: id, userId, conversationId, contextType, contextData(JSON)
access_codes: id, code, maxUses, currentUses, expiresAt, isActive
user_access: id, userId, accessCodeId, grantedAt
db_connections: id, userId, name, host, port, database, username, password, sslEnabled
```

---

## 七、前端关键文件

### 7.1 ChatRoom.tsx（2330 行）

- 消息渲染：根据 `msg.metadata?.outputMode` 显示不同的 AnswerHeader（decisive=绿色/directional=黄色/framework_only=红色）
- DataSourcesFooter：显示每个 API 源的名称、类别、延迟、命中状态
- 导出功能：Markdown/Text/PDF/CSV
- 追问按钮：解析 `%%FOLLOWUP%%...%%END%%` 格式
- 流式渲染：通过 SSE 接收 chunk 并实时更新消息内容

### 7.2 Settings.tsx（1923 行）

- 数据源状态面板：显示所有 28 个数据源的健康状态
- 搜索引擎状态：已改为"已关闭（纯 API 模式）"
- 用户配置：OpenAI API Key、投资规则、任务指令、数据库链接、Trusted Sources

---

## 八、资源预算控制（resourceBudget.ts，238 行）

```
标准模式（standard）：
- maxApiCallsPerTask: 8
- maxPaidApiCallsPerTask: 4
- maxWebSearchCallsPerTask: 2（已关闭）
- maxFallbackRoundsPerTask: 1
- maxChartJobsPerTask: 1

深度模式（deep）：
- maxApiCallsPerTask: 14
- maxPaidApiCallsPerTask: 6
- maxWebSearchCallsPerTask: 4（已关闭）
- maxFallbackRoundsPerTask: 2
- maxChartJobsPerTask: 3
```

**问题**：resourceBudget 的 `apiCalls` 计数器在最近的日志中显示 `0/8`，说明**预算计数器没有被正确递增**——API 调用实际发生了但没有被记录。

---

## 九、环境变量与 API Key 状态

| Key | 状态 |
|-----|------|
| FMP_API_KEY | ✅ 正常 |
| FINNHUB_API_KEY | ✅ 正常 |
| POLYGON_API_KEY | ✅ 正常 |
| TIINGO_API_KEY | ✅ 正常（有硬编码 fallback） |
| SIMFIN_API_KEY | ❌ 配额耗尽（429） |
| NEWS_API_KEY | ✅ 正常 |
| MARKETAUX_API_KEY | ✅ 正常 |
| ALPHA_VANTAGE_API_KEY | ❓ 未确认 |
| FRED_API_KEY | ❓ 未确认 |
| SERPER_API_KEY 1/2/3 | 🔒 已关闭 |
| TAVILY_API_KEY 1/2/3/4 | 🔒 已关闭（全部 403） |
| COINGECKO_API_KEY | ❓ 未确认 |
| CONGRESS_API_KEY | ❓ 未确认 |
| COURTLISTENER_API_KEY | ❓ 未确认 |

---

## 十、最近一次任务执行日志分析（18:07 UTC）

```
任务：分析苹果 2025 年 Q1 财报
时间：2026-03-22 18:07 UTC

API 调用结果：
- Yahoo Finance: latencyMs=-1（被跳过）
- Finnhub: 180ms ✅
- FMP: 400ms ✅（但只有年度数据）
- Polygon: 397ms ✅
- NewsAPI: 68ms ✅
- Marketaux: 315ms ✅
- EUR-Lex: 0ms ✅
- SimFin: 429 ❌（配额耗尽）
- GDELT: 429 ❌
- Tiingo: 有数据（营收 $143.76B）

evidenceScore: 0（旧逻辑，18:14 修复后未重新测试）
outputMode: framework_only
missingBlocking: []（空 = 没有 blocking 字段缺失）
missingOptional: [revenue.q1_2025, revenue.q1_2024, net_income.q1_2025, net_income.q1_2024, revenue.q1_2025, gross_profit.q1_2025, revenue.q1_2025]
resourceBudget: apiCalls=0/8（计数器未递增）

最终输出：
"当前证据不足，以下为研究框架而非投资建议..."
```

---

## 十一、待修复优先级列表

| 优先级 | 问题 | 状态 | 影响 |
|--------|------|------|------|
| P0 | evidenceScore 新逻辑需要实际验证 | 已修改，未验证 | 决定输出质量 |
| P0 | FMP 只获取年度数据，缺少季度数据 | 未修复 | 季度分析任务数据不足 |
| P1 | SimFin 429 配额耗尽 | 未修复 | 失去季度财务数据源 |
| P1 | Yahoo Finance 间歇性被跳过 | 未调查 | 失去基础价格数据 |
| P1 | Tiingo 间歇性 fetch failed | 未修复 | 失去估值倍数和季度财报 |
| P1 | resourceBudget 计数器未递增 | 未修复 | 预算控制失效 |
| P2 | 搜索引擎 bug（Serper 0 结果误判） | 已关闭绕过 | 搜索功能不可用 |
| P2 | Tavily 全部 403 | 未调查 | 搜索功能不可用 |
| P2 | GDELT 429 | 未修复 | 失去新闻事件数据 |

---

## 十二、完整文件清单

### Server 端（按重要性排序）

| 文件 | 行数 | 功能 |
|------|------|------|
| server/routers.ts | 2614 | 核心业务逻辑：tRPC 路由、三步骤任务执行流程 |
| server/dataSourceRegistry.ts | 1011 | 28 个数据源注册、FIELD_FALLBACK_MAP、citationSummary |
| server/db.ts | 798 | 数据库操作：用户/对话/消息/任务/配置 CRUD |
| server/evidenceValidator.ts | 513 | 证据评分、outputMode 判定、数据差距分析 |
| server/tavilySearch.ts | 499 | 搜索引擎模块（Serper + Tavily，已关闭） |
| server/alphaVantageApi.ts | 498 | Alpha Vantage API 集成 |
| server/secEdgarApi.ts | 529 | SEC EDGAR API 集成 |
| server/baoStockApi.ts | 606 | A 股数据 API 集成 |
| server/congressApi.ts | 472 | 美国国会法案 API 集成 |
| server/simfinApi.ts | 470 | SimFin 财务报表 API（有季度数据能力，但 429） |
| server/imfApi.ts | 427 | IMF 数据 API 集成 |
| server/fmpApi.ts | 419 | FMP 财务数据 API（核心，但只获取年度数据） |
| server/polygonApi.ts | 392 | Polygon.io API 集成 |
| server/coinGeckoApi.ts | 353 | CoinGecko 加密货币 API |
| server/worldBankApi.ts | 348 | 世界银行数据 API |
| server/courtListenerApi.ts | 339 | CourtListener 法律案例 API |
| server/hkexApi.ts | 315 | 港交所数据 API |
| server/eurLexApi.ts | 294 | 欧盟法规 API |
| server/tiingoApi.ts | 287 | Tiingo 估值/财报 API（有季度数据能力） |
| server/marketauxApi.ts | 285 | Marketaux 新闻情绪 API |
| server/gleifApi.ts | 281 | GLEIF 企业信息 API |
| server/finnhubApi.ts | 257 | Finnhub 市场数据 API |
| server/gdeltApi.ts | 249 | GDELT 新闻事件 API |
| server/hkmaApi.ts | 241 | 香港金管局 API |
| server/boeApi.ts | 241 | 英格兰银行 API |
| server/resourceBudget.ts | 238 | 资源预算控制器 |
| server/fredApi.ts | 233 | FRED 宏观经济 API |
| server/newsApi.ts | 230 | NewsAPI 新闻搜索 |
| server/ecbApi.ts | 228 | 欧洲央行 API |
| server/yahooFinance.ts | 221 | Yahoo Finance API + extractTickers |
| server/rpa.ts | 145 | OpenAI API 调用模块 |
| server/jinaReader.ts | 114 | Jina Reader 网页抓取 |
| server/taskStream.ts | 118 | SSE 流式传输 |

### Client 端

| 文件 | 行数 | 功能 |
|------|------|------|
| client/src/pages/ChatRoom.tsx | 2330 | 聊天界面、消息渲染、数据源展示 |
| client/src/pages/Settings.tsx | 1923 | 设置页面、数据源状态面板 |
| client/src/components/InlineChart.tsx | 982 | 内联图表组件 |
| client/src/pages/AdminPanel.tsx | 283 | 管理面板 |
| client/src/pages/AccessGate.tsx | 174 | 访问控制门 |
| client/src/pages/Home.tsx | 139 | 首页 |
| client/src/App.tsx | 42 | 路由配置 |

---

## 十三、建议修复方向

1. **验证 evidenceScore 新逻辑**：发布最新版本，提交测试任务，确认 score > 0 且 outputMode 不再是 framework_only
2. **FMP 添加季度数据获取**：在 `fetchFmpData` 中增加 `period=quarter&limit=8` 的调用，获取最近 8 个季度的财务数据
3. **简化 evidenceValidator**：考虑大幅简化——只要有 ≥3 个 API 返回了非空数据，就直接设为 decisive 模式，不再做复杂的字段级检查
4. **修复 Yahoo Finance 跳过问题**：调查 latencyMs=-1 的原因，可能需要增加超时或添加重试
5. **添加 API 响应缓存**：为 FMP、Finnhub 等 API 添加 5 分钟内存缓存，减少重复调用
6. **恢复搜索功能**：修复 Serper 0 结果误判 + 添加 serperAllDown 自动恢复 + 调查 Tavily 403 原因
