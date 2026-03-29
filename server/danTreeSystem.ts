/**
 * DanTree System Entry Point — LEVEL8 Final Patch
 *
 * ONLY allowed persist path:
 *   runDanTreeSystem → runLevel7PipelineWithPersist → persistPipelineRun
 *
 * Direct calls to persistPipelineRun or persistRun tRPC from outside this
 * module are FORBIDDEN by design (enforced via runtime guard in routers.ts).
 *
 * advisory_only: ALWAYS true | auto_trade_allowed: NEVER
 */

import {
  runLevel7PipelineWithPersist,
  type Level7PipelineInput,
  type Level7PipelineOutput,
} from "./portfolioDecisionRanker";
import type { Holding } from "./portfolioState";
import { fuseMultipleSignals, type SignalInput } from "./portfolioState";

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
  /** Error message if system run partially failed */
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Default Signal Builder
// Builds a minimal but realistic Level7PipelineInput from DB state.
// In production, signals come from LEVEL1-6 signal pipeline.
// For bootstrap / scheduled runs, we use stored positions as base signals.
// ─────────────────────────────────────────────────────────────────────────────

function buildDefaultInput(
  holdings: Holding[],
  overrides?: Partial<Level7PipelineInput>
): Level7PipelineInput {
  // Build synthetic SignalInput from existing holdings, then fuse
  const rawSignals: SignalInput[] = holdings.map((h) => {
    const w = (h.weight_pct ?? 50) / 100;
    return {
      ticker: h.ticker,
      alpha_score: w,
      risk_score: 0.2,
      trigger_score: w >= 0.5 ? 0.6 : 0.3,
      memory_score: 0.5,
      danger_score: 0,
      sample_count: 5,
      sector: h.sector ?? "technology",
      themes: (h.themes ?? []) as string[],
      signal_age_days: 1,
    } as SignalInput;
  });
  const signals = fuseMultipleSignals(rawSignals);

  return {
    portfolio: {
      portfolio_id: "system",
      holdings,
      cash_reserve_pct: 10,
      total_positions: holdings.length,
      created_at_ms: Date.now(),
      updated_at_ms: Date.now(),
    },
    signals,
    sample_counts: new Map(holdings.map((h) => [h.ticker, 5])),
    recent_actions: [],
    signal_history: [],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Entry: runDanTreeSystem
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Unified DanTree system entry point.
 *
 * Steps:
 * 1. Fetch latest holdings / signals from DB (or use provided input)
 * 2. Call runLevel7PipelineWithPersist(userId, input)
 * 3. Return snapshotId + summary
 *
 * This is the ONLY authorized path to trigger a pipeline run + persist.
 */
export async function runDanTreeSystem(
  userId: number,
  inputOverride?: Partial<Level7PipelineInput>
): Promise<DanTreeSystemResult> {
  const startMs = Date.now();

  try {
    // Step 1: Fetch latest holdings from DB
    let holdings: Holding[] = [];
    try {
      const { getPortfolioByUserId, getActivePositions } = await import("./portfolioPersistence");
      const portfolios = await getPortfolioByUserId(userId);
      if (portfolios.length > 0) {
        const rawPositions = await getActivePositions(portfolios[0].id);
        holdings = rawPositions.map((p: any) => ({
          ticker: p.ticker,
          weight_pct: (p.allocationPct ?? 0.5) * 100,
          cost_basis_usd: 10000,
          sector: (p.sector ?? "technology") as any,
          themes: [] as any[],
          status: "active" as const,
          added_at_ms: Date.now() - 7 * 24 * 60 * 60 * 1000,
        }));
      }
    } catch (dbErr) {
      console.warn("[DanTreeSystem] Could not load holdings from DB, using empty portfolio:", dbErr);
    }

    // Step 2: Build input and run pipeline with persist
    const input = buildDefaultInput(holdings, inputOverride);
    const output = await runLevel7PipelineWithPersist({ ...input, userId });

    // Step 3: Build summary
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
      error: message,
    };
  }
}
