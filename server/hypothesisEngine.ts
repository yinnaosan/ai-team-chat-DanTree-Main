/**
 * DANTREE_PHASE2 LEVEL2B: Multi-Hypothesis Engine
 * Replaces single-source follow-up with ranked candidate selection.
 * v1: generates 2-3 candidates, selects ONE highest-value path.
 */

import type { FinalOutputSchema } from "./outputSchemaValidator";
import type { StructuredSynthesis } from "./synthesisController";
import type { StructuredDiscussion } from "./discussionController";
import type { TriggerDecision } from "./loopStateTriggerEngine";
import type { IntentContext } from "./intentInterpreter";

// ── Constants (LEVEL2C threshold zone) ───────────────────────────────────────
// These are isolated here for auditability. Do NOT scatter magic numbers.
export const HYPOTHESIS_CONFIG = {
  MAX_CANDIDATES: 3,
  MIN_CANDIDATES_FOR_SELECTION: 2,
  VALUE_GAIN_WEIGHT: 0.5,
  COST_PENALTY_WEIGHT: 0.3,
  REDUNDANCY_PENALTY_WEIGHT: 0.2,
  // Cost tiers: estimated LLM calls per hypothesis type
  COST_TIER: {
    valuation_gap: 1,
    risk_unresolved: 1,
    bear_case_test: 1,
    uncertainty_probe: 1,
    open_hypothesis: 1,
  } as Record<string, number>,
  // Value gain estimates by source field
  VALUE_TIER: {
    open_hypotheses: 0.8,
    weakest_point: 0.9,
    key_uncertainty: 0.85,
    bear_case: 0.75,
    counterarguments: 0.7,
  } as Record<string, number>,
};

// ── Types ─────────────────────────────────────────────────────────────────────

export type HypothesisSourceField =
  | "open_hypotheses"
  | "weakest_point"
  | "key_uncertainty"
  | "bear_case"
  | "counterarguments";

export interface HypothesisCandidate {
  hypothesis_id: string;
  source_field: HypothesisSourceField;
  statement: string;
  focus_area: string;
  required_fields: string[];
  priority_score: number;
  expected_value: number;
  estimated_cost: number;
  selection_reason: string;
}

export interface HypothesisSelection {
  candidates: HypothesisCandidate[];
  selected_hypothesis_id: string;
  selected_focus_area: string;
  selection_strategy: "highest_value_under_budget";
  rejected_candidates: Array<{
    hypothesis_id: string;
    statement: string;
    rejection_reason: string;
  }>;
}

// ── Candidate Extraction ──────────────────────────────────────────────────────

function extractCandidates(
  level1a3Output: FinalOutputSchema,
  structuredDiscussion: StructuredDiscussion | null,
  triggerDecision: TriggerDecision,
  intentCtx: IntentContext
): HypothesisCandidate[] {
  const candidates: HypothesisCandidate[] = [];
  let idCounter = 1;

  const makeId = () => `H${String(idCounter++).padStart(3, "0")}`;

  // Source 1: open_hypotheses (highest value — GPT explicitly flagged these)
  const disc = level1a3Output.discussion;
  if (disc?.open_hypotheses && disc.open_hypotheses.length > 0) {
    const hyp = disc.open_hypotheses[0]; // Take the first (most prominent)
    const id = makeId();
    const expectedValue = HYPOTHESIS_CONFIG.VALUE_TIER["open_hypotheses"];
    const estimatedCost = HYPOTHESIS_CONFIG.COST_TIER["uncertainty_probe"];
    candidates.push({
      hypothesis_id: id,
      source_field: "open_hypotheses",
      statement: hyp,
      focus_area: "open_hypothesis_validation",
      required_fields: ["financial_data", "news_context"],
      priority_score: computePriorityScore(expectedValue, estimatedCost, 0),
      expected_value: expectedValue,
      estimated_cost: estimatedCost,
      selection_reason: `Flagged as open hypothesis by Level1 analysis: "${hyp.slice(0, 80)}"`,
    });
  }

  // Source 2: weakest_point (highest trigger relevance)
  if (disc?.weakest_point && disc.weakest_point.trim()) {
    const id = makeId();
    const expectedValue = HYPOTHESIS_CONFIG.VALUE_TIER["weakest_point"];
    const estimatedCost = HYPOTHESIS_CONFIG.COST_TIER["valuation_gap"];
    // Penalize redundancy if this is the same trigger source
    const redundancyPenalty =
      triggerDecision.trigger_type === "weak_evidence" ? 0.1 : 0;
    candidates.push({
      hypothesis_id: id,
      source_field: "weakest_point",
      statement: disc.weakest_point,
      focus_area: "weakest_point_resolution",
      required_fields: ["quantitative_data"],
      priority_score: computePriorityScore(
        expectedValue,
        estimatedCost,
        redundancyPenalty
      ),
      expected_value: expectedValue,
      estimated_cost: estimatedCost,
      selection_reason: `Identified as weakest analytical point: "${disc.weakest_point.slice(0, 80)}"`,
    });
  }

  // Source 3: key_uncertainty (from discussion or synthesis)
  const keyUncertainty =
    disc?.key_uncertainty ||
    structuredDiscussion?.key_uncertainty ||
    null;
  if (keyUncertainty && keyUncertainty.trim() && candidates.length < HYPOTHESIS_CONFIG.MAX_CANDIDATES) {
    const id = makeId();
    const expectedValue = HYPOTHESIS_CONFIG.VALUE_TIER["key_uncertainty"];
    const estimatedCost = HYPOTHESIS_CONFIG.COST_TIER["uncertainty_probe"];
    const redundancyPenalty =
      triggerDecision.trigger_type === "high_uncertainty" ? 0.15 : 0;
    candidates.push({
      hypothesis_id: id,
      source_field: "key_uncertainty",
      statement: keyUncertainty,
      focus_area: "uncertainty_resolution",
      required_fields: ["macro_data", "sector_context"],
      priority_score: computePriorityScore(
        expectedValue,
        estimatedCost,
        redundancyPenalty
      ),
      expected_value: expectedValue,
      estimated_cost: estimatedCost,
      selection_reason: `Core uncertainty requiring resolution: "${keyUncertainty.slice(0, 80)}"`,
    });
  }

  // Source 4: bear_case (if risk-focused intent or critical_risk trigger)
  if (
    candidates.length < HYPOTHESIS_CONFIG.MAX_CANDIDATES &&
    level1a3Output.bear_case &&
    level1a3Output.bear_case.length > 0 &&
    (intentCtx.risk_focus === true ||
      triggerDecision.trigger_type === "critical_risk_unresolved")
  ) {
    const bearItem = level1a3Output.bear_case[0];
    const id = makeId();
    const expectedValue = HYPOTHESIS_CONFIG.VALUE_TIER["bear_case"];
    const estimatedCost = HYPOTHESIS_CONFIG.COST_TIER["risk_unresolved"];
    candidates.push({
      hypothesis_id: id,
      source_field: "bear_case",
      statement: bearItem,
      focus_area: "bear_case_stress_test",
      required_fields: ["risk_data", "historical_precedents"],
      priority_score: computePriorityScore(expectedValue, estimatedCost, 0),
      expected_value: expectedValue,
      estimated_cost: estimatedCost,
      selection_reason: `Bear case requires stress testing: "${bearItem.slice(0, 80)}"`,
    });
  }

  return candidates;
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function computePriorityScore(
  expectedValue: number,
  estimatedCost: number,
  redundancyPenalty: number
): number {
  const score =
    expectedValue * HYPOTHESIS_CONFIG.VALUE_GAIN_WEIGHT -
    estimatedCost * HYPOTHESIS_CONFIG.COST_PENALTY_WEIGHT -
    redundancyPenalty * HYPOTHESIS_CONFIG.REDUNDANCY_PENALTY_WEIGHT;
  return Math.max(0, Math.round(score * 100) / 100);
}

// ── Selection ─────────────────────────────────────────────────────────────────

function selectBestHypothesis(
  candidates: HypothesisCandidate[],
  budgetRemaining: number
): HypothesisSelection {
  if (candidates.length === 0) {
    return {
      candidates: [],
      selected_hypothesis_id: "",
      selected_focus_area: "no_candidates",
      selection_strategy: "highest_value_under_budget",
      rejected_candidates: [],
    };
  }

  // Filter by budget
  const affordable = candidates.filter(
    (c) => c.estimated_cost <= budgetRemaining
  );

  // Sort by priority_score descending
  const sorted = [...affordable].sort(
    (a, b) => b.priority_score - a.priority_score
  );

  const selected = sorted[0];
  const rejected = sorted.slice(1).map((c) => ({
    hypothesis_id: c.hypothesis_id,
    statement: c.statement,
    rejection_reason: `Lower priority_score (${c.priority_score}) than selected (${selected.priority_score})`,
  }));

  // Also record candidates that were over budget
  const overBudget = candidates
    .filter((c) => c.estimated_cost > budgetRemaining)
    .map((c) => ({
      hypothesis_id: c.hypothesis_id,
      statement: c.statement,
      rejection_reason: `Over budget: estimated_cost=${c.estimated_cost} > remaining=${budgetRemaining}`,
    }));

  return {
    candidates,
    selected_hypothesis_id: selected.hypothesis_id,
    selected_focus_area: selected.focus_area,
    selection_strategy: "highest_value_under_budget",
    rejected_candidates: [...rejected, ...overBudget],
  };
}

// ── Main Export ───────────────────────────────────────────────────────────────

/**
 * Run multi-hypothesis candidate generation and selection.
 * Returns the selected hypothesis and full audit trail.
 * Only ONE hypothesis is selected for actual second-pass execution in v1.
 */
export function runHypothesisEngine(params: {
  level1a3Output: FinalOutputSchema;
  structuredDiscussion: StructuredDiscussion | null;
  triggerDecision: TriggerDecision;
  intentCtx: IntentContext;
  budgetRemaining: number;
}): {
  selection: HypothesisSelection;
  selected: HypothesisCandidate | null;
  fallback_focus_area: string;
} {
  const {
    level1a3Output,
    structuredDiscussion,
    triggerDecision,
    intentCtx,
    budgetRemaining,
  } = params;

  try {
    const candidates = extractCandidates(
      level1a3Output,
      structuredDiscussion,
      triggerDecision,
      intentCtx
    );

    if (candidates.length === 0) {
      return {
        selection: {
          candidates: [],
          selected_hypothesis_id: "",
          selected_focus_area: triggerDecision.trigger_type,
          selection_strategy: "highest_value_under_budget",
          rejected_candidates: [],
        },
        selected: null,
        fallback_focus_area: triggerDecision.trigger_type,
      };
    }

    const selection = selectBestHypothesis(candidates, budgetRemaining);
    const selected =
      candidates.find(
        (c) => c.hypothesis_id === selection.selected_hypothesis_id
      ) ?? null;

    return {
      selection,
      selected,
      fallback_focus_area: selected?.focus_area ?? triggerDecision.trigger_type,
    };
  } catch (err) {
    // Non-fatal: return empty selection, caller falls back to legacy behavior
    console.error("[HypothesisEngine] Error:", err);
    return {
      selection: {
        candidates: [],
        selected_hypothesis_id: "",
        selected_focus_area: triggerDecision.trigger_type,
        selection_strategy: "highest_value_under_budget",
        rejected_candidates: [],
      },
      selected: null,
      fallback_focus_area: triggerDecision.trigger_type,
    };
  }
}
