/**
 * DANTREE LEVEL7.1 — Portfolio Guard Orchestrator
 * ─────────────────────────────────────────────────
 * Mandatory safety gate that sits between signal fusion/sizing and final
 * ranking/advisory output.  All guards are non-optional.
 *
 * Pipeline order enforced here:
 *   portfolio state
 *   → signal fusion          (portfolioState.ts)
 *   → position sizing draft  (positionSizingEngine.ts)
 *   → risk budget draft      (positionSizingEngine.ts)
 *   → [THIS FILE] safety guard pass   ← LEVEL7.1 gate
 *   → guarded ranking        (portfolioDecisionRanker.ts — uses guarded inputs)
 *   → guarded advisory output
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

// ─── Guard Precedence (highest → lowest) ────────────────────────────────────
export type GuardPrecedenceLevel =
  | "CONTRADICTION"
  | "CRITICAL_DANGER"
  | "CONCENTRATION_CRITICAL"
  | "CHURN_COOLDOWN"
  | "SAMPLE_INSUFFICIENT"
  | "OVERFIT_WARNING"
  | "NONE";

// ─── Per-ticker guard annotation ────────────────────────────────────────────
export interface TickerGuardAnnotation {
  ticker: string;
  churn_guard_applied: boolean;
  conflict_guard_applied: boolean;
  overfit_guard_applied: boolean;
  sample_guard_applied: boolean;
  guard_notes: string[];
  dominant_guard: GuardPrecedenceLevel;
  suppressed: boolean;
}

// ─── Guarded Decision ────────────────────────────────────────────────────────
export interface GuardedDecision {
  ticker: string;
  original_decision_bias: DecisionBias;
  guarded_decision_bias: DecisionBias;
  original_sizing_bucket: SizingBucket;
  guarded_sizing_bucket: SizingBucket;
  guard_reason_codes: string[];
  suppressed: boolean;
  annotation: TickerGuardAnnotation;
}

// ─── Level7.1 SafetyReport ───────────────────────────────────────────────────
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
  // Legacy SafetyReport fields (backward compat)
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

// ─── Orchestrator Input ──────────────────────────────────────────────────────
export interface GuardOrchestratorInput {
  /** Pre-ranked decisions from rankDecisions() — guards run on these */
  ranked_decisions: RankedDecision[];
  /** Original FusionDecisions (for bias tracking) */
  decisions: FusionDecision[];
  sizings: SizingResult[];
  risk_budget: RiskBudgetReport;
  /** sample_count per ticker for sample enforcement */
  sample_counts?: Map<string, number>;
  recent_actions?: RecentAction[];
  signal_history?: SignalHistoryEntry[];
  churn_config?: typeof DEFAULT_CHURN_GUARD_CONFIG;
  overfit_config?: typeof DEFAULT_OVERFIT_GUARD_CONFIG;
  sample_config?: typeof DEFAULT_SAMPLE_ENFORCEMENT_CONFIG;
}

// ─── Orchestrator Output ─────────────────────────────────────────────────────
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

function resolveDominantGuard(a: TickerGuardAnnotation): GuardPrecedenceLevel {
  if (a.conflict_guard_applied) return "CONTRADICTION";
  if (a.churn_guard_applied) return "CHURN_COOLDOWN";
  if (a.sample_guard_applied) return "SAMPLE_INSUFFICIENT";
  if (a.overfit_guard_applied) return "OVERFIT_WARNING";
  return "NONE";
}

// ─── Per-ticker suppression ───────────────────────────────────────────────────
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

  const dominant = resolveDominantGuard(annotation);
  annotation.dominant_guard = dominant;

  // Precedence 1: CONTRADICTION → force recheck, cap to minimal
  if (dominant === "CONTRADICTION") {
    guarded_bias = "recheck";
    guarded_bucket = downgradeBucket(sizing.sizing_bucket, 3);
    reason_codes.push("CONTRADICTION_DOMINATES: forced neutral + size capped to minimal");
    suppressed = true;
  }
  // Precedence 4: CHURN_COOLDOWN → downgrade 1 step
  else if (dominant === "CHURN_COOLDOWN") {
    if (guarded_bias === "strong_buy" || guarded_bias === "buy" || guarded_bias === "hold") {
      guarded_bias = downgradeBias(guarded_bias, 1);
      guarded_bucket = downgradeBucket(sizing.sizing_bucket, 1);
      reason_codes.push("CHURN_COOLDOWN: bias and size downgraded 1 step");
      suppressed = true;
    }
  }
  // Precedence 5: SAMPLE_INSUFFICIENT → force neutral if aggressive
  else if (dominant === "SAMPLE_INSUFFICIENT") {
    if (guarded_bias === "strong_buy" || guarded_bias === "buy") {
      guarded_bias = "monitor";
      guarded_bucket = downgradeBucket(sizing.sizing_bucket, 2);
      reason_codes.push("SAMPLE_INSUFFICIENT: aggressive action suppressed to neutral");
      suppressed = true;
    }
  }
  // Precedence 6: OVERFIT_WARNING → minor downgrade
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

  // Precedence 3: CONCENTRATION_CRITICAL (additive)
  if (risk_budget.risk_budget_status === "critical") {
    guarded_bucket = downgradeBucket(guarded_bucket, 2);
    reason_codes.push("CONCENTRATION_CRITICAL: size capped by risk budget");
    suppressed = true;
  }

  annotation.suppressed = suppressed;

  return {
    ticker: decision.ticker,
    original_decision_bias: decision.decision_bias,
    guarded_decision_bias: guarded_bias,
    original_sizing_bucket: sizing.sizing_bucket,
    guarded_sizing_bucket: guarded_bucket,
    guard_reason_codes: reason_codes,
    suppressed,
    annotation,
  };
}

// ─── Build Level71SafetyReport ────────────────────────────────────────────────
function buildLevel71SafetyReport(
  guarded_decisions: GuardedDecision[],
  overfit_flags: OverfitFlag[],
  conflict_flags: ConflictFlag[],
  risk_budget: RiskBudgetReport,
): Level71SafetyReport {
  const suppressed_tickers = guarded_decisions
    .filter(d => d.suppressed && d.original_decision_bias !== d.guarded_decision_bias)
    .map(d => d.ticker);

  const downgraded_tickers = guarded_decisions
    .filter(d => d.suppressed && d.original_sizing_bucket !== d.guarded_sizing_bucket)
    .map(d => d.ticker);

  const churn_guard_active = guarded_decisions.some(d => d.annotation.churn_guard_applied);
  const conflict_guard_active = guarded_decisions.some(d => d.annotation.conflict_guard_applied);
  const overfit_guard_active = guarded_decisions.some(d => d.annotation.overfit_guard_applied);
  const sample_guard_active = guarded_decisions.some(d => d.annotation.sample_guard_applied);
  const concentration_guard_active = risk_budget.risk_budget_status === "critical";

  const active_guard_count = [
    churn_guard_active, conflict_guard_active, overfit_guard_active,
    sample_guard_active, concentration_guard_active,
  ].filter(Boolean).length;

  const top_guard_reasons: string[] = [];
  if (conflict_guard_active) top_guard_reasons.push("CONTRADICTION detected in decisions");
  if (concentration_guard_active) top_guard_reasons.push("CONCENTRATION_CRITICAL: risk budget exceeded");
  if (churn_guard_active) top_guard_reasons.push("CHURN_COOLDOWN: recent action within window");
  if (sample_guard_active) top_guard_reasons.push("SAMPLE_INSUFFICIENT: low sample count");
  if (overfit_guard_active) top_guard_reasons.push("OVERFIT_WARNING: stale repeated pattern");

  const portfolio_guard_status: Level71SafetyReport["portfolio_guard_status"] =
    suppressed_tickers.length >= 3 || conflict_flags.length >= 2 ? "critical" :
    suppressed_tickers.length >= 1 || active_guard_count >= 2 ? "suppressed" :
    active_guard_count >= 1 ? "guarded" :
    "healthy";

  const churn_suppressed_count = guarded_decisions.filter(d => d.annotation.churn_guard_applied && d.suppressed).length;
  const sample_enforcement_count = guarded_decisions.filter(d => d.annotation.sample_guard_applied && d.suppressed).length;
  const overall_safety_status: "clean" | "flagged" | "critical" =
    conflict_flags.length >= 2 || overfit_flags.length >= 3 ? "critical" :
    conflict_flags.length >= 1 || overfit_flags.length >= 1 || churn_suppressed_count >= 1 ? "flagged" :
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
/**
 * Adjusts RankedDecision[] using guard outputs:
 * - Downgrade suppressed tickers' action_label and final_score
 * - Contradiction tickers get lowest final_score
 */
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
      gd.guarded_decision_bias === "monitor" ? "MONITOR" :
      gd.guarded_decision_bias === "recheck" ? "MONITOR" :
      gd.guarded_decision_bias === "reduce" ? "TRIM" :
      gd.guarded_decision_bias === "avoid" ? "EXIT" :
      r.action_label;

    return {
      ...r,
      action_label: guarded_action,
      decision_bias: gd.guarded_decision_bias,
      sizing_bucket: gd.guarded_sizing_bucket,
      final_score: parseFloat((r.final_score * 0.6).toFixed(4)),
    };
  });
}

// ─── Main Orchestrator Entry Point ────────────────────────────────────────────
/**
 * runPortfolioSafetyGuards()
 *
 * Mandatory safety gate in the Level 7 pipeline.
 * Call AFTER rankDecisions(), BEFORE generateAdvisoryOutput().
 *
 * Returns guarded_ranked that downstream advisory MUST use.
 */
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

  // ── Step 1: Run all four guard families ──────────────────────────────────

  // 1a. Churn guard (operates on RankedDecision[])
  const churn_ranked = applyChurnGuard(ranked_decisions, recent_actions, churn_config);

  // 1b. Overfit detection
  const overfit_flags = detectOverfitFlags(ranked_decisions as unknown as FusionDecision[], signal_history, overfit_config);

  // 1c. Conflict detection (operates on RankedDecision[])
  const conflict_flags = detectDecisionConflicts(ranked_decisions);

  // 1d. Sample enforcement (operates on RankedDecision[] + Map<string, number>)
  const sample_ranked = applySampleEnforcement(ranked_decisions, sample_counts, sample_config);

  // ── Step 2: Build per-ticker annotations ─────────────────────────────────
  const ticker_annotations: TickerGuardAnnotation[] = decisions.map(d => {
    const orig_ranked = ranked_decisions.find(r => r.ticker === d.ticker);
    const churn_r = churn_ranked.find(r => r.ticker === d.ticker);
    const sample_r = sample_ranked.find(r => r.ticker === d.ticker);

    const churn_applied = !!(orig_ranked && churn_r &&
      orig_ranked.action_label !== churn_r.action_label);
    const conflict_applied = conflict_flags.some(f =>
      f.ticker_a === d.ticker || f.ticker_b === d.ticker);
    // Overfit only applies if there are actual flags for this ticker
    const overfit_applied = overfit_flags.some(f => f.ticker === d.ticker);
    const sample_applied = !!(orig_ranked && sample_r &&
      orig_ranked.action_label !== sample_r.action_label);

    const guard_notes: string[] = [];
    if (churn_applied) guard_notes.push(`CHURN: cooldown active for ${d.ticker}`);
    if (conflict_applied) guard_notes.push(`CONFLICT: contradictory decision for ${d.ticker}`);
    if (overfit_applied) guard_notes.push(`OVERFIT: repeated high-score pattern for ${d.ticker}`);
    if (sample_applied) guard_notes.push(`SAMPLE: insufficient sample count for ${d.ticker}`);

    return {
      ticker: d.ticker,
      churn_guard_applied: churn_applied,
      conflict_guard_applied: conflict_applied,
      overfit_guard_applied: overfit_applied,
      sample_guard_applied: sample_applied,
      guard_notes,
      dominant_guard: "NONE",
      suppressed: false,
    };
  });

  // ── Step 3: Apply suppression per ticker (bias + sizing) ─────────────────
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

  // ── Step 4: Build guarded sizings ────────────────────────────────────────
  const guarded_sizings: SizingResult[] = guarded_decisions.map((gd, i) => {
    const orig = sizings[i];
    if (!orig) {
      return {
        ticker: gd.ticker,
        suggested_allocation_pct: 0,
        sizing_bucket: gd.guarded_sizing_bucket,
        sizing_reason: "guard_applied",
        capped_by: gd.guard_reason_codes,
        advisory_only: true as const,
      };
    }
    const bucket_idx_orig = BUCKET_ORDER.indexOf(gd.original_sizing_bucket);
    const bucket_idx_guard = BUCKET_ORDER.indexOf(gd.guarded_sizing_bucket);
    const reduction = bucket_idx_guard > bucket_idx_orig
      ? Math.pow(0.6, bucket_idx_guard - bucket_idx_orig)
      : 1;
    return {
      ...orig,
      sizing_bucket: gd.guarded_sizing_bucket,
      suggested_allocation_pct: parseFloat((orig.suggested_allocation_pct * reduction).toFixed(2)),
      capped_by: [...orig.capped_by, ...gd.guard_reason_codes],
    };
  });

  // ── Step 5: Apply guards to ranked decisions ──────────────────────────────────────────────
  // Merge: start from churn_ranked (already has churn action_label changes),
  // then apply sample enforcement on top, then apply bias/sizing suppression
  const churn_and_sample_ranked = applySampleEnforcement(churn_ranked, sample_counts, sample_config);
  const guarded_ranked = applyGuardsToRankedDecisions(churn_and_sample_ranked, guarded_decisions);

  // ── Step 6: Build Level71SafetyReport ────────────────────────────────────────
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