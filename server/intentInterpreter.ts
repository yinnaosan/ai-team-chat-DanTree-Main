/**
 * intentInterpreter.ts
 * LEVEL1A_PHASE_1 — Intent Interpreter
 *
 * OBJECTIVE: Parse raw task_parse output from Step1 into a normalized IntentContext
 * that downstream planner and agents can consume without re-parsing.
 *
 * DESIGN PRINCIPLE: Zero new LLM calls — extend Step1 output schema only.
 * All fields are derived from existing task_parse JSON or heuristic rules.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface IntentContext {
  /** Canonical task classification */
  task_type: "stock_analysis" | "macro_analysis" | "crypto_analysis" | "portfolio_review" | "event_driven" | "discussion" | "general";
  /** One-sentence user goal summary */
  user_goal: string;
  /**
   * Time data freshness requirement:
   * - latest_available: any recent data acceptable (default for "now/current")
   * - realtime: explicit live price required (only when user says "实时"/"live"/"right now")
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

// ── Normalization rules ───────────────────────────────────────────────────────

/**
 * Normalize time_mode:
 * - Explicit realtime wording only → "realtime"
 * - "now" / "current" / "latest" / "今" / "现在" → "latest_available"
 * - "recent" / "近期" / "近3个月" → "recent"
 * - "historical" / "历史" / "回测" / "长期" → "historical"
 */
function normalizeTimeMode(
  raw: string | undefined,
  taskDescription: string,
): IntentContext["time_mode"] {
  const explicit = (raw ?? "").toLowerCase();
  if (explicit === "realtime") return "realtime";
  if (explicit === "historical") return "historical";
  if (explicit === "recent") return "recent";
  // Heuristic on task description
  if (/实时|live price|right now|盘中|tick/i.test(taskDescription)) return "realtime";
  if (/历史|回测|长期|过去\d+年|backtest|long.?term/i.test(taskDescription)) return "historical";
  if (/近期|近\d+个月|最近\d+个月|recent trend/i.test(taskDescription)) return "recent";
  // Default: "now/current" → latest_available
  return "latest_available";
}

/**
 * Detect interaction_mode:
 * - "discussion" if task_type is discussion OR user uses open-ended phrasing
 * - "execution" otherwise
 */
function detectInteractionMode(
  rawMode: string | undefined,
  taskType: string,
  taskDescription: string,
): IntentContext["interaction_mode"] {
  if (rawMode === "discussion") return "discussion";
  if (taskType === "discussion") return "discussion";
  if (/你觉得|你认为|聊聊|探讨|看法|观点|what do you think|discuss|opinion/i.test(taskDescription)) return "discussion";
  return "execution";
}

/**
 * Detect growth_focus from task description (not in original Step1 schema).
 */
function detectGrowthFocus(taskDescription: string, userGoal: string): boolean {
  return /增速|成长|growth|扩张|高增长|EPS growth|revenue growth|未来\d+年|forward/i.test(
    taskDescription + " " + userGoal,
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * buildIntentContext
 *
 * Converts Step1 task_parse JSON + raw taskDescription into a normalized IntentContext.
 * Called immediately after Step1 output is parsed, before Research Planner.
 *
 * @param taskParse  The task_parse object from Step1 RESOURCE_SPEC JSON (may be null)
 * @param taskDescription  Raw user query string
 * @param symbols  Tickers extracted from Step1 (may be empty)
 */
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
): IntentContext {
  const rawTaskType = (taskParse?.task_type ?? "general") as IntentContext["task_type"];
  const userGoal = taskParse?.user_goal ?? taskDescription.slice(0, 120);

  const task_type: IntentContext["task_type"] = [
    "stock_analysis", "macro_analysis", "crypto_analysis",
    "portfolio_review", "event_driven", "discussion", "general",
  ].includes(rawTaskType) ? rawTaskType as IntentContext["task_type"] : "general";

  const time_mode = normalizeTimeMode(taskParse?.time_mode, taskDescription);
  const interaction_mode = detectInteractionMode(taskParse?.interaction_mode, task_type, taskDescription);

  // entity_scope: merge symbols from Step1 + markets
  const entity_scope = Array.from(new Set([
    ...(taskParse?.symbols ?? symbols),
    ...(taskParse?.markets ?? []),
  ])).filter(Boolean);

  const comparison_needed = taskParse?.comparison_needed === true
    || /对比|比较|vs|versus|peer|竞争对手|行业均值|benchmark/i.test(taskDescription);

  const risk_focus = taskParse?.risk_focus === true
    || /风险|下行|尾部风险|回撤|drawdown|tail risk|downside|安全边际/i.test(taskDescription);

  const growth_focus = detectGrowthFocus(taskDescription, userGoal);

  return {
    task_type,
    user_goal: userGoal,
    time_mode,
    interaction_mode,
    entity_scope,
    comparison_needed,
    risk_focus,
    growth_focus,
  };
}

/**
 * formatIntentContextForPrompt
 *
 * Serializes IntentContext into a compact prompt injection block.
 * Used in Step3 to give GPT explicit intent awareness.
 */
export function formatIntentContextForPrompt(ctx: IntentContext): string {
  return `[INTENT_CONTEXT | LEVEL1A]
TASK_TYPE: ${ctx.task_type}
USER_GOAL: ${ctx.user_goal}
TIME_MODE: ${ctx.time_mode}
INTERACTION_MODE: ${ctx.interaction_mode}
ENTITY_SCOPE: ${ctx.entity_scope.join(", ") || "none"}
COMPARISON_NEEDED: ${ctx.comparison_needed}
RISK_FOCUS: ${ctx.risk_focus}
GROWTH_FOCUS: ${ctx.growth_focus}
[/INTENT_CONTEXT]`;
}
