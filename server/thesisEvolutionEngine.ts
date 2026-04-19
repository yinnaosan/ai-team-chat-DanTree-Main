/**
 * thesisEvolutionEngine.ts
 * DANTREE_THESIS_STATE_TRACKING_C1
 *
 * Pure deterministic function — no DB, no network, no LLM, no side effects.
 * Computes conservative thesis evolution signal from two consecutive DecisionObjects.
 *
 * advisory_only: true — output is informational only, never gates or blocks pipeline.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type SignalStrength = "WEAK" | "MODERATE" | "STRONG" | "INSUFFICIENT_DATA";

export interface ThesisEvolutionOutput {
  signal_strength: SignalStrength;
  noise_indicator: boolean;
  confidence_delta: -2 | -1 | 0 | 1 | 2;
  inflection_evidence: string[];
  advisory_only: true;
}

// Confidence levels in ascending order
const CONFIDENCE_ORDER = ["LOW", "MEDIUM", "HIGH"] as const;
type ConfidenceLevel = typeof CONFIDENCE_ORDER[number];

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeStr(val: unknown): string | null {
  if (typeof val === "string" && val.trim().length > 0) return val.trim().toUpperCase();
  return null;
}

function confidenceDelta(prev: string | null, curr: string | null): -2 | -1 | 0 | 1 | 2 {
  const pi = CONFIDENCE_ORDER.indexOf(prev as ConfidenceLevel);
  const ci = CONFIDENCE_ORDER.indexOf(curr as ConfidenceLevel);
  if (pi === -1 || ci === -1) return 0;
  const delta = ci - pi;
  if (delta >= 2) return 2;
  if (delta === 1) return 1;
  if (delta === 0) return 0;
  if (delta === -1) return -1;
  return -2;
}

function isGatePass(saGateResult: unknown): boolean {
  if (!saGateResult || typeof saGateResult !== "object") return false;
  const g = saGateResult as Record<string, unknown>;
  const verdict = safeStr(g.verdict);
  return verdict === "PASS" || verdict === "FULL_PASS";
}

function isGateHardFail(saGateResult: unknown): boolean {
  if (!saGateResult || typeof saGateResult !== "object") return false;
  const g = saGateResult as Record<string, unknown>;
  const verdict = safeStr(g.verdict);
  return verdict === "HARD_FAIL";
}

function extractStance(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  return safeStr(o.stance);
}

function extractConfidence(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  return safeStr(o.confidence);
}

function extractQvlBucket(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if (o.qvl && typeof o.qvl === "object") {
    const q = o.qvl as Record<string, unknown>;
    return safeStr(q.size_bucket);
  }
  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * computeThesisEvolution
 *
 * @param prevDecisionObject  Previous analysis DecisionObject (unknown — may be null/undefined)
 * @param currDecisionObject  Current analysis DecisionObject (unknown — may be null/undefined)
 * @param saGateResult        SemanticGateResult from structured_analysis_gate (optional)
 * @param qvlSizeBucket       Optional QVL size bucket string for reinforcement only
 * @returns ThesisEvolutionOutput — always returns a valid object, never throws
 */
export function computeThesisEvolution(
  prevDecisionObject: unknown,
  currDecisionObject: unknown,
  saGateResult?: unknown,
  qvlSizeBucket?: string | null
): ThesisEvolutionOutput {
  const INSUFFICIENT: ThesisEvolutionOutput = {
    signal_strength: "INSUFFICIENT_DATA",
    noise_indicator: true,
    confidence_delta: 0,
    inflection_evidence: [],
    advisory_only: true,
  };

  // Rule 1: No prevDecisionObject → INSUFFICIENT_DATA
  if (!prevDecisionObject) return INSUFFICIENT;

  // Rule 2: SA gate HARD_FAIL → INSUFFICIENT_DATA
  if (isGateHardFail(saGateResult)) return INSUFFICIENT;

  // Rule 3: SA gate absent (undefined/null) → INSUFFICIENT_DATA
  // "absent" means saGateResult is nullish — not the same as SOFT_FAIL
  if (saGateResult === undefined || saGateResult === null) return INSUFFICIENT;

  // Extract fields
  const prevStance = extractStance(prevDecisionObject);
  const currStance = extractStance(currDecisionObject);
  const prevConf = extractConfidence(prevDecisionObject);
  const currConf = extractConfidence(currDecisionObject);
  const prevQvl = extractQvlBucket(prevDecisionObject);
  const currQvl = qvlSizeBucket ?? extractQvlBucket(currDecisionObject);

  const delta = confidenceDelta(prevConf, currConf);
  const stanceChanged = prevStance !== null && currStance !== null && prevStance !== currStance;
  const confShifted1 = Math.abs(delta) === 1;
  const confShifted2 = Math.abs(delta) === 2;
  const qvlChanged = prevQvl !== null && currQvl !== null && prevQvl !== currQvl;

  // Build inflection_evidence (server-only, not rendered in UI)
  const inflection: string[] = [];
  if (stanceChanged) inflection.push(`stance: ${prevStance}→${currStance}`);
  if (delta !== 0) inflection.push(`confidence: ${prevConf}→${currConf} (delta=${delta})`);
  if (qvlChanged) inflection.push(`qvl_bucket: ${prevQvl}→${currQvl}`);

  const gatePass = isGatePass(saGateResult);

  // Signal strength rules (conservative gate):
  // STRONG requires SA gate PASS or FULL_PASS
  let signal: SignalStrength = "WEAK";

  if (stanceChanged) {
    // Stance reversal: STRONG only if gate PASS, else INSUFFICIENT_DATA
    if (!gatePass) return INSUFFICIENT;
    signal = "STRONG";
  } else if (confShifted2) {
    // 2-step confidence move: STRONG only if gate PASS, else MODERATE
    signal = gatePass ? "STRONG" : "MODERATE";
  } else if (confShifted1 || qvlChanged) {
    // 1-step confidence OR QVL bucket change: MODERATE (QVL reinforces at most MODERATE)
    signal = "MODERATE";
  } else {
    // Nothing changed: WEAK
    signal = "WEAK";
  }

  // At this point signal is always WEAK | MODERATE | STRONG (INSUFFICIENT_DATA paths all returned above)
  const noise_indicator = signal === "WEAK";

  return {
    signal_strength: signal,
    noise_indicator,
    confidence_delta: delta,
    inflection_evidence: inflection,
    advisory_only: true,
  };
}
