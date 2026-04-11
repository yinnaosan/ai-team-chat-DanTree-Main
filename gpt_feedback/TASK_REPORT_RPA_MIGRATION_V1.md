# RPA Migration Report — OI-001-B
**TASK_REF:** MANUS_NON_JIN10_PREP_V1  
**Date:** 2026-04-11  
**Status:** COMPLETED

---

## 1. 迁移目标

将 `server/rpa.ts` 中的旧 wrapper 实现迁移为委托 `modelRouter.generate()`，保持对外接口不变。

---

## 2. 改动文件列表

| 文件 | 状态 | 说明 |
|------|------|------|
| `server/rpa.ts` | MODIFIED | callOpenAI 内部实现迁移；callOpenAIStream DEFERRED |
| `server/routers.ts` | UNTOUCHED | READ_ONLY，本轮完全未修改 |
| 其他所有文件 | UNTOUCHED | 严格遵守 scope 限制 |

---

## 3. callOpenAI 迁移详情

### 迁移前
```ts
// 直接调用 https://api.openai.com/v1/chat/completions
const response = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${apiKey}` },
  body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
  signal: AbortSignal.timeout(120000),
});
```

### 迁移后
```ts
// 委托 modelRouter.generate()，task_type = "default"
const routerInput: RouterInput = {
  messages: routerMessages,  // OpenAIMessage[] → LLMMessage[]
  maxTokens,
};
const result = await modelRouter.generate(routerInput, "default");
return result.output ?? result.content ?? "";
```

### 行为对比

| 维度 | 迁移前 | 迁移后 |
|------|--------|--------|
| 函数签名 | `callOpenAI(options: OpenAICallOptions): Promise<string>` | 不变 |
| 返回类型 | `string` | 不变 |
| 抛出行为 | 网络失败抛 Error | 不变（modelRouter 内部抛出） |
| 开发态 provider | 直接 OpenAI（沙箱不可用） | Claude Sonnet（ANTHROPIC_API_KEY，沙箱可用） |
| 生产态 provider | OpenAI GPT-5.4 | OpenAI GPT-5.4（通过 modelRouter） |
| apiKey 参数 | 必须传入 | 保留（向后兼容），modelRouter 内部自行选择 |

---

## 4. callOpenAIStream 状态

**STATUS = DEFERRED**

**REASON:**
1. `modelRouter.generate()` 目前无稳定 streaming 对应能力（返回完整 `RouterResponse`，无 AsyncGenerator）
2. 迁移需改动 `routers.ts`（READ_ONLY），本轮不允许
3. 保持原始实现不变，等待后续 Patch

文件中已添加 DEFERRED 注释标记，明确说明原因。

---

## 5. testOpenAIConnection 状态

**STATUS = SYNCED（随 callOpenAI 同步生效）**

`testOpenAIConnection` 内部调用 `callOpenAI`，无需额外修改。迁移后行为：
- 开发态：调用 Claude Sonnet，返回 `{ ok: true, model }`
- 生产态：调用 GPT-5.4，返回 `{ ok: true, model }`

---

## 6. routers.ts 修改状态

**routers.ts 完全未修改 = YES**

`routers.ts` 中的 4 处 `callOpenAI` / `callOpenAIStream` 调用点（第 872、2595、2644、2743 行）均未触碰。这些调用点通过 `rpa.ts` 的对外接口调用，接口签名不变，上层无感知。

---

## 7. 残留旧 wrapper 说明

| 函数 | 状态 | 说明 |
|------|------|------|
| `callOpenAI` | MIGRATED | 内部已委托 modelRouter.generate() |
| `callOpenAIStream` | DEFERRED（兼容保留） | 原始实现保留，原因见第4节 |
| `testOpenAIConnection` | SYNCED | 随 callOpenAI 同步 |

**结论：** `callOpenAIStream` 属于"兼容保留"（DEFERRED，有明确标记），不属于"未完成迁移"。

---

## 8. TSC 验证

```
npx tsc --noEmit
EXIT: 0
```

**TSC: 0 errors ✅**

---

## 9. 测试验证

`chat.test.ts` 中的 `vi.mock("./rpa")` mock 覆盖了 `callOpenAI` 的对外接口，与迁移后的实现完全兼容（mock 替换整个模块，不依赖内部实现）。

`chat.test.ts` 中的 16 个测试失败均为 pre-existing failure（`checkUserActivated` mock 缺失），与本次 rpa.ts 迁移无关，详见 regression baseline 报告。
