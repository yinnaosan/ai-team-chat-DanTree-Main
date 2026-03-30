/**
 * model_router.ts — DanTree Model Router
 *
 * 统一模型路由层（DanTree AI 协作协议 v1.0）。
 * 所有 LLM 调用必须通过此 router，不得直接调用 claude_provider 或 gpt_provider。
 *
 * 路由策略：
 *   开发阶段（DANTREE_MODE=development）：Claude-only，所有请求路由到 Claude
 *   生产阶段（DANTREE_MODE=production）：按 task_type 路由到 Claude 或 GPT
 *
 * Task Type → Model 映射（生产阶段）：
 *   deep_research      → claude-opus-4-6      (最强推理，深度分析)
 *   narrative          → claude-sonnet-4-6    (叙事生成，长文本)
 *   structured_json    → gpt-4o               (结构化输出，格式稳定)
 *   step_analysis      → gpt-4o               (Step1/2/3 协作流程)
 *   classification     → claude-haiku-4-5     (快速分类，成本最低)
 *   code_analysis      → claude-sonnet-4-6    (代码理解)
 *   default            → claude-sonnet-4-6    (通用回退)
 */

import { invokeClaude } from "./claude_provider";
import { invokeGPT } from "./gpt_provider";
import {
  MODELS,
  MODEL_METADATA,
  detectProvider,
  type LLMMessage,
  type LLMResponse,
  type ModelProvider,
} from "./llmProviders";

// ─────────────────────────────────────────────────────────────────────────────
// Task Type Definitions
// ─────────────────────────────────────────────────────────────────────────────

export type DanTreeTaskType =
  | "deep_research"       // runDeepResearch() — 深度研究叙事
  | "narrative"           // composeResearchNarrative() — 叙事生成
  | "structured_json"     // 结构化 JSON 输出（Step1/2/3）
  | "step_analysis"       // DanTree Step 分析流程
  | "classification"      // 快速分类/格式化
  | "code_analysis"       // 代码理解/分析
  | "agent_task"          // Agent 规划任务
  | "default";            // 通用回退

// ─────────────────────────────────────────────────────────────────────────────
// Router Configuration
// ─────────────────────────────────────────────────────────────────────────────

/** 当前运行模式：development = Claude-only，production = 按 task_type 路由 */
export type DanTreeMode = "development" | "production";

function getCurrentMode(): DanTreeMode {
  const mode = process.env.DANTREE_MODE;
  if (mode === "production") return "production";
  return "development"; // 默认开发模式（Claude-only）
}

/** 生产阶段 task_type → model 映射表 */
const PRODUCTION_ROUTING: Record<DanTreeTaskType, string> = {
  deep_research:    MODELS.ANTHROPIC.OPUS_4_6,      // Claude Opus 4.6：最强推理
  narrative:        MODELS.ANTHROPIC.SONNET_4_6,    // Claude Sonnet 4.6：叙事生成
  structured_json:  MODELS.OPENAI.GPT_4O,           // GPT-4o：结构化输出稳定
  step_analysis:    MODELS.OPENAI.GPT_4O,           // GPT-4o：Step 分析
  classification:   MODELS.ANTHROPIC.HAIKU_4_5,     // Claude Haiku 4.5：最快最便宜
  code_analysis:    MODELS.ANTHROPIC.SONNET_4_6,    // Claude Sonnet 4.6：代码理解
  agent_task:       MODELS.ANTHROPIC.OPUS_4_6,      // Claude Opus 4.6：Agent 规划
  default:          MODELS.ANTHROPIC.SONNET_4_6,    // Claude Sonnet 4.6：通用回退
};

/** 开发阶段 Claude-only 映射表（所有 task_type 都路由到 Claude） */
const DEVELOPMENT_ROUTING: Record<DanTreeTaskType, string> = {
  deep_research:    MODELS.ANTHROPIC.OPUS_4_6,
  narrative:        MODELS.ANTHROPIC.SONNET_4_6,
  structured_json:  MODELS.ANTHROPIC.SONNET_4_6,   // 开发阶段用 Claude 替代 GPT
  step_analysis:    MODELS.ANTHROPIC.SONNET_4_6,   // 开发阶段用 Claude 替代 GPT
  classification:   MODELS.ANTHROPIC.HAIKU_4_5,
  code_analysis:    MODELS.ANTHROPIC.SONNET_4_6,
  agent_task:       MODELS.ANTHROPIC.OPUS_4_6,
  default:          MODELS.ANTHROPIC.SONNET_4_6,
};

// ─────────────────────────────────────────────────────────────────────────────
// Router Options
// ─────────────────────────────────────────────────────────────────────────────

export interface RouterOptions {
  /** 任务类型，决定路由到哪个模型 */
  task_type: DanTreeTaskType;
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
  /** 强制指定模型（覆盖路由策略，谨慎使用） */
  override_model?: string;
  /** 仅 Claude：启用 extended thinking */
  extendedThinking?: boolean;
  /** 仅 GPT：结构化输出 JSON schema */
  responseFormat?: { type: "json_object" } | { type: "json_schema"; json_schema: object };
}

export interface RouterResponse extends LLMResponse {
  /** 路由决策信息（调试用） */
  routing: {
    task_type: DanTreeTaskType;
    mode: DanTreeMode;
    resolved_model: string;
    provider: ModelProvider;
    was_overridden: boolean;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Router Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * routeToModel — DanTree 统一模型路由入口
 *
 * 根据 task_type 和当前运行模式，自动路由到最合适的模型。
 * 开发阶段全部路由到 Claude，生产阶段按 task_type 分配 Claude/GPT。
 *
 * @example
 *   // 深度研究 → Claude Opus 4.6
 *   const res = await routeToModel({
 *     task_type: "deep_research",
 *     messages: [{ role: "user", content: "Analyze AAPL..." }],
 *   });
 *
 *   // 结构化 JSON（生产阶段 → GPT-4o，开发阶段 → Claude Sonnet）
 *   const res = await routeToModel({
 *     task_type: "structured_json",
 *     messages: [...],
 *     responseFormat: { type: "json_object" },
 *   });
 */
export async function routeToModel(opts: RouterOptions): Promise<RouterResponse> {
  const mode = getCurrentMode();
  const routingTable = mode === "production" ? PRODUCTION_ROUTING : DEVELOPMENT_ROUTING;

  // 解析目标模型（override 优先）
  const resolvedModel = opts.override_model ?? routingTable[opts.task_type];
  const provider = detectProvider(resolvedModel);
  const meta = MODEL_METADATA[resolvedModel];

  let result: LLMResponse;

  if (provider === "anthropic") {
    result = await invokeClaude({
      model: resolvedModel,
      messages: opts.messages,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
      extendedThinking: opts.extendedThinking,
      meta,
    });
  } else if (provider === "openai") {
    result = await invokeGPT({
      model: resolvedModel,
      messages: opts.messages,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
      responseFormat: opts.responseFormat,
      meta,
    });
  } else {
    throw new Error(
      `[model_router] Cannot route to unknown provider for model "${resolvedModel}". ` +
      `Use MODELS.ANTHROPIC.* or MODELS.OPENAI.* constants.`
    );
  }

  return {
    ...result,
    routing: {
      task_type: opts.task_type,
      mode,
      resolved_model: resolvedModel,
      provider,
      was_overridden: !!opts.override_model,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience Shortcuts — 按 task_type 的快捷调用函数
// ─────────────────────────────────────────────────────────────────────────────

/** 深度研究叙事（→ Claude Opus 4.6） */
export async function routeDeepResearch(
  messages: LLMMessage[],
  opts?: Partial<RouterOptions>
): Promise<RouterResponse> {
  return routeToModel({ ...opts, task_type: "deep_research", messages });
}

/** 叙事生成（→ Claude Sonnet 4.6） */
export async function routeNarrative(
  messages: LLMMessage[],
  opts?: Partial<RouterOptions>
): Promise<RouterResponse> {
  return routeToModel({ ...opts, task_type: "narrative", messages });
}

/** 结构化 JSON（生产 → GPT-4o，开发 → Claude Sonnet） */
export async function routeStructuredJSON(
  messages: LLMMessage[],
  responseFormat?: RouterOptions["responseFormat"],
  opts?: Partial<RouterOptions>
): Promise<RouterResponse> {
  return routeToModel({
    ...opts,
    task_type: "structured_json",
    messages,
    responseFormat,
  });
}

/** Step 分析（生产 → GPT-4o，开发 → Claude Sonnet） */
export async function routeStepAnalysis(
  messages: LLMMessage[],
  opts?: Partial<RouterOptions>
): Promise<RouterResponse> {
  return routeToModel({ ...opts, task_type: "step_analysis", messages });
}

/** 快速分类（→ Claude Haiku 4.5） */
export async function routeClassification(
  messages: LLMMessage[],
  opts?: Partial<RouterOptions>
): Promise<RouterResponse> {
  return routeToModel({ ...opts, task_type: "classification", messages });
}

// ─────────────────────────────────────────────────────────────────────────────
// Router Health Check
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
