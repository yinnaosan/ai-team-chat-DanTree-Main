/**
 * LEVEL 11 — Multi-Asset Reality & Propagation Engine
 *
 * This is a SYSTEM REFOUNDATION — not an extension layer.
 * Goal: Transform DanTree into a multi-asset, real-world, behavior-aware,
 * policy-aware, propagation-aware investment system.
 *
 * Module 1: classifyAsset()           — Asset type classification
 * Module 2: routeDriverEngine()       — Driver engine routing
 * Module 3: identifyRealDrivers()     — Real vs narrative driver separation
 * Module 4: analyzeIncentives()       — Behavioral & incentive layer
 * Module 5: analyzePolicyReality()    — Policy execution vs intention
 * Module 6: detectSentimentState()    — Market sentiment state engine
 * Module 7: buildPropagationChain()   — Cross-asset propagation
 * Module 8: buildScenarioMap()        — Conditional forward reasoning
 *
 * HARD RULES:
 * - NO single-framework analysis across all assets
 * - NO superficial macro commentary
 * - NO generic sentiment descriptions
 * - MUST distinguish signal vs narrative vs noise
 * - MUST include uncertainty + alternative paths
 * - MUST remain advisory_only
 */

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 1 — ASSET TYPE CLASSIFICATION
// ─────────────────────────────────────────────────────────────────────────────

export type AssetType =
  | "equity"
  | "commodity"
  | "index"
  | "etf_equity"
  | "etf_sector"
  | "etf_macro";

export type PrimaryDriverType =
  | "business"
  | "macro"
  | "liquidity"
  | "flow"
  | "hybrid";

export interface AssetClassification {
  asset_type: AssetType;
  underlying_structure: string;
  primary_driver_type: PrimaryDriverType;
  /** Analysis mode: describes the dominant reasoning framework for this asset */
  analysis_mode: string;
  advisory_only: true;
}

export interface AssetClassificationInput {
  ticker: string;
  name?: string;
  sector?: string;
  description?: string;
  /** Hint: "equity" | "commodity" | "index" | "etf" */
  asset_hint?: string;
}

/**
 * [LEVEL11 Module 1] Classify asset type and primary driver.
 * Classification determines entire downstream logic.
 * Uses ticker patterns, sector, and description hints.
 */
export function classifyAsset(input: AssetClassificationInput): AssetClassification {
  const ticker = input.ticker.toUpperCase();
  const name = (input.name ?? "").toLowerCase();
  const sector = (input.sector ?? "").toLowerCase();
  const desc = (input.description ?? "").toLowerCase();
  const hint = (input.asset_hint ?? "").toLowerCase();

  // ── ETF detection ────────────────────────────────────────────────────────
  const etfPatterns = [
    "etf", "fund", "trust", "shares", "ishares", "spdr", "vanguard",
    "invesco", "ark", "proshares", "direxion"
  ];
  const isEtfByName = etfPatterns.some(p => name.includes(p) || desc.includes(p));
  const isEtfByHint = hint === "etf";

  // ── Commodity detection ──────────────────────────────────────────────────
  const commodityTickers = new Set([
    "GC", "GLD", "IAU", "SGOL",           // Gold
    "SI", "SLV",                            // Silver
    "CL", "USO", "BNO", "UCO",             // Oil
    "NG", "UNG",                            // Natural Gas
    "HG", "CPER",                           // Copper
    "ZC", "ZW", "ZS",                       // Grains
    "XAU", "XAUUSD", "XAGUSD",             // Spot metals
    "WTIC", "BRENT",                        // Oil benchmarks
  ]);
  const commodityKeywords = ["gold", "silver", "oil", "crude", "copper", "wheat", "corn", "gas", "metal", "commodity"];
  const isCommodity = commodityTickers.has(ticker) ||
    commodityKeywords.some(k => name.includes(k) || desc.includes(k)) ||
    hint === "commodity";

  // ── Index detection ──────────────────────────────────────────────────────
  const indexTickers = new Set([
    "SPX", "SPY", "^GSPC",                 // S&P 500
    "QQQ", "NDX", "^NDX", "NASDAQ",        // Nasdaq
    "DJI", "DIA", "^DJI",                  // Dow Jones
    "IWM", "RUT", "^RUT",                  // Russell 2000
    "VIX", "^VIX",                         // Volatility
    "HSI", "^HSI",                         // Hang Seng
    "SHCOMP", "000001.SS",                 // Shanghai Composite
    "DAX", "^GDAXI",                       // DAX
    "FTSE", "^FTSE",                       // FTSE 100
  ]);
  const indexKeywords = ["index", "composite", "average", "500", "nasdaq", "dow jones", "russell", "hang seng"];
  const isIndex = indexTickers.has(ticker) ||
    indexKeywords.some(k => name.includes(k) || desc.includes(k)) ||
    hint === "index";

  // ── ETF sub-type ─────────────────────────────────────────────────────────
  if (isEtfByName || isEtfByHint) {
    // Macro ETFs: bond, treasury, currency, commodity-linked
    const macroEtfKeywords = ["bond", "treasury", "tlt", "ief", "lqd", "hyg", "tip", "currency", "dollar", "euro"];
    const isMacroEtf = macroEtfKeywords.some(k => name.includes(k) || ticker.includes(k.toUpperCase()) || desc.includes(k));
    // Sector ETFs: single sector focus
    const sectorKeywords = ["tech", "health", "energy", "financial", "consumer", "utility", "material", "industrial", "sector", "xlk", "xlv", "xle", "xlf", "xly", "xlu", "xlb", "xli"];
    const isSectorEtf = sectorKeywords.some(k => name.includes(k) || ticker.includes(k.toUpperCase()) || sector.includes(k));

    if (isMacroEtf) {
      return {
        asset_type: "etf_macro",
        underlying_structure: "Basket of macro instruments (bonds, currencies, or commodity futures). Price driven by macro regime, rate expectations, and institutional flows.",
        primary_driver_type: "macro",
        analysis_mode: "macro_regime_flow: analyze rate cycle, credit conditions, and institutional positioning — not underlying business fundamentals",
        advisory_only: true,
      };
    }
    if (isSectorEtf) {
      return {
        asset_type: "etf_sector",
        underlying_structure: "Basket of sector equities. Price driven by sector rotation, earnings cycle, and relative performance vs benchmark.",
        primary_driver_type: "flow",
        analysis_mode: "sector_rotation_flow: analyze relative earnings cycle, sector momentum, and fund flow positioning vs benchmark",
        advisory_only: true,
      };
    }
    return {
      asset_type: "etf_equity",
      underlying_structure: "Basket of equities (broad market or thematic). Price driven by underlying holdings, narrative momentum, and fund flows.",
      primary_driver_type: "flow",
      analysis_mode: "narrative_flow_wrapper: analyze the underlying theme's real vs narrative driver split, fund flows, and crowding — not individual stock fundamentals",
      advisory_only: true,
    };
  }

  // ── Commodity ────────────────────────────────────────────────────────────
  if (isCommodity) {
    return {
      asset_type: "commodity",
      underlying_structure: "Physical commodity or futures contract. Price driven by real yield, supply-demand balance, geopolitical risk premium, and USD strength.",
      primary_driver_type: "macro",
      analysis_mode: "macro_real_yield_supply_demand: analyze real yields, USD direction, physical supply-demand balance, and geopolitical risk premium — no business moat logic",
      advisory_only: true,
    };
  }

  // ── Index ────────────────────────────────────────────────────────────────
  if (isIndex) {
    return {
      asset_type: "index",
      underlying_structure: "Market-cap weighted basket of equities. Price driven by liquidity conditions, earnings expectations, and index weight concentration.",
      primary_driver_type: "liquidity",
      analysis_mode: "liquidity_weight_regime: analyze rate cycle, earnings concentration in top holdings, style regime, and passive flow dynamics — not individual company fundamentals",
      advisory_only: true,
    };
  }

  // ── Default: equity ──────────────────────────────────────────────────────
  return {
    asset_type: "equity",
    underlying_structure: "Individual equity. Price driven by business fundamentals, competitive moat, management quality, and earnings trajectory.",
    primary_driver_type: "business",
    analysis_mode: "business_moat_management: analyze competitive advantage durability, capital allocation quality, earnings trajectory, and valuation vs intrinsic value",
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 2 — DRIVER ENGINE ROUTER
// ─────────────────────────────────────────────────────────────────────────────

export type DriverFramework =
  | "business_moat_management"
  | "macro_real_yield_supply_demand"
  | "liquidity_weight_regime"
  | "flow_narrative_wrapper";

export interface DriverEngineRoute {
  framework: DriverFramework;
  primary_lens: string;
  secondary_lens: string;
  key_questions: string[];
  advisory_only: true;
}

/**
 * [LEVEL11 Module 2] Route to the correct driver analysis framework.
 * Classification determines entire downstream logic — no single framework.
 */
export function routeDriverEngine(assetType: AssetType): DriverEngineRoute {
  switch (assetType) {
    case "equity":
      return {
        framework: "business_moat_management",
        primary_lens: "Business quality + competitive moat + management capital allocation",
        secondary_lens: "Earnings trajectory + margin structure + reinvestment rate",
        key_questions: [
          "What is the durable competitive advantage and is it widening or narrowing?",
          "Is management allocating capital to highest-return opportunities?",
          "What is the earnings quality — cash conversion, accruals, one-time items?",
          "At what price does the business become a compelling asymmetric bet?",
        ],
        advisory_only: true,
      };

    case "commodity":
      return {
        framework: "macro_real_yield_supply_demand",
        primary_lens: "Real yield + USD strength + physical supply-demand balance",
        secondary_lens: "Geopolitical risk premium + speculative positioning + inventory cycle",
        key_questions: [
          "What is the current real yield environment and direction of travel?",
          "Is the supply-demand balance tightening or loosening structurally?",
          "What geopolitical risk premium is embedded in current price?",
          "Is speculative positioning crowded or contrarian?",
        ],
        advisory_only: true,
      };

    case "index":
      return {
        framework: "liquidity_weight_regime",
        primary_lens: "Liquidity conditions + rate regime + earnings cycle",
        secondary_lens: "Index weight concentration + sector rotation + risk appetite",
        key_questions: [
          "Is the liquidity environment expanding or contracting?",
          "What is the earnings growth expectation embedded in current multiples?",
          "How concentrated is the index in top holdings — and what is their trajectory?",
          "What regime phase are we in — early cycle, mid cycle, late cycle, or contraction?",
        ],
        advisory_only: true,
      };

    case "etf_equity":
    case "etf_sector":
    case "etf_macro":
      return {
        framework: "flow_narrative_wrapper",
        primary_lens: "Fund flows + narrative momentum + underlying holdings quality",
        secondary_lens: "Wrapper structure + premium/discount to NAV + redemption risk",
        key_questions: [
          "Is the underlying narrative driving inflows or outflows?",
          "What is the quality of underlying holdings — are they benefiting from the narrative?",
          "Is the ETF trading at a premium or discount to NAV?",
          "What triggers a narrative reversal and forced redemption cycle?",
        ],
        advisory_only: true,
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 3 — REAL DRIVER IDENTIFICATION
// ─────────────────────────────────────────────────────────────────────────────

export type DriverType = "real" | "narrative" | "mixed";

export interface DriverSignal {
  driver: string;
  type: DriverType;
  strength: number;   // 0–1
  why: string;
  /** Observable signal that confirms or denies this driver is active */
  monitoring_signal: string;
  /** What would falsify this driver — specific observable condition */
  risk_if_wrong: string;
}

export interface RealDriversOutput {
  drivers: DriverSignal[];
  signal_vs_noise_summary: string;
  primary_real_driver: string;
  primary_narrative_driver: string;
  advisory_only: true;
}

export interface RealDriverContext {
  asset_type: AssetType;
  ticker: string;
  sector?: string;
  regime_tag?: string;
  recent_events?: string[];
  macro_signals?: {
    real_yield?: number;        // e.g., -0.5 means -0.5%
    usd_strength?: "rising" | "falling" | "stable";
    rate_direction?: "hiking" | "cutting" | "pausing";
    inflation_trend?: "rising" | "falling" | "stable";
    credit_spreads?: "widening" | "tightening" | "stable";
  };
  fundamental_signals?: {
    earnings_trend?: "accelerating" | "decelerating" | "stable";
    margin_trend?: "expanding" | "contracting" | "stable";
    revenue_growth?: number;    // % YoY
    fcf_yield?: number;         // %
  };
  sentiment_signals?: {
    positioning?: "crowded_long" | "crowded_short" | "neutral";
    momentum?: "strong_up" | "moderate_up" | "flat" | "moderate_down" | "strong_down";
    news_sentiment?: "positive" | "negative" | "mixed";
  };
}

/**
 * [LEVEL11 Module 3] Identify real vs narrative drivers.
 * MUST separate what actually drives price from what market THINKS drives price.
 */
export function identifyRealDrivers(context: RealDriverContext): RealDriversOutput {
  const drivers: DriverSignal[] = [];
  const { asset_type, macro_signals, fundamental_signals, sentiment_signals, recent_events, regime_tag } = context;

  // ── Asset-type specific real drivers ─────────────────────────────────────
  if (asset_type === "equity") {
    // Real drivers for equity
    if (fundamental_signals?.earnings_trend === "accelerating") {
      drivers.push({
        driver: "Earnings acceleration",
        type: "real",
        strength: 0.85,
        why: "Accelerating earnings growth is the primary real driver of equity value creation — this is observable in quarterly reports and forward guidance.",
        monitoring_signal: "Quarterly EPS vs consensus — direction of revision and guidance tone",
        risk_if_wrong: "Earnings acceleration reverses to deceleration on guidance cut — invalidates the real driver immediately",
      });
    } else if (fundamental_signals?.earnings_trend === "decelerating") {
      drivers.push({
        driver: "Earnings deceleration",
        type: "real",
        strength: 0.80,
        why: "Decelerating earnings growth signals business model stress — the market may not have fully priced this if narrative remains positive.",
        monitoring_signal: "Sequential EPS growth rate — is the deceleration accelerating or stabilizing?",
        risk_if_wrong: "Deceleration stabilizes and management raises guidance — bull case re-emerges",
      });
    }

    if (fundamental_signals?.margin_trend === "expanding") {
      drivers.push({
        driver: "Margin expansion",
        type: "real",
        strength: 0.75,
        why: "Margin expansion indicates pricing power or operating leverage — a structural real driver, not a narrative.",
        monitoring_signal: "Gross margin and operating margin trend across 4+ quarters",
        risk_if_wrong: "Margin expansion reverses on input cost spike or competitive pricing pressure",
      });
    } else if (fundamental_signals?.margin_trend === "contracting") {
      drivers.push({
        driver: "Margin compression",
        type: "real",
        strength: 0.72,
        why: "Margin compression is a real driver that erodes intrinsic value — often masked by revenue growth narratives.",
        monitoring_signal: "Gross margin trend — is compression accelerating or bottoming?",
        risk_if_wrong: "Management successfully passes through costs — margin stabilizes and the bear case weakens",
      });
    }

    if (fundamental_signals?.fcf_yield !== undefined) {
      const fcf = fundamental_signals.fcf_yield;
      if (fcf > 5) {
        drivers.push({
          driver: `High free cash flow yield (${fcf.toFixed(1)}%)`,
          type: "real",
          strength: 0.70,
          why: "FCF yield above 5% provides real downside containment and optionality for capital return — a genuine value anchor.",
          monitoring_signal: "Quarterly FCF generation vs capex — is the yield sustainable or one-time?",
          risk_if_wrong: "FCF deteriorates on capex surge or working capital build — yield anchor disappears",
        });
      } else if (fcf < 0) {
        drivers.push({
          driver: `Negative free cash flow (${fcf.toFixed(1)}%)`,
          type: "real",
          strength: 0.65,
          why: "Negative FCF means the business consumes capital — sustainability depends entirely on external financing conditions.",
          monitoring_signal: "Cash burn rate and runway — how many quarters until financing is required?",
          risk_if_wrong: "FCF turns positive on cost discipline or revenue acceleration — bear case weakens",
        });
      }
    }

    // Narrative drivers for equity
    if (sentiment_signals?.momentum === "strong_up" && (fundamental_signals?.earnings_trend !== "accelerating")) {
      drivers.push({
        driver: "Price momentum without fundamental support",
        type: "narrative",
        strength: 0.60,
        why: "Strong price momentum in absence of earnings acceleration suggests narrative-driven buying — fragile if sentiment shifts.",
        monitoring_signal: "Price action vs earnings revision ratio — divergence signals narrative fragility",
        risk_if_wrong: "Earnings acceleration materializes — momentum becomes fundamentally justified",
      });
    }

    if (recent_events?.some(e => e.toLowerCase().includes("ai") || e.toLowerCase().includes("artificial intelligence"))) {
      drivers.push({
        driver: "AI narrative premium",
        type: "narrative",
        strength: 0.65,
        why: "AI-related narrative drives multiple expansion beyond fundamental justification — real only if revenue from AI is material and growing.",
        monitoring_signal: "AI-related revenue as % of total revenue — is the narrative monetizing?",
        risk_if_wrong: "AI revenue contribution disappoints — narrative premium deflates, multiple compresses",
      });
    }
  }

  if (asset_type === "commodity") {
    // Real drivers for commodities
    if (macro_signals?.real_yield !== undefined) {
      const ry = macro_signals.real_yield;
      if (ry < -0.5) {
        drivers.push({
          driver: `Deeply negative real yield (${ry.toFixed(2)}%)`,
          type: "real",
          strength: 0.88,
          why: "Negative real yields destroy the opportunity cost of holding non-yielding commodities like gold — this is a structural real driver, not narrative.",
          monitoring_signal: "TIPS yield (10Y) and breakeven inflation rate — direction and rate of change",
          risk_if_wrong: "Real yields rise above 1.5% — destroys the opportunity cost argument and invalidates the bull case",
        });
      } else if (ry > 1.5) {
        drivers.push({
          driver: `Rising real yield (${ry.toFixed(2)}%)`,
          type: "real",
          strength: 0.82,
          why: "Rising real yields increase the opportunity cost of holding commodities — historically the strongest headwind for gold and silver.",
          monitoring_signal: "10Y TIPS yield trajectory — is the rise accelerating or plateauing?",
          risk_if_wrong: "Fed pivots dovish — real yields roll over and the headwind reverses",
        });
      }
    }

    if (macro_signals?.usd_strength === "rising") {
      drivers.push({
        driver: "USD strengthening",
        type: "real",
        strength: 0.75,
        why: "USD strength creates a real headwind for dollar-denominated commodities by increasing cost for non-USD buyers.",
        monitoring_signal: "DXY index direction and rate of change — is USD strength accelerating?",
        risk_if_wrong: "USD reverses on Fed pivot or fiscal deterioration — headwind becomes tailwind",
      });
    } else if (macro_signals?.usd_strength === "falling") {
      drivers.push({
        driver: "USD weakening",
        type: "real",
        strength: 0.72,
        why: "USD weakness is a structural tailwind for commodities — reduces cost for non-USD buyers and signals inflationary pressure.",
        monitoring_signal: "DXY index — sustained break below key support levels",
        risk_if_wrong: "USD strengthens on risk-off or Fed hawkishness — tailwind reverses",
      });
    }

    if (recent_events?.some(e => e.toLowerCase().includes("geopolit") || e.toLowerCase().includes("war") || e.toLowerCase().includes("sanction"))) {
      drivers.push({
        driver: "Geopolitical risk premium",
        type: "mixed",
        strength: 0.70,
        why: "Geopolitical events embed a real risk premium but the magnitude is narrative-dependent — premium fades if conflict de-escalates.",
        monitoring_signal: "Geopolitical news flow intensity and supply disruption evidence",
        risk_if_wrong: "Conflict de-escalates or supply routes normalize — risk premium collapses",
      });
    }

    // Supply-demand
    drivers.push({
      driver: "Physical supply-demand balance",
      type: "real",
      strength: 0.80,
      why: "Physical supply-demand is the foundational real driver for commodities — inventory levels, production cuts, and demand from industrial users.",
      monitoring_signal: "Inventory levels (EIA, LME, CFTC), production data, and demand from key industrial consumers",
      risk_if_wrong: "Supply increases materially (OPEC+ hike, new production) or demand destruction — balance shifts bearish",
    });
  }

  if (asset_type === "index") {
    // Real drivers for indices
    if (macro_signals?.rate_direction === "cutting") {
      drivers.push({
        driver: "Rate cutting cycle",
        type: "real",
        strength: 0.82,
        why: "Rate cuts reduce the discount rate applied to future earnings — a real driver of multiple expansion, especially for long-duration assets.",
        monitoring_signal: "Fed funds futures pricing — pace and depth of expected cuts",
        risk_if_wrong: "Inflation re-accelerates — Fed pauses or reverses, cutting cycle ends",
      });
    } else if (macro_signals?.rate_direction === "hiking") {
      drivers.push({
        driver: "Rate hiking cycle",
        type: "real",
        strength: 0.80,
        why: "Rate hikes compress multiples by increasing the discount rate — historically the primary driver of index de-rating.",
        monitoring_signal: "Fed communication tone and CPI trajectory — when does hiking cycle peak?",
        risk_if_wrong: "Inflation collapses — Fed pivots to cuts, hiking cycle ends and multiple re-rates",
      });
    }

    if (macro_signals?.credit_spreads === "widening") {
      drivers.push({
        driver: "Credit spread widening",
        type: "real",
        strength: 0.78,
        why: "Widening credit spreads signal deteriorating financial conditions — a leading real indicator of equity stress.",
        monitoring_signal: "IG and HY credit spreads (CDX, iTraxx) — rate of widening and whether it's systemic or idiosyncratic",
        risk_if_wrong: "Credit spreads stabilize or tighten — financial stress signal was temporary",
      });
    }

    // Narrative drivers for indices
    if (sentiment_signals?.positioning === "crowded_long") {
      drivers.push({
        driver: "Crowded long positioning",
        type: "narrative",
        strength: 0.65,
        why: "Crowded positioning amplifies narrative-driven moves — when the narrative breaks, forced selling accelerates the decline.",
        monitoring_signal: "CFTC commitment of traders, fund positioning surveys, short interest data",
        risk_if_wrong: "Positioning unwinds gradually without a catalyst — crowding resolves without a crash",
      });
    }
  }

  if (asset_type === "etf_equity" || asset_type === "etf_sector" || asset_type === "etf_macro") {
    // ETF-specific drivers
    drivers.push({
      driver: "Fund flow momentum",
      type: "mixed",
      strength: 0.72,
      why: "ETF flows are both cause and effect — inflows drive price, which attracts more inflows. Real only if underlying fundamentals support the narrative.",
      monitoring_signal: "Weekly ETF flow data — is the inflow trend accelerating, decelerating, or reversing?",
      risk_if_wrong: "Flows reverse — redemption wave forces selling of underlying holdings, amplifying the decline",
    });

    if (sentiment_signals?.positioning === "crowded_long") {
      drivers.push({
        driver: "Narrative-driven crowding",
        type: "narrative",
        strength: 0.75,
        why: "Thematic ETFs attract narrative-driven flows that concentrate in a small number of holdings — creates fragility when narrative reverses.",
        monitoring_signal: "Top 10 holdings concentration and their individual performance vs the ETF narrative",
        risk_if_wrong: "Underlying holdings deliver earnings that validate the narrative — crowding becomes justified",
      });
    }
  }

  // ── Regime-level real driver ──────────────────────────────────────────────
  if (regime_tag === "macro_stress" || regime_tag === "event_shock") {
    drivers.push({
      driver: "Macro stress regime",
      type: "real",
      strength: 0.85,
      why: "Macro stress regimes override asset-specific fundamentals — correlation across assets rises and liquidity becomes the dominant real driver.",
      monitoring_signal: "VIX level, credit spreads, and cross-asset correlation — are they all rising simultaneously?",
      risk_if_wrong: "Macro stress resolves — regime normalizes and asset-specific fundamentals reassert dominance",
    });
  }

  // ── Ensure at least one driver ────────────────────────────────────────────
  if (drivers.length === 0) {
    drivers.push({
      driver: "Insufficient signal density",
      type: "mixed",
      strength: 0.30,
      why: "Available data does not support confident driver identification — this uncertainty is itself a risk factor.",
      monitoring_signal: "Await next earnings release, macro data point, or policy announcement for signal clarity",
      risk_if_wrong: "Signal density increases and a clear driver emerges — uncertainty resolves in either direction",
    });
  }

  // Sort by strength descending
  drivers.sort((a, b) => b.strength - a.strength);

  const realDrivers = drivers.filter(d => d.type === "real" || d.type === "mixed");
  const narrativeDrivers = drivers.filter(d => d.type === "narrative" || d.type === "mixed");

  const primary_real_driver = realDrivers[0]?.driver ?? "No dominant real driver identified";
  const primary_narrative_driver = narrativeDrivers[0]?.driver ?? "No dominant narrative driver identified";

  const realCount = drivers.filter(d => d.type === "real").length;
  const narrativeCount = drivers.filter(d => d.type === "narrative").length;
  const signal_vs_noise_summary = realCount > narrativeCount
    ? `${realCount} real drivers dominate — price action is fundamentally anchored. Narrative drivers (${narrativeCount}) are secondary amplifiers.`
    : narrativeCount > realCount
    ? `${narrativeCount} narrative drivers dominate — price action is sentiment-driven and fragile. Real drivers (${realCount}) provide limited anchor.`
    : `Balanced mix of real (${realCount}) and narrative (${narrativeCount}) drivers — regime shift could rapidly change the dominant force.`;

  return {
    drivers,
    signal_vs_noise_summary,
    primary_real_driver,
    primary_narrative_driver,
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 4 — BEHAVIORAL & INCENTIVE LAYER
// ─────────────────────────────────────────────────────────────────────────────

export interface IncentiveAnalysisOutput {
  key_players: string[];
  incentives: string[];
  fear_drivers: string[];
  narrative_support: string;
  narrative_fragility: string;
  /** Hidden structural pressures that could break the narrative without warning */
  hidden_pressure_points: string[];
  /** One-paragraph synthesis of the behavioral and incentive landscape */
  behavioral_summary: string;
  advisory_only: true;
}

export interface IncentiveContext {
  asset_type: AssetType;
  ticker: string;
  current_narrative?: string;
  sentiment_phase?: SentimentPhase;
  recent_events?: string[];
  positioning?: "crowded_long" | "crowded_short" | "neutral";
  major_holders?: string[];
}

/**
 * [LEVEL11 Module 4] Analyze behavioral incentives and narrative structure.
 * MUST identify: who benefits, who is pushing the narrative, what breaks it.
 */
export function analyzeIncentives(context: IncentiveContext): IncentiveAnalysisOutput {
  const { asset_type, ticker, current_narrative, sentiment_phase, positioning, recent_events } = context;

  const key_players: string[] = [];
  const incentives: string[] = [];
  const fear_drivers: string[] = [];

  // ── Asset-type specific players ───────────────────────────────────────────
  if (asset_type === "equity") {
    key_players.push(
      "Corporate management (stock-based compensation incentives)",
      "Institutional investors (benchmark tracking, career risk)",
      "Sell-side analysts (coverage maintenance, deal flow)",
      "Retail investors (FOMO-driven momentum)",
    );
    incentives.push(
      "Management: maximize short-term EPS to hit option strike prices",
      "Institutions: avoid underperforming benchmark — herding into consensus names",
      "Sell-side: maintain buy ratings to preserve corporate relationships",
    );
    fear_drivers.push(
      "Earnings miss vs consensus expectations",
      "Guidance cut — signals management visibility deteriorating",
      "Insider selling at scale — management losing confidence",
      "Short interest spike — informed money positioning against narrative",
    );
  } else if (asset_type === "commodity") {
    key_players.push(
      "Central banks (reserve diversification, gold accumulation)",
      "Commodity producers (hedging programs, production decisions)",
      "Macro hedge funds (real yield / inflation positioning)",
      "Retail investors (inflation hedge narrative buyers)",
    );
    incentives.push(
      "Central banks: diversify away from USD reserves — structural gold demand",
      "Producers: hedge forward production when prices are elevated",
      "Macro funds: position for real yield compression or geopolitical risk",
    );
    fear_drivers.push(
      "Real yield spike — destroys opportunity cost argument",
      "USD strength — reduces purchasing power for non-USD buyers",
      "Demand destruction from economic slowdown",
      "Producer hedging at scale — signals price ceiling",
    );
  } else if (asset_type === "index") {
    key_players.push(
      "Passive index funds (forced buyers of index constituents)",
      "Macro hedge funds (regime positioning)",
      "Retail investors (401k flows, systematic investment)",
      "Options market makers (gamma hedging flows)",
    );
    incentives.push(
      "Passive funds: must buy regardless of valuation — creates structural bid",
      "Macro funds: position for rate cycle and earnings cycle turns",
      "Retail: systematic monthly contributions create persistent inflow",
    );
    fear_drivers.push(
      "Earnings recession — breaks the earnings growth narrative",
      "Liquidity withdrawal — Fed balance sheet reduction",
      "Credit event — triggers risk-off and correlation spike",
      "Valuation compression — multiple de-rating from rate normalization",
    );
  } else {
    // ETF
    key_players.push(
      "ETF issuers (fee revenue incentive to grow AUM)",
      "Thematic narrative promoters (media, sell-side)",
      "Retail momentum chasers (narrative-driven flows)",
      "Arbitrageurs (NAV premium/discount traders)",
    );
    incentives.push(
      "ETF issuers: launch products at peak narrative interest to capture flows",
      "Sell-side: create thematic research to generate trading activity",
      "Retail: chase recent performance — buy high, sell low cycle",
    );
    fear_drivers.push(
      "Narrative reversal — the theme loses media attention",
      "Underlying holdings disappoint — breaks the story",
      "Premium to NAV collapses — arbitrage forces price down",
      "Redemption wave — forced selling of underlying holdings",
    );
  }

  // ── Sentiment-phase specific incentives ───────────────────────────────────
  let narrative_support = "";
  let narrative_fragility = "";

  if (sentiment_phase === "consensus" || sentiment_phase === "overheat") {
    narrative_support = `${ticker} has reached consensus positioning — the narrative is widely accepted and institutionally endorsed. Sell-side coverage is uniformly positive, and the asset appears in most benchmark portfolios.`;
    narrative_fragility = `Consensus positioning creates fragility: any data point that contradicts the narrative triggers outsized selling as crowded longs unwind simultaneously. The narrative is most fragile when it is most widely believed.`;
  } else if (sentiment_phase === "skepticism") {
    narrative_support = `${ticker} is in skepticism phase — the narrative is not yet widely accepted. Early movers are accumulating against the consensus, but institutional adoption is limited.`;
    narrative_fragility = `Skepticism-phase assets are fragile to continued fundamental deterioration — if the bear case materializes before the bull case, early accumulation becomes a value trap.`;
  } else if (sentiment_phase === "capitulation") {
    narrative_support = `${ticker} has experienced capitulation — forced sellers have exhausted supply and the narrative has been thoroughly discredited. Contrarian opportunity may be emerging.`;
    narrative_fragility = `Post-capitulation assets remain fragile if the fundamental thesis is broken rather than temporarily impaired — distinguishing between cyclical and structural damage is critical.`;
  } else if (sentiment_phase === "fragile") {
    narrative_support = `${ticker} is in a fragile sentiment state — the bull narrative is intact but increasingly dependent on a narrow set of positive catalysts.`;
    narrative_fragility = `Fragile sentiment means the narrative can break rapidly on a single negative catalyst. The market is priced for perfection and any disappointment triggers disproportionate selling.`;
  } else {
    narrative_support = `${ticker} narrative is in ${sentiment_phase ?? "uncertain"} phase — mixed signals from different market participants.`;
    narrative_fragility = `Narrative fragility is moderate — the asset lacks strong directional conviction from either bulls or bears.`;
  }

  // ── Positioning-specific fear ─────────────────────────────────────────────
  if (positioning === "crowded_long") {
    fear_drivers.push("Crowded long positioning — any negative catalyst triggers cascading stop-loss selling");
  } else if (positioning === "crowded_short") {
    fear_drivers.push("Crowded short positioning — positive catalyst triggers short squeeze, amplifying upside");
  }

  // ── Recent event incentives ───────────────────────────────────────────────
  if (recent_events?.some(e => e.toLowerCase().includes("buyback") || e.toLowerCase().includes("repurchase"))) {
    incentives.push("Management buyback program — aligns management incentive with short-term price support");
  }
  if (recent_events?.some(e => e.toLowerCase().includes("insider") && e.toLowerCase().includes("sell"))) {
    fear_drivers.push("Insider selling — management reducing exposure at current prices signals reduced internal confidence");
  }

  // ── Hidden pressure points ───────────────────────────────────────────────
  const hidden_pressure_points: string[] = [];
  if (asset_type === "equity") {
    hidden_pressure_points.push(
      "Insider selling cluster — multiple executives reducing exposure simultaneously",
      "Customer concentration risk — top 3 customers represent >30% of revenue",
      "Debt maturity wall — refinancing at higher rates compresses future FCF",
    );
  } else if (asset_type === "commodity") {
    hidden_pressure_points.push(
      "Central bank gold selling — sovereign reserve rebalancing can overwhelm retail demand",
      "Producer hedging program activation — signals price ceiling from informed sellers",
      "Demand substitution — industrial users switching to alternatives on sustained high prices",
    );
  } else if (asset_type === "index") {
    hidden_pressure_points.push(
      "Passive flow reversal — if 401k contributions slow, the structural bid weakens",
      "Index rebalancing concentration — top 10 holdings represent >35% of index weight",
      "Pension fund de-risking — systematic equity reduction as funded status improves",
    );
  } else {
    hidden_pressure_points.push(
      "ETF premium collapse — if premium to NAV closes, price falls to NAV without fundamental change",
      "Seed capital withdrawal — if institutional seed investors redeem, AUM falls below viable threshold",
      "Competing narrative launch — new thematic ETF captures the same story with lower fees",
    );
  }

  // ── Behavioral summary ────────────────────────────────────────────────────
  const behavioral_summary = `The ${ticker} incentive landscape is dominated by ${key_players[0] ?? "institutional actors"} whose primary incentive is ${incentives[0] ?? "maintaining the current narrative"}. The narrative is currently in ${sentiment_phase ?? "uncertain"} phase — ${narrative_support.split(".")[0]}. The most dangerous hidden pressure is: ${hidden_pressure_points[0] ?? "unclear"}. The narrative will remain intact as long as ${fear_drivers[0] ? `the primary fear driver (${fear_drivers[0].split(" — ")[0]}) does not materialize` : "no major catalyst disrupts the consensus"}.`;

  return {
    key_players,
    incentives,
    fear_drivers,
    narrative_support,
    narrative_fragility,
    hidden_pressure_points,
    behavioral_summary,
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 5 — POLICY REALITY ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export type ExecutionStrength = "weak" | "moderate" | "strong";

export interface PolicyRealityOutput {
  policy_intent: string;
  execution_strength: ExecutionStrength;
  execution_consistency: string;
  effective_impact: string;
  reversibility: string;
  /** Structural frictions that reduce policy transmission to real economy */
  implementation_friction: string;
  market_pricing: string;
  /** One-paragraph synthesis of policy reality vs market pricing */
  policy_reality_summary: string;
  advisory_only: true;
}

export interface PolicyContext {
  policy_name: string;
  policy_type: "monetary" | "fiscal" | "trade" | "regulatory" | "industrial";
  stated_goal?: string;
  implementation_track_record?: "consistent" | "inconsistent" | "partial" | "unknown";
  political_constraints?: string;
  market_reaction?: "priced_in" | "under_priced" | "over_priced" | "unknown";
  recent_signals?: string[];
}

/**
 * [LEVEL11 Module 5] Analyze policy execution reality vs stated intention.
 * MUST distinguish: policy vs implementation, signal vs real effect.
 */
export function analyzePolicyReality(policyContext: PolicyContext): PolicyRealityOutput {
  const { policy_name, policy_type, stated_goal, implementation_track_record, political_constraints, market_reaction, recent_signals } = policyContext;

  // ── Execution strength ────────────────────────────────────────────────────
  let execution_strength: ExecutionStrength;
  let execution_consistency: string;

  if (implementation_track_record === "consistent") {
    execution_strength = "strong";
    execution_consistency = `${policy_name} has a consistent implementation track record — stated intentions have historically been followed through with concrete actions. Market can price this policy with higher confidence.`;
  } else if (implementation_track_record === "partial") {
    execution_strength = "moderate";
    execution_consistency = `${policy_name} shows partial implementation — some stated goals are achieved while others face structural resistance. Discount the full stated impact by 30-50%.`;
  } else if (implementation_track_record === "inconsistent") {
    execution_strength = "weak";
    execution_consistency = `${policy_name} has an inconsistent track record — announcements frequently diverge from actions. The signal value of this policy is low; wait for concrete implementation evidence before pricing the full impact.`;
  } else {
    execution_strength = "moderate";
    execution_consistency = `${policy_name} track record is unknown — insufficient history to assess execution reliability. Apply uncertainty discount to stated impact.`;
  }

  // ── Policy-type specific effective impact ─────────────────────────────────
  let effective_impact: string;
  let reversibility: string;

  switch (policy_type) {
    case "monetary":
      effective_impact = `Monetary policy operates through the credit channel, asset price channel, and expectations channel. The effective impact depends on: (1) whether financial conditions actually tighten/loosen, (2) whether credit demand responds, and (3) whether inflation expectations are anchored. Stated rate changes are less important than the resulting change in real financial conditions.`;
      reversibility = `Monetary policy is highly reversible — central banks can reverse course within months. However, the real economy impact has a 12-18 month lag, meaning reversals may come too late to prevent damage.`;
      break;
    case "fiscal":
      effective_impact = `Fiscal policy effectiveness depends on the multiplier effect, which varies by: (1) the economy's output gap, (2) crowding-out effects on private investment, and (3) whether spending reaches productive capacity. Announced fiscal packages are often 30-60% smaller in actual disbursement than headline figures.`;
      reversibility = `Fiscal policy is politically difficult to reverse — spending programs create constituencies. Tax cuts are easier to extend than reverse. Effective fiscal tightening requires political will that is rarely sustained.`;
      break;
    case "trade":
      effective_impact = `Trade policy impact is asymmetric — tariffs and restrictions have immediate cost effects on importers and consumers, but the intended industrial policy benefits take years to materialize. Supply chain restructuring costs are real and immediate; the strategic benefits are uncertain and delayed.`;
      reversibility = `Trade policy is moderately reversible but creates path dependencies — once supply chains restructure, reversal is costly. Tariff escalation is easier to initiate than to de-escalate due to domestic political dynamics.`;
      break;
    case "regulatory":
      effective_impact = `Regulatory policy creates compliance costs and behavioral changes, but the effective impact depends on enforcement capacity and industry adaptation. Regulations are often more impactful on smaller players than large incumbents who can absorb compliance costs.`;
      reversibility = `Regulatory policy is difficult to reverse once industry adaptation has occurred — the compliance infrastructure becomes embedded. Deregulation is politically easier than re-regulation.`;
      break;
    case "industrial":
      effective_impact = `Industrial policy effectiveness depends on whether it targets genuine market failures or creates artificial competitive advantages. Subsidies and directed credit can accelerate specific sectors but create overcapacity risks and misallocation of capital.`;
      reversibility = `Industrial policy creates long-term structural dependencies — once industries are built around policy support, withdrawal is politically and economically disruptive.`;
      break;
  }

  // ── Political constraints ─────────────────────────────────────────────────
  if (political_constraints) {
    execution_consistency += ` Political constraint: ${political_constraints}`;
  }

  // ── Market pricing assessment ─────────────────────────────────────────────
  let market_pricing_text: string;
  switch (market_reaction) {
    case "priced_in":
      market_pricing_text = `The market has fully priced this policy — the asymmetric opportunity lies in whether execution exceeds or disappoints expectations, not in the policy announcement itself.`;
      break;
    case "under_priced":
      market_pricing_text = `The market appears to be under-pricing this policy's impact — either due to skepticism about execution or insufficient attention. If execution follows through, the repricing could be significant.`;
      break;
    case "over_priced":
      market_pricing_text = `The market appears to be over-pricing this policy — expectations embed an optimistic execution scenario that the track record does not support. Disappointment risk is elevated.`;
      break;
    default:
      market_pricing_text = `Market pricing of this policy is uncertain — insufficient data to assess whether current prices reflect the true probability-weighted impact.`;
  }

  // ── Recent signals ────────────────────────────────────────────────────────
  if (recent_signals && recent_signals.length > 0) {
    market_pricing_text += ` Recent signals: ${recent_signals.join("; ")}.`;
  }

  // ── Implementation friction ───────────────────────────────────────────────
  const implementation_friction_parts: string[] = [];
  if (policy_type === "trade") {
    implementation_friction_parts.push("WTO dispute resolution timelines (12-24 months) delay enforcement");
    implementation_friction_parts.push("Domestic industry lobbying creates carve-outs that dilute stated impact");
    implementation_friction_parts.push("Retaliation risk forces negotiated exemptions");
  } else if (policy_type === "monetary") {
    implementation_friction_parts.push("Transmission lag of 12-18 months between rate change and real economy impact");
    implementation_friction_parts.push("Credit channel may be impaired if bank lending standards are already tight");
  } else if (policy_type === "fiscal") {
    implementation_friction_parts.push("Legislative approval process creates multi-quarter delay");
    implementation_friction_parts.push("Spending multiplier varies significantly by program type and economic cycle");
  } else if (policy_type === "industrial") {
    implementation_friction_parts.push("Supply chain restructuring takes 3-7 years — policy impact is slow");
    implementation_friction_parts.push("Skilled labor availability constrains reshoring speed");
  } else {
    implementation_friction_parts.push("Regulatory implementation requires agency rulemaking (6-18 months)");
    implementation_friction_parts.push("Legal challenges can delay or modify implementation");
  }
  if (political_constraints) {
    implementation_friction_parts.push(`Political constraint: ${political_constraints}`);
  }
  const implementation_friction = implementation_friction_parts.join(". ");

  // ── Policy reality summary ────────────────────────────────────────────────
  const policy_reality_summary = `${policy_name} states the intent to ${stated_goal ?? "achieve policy objectives"}, but execution strength is ${execution_strength}. The real-world impact (${effective_impact.split(".")[0]}) differs from the headline announcement due to: ${implementation_friction_parts[0] ?? "structural frictions"}. Market is currently ${market_pricing_text.split(".")[0].toLowerCase()}. Reversibility is ${reversibility.split(".")[0].toLowerCase()}, meaning ${execution_strength === "weak" ? "the policy may not land as advertised" : "the policy is likely to have durable market impact"}.`;

  return {
    policy_intent: stated_goal ?? `${policy_name} — stated goal not specified`,
    execution_strength,
    execution_consistency,
    effective_impact,
    reversibility,
    implementation_friction,
    market_pricing: market_pricing_text,
    policy_reality_summary,
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 6 — MARKET SENTIMENT STATE ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export type SentimentPhase =
  | "skepticism"
  | "early_bull"
  | "consensus"
  | "overheat"
  | "fragile"
  | "capitulation";

export interface SentimentStateOutput {
  sentiment_phase: SentimentPhase;
  positioning: string;
  crowdedness: number;   // 0–1 (1 = maximally crowded)
  risk_of_reversal: number;  // 0–1
  phase_description: string;
  advisory_only: true;
}

export interface SentimentContext {
  asset_type: AssetType;
  ticker: string;
  positioning?: "crowded_long" | "crowded_short" | "neutral";
  momentum?: "strong_up" | "moderate_up" | "flat" | "moderate_down" | "strong_down";
  news_sentiment?: "positive" | "negative" | "mixed";
  analyst_consensus?: "strong_buy" | "buy" | "hold" | "sell" | "strong_sell";
  recent_price_change_pct?: number;  // % over recent period
  valuation_vs_history?: "expensive" | "fair" | "cheap" | "unknown";
  short_interest_trend?: "rising" | "falling" | "stable";
}

/**
 * [LEVEL11 Module 6] Detect market sentiment state and phase.
 * Phases: skepticism → early_bull → consensus → overheat → fragile → capitulation
 */
export function detectSentimentState(context: SentimentContext): SentimentStateOutput {
  const { positioning, momentum, news_sentiment, analyst_consensus, recent_price_change_pct, valuation_vs_history, short_interest_trend } = context;

  // ── Score-based phase detection ───────────────────────────────────────────
  let bullScore = 0;
  let bearScore = 0;

  // Positioning
  if (positioning === "crowded_long") bullScore += 3;
  else if (positioning === "crowded_short") bearScore += 3;
  else if (positioning === "neutral") { bullScore += 1; bearScore += 1; }

  // Momentum
  if (momentum === "strong_up") bullScore += 3;
  else if (momentum === "moderate_up") bullScore += 2;
  else if (momentum === "flat") { bullScore += 1; bearScore += 1; }
  else if (momentum === "moderate_down") bearScore += 2;
  else if (momentum === "strong_down") bearScore += 3;

  // News sentiment
  if (news_sentiment === "positive") bullScore += 2;
  else if (news_sentiment === "negative") bearScore += 2;
  else if (news_sentiment === "mixed") { bullScore += 1; bearScore += 1; }

  // Analyst consensus
  if (analyst_consensus === "strong_buy") bullScore += 2;
  else if (analyst_consensus === "buy") bullScore += 1;
  else if (analyst_consensus === "sell" || analyst_consensus === "strong_sell") bearScore += 2;

  // Price change
  if (recent_price_change_pct !== undefined) {
    if (recent_price_change_pct > 30) bullScore += 3;
    else if (recent_price_change_pct > 15) bullScore += 2;
    else if (recent_price_change_pct > 5) bullScore += 1;
    else if (recent_price_change_pct < -30) bearScore += 3;
    else if (recent_price_change_pct < -15) bearScore += 2;
    else if (recent_price_change_pct < -5) bearScore += 1;
  }

  // Valuation
  if (valuation_vs_history === "expensive") bullScore += 2; // Expensive = consensus/overheat
  else if (valuation_vs_history === "cheap") bearScore += 2; // Cheap = skepticism/capitulation

  // Short interest
  if (short_interest_trend === "rising") bearScore += 1;
  else if (short_interest_trend === "falling") bullScore += 1;

  // ── Determine phase ───────────────────────────────────────────────────────
  let sentiment_phase: SentimentPhase;
  let crowdedness: number;
  let risk_of_reversal: number;

  const total = bullScore + bearScore;
  const bullRatio = total > 0 ? bullScore / total : 0.5;

  if (bullRatio >= 0.85 && valuation_vs_history === "expensive") {
    sentiment_phase = "overheat";
    crowdedness = 0.90;
    risk_of_reversal = 0.85;
  } else if (bullRatio >= 0.75 && positioning === "crowded_long") {
    sentiment_phase = "consensus";
    crowdedness = 0.78;
    risk_of_reversal = 0.65;
  } else if (bullRatio >= 0.65) {
    sentiment_phase = "early_bull";
    crowdedness = 0.45;
    risk_of_reversal = 0.35;
  } else if (bullRatio >= 0.55 && (momentum === "moderate_down" || momentum === "flat")) {
    sentiment_phase = "fragile";
    crowdedness = 0.60;
    risk_of_reversal = 0.72;
  } else if (bullRatio <= 0.30 && (momentum === "strong_down" || recent_price_change_pct !== undefined && recent_price_change_pct < -20)) {
    sentiment_phase = "capitulation";
    crowdedness = 0.15;
    risk_of_reversal = 0.40; // Risk of reversal = upside risk
  } else {
    sentiment_phase = "skepticism";
    crowdedness = 0.30;
    risk_of_reversal = 0.45;
  }

  // ── Phase descriptions ────────────────────────────────────────────────────
  const phaseDescriptions: Record<SentimentPhase, string> = {
    skepticism: "Asset is in skepticism phase — the bull case is not yet widely accepted. Institutional positioning is light, sell-side coverage is cautious, and the narrative lacks momentum. This is where asymmetric opportunities often emerge.",
    early_bull: "Asset is in early bull phase — the narrative is gaining traction but not yet consensus. Institutional adoption is beginning, momentum is building, and the risk/reward remains favorable for new entrants.",
    consensus: "Asset has reached consensus phase — the bull narrative is widely accepted and institutionally endorsed. Crowded positioning increases fragility; the asymmetric opportunity has largely been captured by early movers.",
    overheat: "Asset is in overheat phase — valuation has disconnected from fundamentals, positioning is maximally crowded, and the narrative has become self-reinforcing. Risk of sharp reversal is elevated.",
    fragile: "Asset is in fragile phase — the bull narrative is intact but increasingly dependent on a narrow set of positive catalysts. Any disappointment triggers disproportionate selling from crowded longs.",
    capitulation: "Asset is in capitulation phase — forced selling has exhausted supply and the narrative has been discredited. Contrarian opportunity may be emerging, but distinguishing cyclical from structural damage is critical.",
  };

  const positioning_text = positioning === "crowded_long"
    ? "Crowded long — institutional and retail positioning is heavily skewed to the upside"
    : positioning === "crowded_short"
    ? "Crowded short — significant short interest creates squeeze risk on positive catalysts"
    : "Neutral positioning — no dominant directional bias from positioning data";

  return {
    sentiment_phase,
    positioning: positioning_text,
    crowdedness: Math.round(crowdedness * 100) / 100,
    risk_of_reversal: Math.round(risk_of_reversal * 100) / 100,
    phase_description: phaseDescriptions[sentiment_phase],
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 7 — CROSS-ASSET PROPAGATION ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export interface PropagationLink {
  from: string;
  to: string;
  mechanism: string;
  lag: string;
  confidence: number;  // 0–1
}

export interface PropagationChainOutput {
  event: string;
  chain: PropagationLink[];
  terminal_impact: string;
  uncertainty_note: string;
  advisory_only: true;
}

export interface PropagationContext {
  event: string;
  event_type: "tariff" | "rate_change" | "geopolitical" | "earnings_shock" | "liquidity_event" | "policy_shift" | "commodity_shock";
  magnitude?: "small" | "medium" | "large" | "extreme";
  affected_assets?: string[];
  macro_context?: {
    current_regime?: string;
    credit_conditions?: "tight" | "normal" | "loose";
    dollar_trend?: "rising" | "falling" | "stable";
  };
}

/**
 * [LEVEL11 Module 7] Build cross-asset propagation chain.
 * Example: tariff ↑ → cost ↑ → inflation ↑ → rate expectations ↑ → equities ↓
 */
export function buildPropagationChain(context: PropagationContext): PropagationChainOutput {
  const { event, event_type, magnitude, macro_context } = context;
  const chain: PropagationLink[] = [];
  const magMultiplier = magnitude === "extreme" ? 1.0 : magnitude === "large" ? 0.85 : magnitude === "medium" ? 0.70 : 0.50;

  switch (event_type) {
    case "tariff":
      chain.push(
        {
          from: "Tariff announcement",
          to: "Import cost increase",
          mechanism: "Direct cost pass-through — importers face higher input costs immediately upon tariff implementation",
          lag: "Immediate to 3 months",
          confidence: 0.90 * magMultiplier + 0.10,
        },
        {
          from: "Import cost increase",
          to: "Consumer price inflation",
          mechanism: "Cost pass-through from producers to consumers — magnitude depends on demand elasticity and competitive dynamics",
          lag: "1-6 months",
          confidence: 0.75 * magMultiplier + 0.10,
        },
        {
          from: "Consumer price inflation",
          to: "Rate expectations increase",
          mechanism: "Higher inflation forces central bank to maintain or increase rates — reduces probability of rate cuts",
          lag: "1-3 months after inflation data",
          confidence: 0.72 * magMultiplier + 0.10,
        },
        {
          from: "Rate expectations increase",
          to: "Equity multiple compression",
          mechanism: "Higher discount rate reduces present value of future earnings — growth stocks most affected",
          lag: "Immediate to 2 months",
          confidence: 0.78 * magMultiplier + 0.10,
        },
        {
          from: "Tariff announcement",
          to: "Supply chain restructuring",
          mechanism: "Companies accelerate reshoring and supplier diversification — creates near-term capex increase and margin pressure",
          lag: "6-24 months",
          confidence: 0.65 * magMultiplier + 0.10,
        },
        {
          from: "Supply chain restructuring",
          to: "Commodity demand shift",
          mechanism: "Reshoring increases demand for domestic industrial commodities (steel, copper, energy) while reducing demand for imported goods",
          lag: "12-36 months",
          confidence: 0.55 * magMultiplier + 0.10,
        },
      );
      break;

    case "rate_change":
      if (event.toLowerCase().includes("cut") || event.toLowerCase().includes("lower")) {
        chain.push(
          {
            from: "Rate cut",
            to: "Credit conditions ease",
            mechanism: "Lower borrowing costs reduce debt service burden and increase credit availability",
            lag: "Immediate to 3 months",
            confidence: 0.88,
          },
          {
            from: "Credit conditions ease",
            to: "Equity multiple expansion",
            mechanism: "Lower discount rate increases present value of future cash flows — growth stocks benefit most",
            lag: "Immediate to 1 month",
            confidence: 0.82,
          },
          {
            from: "Rate cut",
            to: "USD weakening",
            mechanism: "Lower rates reduce yield differential — capital flows to higher-yielding currencies",
            lag: "Immediate to 2 months",
            confidence: 0.75,
          },
          {
            from: "USD weakening",
            to: "Commodity price increase",
            mechanism: "Weaker dollar makes dollar-denominated commodities cheaper for non-USD buyers — increases demand",
            lag: "1-4 weeks",
            confidence: 0.72,
          },
          {
            from: "Rate cut",
            to: "Emerging market capital inflows",
            mechanism: "Lower US rates reduce the relative attractiveness of USD assets — capital flows to EM for higher yields",
            lag: "1-3 months",
            confidence: 0.65,
          },
        );
      } else {
        // Rate hike
        chain.push(
          {
            from: "Rate hike",
            to: "Credit conditions tighten",
            mechanism: "Higher borrowing costs increase debt service burden and reduce credit availability",
            lag: "Immediate to 3 months",
            confidence: 0.88,
          },
          {
            from: "Credit conditions tighten",
            to: "Equity multiple compression",
            mechanism: "Higher discount rate reduces present value of future cash flows — long-duration assets most affected",
            lag: "Immediate to 2 months",
            confidence: 0.82,
          },
          {
            from: "Rate hike",
            to: "USD strengthening",
            mechanism: "Higher rates increase yield differential — capital flows to USD for higher returns",
            lag: "Immediate to 2 months",
            confidence: 0.78,
          },
          {
            from: "USD strengthening",
            to: "Commodity price pressure",
            mechanism: "Stronger dollar makes dollar-denominated commodities more expensive for non-USD buyers — reduces demand",
            lag: "1-4 weeks",
            confidence: 0.70,
          },
        );
      }
      break;

    case "geopolitical":
      chain.push(
        {
          from: "Geopolitical shock",
          to: "Risk-off sentiment",
          mechanism: "Uncertainty triggers flight to safety — investors reduce risk exposure and increase cash/safe haven allocation",
          lag: "Immediate",
          confidence: 0.90,
        },
        {
          from: "Risk-off sentiment",
          to: "Safe haven asset appreciation",
          mechanism: "Gold, USD, US Treasuries, JPY benefit from safe haven flows",
          lag: "Immediate to 1 week",
          confidence: 0.85,
        },
        {
          from: "Geopolitical shock",
          to: "Energy supply disruption risk",
          mechanism: "Geopolitical events in key producing regions create supply uncertainty — oil and gas prices spike on risk premium",
          lag: "Immediate to 2 weeks",
          confidence: 0.75,
        },
        {
          from: "Energy supply disruption risk",
          to: "Inflation expectations increase",
          mechanism: "Higher energy costs feed into broader inflation — central banks face stagflationary dilemma",
          lag: "1-3 months",
          confidence: 0.65,
        },
        {
          from: "Risk-off sentiment",
          to: "Emerging market capital outflows",
          mechanism: "Risk-off triggers EM capital flight — currencies weaken, rates rise, and financial conditions tighten",
          lag: "Immediate to 1 month",
          confidence: 0.78,
        },
      );
      break;

    case "earnings_shock":
      chain.push(
        {
          from: "Earnings shock",
          to: "Single-stock repricing",
          mechanism: "Earnings miss/beat triggers immediate price discovery — magnitude depends on miss size vs expectations",
          lag: "Immediate",
          confidence: 0.95,
        },
        {
          from: "Single-stock repricing",
          to: "Sector sentiment shift",
          mechanism: "Large-cap earnings results update market's view of sector fundamentals — peers re-rated",
          lag: "1-5 days",
          confidence: 0.70,
        },
        {
          from: "Sector sentiment shift",
          to: "Index rebalancing flows",
          mechanism: "Sector weight changes trigger passive fund rebalancing — amplifies initial move",
          lag: "1-2 weeks",
          confidence: 0.55,
        },
      );
      break;

    case "liquidity_event":
      chain.push(
        {
          from: "Liquidity event",
          to: "Forced asset selling",
          mechanism: "Liquidity stress forces leveraged players to sell assets — correlation across asset classes rises",
          lag: "Immediate",
          confidence: 0.90,
        },
        {
          from: "Forced asset selling",
          to: "Cross-asset correlation spike",
          mechanism: "Deleveraging sells everything — safe havens and risk assets fall together in initial phase",
          lag: "Immediate to 1 week",
          confidence: 0.82,
        },
        {
          from: "Cross-asset correlation spike",
          to: "Credit spread widening",
          mechanism: "Liquidity stress raises credit risk premium — spreads widen as lenders demand higher compensation",
          lag: "1-4 weeks",
          confidence: 0.78,
        },
        {
          from: "Credit spread widening",
          to: "Real economy tightening",
          mechanism: "Higher credit costs reduce business investment and consumer borrowing — real economy impact with lag",
          lag: "3-12 months",
          confidence: 0.65,
        },
      );
      break;

    case "commodity_shock":
      chain.push(
        {
          from: "Commodity price shock",
          to: "Input cost increase",
          mechanism: "Higher commodity prices increase production costs across energy-intensive and materials-intensive industries",
          lag: "1-3 months",
          confidence: 0.85,
        },
        {
          from: "Input cost increase",
          to: "Margin compression",
          mechanism: "Companies unable to pass through full cost increases face margin compression — earnings estimates cut",
          lag: "1-2 quarters",
          confidence: 0.75,
        },
        {
          from: "Commodity price shock",
          to: "Inflation expectations",
          mechanism: "Energy and food price shocks directly feed into CPI — central banks face pressure to tighten",
          lag: "1-3 months",
          confidence: 0.80,
        },
        {
          from: "Inflation expectations",
          to: "Consumer spending reduction",
          mechanism: "Higher prices reduce real purchasing power — discretionary spending contracts",
          lag: "2-6 months",
          confidence: 0.70,
        },
      );
      break;

    default:
      chain.push(
        {
          from: event,
          to: "Market uncertainty",
          mechanism: "Unclassified policy shift creates uncertainty — market reprices risk premium",
          lag: "Immediate to 1 month",
          confidence: 0.60,
        },
      );
  }

  // Apply macro context adjustments
  if (macro_context?.credit_conditions === "tight") {
    chain.forEach(link => {
      if (link.to.includes("credit") || link.to.includes("equity")) {
        link.confidence = Math.min(1.0, link.confidence * 1.15);
      }
    });
  }

  // Terminal impact
  const lastLink = chain[chain.length - 1];
  const terminal_impact = `The propagation chain terminates at: ${lastLink.to}. The full transmission from "${event}" to terminal impact has an estimated total lag of ${chain.reduce((acc, l) => acc + (l.lag.includes("month") ? 3 : 1), 0)} weeks to ${chain.length * 3} months, with confidence degrading at each step.`;

  const uncertainty_note = `Propagation chains are conditional — each link depends on the previous one materializing. The chain can be broken by: (1) policy intervention at any node, (2) offsetting economic forces, or (3) narrative shifts that change market behavior before the real economy impact arrives.`;

  return {
    event,
    chain,
    terminal_impact,
    uncertainty_note,
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 8 — SCENARIO & CONDITIONAL REASONING
// ─────────────────────────────────────────────────────────────────────────────

export interface ScenarioMapOutput {
  base_case: string;
  bull_case: string;
  bear_case: string;
  key_triggers: string[];
  invalidations: string[];
  advisory_only: true;
}

export interface ScenarioContext {
  asset_type: AssetType;
  ticker: string;
  current_thesis?: string;
  real_drivers?: DriverSignal[];
  sentiment_phase?: SentimentPhase;
  policy_context?: PolicyRealityOutput;
  propagation_chain?: PropagationChainOutput;
  regime_tag?: string;
  thesis_confidence?: number;
}

/**
 * [LEVEL11 Module 8] Build conditional scenario map.
 * RULE: No prediction. Only conditional reasoning.
 * Each scenario must be triggered by specific, observable conditions.
 */
export function buildScenarioMap(context: ScenarioContext): ScenarioMapOutput {
  const { asset_type, ticker, real_drivers, sentiment_phase, regime_tag, thesis_confidence, current_thesis } = context;

  const primaryDriver = real_drivers?.[0]?.driver ?? "primary driver";
  const primaryDriverType = real_drivers?.[0]?.type ?? "mixed";
  const confidence = thesis_confidence ?? 0.5;

  // ── Asset-type specific scenarios ─────────────────────────────────────────
  let base_case: string;
  let bull_case: string;
  let bear_case: string;
  const key_triggers: string[] = [];
  const invalidations: string[] = [];

  if (asset_type === "equity") {
    base_case = `${ticker} continues on its current trajectory — ${current_thesis ?? "the existing business thesis holds"}. Earnings grow in line with consensus expectations, margins remain stable, and the business maintains its competitive position. Multiple stays range-bound as the narrative neither accelerates nor deteriorates. This scenario requires: (1) no material earnings miss, (2) no competitive disruption, (3) macro environment remains supportive.`;

    bull_case = `${ticker} outperforms if: (1) earnings acceleration exceeds consensus by 15%+, (2) margin expansion signals pricing power improvement, (3) management announces capital return program or strategic catalyst. The bull case requires the ${primaryDriver} to strengthen materially — not just hold. Multiple expansion is possible if the narrative shifts from "value" to "growth" framing.`;

    bear_case = `${ticker} underperforms if: (1) earnings miss by 10%+ with guidance cut, (2) competitive pressure accelerates margin compression, (3) management credibility is damaged by capital allocation misstep. The bear case is most likely if ${primaryDriverType === "narrative" ? "the narrative-driven premium deflates without fundamental support" : "the real driver deteriorates faster than the market expects"}.`;

    key_triggers.push(
      "Quarterly earnings vs consensus — direction of guidance revision is the key signal",
      "Margin trajectory — expansion signals pricing power, compression signals competitive pressure",
      "Management capital allocation decisions — buybacks vs acquisitions vs debt reduction",
      "Competitor actions — pricing moves, product launches, market share shifts",
    );

    invalidations.push(
      "Earnings miss + guidance cut in the same quarter — invalidates the growth thesis",
      "Management credibility event (accounting irregularity, unexpected CEO departure)",
      "Structural competitive disruption — new entrant or technology shift changes the moat",
      "Macro regime shift to contraction — invalidates all growth assumptions",
    );

  } else if (asset_type === "commodity") {
    base_case = `${ticker} trades in a range as the current supply-demand balance and real yield environment remain stable. The geopolitical risk premium neither expands nor contracts materially. This scenario requires: (1) real yields stay within current range, (2) no major supply disruption, (3) USD strength/weakness remains moderate.`;

    bull_case = `${ticker} appreciates materially if: (1) real yields decline significantly (central bank pivot or inflation spike), (2) supply disruption from geopolitical event or production cut, (3) demand surge from industrial recovery or central bank accumulation. The bull case requires at least two of these three conditions to materialize simultaneously.`;

    bear_case = `${ticker} declines if: (1) real yields rise sharply (Fed hawkishness or disinflation), (2) USD strengthens significantly, (3) demand destruction from economic slowdown, (4) supply increase from new production or inventory release. The bear case is most dangerous when all three align.`;

    key_triggers.push(
      "Real yield direction — the single most important variable for gold and silver",
      "Fed communication — any pivot signal immediately reprices commodity complex",
      "USD index direction — inverse correlation with commodity prices",
      "Geopolitical escalation/de-escalation — risk premium expansion/contraction",
    );

    invalidations.push(
      "Sustained real yield increase above 2% — invalidates the commodity bull thesis",
      "Demand destruction from global recession — invalidates supply-constraint thesis",
      "Major supply increase (OPEC+ production hike, new mine discovery) — invalidates scarcity thesis",
    );

  } else if (asset_type === "index") {
    base_case = `${ticker} trades in a range as earnings growth meets consensus expectations and the rate environment remains stable. The liquidity backdrop neither tightens nor loosens materially. This scenario requires: (1) earnings growth of 8-12% YoY, (2) no rate surprise in either direction, (3) credit conditions remain benign.`;

    bull_case = `${ticker} re-rates higher if: (1) earnings growth accelerates above 15% on AI productivity gains, (2) Fed pivots to rate cuts earlier than expected, (3) credit conditions ease and liquidity expands. The bull case requires the liquidity and earnings cycles to align positively — rare but powerful when it occurs.`;

    bear_case = `${ticker} de-rates if: (1) earnings recession materializes (negative YoY growth), (2) credit event triggers liquidity withdrawal, (3) concentration risk in top holdings reverses — the index is only as strong as its top 5-10 holdings. The bear case is amplified by crowded long positioning.`;

    key_triggers.push(
      "Fed communication — rate cut timing and pace is the primary multiple driver",
      "Earnings season — particularly the top 10 index constituents",
      "Credit spreads — widening signals financial stress before it hits equities",
      "Index concentration — if top holdings diverge, the index masks underlying weakness",
    );

    invalidations.push(
      "Earnings recession — two consecutive quarters of negative YoY earnings growth",
      "Credit event — any major financial institution stress triggers systemic risk repricing",
      "Fed hawkish surprise — rate hike when market expects cut invalidates the bull thesis",
    );

  } else {
    // ETF
    base_case = `${ticker} tracks its underlying narrative — fund flows remain stable and the underlying holdings perform in line with the theme. This scenario requires: (1) the narrative remains media-relevant, (2) underlying holdings deliver on the theme's promise, (3) no major redemption wave.`;

    bull_case = `${ticker} outperforms if: (1) the underlying narrative accelerates (e.g., AI adoption exceeds expectations), (2) institutional adoption of the theme increases, (3) underlying holdings deliver earnings that validate the narrative. The bull case requires the narrative to transition from "speculative" to "fundamental."`;

    bear_case = `${ticker} underperforms if: (1) the narrative loses media attention, (2) underlying holdings disappoint on earnings, (3) a redemption wave forces selling of concentrated positions. The bear case is most dangerous for thematic ETFs because the underlying holdings are often correlated — forced selling amplifies the decline.`;

    key_triggers.push(
      "Fund flow data — weekly/monthly inflows/outflows signal narrative momentum",
      "Underlying holdings earnings — do the fundamentals support the narrative?",
      "Premium/discount to NAV — widening premium signals narrative overextension",
      "Media and analyst attention — narrative momentum is self-reinforcing until it isn't",
    );

    invalidations.push(
      "Sustained fund outflows for 3+ consecutive months — narrative is losing momentum",
      "Multiple underlying holdings miss earnings — fundamentals don't support the theme",
      "Competing narrative emerges — capital rotates to the new story",
    );
  }

  // ── Sentiment-phase adjustments ───────────────────────────────────────────
  if (sentiment_phase === "overheat") {
    bear_case += ` Note: overheat sentiment phase significantly elevates bear case probability — the asset is priced for perfection and any disappointment triggers disproportionate selling.`;
    invalidations.push("Sentiment phase shift from overheat to fragile — often the first signal of a trend reversal");
  } else if (sentiment_phase === "capitulation") {
    bull_case += ` Note: capitulation phase creates asymmetric upside — forced selling has exhausted supply and any positive catalyst triggers a sharp recovery.`;
    key_triggers.push("Capitulation exhaustion signal — volume spike on down day followed by reversal");
  }

  // ── Confidence-based uncertainty note ─────────────────────────────────────
  if (confidence < 0.40) {
    base_case = `[LOW CONVICTION — ${(confidence * 100).toFixed(0)}% confidence] ` + base_case;
    invalidations.push("Low thesis confidence means the base case itself is uncertain — treat all scenarios with elevated uncertainty");
  }

  return {
    base_case,
    bull_case,
    bear_case,
    key_triggers,
    invalidations,
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSITE: Full Level 11 Context Builder
// ─────────────────────────────────────────────────────────────────────────────

export interface Level11AnalysisOutput {
  classification: AssetClassification;
  driver_route: DriverEngineRoute;
  real_drivers: RealDriversOutput;
  incentives: IncentiveAnalysisOutput;
  sentiment_state: SentimentStateOutput;
  scenario_map: ScenarioMapOutput;
  policy_reality?: PolicyRealityOutput;
  propagation_chain?: PropagationChainOutput;
  advisory_only: true;
}

/**
 * [LEVEL11 Composite] Run the full Level 11 analysis pipeline for an asset.
 * Combines: classification + routing + drivers + incentives + sentiment + scenarios.
 * Policy reality and propagation chain are optional (require additional context).
 */
export function runLevel11Analysis(params: {
  assetInput: AssetClassificationInput;
  driverContext: Omit<RealDriverContext, "asset_type">;
  incentiveContext: Omit<IncentiveContext, "asset_type">;
  sentimentContext: Omit<SentimentContext, "asset_type">;
  scenarioContext?: Omit<ScenarioContext, "asset_type">;
  policyContext?: PolicyContext;
  propagationContext?: PropagationContext;
}): Level11AnalysisOutput {
  const classification = classifyAsset(params.assetInput);
  const driver_route = routeDriverEngine(classification.asset_type);

  const real_drivers = identifyRealDrivers({
    ...params.driverContext,
    asset_type: classification.asset_type,
  });

  const incentives = analyzeIncentives({
    ...params.incentiveContext,
    asset_type: classification.asset_type,
    sentiment_phase: undefined, // Will be set after sentiment detection
  });

  const sentiment_state = detectSentimentState({
    ...params.sentimentContext,
    asset_type: classification.asset_type,
  });

  // Update incentives with detected sentiment phase
  const incentivesWithSentiment = analyzeIncentives({
    ...params.incentiveContext,
    asset_type: classification.asset_type,
    sentiment_phase: sentiment_state.sentiment_phase,
  });

  const scenario_map = buildScenarioMap({
    ...params.scenarioContext,
    asset_type: classification.asset_type,
    ticker: params.scenarioContext?.ticker ?? params.assetInput.ticker,
    real_drivers: real_drivers.drivers,
    sentiment_phase: sentiment_state.sentiment_phase,
  });

  const policy_reality = params.policyContext
    ? analyzePolicyReality(params.policyContext)
    : undefined;

  const propagation_chain = params.propagationContext
    ? buildPropagationChain(params.propagationContext)
    : undefined;

  return {
    classification,
    driver_route,
    real_drivers,
    incentives: incentivesWithSentiment,
    sentiment_state,
    scenario_map,
    policy_reality,
    propagation_chain,
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 11 — EXTERNAL DATA DISCOVERY PROTOCOL
// ─────────────────────────────────────────────────────────────────────────────

export type DataSourceCategory =
  | "macro_yield"
  | "supply_demand"
  | "positioning"
  | "sentiment"
  | "policy_tracking"
  | "earnings"
  | "flow"
  | "cross_asset";

export interface ExternalDataCandidate {
  /** Human-readable name of the data source */
  source_name: string;
  /** Category of data this source provides */
  category: DataSourceCategory;
  /** What specific signal this source provides for the asset */
  signal_description: string;
  /** How frequently this data is updated */
  update_frequency: "real_time" | "daily" | "weekly" | "monthly" | "quarterly";
  /** Priority: 1 = critical, 2 = important, 3 = supplementary */
  priority: 1 | 2 | 3;
  /** Specific field or metric to monitor */
  key_metric: string;
  advisory_only: true;
}

export interface ExternalDataDiscoveryOutput {
  asset_type: AssetType;
  ticker: string;
  candidates: ExternalDataCandidate[];
  /** The single highest-priority data source for this asset */
  primary_source: string;
  /** Summary of what data gaps exist for confident analysis */
  data_gap_summary: string;
  advisory_only: true;
}

/**
 * [LEVEL11 Phase 11] Discover external data candidates for a given asset.
 * PROTOCOL: For each asset type, identify the most important external data sources
 * that would improve signal quality and reduce analytical uncertainty.
 * This is a DISCOVERY function — it tells you what to look for, not what the data says.
 */
export function discoverExternalDataCandidates(params: {
  asset_type: AssetType;
  ticker: string;
  current_drivers?: DriverSignal[];
  current_gaps?: string[];
}): ExternalDataDiscoveryOutput {
  const { asset_type, ticker, current_drivers, current_gaps } = params;
  const candidates: ExternalDataCandidate[] = [];

  // ── Asset-type specific data sources ─────────────────────────────────────
  if (asset_type === "equity") {
    candidates.push(
      {
        source_name: "SEC EDGAR — Quarterly Filings (10-Q/10-K)",
        category: "earnings",
        signal_description: "Primary source for revenue, margin, FCF, and management commentary — the ground truth for equity analysis",
        update_frequency: "quarterly",
        priority: 1,
        key_metric: "Operating margin trend, FCF yield, guidance language tone",
        advisory_only: true,
      },
      {
        source_name: "Earnings Call Transcripts",
        category: "earnings",
        signal_description: "Management tone, forward guidance specificity, and analyst question focus reveal real vs narrative driver alignment",
        update_frequency: "quarterly",
        priority: 1,
        key_metric: "Guidance revision direction, management confidence language, analyst pushback topics",
        advisory_only: true,
      },
      {
        source_name: "Insider Transaction Data (SEC Form 4)",
        category: "sentiment",
        signal_description: "Insider buying/selling clusters are the most reliable sentiment signal — insiders know the business better than any analyst",
        update_frequency: "daily",
        priority: 2,
        key_metric: "Net insider transaction direction over rolling 90 days",
        advisory_only: true,
      },
      {
        source_name: "Short Interest Data (FINRA)",
        category: "positioning",
        signal_description: "Short interest as % of float reveals institutional conviction on the bear case — rising short interest confirms thesis deterioration",
        update_frequency: "weekly",
        priority: 2,
        key_metric: "Short interest % of float, days-to-cover ratio",
        advisory_only: true,
      },
      {
        source_name: "Analyst Estimate Revisions (Bloomberg/FactSet)",
        category: "earnings",
        signal_description: "Earnings estimate revision direction is a leading indicator of fundamental momentum — revisions lead price",
        update_frequency: "daily",
        priority: 2,
        key_metric: "EPS revision breadth (% of analysts revising up vs down)",
        advisory_only: true,
      },
    );
  }

  if (asset_type === "commodity") {
    candidates.push(
      {
        source_name: "TIPS Yield (Federal Reserve H.15)",
        category: "macro_yield",
        signal_description: "10-year TIPS yield is the single most important real driver for gold and silver — the opportunity cost of holding non-yielding assets",
        update_frequency: "daily",
        priority: 1,
        key_metric: "10Y TIPS yield level and 30-day rate of change",
        advisory_only: true,
      },
      {
        source_name: "CFTC Commitment of Traders (COT)",
        category: "positioning",
        signal_description: "Speculative positioning in commodity futures reveals crowding — extreme long/short positioning signals reversal risk",
        update_frequency: "weekly",
        priority: 1,
        key_metric: "Net speculative position as % of open interest, vs historical percentile",
        advisory_only: true,
      },
      {
        source_name: "EIA Weekly Inventory Report",
        category: "supply_demand",
        signal_description: "For energy commodities — weekly inventory changes are the most timely supply-demand signal",
        update_frequency: "weekly",
        priority: 1,
        key_metric: "Crude/product inventory change vs consensus expectation",
        advisory_only: true,
      },
      {
        source_name: "DXY Index (USD)",
        category: "macro_yield",
        signal_description: "USD strength/weakness is a structural driver for all dollar-denominated commodities — inverse correlation is well-established",
        update_frequency: "real_time",
        priority: 1,
        key_metric: "DXY level, 20-day momentum, and correlation with commodity price",
        advisory_only: true,
      },
      {
        source_name: "Central Bank Gold Reserve Data (IMF/WGC)",
        category: "flow",
        signal_description: "Central bank gold buying/selling is a structural flow driver that can overwhelm retail demand — monthly data",
        update_frequency: "monthly",
        priority: 2,
        key_metric: "Net central bank gold purchases/sales (tonnes per quarter)",
        advisory_only: true,
      },
    );
  }

  if (asset_type === "index") {
    candidates.push(
      {
        source_name: "Fed Funds Futures (CME FedWatch)",
        category: "macro_yield",
        signal_description: "Market-implied rate path is the primary multiple driver for equity indices — the most important forward-looking macro signal",
        update_frequency: "real_time",
        priority: 1,
        key_metric: "Probability of rate cut/hike at next 3 FOMC meetings",
        advisory_only: true,
      },
      {
        source_name: "Credit Spreads (CDX IG/HY)",
        category: "cross_asset",
        signal_description: "Credit spreads are a leading indicator of equity stress — widening precedes equity selloffs by 2-4 weeks historically",
        update_frequency: "daily",
        priority: 1,
        key_metric: "CDX IG and HY spread level vs 6-month average, rate of change",
        advisory_only: true,
      },
      {
        source_name: "AAII Investor Sentiment Survey",
        category: "sentiment",
        signal_description: "Retail investor sentiment is a contrarian indicator at extremes — extreme bullishness signals crowding, extreme bearishness signals capitulation",
        update_frequency: "weekly",
        priority: 2,
        key_metric: "Bull-bear spread vs historical percentile",
        advisory_only: true,
      },
      {
        source_name: "S&P 500 Earnings Revision Breadth",
        category: "earnings",
        signal_description: "Aggregate earnings revision direction for the index is a leading indicator of fundamental momentum",
        update_frequency: "weekly",
        priority: 2,
        key_metric: "% of S&P 500 companies with upward EPS revisions in rolling 4 weeks",
        advisory_only: true,
      },
      {
        source_name: "Index Concentration Metrics",
        category: "flow",
        signal_description: "Top 10 holdings weight in the index — high concentration means index performance is driven by a few stocks, creating hidden single-stock risk",
        update_frequency: "monthly",
        priority: 2,
        key_metric: "Top 10 holdings % of total index weight",
        advisory_only: true,
      },
    );
  }

  if (asset_type === "etf_equity" || asset_type === "etf_sector" || asset_type === "etf_macro") {
    candidates.push(
      {
        source_name: "ETF Flow Data (Bloomberg/ETF.com)",
        category: "flow",
        signal_description: "Weekly ETF inflow/outflow data is the primary driver signal for thematic ETFs — flows are both cause and effect",
        update_frequency: "daily",
        priority: 1,
        key_metric: "Weekly net flows as % of AUM, 4-week rolling trend",
        advisory_only: true,
      },
      {
        source_name: "Premium/Discount to NAV",
        category: "sentiment",
        signal_description: "ETF trading at significant premium to NAV signals narrative overextension — premium collapses when sentiment reverses",
        update_frequency: "daily",
        priority: 1,
        key_metric: "Premium/discount % vs historical average, and trend direction",
        advisory_only: true,
      },
      {
        source_name: "Top Holdings Earnings Performance",
        category: "earnings",
        signal_description: "Do the top 10 holdings deliver earnings that validate the ETF's narrative? Fundamental validation is the bridge from narrative to real driver",
        update_frequency: "quarterly",
        priority: 2,
        key_metric: "Top 10 holdings earnings beat/miss rate and guidance direction",
        advisory_only: true,
      },
      {
        source_name: "Competing ETF Launch Tracker",
        category: "flow",
        signal_description: "New competing ETFs in the same theme signal narrative saturation — capital splits and the original ETF loses flow momentum",
        update_frequency: "monthly",
        priority: 3,
        key_metric: "Number of competing ETFs launched in the same theme in the past 12 months",
        advisory_only: true,
      },
    );
  }

  // ── Cross-asset universal sources ─────────────────────────────────────────
  candidates.push(
    {
      source_name: "VIX (CBOE Volatility Index)",
      category: "sentiment",
      signal_description: "VIX is the universal fear gauge — spikes above 30 signal regime shift, sustained low VIX signals complacency",
      update_frequency: "real_time",
      priority: 2,
      key_metric: "VIX level, 20-day average, and term structure (VIX vs VIX3M)",
      advisory_only: true,
    },
    {
      source_name: "Google Trends — Ticker Search Volume",
      category: "sentiment",
      signal_description: "Retail search interest is a contrarian sentiment indicator — extreme spikes signal narrative peak and crowding",
      update_frequency: "weekly",
      priority: 3,
      key_metric: "Search volume trend vs 12-month baseline, spike detection",
      advisory_only: true,
    },
  );

  // ── Add driver-specific sources ───────────────────────────────────────────
  if (current_drivers) {
    for (const driver of current_drivers.slice(0, 3)) {
      if (driver.type === "narrative") {
        candidates.push({
          source_name: `Narrative Validation: ${driver.driver}`,
          category: "sentiment",
          signal_description: `Monitor whether the "${driver.driver}" narrative is gaining or losing fundamental support. Key signal: ${driver.monitoring_signal}`,
          update_frequency: "weekly",
          priority: 2,
          key_metric: driver.monitoring_signal,
          advisory_only: true,
        });
      }
    }
  }

  // Sort by priority
  candidates.sort((a, b) => a.priority - b.priority);

  const primary_source = candidates[0]?.source_name ?? "No primary source identified";

  // ── Data gap summary ──────────────────────────────────────────────────────
  const gapParts: string[] = [];
  if (asset_type === "equity") {
    gapParts.push("Most critical gap: real-time earnings revision data and insider transaction clustering");
  } else if (asset_type === "commodity") {
    gapParts.push("Most critical gap: real-time TIPS yield and CFTC positioning data");
  } else if (asset_type === "index") {
    gapParts.push("Most critical gap: real-time Fed funds futures and credit spread data");
  } else {
    gapParts.push("Most critical gap: daily ETF flow data and premium/discount to NAV");
  }
  if (current_gaps && current_gaps.length > 0) {
    gapParts.push(`User-identified gaps: ${current_gaps.join("; ")}`);
  }
  const data_gap_summary = gapParts.join(". ");

  return {
    asset_type,
    ticker,
    candidates,
    primary_source,
    data_gap_summary,
    advisory_only: true,
  };
}
