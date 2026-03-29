/**
 * DanTree System Entry Point — LEVEL8.2 Live Data Integration
 *
 * ONLY allowed persist path:
 *   runDanTreeSystem → runLevel7PipelineWithPersist → persistPipelineRun
 *
 * Direct calls to persistPipelineRun or persistRun tRPC from outside this
 * module are FORBIDDEN by design (enforced via runtime guard in routers.ts).
 *
 * advisory_only: ALWAYS true | auto_trade_allowed: NEVER
 *
 * Data sources:
 * - Yahoo Finance: price momentum, volatility, valuation proxy
 * - Finnhub: news sentiment, event detection
 * - FRED: macro exposure (Fed Funds Rate, 10Y yield)
 * - DB: real portfolio holdings (portfolioPosition table)
 */

import {
  runLevel7PipelineWithPersist,
  type Level7PipelineInput,
  type Level7PipelineOutput,
} from "./portfolioDecisionRanker";
import type { Holding } from "./portfolioState";
import { fuseMultipleSignals, type SignalInput } from "./portfolioState";
import { buildSignalsFromLiveData, liveSignalToSignalInput } from "./liveSignalEngine";
import { runInvestorThinking, type InvestorThinkingOutput } from "./investorThinkingLayer";
import { computeRegimeTag, type RegimeInput, type RegimeOutput } from "./regimeEngine";
import { applyFactorInteraction, type FactorInteractionInput, type FactorInteractionOutput } from "./factorInteractionEngine";
import { buildAttributionMap, type AttributionMap } from "./attributionWriteBack";
import { getActiveVersionId } from "./antiPBOEngine";

// ─────────────────────────────────────────────────────────────────────────────
// System Run Result
// ─────────────────────────────────────────────────────────────────────────────

export interface DanTreeSystemResult {
  /** Snapshot ID written to DB (null if persist failed) */
  snapshotId: number | null;
  /** Number of decisions processed */
  decisionCount: number;
  /** Number of tickers suppressed by guards */
  suppressedCount: number;
  /** Number of tickers in danger zone */
  dangerCount: number;
  /** Overall guard status */
  guardStatus: "healthy" | "guarded" | "suppressed" | "critical";
  /** Top guard reason (most impactful) */
  topGuardReason: string | null;
  /** Duration in ms */
  durationMs: number;
  /** Full pipeline output (for downstream use) */
  pipelineOutput: Level7PipelineOutput;
  /** advisory_only — always true */
  advisory_only: true;
  /** Whether live data was used (vs fallback) */
  liveDataUsed: boolean;
  /** Number of tickers that used fallback signals */
  fallbackSignalCount: number;
  /** Error message if system run partially failed */
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sector Map — ticker → sector (for tickers not in DB)
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_SECTOR_MAP: Record<string, string> = {
  AAPL: "technology", MSFT: "technology", GOOGL: "technology", GOOG: "technology",
  META: "technology", AMZN: "consumer_discretionary", TSLA: "consumer_discretionary",
  NVDA: "technology", AMD: "technology", INTC: "technology",
  JPM: "financials", BAC: "financials", GS: "financials", MS: "financials",
  JNJ: "healthcare", PFE: "healthcare", MRNA: "healthcare",
  XOM: "energy", CVX: "energy",
  SPY: "etf", QQQ: "etf", IWM: "etf",
  BTC: "crypto", ETH: "crypto",
};

function getSector(ticker: string, holdingSector?: string): string {
  return holdingSector ?? DEFAULT_SECTOR_MAP[ticker.toUpperCase()] ?? "technology";
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2: buildPortfolioFromDB — real holdings from portfolioPosition table
// ─────────────────────────────────────────────────────────────────────────────

async function buildPortfolioFromDB(userId: number): Promise<Holding[]> {
  try {
    const { getPortfolioByUserId, getActivePositions } = await import("./portfolioPersistence");
    const portfolios = await getPortfolioByUserId(userId);
    if (portfolios.length === 0) {
      console.log(`[DanTreeSystem] No portfolio found for userId=${userId}, using default watchlist`);
      return [];
    }
    const rawPositions = await getActivePositions(portfolios[0].id);
    const holdings: Holding[] = rawPositions.map((p: any) => ({
      ticker: p.ticker,
      weight_pct: parseFloat(p.allocationPct ?? "0") * 100,
      cost_basis_usd: 10000, // placeholder until cost basis tracking is added
      sector: getSector(p.ticker) as any,
      themes: [] as any[],
      status: "active" as const,
      added_at_ms: p.createdAt ?? Date.now() - 7 * 24 * 60 * 60 * 1000,
    }));
    console.log(`[DanTreeSystem] Loaded ${holdings.length} active positions from DB for userId=${userId}: ${holdings.map(h => h.ticker).join(", ")}`);
    return holdings;
  } catch (dbErr) {
    console.warn("[DanTreeSystem] Could not load holdings from DB:", (dbErr as Error).message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1+3: buildLiveInput — fetch real signals + build Level7PipelineInput
// ─────────────────────────────────────────────────────────────────────────────

async function buildLiveInput(
  holdings: Holding[],
  overrides?: Partial<Level7PipelineInput>
): Promise<{ input: Level7PipelineInput; liveDataUsed: boolean; fallbackSignalCount: number }> {
  // Determine tickers: from holdings, or default watchlist
  const tickers = holdings.length > 0
    ? holdings.map((h) => h.ticker)
    : ["AAPL", "MSFT", "GOOGL", "NVDA", "META"];

  let rawSignals: SignalInput[];
  let liveDataUsed = false;
  let fallbackSignalCount = 0;

  try {
    console.log(`[DanTreeSystem] Fetching live signals for: ${tickers.join(", ")}`);
    const liveSignals = await buildSignalsFromLiveData(tickers);
    rawSignals = liveSignals.map((ls) => {
      const holding = holdings.find((h) => h.ticker === ls.ticker);
      return liveSignalToSignalInput(
        ls,
        getSector(ls.ticker, holding?.sector),
        (holding?.themes ?? []) as string[]
      );
    });
    liveDataUsed = true;
    fallbackSignalCount = liveSignals.filter((l) => l.metadata.fallback_used).length;
    console.log(`[DanTreeSystem] Live signals built: ${rawSignals.length} tickers, fallback=${fallbackSignalCount}/${tickers.length}`);
  } catch (signalErr) {
    // Failure safety: fall back to neutral synthetic signals — NEVER crash
    console.warn("[DanTreeSystem] Live signal engine failed, using neutral synthetic signals:", (signalErr as Error).message);
    rawSignals = tickers.map((ticker) => ({
      ticker,
      alpha_score: 0.5,
      risk_score: 0.3,
      trigger_score: 0.3,
      memory_score: 0.5,
      danger_score: 0,
      sample_count: 5,
      sector: getSector(ticker, holdings.find((h) => h.ticker === ticker)?.sector) as any,
      themes: [] as any[],
      signal_age_days: 1,
    } as SignalInput));
    liveDataUsed = false;
    fallbackSignalCount = tickers.length;
  }

  const signals = fuseMultipleSignals(rawSignals);

  // Build holdings from tickers if no DB holdings (default watchlist mode)
  const effectiveHoldings: Holding[] = holdings.length > 0 ? holdings : tickers.map((ticker) => ({
    ticker,
    weight_pct: 100 / tickers.length,
    cost_basis_usd: 10000,
    sector: getSector(ticker) as any,
    themes: [] as any[],
    status: "watch" as const,
    added_at_ms: Date.now(),
  }));

  const input: Level7PipelineInput = {
    portfolio: {
      portfolio_id: "system",
      holdings: effectiveHoldings,
      cash_reserve_pct: 10,
      total_positions: effectiveHoldings.length,
      created_at_ms: Date.now(),
      updated_at_ms: Date.now(),
    },
    signals,
    sample_counts: new Map(tickers.map((t) => [t, 10])),
    recent_actions: [],
    signal_history: [],
    ...overrides,
  };

  return { input, liveDataUsed, fallbackSignalCount };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Entry: runDanTreeSystem
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Unified DanTree system entry point.
 *
 * Steps:
 * 1. Load real holdings from DB (portfolioPosition table)
 * 2. Fetch live signals from Yahoo Finance + Finnhub + FRED
 * 3. Call runLevel7PipelineWithPersist(userId, input)
 * 4. Return snapshotId + summary
 *
 * This is the ONLY authorized path to trigger a pipeline run + persist.
 * Failure safety: any data fetch failure falls back gracefully, never crashes.
 */
export async function runDanTreeSystem(
  userId: number,
  inputOverride?: Partial<Level7PipelineInput>
): Promise<DanTreeSystemResult> {
  const startMs = Date.now();

  try {
    // Step 1: Load real holdings from DB
    const holdings = await buildPortfolioFromDB(userId);

    // Step 2: Fetch live signals + build pipeline input
    const { input, liveDataUsed, fallbackSignalCount } = await buildLiveInput(holdings, inputOverride);

    // Step 3a: Run LEVEL9 thinking modules (non-blocking, failure-safe)
    let attributionMap: AttributionMap | undefined;
    try {
      const thinkingMap = new Map<string, InvestorThinkingOutput>();
      for (const signal of input.signals) {
        // Convert SignalInput to LiveSignalData for runInvestorThinking
        const liveSignalData = {
          ticker: signal.ticker,
          price_momentum: ((signal as any).alpha_score ?? 0.5) * 2 - 1,  // [0,1] → [-1,1]
          volatility: (signal as any).risk_score ?? 0.3,
          valuation_proxy: (signal as any).alpha_score ?? 0.5,
          news_sentiment: ((signal as any).alpha_score ?? 0.5) * 2 - 1,
          macro_exposure: -((signal as any).danger_score ?? 0) * 2 + 1,  // invert danger
          sector: (signal as any).sector ?? "technology",
        };
        const thinking = runInvestorThinking(liveSignalData as any);
        thinkingMap.set(signal.ticker, thinking);
      }

      // Compute regime from macro signals
      const avgDanger = input.signals.reduce((s, sig) => s + ((sig as any).danger_score ?? 0), 0) / Math.max(input.signals.length, 1);
      const avgRisk = input.signals.reduce((s, sig) => s + ((sig as any).risk_score ?? 0), 0) / Math.max(input.signals.length, 1);
      const avgAlpha = input.signals.reduce((s, sig) => s + ((sig as any).alpha_score ?? 0.5), 0) / Math.max(input.signals.length, 1);
      const regimeInput: RegimeInput = {
        dangerScore: avgDanger,
        volatilityProxy: avgRisk,
        momentumStress: avgAlpha * 2 - 1,  // [0,1] → [-1,1]
      };
      const regimeOutput: RegimeOutput = computeRegimeTag(regimeInput);
      console.log(`[DanTreeSystem] Regime: ${regimeOutput.regime_tag} (confidence=${regimeOutput.regime_confidence})`);

      // Apply factor interactions per ticker
      const interactionMap = new Map<string, FactorInteractionOutput>();
      for (const [ticker, thinking] of Array.from(thinkingMap.entries())) {
        const signal = input.signals.find(s => s.ticker === ticker);
        if (!signal) continue;
        const eventSev = Math.abs(thinking.event_adjustment.adjusted_alpha_weight - 1.0);
        const interactionInput: FactorInteractionInput = {
          businessQualityScore: thinking.business_quality.business_quality_score,
          eventType: thinking.event_adjustment.event_bias,
          eventSeverity: eventSev,
          regimeTag: regimeOutput.regime_tag,
          alphaScore: thinking.adjusted_alpha_score,
          dangerScore: thinking.adjusted_danger_score,
          triggerScore: thinking.adjusted_trigger_score,
          valuationSensitivity: 0.5,
          momentumStress: ((signal as any).alpha_score ?? 0.5) * 2 - 1,
        };
        interactionMap.set(ticker, applyFactorInteraction(interactionInput));
      }

      // Build attribution map (Module 1)
      attributionMap = buildAttributionMap(thinkingMap, regimeOutput, interactionMap);
      console.log(`[DanTreeSystem] Attribution map built for ${attributionMap.size} tickers`);
    } catch (thinkingErr) {
      console.warn("[DanTreeSystem] LEVEL9 thinking modules failed (non-blocking):", (thinkingErr as Error).message);
      // attributionMap remains undefined → saveDecision will use null fields
    }

    // LEVEL10: Get active strategy version for this user (non-blocking)
    let activeVersionId: string | null = null;
    try {
      activeVersionId = await getActiveVersionId(userId);
      if (activeVersionId) {
        console.log(`[DanTreeSystem] Linking decisions to strategy version: ${activeVersionId}`);
      }
    } catch (versionErr) {
      console.warn("[DanTreeSystem] Could not fetch active strategy version (non-blocking):", (versionErr as Error).message);
    }

    // Step 3: Run Level7 pipeline with automatic persistence
    console.log(`[DanTreeSystem] Running Level7 pipeline for userId=${userId}, tickers=${input.portfolio.holdings.map(h => h.ticker).join(",")}, liveData=${liveDataUsed}`);
    const output = await runLevel7PipelineWithPersist({ ...input, userId, attributionMap, strategyVersionId: activeVersionId } as any);

    // Step 4: Build summary
    const safetyReport = output.guard_output?.safety_report;
    const suppressedTickers = safetyReport?.suppressed_tickers ?? [];
    const dangerTickers = [
      ...(safetyReport?.danger_critical_tickers ?? []),
      ...(safetyReport?.danger_high_tickers ?? []),
    ];
    const guardStatus = safetyReport?.portfolio_guard_status ?? "healthy";
    const topGuardReason = safetyReport?.top_guard_reasons?.[0] ?? null;
    const decisionCount = output.portfolio_view?.ranked_decisions?.length ?? 0;
    const snapshotId = (output as any).persistence?.snapshotId ?? null;

    console.log(`[DanTreeSystem] Complete: snapshotId=${snapshotId}, decisions=${decisionCount}, guard=${guardStatus}, suppressed=${suppressedTickers.length}, danger=${dangerTickers.length}, duration=${Date.now() - startMs}ms`);

    return {
      snapshotId,
      decisionCount,
      suppressedCount: suppressedTickers.length,
      dangerCount: dangerTickers.length,
      guardStatus,
      topGuardReason,
      durationMs: Date.now() - startMs,
      pipelineOutput: output,
      advisory_only: true,
      liveDataUsed,
      fallbackSignalCount,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[DanTreeSystem] runDanTreeSystem failed:", message);
    return {
      snapshotId: null,
      decisionCount: 0,
      suppressedCount: 0,
      dangerCount: 0,
      guardStatus: "healthy",
      topGuardReason: null,
      durationMs: Date.now() - startMs,
      pipelineOutput: {} as Level7PipelineOutput,
      advisory_only: true,
      liveDataUsed: false,
      fallbackSignalCount: 0,
      error: message,
    };
  }
}
