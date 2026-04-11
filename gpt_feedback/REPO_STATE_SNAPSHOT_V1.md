# 仓库真实状态快照
**SNAPSHOT_REF:** REPO_STATE_SNAPSHOT_V1  
**Date:** 2026-04-11  
**用途：** 作为后续 Claude 实现的唯一依据，不含任何推断或猜测

---

## 一、文件清单

### server/ 下关键词相关文件（实际存在）

| 文件名 | 关键词命中 | 状态 |
|--------|-----------|------|
| `server/jin10Api.ts` | jin10 | **EXISTS** |
| `server/jin10Mcp.test.ts` | jin10, mcp | **EXISTS** |
| `server/cnFinanceNewsApi.ts` | news, flash, jin10 | **EXISTS** |
| `server/dataSourceTypes.ts` | datasource | **EXISTS** |
| `server/dataSourceRegistry.ts` | datasource | **EXISTS** |
| `server/dataSourceRegistry.test.ts` | datasource | **EXISTS** |
| `server/newsApi.ts` | news | **EXISTS** |
| `server/newsApi.test.ts` | news | **EXISTS** |

### 明确确认的四个文件

| 文件 | 存在状态 |
|------|----------|
| `server/jin10Api.ts` | **EXISTS** |
| `server/jin10Mcp.test.ts` | **EXISTS** |
| `server/dataSourceTypes.ts` | **EXISTS**（本轮新建） |
| `server/cnFinanceNewsApi.ts` | **EXISTS** |

---

## 二、文件摘要

### server/jin10Api.ts（完整实现，已存在）

**功能：** Jin10 官方 MCP 接口客户端，协议 MCP 2024-11-05 over Streamable HTTP（SSE 响应）

**导出函数：**

| 函数 | MCP 工具名 | 说明 |
|------|-----------|------|
| `fetchJin10FlashNews()` | `list_flash` | 实时快讯，返回 `Jin10FlashResult` |
| `fetchJin10Calendar()` | `list_calendar` | 财经日历，返回 `Jin10CalendarResult` |
| `fetchJin10Quote(codes?)` | `get_quote` | 宏观报价，返回 `Jin10QuoteResult` |
| `formatJin10FlashToMarkdown(result, limit?)` | — | 快讯格式化为 Markdown |
| `formatJin10CalendarToMarkdown(result, minStar?)` | — | 日历格式化为 Markdown |
| `formatJin10QuoteToMarkdown(result)` | — | 报价格式化为 Markdown |

**导出常量：**
- `DEFAULT_QUOTE_CODES`：9 个默认报价 code（000001、000300、HSI、XAUUSD、USOIL、UKOIL、EURUSD、USDCNH、XAGUSD）

**导出类型：**
- `Jin10FlashItem`、`Jin10FlashResult`
- `Jin10CalendarItem`、`Jin10CalendarResult`
- `Jin10QuoteItem`、`Jin10QuoteResult`

**内部机制：**
- `BASE_URL = "https://mcp.jin10.com/mcp"`
- Session 池：`SESSION_TTL_MS = 25000`，`TOOL_TIMEOUT_MS = 3000`
- Token 来源：`process.env.JIN10_MCP_TOKEN`（未配置则 throw）
- SSE 响应解析：`parseSSE()`
- Session 管理：`ensureSession()`（initialize → notifications/initialized）
- 工具调用：`callTool(toolName, args)`

---

### server/cnFinanceNewsApi.ts（完整实现，已存在）

**功能：** 中文财经新闻聚合模块，覆盖华尔街见闻、金十数据、格隆汇、雪球热股

**Jin10 数据源策略（双路径）：**

```
主路径：fetchJin10FlashNews()（jin10Api.ts MCP 官方接口）
  ↓ 失败（error 或 items.length === 0）
fallback：fetchJin10NewsLegacy()（旧爬虫，从 flash_newest.js 抓取）
  URL: https://www.jin10.com/flash_newest.js?t={timestamp}
```

**导出函数：**

| 函数 | 说明 |
|------|------|
| `fetchJin10News()` | Jin10 主入口（MCP + fallback） |
| `fetchWallStreetCnLive()` | 华尔街见闻快讯 |
| `fetchGelonghuiNews()` | 格隆汇 RSS |
| `fetchXueqiuHotStocks()` | 雪球热股 |
| `fetchAllCnFinanceNews()` | 并行拉取全部源 |
| `isCnFinanceNewsRelevant(query)` | 查询相关性判断 |
| `formatCnNewsToMarkdown(result)` | 聚合结果 Markdown 格式化 |
| `checkCnFinanceNewsHealth()` | 健康检测（针对华尔街见闻） |

**导出类型：**
- `CnNewsItem`、`CnNewsResult`、`CnNewsAggregateResult`

---

### server/dataSourceTypes.ts（本轮新建）

**功能：** 服务端数据源调用层通用类型定义，不依赖任何具体数据源

```ts
export type DataSourceResult<T> = {
  success: boolean;
  data: T | null;
  unavailable: boolean;
  errorCode?: string;
  providerUsed: string;
  responseTimeMs: number;
};

export function successResult<T>(data, providerUsed, responseTimeMs): DataSourceResult<T>
export function failResult<T>(providerUsed, responseTimeMs, errorCode?): DataSourceResult<T>

export const DATA_SOURCE_ERROR = {
  NOT_CONFIGURED, NETWORK_ERROR, RATE_LIMITED, EMPTY_RESPONSE, PARSE_ERROR, UNKNOWN
}
```

**当前状态：** 仅类型定义，未被任何现有文件 import（零依赖，零副作用）

---

### tsconfig.json 关键字段

```json
{
  "include": ["client/src/**/*", "shared/**/*", "server/**/*"],
  "exclude": ["node_modules", "build", "dist", "**/*.test.ts"],
  "compilerOptions": {
    "noEmit": true,
    "module": "ESNext",
    "strict": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "skipLibCheck": true
  }
}
```

**注意：** `**/*.test.ts` 被 exclude，TSC 不检查测试文件。

---

### package.json 测试相关

```json
{
  "type": "module",
  "packageManager": "pnpm@10.4.1",
  "scripts": {
    "test": "vitest run",
    "check": "tsc --noEmit"
  },
  "devDependencies": {
    "vitest": "^2.1.4"
  }
}
```

---

## 三、关键词搜索结果

### `jin10` / `Jin10`（排除 jin10Api.ts / jin10Mcp.test.ts / cnFinanceNewsApi.ts 本身）

| 文件 | 行 | 内容 |
|------|----|------|
| `github-resources.test.ts` | 164, 189 | mock 数据中的 `jin10: { source: "金十数据", items: [], ... }` |
| `routers.ts` | 1632 | `...r.jin10.items,`（聚合新闻结果展开） |
| `dataSourceTypes.ts` | 8, 50 | 注释中提及 Jin10 作为示例 |

### `list_flash`

仅存在于 `jin10Api.ts`（实现）和 `jin10Mcp.test.ts`（测试），无其他引用。

### `list_calendar`

仅存在于 `jin10Api.ts`（实现）和 `jin10Mcp.test.ts`（测试），无其他引用。

### `get_quote`

- `jin10Api.ts`：Jin10 MCP `get_quote` 工具调用
- `efinanceApi.ts`（123, 161）、`routers.ts`（5634）、`tickerWsCn.ts`（28）、`tickerWsHk.ts`（31）：Python efinance 库的 `get_quote_snapshot`（不同系统，无关联）

### `flash_newest`

仅存在于 `cnFinanceNewsApi.ts`（131, 136），是 `fetchJin10NewsLegacy()` 的 fallback URL。

### `DataSourceResult`

仅存在于 `dataSourceTypes.ts`（53, 71, 88 行），未被任何其他文件 import。

---

## 四、测试环境现状

| 工具 | 版本 | 可用状态 |
|------|------|----------|
| vitest | 2.1.9（installed: ^2.1.4） | **可用** |
| pnpm | 10.4.1 | **可用** |
| npm | 10.9.2 | **可用** |
| `npx tsc --noEmit` | TypeScript（bundled） | **可用，当前 EXIT:0** |
| `pnpm test` | = `vitest run` | **可用** |

**`JIN10_MCP_TOKEN` 环境变量：** **已配置**（长度 46 字符）

**jin10Mcp.test.ts 实际运行结果（TOKEN 已配置时）：**
- 13/13 全部通过（含 skipIf 测试全部执行）
- 之前报告的 1 个 failure 是在 TOKEN 未注入的 CI 环境下触发的，本地 TOKEN 存在时 **13/13 ✅**

**当前全量测试状态（最新）：**

| 文件 | 失败数 | 根因 |
|------|--------|------|
| `model_router.test.ts` | 6 | PRODUCTION_ROUTING_MAP 路由期望 vs 实际不符（OI-001 待决策） |
| `dataSourceRegistry.test.ts` | 6 | 注册表 ID 数量期望 35 实际 34；citation 逻辑不符 |
| `llmProviders.test.ts` | 1 | `recommendModel("agentic_tasks")` 期望 gpt-5.4 实际 claude-sonnet-4-6 |
| `financeDatabaseApi.test.ts` | 6 | 外部 API 返回空数据（无 mock） |
| `jin10Mcp.test.ts` | 0（TOKEN 存在时） | 全部通过 |

---

## 五、结论

### 确实存在的 Jin10 文件

| 文件 | 内容 | 完整度 |
|------|------|--------|
| `server/jin10Api.ts` | MCP 客户端完整实现（list_flash / list_calendar / get_quote） | **完整** |
| `server/jin10Mcp.test.ts` | 13 个测试，TOKEN 存在时全部通过 | **完整** |
| `server/cnFinanceNewsApi.ts` | 聚合模块，Jin10 双路径（MCP + fallback） | **完整** |
| `server/dataSourceTypes.ts` | 通用类型定义（本轮新建） | **完整** |

### 不存在、需要 Claude 从零新建的文件

**当前仓库中，Jin10 / data source 相关文件均已存在，无需从零新建。**

具体说明：

- `jin10Api.ts`：已有完整 MCP 实现，不需要新建
- `cnFinanceNewsApi.ts`：已有完整聚合逻辑，不需要新建
- `dataSourceTypes.ts`：本轮已新建，不需要重复

**如果 Claude 需要扩展，应在现有文件基础上修改，而非新建同名文件。**

### 当前 pre-existing failures（与 Jin10 无关）

剩余 19 个 failures（jin10Mcp.test.ts 在 TOKEN 存在时为 0）全部属于 pre-existing，分布在 model_router、dataSourceRegistry、llmProviders、financeDatabaseApi 四个文件，与 Jin10 实现无关。
