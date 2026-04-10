# FEEDBACK: Market Badge 显示 Bug 修复

**日期**: 2026-04-10  
**Checkpoint**: 待保存  
**状态**: 已修复，TSC 0 errors

---

## 问题描述

用户测试 `600916.SS`（A股·中国黄金）时，顶部任务框（DecisionHeader）的 market badge 显示 `US`（错误），而 Session Rail 显示 `CN`（正确）。

---

## 根因分析

### 根因 1：`detectMarketType` 未识别 `.SS`/`.SH`/`.SZ` 后缀

**文件**: `client/src/lib/marketUtils.ts`

原始代码只识别：
- 纯6位数字（如 `600916`）
- `SH.`/`SZ.` 前缀（如 `SH.600916`）
- 6位数字开头（如 `600916`）

**未识别** Yahoo Finance 格式的 `.SS`（上交所）/`.SH`/`.SZ`（深交所）后缀。

因此 `detectMarketType("600916.SS")` fallback 到 `"us"`，导致 `entityCandidates` 里的 market 字段被设为 `"US"`。

### 根因 2：`inferMarketFromKey` 返回 `"SH"/"SZ"` 而非 `"CN"`

**文件**: `client/src/pages/ResearchWorkspaceVNext.tsx`

`inferMarketFromKey` 对 `.SS`/`.SH` 返回 `"SH"`，对 `.SZ` 返回 `"SZ"`。

这些标签在 `MARKET_COLORS` 里有颜色定义（`SH`/`SZ` → 红色系），但不统一。新建 session 时 title 末尾会附加 `SH` 或 `SZ` 而非 `CN`，导致视觉不一致。

---

## 修复内容

### 修复 1：`marketUtils.ts` 添加 `.SS`/`.SH`/`.SZ` 识别

```ts
// 修复前
if (/^(SH\.|SZ\.)?[0-9]{6}$/.test(s) || ...) return "cn";

// 修复后（新增一行）
if (/^(SH\.|SZ\.)?[0-9]{6}$/.test(s) || ...) return "cn";
if (s.endsWith(".SS") || s.endsWith(".SH") || s.endsWith(".SZ")) return "cn";
```

### 修复 2：`inferMarketFromKey` 统一返回 `"CN"`

```ts
// 修复前
if (focusKey.endsWith(".SS") || focusKey.endsWith(".SH")) return "SH";
if (focusKey.endsWith(".SZ")) return "SZ";

// 修复后
if (focusKey.endsWith(".SS") || focusKey.endsWith(".SH") || focusKey.endsWith(".SZ")) return "CN";
```

---

## 影响范围

- **只改了两个纯函数**：`detectMarketType`（marketUtils.ts）和 `inferMarketFromKey`（ResearchWorkspaceVNext.tsx 内联函数）
- **不影响**：routing 层、分析流程、数据层、其他 market 类型（US/HK/CRYPTO/JP/KR）
- **兼容旧数据**：`parseSessionTitle` 里的 `KNOWN_MARKETS` 保留 `"SH"/"SZ"`，旧 session title 仍可正确解析

---

## 验证

- `detectMarketType("600916.SS")` → `"cn"` ✅
- `detectMarketType("000858.SZ")` → `"cn"` ✅  
- `detectMarketType("AAPL")` → `"us"` ✅（不影响美股）
- `detectMarketType("700.HK")` → `"hk"` ✅（不影响港股）
- TSC: 0 errors ✅

---

## 截图分析（2026-04-10 运行结果）

- **has_DISCUSSION = true** ✅ — Discussion 面板正常显示，内容完整
- **State Write-Back 正常** ✅ — TVM 写回成功（`stance=neutral`，`verdict` 写入）
- **分析质量合理** — 因 `financials.income` 字段缺失，系统正确识别为"财务数据缺失风险"，给出框架性假设而非虚假数据

---

## 遗留项（todo.md 中未完成）

1. `routers.ts`：清理 earlyTavilyResult/refinedTavilyResult 注释，改为明确 DISABLED 标记
2. `evidenceValidator.ts`/`dataSourceRegistry.ts`：web_search 类 provider 不参与 evidenceScore 计算
3. ENV 中 TAVILY/SERPER key 标注 DISABLED
4. HK fundamentals 评估（下一轮独立任务）
