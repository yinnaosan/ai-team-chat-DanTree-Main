/**
 * ============================================================
 * QVL BRIDGE — Lightweight Deterministic Position Sizing
 * ============================================================
 *
 * Move 1: First deterministic lightweight QVL sizing output.
 *
 * DESIGN CONSTRAINTS:
 * - No LLM calls
 * - No external API calls
 * - Deterministic from provided inputs
 * - advisory_only: true — ALWAYS, hard-coded
 * - Additive to main pipeline — does NOT touch deep research fields
 * - Does NOT replace level105PositionLayer or deepResearchEngine
 *
 * WHAT IS MISSING (deferred to later QVL moves):
 * - payoutMap (asymmetry_ratio) — requires price targets
 * - businessContext (moat, eligibility) — deepResearchEngine only
 * - gradientRisk (risk_state) — requires cross-session history
 * - Reverse DCF engine — next QVL move
 */

import type { StanceDirection, ConfidenceLevel, InvalidationCondition, SnapshotStability } from "./outputAdapter";

// ── Types ─────────────────────────────────────────────────────────────────────

export type LightweightSizeBucket = "none" | "starter" | "small" | "medium" | "large";

export interface LightweightQvlContext {
  stance: StanceDirection;
  confidence: ConfidenceLevel;
  invalidation_conditions: InvalidationCondition[];
  stability?: SnapshotStability;
  confidence_summary?: string; // rationale only — no sizing logic
}

export interface LightweightQvlOutput {
  size_bucket: LightweightSizeBucket;
  target_pct_range: string;
  rationale: string;
  advisory_only: true;
  simplified_estimate_note: string;
  _inputs: {
    stance: StanceDirection;
    confidence: ConfidenceLevel;
    high_risk_count: number;
    stability: SnapshotStability | "unknown";
  };
}

// ── Bucket metadata ───────────────────────────────────────────────────────────

const BUCKET_RANGE: Record<LightweightSizeBucket, string> = {
  none:    "0%",
  starter: "1-2%",
  small:   "3-5%",
  medium:  "6-8%",
  large:   "9-12%",
};

// ── Step-down helper ──────────────────────────────────────────────────────────

const BUCKET_ORDER: LightweightSizeBucket[] = ["none", "starter", "small", "medium", "large"];

function stepDown(bucket: LightweightSizeBucket): LightweightSizeBucket {
  const idx = BUCKET_ORDER.indexOf(bucket);
  return idx <= 0 ? "none" : BUCKET_ORDER[idx - 1];
}

// ── Base bucket from stance × confidence ─────────────────────────────────────

function getBaseBucket(stance: StanceDirection, confidence: ConfidenceLevel): LightweightSizeBucket {
  if (stance === "BEARISH" || stance === "UNCERTAIN") return "none";
  if (stance === "NEUTRAL") return "starter";
  // BULLISH
  if (confidence === "HIGH")   return "medium";
  if (confidence === "MEDIUM") return "small";
  return "starter"; // LOW
}

// ── Main engine ───────────────────────────────────────────────────────────────

export function computeLightweightPositionSizing(ctx: LightweightQvlContext): LightweightQvlOutput {
  const { stance, confidence, invalidation_conditions, stability = "unknown" } = ctx;

  // 1. Base bucket
  let bucket = getBaseBucket(stance, confidence);

  const rationaleSteps: string[] = [
    `stance=${stance} confidence=${confidence} → base_bucket=${bucket}`,
  ];

  // 2. Downward modifier: ≥3 HIGH-probability invalidation conditions
  const highRiskCount = invalidation_conditions.filter(c => c.probability === "HIGH").length;
  if (highRiskCount >= 3 && bucket !== "none") {
    const before = bucket;
    bucket = stepDown(bucket);
    rationaleSteps.push(`high_risk_count=${highRiskCount} (≥3) → step_down: ${before}→${bucket}`);
  } else {
    rationaleSteps.push(`high_risk_count=${highRiskCount} (no step_down)`);
  }

  // 3. Downward modifier: stability = REVERSED
  if (stability === "REVERSED" && bucket !== "none") {
    const before = bucket;
    bucket = stepDown(bucket);
    rationaleSteps.push(`stability=REVERSED → step_down: ${before}→${bucket}`);
  } else {
    rationaleSteps.push(`stability=${stability} (no step_down)`);
  }

  rationaleSteps.push("NOTE: simplified estimate — no price targets, business quality, or payout ratio used.");

  const simplified_estimate_note = "Simplified sizing estimate — not calibrated to price targets or business quality";

  return {
    size_bucket: bucket,
    target_pct_range: BUCKET_RANGE[bucket],
    rationale: rationaleSteps.join(" | "),
    advisory_only: true,
    simplified_estimate_note,
    _inputs: {
      stance,
      confidence,
      high_risk_count: highRiskCount,
      stability,
    },
  };
}
