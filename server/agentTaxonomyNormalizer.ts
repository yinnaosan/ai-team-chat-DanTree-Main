/**
 * LEVEL1A2 Phase2: Agent Taxonomy Normalizer
 * Maps legacy agent roles (macro/technical/fundamental/sentiment/interpretation)
 * into locked taxonomy: valuation | business | risk | market_context
 *
 * RULE: synthesis must consume normalized object, NOT raw agent blob
 * RULE: risk must actively challenge valuation/business outputs
 * RULE: market_context is supporting layer only
 */

import type { MultiAgentResult, AgentAnalysis } from "./multiAgentAnalysis";

// ── Normalized Taxonomy Object ────────────────────────────────────────────────

export interface NormalizedTaxonomy {
  valuation: {
    core_claims: string[];
    premium_or_discount: string[];   // "overvalued" | "fair" | "undervalued" + rationale
    valuation_risks: string[];
  };
  business: {
    quality_claims: string[];
    growth_claims: string[];
    profitability_claims: string[];
  };
  risk: {
    thesis_failure_points: string[];
    hidden_risks: string[];
    invalidation_conditions: string[];
  };
  market_context: {
    macro_signals: string[];
    sentiment_signals: string[];
    technical_signals: string[];
  };
  conflicts: string[];   // explicit signal disagreements
  revisions: string[];   // risk challenges to valuation/business
}

// ── Role → Taxonomy Mapping ───────────────────────────────────────────────────

const ROLE_TO_TAXONOMY: Record<string, keyof Pick<NormalizedTaxonomy, "valuation" | "business" | "risk" | "market_context">> = {
  fundamental: "valuation",
  valuation: "valuation",
  macro: "market_context",
  technical: "market_context",
  sentiment: "market_context",
  risk: "risk",
  interpretation: "business",
  business: "business",
};

// ── Signal Extraction Helpers ─────────────────────────────────────────────────

function extractSignalClaims(agent: AgentAnalysis): string[] {
  const claims: string[] = [];
  if (agent.keyPoints) claims.push(...agent.keyPoints);
  if (agent.verdict) claims.push(agent.verdict);
  return claims.filter(Boolean).slice(0, 5);
}

function detectConflicts(agents: AgentAnalysis[]): string[] {
  const conflicts: string[] = [];
  const signals = agents.map(a => ({ role: a.role, signal: a.signal ?? "neutral" }));

  // Check for bullish vs bearish disagreements
  const bullish = signals.filter(s => s.signal === "bullish").map(s => s.role);
  const bearish = signals.filter(s => s.signal === "bearish").map(s => s.role);

  if (bullish.length > 0 && bearish.length > 0) {
    conflicts.push(`信号分歧: ${bullish.join("/")}偏多 vs ${bearish.join("/")}偏空`);
  }

  // Check confidence disagreements
  const highConf = agents.filter(a => a.confidence === "high");
  const lowConf = agents.filter(a => a.confidence === "low");
  if (highConf.length > 0 && lowConf.length > 0) {
    conflicts.push(`置信度分歧: ${highConf.map(a => a.role).join("/")}高置信 vs ${lowConf.map(a => a.role).join("/")}低置信`);
  }

  return conflicts;
}

function buildRiskRevisions(
  riskAgent: AgentAnalysis | undefined,
  valuationClaims: string[],
  businessClaims: string[],
): string[] {
  const revisions: string[] = [];
  if (!riskAgent) return revisions;

  // Risk agent challenges valuation claims
  for (const claim of valuationClaims.slice(0, 2)) {
    if (riskAgent.keyPoints && riskAgent.keyPoints.length > 0) {
      revisions.push(`估值挑战: "${claim.slice(0, 60)}" — 风险视角: ${riskAgent.keyPoints[0]}`);
    }
  }

  // Risk agent challenges business claims
  for (const claim of businessClaims.slice(0, 1)) {
    if (riskAgent.keyPoints && riskAgent.keyPoints.length > 1) {
      revisions.push(`业务挑战: "${claim.slice(0, 60)}" — 风险视角: ${riskAgent.keyPoints[1]}`);
    }
  }

  return revisions;
}

// ── Main Normalizer ───────────────────────────────────────────────────────────

export function normalizeAgentTaxonomy(
  multiAgentResult: MultiAgentResult | null | undefined,
): NormalizedTaxonomy {
  const empty: NormalizedTaxonomy = {
    valuation: { core_claims: [], premium_or_discount: [], valuation_risks: [] },
    business: { quality_claims: [], growth_claims: [], profitability_claims: [] },
    risk: { thesis_failure_points: [], hidden_risks: [], invalidation_conditions: [] },
    market_context: { macro_signals: [], sentiment_signals: [], technical_signals: [] },
    conflicts: [],
    revisions: [],
  };

  if (!multiAgentResult?.agents || multiAgentResult.agents.length === 0) {
    return empty;
  }

  const agents = multiAgentResult.agents;
  const taxonomy = JSON.parse(JSON.stringify(empty)) as NormalizedTaxonomy;

  // Map each agent to taxonomy bucket
  for (const agent of agents) {
    const bucket = ROLE_TO_TAXONOMY[agent.role] ?? "market_context";
    const claims = extractSignalClaims(agent);

    if (bucket === "valuation") {
      taxonomy.valuation.core_claims.push(...claims);
      // Determine premium/discount from verdict
      if (agent.verdict) {
        const v = agent.verdict.toLowerCase();
        if (v.includes("高估") || v.includes("overvalued") || v.includes("premium")) {
          taxonomy.valuation.premium_or_discount.push(`高估: ${agent.verdict}`);
        } else if (v.includes("低估") || v.includes("undervalued") || v.includes("discount")) {
          taxonomy.valuation.premium_or_discount.push(`低估: ${agent.verdict}`);
        } else {
          taxonomy.valuation.premium_or_discount.push(`合理: ${agent.verdict}`);
        }
      }
    } else if (bucket === "business") {
      // Classify claims into quality/growth/profitability
      for (const claim of claims) {
        const cl = claim.toLowerCase();
        if (cl.includes("增长") || cl.includes("growth") || cl.includes("扩张") || cl.includes("expand")) {
          taxonomy.business.growth_claims.push(claim);
        } else if (cl.includes("利润") || cl.includes("profit") || cl.includes("margin") || cl.includes("盈利")) {
          taxonomy.business.profitability_claims.push(claim);
        } else {
          taxonomy.business.quality_claims.push(claim);
        }
      }
    } else if (bucket === "risk") {
      taxonomy.risk.thesis_failure_points.push(...claims.slice(0, 2));
      if (agent.keyPoints) {
        // Look for invalidation conditions
        const invalidation = agent.keyPoints.filter(p =>
          p.includes("如果") || p.includes("若") || p.includes("一旦") || p.includes("if") || p.includes("when")
        );
        taxonomy.risk.invalidation_conditions.push(...invalidation.slice(0, 2));
        // Remaining as hidden risks
        const hidden = agent.keyPoints.filter(p => !invalidation.includes(p));
        taxonomy.risk.hidden_risks.push(...hidden.slice(0, 2));
      }
    } else if (bucket === "market_context") {
      // Route by role
      if (agent.role === "macro") {
        taxonomy.market_context.macro_signals.push(...claims.slice(0, 3));
      } else if (agent.role === "technical") {
        taxonomy.market_context.technical_signals.push(...claims.slice(0, 3));
      } else if (agent.role === "sentiment") {
        taxonomy.market_context.sentiment_signals.push(...claims.slice(0, 3));
      } else {
        // interpretation or other → split across
        taxonomy.market_context.macro_signals.push(...claims.slice(0, 1));
        taxonomy.market_context.sentiment_signals.push(...claims.slice(1, 2));
      }
    }
  }

  // Detect conflicts
  taxonomy.conflicts = detectConflicts(agents);

  // Risk challenges valuation/business (revisions)
  const riskAgent = agents.find(a => a.role === "macro" || a.role === "sentiment");
  taxonomy.revisions = buildRiskRevisions(
    riskAgent,
    taxonomy.valuation.core_claims,
    [...taxonomy.business.quality_claims, ...taxonomy.business.growth_claims],
  );

  return taxonomy;
}

// ── Prompt Formatter ──────────────────────────────────────────────────────────

export function formatNormalizedTaxonomyForPrompt(taxonomy: NormalizedTaxonomy): string {
  if (
    taxonomy.valuation.core_claims.length === 0 &&
    taxonomy.business.quality_claims.length === 0 &&
    taxonomy.risk.thesis_failure_points.length === 0
  ) {
    return "";
  }

  const lines: string[] = [
    "[AGENT_TAXONOMY | LEVEL1A2]",
    "VALUATION:",
    ...taxonomy.valuation.core_claims.map(c => `  CLAIM: ${c}`),
    ...taxonomy.valuation.premium_or_discount.map(c => `  PREMIUM_DISCOUNT: ${c}`),
    ...taxonomy.valuation.valuation_risks.map(c => `  VALUATION_RISK: ${c}`),
    "BUSINESS:",
    ...taxonomy.business.quality_claims.map(c => `  QUALITY: ${c}`),
    ...taxonomy.business.growth_claims.map(c => `  GROWTH: ${c}`),
    ...taxonomy.business.profitability_claims.map(c => `  PROFIT: ${c}`),
    "RISK:",
    ...taxonomy.risk.thesis_failure_points.map(c => `  FAILURE_POINT: ${c}`),
    ...taxonomy.risk.hidden_risks.map(c => `  HIDDEN_RISK: ${c}`),
    ...taxonomy.risk.invalidation_conditions.map(c => `  INVALIDATION: ${c}`),
    "MARKET_CONTEXT (supporting only):",
    ...taxonomy.market_context.macro_signals.map(c => `  MACRO: ${c}`),
    ...taxonomy.market_context.sentiment_signals.map(c => `  SENTIMENT: ${c}`),
    ...taxonomy.market_context.technical_signals.map(c => `  TECHNICAL: ${c}`),
  ];

  if (taxonomy.conflicts.length > 0) {
    lines.push("CONFLICTS:");
    lines.push(...taxonomy.conflicts.map(c => `  CONFLICT: ${c}`));
  }

  if (taxonomy.revisions.length > 0) {
    lines.push("RISK_CHALLENGES:");
    lines.push(...taxonomy.revisions.map(r => `  CHALLENGE: ${r}`));
  }

  lines.push("[/AGENT_TAXONOMY]");
  return lines.join("\n");
}
