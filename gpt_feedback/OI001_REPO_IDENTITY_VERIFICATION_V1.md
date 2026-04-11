# OI-001 REPO_IDENTITY_VERIFICATION_V1

**项目：** DanTree  
**日期：** 2026-04-11  
**性质：** 只读核验，零代码修改  
**目的：** 解决仓库状态冲突（711行版 vs 340行版），确认唯一主线

---

## 一、仓库身份信息

| 项目 | 值 |
|------|-----|
| 工作目录 | `/home/ubuntu/ai-team-chat` |
| Git Branch | `main` |
| HEAD Commit | `acf2011` |
| Commit Message | `Checkpoint: DATASOURCE_REGISTRY_JIN10_BACKFILL_V1: 删除重复 hkex 注册项，补充 jin10_mcp 数据源注册，修复 dataSourceRegistry.test.ts fixture` |
| 上一 Commit | `473119c` — CNFINANCE_JIN10_LAYER_A_INTEGRATION_V1 |
| 上上 Commit | `b8db866` — Jin10 Robust Client v1 落仓完成 |

---

## 二、文件身份核验

| 文件 | 行数 | 大小 | SHA256 | 最近修改时间 |
|------|------|------|--------|------------|
| `server/model_router.ts` | **711** | 29765 bytes | `9ce1517c...` | 2026-04-10 14:38:01 EDT |
| `server/llmProviders.ts` | **477** | 21905 bytes | `d98b36b0...` | 2026-04-10 14:38:01 EDT |
| `server/model_router.test.ts` | **329** | 13401 bytes | `583ce982...` | 2026-04-10 14:38:01 EDT |
| `server/llmProviders.test.ts` | **240** | 12532 bytes | `f3fc57d6...` | 2026-04-10 14:38:01 EDT |

**全局搜索结果：**
- `/tmp` 和 `/home/ubuntu` 下只存在 **一份** `model_router.ts`，路径为 `/home/ubuntu/ai-team-chat/server/model_router.ts`
- 不存在任何旧副本、历史文件或临时目录中的同名文件
- `llmProviders.ts` 同样只有一份

---

## 三、关键内容摘录（原文）

### 3.1 TaskType 定义（第 56-70 行）

```ts
export type TaskType =
  // 通用类型（协议 v1.0）
  | "research"
  | "reasoning"
  | "narrative"
  | "execution"
  | "summarization"
  // DanTree 专用类型
  | "deep_research"
  | "structured_json"
  | "step_analysis"
  | "classification"
  | "code_analysis"
  | "agent_task"
  | "default";
```

**总计：12 个 task type（5 个通用 + 6 个 DanTree 专用 + 1 个 default）**

不存在：`coding`、`agentic_tasks`

---

### 3.2 PRODUCTION_ROUTING_MAP（第 153-165 行）

```ts
export const PRODUCTION_ROUTING_MAP: Record<TaskType, ProviderTarget> = {
  // ── GPT 主控（研究 / 判断 / 风险 / 输出）
  research:        "openai",
  reasoning:       "openai",
  deep_research:   "openai",
  narrative:       "openai",
  summarization:   "openai",
  structured_json: "openai",
  step_analysis:   "openai",
  default:         "openai",
  // ── Claude 执行（执行 / 代码 / Agent pipeline）
  execution:       "anthropic",
  code_analysis:   "anthropic",
  agent_task:      "anthropic",
  classification:  "anthropic",
};
```

---

### 3.3 PRODUCTION_MODEL_MAP（第 171-183 行）

```ts
const PRODUCTION_MODEL_MAP: Record<TaskType, Record<ProviderTarget, string>> = {
  research:        { anthropic: MODELS.ANTHROPIC.OPUS_4_6,    openai: MODELS.OPENAI.GPT_5_4 },
  reasoning:       { anthropic: MODELS.ANTHROPIC.OPUS_4_6,    openai: MODELS.OPENAI.O3 },
  narrative:       { anthropic: MODELS.ANTHROPIC.SONNET_4_6,  openai: MODELS.OPENAI.GPT_5_4 },
  execution:       { anthropic: MODELS.ANTHROPIC.SONNET_4_6,  openai: MODELS.OPENAI.GPT_5_4 },
  summarization:   { anthropic: MODELS.ANTHROPIC.HAIKU_4_5,   openai: MODELS.OPENAI.GPT_5_4_MINI },
  deep_research:   { anthropic: MODELS.ANTHROPIC.OPUS_4_6,    openai: MODELS.OPENAI.GPT_5_4 },
  structured_json: { anthropic: MODELS.ANTHROPIC.SONNET_4_6,  openai: MODELS.OPENAI.GPT_5_4 },
  step_analysis:   { anthropic: MODELS.ANTHROPIC.SONNET_4_6,  openai: MODELS.OPENAI.GPT_5_4 },
  classification:  { anthropic: MODELS.ANTHROPIC.HAIKU_4_5,   openai: MODELS.OPENAI.GPT_5_4_MINI },
  code_analysis:   { anthropic: MODELS.ANTHROPIC.SONNET_4_6,  openai: MODELS.OPENAI.GPT_5_4 },
  agent_task:      { anthropic: MODELS.ANTHROPIC.OPUS_4_6,    openai: MODELS.OPENAI.GPT_5_4 },
  default:         { anthropic: MODELS.ANTHROPIC.SONNET_4_6,  openai: MODELS.OPENAI.GPT_5_4 },
};
```

---

### 3.4 normalizeTaskType（第 366-387 行）

```ts
export function normalizeTaskType(raw: unknown): NormalizeResult {
  if (raw === undefined || raw === null || raw === "") {
    return {
      normalized_task_type: "default",
      fallback_applied: true,
      fallback_reason: `task_type is ${raw === "" ? "empty string" : String(raw)}, fallback to "default"`,
    };
  }
  if (!TASK_TYPE_WHITELIST.has(raw as string)) {
    return {
      normalized_task_type: "default",
      fallback_applied: true,
      fallback_reason: `task_type "${raw}" not in whitelist, fallback to "default"`,
    };
  }
  return {
    normalized_task_type: raw as TaskType,
    fallback_applied: false,
    fallback_reason: "",
  };
}
```

**行为：非法 task_type → fallback 到 `"default"`，不抛出异常。**

---

### 3.5 _validateTaskType（第 389-395 行，deprecated）

```ts
/** @deprecated 内部 assert，仅向后兼容，新代码请用 normalizeTaskType */
function _validateTaskType(taskType: unknown): asserts taskType is TaskType {
  if (!Object.keys(TASK_TYPES).includes(taskType as string)) {
    throw new Error(
      `[model_router] Invalid task_type: "${taskType}". ` +
        `Must be one of: ${Object.keys(TASK_TYPES).join(", ")}`
    );
  }
}
```

**行为：非法 task_type → throw Error。**

**注意：`generate()` 调用 `normalizeTaskType`（不 throw），`routingFor()` 调用 `_validateTaskType`（会 throw）。两者行为不一致。**

---

### 3.6 routingFor（第 534-545 行）

```ts
routingFor(
  taskType: TaskType,
  env: "development" | "production" = "development"
): { provider: ProviderTarget | "anthropic"; model: string } {
  _validateTaskType(taskType);
  if (env === "development") {
    return { provider: "anthropic", model: DEVELOPMENT_MODEL };
  }
  const provider = PRODUCTION_ROUTING_MAP[taskType];
  const model = PRODUCTION_MODEL_MAP[taskType][provider];
  return { provider, model };
},
```

---

### 3.7 recommendModel（第 454-461 行）

```ts
export function recommendModel(useCase: string): string {
  const match = Object.values(MODEL_METADATA).find((m) =>
    m.recommended_for.includes(useCase)
  );
  // 默认回退到 Claude Sonnet 4.6（性价比最高）
  return match?.id ?? MODELS.ANTHROPIC.SONNET_4_6;
}
```

---

### 3.8 gpt-5.4 的 recommended_for（第 168-174 行）

```ts
"gpt-5.4": {
  id: "gpt-5.4", provider: "openai", displayName: "GPT-5.4",
  contextWindow: 1_000_000, maxOutput: 128_000,
  inputPricePerMTok: 2.5, outputPricePerMTok: 15.0,
  supportsVision: true, supportsExtendedThinking: false, latency: "fast",
  recommended_for: ["deep_research", "complex_reasoning", "professional_workflows", "structured_json"],
},
```

**`"agentic_tasks"` 不在 `recommended_for` 中。**

---

### 3.9 失败断言原文

#### model_router.test.ts — TC-MR-01（第 69-81 行）

```ts
it("should throw on invalid task_type string", async () => {
  await expect(
    modelRouter.generate({ messages: SAMPLE_MESSAGES }, "invalid_type" as TaskType)
  ).rejects.toThrow(/Invalid task_type/);
});

it("should throw on empty string task_type", async () => {
  await expect(
    modelRouter.generate({ messages: SAMPLE_MESSAGES }, "" as TaskType)
  ).rejects.toThrow(/Invalid task_type/);
});
```

#### model_router.test.ts — TC-MR-04（第 245-283 行）

```ts
it("should route research to anthropic in production", () => {
  expect(PRODUCTION_ROUTING_MAP.research).toBe("anthropic");
});

it("should route narrative to anthropic in production", () => {
  // OI-001 resolved: narrative 归 Anthropic (Claude) — 叙事生成由 Claude 处理
  expect(PRODUCTION_ROUTING_MAP.narrative).toBe("anthropic");
});

it("should route summarization to anthropic in production", () => {
  expect(PRODUCTION_ROUTING_MAP.summarization).toBe("anthropic");
});

it("routingFor() should return correct provider/model in production", () => {
  const researchRoute = modelRouter.routingFor("research", "production");
  expect(researchRoute.provider).toBe("anthropic");
  expect(researchRoute.model.startsWith("claude-")).toBe(true);
  const reasoningRoute = modelRouter.routingFor("reasoning", "production");
  expect(reasoningRoute.provider).toBe("openai");
  expect(reasoningRoute.model.length).toBeGreaterThan(0);
});
```

#### llmProviders.test.ts — TC-LLM-04（第 129-131 行）

```ts
it("should recommend GPT-5.4 for agentic tasks", () => {
  expect(recommendModel("agentic_tasks")).toBe("gpt-5.4");
});
```

---

## 四、测试现状

### TSC

```
npx tsc --noEmit
EXIT: 0  ✅  （0 errors）
```

### vitest（model_router.test.ts + llmProviders.test.ts）

```
Test Files  2 failed (2)
Tests       7 failed | 40 passed (47)
```

**7 个失败（全部 pre-existing）：**

| 测试名 | 实际值 | 期望值 |
|--------|--------|--------|
| TC-MR-01: should throw on invalid task_type string | promise resolved | rejects.toThrow(/Invalid task_type/) |
| TC-MR-01: should throw on empty string task_type | promise resolved | rejects.toThrow(/Invalid task_type/) |
| TC-MR-04: should route research to anthropic in production | `"openai"` | `"anthropic"` |
| TC-MR-04: should route narrative to anthropic in production | `"openai"` | `"anthropic"` |
| TC-MR-04: should route summarization to anthropic in production | `"openai"` | `"anthropic"` |
| TC-MR-04: routingFor() should return correct provider/model in production | provider=`"openai"` | provider=`"anthropic"` |
| TC-LLM-04: should recommend GPT-5.4 for agentic tasks | `"claude-sonnet-4-6"` | `"gpt-5.4"` |

---

## 五、版本判断

**结论：当前真实仓库是「711 行 / 12 task type 版本」，这是唯一版本。**

- `server/model_router.ts`：711 行，12 个 task type，位于 `/home/ubuntu/ai-team-chat/server/model_router.ts`
- 全局搜索 `/tmp` 和 `/home/ubuntu` 下**不存在任何 340 行 / 5 task type 版本**
- 不存在历史文件、旧副本、临时目录中的同名文件
- Claude 在 `/tmp` 读到的"340 行版本"可能是其上下文压缩或幻觉，与真实仓库无关

**当前主线：`main` 分支，HEAD = `acf2011`，对应 checkpoint `acf2011e`（DATASOURCE_REGISTRY_JIN10_BACKFILL_V1）**

---

## 六、决策点汇总（供 GPT 判断，本轮不做任何修改）

| # | 决策点 | 测试期望 | 当前实现 | 冲突性质 |
|---|--------|---------|---------|---------|
| 1 | `research` 路由 | `anthropic` | `openai` | 策略决策：测试写的是旧策略，实现已改为 GPT 主控 |
| 2 | `narrative` 路由 | `anthropic` | `openai` | 同上（测试注释写 "OI-001 resolved: narrative 归 Anthropic"） |
| 3 | `summarization` 路由 | `anthropic` | `openai` | 同上 |
| 4 | 非法 task_type 处理 | throw `/Invalid task_type/` | fallback to `"default"` | 行为决策：v2 规范改为 fallback，测试还是 v1 的 throw 期望 |
| 5 | `agentic_tasks` → `gpt-5.4` | `gpt-5.4` | fallback `claude-sonnet-4-6` | 注册缺失：`gpt-5.4.recommended_for` 没有 `"agentic_tasks"` |

---

*本文档为只读核验，零代码修改。所有决策均待 GPT 明确指令后执行。*
