/**
 * DANTREE_PHASE2 LEVEL2B: Multi-Hypothesis Engine
 * Replaces single-source follow-up with ranked candidate selection.
 * v1: generates 2-3 candidates, selects ONE highest-value path.
 *
 * LEVEL3B: Extended with MemorySeed for prior-memory hypothesis seeding,
 * deduplication, and memory-aware priority bonuses.
 */

import type { FinalOutputSchema } from "./outputSchemaValidator";
import type { StructuredSynthesis } from "./synthesisController";
import type { StructuredDiscussion } from "./discussionController";
import type { TriggerDecision } from "./loopStateTriggerEngine";
import type { IntentContext } from "./intentInterpreter";

// ── Constants (LEVEL2C threshold zone) ───────────────────────────────────────
// These are isolated here for auditability. Do NOT scatter magic numbers.
export const HYPOTHESIS_CONFIG = {
  MAX_CANDIDATES: 4, // +1 slot for memory-seeded candidate
  MIN_CANDIDATES_FOR_SELECTION: 2,
  VALUE_GAIN_WEIGHT: 0.5,
  COST_PENALTY_WEIGHT: 0.3,
  REDUNDANCY_PENALTY_WEIGHT: 0.2,
  // LEVEL3B: Memory bonus weights (bounded to prevent old memory dominating)
  MEMORY_RECURRENCE_BONUS: 0.12,   // Applied when prior hypothesis recurs unresolved
  CONFLICT_PRIORITY_BONUS: 0.15,   // Applied when conflict detected
  MEMORY_BONUS_CAP: 0.20,          // Max total memory bonus per candidate
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
    prior_open_hypotheses: 0.75,  // LEVEL3B: slightly lower than current-run
    prior_key_uncertainty: 0.70,  // LEVEL3B: slightly lower than current-run
  } as Record<string, number>,
};

// ── Types ─────────────────────────────────────────────────────────────────────

export type HypothesisSourceField =
  | "open_hypotheses"
  | "weakest_point"
  | "key_uncertainty"
  | "bear_case"
  | "counterarguments"
  | "prior_open_hypotheses"    // LEVEL3B
  | "prior_key_uncertainty";   // LEVEL3B

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
  memory_origin?: boolean;     // LEVEL3B: true if from prior memory
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

// ── LEVEL3B: MemorySeed Type ──────────────────────────────────────────────────

export interface MemorySeed {
  memory_found: boolean;
  prior_open_hypotheses: string[];
  prior_key_uncertainty: string;
  prior_verdict: string;
  prior_confidence: string;
}

// ── LEVEL3B: MemoryConflict Type ─────────────────────────────────────────────

export interface MemoryConflict {
  has_conflict: boolean;
  conflict_type: "none" | "verdict_flip" | "confidence_drop" | "thesis_tension" | "risk_escalation";
  prior_verdict: string;
  current_verdict: string;
  prior_confidence: string;
  current_confidence: string;
  summary: string;
}

// ── LEVEL3B: Deduplication Helpers ───────────────────────────────────────────

/**
 * Normalize a hypothesis statement for deduplication.
 * Strips punctuation, lowercases, collapses whitespace.
 */
function normalizeStatement(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fff]/g, " ")  // keep CJK chars
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check if two normalized statements are semantically similar enough to dedupe.
 * Uses simple prefix/suffix overlap (deterministic, no LLM).
 */
function isSimilarStatement(a: string, b: string): boolean {
  if (a === b) return true;
  // Check if one is a substring of the other (truncated version)
  if (a.length > 10 && b.includes(a.slice(0, Math.floor(a.length * 0.7)))) return true;
  if (b.length > 10 && a.includes(b.slice(0, Math.floor(b.length * 0.7)))) return true;
  return false;
}

/**
 * Deduplicate candidates: remove memory-origin candidates that are too similar
 * to existing current-run candidates. Current-run candidates always win.
 */
function deduplicateCandidates(candidates: HypothesisCandidate[]): HypothesisCandidate[] {
  const currentRun = candidates.filter(c => !c.memory_origin);
  const memoryOrigin = candidates.filter(c => c.memory_origin);

  const currentNormalized = currentRun.map(c => normalizeStatement(c.statement));

  const deduped = memoryOrigin.filter(mc => {
    const norm = normalizeStatement(mc.statement);
    return !currentNormalized.some(cn => isSimilarStatement(norm, cn));
  });

  return [...currentRun, ...deduped];
}

// ── Candidate Extraction ──────────────────────────────────────────────────────

function extractCandidates(
  level1a3Output: FinalOutputSchema,
  structuredDiscussion: StructuredDiscussion | null,
  triggerDecision: TriggerDecision,
  intentCtx: IntentContext,
  memorySeed?: MemorySeed,
  memoryConflict?: MemoryConflict
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

  // ── LEVEL3B: Memory-seeded candidates ────────────────────────────────────
  if (memorySeed?.memory_found) {
    // Source 5: prior_open_hypotheses
    if (
      memorySeed.prior_open_hypotheses.length > 0 &&
      candidates.length < HYPOTHESIS_CONFIG.MAX_CANDIDATES
    ) {
      const priorHyp = memorySeed.prior_open_hypotheses[0];
      const id = makeId();
      const expectedValue = HYPOTHESIS_CONFIG.VALUE_TIER["prior_open_hypotheses"];
      const estimatedCost = HYPOTHESIS_CONFIG.COST_TIER["uncertainty_probe"];
      // Apply memory_recurrence_bonus (bounded)
      const memoryBonus = Math.min(
        HYPOTHESIS_CONFIG.MEMORY_RECURRENCE_BONUS,
        HYPOTHESIS_CONFIG.MEMORY_BONUS_CAP
      );
      candidates.push({
        hypothesis_id: id,
        source_field: "prior_open_hypotheses",
        statement: priorHyp,
        focus_area: "prior_hypothesis_revalidation",
        required_fields: ["financial_data", "news_context"],
        priority_score: computePriorityScore(expectedValue + memoryBonus, estimatedCost, 0),
        expected_value: expectedValue + memoryBonus,
        estimated_cost: estimatedCost,
        selection_reason: `Prior unresolved hypothesis from memory (${memorySeed.prior_verdict}): "${priorHyp.slice(0, 80)}"`,
        memory_origin: true,
      });
    }

    // Source 6: prior_key_uncertainty (if still relevant)
    if (
      memorySeed.prior_key_uncertainty.trim() &&
      candidates.length < HYPOTHESIS_CONFIG.MAX_CANDIDATES
    ) {
      const id = makeId();
      const expectedValue = HYPOTHESIS_CONFIG.VALUE_TIER["prior_key_uncertainty"];
      const estimatedCost = HYPOTHESIS_CONFIG.COST_TIER["uncertainty_probe"];
      // Extra bonus if conflict detected (prior uncertainty is now a conflict point)
      const conflictBonus = memoryConflict?.has_conflict
        ? Math.min(HYPOTHESIS_CONFIG.CONFLICT_PRIORITY_BONUS, HYPOTHESIS_CONFIG.MEMORY_BONUS_CAP)
        : 0;
      candidates.push({
        hypothesis_id: id,
        source_field: "prior_key_uncertainty",
        statement: memorySeed.prior_key_uncertainty,
        focus_area: "prior_uncertainty_recheck",
        required_fields: ["macro_data", "sector_context"],
        priority_score: computePriorityScore(expectedValue + conflictBonus, estimatedCost, 0),
        expected_value: expectedValue + conflictBonus,
        estimated_cost: estimatedCost,
        selection_reason: `Prior key uncertainty from memory${conflictBonus > 0 ? " (conflict detected)" : ""}: "${memorySeed.prior_key_uncertainty.slice(0, 80)}"`,
        memory_origin: true,
      });
    }
  }

  // ── Deduplication (current-run candidates always win over memory) ─────────
  return deduplicateCandidates(candidates);
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
 *
 * LEVEL3B: Optional memorySeed and memoryConflict inputs enable memory-driven
 * hypothesis seeding and conflict-aware priority boosting.
 */
export function runHypothesisEngine(params: {
  level1a3Output: FinalOutputSchema;
  structuredDiscussion: StructuredDiscussion | null;
  triggerDecision: TriggerDecision;
  intentCtx: IntentContext;
  budgetRemaining: number;
  memorySeed?: MemorySeed;       // LEVEL3B
  memoryConflict?: MemoryConflict; // LEVEL3B
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
    memorySeed,
    memoryConflict,
  } = params;

  try {
    const candidates = extractCandidates(
      level1a3Output,
      structuredDiscussion,
      triggerDecision,
      intentCtx,
      memorySeed,
      memoryConflict
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
