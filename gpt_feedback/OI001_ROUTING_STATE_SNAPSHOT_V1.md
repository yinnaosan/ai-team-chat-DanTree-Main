# OI-001 ROUTING_STATE_SNAPSHOT_V1

**项目：** DanTree  
**日期：** 2026-04-11  
**性质：** 只读快照，不含任何代码修改  
**目的：** 供 Claude 实现 OI-001 路由决策使用的唯一依据

---

## 一、文件存在性

| 文件 | 状态 | 行数 |
|------|------|------|
| `server/model_router.ts` | **EXISTS** | 711 行 |
| `server/llmProviders.ts` | **EXISTS** | 477 行 |
| `server/model_router.test.ts` | **EXISTS** | 329 行 |
| `server/llmProviders.test.ts` | **EXISTS** | 240 行 |

---

## 二、TaskType 枚举（当前完整定义）

```ts
// server/model_router.ts 第 56-68 行
export type TaskType =
  // 通用类型（协议 v1.0）
  | "research"        // 深度研究、数据分析、多源综合
  | "reasoning"       // 推理链、因果分析
  | "narrative"       // 叙事合成、报告生成、投资者沟通
  | "execution"       // 结构化指令执行
  | "summarization"   // 摘要压缩、要点提取、简报生成
  // DanTree 专用类型
  | "deep_research"   // runDeepResearch() — 深度研究叙事
  | "structured_json" // 结构化 JSON 输出
  | "step_analysis"   // DanTree Step 分析流程
  | "classification"  // 快速分类，最低成本
  | "code_analysis"   // 代码理解 / 分析
  | "agent_task"      // Agent 规划 / 多步流程
  | "default";        // 通用回退
```

**注意：**
- **不存在 `coding` 类型**
- **不存在 `agentic_tasks` 类型**（测试中使用的是字符串 `"agentic_tasks"`，但它不在 TaskType 枚举中）

---

## 三、PRODUCTION_ROUTING_MAP 当前完整定义

```ts
// server/model_router.ts 第 153-165 行
export const PRODUCTION_ROUTING_MAP: Record<TaskType, ProviderTarget> = {
  // ── GPT 主控（研究 / 判断 / 风险 / 输出）
  research:        "openai",     // GPT-5.4 — 深度研究、多源综合
  reasoning:       "openai",     // GPT-5.4 / o3 — 推理链、因果分析
  deep_research:   "openai",     // GPT-5.4 — 深度叙事研究
  narrative:       "openai",     // GPT-5.4 — 报告生成、投资者沟通
  summarization:   "openai",     // GPT-5.4-mini — 摘要压缩、要点提取
  structured_json: "openai",     // GPT-5.4 — 结构化 JSON 输出
  step_analysis:   "openai",     // GPT-5.4 — DanTree Step 分析流程
  default:         "openai",     // GPT-5.4 — 通用回退
  // ── Claude 执行（执行 / 代码 / Agent pipeline）
  execution:       "anthropic",  // Claude Sonnet — 结构化指令执行
  code_analysis:   "anthropic",  // Claude Sonnet — 代码理解 / 分析
  agent_task:      "anthropic",  // Claude Opus — Agent 规划 / 多步流程
  classification:  "anthropic",  // Claude Haiku — 快速分类，最低成本
};
```

---

## 四、PRODUCTION_MODEL_MAP 当前完整定义

```ts
// server/model_router.ts 第 171-183 行
const PRODUCTION_MODEL_MAP: Record<TaskType, Record<ProviderTarget, string>> = {
  research:        { anthropic: "claude-opus-4-6",    openai: "gpt-5.4" },
  reasoning:       { anthropic: "claude-opus-4-6",    openai: "o3" },
  narrative:       { anthropic: "claude-sonnet-4-6",  openai: "gpt-5.4" },
  execution:       { anthropic: "claude-sonnet-4-6",  openai: "gpt-5.4" },
  summarization:   { anthropic: "claude-haiku-4-5",   openai: "gpt-5.4-mini" },
  deep_research:   { anthropic: "claude-opus-4-6",    openai: "gpt-5.4" },
  structured_json: { anthropic: "claude-sonnet-4-6",  openai: "gpt-5.4" },
  step_analysis:   { anthropic: "claude-sonnet-4-6",  openai: "gpt-5.4" },
  classification:  { anthropic: "claude-haiku-4-5",   openai: "gpt-5.4-mini" },
  code_analysis:   { anthropic: "claude-sonnet-4-6",  openai: "gpt-5.4" },
  agent_task:      { anthropic: "claude-opus-4-6",    openai: "gpt-5.4" },
  default:         { anthropic: "claude-sonnet-4-6",  openai: "gpt-5.4" },
};
```

---

## 五、各 task_type 当前路由汇总

| task_type | 当前 provider | 当前模型（生产） | 备注 |
|-----------|-------------|--------------|------|
| `research` | **openai** | gpt-5.4 | 测试期望 anthropic |
| `reasoning` | openai | o3 | 测试通过 |
| `narrative` | **openai** | gpt-5.4 | 测试期望 anthropic |
| `execution` | anthropic | claude-sonnet-4-6 | 测试通过 |
| `summarization` | **openai** | gpt-5.4-mini | 测试期望 anthropic |
| `deep_research` | openai | gpt-5.4 | 测试通过 |
| `structured_json` | openai | gpt-5.4 | 测试通过 |
| `step_analysis` | openai | gpt-5.4 | 测试通过 |
| `classification` | anthropic | claude-haiku-4-5 | 测试通过 |
| `code_analysis` | anthropic | claude-sonnet-4-6 | 测试通过 |
| `agent_task` | anthropic | claude-opus-4-6 | 测试通过 |
| `default` | openai | gpt-5.4 | 测试通过 |
| `coding` | **不存在** | — | 枚举中无此类型 |
| `agentic_tasks` | **不存在** | — | 枚举中无此类型 |

---

## 六、normalizeTaskType 当前实现（v2 规范）

```ts
// server/model_router.ts 第 362-383 行
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

**关键行为：非法 task_type → fallback 到 `"default"`，不抛出异常。**

---

## 七、routingFor 当前实现

```ts
// server/model_router.ts 第 534-544 行
routingFor(
  taskType: TaskType,
  env: "development" | "production" = "development"
): { provider: ProviderTarget | "anthropic"; model: string } {
  _validateTaskType(taskType);   // ← 注意：这里仍用旧的 _validateTaskType（会 throw）
  if (env === "development") {
    return { provider: "anthropic", model: DEVELOPMENT_MODEL };
  }
  const provider = PRODUCTION_ROUTING_MAP[taskType];
  const model = PRODUCTION_MODEL_MAP[taskType][provider];
  return { provider, model };
},
```

**注意：`routingFor` 内部调用的是 `_validateTaskType`（旧版，会 throw），而 `generate()` 调用的是 `normalizeTaskType`（v2，不 throw）。两者行为不一致。**

---

## 八、recommendModel 当前实现

```ts
// server/llmProviders.ts 第 455-460 行
export function recommendModel(useCase: string): string {
  const match = Object.values(MODEL_METADATA).find((m) =>
    m.recommended_for.includes(useCase)
  );
  // 默认回退到 Claude Sonnet 4.6（性价比最高）
  return match?.id ?? MODELS.ANTHROPIC.SONNET_4_6;
}
```

**gpt-5.4 的 `recommended_for` 当前值：**
```ts
recommended_for: ["deep_research", "complex_reasoning", "professional_workflows", "structured_json"]
// 没有 "agentic_tasks"
```

---

## 九、当前失败断言完整内容

### model_router.test.ts — 6 个失败

#### TC-MR-01（2 个）：TaskType 严格校验

```ts
// 第 69-87 行
it("should throw on invalid task_type string", async () => {
  await expect(
    modelRouter.generate({ messages: SAMPLE_MESSAGES }, "invalid_type" as TaskType)
  ).rejects.toThrow(/Invalid task_type/);
});
// 实际：promise resolved（因为 normalizeTaskType v2 fallback 到 "default"，不 throw）

it("should throw on empty string task_type", async () => {
  await expect(
    modelRouter.generate({ messages: SAMPLE_MESSAGES }, "" as TaskType)
  ).rejects.toThrow(/Invalid task_type/);
});
// 实际：promise resolved（同上）
```

#### TC-MR-04（4 个）：生产路由表完整性

```ts
// 第 245-246 行
it("should route research to anthropic in production", () => {
  expect(PRODUCTION_ROUTING_MAP.research).toBe("anthropic");
});
// 实际：PRODUCTION_ROUTING_MAP.research === "openai"

// 第 253-255 行
it("should route narrative to anthropic in production", () => {
  // OI-001 resolved: narrative 归 Anthropic (Claude) — 叙事生成由 Claude 处理
  expect(PRODUCTION_ROUTING_MAP.narrative).toBe("anthropic");
});
// 实际：PRODUCTION_ROUTING_MAP.narrative === "openai"

// 第 262-263 行
it("should route summarization to anthropic in production", () => {
  expect(PRODUCTION_ROUTING_MAP.summarization).toBe("anthropic");
});
// 实际：PRODUCTION_ROUTING_MAP.summarization === "openai"

// 第 275-283 行
it("routingFor() should return correct provider/model in production", () => {
  const researchRoute = modelRouter.routingFor("research", "production");
  expect(researchRoute.provider).toBe("anthropic");          // ← 失败
  expect(researchRoute.model.startsWith("claude-")).toBe(true); // ← 失败
  const reasoningRoute = modelRouter.routingFor("reasoning", "production");
  expect(reasoningRoute.provider).toBe("openai");            // ← 通过
  expect(reasoningRoute.model.length).toBeGreaterThan(0);    // ← 通过
});
// 实际：researchRoute.provider === "openai"
```

### llmProviders.test.ts — 1 个失败

#### TC-LLM-04（1 个）：recommendModel() 推荐

```ts
// 第 129-130 行
it("should recommend GPT-5.4 for agentic tasks", () => {
  expect(recommendModel("agentic_tasks")).toBe("gpt-5.4");
});
// 实际：recommendModel("agentic_tasks") === "claude-sonnet-4-6"
// 原因：没有任何模型的 recommended_for 包含 "agentic_tasks"，fallback 到 Sonnet
```

---

## 十、决策点汇总（供 GPT 判断）

| # | 决策点 | 测试期望 | 当前实现 | 冲突性质 |
|---|--------|---------|---------|---------|
| 1 | `research` 路由 | `anthropic` | `openai` | 策略决策：测试写的是旧策略，实现已改为 GPT 主控 |
| 2 | `narrative` 路由 | `anthropic` | `openai` | 同上（测试注释中写 "OI-001 resolved: narrative 归 Anthropic"） |
| 3 | `summarization` 路由 | `anthropic` | `openai` | 同上 |
| 4 | 非法 task_type 处理 | throw `/Invalid task_type/` | fallback to `"default"` | 行为决策：v2 规范改为 fallback，测试还是 v1 的 throw 期望 |
| 5 | `agentic_tasks` → `gpt-5.4` | `gpt-5.4` | fallback `claude-sonnet-4-6` | 注册缺失：`gpt-5.4` 的 `recommended_for` 没有 `"agentic_tasks"` |

---

## 十一、附：generate() 在 development 模式下的行为

```
DANTREE_MODE != "production" → development 模式
所有 task_type → Claude Sonnet 4.6（不走 PRODUCTION_ROUTING_MAP）
```

TC-MR-01 的 2 个失败测试在 development 模式下运行（测试环境未设置 `DANTREE_MODE=production`），所以 `generate("invalid_type")` 不会走 `_validateTaskType`，而是先经过 `normalizeTaskType` fallback 到 `"default"`，然后走 development 路径调用 Claude，正常 resolve。

---

*本文档为只读快照，不含任何代码修改。所有决策均待 GPT 明确指令后执行。*
