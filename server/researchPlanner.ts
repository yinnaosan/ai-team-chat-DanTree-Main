/**
 * researchPlanner.ts
 * LEVEL1A_PHASE_2 — Research Planner
 *
 * OBJECTIVE: Generate structured research plan (dimensions, hypotheses, paths)
 * from IntentContext BEFORE data fetch. Downstream field requirements and
 * agent reasoning are driven by this plan.
 *
 * DESIGN PRINCIPLE: Zero new LLM calls — deterministic template-based planning
 * enriched by Step1 hypotheses when available.
 */

import type { IntentContext } from "./intentInterpreter";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ResearchHypothesis {
  id: string;
  statement: string;
  required_fields: string[];
  priority: "high" | "medium" | "low";
}

export interface ResearchPlan {
  research_dimensions: string[];
  hypotheses: ResearchHypothesis[];
  blocking_fields: string[];
  important_fields: string[];
  optional_fields: string[];
  primary_path: string[];
  fallback_path: string[];
  minimal_path: string[];
}

// ── Default templates by task_type ───────────────────────────────────────────

const PLAN_TEMPLATES: Record<string, ResearchPlan> = {
  stock_analysis: {
    research_dimensions: ["valuation", "business_quality", "growth", "risk", "market_context"],
    hypotheses: [
      { id: "h1", statement: "current valuation may exceed growth support", required_fields: ["price.current", "valuation.pe", "revenue_growth"], priority: "high" },
      { id: "h2", statement: "business quality may justify partial premium", required_fields: ["roe", "roic", "free_cash_flow"], priority: "high" },
      { id: "h3", statement: "macro rates may pressure multiples", required_fields: ["macro.rate_context", "valuation.pe"], priority: "medium" },
    ],
    blocking_fields: ["price.current", "valuation.pe"],
    important_fields: ["revenue", "net_income", "free_cash_flow", "market_cap", "roe", "roic"],
    optional_fields: ["analyst.target_price", "analyst.recommendation", "sentiment.signal", "macro.rate_context", "peer.comparison"],
    primary_path: ["price", "valuation", "financials", "risk", "market_context"],
    fallback_path: ["price", "valuation", "financials", "risk"],
    minimal_path: ["price.current", "valuation.pe"],
  },
  macro_analysis: {
    research_dimensions: ["macro_trend", "policy_context", "cross_asset_impact", "risk"],
    hypotheses: [
      { id: "h1", statement: "current macro regime may shift asset allocation", required_fields: ["macro.primary_series", "macro.trend"], priority: "high" },
      { id: "h2", statement: "policy direction may diverge from market pricing", required_fields: ["macro.policy_rate", "macro.inflation"], priority: "high" },
    ],
    blocking_fields: ["macro.primary_series", "macro.current_level"],
    important_fields: ["macro.trend", "macro.cross_asset_impact", "macro.policy_rate", "macro.inflation"],
    optional_fields: ["sentiment.signal", "policy_context", "geopolitical_risk"],
    primary_path: ["macro_data", "policy_context", "cross_asset", "risk"],
    fallback_path: ["macro_data", "policy_context", "risk"],
    minimal_path: ["macro.primary_series", "macro.current_level"],
  },
  crypto_analysis: {
    research_dimensions: ["price_action", "onchain_metrics", "market_sentiment", "risk"],
    hypotheses: [
      { id: "h1", statement: "current price may diverge from onchain fundamentals", required_fields: ["price.current", "market_cap", "onchain_signal"], priority: "high" },
    ],
    blocking_fields: ["price.current", "market_cap"],
    important_fields: ["volume", "onchain_or_exchange_signal_if_available", "sentiment.signal"],
    optional_fields: ["macro.rate_context", "defi_metrics", "whale_activity"],
    primary_path: ["price", "onchain", "sentiment", "risk"],
    fallback_path: ["price", "sentiment", "risk"],
    minimal_path: ["price.current", "market_cap"],
  },
  portfolio_review: {
    research_dimensions: ["allocation", "risk_exposure", "performance_attribution", "rebalancing"],
    hypotheses: [
      { id: "h1", statement: "current allocation may be misaligned with risk tolerance", required_fields: ["portfolio.weights", "portfolio.volatility"], priority: "high" },
    ],
    blocking_fields: ["portfolio.weights", "portfolio.returns"],
    important_fields: ["portfolio.volatility", "portfolio.sharpe", "portfolio.drawdown", "macro.rate_context"],
    optional_fields: ["peer.benchmark_comparison", "factor_exposure"],
    primary_path: ["allocation", "risk", "performance", "rebalancing"],
    fallback_path: ["allocation", "risk", "performance"],
    minimal_path: ["portfolio.weights", "portfolio.returns"],
  },
  event_driven: {
    research_dimensions: ["event_impact", "business_quality", "risk", "market_reaction"],
    hypotheses: [
      { id: "h1", statement: "event may materially change fundamental outlook", required_fields: ["event.description", "revenue", "net_income"], priority: "high" },
    ],
    blocking_fields: ["event.description", "price.current"],
    important_fields: ["revenue", "net_income", "analyst.reaction", "sentiment.signal"],
    optional_fields: ["peer.comparison", "historical_event_analogs"],
    primary_path: ["event", "financials", "sentiment", "risk"],
    fallback_path: ["event", "financials", "risk"],
    minimal_path: ["event.description", "price.current"],
  },
  discussion: {
    research_dimensions: ["thesis_exploration", "counterarguments", "uncertainty"],
    hypotheses: [
      { id: "h1", statement: "user thesis may have unexplored counterarguments", required_fields: [], priority: "medium" },
    ],
    blocking_fields: [],
    important_fields: [],
    optional_fields: [],
    primary_path: ["thesis", "counterarguments", "uncertainty"],
    fallback_path: ["thesis", "uncertainty"],
    minimal_path: ["thesis"],
  },
  general: {
    research_dimensions: ["business_quality", "risk", "market_context"],
    hypotheses: [
      { id: "h1", statement: "general analysis may reveal key risk or opportunity", required_fields: ["price.current"], priority: "medium" },
    ],
    blocking_fields: ["price.current"],
    important_fields: ["revenue", "net_income"],
    optional_fields: ["sentiment.signal", "macro.rate_context"],
    primary_path: ["financials", "risk", "market_context"],
    fallback_path: ["financials", "risk"],
    minimal_path: ["price.current"],
  },
};

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * buildResearchPlan
 *
 * Generates a ResearchPlan from IntentContext and optional Step1 hypotheses.
 * Enriches template with intent-specific adjustments (risk_focus, growth_focus,
 * comparison_needed) without adding LLM calls.
 *
 * @param intent  Normalized IntentContext from Phase1
 * @param step1Hypotheses  Optional hypotheses array from Step1 RESOURCE_SPEC
 */
export function buildResearchPlan(
  intent: IntentContext,
  step1Hypotheses?: Array<{ id: string; statement: string; required_fields?: string[]; priority?: string }>,
): ResearchPlan {
  const template = PLAN_TEMPLATES[intent.task_type] ?? PLAN_TEMPLATES.general;

  // Deep clone to avoid mutation
  const plan: ResearchPlan = JSON.parse(JSON.stringify(template));

  // Enrich dimensions based on intent flags
  if (intent.risk_focus && !plan.research_dimensions.includes("risk")) {
    plan.research_dimensions.unshift("risk");
  }
  if (intent.growth_focus && !plan.research_dimensions.includes("growth")) {
    plan.research_dimensions.splice(1, 0, "growth");
  }
  if (intent.comparison_needed && !plan.research_dimensions.includes("peer_comparison")) {
    plan.research_dimensions.push("peer_comparison");
    if (!plan.optional_fields.includes("peer.comparison")) {
      plan.optional_fields.push("peer.comparison");
    }
  }

  // Merge Step1 hypotheses (deduplicate by id)
  if (step1Hypotheses && step1Hypotheses.length > 0) {
    const existingIds = new Set(plan.hypotheses.map(h => h.id));
    for (const h of step1Hypotheses) {
      if (!existingIds.has(h.id)) {
        plan.hypotheses.push({
          id: h.id,
          statement: h.statement,
          required_fields: h.required_fields ?? [],
          priority: (["high", "medium", "low"].includes(h.priority ?? "")) ? h.priority as "high" | "medium" | "low" : "medium",
        });
        existingIds.add(h.id);
      }
    }
  }

  // time_mode adjustments
  if (intent.time_mode === "realtime") {
    if (!plan.blocking_fields.includes("price.realtime")) {
      plan.blocking_fields.unshift("price.realtime");
    }
  }

  return plan;
}

/**
 * formatResearchPlanForPrompt
 *
 * Serializes ResearchPlan into a compact prompt injection block for Step3.
 */
export function formatResearchPlanForPrompt(plan: ResearchPlan): string {
  const hyps = plan.hypotheses.map(h => `  [${h.id}|${h.priority}] ${h.statement}`).join("\n");
  return `[RESEARCH_PLAN | LEVEL1A]
DIMENSIONS: ${plan.research_dimensions.join(", ")}
HYPOTHESES:
${hyps}
BLOCKING_FIELDS: ${plan.blocking_fields.join(", ") || "none"}
IMPORTANT_FIELDS: ${plan.important_fields.join(", ") || "none"}
OPTIONAL_FIELDS: ${plan.optional_fields.slice(0, 5).join(", ") || "none"}
PRIMARY_PATH: ${plan.primary_path.join(" → ")}
FALLBACK_PATH: ${plan.fallback_path.join(" → ")}
MINIMAL_PATH: ${plan.minimal_path.join(" → ")}
[/RESEARCH_PLAN]`;
}
