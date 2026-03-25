/**
 * fieldRequirementGenerator.ts
 * LEVEL1A_PHASE_3 — Field Requirement Generator
 *
 * OBJECTIVE: Formalize field tiers between planning and fetching.
 * Consumes ResearchPlan + IntentContext, produces explicit blocking/important/optional
 * field tiers that drive evidenceValidator scoring and sourceSelectionEngine routing.
 *
 * DESIGN PRINCIPLE: Lightweight deterministic stage — no LLM calls.
 * Mode sensitivity: analysis_mode affects scope.
 */

import type { IntentContext } from "./intentInterpreter";
import type { ResearchPlan } from "./researchPlanner";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FieldRequirements {
  /** Fields whose absence blocks analysis — hard missing */
  blocking: string[];
  /** Fields that significantly improve analysis quality */
  important: string[];
  /** Fields that enrich but are not required */
  optional: string[];
  /** Mode that was applied */
  mode: "A" | "B" | "C";
  /** Source hint for each blocking field */
  blocking_source_hints: Record<string, string>;
}

// ── Source hints registry ─────────────────────────────────────────────────────

const FIELD_SOURCE_HINTS: Record<string, string> = {
  "price.current":         "yahoo_finance | polygon | finnhub",
  "price.realtime":        "polygon | alpaca",
  "valuation.pe":          "fmp | finnhub | yahoo_finance",
  "valuation.pb":          "fmp | finnhub",
  "revenue":               "fmp | simfin | sec_edgar",
  "net_income":            "fmp | simfin | sec_edgar",
  "free_cash_flow":        "fmp | simfin",
  "market_cap":            "fmp | polygon | yahoo_finance",
  "roe":                   "fmp | simfin",
  "roic":                  "fmp | simfin",
  "macro.primary_series":  "fred | world_bank",
  "macro.current_level":   "fred",
  "macro.rate_context":    "fred",
  "portfolio.weights":     "user_input",
  "portfolio.returns":     "user_input | alpaca",
  "event.description":     "news_api | marketaux | tavily",
};

// ── Mode definitions ──────────────────────────────────────────────────────────

/**
 * Mode A (quick): minimal blocking + selected important only
 * Mode B (standard): blocking + important + selective optional
 * Mode C (deep): expanded — blocking + important + all optional + extra context
 */
function applyMode(
  plan: ResearchPlan,
  analysisMode: "quick" | "standard" | "deep",
): { mode: "A" | "B" | "C"; blocking: string[]; important: string[]; optional: string[] } {
  if (analysisMode === "quick") {
    return {
      mode: "A",
      blocking: plan.blocking_fields,
      important: plan.important_fields.slice(0, 3),
      optional: [],
    };
  }
  if (analysisMode === "deep") {
    return {
      mode: "C",
      blocking: plan.blocking_fields,
      important: plan.important_fields,
      optional: plan.optional_fields,
    };
  }
  // standard (Mode B)
  return {
    mode: "B",
    blocking: plan.blocking_fields,
    important: plan.important_fields,
    optional: plan.optional_fields.slice(0, 3),
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * generateFieldRequirements
 *
 * Produces explicit field tiers from ResearchPlan + IntentContext.
 * Called after buildResearchPlan, before data fetch.
 *
 * @param plan  ResearchPlan from Phase2
 * @param intent  IntentContext from Phase1
 * @param analysisMode  quick | standard | deep
 */
export function generateFieldRequirements(
  plan: ResearchPlan,
  intent: IntentContext,
  analysisMode: "quick" | "standard" | "deep" = "standard",
): FieldRequirements {
  const { mode, blocking, important, optional } = applyMode(plan, analysisMode);

  // Intent-driven adjustments
  const adjustedBlocking = [...blocking];
  const adjustedImportant = [...important];
  const adjustedOptional = [...optional];

  // risk_focus: promote risk fields to important
  if (intent.risk_focus) {
    const riskFields = ["macro.rate_context", "sentiment.signal", "portfolio.drawdown"];
    for (const f of riskFields) {
      if (!adjustedImportant.includes(f) && !adjustedBlocking.includes(f)) {
        adjustedImportant.push(f);
      }
    }
  }

  // growth_focus: promote growth fields to important
  if (intent.growth_focus) {
    const growthFields = ["revenue_growth", "eps_growth", "forward_pe"];
    for (const f of growthFields) {
      if (!adjustedImportant.includes(f) && !adjustedBlocking.includes(f)) {
        adjustedImportant.push(f);
      }
    }
  }

  // comparison_needed: promote peer comparison to important
  if (intent.comparison_needed && !adjustedImportant.includes("peer.comparison")) {
    adjustedImportant.push("peer.comparison");
  }

  // Build source hints for blocking fields
  const blocking_source_hints: Record<string, string> = {};
  for (const f of adjustedBlocking) {
    if (FIELD_SOURCE_HINTS[f]) {
      blocking_source_hints[f] = FIELD_SOURCE_HINTS[f];
    }
  }

  return {
    blocking: adjustedBlocking,
    important: adjustedImportant,
    optional: adjustedOptional,
    mode,
    blocking_source_hints,
  };
}

/**
 * fieldRequirementsToMissingTiers
 *
 * Converts FieldRequirements into the FieldMissingTiers format expected
 * by evidenceValidator.buildEvidencePacket.
 * Call this AFTER data fetch to identify which required fields are absent.
 *
 * @param requirements  FieldRequirements from generateFieldRequirements
 * @param satisfiedFields  Fields that were successfully fetched
 */
export function fieldRequirementsToMissingTiers(
  requirements: FieldRequirements,
  satisfiedFields: string[],
): { missingBlocking: string[]; missingImportant: string[]; missingOptional: string[] } {
  const satisfied = new Set(satisfiedFields);
  return {
    missingBlocking: requirements.blocking.filter(f => !satisfied.has(f)),
    missingImportant: requirements.important.filter(f => !satisfied.has(f)),
    missingOptional: requirements.optional.filter(f => !satisfied.has(f)),
  };
}

/**
 * formatFieldRequirementsForPrompt
 *
 * Serializes FieldRequirements into a compact prompt injection block.
 */
export function formatFieldRequirementsForPrompt(req: FieldRequirements): string {
  const hints = Object.entries(req.blocking_source_hints)
    .map(([f, s]) => `  ${f} → ${s}`)
    .join("\n");
  return `[FIELD_REQUIREMENTS | LEVEL1A | MODE_${req.mode}]
BLOCKING: ${req.blocking.join(", ") || "none"}
IMPORTANT: ${req.important.join(", ") || "none"}
OPTIONAL: ${req.optional.join(", ") || "none"}
SOURCE_HINTS:
${hints || "  (none)"}
[/FIELD_REQUIREMENTS]`;
}
