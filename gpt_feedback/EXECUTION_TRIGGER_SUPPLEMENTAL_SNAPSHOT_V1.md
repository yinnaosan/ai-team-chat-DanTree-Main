# EXECUTION_TRIGGER_SUPPLEMENTAL_SNAPSHOT_V1

**项目：** DanTree  
**日期：** 2026-04-11  
**性质：** 只读补充快照，零代码修改  
**前置：** EXECUTION_TRIGGER_STATE_SNAPSHOT_V1

---

## 一、server/_core/llm.ts 路径核验

| 项目 | 值 |
|------|---|
| 绝对路径 | `/home/ubuntu/ai-team-chat/server/_core/llm.ts` |
| 存在 | ✅ |
| 行数 | 354 行 |
| 文件大小 | 9,455 B |
| 最后修改 | 2026-04-10 14:38 |

---

## 二、invokeLLM() 完整函数签名

### 2.1 所有类型定义（完整原文）

```ts
// server/_core/llm.ts

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4";
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: { name: string };
};
export type ToolChoice = ToolChoicePrimitive | ToolChoiceByName | ToolChoiceExplicit;

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};
export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;           // snake_case alias
  maxTokens?: number;
  max_tokens?: number;                // snake_case alias
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;       // snake_case alias
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;   // snake_case alias
};

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};
```

### 2.2 函数签名（完整原文，L269）

```ts
export async function invokeLLM(params: InvokeParams): Promise<InvokeResult>
```

**无重载。** 单一签名，无泛型参数，无可选重载形式。

### 2.3 关键行为说明

`invokeLLM` 内部根据 `DANTREE_MODE` 环境变量分两条路径：

```ts
const isDev = (process.env.DANTREE_MODE ?? "") !== "production";

if (isDev) {
  // 研发态：委托 modelRouter.generate(routerInput, "default")
  // task_type 固定为 "default"，业务语义丢失
  const routerResult = await modelRouter.generate(routerInput, "default");
  return adaptToInvokeResult(routerResult);  // 适配为 InvokeResult 格式
}

// 生产态：直连 OpenAI gpt-5.4（fetch 直调，不经 modelRouter）
// model 固定为 "gpt-5.4"，max_tokens 固定为 8192
```

**注意：** `InvokeParams` 中没有 `task_type` 字段，调用方无法通过 `invokeLLM` 传递路由语义。

---

## 三、routers.ts 中 invokeLLM 真实调用样例

### 样例 1：主分析路径（JSON-only 渲染，L2583-2590）

**调用类型：** 核心分析 / structured_json 路径（Step3 主输出）

**调用前 scope 内可用变量：**

| 变量 | 定义位置 | 值 / 说明 |
|------|---------|---------|
| `intentCtx` | L1098 | `buildIntentContext(taskParse, taskDescription, symbols)` 返回的 `IntentContext` 对象 |
| `resolvedTaskType` | L1980 | `"stock_analysis"` / `"macro_analysis"` 等（业务层 task_type） |
| `primaryTicker` | L865 | 如 `"AAPL"`，可能为 `null` |
| `taskDescription` | 过程参数 | 用户原始查询字符串 |
| `useJsonOnlyMode` | L2403 | `boolean`，决定是否走 JSON-only 渲染路径 |
| `jsonOnlySystemMsg` | 上方构建 | 完整 system prompt 字符串 |
| `jsonOnlyUserMsg` | 上方构建 | 完整 user prompt 字符串（含 manusReport / evidencePacket） |

**调用原文（L2583-2590）：**

```ts
// ── DEV: always use Claude (invokeLLMWithRetry), never OpenAI ──
const fb = await invokeLLMWithRetry({
  messages: [
    { role: "system", content: jsonOnlySystemMsg },
    { role: "user", content: jsonOnlyUserMsg },
  ],
});
rawJsonOutput = String(fb.choices?.[0]?.message?.content || "");
```

**上下文（L2578-2600）：**

```ts
if (useJsonOnlyMode) {
  // ── LEVEL1A3: JSON-only Render Path (standard/deep + structured task types) ──
  // GPT is a RENDERER, not an author. GPT only fills the schema.
  let rawJsonOutput = "";
  try {
    if (!ENV.isProduction) {
      // ── DEV: always use Claude (invokeLLMWithRetry), never OpenAI ──
      const fb = await invokeLLMWithRetry({
        messages: [
          { role: "system", content: jsonOnlySystemMsg },
          { role: "user", content: jsonOnlyUserMsg },
        ],
      });
      rawJsonOutput = String(fb.choices?.[0]?.message?.content || "");
    } else if (userConfig?.openaiApiKey) {
      // ── PROD: try OpenAI first, fallback to Claude on failure ──
      try {
        rawJsonOutput = await callOpenAI({
          apiKey: userConfig.openaiApiKey,
          model: userConfig.openaiModel || DEFAULT_MODEL,
          messages: [...],
          maxTokens: modeConfig?.step3MaxTokens ?? 2400,
        });
      } catch (openaiErr) {
        // OpenAI failed → fallback to Claude
        const fb = await invokeLLMWithRetry({ messages: [...] });
        rawJsonOutput = String(fb.choices?.[0]?.message?.content || "");
      }
    } else {
      // ── PROD no OpenAI key: use Claude ──
      const fb = await invokeLLMWithRetry({ messages: [...] });
      rawJsonOutput = String(fb.choices?.[0]?.message?.content || "");
    }
```

**scope 内 intentCtx 可用：** ✅ 是（L1098 定义，在同一 async 函数内）  
**scope 内 resolvedTaskType 可用：** ✅ 是（L1980 定义）  
**scope 内 primaryTicker 可用：** ✅ 是（L865 定义）  
**step 编号：** 无显式 step 变量，但此处为 Step3（最终输出阶段）

---

### 样例 2：摘要生成路径（L3549-3560）

**调用类型：** 任务完成后生成长期记忆摘要（summarization 语义）

**调用原文（L3549-3560）：**

```ts
const summaryResponse = await invokeLLMWithRetry({
  messages: [
    {
      role: "system",
      content: "请用2-3句话简洁总结以下任务的核心结论，供后续任务参考。输出纯文本，不要标题或列表。",
    },
    {
      role: "user",
      content: `任务：${taskDescription.slice(0, 200)}\n\n最终回复摘要：${finalReply.slice(0, 500)}`,
    },
  ],
});
const summary = String(summaryResponse.choices?.[0]?.message?.content || "");
```

**调用前上下文（L3546-3548）：**

```ts
// ── LEVEL3.5 Memory Evolution END ────────────────────────────────────────────
// -- 自动生成任务摘要保存到长期记忆 ---------------------------------------
try {
  const summaryResponse = await invokeLLMWithRetry({ ... });
```

**scope 内 intentCtx 可用：** ✅ 是（同一函数 scope）  
**scope 内 resolvedTaskType 可用：** ✅ 是  
**scope 内 primaryTicker 可用：** ✅ 是  
**step 编号：** 无，此处为任务完成后的后处理阶段

---

### 样例 3：JSON 修复路径（L2929-2960）

**调用类型：** DELIVERABLE 块缺失时的修复 pass（repair / structured_json 语义）

**调用原文（L2929-2960）：**

```ts
// ── REPAIR PASS: ask LLM to generate the missing DELIVERABLE block ──────
if (primaryTicker && resolvedTaskType === "stock_analysis") {
  try {
    const repairResp = await invokeLLMWithRetry({
      messages: [
        {
          role: "system",
          content: `You are a structured investment analysis assistant. Based on the analysis provided, output ONLY a valid JSON object wrapped in %%DELIVERABLE%% and %%END_DELIVERABLE%% markers. No other text.

Required JSON schema:
{
  "verdict": "BUY|SELL|HOLD|AVOID|WATCH",
  "confidence": 0-100,
  "horizon": "short|medium|long",
  "bull_case": "string",
  "reasoning": "string",
  "bear_case": "string",
  "risks": [{"label": "string", "severity": "low|medium|high|critical", "probability": 0-100}],
  "next_steps": ["string"]
}

Output format MUST be:
%%DELIVERABLE%%
{...json...}
%%END_DELIVERABLE%%`,
        },
        ...
      ],
    });
```

**scope 内 intentCtx 可用：** ✅ 是  
**scope 内 resolvedTaskType 可用：** ✅ 是（此处已判断 `=== "stock_analysis"`）  
**scope 内 primaryTicker 可用：** ✅ 是（此处已判断 `&& primaryTicker`）

---

### 样例 4：标题生成路径（L3657-3662）

**调用类型：** 对话标题生成（narrative / summarization 语义）

**调用原文（L3657-3662）：**

```ts
const titleResp = await invokeLLMWithRetry({
  messages: [
    {
      role: "system",
      content: "你是一个标题生成助手。根据用户的问题，生成一个3-5个汉字的精简标题，直接输出标题文字，不要任何标点、引号或解释。",
    },
    { role: "user", content: taskDescription.slice(0, 150) },
  ],
});
```

**scope 内 intentCtx 可用：** ✅ 是（但此调用在 async IIFE 内，intentCtx 通过闭包可访问）  
**scope 内 resolvedTaskType 可用：** ✅ 是（闭包）

---

## 四、intentInterpreter.ts 真实结构

### 4.1 IntentContext 完整 interface（原文）

```ts
// server/intentInterpreter.ts L14-37

export interface IntentContext {
  /** Canonical task classification */
  task_type: "stock_analysis" | "macro_analysis" | "crypto_analysis"
           | "portfolio_review" | "event_driven" | "discussion" | "general";
  /** One-sentence user goal summary */
  user_goal: string;
  /**
   * Time data freshness requirement:
   * - latest_available: any recent data acceptable (default for "now/current")
   * - realtime: explicit live price required
   * - recent: last 1-3 months trend
   * - historical: 1yr+ backtest / long-term comparison
   */
  time_mode: "latest_available" | "realtime" | "recent" | "historical";
  /** Whether user wants analysis execution or open discussion */
  interaction_mode: "execution" | "discussion";
  /** All tickers / company names / macro series mentioned */
  entity_scope: string[];
  /** Whether comparison across peers/indices is needed */
  comparison_needed: boolean;
  /** Whether downside / tail risk is the primary concern */
  risk_focus: boolean;
  /** Whether growth trajectory is the primary concern */
  growth_focus: boolean;
}
```

### 4.2 字段存在性核验

| 字段 | 存在 | 类型 | 说明 |
|------|------|------|------|
| `task_type` | ✅ | 7 值枚举 | 业务层分类（与 model_router TaskType 不同） |
| `user_goal` | ✅ | `string` | 一句话用户目标摘要 |
| `time_mode` | ✅ | 4 值枚举 | 数据时效性要求 |
| `interaction_mode` | ✅ | `"execution" \| "discussion"` | 执行 vs 讨论 |
| `entity_scope` | ✅ | `string[]` | 所有 ticker / 公司名 / 宏观序列 |
| `comparison_needed` | ✅ | `boolean` | 是否需要对比分析 |
| `risk_focus` | ✅ | `boolean` | 是否以下行风险为主 |
| `growth_focus` | ✅ | `boolean` | 是否以成长轨迹为主 |
| `ticker`（单值） | ❌ | — | 不存在，ticker 在 `entity_scope[]` 中 |
| `step` | ❌ | — | 不存在，无 step 字段 |
| `wants_summary` | ❌ | — | 不存在 |
| `wants_structured_json` | ❌ | — | 不存在 |

### 4.3 buildIntentContext 函数签名（完整原文）

```ts
// server/intentInterpreter.ts L101-150

export function buildIntentContext(
  taskParse: {
    task_type?: string;
    user_goal?: string;
    time_mode?: string;
    interaction_mode?: string;
    risk_focus?: boolean;
    comparison_needed?: boolean;
    symbols?: string[];
    markets?: string[];
  } | null | undefined,
  taskDescription: string,
  symbols: string[] = [],
): IntentContext
```

**设计原则：** Zero new LLM calls — 纯从 Step1 task_parse JSON + 启发式规则构建，无 LLM 调用。

### 4.4 在 routers.ts 中的可用性

`intentCtx` 在 `routers.ts` 中于 **L1098** 构建，在同一 async 函数（主分析 procedure）的整个生命周期内均可访问：

```ts
// routers.ts L1098-1102
const intentCtx = buildIntentContext(
  resourcePlan.taskSpec?.task_parse ?? null,
  taskDescription,
  primaryTicker ? [primaryTicker] : []
);
```

**结论：** `intentCtx` 在所有 `invokeLLMWithRetry` 调用点（L2585、L2617、L2634、L2763、L2929、L3549、L3566、L3657）均在 scope 内可直接访问，无需额外函数调用获取。

---

## 五、综合结论（对 Execution Trigger 设计的影响）

### 5.1 invokeLLM 签名无 task_type 参数

`InvokeParams` 中没有 `task_type` 字段。若要在 `invokeLLM` 层面做 trigger 判断，需要：

**方案 A（推荐）：** 在 `InvokeParams` 中增加可选 `triggerContext?: { task_type?: string; ticker?: string; step?: string }` 字段，由调用方（routers.ts）透传。

**方案 B：** 在 routers.ts 的调用点前直接做 trigger 判断，不修改 invokeLLM 签名。

### 5.2 intentCtx 字段丰富，可直接用于 trigger 判断

`intentCtx` 包含 `task_type`（业务分类）、`interaction_mode`（execution/discussion）、`entity_scope`（tickers）、`risk_focus`、`growth_focus` 等字段，足以支持精确的 trigger 路由决策。

**ticker 获取方式：** `intentCtx.entity_scope[0]` 或 `primaryTicker`（L865 单独定义）。

### 5.3 当前 invokeLLM 调用点的语义分布

| 调用位置 | 语义类型 | intentCtx 可用 | resolvedTaskType 可用 |
|---------|---------|--------------|---------------------|
| L2585 (Step3 主输出) | structured_json / research | ✅ | ✅ |
| L2607 (Step3 fallback) | structured_json | ✅ | ✅ |
| L2617 (Step3 no-key) | structured_json | ✅ | ✅ |
| L2634 (Step3 retry) | structured_json | ✅ | ✅ |
| L2763 (Step3 stream) | narrative | ✅ | ✅ |
| L2774 (Step3 alt) | narrative | ✅ | ✅ |
| L2929 (repair pass) | structured_json | ✅ | ✅（已判断 stock_analysis） |
| L3549 (memory summary) | summarization | ✅ | ✅ |
| L3566 (memory classify) | classification | ✅ | ✅ |
| L3657 (title gen) | summarization | ✅（闭包） | ✅（闭包） |
| L4490 (keyword extract) | classification | 需确认 | 需确认 |

---

*本文档为只读补充快照，零代码修改。*
