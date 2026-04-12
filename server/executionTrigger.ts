/**
 * executionTrigger.ts
 * Execution Trigger System v1 / v2
 *
 * 职责：
 *   - 定义 TriggerDecision schema
 *   - 实现轻量规则引擎 decideExecutionTrigger()
 *   - 提供可观测性输出 formatTriggerDecisionLog()
 *   - v2: resolveFinalTaskType() — 三条件替换规则，决定 finalTaskType
 *   - v2: ExecutionTriggerObservability 扩展（finalTaskType + trigger_applied_to_execution_path）
 *
 * 关键设计原则：
 *
 *   1. 触发决策 vs 路由决策分层
 *      TriggerDecision 是执行层语义判断，与 OI-001 路由表（PRODUCTION_ROUTING_MAP）独立。
 *      触发了 ≠ 路由改变。v1 阶段 TriggerDecision 主要服务于可观测性和未来生产态切换。
 *
 *   2. 研发态真实情况
 *      当前 Claude 是所有路径的实际执行主力（invokeLLM → Claude Sonnet 4.6）。
 *      execution_target = "anthropic" 表示"逻辑上应由 Claude 执行层处理"，
 *      与研发态现实（Claude 处理所有请求）暂时重合，但含义不同。
 *      execution_target = "none" 表示"逻辑上属于 GPT 主控层任务"，
 *      生产态下将路由到 GPT；研发态下仍走 Claude（因为没有 GPT key）。
 *
 *   3. 向后兼容
 *      无 triggerContext 时安全退化：should_trigger_execution = false。
 *
 * 不实现（deferred）：
 *   - shouldTriggerClaude 完整规则引擎
 *   - provider override engine
 *   - execution complexity scoring
 *   - 深层 orchestration 重构
 */

import type { TaskType, ExecutionTarget, ExecutionMode } from "./model_router";
import type { TriggerContext } from "./taskTypeBridge";

// ─────────────────────────────────────────────────────────────────────────────
// TriggerDecision — 触发决策结果
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TriggerDecision — Execution Trigger System v1 决策结构
 *
 * 注意：execution_target 是逻辑目标，不是当前研发态的实际执行路径。
 * 研发态下 Claude 处理所有请求，无论 execution_target 值是什么。
 */
export interface TriggerDecision {
  /** 是否判定为需要执行层处理的任务 */
  should_trigger_execution: boolean;

  /**
   * 触发原因列表（可观测性）
   * 未触发时包含说明原因；触发时包含命中规则的具体描述。
   */
  trigger_reasons: string[];

  /**
   * 命中的规则类别（Rule A / Rule B / Rule C / Rule D / Rule E）
   * 未触发时为空数组。Rule E 命中时填入 ["Rule E"]。
   */
  trigger_categories: string[];

  /**
   * 建议的 model_router TaskType
   * 通常与 bridge resolvedTaskType 一致；Rule C（repair）命中时可能建议 "structured_json"。
   */
  suggested_task_type: TaskType;

  /**
   * 执行优先级
   * Rule A / B / C → "high"；Rule D only → "medium"；不触发 → "low"
   */
  execution_priority: "low" | "medium" | "high";

  /**
   * 执行目标
   *
   * "anthropic" — 逻辑上判定为执行层任务，应由 Claude 处理
   *               研发态：与实际路径重合（Claude 处理所有请求）
   *               生产态：Claude Sonnet/Opus 执行层
   *
   * "none"      — 逻辑上判定为 GPT 主控层任务
   *               研发态：仍走 Claude（没有 GPT key，dev override）
   *               生产态：应走 GPT-5.4 主控层（per OI-001）
   */
  execution_target: "anthropic" | "none";
}

// ─────────────────────────────────────────────────────────────────────────────
// TriggerInput — 规则引擎输入
// ─────────────────────────────────────────────────────────────────────────────

export interface TriggerInput {
  /** 来自 TaskType Bridge 的业务上下文（可选，无时安全退化） */
  triggerContext?: TriggerContext;

  /** TaskType Bridge 映射后的 task_type */
  resolvedTaskType: TaskType;

  /**
   * 消息列表（可选，用于 Rule B 文档/文件内容检测）
   * 使用 unknown[] 避免与 _core/llm.ts 的循环依赖。
   * 运行时做 duck-typing 检查 FileContent 结构。
   */
  messages?: unknown[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 规则常量
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rule A: 明确属于执行层的 task_type
 * 这些 task_type 在 OI-001 中已路由到 Claude 执行层，trigger 无条件命中。
 */
const EXECUTION_TASK_TYPES = new Set<string>([
  "execution",
  "code_analysis",
  "agent_task",
]);

/**
 * Rule E: 明确不触发执行层的调用来源（轻量 narrative/summary 场景）
 * 这些场景即使 resolvedTaskType 是 research，也不需要执行层介入。
 */
const NON_EXECUTION_SOURCES = new Set<string>([
  "title_gen",       // 3-5字标题生成，轻量 narrative
  "memory_summary",  // 2-3句摘要，轻量 summarization
]);

/**
 * Rule C: 结构化/repair/JSON 修复语义调用来源 → 触发执行层
 * 这些场景需要精确 JSON schema 填充，属于执行层能力。
 */
const REPAIR_SOURCES = new Set<string>([
  "repair_pass",  // DELIVERABLE 块缺失时的 JSON 修复 pass
]);

/**
 * Rule D: 多步/pipeline 语义调用来源 → 触发执行层
 * 这些场景是长链任务的核心输出阶段，属于执行层处理范围。
 */
const PIPELINE_SOURCES = new Set<string>([
  "step3_main",  // Step3 核心分析输出（最终 JSON 渲染）
  "repair_pass", // repair 同时是 pipeline 语义（与 Rule C 重叠，分类不同）
]);

// ─────────────────────────────────────────────────────────────────────────────
// 规则实现（内部函数，返回 null 表示未命中）
// ─────────────────────────────────────────────────────────────────────────────

/** Rule A: 明确执行型 task_type → 触发 */
function ruleA_explicitExecutionTaskType(input: TriggerInput): string | null {
  if (EXECUTION_TASK_TYPES.has(input.resolvedTaskType)) {
    return `Rule A: resolvedTaskType="${input.resolvedTaskType}" is an explicit Claude execution layer task type`;
  }
  return null;
}

/**
 * Rule B: 消息包含文件/文档内容 → 触发
 * 检测 FileContent(type="file_url") 或 PDF mime_type。
 * duck-typing，避免 import Message type（循环依赖）。
 */
function ruleB_documentContent(input: TriggerInput): string | null {
  if (!input.messages || input.messages.length === 0) return null;

  for (const msg of input.messages) {
    if (!msg || typeof msg !== "object") continue;
    const content = (msg as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const b = block as Record<string, unknown>;

      // FileContent: { type: "file_url", file_url: { url, mime_type? } }
      if (b.type === "file_url") {
        return `Rule B: message contains file_url content (document/file detected)`;
      }
      // FileContent with explicit PDF mime_type
      if (b.file_url && typeof b.file_url === "object") {
        const fu = b.file_url as Record<string, unknown>;
        if (fu.mime_type === "application/pdf") {
          return `Rule B: message contains PDF document (mime_type=application/pdf)`;
        }
      }
    }
  }
  return null;
}

/** Rule C: 结构化/repair/JSON 修复语义 → 触发 */
function ruleC_structuredRepair(input: TriggerInput): string | null {
  const source = input.triggerContext?.source;
  if (source && REPAIR_SOURCES.has(source)) {
    return `Rule C: source="${source}" is a structured JSON repair execution path`;
  }
  return null;
}

/** Rule D: 多步/pipeline 语义 → 触发 */
function ruleD_multiStepPipeline(input: TriggerInput): string | null {
  const source = input.triggerContext?.source;
  if (source && PIPELINE_SOURCES.has(source)) {
    return `Rule D: source="${source}" is a multi-step pipeline execution path`;
  }
  return null;
}

/**
 * Rule E: 轻量 narrative/summary 场景 → 阻止触发（负规则）
 * 返回非 null 表示应该阻止触发，无论其他规则是否命中。
 */
function ruleE_lowComplexityBlock(input: TriggerInput): string | null {
  const source = input.triggerContext?.source;
  if (source && NON_EXECUTION_SOURCES.has(source)) {
    return `Rule E: source="${source}" is a low-complexity narrative/summary path — execution layer not needed`;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 规则引擎主函数
// ─────────────────────────────────────────────────────────────────────────────

/**
 * decideExecutionTrigger — Execution Trigger System v1 核心决策函数
 *
 * 规则执行顺序：
 *   1. Rule E（阻止规则）优先检查。命中则立即返回 should_trigger_execution=false。
 *   2. Rule A / B / C / D 按序检查，收集所有命中规则。
 *   3. 任意触发规则命中 → should_trigger_execution=true。
 *   4. 全部未命中 → should_trigger_execution=false（默认不触发）。
 *
 * 调用点预期行为：
 *   source="step3_main"    → Rule D 命中 → TRIGGER (medium)  → execution_target="anthropic"
 *   source="repair_pass"   → Rule C + D → TRIGGER (high)    → execution_target="anthropic"
 *   source="memory_summary"→ Rule E 命中→ NO TRIGGER        → execution_target="none"
 *   source="title_gen"     → Rule E 命中→ NO TRIGGER        → execution_target="none"
 *   resolvedTaskType="execution"|"code_analysis"|"agent_task" → Rule A → TRIGGER (high)
 */
export function decideExecutionTrigger(input: TriggerInput): TriggerDecision {
  // ── Rule E（阻止规则）先于所有触发规则 ────────────────────────────────────
  const blockReason = ruleE_lowComplexityBlock(input);
  if (blockReason) {
    return {
      should_trigger_execution: false,
      trigger_reasons: [blockReason],
      trigger_categories: ["Rule E"],
      suggested_task_type: input.resolvedTaskType,
      execution_priority: "low",
      execution_target: "none",
    };
  }

  // ── 触发规则 ──────────────────────────────────────────────────────────────
  const reasons: string[] = [];
  const categories: string[] = [];

  const ruleAResult = ruleA_explicitExecutionTaskType(input);
  const ruleBResult = ruleB_documentContent(input);
  const ruleCResult = ruleC_structuredRepair(input);
  const ruleDResult = ruleD_multiStepPipeline(input);

  if (ruleAResult) { reasons.push(ruleAResult); categories.push("Rule A"); }
  if (ruleBResult) { reasons.push(ruleBResult); categories.push("Rule B"); }
  if (ruleCResult) { reasons.push(ruleCResult); categories.push("Rule C"); }
  if (ruleDResult) { reasons.push(ruleDResult); categories.push("Rule D"); }

  const triggered = reasons.length > 0;

  if (!triggered) {
    return {
      should_trigger_execution: false,
      trigger_reasons: ["No trigger rules matched — treating as GPT master layer task"],
      trigger_categories: [],
      suggested_task_type: input.resolvedTaskType,
      execution_priority: "low",
      execution_target: "none",
    };
  }

  // ── 计算优先级 ────────────────────────────────────────────────────────────
  // Rule A (explicit execution type) or Rule B (document) or Rule C (repair) → high
  // Rule D only (pipeline) → medium
  let priority: "low" | "medium" | "high" = "medium";
  if (
    categories.includes("Rule A") ||
    categories.includes("Rule B") ||
    categories.includes("Rule C")
  ) {
    priority = "high";
  }

  // ── suggested_task_type ───────────────────────────────────────────────────
  // Rule C (repair) 但不是显式执行 task_type → 建议 structured_json
  // 其他情况保持 bridge 映射结果
  let suggested: TaskType = input.resolvedTaskType;
  if (categories.includes("Rule C") && !categories.includes("Rule A")) {
    suggested = "structured_json";
  }

  return {
    should_trigger_execution: true,
    trigger_reasons: reasons,
    trigger_categories: categories,
    suggested_task_type: suggested,
    execution_priority: priority,
    execution_target: "anthropic",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Final Task Type Apply Layer (v2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * FinalTaskTypeResult — resolveFinalTaskType() 的输出结构
 */
export interface FinalTaskTypeResult {
  /** 最终传入 modelRouter.generate() 的 task_type */
  finalTaskType: TaskType;
  /**
   * trigger 决策是否被应用到执行路径
   * true  = finalTaskType 被 suggested_task_type 替换
   * false = finalTaskType 保持 resolvedTaskType 不变
   */
  trigger_applied_to_execution_path: boolean;
}

/**
 * resolveFinalTaskType — Execution Trigger System v2 核心函数
 *
 * 决定最终传入 modelRouter.generate() 的 taskType。
 *
 * 设计原则：
 *   1. 默认：finalTaskType = resolvedTaskType
 *   2. 替换条件（同时满足三项）：
 *      a. should_trigger_execution = true（有触发决策）
 *      b. suggested_task_type !== resolvedTaskType（建议值与当前值不同）
 *      c. "更精确"定义：trigger_categories 包含 Rule C（repair 语义）
 *   3. 通过 PRODUCTION_ROUTING_MAP 驱动 routing，不直接操作 provider
 *
 * repair_pass 场景：resolvedTaskType=research → suggested=structured_json
 *   理由：DELIVERABLE 块 JSON 修复是严格 schema 执行任务，structured_json
 *   比 research 更精确描述该调用的执行性质，且在 OI-001 中路由到同一 provider（openai）。
 *
 * step3_main 场景：resolvedTaskType=research → suggested=research（相同）
 *   → 不替换（条件 b 不满足）
 *
 * NO_TRIGGER 场景（memory_summary / title_gen）：
 *   should_trigger_execution=false → 不替换（条件 a 不满足）
 */
export function resolveFinalTaskType(
  resolvedTaskType: TaskType,
  decision: TriggerDecision,
): FinalTaskTypeResult {
  // 条件 a: 必须触发
  if (!decision.should_trigger_execution) {
    return { finalTaskType: resolvedTaskType, trigger_applied_to_execution_path: false };
  }
  // 条件 b: suggested 与 resolved 必须不同
  if (decision.suggested_task_type === resolvedTaskType) {
    return { finalTaskType: resolvedTaskType, trigger_applied_to_execution_path: false };
  }
  // 条件 c: suggested 比 resolved 更精确（v2 最小集：Rule C 命中时替换）
  const isMorePrecise = decision.trigger_categories.includes("Rule C");
  if (!isMorePrecise) {
    return { finalTaskType: resolvedTaskType, trigger_applied_to_execution_path: false };
  }
  return {
    finalTaskType: decision.suggested_task_type,
    trigger_applied_to_execution_path: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Observability helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 格式化 TriggerDecision 为可观测日志行
 *
 * 日志级别（v2 修正）：
 *   TRIGGER     → console.info（保留，有价值的决策信号）
 *   NO_TRIGGER  → console.debug（生产态可关闭，减少 log 噪音）
 *
 * 注意：本函数只返回字符串，调用方决定用哪个 console 级别。
 */
export function formatTriggerDecisionLog(
  decision: TriggerDecision,
  source?: string,
): string {
  const prefix = `[ExecutionTrigger] ${source ?? "unknown"}`;
  if (!decision.should_trigger_execution) {
    return (
      `${prefix}: NO_TRIGGER | ` +
      `categories=[${decision.trigger_categories.join(",") || "none"}] | ` +
      `target=${decision.execution_target} | ` +
      `reason="${decision.trigger_reasons[0] ?? ""}"`
    );
  }
  return (
    `${prefix}: TRIGGER (${decision.execution_priority}) | ` +
    `categories=[${decision.trigger_categories.join(",")}] | ` +
    `suggested_type=${decision.suggested_task_type} | ` +
    `target=${decision.execution_target}`
  );
}

/**
 * 完整可观测性对象（v2 扩展）
 * 供 metadata 或 debug 对象使用
 */
export interface ExecutionTriggerObservability {
  /** Layer 1 bridge 输出 */
  bridged_task_type: TaskType;
  /** Layer 2 trigger 决策 */
  trigger_decision: TriggerDecision;
  /** Layer 3 最终传入 modelRouter.generate() 的 task_type（v2 新增）*/
  finalTaskType: TaskType;
  /** trigger 决策是否影响了执行路径（v2 新增）*/
  trigger_applied_to_execution_path: boolean;
  /** 调用来源 */
  source: string | null;
  /** 研发态实际执行路径（区别于 execution_target 的逻辑目标）*/
  dev_actual_executor: "claude-sonnet-4-6";
}

export function buildTriggerObservability(
  resolvedTaskType: TaskType,
  decision: TriggerDecision,
  finalTaskTypeResult: FinalTaskTypeResult,
  triggerContext?: TriggerContext,
): ExecutionTriggerObservability {
  return {
    bridged_task_type:                  resolvedTaskType,
    trigger_decision:                   decision,
    finalTaskType:                      finalTaskTypeResult.finalTaskType,
    trigger_applied_to_execution_path:  finalTaskTypeResult.trigger_applied_to_execution_path,
    source:                             triggerContext?.source ?? null,
    // 研发态：Claude Sonnet 4.6 始终是实际执行者
    dev_actual_executor: "claude-sonnet-4-6",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Execution Trigger System v3
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GPT_PIPELINE_SOURCES — Rule F: GPT 主控 pipeline 来源
 * 这些来源明确属于 GPT 主控层（research / narrative / reasoning），
 * 即使 resolvedTaskType 是 execution，也应路由到 GPT。
 */
export const GPT_PIPELINE_SOURCES = new Set<string>([
  "market_narrative",   // 市场叙事生成（GPT 主控）
  "thesis_generation",  // 投资论文生成（GPT 主控）
  "risk_assessment",    // 风险评估报告（GPT 主控）
  "portfolio_summary",  // 组合摘要（GPT 主控）
]);

/**
 * TriggerDecisionV3 — Execution Trigger System v3 决策结构
 *
 * v3 新增：
 *   - execution_target: ExecutionTarget（gpt | claude | hybrid）
 *   - execution_mode:   ExecutionMode（primary | fallback | repair）
 *   - rule:             命中的主规则标识（A/B/C/D/E/F/none）
 *   - finalTaskType:    v3 建议的最终 task_type
 */
export interface TriggerDecisionV3 {
  /** v3 执行权威目标（对应 RouterInput.executionTarget） */
  execution_target: ExecutionTarget;
  /** v3 执行模式（对应 RouterInput.executionMode） */
  execution_mode: ExecutionMode;
  /** 命中的主规则标识 */
  rule: "A" | "B" | "C" | "D" | "E" | "F" | "none";
  /** v3 建议的最终 task_type */
  finalTaskType: TaskType;
  /** 是否触发执行层 */
  should_trigger_execution: boolean;
}

/**
 * decideExecutionTriggerV3 — Execution Trigger System v3 核心决策函数
 *
 * 在 v2 规则基础上新增 Rule F（GPT pipeline 来源），
 * 并将决策结果映射为 ExecutionTarget / ExecutionMode 类型。
 *
 * 规则优先级（高→低）：
 *   Rule E（阻止）> Rule F（GPT 主控）> Rule A（执行型 task_type）>
 *   Rule C（repair）> Rule B（文档）> Rule D（pipeline）> none
 *
 * 决策映射：
 *   Rule E → execution_target="gpt",    execution_mode="primary",  rule="E"
 *   Rule F → execution_target="gpt",    execution_mode="primary",  rule="F"
 *   Rule A → execution_target="claude", execution_mode="primary",  rule="A"
 *   Rule C → execution_target="claude", execution_mode="repair",   rule="C"
 *   Rule B → execution_target="claude", execution_mode="primary",  rule="B"
 *   Rule D → execution_target="claude", execution_mode="primary",  rule="D"
 *   none   → execution_target="gpt",    execution_mode="primary",  rule="none"
 */
export function decideExecutionTriggerV3(input: TriggerInput): TriggerDecisionV3 {
  const source = input.triggerContext?.source;

  // ── Rule E（阻止规则）：轻量 narrative/summary → GPT 主控 ─────────────────
  if (source && NON_EXECUTION_SOURCES.has(source)) {
    return {
      execution_target: "gpt",
      execution_mode:   "primary",
      rule:             "E",
      finalTaskType:    input.resolvedTaskType,
      should_trigger_execution: false,
    };
  }

  // ── Rule F（GPT pipeline 来源）：明确属于 GPT 主控层 ──────────────────────
  if (source && GPT_PIPELINE_SOURCES.has(source)) {
    return {
      execution_target: "gpt",
      execution_mode:   "primary",
      rule:             "F",
      finalTaskType:    input.resolvedTaskType,
      should_trigger_execution: false,
    };
  }

  // ── Rule A：明确执行型 task_type → Claude 主控 ───────────────────────────
  if (EXECUTION_TASK_TYPES.has(input.resolvedTaskType)) {
    return {
      execution_target: "claude",
      execution_mode:   "primary",
      rule:             "A",
      finalTaskType:    input.resolvedTaskType,
      should_trigger_execution: true,
    };
  }

  // ── Rule C：repair/JSON 修复 → Claude repair 模式 ────────────────────────
  if (source && REPAIR_SOURCES.has(source)) {
    return {
      execution_target: "claude",
      execution_mode:   "repair",
      rule:             "C",
      finalTaskType:    "structured_json",
      should_trigger_execution: true,
    };
  }

  // ── Rule B：消息包含文件/文档 → Claude 主控 ──────────────────────────────
  if (input.messages && input.messages.length > 0) {
    for (const msg of input.messages) {
      if (!msg || typeof msg !== "object") continue;
      const content = (msg as Record<string, unknown>).content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (!block || typeof block !== "object") continue;
        const b = block as Record<string, unknown>;
        if (b.type === "file_url") {
          return {
            execution_target: "claude",
            execution_mode:   "primary",
            rule:             "B",
            finalTaskType:    input.resolvedTaskType,
            should_trigger_execution: true,
          };
        }
      }
    }
  }

  // ── Rule D：pipeline 语义 → Claude 主控 ──────────────────────────────────
  if (source && PIPELINE_SOURCES.has(source)) {
    return {
      execution_target: "claude",
      execution_mode:   "primary",
      rule:             "D",
      finalTaskType:    input.resolvedTaskType,
      should_trigger_execution: true,
    };
  }

  // ── 默认：GPT 主控层（研究 / 判断 / 叙事）────────────────────────────────
  return {
    execution_target: "gpt",
    execution_mode:   "primary",
    rule:             "none",
    finalTaskType:    input.resolvedTaskType,
    should_trigger_execution: false,
  };
}
