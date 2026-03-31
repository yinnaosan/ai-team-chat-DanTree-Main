/**
 * semantic_protocol.examples.ts — DanTree Level 12.1 Protocol Examples
 *
 * 4 个标准协议包示例：
 *   1. equity_business_packet       — 股票业务分析包
 *   2. macro_commodity_packet       — 宏观商品分析包
 *   3. policy_reality_packet        — 政策现实分析包
 *   4. market_structure_packet      — 市场结构分析包
 *
 * 所有示例均使用 buildSemanticPacket() 构建，通过 validateSemanticPacket() 验证。
 */

import { buildSemanticPacket, type SemanticTransportPacket } from "./semantic_protocol";

// ─────────────────────────────────────────────────────────────────────────────
// EXAMPLE 1: Equity Business Packet
// 场景：分析 AAPL 的业务质量与当前驱动因子
// ─────────────────────────────────────────────────────────────────────────────

export const EXAMPLE_EQUITY_BUSINESS: SemanticTransportPacket = buildSemanticPacket({
  agent: "level11_multiasset_engine",
  task: "real_driver_identification",
  entity: "AAPL",
  timeframe: "mid",
  state: {
    asset_type: "equity",
    regime: "risk_on",
    narrative_gap: 0.38,         // 叙事略微领先现实
    crowding: 0.71,              // 持仓较拥挤
    fragility: 0.44,             // 中等脆弱性
    timeframe: "mid",
    direction: "positive",
    primary_driver: "services_revenue_margin_expansion",
    hidden_pressure_points: [
      "china_revenue_concentration>regulatory_risk",
      "hardware_cycle_dependency && services_growth_decoupling",
      "valuation_premium fragile_if_rate_environment_shifts",
    ],
  },
  signals: [
    {
      name: "services_margin_expansion",
      direction: "positive",
      intensity: 0.78,
      persistence: "building",
      urgency: "medium",
      driver_type: "real",
      monitoring_signal: "gross_margin_quarterly_trend",
      invalidation: "services_arpu_growth_stalls",
    },
    {
      name: "hardware_upgrade_cycle_fatigue",
      direction: "negative",
      intensity: 0.51,
      persistence: "stable",
      urgency: "low",
      driver_type: "structure",
      monitoring_signal: "iphone_unit_growth_yoy",
      invalidation: "new_form_factor_adoption_accelerates",
    },
    {
      name: "ai_narrative_premium_crowding",
      direction: "mixed",
      intensity: 0.63,
      persistence: "fading",
      urgency: "medium",
      driver_type: "narrative",
      monitoring_signal: "ai_feature_monetization_evidence",
      invalidation: "on_device_ai_revenue_materializes",
    },
  ],
  risks: [
    {
      name: "china_regulatory_escalation",
      severity: 0.67,
      timing: "near",
      containment: "low",
      trigger: "us_china_tech_export_restrictions_expand",
      mitigation_path: "supply_chain_diversification_india_vietnam",
    },
    {
      name: "rate_environment_multiple_compression",
      severity: 0.48,
      timing: "mid",
      containment: "medium",
      trigger: "fed_higher_for_longer_pivot",
    },
  ],
  confidence: {
    score: 0.74,
    trend: "stable",
    fragility: 0.31,
    source_quality: "high",
    anchored_on: "services_revenue_growth_continuity",
  },
  constraints: [
    "hardware_cycle_analysis requires_unit_data>currently_estimated",
    "china_revenue_opacity limits_precision",
  ],
  invalidations: [
    "services_gross_margin_contracts_below_72pct",
    "ai_monetization_narrative_collapses_without_evidence",
    "china_ban_on_iphone_expands_government_sector",
  ],
  insight_notes: [
    "narrative_strength decoupled_from hardware_earnings_followthrough",
    "crowding_high && fragility_rising_on_rate_sensitivity",
    "real_driver=services_margin; narrative_driver=ai_premium — gap_widening",
    "policy_signal<execution_reality on_china_exposure",
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// EXAMPLE 2: Macro Commodity Packet
// 场景：黄金 (GLD) 在当前实际利率环境下的分析
// ─────────────────────────────────────────────────────────────────────────────

export const EXAMPLE_MACRO_COMMODITY: SemanticTransportPacket = buildSemanticPacket({
  agent: "level11_multiasset_engine",
  task: "driver_routing",
  entity: "GLD",
  timeframe: "mid",
  state: {
    asset_type: "etf_macro",
    regime: "risk_off",
    narrative_gap: 0.22,         // 叙事与现实较接近
    crowding: 0.58,
    fragility: 0.35,
    timeframe: "mid",
    direction: "positive",
    primary_driver: "real_yield_compression",
    hidden_pressure_points: [
      "central_bank_demand_structural_floor",
      "dollar_strength_headwind_if_usd_rallies",
    ],
  },
  signals: [
    {
      name: "real_yield_decline",
      direction: "positive",
      intensity: 0.82,
      persistence: "building",
      urgency: "high",
      driver_type: "real",
      monitoring_signal: "tips_10y_yield_direction",
      invalidation: "real_yield_rises_above_2pct",
    },
    {
      name: "central_bank_gold_accumulation",
      direction: "positive",
      intensity: 0.69,
      persistence: "stable",
      urgency: "low",
      driver_type: "structure",
      monitoring_signal: "imf_official_gold_reserve_quarterly_change",
    },
    {
      name: "usd_strength_headwind",
      direction: "negative",
      intensity: 0.44,
      persistence: "fading",
      urgency: "medium",
      driver_type: "flow",
      monitoring_signal: "dxy_momentum_20d",
      invalidation: "dxy_breaks_below_102",
    },
  ],
  risks: [
    {
      name: "fed_hawkish_pivot",
      severity: 0.61,
      timing: "near",
      containment: "low",
      trigger: "cpi_reacceleration_above_3.5pct",
      mitigation_path: "central_bank_demand_absorbs_selling_pressure",
    },
    {
      name: "etf_flow_reversal",
      severity: 0.38,
      timing: "mid",
      containment: "medium",
      trigger: "risk_on_rotation_accelerates",
    },
  ],
  confidence: {
    score: 0.68,
    trend: "rising",
    fragility: 0.28,
    source_quality: "high",
    anchored_on: "real_yield_compression_sustained",
  },
  constraints: [
    "geopolitical_premium unquantifiable_in_real_time",
    "etf_vs_physical_demand_split unclear",
  ],
  invalidations: [
    "real_yield_rises_above_1.5pct_sustained",
    "central_bank_demand_reverses_net_selling",
    "dollar_index_sustained_breakout_above_108",
  ],
  insight_notes: [
    "real_driver=yield_compression; structural_floor=cb_accumulation",
    "narrative_premium_low — signal_quality_high",
    "crowding_moderate && fragility_low — favorable_risk_reward",
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// EXAMPLE 3: Policy Reality Packet
// 场景：分析美联储政策信号 vs 实际执行现实
// ─────────────────────────────────────────────────────────────────────────────

export const EXAMPLE_POLICY_REALITY: SemanticTransportPacket = buildSemanticPacket({
  agent: "level11_policy_reality_engine",
  task: "policy_reality",
  entity: "FED_POLICY_2026",
  timeframe: "short",
  state: {
    asset_type: "rates",
    regime: "policy_driven",
    narrative_gap: 0.54,         // 市场定价与政策执行现实有显著差距
    crowding: 0.45,
    fragility: 0.62,             // 高脆弱性：政策信号易逆转
    timeframe: "short",
    direction: "mixed",
    primary_driver: "inflation_persistence_vs_labor_market_softening",
    hidden_pressure_points: [
      "fiscal_dominance_constrains_fed_independence",
      "political_pressure_cycle_election_proximity",
      "bank_term_funding_program_residual_effects",
    ],
  },
  signals: [
    {
      name: "inflation_stickiness_services",
      direction: "negative",
      intensity: 0.71,
      persistence: "stable",
      urgency: "high",
      driver_type: "real",
      monitoring_signal: "supercore_cpi_monthly_trend",
      invalidation: "supercore_cpi_sub_0.2pct_for_3_consecutive_months",
    },
    {
      name: "labor_market_softening",
      direction: "positive",
      intensity: 0.56,
      persistence: "building",
      urgency: "medium",
      driver_type: "real",
      monitoring_signal: "jolts_quits_rate && initial_claims_trend",
      invalidation: "nfp_reaccelerates_above_200k_sustained",
    },
    {
      name: "market_cut_expectations_overshoot",
      direction: "negative",
      intensity: 0.48,
      persistence: "fading",
      urgency: "medium",
      driver_type: "narrative",
      monitoring_signal: "fed_funds_futures_implied_cuts_vs_dot_plot",
      invalidation: "dot_plot_moves_toward_market_pricing",
    },
  ],
  risks: [
    {
      name: "policy_credibility_erosion",
      severity: 0.73,
      timing: "mid",
      containment: "low",
      trigger: "premature_cut_followed_by_inflation_reacceleration",
      mitigation_path: "data_dependent_communication_discipline",
    },
    {
      name: "execution_gap_widening",
      severity: 0.58,
      timing: "near",
      containment: "medium",
      trigger: "fomc_forward_guidance_contradicted_by_incoming_data",
    },
  ],
  confidence: {
    score: 0.61,
    trend: "falling",
    fragility: 0.55,
    source_quality: "medium",
    anchored_on: "inflation_returning_to_target_sustained",
  },
  constraints: [
    "political_interference_unquantifiable",
    "lagged_data_effects delay_signal_clarity",
  ],
  invalidations: [
    "cpi_reaccelerates_above_3.5pct",
    "labor_market_tightens_unexpectedly",
    "fed_explicitly_abandons_2pct_target",
  ],
  insight_notes: [
    "policy_signal>execution_reality — gap_0.54",
    "market_pricing_cuts_faster_than_dot_plot_supports",
    "fiscal_dominance_risk underpriced_in_rates_market",
    "fragility_high: single_cpi_print_can_reprice_entire_curve",
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// EXAMPLE 4: Market Structure Packet
// 场景：分析 S&P 500 当前市场结构与流动性条件
// ─────────────────────────────────────────────────────────────────────────────

export const EXAMPLE_MARKET_STRUCTURE: SemanticTransportPacket = buildSemanticPacket({
  agent: "level11_multiasset_engine",
  task: "cross_asset_propagation",
  entity: "SPX",
  timeframe: "short",
  state: {
    asset_type: "index",
    regime: "transition",
    narrative_gap: 0.47,
    crowding: 0.79,              // 极高拥挤度
    fragility: 0.68,             // 高脆弱性
    timeframe: "short",
    direction: "mixed",
    primary_driver: "passive_flow_concentration_mag7",
    hidden_pressure_points: [
      "mag7_earnings_concentration>index_single_stock_risk",
      "passive_flow_dominance_distorts_price_discovery",
      "vol_regime_low && fragility_rising — gap_risk",
    ],
  },
  signals: [
    {
      name: "passive_flow_momentum",
      direction: "positive",
      intensity: 0.74,
      persistence: "stable",
      urgency: "low",
      driver_type: "flow",
      monitoring_signal: "etf_inflow_weekly_vs_active_fund_outflow",
      invalidation: "401k_allocation_shift_to_fixed_income",
    },
    {
      name: "earnings_concentration_risk",
      direction: "negative",
      intensity: 0.66,
      persistence: "building",
      urgency: "high",
      driver_type: "structure",
      monitoring_signal: "mag7_revenue_growth_vs_sp493_divergence",
      invalidation: "earnings_breadth_expands_beyond_mag7",
    },
    {
      name: "credit_conditions_tightening",
      direction: "negative",
      intensity: 0.41,
      persistence: "building",
      urgency: "medium",
      driver_type: "real",
      monitoring_signal: "hy_credit_spread_vs_ig_spread_ratio",
      invalidation: "credit_spreads_compress_below_300bps",
    },
  ],
  risks: [
    {
      name: "crowding_unwind_cascade",
      severity: 0.77,
      timing: "near",
      containment: "low",
      trigger: "mag7_earnings_miss_triggers_systematic_derisking",
      mitigation_path: "breadth_rotation_absorbs_mega_cap_selling",
    },
    {
      name: "liquidity_gap_vol_regime_shift",
      severity: 0.64,
      timing: "near",
      containment: "low",
      trigger: "vix_spike_above_25_triggers_risk_parity_deleveraging",
    },
  ],
  confidence: {
    score: 0.58,
    trend: "falling",
    fragility: 0.61,
    source_quality: "high",
    anchored_on: "passive_flow_continuity_and_mag7_earnings_delivery",
  },
  constraints: [
    "passive_dominance_makes_valuation_signals_less_predictive",
    "vol_suppression_masks_underlying_fragility",
  ],
  invalidations: [
    "mag7_combined_revenue_growth_below_10pct",
    "passive_inflow_reversal_sustained_3months",
    "credit_event_triggers_risk_off_cascade",
  ],
  insight_notes: [
    "crowding_0.79 && fragility_0.68 — tail_risk_elevated",
    "narrative_strength decoupled_from earnings_breadth_reality",
    "passive_flow=structural_bid; but_concentration_risk=structural_fragility",
    "vol_suppression_regime: low_vix_not_signal_of_stability",
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export const PROTOCOL_EXAMPLES = {
  equity_business: EXAMPLE_EQUITY_BUSINESS,
  macro_commodity: EXAMPLE_MACRO_COMMODITY,
  policy_reality: EXAMPLE_POLICY_REALITY,
  market_structure: EXAMPLE_MARKET_STRUCTURE,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// LEVEL 12.4 USAGE EXAMPLE — Explicit level11Analysis threading (OI-L12-003-A)
//
// This example shows the correct pattern for activating PATH-A:
//   - level11Analysis is passed as an EXPLICIT PARAMETER
//   - NOT added to DeepResearchContextMap
//   - DeepResearchContextMap interface remains unchanged
// ─────────────────────────────────────────────────────────────────────────────

/**
 * EXAMPLE: buildSemanticActivationResult — explicit threading (Level 12.4 pattern)
 *
 * Correct usage in danTreeSystem.ts:
 *
 *   import { buildSemanticActivationResult, attachUnifiedSemanticState }
 *     from "./level12_4_semantic_activation";
 *
 *   // After running all layers:
 *   const semanticResult = buildSemanticActivationResult({
 *     entity: ticker,
 *     level11Analysis,   // PATH-A — explicit param, NOT via DeepResearchContextMap
 *     experienceLayer,   // PATH-B
 *     positionLayer,     // PATH-C
 *   });
 *
 *   // Attach to multiAgentResult so Step3 can read __unifiedSemanticState:
 *   const enrichedResult = attachUnifiedSemanticState(
 *     multiAgentResult,
 *     semanticResult.unifiedState
 *   );
 *
 * WRONG patterns (do NOT do these):
 *
 *   // ❌ DO NOT add level11Analysis to DeepResearchContextMap
 *   const ctx: DeepResearchContextMap = { ...existing, level11Analysis };
 *
 *   // ❌ DO NOT mutate multiAgentResult directly
 *   multiAgentResult.__unifiedSemanticState = semanticResult.unifiedState;
 *
 * The enrichedResult.__unifiedSemanticState is then read by Step3 in routers.ts
 * via formatSemanticEnvelopeForPrompt() from synthesisController.ts.
 * This activates semantic injection into the final GPT synthesis prompt
 * without altering any READ-ONLY interfaces.
 */
export const LEVEL12_4_THREADING_EXAMPLE_COMMENT = `
  // Correct Level 12.4 pattern (OI-L12-003-A + OI-L12-003-B):
  const semanticResult = buildSemanticActivationResult({ entity, level11Analysis, experienceLayer, positionLayer });
  const enriched = attachUnifiedSemanticState(multiAgentResult, semanticResult.unifiedState);
  // Step3 reads: enriched.__unifiedSemanticState → formatSemanticEnvelopeForPrompt()
` as const;

