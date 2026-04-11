# cnFinanceNewsApi Layer A 承接验证报告

**任务包：** CNFINANCE_JIN10_LAYER_A_INTEGRATION_V1  
**执行时间：** 2026-04-11  
**执行原则：** 只做接线确认与验证，不改 Jin10 底层，不做策略决策

---

## 一、当前结论

**`cnFinanceNewsApi.ts` 已天然兼容 Layer A，无需任何代码修改。**

`fetchJin10FlashNews()` 的 Layer A compat 接口（`Jin10FlashResult`）与 `cnFinanceNewsApi.ts` 所依赖的 `CnNewsResult` 结构完全对齐：

| 字段 | `cnFinanceNewsApi.ts` 依赖 | `Jin10FlashResult` 提供 | 兼容性 |
|------|--------------------------|------------------------|--------|
| `.source` | ✅ | ✅ `"金十数据"` | 完全兼容 |
| `.items` | ✅ | ✅ `Jin10FlashItem[]` | 完全兼容 |
| `.items[].id` | ✅ | ✅ `string` | 完全兼容 |
| `.items[].title` | ✅ | ✅ `string`（`normalizedTitle`） | 完全兼容 |
| `.items[].url` | ✅ | ✅ `string` | 完全兼容 |
| `.items[].publishedAt` | ✅ | ✅ `number`（UTC ms） | 完全兼容 |
| `.items[].important` | ✅（optional） | ✅（optional，当前固定 `false`） | 完全兼容 |
| `.fetchedAt` | ✅ | ✅ `number`（UTC ms） | 完全兼容 |
| `.error` | ✅（optional） | ✅（optional） | 完全兼容 |

---

## 二、修改文件清单

**本轮零代码修改。**

| 文件 | 操作 | 原因 |
|------|------|------|
| `server/cnFinanceNewsApi.ts` | 未修改 | 字段结构天然兼容，无需调整 |
| `server/jin10Api.ts` | 未修改（禁止） | Layer A compat 层已完整实现 |

---

## 三、验证结果

### TSC

```
npx tsc --noEmit
EXIT: 0  ✅  （0 errors）
```

### 定向测试

```
npx vitest run server/jin10Mcp.test.ts server/github-resources.test.ts

✓ server/jin10Mcp.test.ts    (34 tests) 123ms
✓ server/github-resources.test.ts (24 tests) 2205ms
  ✓ cnFinanceNewsApi > isCnFinanceNewsRelevant 对 A 股查询应返回 true
  ✓ cnFinanceNewsApi > isCnFinanceNewsRelevant 对非 A 股查询应返回 false
  ✓ cnFinanceNewsApi > formatCnNewsToMarkdown 对空结果应返回空字符串
  ✓ cnFinanceNewsApi > formatCnNewsToMarkdown 对有数据结果应返回包含来源标题的字符串
  ✓ cnFinanceNewsApi > checkCnFinanceNewsHealth 应在超时内返回结果

Test Files  2 passed (2)
Tests       58 passed (58)
EXIT: 0  ✅
```

**无新增失败，不影响现有主线。**

---

## 四、兼容性结论

**1. `fetchJin10News()` 是否已正式承接 Layer A**

YES。`fetchJin10News()` 主路径调用 `fetchJin10FlashNews()`，后者内部已使用 `listFlash()`（含 retry / session rebuild / error taxonomy），Layer A 承接完成。

**2. fallback 是否继续保留**

YES。`fetchJin10NewsLegacy()`（旧爬虫，`flash_newest.js`）保留，作为 MCP 失败时的后备路径。

**3. 是否建议继续保留 legacy scraper**

**建议保留（现阶段）。** 理由：

- Layer A 刚落仓，仍在验证期
- legacy scraper 提供双重兜底，降低 MCP 不稳定风险
- 当前 `items.length > 0 && !mcpResult.error` 的 fallback 条件属于保守策略，在验证期内合理

**注记（留待后续决策）：** 当 MCP 成功但返回空列表时（`errorCode = NO_DATA`），`fetchJin10FlashNews()` 会设置 `error: "NO_DATA"`，触发外层 fallback 到 legacy scraper。这是现阶段的双保险策略，不是 bug。是否未来改为"NO_DATA 不再 fallback"，属于下一层策略决策，本轮不做。

---

## 五、风险与后续建议

**当前步骤是否已完成：** YES。`cnFinanceNewsApi.ts` 对 Jin10 Layer A 的正式承接与验证已完成。

**下一步建议（供 GPT 决策）：**

1. **`important` 字段策略（P2）**：Layer A compat 层当前将所有 flash 条目的 `important` 固定为 `false`（因为 `listFlash()` 返回的 `RobustFlashItem` 没有 `important` 字段）。如果需要保留重要性标记，可在 `fetchJin10FlashNews()` 中从 `item.rawTitle` 或其他字段推断，但这属于 Layer A 内部决策，不在本轮范围。

2. **`cnFinanceNewsApi.ts` 测试补全（P2）**：现有测试（`github-resources.test.ts`）只覆盖 `isCnFinanceNewsRelevant`、`formatCnNewsToMarkdown`、`checkCnFinanceNewsHealth`，未覆盖 `fetchJin10News()` 的主路径和 fallback 路径。建议后续补充 mock 测试，验证 MCP 成功、MCP 空列表、MCP 异常三种场景。

3. **registry 接入（P3）**：`dataSourceRegistry.ts` 当前注册表 ID 为 34，测试期望 35，缺失的 ID 可能正是 Jin10 MCP 数据源。确认后可补充注册，消除 6 个 pre-existing failures。

---

## 六、严禁文件确认

以下文件本轮**完全未修改**：

- `server/jin10Api.ts` ✅ 未动
- `server/jin10ErrorCodes.ts` ✅ 未动
- `server/jin10Types.ts` ✅ 未动
- `server/jin10Cache.ts` ✅ 未动
- `server/routers.ts` ✅ 未动
- `server/deepResearchEngine.ts` ✅ 未动
- `server/synthesisController.ts` ✅ 未动
- `server/danTreeSystem.ts` ✅ 未动
- `server/dataSourceRegistry.ts` ✅ 未动

---

## 七、Checkpoint

**version_id：** 待生成（见 checkpoint 卡片）
