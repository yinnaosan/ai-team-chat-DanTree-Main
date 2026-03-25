/**
 * LEVEL1A2 Phase5: Runtime Gating and Decision Rules
 *
 * MANDATORY DECISION TABLE:
 * CASE_A: blocking present + medium evidence -> directional verdict + limitation note
 * CASE_B: blocking present + strong evidence -> full structured verdict
 * CASE_C: blocking missing but minimal path available -> low-confidence directional
 * CASE_D: discussion_mode -> preserve thesis context, avoid full report regeneration
 *
 * RULE: Partial data must NOT collapse into failure for normal tasks.
 * RULE: Generic "cannot analyze" is FORBIDDEN for partial-data normal cases.
 * RULE: discussion_mode changes behavior, not just output style.
 */

import type { IntentContext } from "./intentInterpreter";

// ── Gate Case Types ───────────────────────────────────────────────────────────

export type GateCase = "CASE_A" | "CASE_B" | "CASE_C" | "CASE_D";

export interface GatingDecision {
  case: GateCase;
  output_mode: "full_verdict" | "directional" | "low_confidence_directional" | "discussion_mode";
  allow_verdict: boolean;
  require_limitation_note: boolean;
  discussion_mode_active: boolean;
  reason: string;
  step3_behavior_override?: string;
}

// ── Evidence Thresholds ───────────────────────────────────────────────────────

const STRONG_EVIDENCE_THRESHOLD = 65;
const MEDIUM_EVIDENCE_THRESHOLD = 35;

// ── Main Gate Function ────────────────────────────────────────────────────────

export function evaluateRuntimeGate(
  intentCtx: IntentContext,
  evidenceScore: number,
  hasBlockingFields: boolean,
  missingBlockingCount: number,
): GatingDecision {
  // CASE_D: Discussion mode — always takes priority
  if (intentCtx.interaction_mode === "discussion") {
    return {
      case: "CASE_D",
      output_mode: "discussion_mode",
      allow_verdict: false,
      require_limitation_note: false,
      discussion_mode_active: true,
      reason: "INTERACTION_MODE=discussion: preserve thesis context, avoid full report regeneration",
      step3_behavior_override:
        "DISCUSSION_MODE_ACTIVE: Do NOT regenerate full analysis. Focus on challenging, extending, or explaining the existing thesis. Respond conversationally with targeted insights.",
    };
  }

  // CASE_B: Blocking fields present + strong evidence -> full verdict
  if (hasBlockingFields && evidenceScore >= STRONG_EVIDENCE_THRESHOLD) {
    return {
      case: "CASE_B",
      output_mode: "full_verdict",
      allow_verdict: true,
      require_limitation_note: false,
      discussion_mode_active: false,
      reason: `BLOCKING_PRESENT + STRONG_EVIDENCE(${evidenceScore}): full structured verdict authorized`,
    };
  }

  // CASE_A: Blocking fields present + medium evidence -> directional
  if (hasBlockingFields && evidenceScore >= MEDIUM_EVIDENCE_THRESHOLD) {
    return {
      case: "CASE_A",
      output_mode: "directional",
      allow_verdict: true,
      require_limitation_note: true,
      discussion_mode_active: false,
      reason: `BLOCKING_PRESENT + MEDIUM_EVIDENCE(${evidenceScore}): directional verdict with limitation note`,
      step3_behavior_override:
        "DIRECTIONAL_MODE: Provide directional judgment with explicit confidence caveats. Do NOT claim high certainty. Include limitation note.",
    };
  }

  // CASE_C: Blocking fields missing but minimal path available -> low-confidence directional
  if (missingBlockingCount > 0 && evidenceScore >= 10) {
    return {
      case: "CASE_C",
      output_mode: "low_confidence_directional",
      allow_verdict: true,  // Still allow verdict, but clearly low-confidence
      require_limitation_note: true,
      discussion_mode_active: false,
      reason: `BLOCKING_MISSING(${missingBlockingCount}) + PARTIAL_DATA(${evidenceScore}): low-confidence directional reasoning`,
      step3_behavior_override:
        "LOW_CONFIDENCE_MODE: Provide low-confidence directional reasoning. FORBIDDEN: 'cannot analyze' or 'insufficient data' as primary answer. State what IS known and what IS uncertain. Explicitly flag missing blocking fields.",
    };
  }

  // Default: treat as CASE_A (directional) for any other case
  return {
    case: "CASE_A",
    output_mode: "directional",
    allow_verdict: true,
    require_limitation_note: evidenceScore < MEDIUM_EVIDENCE_THRESHOLD,
    discussion_mode_active: false,
    reason: `DEFAULT_DIRECTIONAL(evidence=${evidenceScore})`,
  };
}

// ── Prompt Formatter ──────────────────────────────────────────────────────────

export function formatGatingDecisionForPrompt(decision: GatingDecision): string {
  const lines: string[] = [
    "[RUNTIME_GATE | LEVEL1A2]",
    `GATE_CASE: ${decision.case}`,
    `OUTPUT_MODE: ${decision.output_mode}`,
    `ALLOW_VERDICT: ${decision.allow_verdict}`,
    `REQUIRE_LIMITATION_NOTE: ${decision.require_limitation_note}`,
    `DISCUSSION_MODE: ${decision.discussion_mode_active}`,
    `REASON: ${decision.reason}`,
  ];

  if (decision.step3_behavior_override) {
    lines.push(`BEHAVIOR_OVERRIDE: ${decision.step3_behavior_override}`);
  }

  lines.push("[/RUNTIME_GATE]");
  return lines.join("\n");
}
