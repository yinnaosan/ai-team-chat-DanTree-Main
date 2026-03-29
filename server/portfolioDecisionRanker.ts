/**
 * DANTREE LEVEL7 — Phase 5+6
 * Decision Ranking / Portfolio View + Advisory Output / Explanation Layer
 *
 * ADVISORY ONLY — no auto-trade, no order generation.
 * All outputs are informational and must be reviewed by a human.
 */

import type { FusionDecision, PortfolioState } from "./portfolioState";
import type { SizingResult, RiskBudgetReport } from "./positionSizingEngine";
import { computeConcentrationPenalty } from "./positionSizingEngine";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5: Decision Ranking & Portfolio View
// ─────────────────────────────────────────────────────────────────────────────

export type ActionLabel =
  | "INITIATE"    // new position, not currently held
  | "ADD"         // increase existing position
  | "HOLD"        // maintain current position
  | "TRIM"        // reduce position size
  | "EXIT"        // close position
  | "AVOID"       // do not enter
  | "MONITOR"     // watch but no action
  | "RECHECK";    // conflicting signals, needs review

export interface RankedDecision {
  rank: number;
  ticker: string;
  action_label: ActionLabel;
  final_score: number;             // 0-1 after concentration penalty
  fusion_score: number;            // raw fusion score
  concentration_penalty: number;   // 0-0.5
  suggested_allocation_pct: number;
  sizing_bucket: string;
  decision_bias: string;
  fusion_confidence: string;
  danger_score: number;
  is_existing_holding: boolean;
  existing_weight_pct: number;
  advisory_only: true;
}

export interface PortfolioView {
  portfolio_id: string;
  ranked_decisions: RankedDecision[];
  total_candidates: number;
  actionable_count: number;        // INITIATE + ADD + TRIM + EXIT
  monitor_count: number;
  avoid_count: number;
  risk_budget_status: string;
  snapshot_at_ms: number;
  advisory_only: true;
}

function resolveActionLabel(
  decision: FusionDecision,
  sizing: SizingResult,
  is_existing: boolean,
  existing_weight_pct: number
): ActionLabel {
  // Danger / avoid path
  if (decision.decision_bias === "avoid" || sizing.sizing_bucket === "none") {
    return is_existing ? "EXIT" : "AVOID";
  }

  // Recheck
  if (decision.decision_bias === "recheck") return "RECHECK";

  // Monitor
  if (decision.decision_bias === "monitor") return is_existing ? "MONITOR" : "MONITOR";

  // Existing holding
  if (is_existing) {
    const target = sizing.suggested_allocation_pct;
    const delta = target - existing_weight_pct;
    if (delta > 1.0) return "ADD";
    if (delta < -1.0) return "TRIM";
    return "HOLD";
  }

  // New candidate
  if (sizing.suggested_allocation_pct > 0) return "INITIATE";
  return "MONITOR";
}

export function rankDecisions(
  decisions: FusionDecision[],
  sizings: SizingResult[],
  portfolio: PortfolioState,
  risk_budget: RiskBudgetReport
): PortfolioView {
  const sizingMap = new Map(sizings.map(s => [s.ticker, s]));
  const holdingMap = new Map(
    portfolio.holdings.map(h => [h.ticker, h])
  );

  const ranked: RankedDecision[] = [];

  for (const decision of decisions) {
    const sizing = sizingMap.get(decision.ticker) ?? {
      ticker: decision.ticker,
      suggested_allocation_pct: 0,
      sizing_bucket: "none",
      sizing_reason: "No sizing result",
      capped_by: [],
      advisory_only: true as const,
    };

    const holding = holdingMap.get(decision.ticker);
    const is_existing = holding?.status === "active";
    const existing_weight_pct = holding?.weight_pct ?? 0;

    const concentration_penalty = computeConcentrationPenalty(
      decision.ticker,
      portfolio,
      risk_budget
    );

    const final_score = Math.max(0, decision.fusion_score - concentration_penalty);

    const action_label = resolveActionLabel(
      decision,
      sizing,
      is_existing,
      existing_weight_pct
    );

    ranked.push({
      rank: 0, // assigned below
      ticker: decision.ticker,
      action_label,
      final_score,
      fusion_score: decision.fusion_score,
      concentration_penalty,
      suggested_allocation_pct: sizing.suggested_allocation_pct,
      sizing_bucket: sizing.sizing_bucket,
      decision_bias: decision.decision_bias,
      fusion_confidence: decision.fusion_confidence,
      danger_score: decision.danger_score,
      is_existing_holding: is_existing,
      existing_weight_pct,
      advisory_only: true,
    });
  }

  // Sort: actionable first (by final_score desc), then monitor, then avoid
  const actionPriority: Record<ActionLabel, number> = {
    INITIATE: 0, ADD: 1, TRIM: 2, HOLD: 3,
    RECHECK: 4, MONITOR: 5, EXIT: 6, AVOID: 7,
  };

  ranked.sort((a, b) => {
    const pa = actionPriority[a.action_label];
    const pb = actionPriority[b.action_label];
    if (pa !== pb) return pa - pb;
    return b.final_score - a.final_score;
  });

  ranked.forEach((r, i) => { r.rank = i + 1; });

  const actionable_count = ranked.filter(r =>
    ["INITIATE", "ADD", "TRIM", "EXIT"].includes(r.action_label)
  ).length;
  const monitor_count = ranked.filter(r => r.action_label === "MONITOR").length;
  const avoid_count = ranked.filter(r => r.action_label === "AVOID").length;

  return {
    portfolio_id: portfolio.portfolio_id,
    ranked_decisions: ranked,
    total_candidates: ranked.length,
    actionable_count,
    monitor_count,
    avoid_count,
    risk_budget_status: risk_budget.risk_budget_status,
    snapshot_at_ms: Date.now(),
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6: Advisory Output / Explanation Layer
// ─────────────────────────────────────────────────────────────────────────────

export interface AdvisoryExplanation {
  ticker: string;
  action_label: ActionLabel;
  headline: string;
  rationale_bullets: string[];
  risk_flags: string[];
  confidence_note: string;
  sizing_note: string;
  advisory_disclaimer: string;
  advisory_only: true;
}

export interface AdvisoryOutput {
  portfolio_id: string;
  generated_at_ms: number;
  risk_budget_summary: string;
  top_decisions: AdvisoryExplanation[];
  portfolio_health_note: string;
  advisory_only: true;
}

function buildRationaleBullets(r: RankedDecision): string[] {
  const bullets: string[] = [];

  if (r.fusion_score >= 0.65) {
    bullets.push(`Strong composite signal (fusion score: ${r.fusion_score.toFixed(2)})`);
  } else if (r.fusion_score >= 0.45) {
    bullets.push(`Moderate composite signal (fusion score: ${r.fusion_score.toFixed(2)})`);
  } else {
    bullets.push(`Weak composite signal (fusion score: ${r.fusion_score.toFixed(2)})`);
  }

  if (r.concentration_penalty > 0) {
    bullets.push(`Concentration penalty applied: -${r.concentration_penalty.toFixed(2)} (sector/theme overlap)`);
  }

  if (r.is_existing_holding) {
    bullets.push(`Currently held at ${r.existing_weight_pct.toFixed(1)}% portfolio weight`);
    const delta = r.suggested_allocation_pct - r.existing_weight_pct;
    if (Math.abs(delta) > 0.5) {
      bullets.push(`Target weight: ${r.suggested_allocation_pct.toFixed(1)}% (delta: ${delta > 0 ? "+" : ""}${delta.toFixed(1)}%)`);
    }
  } else {
    bullets.push(`New candidate — not currently in portfolio`);
    if (r.suggested_allocation_pct > 0) {
      bullets.push(`Suggested initial allocation: ${r.suggested_allocation_pct.toFixed(1)}%`);
    }
  }

  return bullets;
}

function buildRiskFlags(r: RankedDecision): string[] {
  const flags: string[] = [];
  if (r.danger_score >= 0.55) {
    flags.push(`High danger score: ${r.danger_score.toFixed(2)} — elevated downside risk`);
  }
  if (r.fusion_confidence === "insufficient") {
    flags.push("Insufficient sample history — signal reliability unverified");
  } else if (r.fusion_confidence === "low") {
    flags.push("Low confidence signal — limited outcome history");
  }
  if (r.decision_bias === "recheck") {
    flags.push("Memory contradiction detected — signals conflict with historical outcomes");
  }
  return flags;
}

function buildHeadline(r: RankedDecision): string {
  const action_map: Record<ActionLabel, string> = {
    INITIATE: `Consider initiating a position in ${r.ticker}`,
    ADD: `Consider adding to existing ${r.ticker} position`,
    HOLD: `Maintain current ${r.ticker} position`,
    TRIM: `Consider trimming ${r.ticker} position`,
    EXIT: `Consider exiting ${r.ticker} position`,
    AVOID: `Avoid ${r.ticker} — risk signals elevated`,
    MONITOR: `Monitor ${r.ticker} — no action recommended at this time`,
    RECHECK: `Recheck ${r.ticker} — conflicting signals require review`,
  };
  return action_map[r.action_label] ?? `Review ${r.ticker}`;
}

function buildConfidenceNote(r: RankedDecision): string {
  const map: Record<string, string> = {
    high: "High confidence — sufficient outcome history supports this signal",
    medium: "Medium confidence — moderate outcome history",
    low: "Low confidence — limited outcome history, treat with caution",
    insufficient: "Insufficient data — signal cannot be reliably validated",
  };
  return map[r.fusion_confidence] ?? "Confidence unknown";
}

function buildSizingNote(r: RankedDecision): string {
  if (r.sizing_bucket === "none") {
    return "No allocation suggested — risk or confidence constraints prevent sizing";
  }
  return `Suggested bucket: ${r.sizing_bucket.toUpperCase()} (${r.suggested_allocation_pct.toFixed(1)}% of portfolio)`;
}

function buildRiskBudgetSummary(risk_budget: RiskBudgetReport): string {
  const status_map: Record<string, string> = {
    healthy: "Portfolio risk budget is within normal bounds.",
    stretched: "Portfolio risk budget is stretched — monitor concentration.",
    concentrated: "Portfolio concentration detected — review sector/theme exposure.",
    critical: "CRITICAL: Portfolio risk budget breached — immediate review required.",
  };
  const base = status_map[risk_budget.risk_budget_status] ?? "Risk budget status unknown.";
  const warnings = risk_budget.top_concentration_warnings
    .map(w => `${w.dimension}:${w.label} (${w.current_pct.toFixed(1)}% vs ${w.threshold_pct}% limit)`)
    .join("; ");
  return warnings ? `${base} Warnings: ${warnings}` : base;
}

function buildPortfolioHealthNote(view: PortfolioView): string {
  return (
    `Portfolio snapshot: ${view.total_candidates} candidates evaluated. ` +
    `${view.actionable_count} actionable (INITIATE/ADD/TRIM/EXIT), ` +
    `${view.monitor_count} on monitor, ` +
    `${view.avoid_count} to avoid. ` +
    `Risk budget: ${view.risk_budget_status}.`
  );
}

const ADVISORY_DISCLAIMER =
  "ADVISORY ONLY: This output is for informational purposes. " +
  "No trades are executed automatically. All decisions require human review and approval.";

export function generateAdvisoryOutput(
  view: PortfolioView,
  risk_budget: RiskBudgetReport,
  top_n = 10
): AdvisoryOutput {
  const top_decisions: AdvisoryExplanation[] = view.ranked_decisions
    .slice(0, top_n)
    .map(r => ({
      ticker: r.ticker,
      action_label: r.action_label,
      headline: buildHeadline(r),
      rationale_bullets: buildRationaleBullets(r),
      risk_flags: buildRiskFlags(r),
      confidence_note: buildConfidenceNote(r),
      sizing_note: buildSizingNote(r),
      advisory_disclaimer: ADVISORY_DISCLAIMER,
      advisory_only: true as const,
    }));

  return {
    portfolio_id: view.portfolio_id,
    generated_at_ms: Date.now(),
    risk_budget_summary: buildRiskBudgetSummary(risk_budget),
    top_decisions,
    portfolio_health_note: buildPortfolioHealthNote(view),
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator: Full LEVEL7 Pipeline
// ─────────────────────────────────────────────────────────────────────────────

import { fuseMultipleSignals, type SignalInput } from "./portfolioState";
import { computePositionSize, evaluateRiskBudget, DEFAULT_SIZING_CONFIG, DEFAULT_RISK_BUDGET_CONFIG } from "./positionSizingEngine";
import type { SizingConfig, RiskBudgetConfig } from "./positionSizingEngine";
import {
  runPortfolioSafetyGuards,
  type GuardOrchestratorInput,
  type GuardOrchestratorOutput,
} from "./portfolioGuardOrchestrator";
import type { RecentAction, SignalHistoryEntry } from "./portfolioSafetyGuard";

export interface Level7PipelineInput {
  portfolio: PortfolioState;
  signals: Array<SignalInput & { sample_count?: number }>;
  sizing_config?: SizingConfig;
  risk_budget_config?: RiskBudgetConfig;
  top_n?: number;
  // LEVEL7.1: Safety guard inputs (all optional — guards run with empty defaults)
  recent_actions?: RecentAction[];
  signal_history?: SignalHistoryEntry[];
  sample_counts?: Map<string, number>;
}

export interface Level7PipelineOutput {
  portfolio_view: PortfolioView;
  advisory_output: AdvisoryOutput;
  risk_budget: RiskBudgetReport;
  // LEVEL7.1: Guard outputs attached to every pipeline result
  guard_output: GuardOrchestratorOutput;
  advisory_only: true;
  // LEVEL8: Persistence result (present when userId is provided)
  persistence?: {
    portfolioId: number;
    snapshotId: number;
    decisionIds: number[];
    guardIds: number[];
    consistency_check: {
      decisions_match_guards: boolean;
      snapshot_tickers_match: boolean;
    };
  };
}

/**
 * LEVEL8 Full Patch — Auto-persist wrapper.
 * Runs the full pipeline synchronously, then persists to DB if userId is provided.
 * Persistence failure is non-blocking (advisory output always returned).
 */
export async function runLevel7PipelineWithPersist(
  input: Level7PipelineInput & { userId?: number }
): Promise<Level7PipelineOutput> {
  const output = runLevel7Pipeline(input);
  if (input.userId != null) {
    try {
      const { persistPipelineRun } = await import("./portfolioPersistence");
      const result = await persistPipelineRun(input.userId, output, (input as any).attributionMap, (input as any).strategyVersionId ?? null);
      const decisionsMatchGuards = result.decisionIds.length === result.guardIds.length;
      const snapshotTickersMatch =
        result.decisionIds.length === (output.portfolio_view?.ranked_decisions?.length ?? 0);
      (output as any).persistence = {
        portfolioId: result.portfolioId,
        snapshotId: result.snapshotId,
        decisionIds: result.decisionIds,
        guardIds: result.guardIds,
        consistency_check: {
          decisions_match_guards: decisionsMatchGuards,
          snapshot_tickers_match: snapshotTickersMatch,
        },
      };
    } catch (err) {
      console.error("[Level7Pipeline] persistPipelineRun failed (non-blocking):", err);
    }
  }
  return output;
}

export function runLevel7Pipeline(input: Level7PipelineInput): Level7PipelineOutput {
  const {
    portfolio, signals, sizing_config, risk_budget_config, top_n = 10,
    recent_actions = [], signal_history = [], sample_counts = new Map(),
  } = input;

  // Phase 2: Fuse signals
  const decisions = fuseMultipleSignals(signals);

  // Phase 3: Size positions
  const sizings = decisions.map(d => {
    const sig = signals.find(s => s.ticker === d.ticker);
    return computePositionSize(d, sig?.sample_count ?? 0, portfolio, sizing_config ?? DEFAULT_SIZING_CONFIG);
  });

  // Phase 4: Risk budget
  const risk_budget = evaluateRiskBudget(portfolio, decisions, risk_budget_config ?? DEFAULT_RISK_BUDGET_CONFIG);

  // Phase 5: Rank decisions (pre-guard)
  const pre_guard_view = rankDecisions(decisions, sizings, portfolio, risk_budget);

  // LEVEL7.1 Phase 5.5: Mandatory safety guard pass
  const guard_input: GuardOrchestratorInput = {
    ranked_decisions: pre_guard_view.ranked_decisions,
    decisions,
    sizings,
    risk_budget,
    recent_actions,
    signal_history,
    sample_counts,
  };
  const guard_output = runPortfolioSafetyGuards(guard_input);

  // Phase 5.6: Re-rank using guarded decisions
  const guarded_view: PortfolioView = {
    ...pre_guard_view,
    ranked_decisions: guard_output.guarded_ranked,
    actionable_count: guard_output.guarded_ranked.filter(r =>
      ["INITIATE", "ADD", "TRIM", "EXIT"].includes(r.action_label)
    ).length,
    monitor_count: guard_output.guarded_ranked.filter(r => r.action_label === "MONITOR").length,
    avoid_count: guard_output.guarded_ranked.filter(r => r.action_label === "AVOID").length,
  };

  // Phase 6: Advisory output (uses guarded view)
  const advisory_output = generateAdvisoryOutput(guarded_view, risk_budget, top_n);

  return {
    portfolio_view: guarded_view,
    advisory_output,
    risk_budget,
    guard_output,
    advisory_only: true,
  };
}
