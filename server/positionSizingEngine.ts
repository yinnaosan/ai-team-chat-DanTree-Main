/**
 * DANTREE LEVEL7 — Phase 3+4
 * Position Sizing Engine + Risk Budget & Concentration Control
 *
 * ADVISORY ONLY — no auto-trade, no order generation.
 * All outputs are informational and must be reviewed by a human.
 */

import type { FusionDecision, PortfolioState, SectorLabel, ThemeLabel } from "./portfolioState";
import { getActiveHoldings, getSectorWeights, getThemeWeights, getTotalAllocatedPct } from "./portfolioState";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3: Position Sizing Engine
// ─────────────────────────────────────────────────────────────────────────────

export type SizingBucket = "large" | "medium" | "small" | "minimal" | "none";

export interface SizingConfig {
  max_single_position_pct: number;   // default 10
  large_bucket_pct: number;          // default 8
  medium_bucket_pct: number;         // default 5
  small_bucket_pct: number;          // default 3
  minimal_bucket_pct: number;        // default 1
  min_sample_for_medium: number;     // default 10
  min_sample_for_large: number;      // default 20
  cash_reserve_floor_pct: number;    // default 10
}

export const DEFAULT_SIZING_CONFIG: SizingConfig = {
  max_single_position_pct: 10,
  large_bucket_pct: 8,
  medium_bucket_pct: 5,
  small_bucket_pct: 3,
  minimal_bucket_pct: 1,
  min_sample_for_medium: 10,
  min_sample_for_large: 20,
  cash_reserve_floor_pct: 10,
};

export interface SizingResult {
  ticker: string;
  suggested_allocation_pct: number;
  sizing_bucket: SizingBucket;
  sizing_reason: string;
  capped_by: string[];              // list of reasons that capped the size
  advisory_only: true;
}

function bucketFromFusionScore(
  fusion_score: number,
  sample_count: number,
  config: SizingConfig
): { bucket: SizingBucket; base_pct: number } {
  // Sample guard: insufficient samples → cap at small/minimal
  if (sample_count < 3) {
    return { bucket: "minimal", base_pct: config.minimal_bucket_pct };
  }

  if (fusion_score >= 0.70) {
    if (sample_count >= config.min_sample_for_large) {
      return { bucket: "large", base_pct: config.large_bucket_pct };
    }
    if (sample_count >= config.min_sample_for_medium) {
      return { bucket: "medium", base_pct: config.medium_bucket_pct };
    }
    return { bucket: "small", base_pct: config.small_bucket_pct };
  }

  if (fusion_score >= 0.50) {
    if (sample_count >= config.min_sample_for_medium) {
      return { bucket: "medium", base_pct: config.medium_bucket_pct };
    }
    return { bucket: "small", base_pct: config.small_bucket_pct };
  }

  if (fusion_score >= 0.30) {
    return { bucket: "small", base_pct: config.small_bucket_pct };
  }

  return { bucket: "minimal", base_pct: config.minimal_bucket_pct };
}

export function computePositionSize(
  decision: FusionDecision,
  sample_count: number,
  portfolio: PortfolioState,
  config: SizingConfig = DEFAULT_SIZING_CONFIG
): SizingResult {
  const capped_by: string[] = [];

  // Danger guard: high danger → none or minimal
  if (decision.danger_score >= 0.75) {
    return {
      ticker: decision.ticker,
      suggested_allocation_pct: 0,
      sizing_bucket: "none",
      sizing_reason: "High danger score suppresses all sizing",
      capped_by: ["danger_score_critical"],
      advisory_only: true,
    };
  }

  // Decision bias guard
  if (decision.decision_bias === "avoid") {
    return {
      ticker: decision.ticker,
      suggested_allocation_pct: 0,
      sizing_bucket: "none",
      sizing_reason: "Decision bias is avoid — no allocation suggested",
      capped_by: ["decision_bias_avoid"],
      advisory_only: true,
    };
  }

  // Base bucket from fusion score
  const { bucket, base_pct } = bucketFromFusionScore(
    decision.fusion_score,
    sample_count,
    config
  );

  let allocation = base_pct;

  // Cap by danger score (partial suppression)
  if (decision.danger_score >= 0.55) {
    allocation = Math.min(allocation, config.small_bucket_pct);
    capped_by.push("danger_score_high");
  }

  // Cap by fusion confidence
  if (decision.fusion_confidence === "insufficient") {
    allocation = Math.min(allocation, config.minimal_bucket_pct);
    capped_by.push("fusion_confidence_insufficient");
  } else if (decision.fusion_confidence === "low") {
    allocation = Math.min(allocation, config.small_bucket_pct);
    capped_by.push("fusion_confidence_low");
  }

  // Cap by max single position
  if (allocation > config.max_single_position_pct) {
    allocation = config.max_single_position_pct;
    capped_by.push("max_single_position_cap");
  }

  // Cash reserve floor check
  const total_allocated = getTotalAllocatedPct(portfolio);
  const available = 100 - total_allocated - config.cash_reserve_floor_pct;
  if (available <= 0) {
    return {
      ticker: decision.ticker,
      suggested_allocation_pct: 0,
      sizing_bucket: "none",
      sizing_reason: "No available allocation — cash reserve floor reached",
      capped_by: ["cash_reserve_floor"],
      advisory_only: true,
    };
  }
  if (allocation > available) {
    allocation = Math.max(0, available);
    capped_by.push("cash_reserve_floor_partial");
  }

  const final_bucket: SizingBucket =
    allocation === 0 ? "none" :
    allocation <= config.minimal_bucket_pct ? "minimal" :
    allocation <= config.small_bucket_pct ? "small" :
    allocation <= config.medium_bucket_pct ? "medium" : "large";

  const sizing_reason =
    capped_by.length > 0
      ? `Base bucket: ${bucket} (${base_pct}%), capped to ${allocation.toFixed(1)}% by: ${capped_by.join(", ")}`
      : `Base bucket: ${bucket} — fusion score ${decision.fusion_score.toFixed(2)}, ${sample_count} samples`;

  return {
    ticker: decision.ticker,
    suggested_allocation_pct: Math.round(allocation * 10) / 10,
    sizing_bucket: final_bucket,
    sizing_reason,
    capped_by,
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4: Risk Budget & Concentration Control
// ─────────────────────────────────────────────────────────────────────────────

export type RiskBudgetStatus = "healthy" | "stretched" | "concentrated" | "critical";

export interface ConcentrationWarning {
  dimension: "sector" | "theme" | "thesis_cluster" | "danger_count" | "cash";
  label: string;
  current_pct: number;
  threshold_pct: number;
  severity: "warn" | "critical";
}

export interface ThesisCluster {
  cluster_id: string;
  tickers: string[];
  shared_themes: ThemeLabel[];
  total_weight_pct: number;
}

export interface RiskBudgetReport {
  portfolio_id: string;
  high_risk_exposure_pct: number;
  sector_concentration: Array<{ sector: SectorLabel; weight_pct: number }>;
  theme_concentration: Array<{ theme: ThemeLabel; weight_pct: number }>;
  duplicated_thesis_clusters: ThesisCluster[];
  risk_budget_status: RiskBudgetStatus;
  top_concentration_warnings: ConcentrationWarning[];
  advisory_only: true;
}

export interface RiskBudgetConfig {
  max_sector_pct: number;       // default 35
  max_theme_pct: number;        // default 30
  max_cluster_pct: number;      // default 25
  max_danger_candidates: number; // default 3
  cash_reserve_floor_pct: number; // default 10
}

export const DEFAULT_RISK_BUDGET_CONFIG: RiskBudgetConfig = {
  max_sector_pct: 35,
  max_theme_pct: 30,
  max_cluster_pct: 25,
  max_danger_candidates: 3,
  cash_reserve_floor_pct: 10,
};

function detectThesisClusters(
  portfolio: PortfolioState
): ThesisCluster[] {
  const active = getActiveHoldings(portfolio);
  const clusters: ThesisCluster[] = [];
  const visited = new Set<string>();

  for (let i = 0; i < active.length; i++) {
    if (visited.has(active[i].ticker)) continue;
    const group: typeof active = [active[i]];
    const shared_themes = new Set(active[i].themes);

    for (let j = i + 1; j < active.length; j++) {
      if (visited.has(active[j].ticker)) continue;
      const overlap = active[j].themes.filter(t => shared_themes.has(t));
      if (overlap.length >= 2) {
        group.push(active[j]);
        visited.add(active[j].ticker);
        overlap.forEach(t => shared_themes.add(t));
      }
    }

    if (group.length >= 2) {
      visited.add(active[i].ticker);
      clusters.push({
        cluster_id: `cluster_${clusters.length + 1}`,
        tickers: group.map(h => h.ticker),
        shared_themes: Array.from(shared_themes),
        total_weight_pct: group.reduce((s, h) => s + h.weight_pct, 0),
      });
    }
  }

  return clusters;
}

export function evaluateRiskBudget(
  portfolio: PortfolioState,
  danger_decisions: FusionDecision[],
  config: RiskBudgetConfig = DEFAULT_RISK_BUDGET_CONFIG
): RiskBudgetReport {
  const warnings: ConcentrationWarning[] = [];

  // Sector concentration
  const sector_weights = getSectorWeights(portfolio);
  const sector_concentration = Object.entries(sector_weights)
    .map(([sector, weight_pct]) => ({ sector, weight_pct }))
    .sort((a, b) => b.weight_pct - a.weight_pct);

  for (const { sector, weight_pct } of sector_concentration) {
    if (weight_pct >= config.max_sector_pct) {
      warnings.push({
        dimension: "sector",
        label: sector,
        current_pct: weight_pct,
        threshold_pct: config.max_sector_pct,
        severity: weight_pct >= config.max_sector_pct * 1.2 ? "critical" : "warn",
      });
    }
  }

  // Theme concentration
  const theme_weights = getThemeWeights(portfolio);
  const theme_concentration = Object.entries(theme_weights)
    .map(([theme, weight_pct]) => ({ theme, weight_pct }))
    .sort((a, b) => b.weight_pct - a.weight_pct);

  for (const { theme, weight_pct } of theme_concentration) {
    if (weight_pct >= config.max_theme_pct) {
      warnings.push({
        dimension: "theme",
        label: theme,
        current_pct: weight_pct,
        threshold_pct: config.max_theme_pct,
        severity: weight_pct >= config.max_theme_pct * 1.2 ? "critical" : "warn",
      });
    }
  }

  // Thesis cluster detection
  const clusters = detectThesisClusters(portfolio);
  for (const cluster of clusters) {
    if (cluster.total_weight_pct >= config.max_cluster_pct) {
      warnings.push({
        dimension: "thesis_cluster",
        label: `Cluster: ${cluster.tickers.join("+")}`,
        current_pct: cluster.total_weight_pct,
        threshold_pct: config.max_cluster_pct,
        severity: cluster.total_weight_pct >= config.max_cluster_pct * 1.3 ? "critical" : "warn",
      });
    }
  }

  // High danger candidate count
  const high_danger = danger_decisions.filter(d => d.danger_score >= 0.55);
  if (high_danger.length > config.max_danger_candidates) {
    warnings.push({
      dimension: "danger_count",
      label: `${high_danger.length} high-danger candidates`,
      current_pct: high_danger.length,
      threshold_pct: config.max_danger_candidates,
      severity: "warn",
    });
  }

  // Cash reserve check
  const total_allocated = getTotalAllocatedPct(portfolio);
  const cash_pct = 100 - total_allocated;
  if (cash_pct < config.cash_reserve_floor_pct) {
    warnings.push({
      dimension: "cash",
      label: "Cash reserve below floor",
      current_pct: cash_pct,
      threshold_pct: config.cash_reserve_floor_pct,
      severity: "critical",
    });
  }

  // High risk exposure (active holdings with weight in high-danger sectors)
  const high_risk_exposure_pct = getActiveHoldings(portfolio)
    .filter(h => danger_decisions.some(d => d.ticker === h.ticker && d.danger_score >= 0.55))
    .reduce((s, h) => s + h.weight_pct, 0);

  // Risk budget status
  const critical_count = warnings.filter(w => w.severity === "critical").length;
  const warn_count = warnings.filter(w => w.severity === "warn").length;

  const risk_budget_status: RiskBudgetStatus =
    critical_count >= 2 ? "critical" :
    critical_count >= 1 ? "concentrated" :
    warn_count >= 2 ? "stretched" : "healthy";

  return {
    portfolio_id: portfolio.portfolio_id,
    high_risk_exposure_pct,
    sector_concentration,
    theme_concentration,
    duplicated_thesis_clusters: clusters,
    risk_budget_status,
    top_concentration_warnings: warnings.slice(0, 5),
    advisory_only: true,
  };
}

/**
 * Apply concentration penalty to sizing result.
 * Returns a concentration_penalty (0-0.5) to subtract from fusion score during ranking.
 */
export function computeConcentrationPenalty(
  ticker: string,
  portfolio: PortfolioState,
  risk_budget: RiskBudgetReport
): number {
  const holding = getActiveHoldings(portfolio).find(h => h.ticker === ticker);
  if (!holding) return 0;

  let penalty = 0;

  // Sector over-concentration
  for (const w of risk_budget.sector_concentration) {
    if (w.sector === holding.sector && w.weight_pct >= 35) {
      penalty += w.weight_pct >= 42 ? 0.2 : 0.1;
    }
  }

  // Theme over-concentration
  for (const w of risk_budget.theme_concentration) {
    if (holding.themes.includes(w.theme) && w.weight_pct >= 30) {
      penalty += w.weight_pct >= 36 ? 0.15 : 0.08;
    }
  }

  // Thesis cluster membership
  for (const cluster of risk_budget.duplicated_thesis_clusters) {
    if (cluster.tickers.includes(ticker) && cluster.total_weight_pct >= 25) {
      penalty += 0.1;
    }
  }

  return Math.min(0.5, penalty);
}
