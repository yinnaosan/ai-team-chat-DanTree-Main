/**
 * DANTREE LEVEL7.1B — Portfolio Guard Orchestrator (Precision Patch)
 * ─────────────────────────────────────────────────────────────────────
 * Upgrades from LEVEL7.1:
 *   1. Danger Guard as first-class control (danger_score >= 0.75 CRITICAL, >= 0.55 HIGH)
 *   2. Corrected guard precedence: CONFLICT > DANGER > CONCENTRATION > CHURN > SAMPLE > OVERFIT
 *   3. Sample Guard soft degradation (no longer hard suppression for low sample alone)
 *   4. Guard-aware sizing decay table (per-guard multipliers, not blind 0.6^n)
 *
 * advisory_only: ALWAYS true.  auto_trade_allowed: ALWAYS false.
 */
import type { FusionDecision, DecisionBias } from "./portfolioState";
import type { SizingResult, SizingBucket, RiskBudgetReport } from "./positionSizingEngine";
import type { RankedDecision } from "./portfolioDecisionRanker";
import {
  applyChurnGuard,
  detectOverfitFlags,
  detectDecisionConflicts,
  applySampleEnforcement,
  type RecentAction,
  type SignalHistoryEntry,
  type OverfitFlag,
  type ConflictFlag,
  DEFAULT_CHURN_GUARD_CONFIG,
  DEFAULT_OVERFIT_GUARD_CONFIG,
  DEFAULT_SAMPLE_ENFORCEMENT_CONFIG,
} from "./portfolioSafetyGuard";

// ─── Guard Precedence (highest → lowest, LEVEL7.1B corrected order) ──────────
export type GuardPrecedenceLevel =
  | "CONTRADICTION"          // 1 — opposing directional decisions
  | "CRITICAL_DANGER"        // 2 — danger_score >= 0.75
  | "HIGH_DANGER"            // 2b — danger_score >= 0.55
  | "CONCENTRATION_CRITICAL" // 3 — risk budget breached
  | "CHURN_COOLDOWN"         // 4 — recent action within cooldown
  | "SAMPLE_SOFT"            // 5 — low sample (soft degradation only)
  | "OVERFIT_WARNING"        // 6 — repeated high-score pattern
  | "NONE";

// ─── Per-ticker guard annotation ─────────────────────────────────────────────
export interface TickerGuardAnnotation {
  ticker: string;
  churn_guard_applied: boolean;
  conflict_guard_applied: boolean;
  overfit_guard_applied: boolean;
  sample_guard_applied: boolean;
  danger_guard_applied: boolean;
  danger_guard_level: "critical" | "high" | "none";
  guard_notes: string[];
  dominant_guard: GuardPrecedenceLevel;
  suppressed: boolean;
}

// ─── Sizing Decay Trace (LEVEL7.1B) ──────────────────────────────────────────
export interface SizingDecayTrace {
  original_allocation_pct: number;
  guarded_allocation_pct: number;
  dominant_guard: GuardPrecedenceLevel;
  secondary_guards: GuardPrecedenceLevel[];
  decay_multiplier: number;
  allocation_decay_trace: string[];
}

// ─── Guarded Decision ─────────────────────────────────────────────────────────
export interface GuardedDecision {
  ticker: string;
  original_decision_bias: DecisionBias;
  guarded_decision_bias: DecisionBias;
  original_sizing_bucket: SizingBucket;
  guarded_sizing_bucket: SizingBucket;
  guard_reason_codes: string[];
  suppressed: boolean;
  annotation: TickerGuardAnnotation;
  sizing_decay_trace: SizingDecayTrace;
}

// ─── Level7.1B SafetyReport ───────────────────────────────────────────────────
export interface Level71SafetyReport {
  portfolio_guard_status: "healthy" | "guarded" | "suppressed" | "critical";
  active_guard_count: number;
  top_guard_reasons: string[];
  suppressed_tickers: string[];
  downgraded_tickers: string[];
  concentration_guard_active: boolean;
  sample_guard_active: boolean;
  overfit_guard_active: boolean;
  churn_guard_active: boolean;
  conflict_guard_active: boolean;
  danger_guard_active: boolean;
  danger_critical_tickers: string[];
  danger_high_tickers: string[];
  churn_suppressed_count: number;
  overfit_flags: OverfitFlag[];
  conflict_flags: ConflictFlag[];
  sample_enforcement_count: number;
  overall_safety_status: "clean" | "flagged" | "critical";
  advisory_only: true;
}

// ─── Guarded Advisory Entry ───────────────────────────────────────────────────
export interface GuardedAdvisoryEntry {
  ticker: string;
  original_decision_bias: DecisionBias;
  guarded_decision_bias: DecisionBias;
  original_allocation_pct: number;
  guarded_allocation_pct: number;
  guard_dominant_reason: string;
  attention_reason: string;
  advisory_only: true;
}

// ─── Orchestrator Input ───────────────────────────────────────────────────────
export interface GuardOrchestratorInput {
  ranked_decisions: RankedDecision[];
  decisions: FusionDecision[];
  sizings: SizingResult[];
  risk_budget: RiskBudgetReport;
  sample_counts?: Map<string, number>;
  recent_actions?: RecentAction[];
  signal_history?: SignalHistoryEntry[];
  churn_config?: typeof DEFAULT_CHURN_GUARD_CONFIG;
  overfit_config?: typeof DEFAULT_OVERFIT_GUARD_CONFIG;
  sample_config?: typeof DEFAULT_SAMPLE_ENFORCEMENT_CONFIG;
}

// ─── Orchestrator Output ──────────────────────────────────────────────────────
export interface GuardOrchestratorOutput {
  guarded_decisions: GuardedDecision[];
  guarded_ranked: RankedDecision[];
  guarded_sizings: SizingResult[];
  safety_report: Level71SafetyReport;
  ticker_annotations: TickerGuardAnnotation[];
  advisory_only: true;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────
const BUCKET_ORDER: SizingBucket[] = ["large", "medium", "small", "minimal", "none"];

function downgradeBucket(bucket: SizingBucket, steps: number): SizingBucket {
  const idx = BUCKET_ORDER.indexOf(bucket);
  return BUCKET_ORDER[Math.min(idx + steps, BUCKET_ORDER.length - 1)];
}

const BIAS_DOWNGRADE: Record<DecisionBias, DecisionBias> = {
  strong_buy: "buy",
  buy: "hold",
  hold: "hold",
  reduce: "reduce",
  avoid: "avoid",
  recheck: "recheck",
  monitor: "monitor",
};

function downgradeBias(bias: DecisionBias, steps: number): DecisionBias {
  let result = bias;
  for (let i = 0; i < steps; i++) result = BIAS_DOWNGRADE[result] ?? result;
  return result;
}

// ─── LEVEL7.1B: Guard-Aware Sizing Decay Table ───────────────────────────────
const GUARD_DECAY_MULTIPLIER: Record<GuardPrecedenceLevel, number> = {
  CONTRADICTION:          0.2,
  CRITICAL_DANGER:        0.3,
  HIGH_DANGER:            0.5,
  CONCENTRATION_CRITICAL: 0.5,
  CHURN_COOLDOWN:         0.6,
  SAMPLE_SOFT:            0.7,
  OVERFIT_WARNING:        0.8,
  NONE:                   1.0,
};

function computeSizingDecay(
  original_pct: number,
  dominant: GuardPrecedenceLevel,
  secondary: GuardPrecedenceLevel[],
): SizingDecayTrace {
  const trace: string[] = [];
  const dominant_mult = GUARD_DECAY_MULTIPLIER[dominant];
  trace.push(`${dominant}: ×${dominant_mult}`);

  let combined = dominant_mult;
  for (const sec of secondary) {
    if (sec === "NONE" || sec === dominant) continue;
    const sec_mult = Math.sqrt(GUARD_DECAY_MULTIPLIER[sec]);
    combined = parseFloat((combined * sec_mult).toFixed(4));
    trace.push(`+${sec}: ×${sec_mult.toFixed(3)} → combined ${combined}`);
  }
  combined = Math.max(combined, 0.1);
  const guarded_pct = parseFloat((original_pct * combined).toFixed(2));

  return {
    original_allocation_pct: original_pct,
    guarded_allocation_pct: guarded_pct,
    dominant_guard: dominant,
    secondary_guards: secondary.filter(s => s !== "NONE"),
    decay_multiplier: combined,
    allocation_decay_trace: trace,
  };
}

// ─── LEVEL7.1B: Resolve dominant guard (risk-first order) ────────────────────
function resolveDominantGuard(a: TickerGuardAnnotation): GuardPrecedenceLevel {
  if (a.conflict_guard_applied) return "CONTRADICTION";
  if (a.danger_guard_level === "critical") return "CRITICAL_DANGER";
  if (a.danger_guard_level === "high") return "HIGH_DANGER";
  if (a.churn_guard_applied) return "CHURN_COOLDOWN";
  if (a.sample_guard_applied) return "SAMPLE_SOFT";
  if (a.overfit_guard_applied) return "OVERFIT_WARNING";
  return "NONE";
}

function resolveSecondaryGuards(
  a: TickerGuardAnnotation,
  dominant: GuardPrecedenceLevel,
  concentration_active: boolean,
): GuardPrecedenceLevel[] {
  const all: GuardPrecedenceLevel[] = [];
  if (dominant !== "CONTRADICTION" && a.conflict_guard_applied) all.push("CONTRADICTION");
  if (dominant !== "CRITICAL_DANGER" && a.danger_guard_level === "critical") all.push("CRITICAL_DANGER");
  if (dominant !== "HIGH_DANGER" && a.danger_guard_level === "high") all.push("HIGH_DANGER");
  if (dominant !== "CONCENTRATION_CRITICAL" && concentration_active) all.push("CONCENTRATION_CRITICAL");
  if (dominant !== "CHURN_COOLDOWN" && a.churn_guard_applied) all.push("CHURN_COOLDOWN");
  if (dominant !== "SAMPLE_SOFT" && a.sample_guard_applied) all.push("SAMPLE_SOFT");
  if (dominant !== "OVERFIT_WARNING" && a.overfit_guard_applied) all.push("OVERFIT_WARNING");
  return all;
}

// ─── Per-ticker suppression (LEVEL7.1B) ──────────────────────────────────────
function applyGuardSuppression(
  decision: FusionDecision,
  sizing: SizingResult,
  annotation: TickerGuardAnnotation,
  risk_budget: RiskBudgetReport,
): GuardedDecision {
  let guarded_bias = decision.decision_bias;
  let guarded_bucket = sizing.sizing_bucket;
  const reason_codes: string[] = [...annotation.guard_notes];
  let suppressed = false;

  const concentration_active = risk_budget.risk_budget_status === "critical";
  const dominant = resolveDominantGuard(annotation);
  annotation.dominant_guard = dominant;
  const secondary = resolveSecondaryGuards(annotation, dominant, concentration_active);

  // ── Precedence 1: CONTRADICTION ──────────────────────────────────────────
  if (dominant === "CONTRADICTION") {
    guarded_bias = "recheck";
    guarded_bucket = downgradeBucket(sizing.sizing_bucket, 3);
    reason_codes.push("CONTRADICTION_DOMINATES: forced neutral + size capped to minimal");
    suppressed = true;
  }
  // ── Precedence 2: CRITICAL_DANGER ────────────────────────────────────────
  else if (dominant === "CRITICAL_DANGER") {
    guarded_bias = "avoid";
    guarded_bucket = "minimal";
    reason_codes.push(`CRITICAL_DANGER: danger_score=${decision.danger_score.toFixed(2)} ≥ 0.75 → forced avoid`);
    suppressed = true;
  }
  // ── Precedence 2b: HIGH_DANGER ───────────────────────────────────────────
  else if (dominant === "HIGH_DANGER") {
    guarded_bias = downgradeBias(decision.decision_bias, 2);
    guarded_bucket = downgradeBucket(sizing.sizing_bucket, 2);
    if (guarded_bucket === "large" || guarded_bucket === "medium") guarded_bucket = "small";
    reason_codes.push(`HIGH_DANGER: danger_score=${decision.danger_score.toFixed(2)} ≥ 0.55 → bias -2 steps, size capped to small`);
    suppressed = true;
  }
  // ── Precedence 4: CHURN_COOLDOWN ─────────────────────────────────────────
  else if (dominant === "CHURN_COOLDOWN") {
    if (guarded_bias === "strong_buy" || guarded_bias === "buy" || guarded_bias === "hold") {
      guarded_bias = downgradeBias(guarded_bias, 1);
      guarded_bucket = downgradeBucket(sizing.sizing_bucket, 1);
      reason_codes.push("CHURN_COOLDOWN: bias and size downgraded 1 step");
      suppressed = true;
    }
  }
  // ── Precedence 5: SAMPLE_SOFT (soft degradation, NOT hard suppression) ───
  else if (dominant === "SAMPLE_SOFT") {
    if (guarded_bias === "strong_buy") {
      guarded_bias = "buy";
      guarded_bucket = downgradeBucket(sizing.sizing_bucket, 1);
      reason_codes.push("SAMPLE_SOFT: strong_buy → buy (soft degradation, low sample count)");
      suppressed = true;
    } else if (guarded_bias === "buy") {
      guarded_bias = "hold";
      guarded_bucket = downgradeBucket(sizing.sizing_bucket, 1);
      reason_codes.push("SAMPLE_SOFT: buy → hold (soft degradation, low sample count)");
      suppressed = true;
    }
    // hold/reduce/avoid: no change under sample-only guard
  }
  // ── Precedence 6: OVERFIT_WARNING ────────────────────────────────────────
  else if (dominant === "OVERFIT_WARNING") {
    if (guarded_bias === "strong_buy") {
      guarded_bias = "buy";
      guarded_bucket = downgradeBucket(sizing.sizing_bucket, 1);
      reason_codes.push("OVERFIT_WARNING: strong_buy → buy, stale alpha suspected");
      suppressed = true;
    } else if (guarded_bias === "buy") {
      guarded_bias = "recheck";
      reason_codes.push("OVERFIT_WARNING: buy → recheck, stale alpha suspected");
      suppressed = true;
    }
  }

  // ── Precedence 3: CONCENTRATION_CRITICAL (additive on top of dominant) ───
  if (concentration_active && dominant !== "CONTRADICTION" && dominant !== "CRITICAL_DANGER") {
    guarded_bucket = downgradeBucket(guarded_bucket, 2);
    reason_codes.push("CONCENTRATION_CRITICAL: size capped by risk budget");
    suppressed = true;
  }

  annotation.suppressed = suppressed;

  // ── Guard-aware sizing decay trace ────────────────────────────────────────
  const effective_dominant = concentration_active && dominant === "NONE"
    ? "CONCENTRATION_CRITICAL"
    : dominant;
  const effective_secondary = concentration_active && dominant !== "NONE"
    ? [...secondary, "CONCENTRATION_CRITICAL" as GuardPrecedenceLevel]
    : secondary;

  const sizing_decay_trace = computeSizingDecay(
    sizing.suggested_allocation_pct,
    effective_dominant,
    effective_secondary,
  );

  return {
    ticker: decision.ticker,
    original_decision_bias: decision.decision_bias,
    guarded_decision_bias: guarded_bias,
    original_sizing_bucket: sizing.sizing_bucket,
    guarded_sizing_bucket: guarded_bucket,
    guard_reason_codes: reason_codes,
    suppressed,
    annotation,
    sizing_decay_trace,
  };
}

// ─── Build Level71SafetyReport ────────────────────────────────────────────────
function buildLevel71SafetyReport(
  guarded_decisions: GuardedDecision[],
  overfit_flags: OverfitFlag[],
  conflict_flags: ConflictFlag[],
  risk_budget: RiskBudgetReport,
): Level71SafetyReport {
  const suppressed_tickers = guarded_decisions.filter(d => d.suppressed).map(d => d.ticker);
  const downgraded_tickers = guarded_decisions.filter(d =>
    d.original_decision_bias !== d.guarded_decision_bias && !d.suppressed
  ).map(d => d.ticker);

  const churn_guard_active = guarded_decisions.some(d => d.annotation.churn_guard_applied);
  const conflict_guard_active = guarded_decisions.some(d => d.annotation.conflict_guard_applied);
  const overfit_guard_active = guarded_decisions.some(d => d.annotation.overfit_guard_applied);
  const sample_guard_active = guarded_decisions.some(d => d.annotation.sample_guard_applied);
  const concentration_guard_active = risk_budget.risk_budget_status === "critical";
  const danger_guard_active = guarded_decisions.some(d => d.annotation.danger_guard_applied);

  const danger_critical_tickers = guarded_decisions
    .filter(d => d.annotation.danger_guard_level === "critical").map(d => d.ticker);
  const danger_high_tickers = guarded_decisions
    .filter(d => d.annotation.danger_guard_level === "high").map(d => d.ticker);

  const active_guard_count = [
    churn_guard_active, conflict_guard_active, overfit_guard_active,
    sample_guard_active, concentration_guard_active, danger_guard_active,
  ].filter(Boolean).length;

  const top_guard_reasons: string[] = [];
  if (conflict_guard_active) top_guard_reasons.push("CONTRADICTION detected in decisions");
  if (danger_critical_tickers.length > 0) top_guard_reasons.push(`CRITICAL_DANGER: ${danger_critical_tickers.join(", ")}`);
  if (danger_high_tickers.length > 0) top_guard_reasons.push(`HIGH_DANGER: ${danger_high_tickers.join(", ")}`);
  if (concentration_guard_active) top_guard_reasons.push("CONCENTRATION_CRITICAL: risk budget exceeded");
  if (churn_guard_active) top_guard_reasons.push("CHURN_COOLDOWN: recent action within window");
  if (sample_guard_active) top_guard_reasons.push("SAMPLE_SOFT: low sample count (soft degradation)");
  if (overfit_guard_active) top_guard_reasons.push("OVERFIT_WARNING: stale repeated pattern");

  const portfolio_guard_status: Level71SafetyReport["portfolio_guard_status"] =
    suppressed_tickers.length >= 3 || conflict_flags.length >= 2 || danger_critical_tickers.length >= 2 ? "critical" :
    suppressed_tickers.length >= 1 || active_guard_count >= 2 ? "suppressed" :
    active_guard_count >= 1 ? "guarded" :
    "healthy";

  const churn_suppressed_count = guarded_decisions.filter(d => d.annotation.churn_guard_applied && d.suppressed).length;
  const sample_enforcement_count = guarded_decisions.filter(d => d.annotation.sample_guard_applied && d.suppressed).length;

  const overall_safety_status: "clean" | "flagged" | "critical" =
    conflict_flags.length >= 2 || overfit_flags.length >= 3 || danger_critical_tickers.length >= 1 ? "critical" :
    conflict_flags.length >= 1 || overfit_flags.length >= 1 || churn_suppressed_count >= 1 || danger_high_tickers.length >= 1 ? "flagged" :
    "clean";

  return {
    portfolio_guard_status,
    active_guard_count,
    top_guard_reasons,
    suppressed_tickers,
    downgraded_tickers,
    concentration_guard_active,
    sample_guard_active,
    overfit_guard_active,
    churn_guard_active,
    conflict_guard_active,
    danger_guard_active,
    danger_critical_tickers,
    danger_high_tickers,
    churn_suppressed_count,
    overfit_flags,
    conflict_flags,
    sample_enforcement_count,
    overall_safety_status,
    advisory_only: true,
  };
}

// ─── Guarded Advisory Entries ─────────────────────────────────────────────────
export function buildGuardedAdvisoryEntries(
  guarded_decisions: GuardedDecision[],
  orig_sizings: SizingResult[],
  guarded_sizings: SizingResult[],
): GuardedAdvisoryEntry[] {
  return guarded_decisions.map((gd, i) => {
    const orig = orig_sizings[i];
    const guarded = guarded_sizings[i];
    const dominant = gd.annotation.dominant_guard;
    const guard_dominant_reason =
      dominant === "NONE" ? "No guard applied" :
      gd.guard_reason_codes[0] ?? dominant;
    const attention_reason = gd.suppressed
      ? `Original bias '${gd.original_decision_bias}' suppressed to '${gd.guarded_decision_bias}' by ${dominant}`
      : "No suppression applied";
    return {
      ticker: gd.ticker,
      original_decision_bias: gd.original_decision_bias,
      guarded_decision_bias: gd.guarded_decision_bias,
      original_allocation_pct: orig?.suggested_allocation_pct ?? 0,
      guarded_allocation_pct: guarded?.suggested_allocation_pct ?? 0,
      guard_dominant_reason,
      attention_reason,
      advisory_only: true,
    };
  });
}

// ─── Apply guards to RankedDecisions ─────────────────────────────────────────
export function applyGuardsToRankedDecisions(
  ranked: RankedDecision[],
  guarded_decisions: GuardedDecision[],
): RankedDecision[] {
  const guard_map = new Map(guarded_decisions.map(gd => [gd.ticker, gd]));
  return ranked.map(r => {
    const gd = guard_map.get(r.ticker);
    if (!gd || !gd.suppressed) return r;
    const guarded_action: RankedDecision["action_label"] =
      gd.annotation.conflict_guard_applied ? "MONITOR" :
      gd.annotation.danger_guard_level === "critical" ? "AVOID" :
      gd.guarded_decision_bias === "avoid" ? "AVOID" :
      gd.guarded_decision_bias === "monitor" ? "MONITOR" :
      gd.guarded_decision_bias === "recheck" ? "MONITOR" :
      gd.guarded_decision_bias === "reduce" ? "TRIM" :
      r.action_label;
    const decay = gd.sizing_decay_trace.decay_multiplier;
    return {
      ...r,
      action_label: guarded_action,
      decision_bias: gd.guarded_decision_bias,
      sizing_bucket: gd.guarded_sizing_bucket,
      final_score: parseFloat((r.final_score * decay).toFixed(4)),
    };
  });
}

// ─── Main Orchestrator Entry Point ────────────────────────────────────────────
export function runPortfolioSafetyGuards(
  input: GuardOrchestratorInput,
): GuardOrchestratorOutput {
  const {
    ranked_decisions,
    decisions,
    sizings,
    risk_budget,
    sample_counts = new Map(),
    recent_actions = [],
    signal_history = [],
    churn_config = DEFAULT_CHURN_GUARD_CONFIG,
    overfit_config = DEFAULT_OVERFIT_GUARD_CONFIG,
    sample_config = DEFAULT_SAMPLE_ENFORCEMENT_CONFIG,
  } = input;

  // ── Step 1: Run all guard families ───────────────────────────────────────
  const churn_ranked = applyChurnGuard(ranked_decisions, recent_actions, churn_config);
  const overfit_flags = detectOverfitFlags(ranked_decisions as unknown as FusionDecision[], signal_history, overfit_config);
  const conflict_flags = detectDecisionConflicts(ranked_decisions);
  const sample_ranked = applySampleEnforcement(ranked_decisions, sample_counts, sample_config);

  // ── Step 2: Build per-ticker annotations (including Danger Guard) ─────────
  const ticker_annotations: TickerGuardAnnotation[] = decisions.map(d => {
    const orig_ranked = ranked_decisions.find(r => r.ticker === d.ticker);
    const churn_r = churn_ranked.find(r => r.ticker === d.ticker);
    const sample_r = sample_ranked.find(r => r.ticker === d.ticker);

    const churn_applied = !!(orig_ranked && churn_r &&
      orig_ranked.action_label !== churn_r.action_label);
    const conflict_applied = conflict_flags.some(f =>
      f.ticker_a === d.ticker || f.ticker_b === d.ticker);
    const overfit_applied = overfit_flags.some(f => f.ticker === d.ticker);
    const sample_applied = !!(orig_ranked && sample_r &&
      orig_ranked.action_label !== sample_r.action_label);

    // LEVEL7.1B: Danger Guard from danger_score
    const danger_score = d.danger_score ?? 0;
    const danger_guard_applied = danger_score >= 0.55;
    const danger_guard_level: "critical" | "high" | "none" =
      danger_score >= 0.75 ? "critical" :
      danger_score >= 0.55 ? "high" :
      "none";

    const guard_notes: string[] = [];
    if (churn_applied) guard_notes.push(`CHURN: cooldown active for ${d.ticker}`);
    if (conflict_applied) guard_notes.push(`CONFLICT: contradictory decision for ${d.ticker}`);
    if (overfit_applied) guard_notes.push(`OVERFIT: repeated high-score pattern for ${d.ticker}`);
    if (sample_applied) guard_notes.push(`SAMPLE: low sample count for ${d.ticker} (soft degradation)`);
    if (danger_guard_applied) guard_notes.push(`DANGER[${danger_guard_level.toUpperCase()}]: danger_score=${danger_score.toFixed(2)} for ${d.ticker}`);

    return {
      ticker: d.ticker,
      churn_guard_applied: churn_applied,
      conflict_guard_applied: conflict_applied,
      overfit_guard_applied: overfit_applied,
      sample_guard_applied: sample_applied,
      danger_guard_applied,
      danger_guard_level,
      guard_notes,
      dominant_guard: "NONE",
      suppressed: false,
    };
  });

  // ── Step 3: Apply suppression per ticker ─────────────────────────────────
  const guarded_decisions: GuardedDecision[] = decisions.map((d, i) => {
    const sizing = sizings[i] ?? {
      ticker: d.ticker,
      suggested_allocation_pct: 0,
      sizing_bucket: "none" as SizingBucket,
      sizing_reason: "missing",
      capped_by: [],
      advisory_only: true as const,
    };
    return applyGuardSuppression(d, sizing, ticker_annotations[i], risk_budget);
  });

  // ── Step 4: Build guarded sizings using decay trace ───────────────────────
  const guarded_sizings: SizingResult[] = guarded_decisions.map((gd, i) => {
    const orig = sizings[i];
    if (!orig) {
      return {
        ticker: gd.ticker,
        suggested_allocation_pct: gd.sizing_decay_trace.guarded_allocation_pct,
        sizing_bucket: gd.guarded_sizing_bucket,
        sizing_reason: "guard_applied",
        capped_by: gd.guard_reason_codes,
        advisory_only: true as const,
      };
    }
    return {
      ...orig,
      sizing_bucket: gd.guarded_sizing_bucket,
      suggested_allocation_pct: gd.sizing_decay_trace.guarded_allocation_pct,
      capped_by: [...orig.capped_by, ...gd.guard_reason_codes],
    };
  });

  // ── Step 5: Merge churn+sample ranked, then apply guard suppression ───────
  const churn_and_sample_ranked = applySampleEnforcement(churn_ranked, sample_counts, sample_config);
  const guarded_ranked = applyGuardsToRankedDecisions(churn_and_sample_ranked, guarded_decisions);

  // ── Step 6: Build Level71SafetyReport ─────────────────────────────────────
  const safety_report = buildLevel71SafetyReport(
    guarded_decisions,
    overfit_flags,
    conflict_flags,
    risk_budget,
  );

  return {
    guarded_decisions,
    guarded_ranked,
    guarded_sizings,
    safety_report,
    ticker_annotations,
    advisory_only: true,
  };
}
