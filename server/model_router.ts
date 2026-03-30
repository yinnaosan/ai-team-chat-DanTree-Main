/**
 * model_router.ts — DanTree Model Router (Hardened v2.0)
 *
 * DanTree AI 协作协议 v1.0 — Model & Agent Execution Protocol
 *
 * 职责：
 *   - 定义严格的 TaskType 枚举（5 种通用 + 8 种 DanTree 专用）
 *   - 定义统一的 RouterResponse 输出结构（所有 provider 必须遵守）
 *   - 提供 modelRouter.generate() 作为唯一真实入口
 *   - 提供 routeToModel() 作为 DanTree 内部快捷入口（委托给 modelRouter.generate）
 *   - 将 invokeWithModel() 降级为 deprecated wrapper
 *
 * 路由规则：
 *   development（DANTREE_MODE != "production"）：所有 task_type → Anthropic (Claude)
 *   production（DANTREE_MODE=production）：
 *     research / deep_research / narrative / execution / summarization → anthropic
 *     reasoning / structured_json / step_analysis                     → openai
 *     classification / code_analysis / agent_task / default           → anthropic
 *
 * 使用方式：
 *   import { modelRouter, TaskType } from "./model_router";
 *   const result = await modelRouter.generate(input, "research");
 *
 *   // DanTree 内部快捷方式（向后兼容）：
 *   import { routeToModel } from "./model_router";
 *   const result = await routeToModel({ task_type: "deep_research", messages: [...] });
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { MODELS, MODEL_METADATA, detectProvider, type LLMMessage, type LLMResponse, type ModelProvider } from "./llmProviders";

// ─────────────────────────────────────────────────────────────────────────────
// 1. TASK TYPE — 严格枚举定义
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TaskType — DanTree 任务类型枚举（协议 v1.0 规范）
 *
 * 通用类型（Claude 协议 v1.0）：
 *   research:      深度研究、数据分析、多源综合
 *   reasoning:     逻辑推断、情景推演、因果链分析
 *   narrative:     叙事合成、报告生成、投资者沟通
 *   execution:     代码生成、结构化输出、系统指令
 *   summarization: 摘要压缩、要点提取、简报生成
 *
 * DanTree 专用类型（内部路由扩展）：
 *   deep_research:   runDeepResearch() — 深度研究叙事（→ Claude Opus）
 *   structured_json: 结构化 JSON 输出（生产 → GPT-4o，开发 → Claude Sonnet）
 *   step_analysis:   DanTree Step 分析流程（生产 → GPT-4o，开发 → Claude Sonnet）
 *   classification:  快速分类/格式化（→ Claude Haiku）
 *   code_analysis:   代码理解/分析（→ Claude Sonnet）
 *   agent_task:      Agent 规划任务（→ Claude Opus）
 *   default:         通用回退（→ Claude Sonnet）
 */
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

/** 向后兼容别名 */
export type DanTreeTaskType = TaskType;

export const TASK_TYPES: Record<TaskType, TaskType> = {
  research: "research",
  reasoning: "reasoning",
  narrative: "narrative",
  execution: "execution",
  summarization: "summarization",
  deep_research: "deep_research",
  structured_json: "structured_json",
  step_analysis: "step_analysis",
  classification: "classification",
  code_analysis: "code_analysis",
  agent_task: "agent_task",
  default: "default",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 2. UNIFIED RESPONSE SHAPE — 所有 provider 必须返回此结构
// ─────────────────────────────────────────────────────────────────────────────

export interface RouterResponse extends Omit<LLMResponse, 'provider' | 'usage'> {
  /** 统一文本输出（别名 content，两者保持同步） */
  output: string;
  /** provider 标识（严格三选一） */
  provider: "anthropic" | "openai" | "gpt_stub";
  /** 统一 usage（覆盖 LLMResponse.usage） */
  usage: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    estimated_cost_usd?: number;
  };
  /** 路由决策信息（调试用） */
  routing?: {
    task_type: TaskType;
    mode: DanTreeMode;
    resolved_model: string;
    provider: ModelProvider | "gpt_stub";
    was_overridden: boolean;
  };
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. ROUTER INPUT
// ─────────────────────────────────────────────────────────────────────────────

export interface RouterInput {
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
  /** 强制覆盖路由，忽略 task_type 映射 */
  forceModel?: string;
  /** 向后兼容：override_model（等同于 forceModel） */
  override_model?: string;
  /** 仅 Claude：启用 extended thinking */
  extendedThinking?: boolean;
  /** 仅 GPT：结构化输出 JSON schema */
  responseFormat?: { type: "json_object" } | { type: "json_schema"; json_schema: object };
}

/** 向后兼容：RouterOptions = RouterInput + task_type */
export interface RouterOptions extends RouterInput {
  task_type: TaskType;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ROUTING MAPS
// ─────────────────────────────────────────────────────────────────────────────

export type DanTreeMode = "development" | "production";

type ProviderTarget = "anthropic" | "openai";

/** 生产路由表：task_type → provider */
export const PRODUCTION_ROUTING_MAP: Record<TaskType, ProviderTarget> = {
  // 通用类型
  research:      "anthropic",  // Claude — 深度研究最佳
  reasoning:     "openai",     // GPT o 系列 — 推理链最佳
  narrative:     "openai",     // GPT — 叙事生成
  execution:     "anthropic",  // Claude — 结构化执行最佳
  summarization: "anthropic",  // Claude — 长文压缩最佳
  // DanTree 专用类型
  deep_research:   "anthropic",  // Claude Opus — 最强推理
  structured_json: "openai",     // GPT-4o — 结构化输出稳定
  step_analysis:   "openai",     // GPT-4o — Step 分析
  classification:  "anthropic",  // Claude Haiku — 最快最便宜
  code_analysis:   "anthropic",  // Claude Sonnet — 代码理解
  agent_task:      "anthropic",  // Claude Opus — Agent 规划
  default:         "anthropic",  // Claude Sonnet — 通用回退
};

/** 生产路由表：task_type → 各 provider 的默认模型 */
const PRODUCTION_MODEL_MAP: Record<TaskType, Record<ProviderTarget, string>> = {
  research:      { anthropic: MODELS.ANTHROPIC.OPUS_4_6,    openai: MODELS.OPENAI.GPT_5_4 },
  reasoning:     { anthropic: MODELS.ANTHROPIC.OPUS_4_6,    openai: MODELS.OPENAI.O3 },
  narrative:     { anthropic: MODELS.ANTHROPIC.SONNET_4_6,  openai: MODELS.OPENAI.GPT_5_4 },
  execution:     { anthropic: MODELS.ANTHROPIC.SONNET_4_6,  openai: MODELS.OPENAI.GPT_5_4 },
  summarization: { anthropic: MODELS.ANTHROPIC.HAIKU_4_5,   openai: MODELS.OPENAI.GPT_5_4_MINI },
  deep_research:   { anthropic: MODELS.ANTHROPIC.OPUS_4_6,    openai: MODELS.OPENAI.GPT_5_4 },
  structured_json: { anthropic: MODELS.ANTHROPIC.SONNET_4_6,  openai: MODELS.OPENAI.GPT_4O },
  step_analysis:   { anthropic: MODELS.ANTHROPIC.SONNET_4_6,  openai: MODELS.OPENAI.GPT_4O },
  classification:  { anthropic: MODELS.ANTHROPIC.HAIKU_4_5,   openai: MODELS.OPENAI.GPT_5_4_MINI },
  code_analysis:   { anthropic: MODELS.ANTHROPIC.SONNET_4_6,  openai: MODELS.OPENAI.GPT_5_4 },
  agent_task:      { anthropic: MODELS.ANTHROPIC.OPUS_4_6,    openai: MODELS.OPENAI.GPT_5_4 },
  default:         { anthropic: MODELS.ANTHROPIC.SONNET_4_6,  openai: MODELS.OPENAI.GPT_5_4 },
};

/** 开发模式默认模型（Claude Sonnet，性价比最高） */
const DEVELOPMENT_MODEL = MODELS.ANTHROPIC.SONNET_4_6;

function getCurrentMode(): DanTreeMode {
  const mode = process.env.DANTREE_MODE ?? process.env.MODEL_ROUTER_MODE;
  if (mode === "production") return "production";
  return "development";
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. PROVIDER IMPLEMENTATIONS — 内部实现，不对外暴露
// ─────────────────────────────────────────────────────────────────────────────

async function _callAnthropic(
  modelId: string,
  input: RouterInput,
  taskType: TaskType
): Promise<RouterResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("[model_router] ANTHROPIC_API_KEY is not set.");

  const client = new Anthropic({ apiKey });

  const systemMsg = input.messages.find((m) => m.role === "system")?.content;
  const chatMessages = input.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const maxTokens = input.maxTokens ?? 4096;
  const meta = MODEL_METADATA[modelId];

  const requestParams: Anthropic.MessageCreateParamsNonStreaming = {
    model: modelId,
    max_tokens: maxTokens,
    messages: chatMessages,
    ...(systemMsg ? { system: systemMsg } : {}),
    ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
  };

  if (input.extendedThinking) {
    (requestParams as any).thinking = {
      type: "enabled",
      budget_tokens: Math.min(maxTokens, 10000),
    };
  }

  const response = await client.messages.create(requestParams);

  const outputText = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const costUsd = meta
    ? (inputTokens / 1_000_000) * meta.inputPricePerMTok +
      (outputTokens / 1_000_000) * meta.outputPricePerMTok
    : 0;

  return {
    content: outputText,
    output: outputText,
    model: modelId,
    provider: "anthropic",
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
      estimated_cost_usd: costUsd,
    },
    metadata: { task_type: taskType, stop_reason: response.stop_reason },
  };
}

async function _callOpenAI(
  modelId: string,
  input: RouterInput,
  taskType: TaskType
): Promise<RouterResponse> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.BUILT_IN_FORGE_API_KEY;
  if (!apiKey) throw new Error("[model_router] OPENAI_API_KEY is not set.");

  const forgeUrl = process.env.BUILT_IN_FORGE_API_URL;
  const baseURL = forgeUrl
    ? `${forgeUrl.replace(/\/$/, "")}/v1`
    : "https://api.openai.com/v1";

  const client = new OpenAI({ apiKey, baseURL });
  const meta = MODEL_METADATA[modelId];

  const messages = input.messages.map((m) => ({
    role: m.role,
    content: m.content,
  })) as OpenAI.ChatCompletionMessageParam[];

  const requestParams: OpenAI.ChatCompletionCreateParamsNonStreaming = {
    model: modelId,
    messages,
    ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
    ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
    ...(input.responseFormat ? { response_format: input.responseFormat as any } : {}),
  };

  const response = await client.chat.completions.create(requestParams);

  const outputText = response.choices[0]?.message?.content ?? "";
  const inputTokens = response.usage?.prompt_tokens ?? 0;
  const outputTokens = response.usage?.completion_tokens ?? 0;
  const costUsd = meta
    ? (inputTokens / 1_000_000) * meta.inputPricePerMTok +
      (outputTokens / 1_000_000) * meta.outputPricePerMTok
    : 0;

  return {
    content: outputText,
    output: outputText,
    model: modelId,
    provider: "openai",
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: response.usage?.total_tokens ?? inputTokens + outputTokens,
      estimated_cost_usd: costUsd,
    },
    metadata: {
      task_type: taskType,
      finish_reason: response.choices[0]?.finish_reason,
    },
  };
}

function _callGptStub(
  modelId: string,
  input: RouterInput,
  taskType: TaskType
): RouterResponse {
  const preview = input.messages[input.messages.length - 1]?.content ?? "";
  const outputText = `[GPT_STUB] task_type=${taskType} model=${modelId} | input_preview="${String(preview).slice(0, 80)}..."`;
  return {
    content: outputText,
    output: outputText,
    model: modelId,
    provider: "gpt_stub",
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      estimated_cost_usd: 0,
    },
    metadata: { task_type: taskType, stub: true },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. TASK TYPE VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

function _validateTaskType(taskType: unknown): asserts taskType is TaskType {
  if (!Object.keys(TASK_TYPES).includes(taskType as string)) {
    throw new Error(
      `[model_router] Invalid task_type: "${taskType}". ` +
        `Must be one of: ${Object.keys(TASK_TYPES).join(", ")}`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. MODEL ROUTER — 唯一真实入口
// ─────────────────────────────────────────────────────────────────────────────

export const modelRouter = {
  /**
   * generate() — Model Router 唯一真实调用入口
   *
   * @param input    RouterInput（messages + 可选参数）
   * @param taskType TaskType 枚举（必填，严格校验）
   * @returns        RouterResponse（统一输出结构）
   *
   * @example
   *   const result = await modelRouter.generate(
   *     { messages: [{ role: "user", content: "Analyze AAPL" }] },
   *     "research"
   *   );
   *   console.log(result.output, result.provider);
   */
  async generate(input: RouterInput, taskType: TaskType): Promise<RouterResponse> {
    _validateTaskType(taskType);

    const mode = getCurrentMode();
    const forceModel = input.forceModel ?? input.override_model;

    // forceModel 覆盖路由
    if (forceModel) {
      const provider = detectProvider(forceModel);
      let result: RouterResponse;
      if (provider === "anthropic") {
        result = await _callAnthropic(forceModel, input, taskType);
      } else {
        const hasOpenAIKey = !!process.env.OPENAI_API_KEY || !!process.env.BUILT_IN_FORGE_API_KEY;
        result = hasOpenAIKey
          ? await _callOpenAI(forceModel, input, taskType)
          : _callGptStub(forceModel, input, taskType);
      }
      return {
        ...result,
        routing: {
          task_type: taskType,
          mode,
          resolved_model: forceModel,
          provider: result.provider,
          was_overridden: true,
        },
      };
    }

    if (mode === "development") {
      // Development: 所有 task_type → Claude Sonnet（性价比最高）
      const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
      const resolvedModel = DEVELOPMENT_MODEL;
      if (!hasAnthropicKey) {
        const result = _callGptStub(resolvedModel, input, taskType);
        return {
          ...result,
          routing: { task_type: taskType, mode, resolved_model: resolvedModel, provider: "gpt_stub", was_overridden: false },
        };
      }
      const result = await _callAnthropic(resolvedModel, input, taskType);
      return {
        ...result,
        routing: { task_type: taskType, mode, resolved_model: resolvedModel, provider: "anthropic", was_overridden: false },
      };
    }

    // Production: 按路由表分发
    const targetProvider = PRODUCTION_ROUTING_MAP[taskType];
    const targetModel = PRODUCTION_MODEL_MAP[taskType][targetProvider];

    if (targetProvider === "anthropic") {
      const result = await _callAnthropic(targetModel, input, taskType);
      return {
        ...result,
        routing: { task_type: taskType, mode, resolved_model: targetModel, provider: "anthropic", was_overridden: false },
      };
    }

    // OpenAI — 如未接入 key，降级到 stub
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY || !!process.env.BUILT_IN_FORGE_API_KEY;
    if (!hasOpenAIKey) {
      console.warn(
        `[model_router] OpenAI key not set for task_type="${taskType}". Falling back to GPT stub.`
      );
      const result = _callGptStub(targetModel, input, taskType);
      return {
        ...result,
        routing: { task_type: taskType, mode, resolved_model: targetModel, provider: "gpt_stub", was_overridden: false },
      };
    }

    const result = await _callOpenAI(targetModel, input, taskType);
    return {
      ...result,
      routing: { task_type: taskType, mode, resolved_model: targetModel, provider: "openai", was_overridden: false },
    };
  },

  /**
   * routingFor() — 查询某 task_type 在当前环境下的路由目标（不实际调用）
   */
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
};

// ─────────────────────────────────────────────────────────────────────────────
// 8. routeToModel — DanTree 内部快捷入口（向后兼容）
//    委托给 modelRouter.generate()，保留 routing 字段
// ─────────────────────────────────────────────────────────────────────────────

/**
 * routeToModel — DanTree 统一模型路由入口（向后兼容）
 *
 * 内部委托给 modelRouter.generate()。
 * 新代码请直接使用 modelRouter.generate()。
 *
 * @example
 *   const res = await routeToModel({
 *     task_type: "deep_research",
 *     messages: [{ role: "user", content: "Analyze AAPL..." }],
 *   });
 */
export async function routeToModel(opts: RouterOptions): Promise<RouterResponse> {
  return modelRouter.generate(
    {
      messages: opts.messages,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
      forceModel: opts.forceModel ?? opts.override_model,
      extendedThinking: opts.extendedThinking,
      responseFormat: opts.responseFormat,
    },
    opts.task_type
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. CONVENIENCE SHORTCUTS — DanTree 专用快捷函数（委托给 modelRouter.generate）
// ─────────────────────────────────────────────────────────────────────────────

/** 深度研究叙事（→ Claude Opus 4.6） */
export async function routeDeepResearch(
  messages: LLMMessage[],
  opts?: Partial<RouterInput>
): Promise<RouterResponse> {
  return modelRouter.generate({ ...opts, messages }, "deep_research");
}

/** 叙事生成（→ Claude Sonnet 4.6） */
export async function routeNarrative(
  messages: LLMMessage[],
  opts?: Partial<RouterInput>
): Promise<RouterResponse> {
  return modelRouter.generate({ ...opts, messages }, "narrative");
}

/** 结构化 JSON（生产 → GPT-4o，开发 → Claude Sonnet） */
export async function routeStructuredJSON(
  messages: LLMMessage[],
  responseFormat?: RouterInput["responseFormat"],
  opts?: Partial<RouterInput>
): Promise<RouterResponse> {
  return modelRouter.generate({ ...opts, messages, responseFormat }, "structured_json");
}

/** Step 分析（生产 → GPT-4o，开发 → Claude Sonnet） */
export async function routeStepAnalysis(
  messages: LLMMessage[],
  opts?: Partial<RouterInput>
): Promise<RouterResponse> {
  return modelRouter.generate({ ...opts, messages }, "step_analysis");
}

/** 快速分类（→ Claude Haiku 4.5） */
export async function routeClassification(
  messages: LLMMessage[],
  opts?: Partial<RouterInput>
): Promise<RouterResponse> {
  return modelRouter.generate({ ...opts, messages }, "classification");
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. ROUTER HEALTH CHECK
// ─────────────────────────────────────────────────────────────────────────────

export interface RouterHealthStatus {
  mode: DanTreeMode;
  claude: { available: boolean; latency_ms?: number; error?: string };
  gpt: { available: boolean; latency_ms?: number; error?: string; note?: string };
}

export async function checkRouterHealth(): Promise<RouterHealthStatus> {
  const { checkClaudeHealth } = await import("./claude_provider");
  const { checkGPTHealth } = await import("./gpt_provider");

  const mode = getCurrentMode();
  const [claudeHealth, gptHealth] = await Promise.allSettled([
    checkClaudeHealth(),
    checkGPTHealth(),
  ]);

  const claudeResult = claudeHealth.status === "fulfilled"
    ? claudeHealth.value
    : { ok: false, latency_ms: 0, error: String((claudeHealth as PromiseRejectedResult).reason) };

  const gptResult = gptHealth.status === "fulfilled"
    ? gptHealth.value
    : { ok: false, latency_ms: 0, error: String((gptHealth as PromiseRejectedResult).reason) };

  return {
    mode,
    claude: {
      available: claudeResult.ok,
      latency_ms: claudeResult.latency_ms,
      error: claudeResult.error,
    },
    gpt: {
      available: gptResult.ok,
      latency_ms: gptResult.latency_ms,
      error: gptResult.error,
      note: mode === "development"
        ? "GPT not used in development mode (Claude-only)"
        : undefined,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. DEPRECATED WRAPPERS
//
//    ⚠️  DEPRECATED: 请使用 modelRouter.generate() 替代
//    以下函数仅保留向后兼容性，内部委托给 modelRouter.generate()
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @deprecated 请使用 `modelRouter.generate(input, task_type)` 或 `routeToModel(opts)`
 * 保留向后兼容性，内部委托给 modelRouter.generate()
 */
export async function invokeWithModelRouter(
  messages: LLMMessage[],
  taskType: TaskType = "research",
  options?: { maxTokens?: number; temperature?: number }
): Promise<RouterResponse> {
  console.warn(
    "[model_router] invokeWithModelRouter() is deprecated. " +
      "Use modelRouter.generate() directly."
  );
  return modelRouter.generate(
    { messages, maxTokens: options?.maxTokens, temperature: options?.temperature },
    taskType
  );
}

/**
 * getRouterStatus — 获取当前路由器状态（兼容旧测试）
 */
export function getRouterStatus(): { mode: DanTreeMode; claudeOnly: boolean } {
  const mode = getCurrentMode();
  return { mode, claudeOnly: mode === "development" };
}

/**
 * getAvailableModels — 获取所有可用模型列表（兼容旧测试）
 */
export function getAvailableModels(): string[] {
  const anthropicModels: string[] = Object.values(MODELS.ANTHROPIC);
  const openaiModels: string[] = Object.values(MODELS.OPENAI);
  return anthropicModels.concat(openaiModels);
}
