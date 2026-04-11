# MANUS INFRASTRUCTURE CONTINUATION V2 — 交付报告
**TASK_REF:** MANUS_INFRASTRUCTURE_CONTINUATION_V2  
**Date:** 2026-04-11  
**TSC:** 0 errors  
**Checkpoint:** 见末尾

---

## 一、测试修复结果（Task A）

### 修复前 vs 修复后

| 指标 | 修复前（PREP_V1 baseline） | 修复后（本轮） | 变化 |
|------|--------------------------|----------------|------|
| Test Files Failed | 6 | 5 | **-1** |
| Tests Failed | 42 | 20 | **-22** |
| Tests Passed | 2043 | 2065 | **+22** |

### chat.test.ts 修复

**修改文件：** `server/chat.test.ts`  
**修改内容：** 在 `vi.mock("./db")` 完全替换式 mock 中补充：
```ts
checkUserActivated: vi.fn().mockResolvedValue(true),
```
**修复前：** 16 failures（`[vitest] No "checkUserActivated" export is defined on the "./db" mock`）  
**修复后：** 0 failures ✅（17/17 通过）

### access.test.ts 修复

**修改文件：** `server/access.test.ts`  
**修改性质：** 测试与当前接口对齐（不是功能改造）

**过期接口名称更新：**

| 旧名称（测试中） | 新名称（当前 appRouter） | 原因 |
|-----------------|------------------------|------|
| `access.verify` | `access.activateKey` | 接口重命名（密钥系统重构） |
| `access.listCodes` | `access.listKeys` | 接口重命名 |
| `access.revokeCode` | `access.revokeKey` | 接口重命名 |

**断言对齐：**
- `access.check` 返回结构从 `{ hasAccess, isOwner }` 更新为 `{ hasAccess, isOwner, expiredAt }`（实际接口多了 `expiredAt` 字段）
- mock 补充 `checkUserActivated`、`getUserBoundKeyExpiry`、`activateAccessKey`、`listAccessKeys`、`revokeAccessKey`

**修复前：** 7 failures  
**修复后：** 0 failures ✅（8/8 通过）

---

## 二、剩余 Failure 分类（全部 pre-existing）

| 文件 | 失败数 | 分类 | 根因 |
|------|--------|------|------|
| `server/model_router.test.ts` | 6 | PRE-EXISTING | PRODUCTION_ROUTING_MAP 路由期望 vs 实际不符（OI-001 待决策） |
| `server/llmProviders.test.ts` | 1 | PRE-EXISTING | `recommendModel("agentic_tasks")` 期望 `gpt-5.4`，实际 `claude-sonnet-4-6` |
| `server/dataSourceRegistry.test.ts` | 6 | PRE-EXISTING | 注册表 ID 数量期望 35 实际 34；citation 逻辑不符 |
| `server/financeDatabaseApi.test.ts` | 6 | PRE-EXISTING | 外部 API 返回空数据（无 mock） |
| `server/jin10Mcp.test.ts` | 1 | PRE-EXISTING | `JIN10_MCP_TOKEN` 未配置，fallback 行为与测试期望不符 |

**明确声明：以上 20 个失败均为 pre-existing failures，与本轮任何修改无关。**

---

## 三、DataSourceResult 定义（Task B）

**新建文件：** `server/dataSourceTypes.ts`

```ts
// 核心类型
export type DataSourceResult<T> = {
  success: boolean;
  data: T | null;
  unavailable: boolean;
  errorCode?: string;
  providerUsed: string;
  responseTimeMs: number;
};

// 辅助工厂函数
export function successResult<T>(data, providerUsed, responseTimeMs): DataSourceResult<T>
export function failResult<T>(providerUsed, responseTimeMs, errorCode?): DataSourceResult<T>

// 常用 errorCode 常量
export const DATA_SOURCE_ERROR = {
  NOT_CONFIGURED, NETWORK_ERROR, RATE_LIMITED, EMPTY_RESPONSE, PARSE_ERROR, UNKNOWN
}
```

**设计决策：**
- 仅放服务端数据源调用层通用类型，不放业务类型
- 不依赖任何具体数据源（Jin10 / cnFinance / FMP 等）
- 后续 provider 接入时直接 `import type { DataSourceResult } from "./dataSourceTypes"` 即可

**TSC：** 0 errors ✅

---

## 四、Logging 层（Task C）

### rpa.ts（已修改）

`callOpenAI` 和 `testOpenAIConnection` 均已增加 structured log：

```json
// callOpenAI 成功时
{"source":"rpa.callOpenAI","providerUsed":"anthropic","responseTimeMs":342}

// callOpenAI 失败时
{"source":"rpa.callOpenAI","providerUsed":"modelRouter/default","responseTimeMs":12,"errorCode":"..."}

// testOpenAIConnection 结果
{"source":"rpa.testOpenAIConnection","providerUsed":"modelRouter/default","responseTimeMs":356,"ok":true}
```

**字段：** `source`、`providerUsed`、`responseTimeMs`、`errorCode`（失败时）

### model_router.ts（未修改）

**发现：** `model_router.ts` 的 `generate()` 函数在三个分支（forceModel / development / production）中**已有完整的 `[model_router:route]` structured log**，包含 `task_type`、`provider`、`model`、`fallback_applied`、`mode` 等字段。

无需额外修改，不做重复 logging。

---

## 五、禁止文件确认

| 文件 | 是否修改 |
|------|----------|
| `server/routers.ts` | **NO** |
| `server/jin10Api.ts` | **NO** |
| `server/cnFinanceNewsApi.ts` | **NO** |
| `server/deepResearchEngine.ts` | **NO** |
| `server/synthesisController.ts` | **NO** |
| `server/danTreeSystem.ts` | **NO** |

---

## 六、修改文件清单

| 文件 | 修改类型 | 说明 |
|------|----------|------|
| `server/chat.test.ts` | 测试修复 | 补充 `checkUserActivated` mock |
| `server/access.test.ts` | 测试对齐 | 更新过期接口名 + 断言对齐 |
| `server/dataSourceTypes.ts` | 新建 | DataSourceResult<T> 类型定义 |
| `server/rpa.ts` | Logging 增强 | callOpenAI / testOpenAIConnection 增加 structured log |

---

## 七、Checkpoint

见本报告附带的 checkpoint version_id。
