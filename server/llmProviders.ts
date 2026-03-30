/**
 * llmProviders.ts — DanTree LLM Provider Registry
 *
 * 统一管理 Anthropic 和 OpenAI 两家品牌的完整模型目录。
 * 当前 DanTree 核心调用仍使用 Manus 内置 invokeLLM()，
 * 本文件为未来切换做好准备，提供 invokeWithModel() 统一接口。
 *
 * 使用方式（未来切换后）：
 *   import { invokeWithModel, MODELS } from "./llmProviders";
 *   const result = await invokeWithModel({ model: MODELS.ANTHROPIC.OPUS_4_6, messages: [...] });
 *
 * 数据来源：
 *   Anthropic: https://platform.claude.com/docs/en/about-claude/models/overview (2026-03-30)
 *   OpenAI:    https://platform.openai.com/docs/models (2026-03-30)
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

// ─────────────────────────────────────────────────────────────────────────────
// 1. MODEL REGISTRY — 完整模型目录
// ─────────────────────────────────────────────────────────────────────────────

export const MODELS = {
  // ── Anthropic Claude ──────────────────────────────────────────────────────
  ANTHROPIC: {
    // Claude 4.6 系列（最新，2026年2月发布）
    OPUS_4_6: "claude-opus-4-6",           // 最强旗舰：最佳推理/规划/代码，$5/$25 per MTok，1M ctx
    SONNET_4_6: "claude-sonnet-4-6",       // 速度/智能最佳平衡，$3/$15 per MTok，1M ctx
    HAIKU_4_5: "claude-haiku-4-5",         // 最快最便宜，$1/$5 per MTok，200K ctx（alias）
    HAIKU_4_5_FULL: "claude-haiku-4-5-20251001", // Haiku 4.5 完整版本标识符

    // Claude 4.5 系列（2025年）
    OPUS_4_5: "claude-opus-4-5-20251101",  // Opus 4.5 快照版本
    SONNET_4_5: "claude-sonnet-4-5-20250929", // Sonnet 4.5 快照版本

    // Claude 3.7 系列（2025年初）
    SONNET_3_7: "claude-3-7-sonnet-20250219", // 3.7 Sonnet，支持 extended thinking

    // Claude 3.5 系列（2024年，稳定可用）
    SONNET_3_5: "claude-3-5-sonnet-20241022", // 3.5 Sonnet 最新快照
    HAIKU_3_5: "claude-3-5-haiku-20241022",   // 3.5 Haiku

    // Claude 3 系列（旧版，仍可用）
    OPUS_3: "claude-3-opus-20240229",      // 3 Opus
    SONNET_3: "claude-3-sonnet-20240229",  // 3 Sonnet
    HAIKU_3: "claude-3-haiku-20240307",    // 3 Haiku，最快最便宜旧版
  },

  // ── OpenAI GPT ────────────────────────────────────────────────────────────
  OPENAI: {
    // GPT-5.4 系列（最新旗舰，2026年）
    GPT_5_4: "gpt-5.4",                   // 旗舰：最强推理/代码/agentic，$2.50/$15 per MTok，1M ctx
    GPT_5_4_MINI: "gpt-5.4-mini",         // Mini：强代码/computer use，$0.75/$4.50 per MTok，400K ctx
    GPT_5_4_NANO: "gpt-5.4-nano",         // Nano：最便宜高频任务，$0.20/$1.25 per MTok，400K ctx

    // GPT-4o 系列（2024-2025年，稳定可用）
    GPT_4O: "gpt-4o",                     // 4o 最新版（alias，指向最新快照）
    GPT_4O_2024_11: "gpt-4o-2024-11-20",  // 4o 2024-11 快照
    GPT_4O_2024_08: "gpt-4o-2024-08-06",  // 4o 2024-08 快照（支持 structured outputs）
    GPT_4O_MINI: "gpt-4o-mini",           // 4o Mini（alias）
    GPT_4O_MINI_2024: "gpt-4o-mini-2024-07-18", // 4o Mini 快照

    // o 系列推理模型（2024-2025年）
    O3: "o3",                             // o3 最强推理（alias）
    O3_MINI: "o3-mini",                   // o3 Mini
    O4_MINI: "o4-mini",                   // o4 Mini（最新推理小模型）
    O1: "o1",                             // o1 推理模型
    O1_MINI: "o1-mini",                   // o1 Mini

    // 专用模型
    GPT_IMAGE_1_5: "gpt-image-1",         // 图像生成（GPT Image 1.5）
    GPT_IMAGE_MINI: "gpt-image-1-mini",   // 图像生成 Mini
    GPT_4O_TRANSCRIBE: "gpt-4o-transcribe",    // 语音转文字
    GPT_4O_MINI_TRANSCRIBE: "gpt-4o-mini-transcribe", // 语音转文字 Mini
    GPT_4O_MINI_TTS: "gpt-4o-mini-tts",   // 文字转语音
    GPT_REALTIME_1_5: "gpt-realtime-1.5", // 实时语音对话
    GPT_REALTIME_MINI: "gpt-realtime-mini", // 实时语音对话 Mini
    TEXT_EMBEDDING_3_LARGE: "text-embedding-3-large", // 向量嵌入（大）
    TEXT_EMBEDDING_3_SMALL: "text-embedding-3-small", // 向量嵌入（小）
    WHISPER_1: "whisper-1",               // 语音识别（旧版，仍可用）
  },
} as const;

// 模型提供商枚举
export type ModelProvider = "anthropic" | "openai" | "manus";

// 从模型 ID 自动判断提供商
export function detectProvider(modelId: string): ModelProvider {
  if (modelId.startsWith("claude-")) return "anthropic";
  if (
    modelId.startsWith("gpt-") ||
    modelId.startsWith("o1") ||
    modelId.startsWith("o3") ||
    modelId.startsWith("o4") ||
    modelId.startsWith("text-embedding") ||
    modelId.startsWith("whisper")
  )
    return "openai";
  return "manus";
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. MODEL METADATA — 模型元数据（定价、上下文窗口、能力）
// ─────────────────────────────────────────────────────────────────────────────

export interface ModelMeta {
  id: string;
  provider: ModelProvider;
  displayName: string;
  contextWindow: number;   // tokens
  maxOutput: number;       // tokens
  inputPricePerMTok: number;  // USD
  outputPricePerMTok: number; // USD
  supportsVision: boolean;
  supportsExtendedThinking: boolean;
  latency: "fastest" | "fast" | "moderate" | "slow";
  recommended_for: string[];
}

export const MODEL_METADATA: Record<string, ModelMeta> = {
  // ── Anthropic ──────────────────────────────────────────────────────────────
  "claude-opus-4-6": {
    id: "claude-opus-4-6", provider: "anthropic", displayName: "Claude Opus 4.6",
    contextWindow: 1_000_000, maxOutput: 128_000,
    inputPricePerMTok: 5.0, outputPricePerMTok: 25.0,
    supportsVision: true, supportsExtendedThinking: true, latency: "moderate",
    recommended_for: ["deep_research", "complex_reasoning", "long_context_analysis", "agent_tasks"],
  },
  "claude-sonnet-4-6": {
    id: "claude-sonnet-4-6", provider: "anthropic", displayName: "Claude Sonnet 4.6",
    contextWindow: 1_000_000, maxOutput: 64_000,
    inputPricePerMTok: 3.0, outputPricePerMTok: 15.0,
    supportsVision: true, supportsExtendedThinking: true, latency: "fast",
    recommended_for: ["structured_json", "narrative_generation", "daily_analysis"],
  },
  "claude-haiku-4-5": {
    id: "claude-haiku-4-5", provider: "anthropic", displayName: "Claude Haiku 4.5",
    contextWindow: 200_000, maxOutput: 64_000,
    inputPricePerMTok: 1.0, outputPricePerMTok: 5.0,
    supportsVision: true, supportsExtendedThinking: true, latency: "fastest",
    recommended_for: ["classification", "formatting", "high_volume"],
  },
  "claude-3-7-sonnet-20250219": {
    id: "claude-3-7-sonnet-20250219", provider: "anthropic", displayName: "Claude 3.7 Sonnet",
    contextWindow: 200_000, maxOutput: 64_000,
    inputPricePerMTok: 3.0, outputPricePerMTok: 15.0,
    supportsVision: true, supportsExtendedThinking: true, latency: "fast",
    recommended_for: ["code_analysis", "structured_output"],
  },
  "claude-3-5-sonnet-20241022": {
    id: "claude-3-5-sonnet-20241022", provider: "anthropic", displayName: "Claude 3.5 Sonnet",
    contextWindow: 200_000, maxOutput: 8_192,
    inputPricePerMTok: 3.0, outputPricePerMTok: 15.0,
    supportsVision: true, supportsExtendedThinking: false, latency: "fast",
    recommended_for: ["general_purpose", "legacy_compatibility"],
  },
  "claude-3-haiku-20240307": {
    id: "claude-3-haiku-20240307", provider: "anthropic", displayName: "Claude 3 Haiku",
    contextWindow: 200_000, maxOutput: 4_096,
    inputPricePerMTok: 0.25, outputPricePerMTok: 1.25,
    supportsVision: true, supportsExtendedThinking: false, latency: "fastest",
    recommended_for: ["legacy_high_volume"],
  },

  // ── OpenAI ─────────────────────────────────────────────────────────────────
  "gpt-5.4": {
    id: "gpt-5.4", provider: "openai", displayName: "GPT-5.4",
    contextWindow: 1_000_000, maxOutput: 128_000,
    inputPricePerMTok: 2.5, outputPricePerMTok: 15.0,
    supportsVision: true, supportsExtendedThinking: false, latency: "fast",
    recommended_for: ["agentic_tasks", "coding", "professional_workflows"],
  },
  "gpt-5.4-mini": {
    id: "gpt-5.4-mini", provider: "openai", displayName: "GPT-5.4 Mini",
    contextWindow: 400_000, maxOutput: 128_000,
    inputPricePerMTok: 0.75, outputPricePerMTok: 4.5,
    supportsVision: true, supportsExtendedThinking: false, latency: "fast",
    recommended_for: ["subagents", "computer_use", "cost_efficient_coding"],
  },
  "gpt-5.4-nano": {
    id: "gpt-5.4-nano", provider: "openai", displayName: "GPT-5.4 Nano",
    contextWindow: 400_000, maxOutput: 128_000,
    inputPricePerMTok: 0.2, outputPricePerMTok: 1.25,
    supportsVision: true, supportsExtendedThinking: false, latency: "fast",
    recommended_for: ["high_volume_simple_tasks", "classification"],
  },
  "gpt-4o": {
    id: "gpt-4o", provider: "openai", displayName: "GPT-4o",
    contextWindow: 128_000, maxOutput: 16_384,
    inputPricePerMTok: 2.5, outputPricePerMTok: 10.0,
    supportsVision: true, supportsExtendedThinking: false, latency: "fast",
    recommended_for: ["structured_json", "step_analysis", "general_purpose"],
  },
  "gpt-4o-mini": {
    id: "gpt-4o-mini", provider: "openai", displayName: "GPT-4o Mini",
    contextWindow: 128_000, maxOutput: 16_384,
    inputPricePerMTok: 0.15, outputPricePerMTok: 0.6,
    supportsVision: true, supportsExtendedThinking: false, latency: "fastest",
    recommended_for: ["fast_formatting", "simple_extraction"],
  },
  "o3": {
    id: "o3", provider: "openai", displayName: "OpenAI o3",
    contextWindow: 200_000, maxOutput: 100_000,
    inputPricePerMTok: 10.0, outputPricePerMTok: 40.0,
    supportsVision: true, supportsExtendedThinking: true, latency: "slow",
    recommended_for: ["math_reasoning", "scientific_analysis", "complex_planning"],
  },
  "o3-mini": {
    id: "o3-mini", provider: "openai", displayName: "OpenAI o3-mini",
    contextWindow: 200_000, maxOutput: 100_000,
    inputPricePerMTok: 1.1, outputPricePerMTok: 4.4,
    supportsVision: false, supportsExtendedThinking: true, latency: "moderate",
    recommended_for: ["cost_efficient_reasoning"],
  },
  "o4-mini": {
    id: "o4-mini", provider: "openai", displayName: "OpenAI o4-mini",
    contextWindow: 200_000, maxOutput: 100_000,
    inputPricePerMTok: 1.1, outputPricePerMTok: 4.4,
    supportsVision: true, supportsExtendedThinking: true, latency: "moderate",
    recommended_for: ["cost_efficient_reasoning", "vision_reasoning"],
  },
  "o1": {
    id: "o1", provider: "openai", displayName: "OpenAI o1",
    contextWindow: 200_000, maxOutput: 100_000,
    inputPricePerMTok: 15.0, outputPricePerMTok: 60.0,
    supportsVision: true, supportsExtendedThinking: true, latency: "slow",
    recommended_for: ["deep_reasoning_legacy"],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. UNIFIED INVOKE INTERFACE — 统一调用接口
// ─────────────────────────────────────────────────────────────────────────────

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface InvokeWithModelOptions {
  model: string;
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
  /** 仅 Anthropic 支持：启用 extended thinking */
  extendedThinking?: boolean;
  /** 仅 OpenAI 支持：结构化输出 JSON schema */
  responseFormat?: { type: "json_object" } | { type: "json_schema"; json_schema: object };
}

export interface LLMResponse {
  content: string;
  model: string;
  provider: ModelProvider;
  usage: {
    input_tokens: number;
    output_tokens: number;
    estimated_cost_usd: number;
  };
}

/**
 * invokeWithModel — 统一 LLM 调用接口
 *
 * 根据 model ID 自动路由到对应的 API 提供商。
 * 内部委托给 model_router.ts，通过 claude_provider / gpt_provider 执行。
 *
 * 推荐使用 routeToModel()（model_router.ts）以获得 task_type 路由和路由决策信息。
 * 此函数保留用于向后兼容和直接指定模型的场景。
 *
 * @example
 *   const res = await invokeWithModel({
 *     model: MODELS.ANTHROPIC.OPUS_4_6,
 *     messages: [{ role: "user", content: "Analyze AAPL" }],
 *   });
 *   console.log(res.content);
 */
export async function invokeWithModel(opts: InvokeWithModelOptions): Promise<LLMResponse> {
  const { routeToModel } = await import("./model_router");
  return routeToModel({
    task_type: "default",
    messages: opts.messages,
    maxTokens: opts.maxTokens,
    temperature: opts.temperature,
    override_model: opts.model,
    extendedThinking: opts.extendedThinking,
    responseFormat: opts.responseFormat,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ANTHROPIC IMPLEMENTATION
// ─────────────────────────────────────────────────────────────────────────────

async function _invokeAnthropic(
  opts: InvokeWithModelOptions,
  meta: ModelMeta | undefined
): Promise<LLMResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("[llmProviders] ANTHROPIC_API_KEY is not set.");

  const client = new Anthropic({ apiKey });

  // 分离 system message 和 user/assistant messages
  const systemMsg = opts.messages.find((m) => m.role === "system")?.content;
  const chatMessages = opts.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const maxTokens = opts.maxTokens ?? 4096;

  const requestParams: Anthropic.MessageCreateParamsNonStreaming = {
    model: opts.model,
    max_tokens: maxTokens,
    messages: chatMessages,
    ...(systemMsg ? { system: systemMsg } : {}),
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
  };

  // Extended thinking（仅 Opus/Sonnet 4.x 支持）
  if (opts.extendedThinking) {
    (requestParams as any).thinking = {
      type: "enabled",
      budget_tokens: Math.min(maxTokens, 10000),
    };
  }

  const response = await client.messages.create(requestParams);

  // 提取文本内容（跳过 thinking blocks）
  const textContent = response.content
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
    content: textContent,
    model: opts.model,
    provider: "anthropic",
    usage: { input_tokens: inputTokens, output_tokens: outputTokens, estimated_cost_usd: costUsd },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. OPENAI IMPLEMENTATION
//    在 Manus 沙箱环境中，OpenAI 直连受网络隔离限制。
//    使用 Manus Forge 代理网关（OpenAI 兼容接口）路由 GPT 请求：
//      baseURL = BUILT_IN_FORGE_API_URL（https://forge.manus.ai）
//      apiKey  = OPENAI_API_KEY（优先）或 BUILT_IN_FORGE_API_KEY
//    在独立服务器环境中，Forge URL 不存在时自动回退到直连 OpenAI。
// ─────────────────────────────────────────────────────────────────────────────

async function _invokeOpenAI(
  opts: InvokeWithModelOptions,
  meta: ModelMeta | undefined
): Promise<LLMResponse> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.BUILT_IN_FORGE_API_KEY;
  if (!apiKey) throw new Error("[llmProviders] OPENAI_API_KEY is not set.");

  // Manus 沙箱：通过 Forge 代理网关（OpenAI 兼容），避免直连被拦截
  // 独立服务器：BUILT_IN_FORGE_API_URL 不存在，自动直连 OpenAI
  const forgeUrl = process.env.BUILT_IN_FORGE_API_URL;
  const baseURL = forgeUrl
    ? `${forgeUrl.replace(/\/$/, "")}/v1`
    : "https://api.openai.com/v1";

  const client = new OpenAI({ apiKey, baseURL });

  const messages = opts.messages.map((m) => ({
    role: m.role,
    content: m.content,
  })) as OpenAI.ChatCompletionMessageParam[];

  const requestParams: OpenAI.ChatCompletionCreateParamsNonStreaming = {
    model: opts.model,
    messages,
    ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    ...(opts.responseFormat ? { response_format: opts.responseFormat as any } : {}),
  };

  const response = await client.chat.completions.create(requestParams);

  const content = response.choices[0]?.message?.content ?? "";
  const inputTokens = response.usage?.prompt_tokens ?? 0;
  const outputTokens = response.usage?.completion_tokens ?? 0;
  const costUsd = meta
    ? (inputTokens / 1_000_000) * meta.inputPricePerMTok +
      (outputTokens / 1_000_000) * meta.outputPricePerMTok
    : 0;

  return {
    content,
    model: opts.model,
    provider: "openai",
    usage: { input_tokens: inputTokens, output_tokens: outputTokens, estimated_cost_usd: costUsd },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. CONVENIENCE HELPERS — 便捷辅助函数
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 获取模型元数据（含定价、上下文窗口等）
 */
export function getModelMeta(modelId: string): ModelMeta | undefined {
  return MODEL_METADATA[modelId];
}

/**
 * 列出所有可用模型（按提供商过滤）
 */
export function listModels(provider?: ModelProvider): ModelMeta[] {
  const all = Object.values(MODEL_METADATA);
  return provider ? all.filter((m) => m.provider === provider) : all;
}

/**
 * 按用途推荐模型
 * @example recommendModel("deep_research") → "claude-opus-4-6"
 */
export function recommendModel(useCase: string): string {
  const match = Object.values(MODEL_METADATA).find((m) =>
    m.recommended_for.includes(useCase)
  );
  // 默认回退到 Claude Sonnet 4.6（性价比最高）
  return match?.id ?? MODELS.ANTHROPIC.SONNET_4_6;
}

/**
 * 估算调用成本（不实际调用 API）
 */
export function estimateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const meta = MODEL_METADATA[modelId];
  if (!meta) return 0;
  return (
    (inputTokens / 1_000_000) * meta.inputPricePerMTok +
    (outputTokens / 1_000_000) * meta.outputPricePerMTok
  );
}
