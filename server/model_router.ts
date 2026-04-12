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
 *     GPT 主控： research / reasoning / deep_research / narrative / summarization
 *                  structured_json / step_analysis / default → openai (GPT-5.4)
 *     Claude 执行： execution / code_analysis / agent_task / classification → anthropic
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
  /** v3: 执行权威目标（来自 decideExecutionTriggerV3） */
  executionTarget?: ExecutionTarget;
  /** v3: 执行模式（来自 decideExecutionTriggerV3） */
  executionMode?: ExecutionMode;
  /** v3: Trigger v3 observability metadata（单一真相来源） */
  triggerV3Meta?: {
    trigger_rule:       string;
    resolved_task_type: string;
    final_task_type:    string;
  };
}

/** 向后兼容：RouterOptions = RouterInput + task_type */
export interface RouterOptions extends RouterInput {
  task_type: TaskType;
}

/**
 * ExecutionTarget — 执行权威目标
 * gpt    = GPT-5.4 主控（pipeline / research / narrative）
 * claude = Claude Sonnet 主控（execution / repair / agent）
 * hybrid = 双模协作（保留扩展）
 */
export type ExecutionTarget = "gpt" | "claude" | "hybrid";

/**
 * ExecutionMode — 执行模式
 * primary  = 正常主路径
 * fallback = 降级路径
 * repair   = JSON 修复 / 结构化重试路径
 */
export type ExecutionMode = "primary" | "fallback" | "repair";

// ─────────────────────────────────────────────────────────────────────────────
// 4. ROUTING MAPS
// ─────────────────────────────────────────────────────────────────────────────

export type DanTreeMode = "development" | "production";

type ProviderTarget = "anthropic" | "openai";

/** 生产路由表：task_type → provider
 *
 * GPT 主控：研究 / 判断 / 风险 / 输出类
 * Claude 执行：执行 / 代码 / Agent pipeline 类
 */
export const PRODUCTION_ROUTING_MAP: Record<TaskType, ProviderTarget> = {
  // ── GPT 主控（研究 / 判断 / 风险 / 输出）────────────────────────────────
  research:        "openai",     // GPT-5.4 — 深度研究、多源综合
  reasoning:       "openai",     // GPT-5.4 / o3 — 推理链、因果分析
  deep_research:   "openai",     // GPT-5.4 — 深度叙事研究
  narrative:       "openai",     // GPT-5.4 — 报告生成、投资者沟通
  summarization:   "openai",     // GPT-5.4-mini — 摘要压缩、要点提取
  structured_json: "openai",     // GPT-5.4 — 结构化 JSON 输出
  step_analysis:   "openai",     // GPT-5.4 — DanTree Step 分析流程
  default:         "openai",     // GPT-5.4 — 通用回退
  // ── Claude 执行（执行 / 代码 / Agent pipeline）─────────────────────────
  execution:       "anthropic",  // Claude Sonnet — 结构化指令执行
  code_analysis:   "anthropic",  // Claude Sonnet — 代码理解 / 分析
  agent_task:      "anthropic",  // Claude Opus — Agent 规划 / 多步流程
  classification:  "anthropic",  // Claude Haiku — 快速分类，最低成本
};

/** 生产路由表：task_type → 各 provider 的默认模型 */
const PRODUCTION_MODEL_MAP: Record<TaskType, Record<ProviderTarget, string>> = {
  research:      { anthropic: MODELS.ANTHROPIC.OPUS_4_6,    openai: MODELS.OPENAI.GPT_5_4 },
  reasoning:     { anthropic: MODELS.ANTHROPIC.OPUS_4_6,    openai: MODELS.OPENAI.O3 },
  narrative:     { anthropic: MODELS.ANTHROPIC.SONNET_4_6,  openai: MODELS.OPENAI.GPT_5_4 },
  execution:     { anthropic: MODELS.ANTHROPIC.SONNET_4_6,  openai: MODELS.OPENAI.GPT_5_4 },
  summarization: { anthropic: MODELS.ANTHROPIC.HAIKU_4_5,   openai: MODELS.OPENAI.GPT_5_4_MINI },
  deep_research:   { anthropic: MODELS.ANTHROPIC.OPUS_4_6,    openai: MODELS.OPENAI.GPT_5_4 },
  structured_json: { anthropic: MODELS.ANTHROPIC.SONNET_4_6,  openai: MODELS.OPENAI.GPT_5_4 },
  step_analysis:   { anthropic: MODELS.ANTHROPIC.SONNET_4_6,  openai: MODELS.OPENAI.GPT_5_4 },
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
// 4.5 PROVIDER AUTHORITY RESOLVER (v3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * resolveProviderWithAuthority — authority hint + routing map → final provider
 *
 * 内部工具，不对外导出。由 generate() 调用。
 *
 * 策略：
 *   1. 开发态：始终返回 anthropic（开发态全用 Claude）
 *   2. 生产态：
 *      - executionTarget="claude" → 强制 anthropic（authority override）
 *      - executionTarget="gpt"    → 强制 openai（authority override）
 *      - executionTarget="hybrid" → 遵循 PRODUCTION_ROUTING_MAP
 *      - executionTarget=undefined → 遵循 PRODUCTION_ROUTING_MAP
 */
function resolveProviderWithAuthority(
  taskType: TaskType,
  executionTarget: ExecutionTarget | undefined,
  mode: DanTreeMode
): { provider: "anthropic" | "openai"; strategy: "authority_override" | "routing_map" } {
  if (mode === "development") {
    return { provider: "anthropic", strategy: "routing_map" };
  }
  // Production: authority override takes precedence
  if (executionTarget === "claude") {
    return { provider: "anthropic", strategy: "authority_override" };
  }
  if (executionTarget === "gpt") {
    return { provider: "openai", strategy: "authority_override" };
  }
  // No authority hint or hybrid: fall back to PRODUCTION_ROUTING_MAP
  const mapped = PRODUCTION_ROUTING_MAP[taskType] ?? "openai";
  return { provider: mapped, strategy: "routing_map" };
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


/** v2 白名单（与 TASK_TYPES 保持同步） */
const TASK_TYPE_WHITELIST = new Set<string>(Object.keys(TASK_TYPES));

/** GPT 主控任务列表（用于 dev_override 标记） */
const GPT_TASK_TYPES = new Set<string>([
  "research", "reasoning", "deep_research", "narrative",
  "summarization", "structured_json", "step_analysis", "default",
]);

export interface NormalizeResult {
  normalized_task_type: TaskType;
  fallback_applied: boolean;
  fallback_reason: string;
}

/**
 * normalizeTaskType — v2 规范
 * - undefined / null / "" → "default"
 * - 不在白名单 → "default" + fallback_applied = true
 * - 合法值 → 原值
 */
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

/** @deprecated 内部 assert，仅向后兼容，新代码请用 normalizeTaskType */
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
  async generate(input: RouterInput, taskType?: unknown): Promise<RouterResponse> {
    // ── Step 1-2: normalize task_type（v2 规范：非法值 fallback 到 default）
    const { normalized_task_type, fallback_applied, fallback_reason } = normalizeTaskType(taskType);
    const resolvedTaskType = normalized_task_type;

    // ── Step 3: 判 mode
    const mode = getCurrentMode();
    const forceModel = input.forceModel ?? input.override_model;

    // ── forceModel 覆盖路由
    if (forceModel) {
      const provider = detectProvider(forceModel);
      let result: RouterResponse;
      if (provider === "anthropic") {
        result = await _callAnthropic(forceModel, input, resolvedTaskType);
      } else {
        const hasOpenAIKey = !!process.env.OPENAI_API_KEY || !!process.env.BUILT_IN_FORGE_API_KEY;
        result = hasOpenAIKey
          ? await _callOpenAI(forceModel, input, resolvedTaskType)
          : _callGptStub(forceModel, input, resolvedTaskType);
      }
      const log = {
        original_task_type: taskType,
        normalized_task_type: resolvedTaskType,
        mode,
        provider: result.provider,
        model: forceModel,
        fallback_applied,
        fallback_reason,
        dev_override_applied: false,
        dev_override_reason: "",
      };
      console.log("[model_router:route]", JSON.stringify(log));
      return {
        ...result,
        routing: { task_type: resolvedTaskType, mode, resolved_model: forceModel, provider: result.provider, was_overridden: true },
      };
    }

    if (mode === "development") {
      // ── Step 4-5: development — 全部走 Claude，但标记 GPT 任务的 dev_override
      const isGptTask = GPT_TASK_TYPES.has(resolvedTaskType);
      // v3: dev_override = true 当 executionTarget="gpt" 或 task 属于 GPT 类
      const devOverrideApplied = input.executionTarget === "gpt" || (input.executionTarget === undefined && isGptTask);
      const devOverrideReason = devOverrideApplied
        ? `executionTarget="${input.executionTarget ?? resolvedTaskType}" overridden to Claude in development`
        : "";

      const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
      const resolvedModel = DEVELOPMENT_MODEL;

      let result: RouterResponse;
      if (!hasAnthropicKey) {
        result = _callGptStub(resolvedModel, input, resolvedTaskType);
      } else {
        result = await _callAnthropic(resolvedModel, input, resolvedTaskType);
      }

      // ── Step 6: LOG
      const log = {
        original_task_type: taskType,
        normalized_task_type: resolvedTaskType,
        mode,
        provider: result.provider,
        model: resolvedModel,
        fallback_applied,
        fallback_reason,
        dev_override_applied: devOverrideApplied,
        dev_override_reason: devOverrideReason,
      };
      console.log("[model_router:route]", JSON.stringify(log));

      // v3: inject 8-field observability metadata (single source of truth)
      const v3Meta = {
        execution_target:    input.executionTarget ?? "none",
        execution_mode:      input.executionMode   ?? "primary",
        selected_provider:   result.provider,
        dev_override:        devOverrideApplied,
        simulated_target:    devOverrideApplied ? (input.executionTarget ?? resolvedTaskType) : undefined,
        ...(input.triggerV3Meta ?? {}),
      };

      return {
        ...result,
        metadata: { ...(result.metadata ?? {}), ...v3Meta },
        routing: { task_type: resolvedTaskType, mode, resolved_model: resolvedModel, provider: result.provider, was_overridden: false },
      };
    }

    // ── Production: 按路由表分发（v3: resolveProviderWithAuthority 接管权威路由）
    const { provider: targetProvider, strategy } = resolveProviderWithAuthority(
      resolvedTaskType,
      input.executionTarget,
      mode
    );
    const targetModel = PRODUCTION_MODEL_MAP[resolvedTaskType][targetProvider];

    let result: RouterResponse;
    if (targetProvider === "anthropic") {
      result = await _callAnthropic(targetModel, input, resolvedTaskType);
    } else {
      // OpenAI — 如未接入 key，降级到 stub
      const hasOpenAIKey = !!process.env.OPENAI_API_KEY || !!process.env.BUILT_IN_FORGE_API_KEY;
      if (!hasOpenAIKey) {
        console.warn(`[model_router] OpenAI key not set for task_type="${resolvedTaskType}". Falling back to GPT stub.`);
        result = _callGptStub(targetModel, input, resolvedTaskType);
      } else {
        result = await _callOpenAI(targetModel, input, resolvedTaskType);
      }
    }

    // ── Step 6: LOG
    const log = {
      original_task_type: taskType,
      normalized_task_type: resolvedTaskType,
      mode,
      provider: result.provider,
      model: targetModel,
      fallback_applied,
      fallback_reason,
      dev_override_applied: false,
      dev_override_reason: "",
      authority_strategy: strategy,
    };
    console.log("[model_router:route]", JSON.stringify(log));

    // v3: inject 8-field observability metadata + routing strategy (single source of truth)
    const routingMapProvider = PRODUCTION_ROUTING_MAP[resolvedTaskType] ?? "openai";
    const v3MetaProd = {
      execution_target:     input.executionTarget ?? "none",
      execution_mode:       input.executionMode   ?? "primary",
      selected_provider:    result.provider,
      dev_override:         false,
      simulated_target:     undefined,
      routing_strategy:     strategy,
      routing_map_provider: routingMapProvider,
      ...(input.triggerV3Meta ?? {}),
    };

    return {
      ...result,
      metadata: { ...(result.metadata ?? {}), ...v3MetaProd },
      routing: { task_type: resolvedTaskType, mode, resolved_model: targetModel, provider: result.provider, was_overridden: false },
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
