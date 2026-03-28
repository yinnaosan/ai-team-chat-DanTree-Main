/**
 * DANTREE LEVEL7 — Phase 1+2
 * Portfolio State / Holding Abstraction + Multi-Signal Decision Fusion
 *
 * ADVISORY ONLY — no auto-trade, no order generation.
 * All outputs are informational and must be reviewed by a human.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1: Portfolio State & Holding Abstraction
// ─────────────────────────────────────────────────────────────────────────────

export type HoldingStatus = "active" | "watch" | "exited" | "pending";
export type SectorLabel = string; // e.g. "Technology", "Financials", "Energy"
export type ThemeLabel = string;  // e.g. "AI", "Rate-Sensitive", "Commodity"

export interface Holding {
  ticker: string;
  sector: SectorLabel;
  themes: ThemeLabel[];
  weight_pct: number;          // current portfolio weight 0-100
  cost_basis_usd?: number;     // optional — for P&L context only
  current_price_usd?: number;  // optional — for sizing context
  status: HoldingStatus;
  added_at_ms: number;
  last_reviewed_at_ms?: number;
  notes?: string;
}

export interface PortfolioState {
  portfolio_id: string;
  holdings: Holding[];
  cash_reserve_pct: number;    // 0-100, floor enforced by risk budget
  total_positions: number;
  created_at_ms: number;
  updated_at_ms: number;
}

export function createPortfolioState(
  portfolio_id: string,
  holdings: Holding[],
  cash_reserve_pct: number
): PortfolioState {
  const now = Date.now();
  return {
    portfolio_id,
    holdings,
    cash_reserve_pct: Math.max(0, Math.min(100, cash_reserve_pct)),
    total_positions: holdings.filter(h => h.status === "active").length,
    created_at_ms: now,
    updated_at_ms: now,
  };
}

export function getActiveHoldings(state: PortfolioState): Holding[] {
  return state.holdings.filter(h => h.status === "active");
}

export function getHoldingByTicker(
  state: PortfolioState,
  ticker: string
): Holding | undefined {
  return state.holdings.find(h => h.ticker === ticker);
}

export function getSectorWeights(state: PortfolioState): Record<SectorLabel, number> {
  const weights: Record<string, number> = {};
  for (const h of getActiveHoldings(state)) {
    weights[h.sector] = (weights[h.sector] ?? 0) + h.weight_pct;
  }
  return weights;
}

export function getThemeWeights(state: PortfolioState): Record<ThemeLabel, number> {
  const weights: Record<string, number> = {};
  for (const h of getActiveHoldings(state)) {
    for (const theme of h.themes) {
      weights[theme] = (weights[theme] ?? 0) + h.weight_pct;
    }
  }
  return weights;
}

export function getTotalAllocatedPct(state: PortfolioState): number {
  return getActiveHoldings(state).reduce((sum, h) => sum + h.weight_pct, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2: Multi-Signal Decision Fusion
// ─────────────────────────────────────────────────────────────────────────────

export type DecisionBias =
  | "strong_buy"
  | "buy"
  | "hold"
  | "reduce"
  | "avoid"
  | "recheck"
  | "monitor";

export type FusionConfidence = "high" | "medium" | "low" | "insufficient";

export interface SignalInput {
  ticker: string;
  // From LEVEL6 Alpha Surface
  alpha_score?: number;          // 0-1, discounted risk-adjusted score
  alpha_tier?: "A" | "B" | "C" | "none";
  sample_count?: number;         // number of resolved outcomes
  // From LEVEL4 Trigger Engine
  trigger_fired?: boolean;
  trigger_type?: string;
  trigger_severity?: "low" | "medium" | "high" | "critical";
  // From LEVEL3 Memory / Learning
  failure_intensity?: number;    // 0-1
  success_strength?: number;     // 0-1
  memory_contradiction?: boolean;
  // From LEVEL5 Market Snapshot
  risk_score?: number;           // 0-1
  price_change_pct?: number;
  // From LEVEL6 Regime
  regime_relevance?: number;     // 0-1, how well signal fits current regime
  source_quality?: number;       // 0-1, data source quality
  signal_freshness_ms?: number;  // age of signal in ms
}

export interface FusionDecision {
  ticker: string;
  decision_bias: DecisionBias;
  fusion_score: number;          // 0-1 composite
  fusion_confidence: FusionConfidence;
  alpha_contribution: number;    // 0-1
  risk_contribution: number;     // 0-1
  trigger_contribution: number;  // 0-1
  memory_contribution: number;   // 0-1
  danger_score: number;          // 0-1 (high = risky/avoid)
  sample_confidence_penalty: number; // 0-1 penalty for low samples
  regime_adjustment: number;     // -0.2 to +0.2
  advisory_only: true;
  fused_at_ms: number;
}

const SIGNAL_FRESHNESS_DECAY_MS = 24 * 60 * 60 * 1000; // 24h

function computeFreshnessMultiplier(signal_freshness_ms?: number): number {
  if (signal_freshness_ms === undefined) return 0.8; // unknown age → mild penalty
  const age = signal_freshness_ms;
  if (age <= SIGNAL_FRESHNESS_DECAY_MS) return 1.0;
  if (age <= 3 * SIGNAL_FRESHNESS_DECAY_MS) return 0.8;
  if (age <= 7 * SIGNAL_FRESHNESS_DECAY_MS) return 0.6;
  return 0.4;
}

function computeSampleConfidencePenalty(sample_count?: number): number {
  if (sample_count === undefined || sample_count === 0) return 0.5;
  if (sample_count < 5) return 0.3;
  if (sample_count < 10) return 0.15;
  if (sample_count < 20) return 0.05;
  return 0;
}

function computeFusionConfidence(
  score: number,
  penalty: number,
  sample_count?: number
): FusionConfidence {
  if ((sample_count ?? 0) < 3) return "insufficient";
  const effective = score - penalty;
  if (effective >= 0.65) return "high";
  if (effective >= 0.45) return "medium";
  if (effective >= 0.25) return "low";
  return "insufficient";
}

function computeDecisionBias(
  fusion_score: number,
  danger_score: number,
  memory_contradiction: boolean,
  trigger_severity?: string
): DecisionBias {
  // Contradiction → always recheck
  if (memory_contradiction) return "recheck";

  // Critical trigger → avoid
  if (trigger_severity === "critical") return "avoid";

  // High danger → reduce or avoid
  if (danger_score >= 0.75) return "avoid";
  if (danger_score >= 0.55) return "reduce";

  // Fusion score drives opportunity bias
  if (fusion_score >= 0.75) return "strong_buy";
  if (fusion_score >= 0.55) return "buy";
  if (fusion_score >= 0.40) return "hold";
  if (fusion_score >= 0.25) return "monitor";
  return "reduce";
}

export function fuseSignals(signal: SignalInput): FusionDecision {
  const now = Date.now();

  // Alpha contribution (LEVEL6)
  const alpha_raw = signal.alpha_score ?? 0;
  const alpha_contribution = Math.min(1, alpha_raw);

  // Risk contribution (LEVEL5 snapshot + LEVEL3 failure)
  const risk_raw = signal.risk_score ?? 0;
  const failure_raw = signal.failure_intensity ?? 0;
  const risk_contribution = Math.min(1, (risk_raw * 0.5) + (failure_raw * 0.5));

  // Trigger contribution (LEVEL4)
  const trigger_map: Record<string, number> = {
    critical: 0.9, high: 0.7, medium: 0.4, low: 0.2,
  };
  const trigger_contribution = signal.trigger_fired
    ? (trigger_map[signal.trigger_severity ?? "low"] ?? 0.2)
    : 0;

  // Memory contribution (LEVEL3)
  const success_raw = signal.success_strength ?? 0;
  const memory_contribution = Math.min(1, success_raw);

  // Danger score: weighted risk + failure + critical trigger
  const danger_score = Math.min(1,
    risk_contribution * 0.4 +
    failure_raw * 0.4 +
    (signal.trigger_severity === "critical" ? 0.2 : 0)
  );

  // Freshness multiplier
  const freshness = computeFreshnessMultiplier(signal.signal_freshness_ms);

  // Regime adjustment (-0.2 to +0.2)
  const regime_adjustment = ((signal.regime_relevance ?? 0.5) - 0.5) * 0.4;

  // Sample confidence penalty
  const sample_confidence_penalty = computeSampleConfidencePenalty(signal.sample_count);

  // Source quality multiplier
  const source_quality = signal.source_quality ?? 0.7;

  // Composite fusion score
  const raw_fusion =
    alpha_contribution * 0.35 +
    memory_contribution * 0.25 +
    trigger_contribution * 0.20 +
    (1 - risk_contribution) * 0.20; // inverse risk → opportunity

  const fusion_score = Math.max(0, Math.min(1,
    (raw_fusion + regime_adjustment) * freshness * source_quality - sample_confidence_penalty
  ));

  const fusion_confidence = computeFusionConfidence(
    fusion_score,
    sample_confidence_penalty,
    signal.sample_count
  );

  const decision_bias = computeDecisionBias(
    fusion_score,
    danger_score,
    signal.memory_contradiction ?? false,
    signal.trigger_severity
  );

  return {
    ticker: signal.ticker,
    decision_bias,
    fusion_score,
    fusion_confidence,
    alpha_contribution,
    risk_contribution,
    trigger_contribution,
    memory_contribution,
    danger_score,
    sample_confidence_penalty,
    regime_adjustment,
    advisory_only: true,
    fused_at_ms: now,
  };
}

export function fuseMultipleSignals(signals: SignalInput[]): FusionDecision[] {
  return signals.map(fuseSignals);
}
