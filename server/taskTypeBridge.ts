/**
 * taskTypeBridge.ts
 * TaskType Bridge / Trigger Context Integration v1
 *
 * 职责：
 *   - 定义 TriggerContext schema（业务语义容器）
 *   - 提供 mapIntentToModelTaskType()（业务 task_type → model_router TaskType）
 *   - 为下一步 Execution Trigger System 预留稳定接点
 *
 * 本轮不实现：shouldTriggerClaude / execution override / provider override
 */

import type { TaskType } from "./model_router";

/**
 * TriggerContext — 业务调用点透传到路由层的上下文
 *
 * 字段来源：IntentContext (server/intentInterpreter.ts)
 * 不包含（快照确认不存在于 IntentContext）：
 *   step / wants_summary / wants_structured_json / ticker（单值）
 */
export interface TriggerContext {
  /** 来自 intentCtx.task_type */
  business_task_type?: string;
  /** 来自 intentCtx.interaction_mode: "execution" | "discussion" */
  interaction_mode?: string;
  /** 来自 intentCtx.entity_scope（tickers / 公司名 / 宏观序列） */
  entity_scope?: string[];
  /** 可选，标记调用来源（observability only，不参与路由决策） */
  source?: string;
}

/**
 * 将业务层 TriggerContext 映射为 model_router.TaskType
 *
 * 第一优先级 — interaction_mode:
 *   "discussion" → "narrative"
 *   理由：discussion 模式是探索性叙事，不是结构化分析执行。
 *   覆盖 business_task_type，因为用户明确想"聊"而不是"做分析"。
 *
 * 第二优先级 — business_task_type:
 *   "stock_analysis"   → "research"   (个股多源综合 = research)
 *   "macro_analysis"   → "research"   (宏观跨源综合 = research)
 *   "crypto_analysis"  → "research"   (同股票，数据综合型)
 *   "portfolio_review" → "research"   (多资产综合，非 step_analysis)
 *   "event_driven"     → "reasoning"  (因果链：事件→影响→决策 = reasoning)
 *   "discussion"       → "narrative"  (task_type 与 mode 语义一致)
 *   "general"          → "default"    (无特定意图，通用 fallback)
 *   unknown            → "default"    (安全 fallback)
 *
 * interaction_mode === "execution" 不额外映射：
 *   IntentContext 的 "execution" 含义是"用户想执行分析"（vs 讨论），
 *   与 model_router 的 TaskType "execution"（Claude 结构化执行层）语义不同。
 *   强行映射会违反 OI-001 GPT主控原则。保持 business_task_type 主映射。
 */
export function mapIntentToModelTaskType(ctx: TriggerContext): TaskType {
  const { business_task_type, interaction_mode } = ctx;

  // 第一优先级：discussion 模式 → narrative
  if (interaction_mode === "discussion") {
    return "narrative";
  }

  // 第二优先级：business_task_type
  switch (business_task_type) {
    case "stock_analysis":   return "research";
    case "macro_analysis":   return "research";
    case "crypto_analysis":  return "research";
    case "portfolio_review": return "research";
    case "event_driven":     return "reasoning";
    case "discussion":       return "narrative";
    case "general":          return "default";
    default:                 return "default";
  }
}

/** 若有 triggerContext 则 bridge；否则返回 "default"（向后兼容） */
export function resolveBridgedTaskType(triggerContext?: TriggerContext): TaskType {
  if (!triggerContext) return "default";
  return mapIntentToModelTaskType(triggerContext);
}

export interface BridgeMetadata {
  bridge_applied: boolean;
  resolved_task_type: TaskType;
  original_business_task_type: string | null;
  interaction_mode: string | null;
  source: string | null;
}

export function buildBridgeMetadata(
  triggerContext: TriggerContext | undefined,
  resolvedTaskType: TaskType,
): BridgeMetadata {
  return {
    bridge_applied:              !!triggerContext,
    resolved_task_type:          resolvedTaskType,
    original_business_task_type: triggerContext?.business_task_type ?? null,
    interaction_mode:            triggerContext?.interaction_mode ?? null,
    source:                      triggerContext?.source ?? null,
  };
}
