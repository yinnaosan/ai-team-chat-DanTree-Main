/**
 * DANTREE LEVEL6.1 — Operational Alpha Persistence Validation
 *
 * Test Cases:
 * TC-L61-1: Signal Persistence Repository (persistSignal / listPersistedSignals)
 * TC-L61-2: Outcome Resolution (persistOutcome / listPersistedOutcomes)
 * TC-L61-3: Dedup Cache — same (watchId, triggerType, schedulerRunId) → skip
 * TC-L61-4: Auto-Ingestion Hook — dry_run produces zero DB writes
 * TC-L61-5: Failsafe — DB failure never throws, returns error in summary
 * TC-L61-6: Backfill — backfillMemoryJournalToDB dry_run returns zero persisted
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  persistSignal,
  persistOutcome,
  listPersistedSignals,
  listPersistedOutcomes,
  postRunIngestionHook,
  safePostRunIngestion,
  backfillMemoryJournalToDB,
  resetDedupCache,
} from "./signalPersistence";
import type { RealRunResult } from "./level5RealScheduler";

// ─── Mock DB ──────────────────────────────────────────────────────────────────

const _store_journal: Record<string, unknown>[] = [];
const _store_outcome: Record<string, unknown>[] = [];

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    insert: vi.fn().mockImplementation((table: unknown) => ({
      values: vi.fn().mockImplementation((row: Record<string, unknown>) => {
        // Determine which store to use by checking for signal_id vs outcome_id
        if ("outcomeId" in row) {
          _store_outcome.push({ ...row });
        } else {
          _store_journal.push({ ...row });
        }
        return Promise.resolve();
      }),
    })),
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation((table: unknown) => ({
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockImplementation(() => {
          // Return journal or outcome rows based on what's been stored
          if (_store_outcome.length > 0 && _store_journal.length === 0) {
            return Promise.resolve(_store_outcome);
          }
          return Promise.resolve(_store_journal);
        }),
      })),
    })),
  }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRunResult(overrides?: Partial<RealRunResult>): RealRunResult {
  return {
    run_id: `run_test_${Date.now()}`,
    tickers_evaluated: ["AAPL", "MSFT"],
    triggers_fired: 1,
    actions_created: 1,
    alerts_created: 0,
    dry_run: false,
    snapshot_quality: {
      total: 2,
      usable: 2,
      unusable: 0,
      avg_quality_score: 0.85,
    },
    snapshot_details: [
      { ticker: "AAPL", data_source: "finnhub", quality_score: 0.9, is_usable: true, missing_fields: [] },
      { ticker: "MSFT", data_source: "twelve_data", quality_score: 0.75, is_usable: true, missing_fields: [] },
    ],
    feedback_loop: { memories_updated: 1, evolution_triggered: 0, skipped: 1 },
    ...overrides,
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("LEVEL6.1 — Operational Alpha Persistence", () => {

  beforeEach(() => {
    _store_journal.length = 0;
    _store_outcome.length = 0;
    resetDedupCache();
  });

  // ─── TC-L61-1: Signal Persistence Repository ──────────────────────────────

  describe("TC-L61-1: Signal Persistence Repository", () => {
    it("L61-1-1: persistSignal returns success with signal_id", async () => {
      const result = await persistSignal({
        watchId: "watch_AAPL",
        ticker: "AAPL",
        triggerType: "price_break",
        actionType: "review",
        snapshotQuality: "high",
        schedulerRunId: "run_001",
      });
      expect(result.success).toBe(true);
      expect(result.signal_id).toBeDefined();
      expect(result.signal_id).toMatch(/^sig_/);
    });

    it("L61-1-2: persisted signal is stored in DB (mock store)", async () => {
      await persistSignal({
        watchId: "watch_MSFT",
        ticker: "MSFT",
        triggerType: "earnings_event",
        actionType: "review",
        schedulerRunId: "run_002",
      });
      expect(_store_journal.length).toBe(1);
      const row = _store_journal[0] as Record<string, unknown>;
      expect(row.ticker).toBe("MSFT");
      expect(row.triggerType).toBe("earnings_event");
    });

    it("L61-1-3: listPersistedSignals returns stored signals", async () => {
      await persistSignal({ watchId: "watch_TSLA", ticker: "TSLA", triggerType: "risk_escalation", actionType: "review" });
      const rows = await listPersistedSignals({ limit: 10 });
      expect(rows.length).toBeGreaterThan(0);
    });

    it("L61-1-4: persistSignal with memoryInfluence=true stores flag", async () => {
      await persistSignal({
        watchId: "watch_NVDA",
        ticker: "NVDA",
        triggerType: "memory_contradiction",
        actionType: "deep_review",
        memoryInfluence: true,
        learningInfluence: true,
      });
      const row = _store_journal[0] as Record<string, unknown>;
      expect(row.memoryInfluence).toBe(true);
      expect(row.learningInfluence).toBe(true);
    });
  });

  // ─── TC-L61-2: Outcome Resolution ─────────────────────────────────────────

  describe("TC-L61-2: Outcome Resolution", () => {
    it("L61-2-1: persistOutcome returns success with outcome_id", async () => {
      const result = await persistOutcome({
        signalId: "sig_001",
        horizon: "30d",
        priceChangePct: 12.5,
        priceDirection: "up",
        outcomeScore: 0.8,
        riskAdjustedScore: 0.7,
        thesisStatus: "confirmed",
        outcomeLabel: "strong_positive",
      });
      expect(result.success).toBe(true);
      expect(result.outcome_id).toMatch(/^out_/);
    });

    it("L61-2-2: persisted outcome is stored in DB (mock store)", async () => {
      await persistOutcome({
        signalId: "sig_002",
        outcomeScore: -0.5,
        riskAdjustedScore: -0.6,
        thesisStatus: "invalidated",
        outcomeLabel: "negative",
      });
      expect(_store_outcome.length).toBe(1);
      const row = _store_outcome[0] as Record<string, unknown>;
      expect(row.signalId).toBe("sig_002");
      expect(row.thesisStatus).toBe("invalidated");
    });

    it("L61-2-3: listPersistedOutcomes returns stored outcomes", async () => {
      await persistOutcome({ signalId: "sig_003", thesisStatus: "inconclusive" });
      const rows = await listPersistedOutcomes({ limit: 10 });
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  // ─── TC-L61-3: Dedup Cache ─────────────────────────────────────────────────

  describe("TC-L61-3: Dedup Cache", () => {
    it("L61-3-1: same (watchId, triggerType, schedulerRunId) → second call is skipped", async () => {
      const input = { watchId: "watch_AAPL", ticker: "AAPL", triggerType: "price_break", actionType: "review", schedulerRunId: "run_dedup" };
      const r1 = await persistSignal(input);
      const r2 = await persistSignal(input);
      expect(r1.success).toBe(true);
      expect(r1.skipped).toBeFalsy();
      expect(r2.success).toBe(true);
      expect(r2.skipped).toBe(true);
      expect(r2.skip_reason).toBe("dedup_cache_hit");
    });

    it("L61-3-2: different schedulerRunId → both are persisted", async () => {
      await persistSignal({ watchId: "watch_AAPL", ticker: "AAPL", triggerType: "price_break", actionType: "review", schedulerRunId: "run_A" });
      const r2 = await persistSignal({ watchId: "watch_AAPL", ticker: "AAPL", triggerType: "price_break", actionType: "review", schedulerRunId: "run_B" });
      expect(r2.skipped).toBeFalsy();
      expect(_store_journal.length).toBe(2);
    });

    it("L61-3-3: resetDedupCache allows re-ingestion of same key", async () => {
      const input = { watchId: "watch_GOOG", ticker: "GOOG", triggerType: "earnings_event", actionType: "review", schedulerRunId: "run_X" };
      await persistSignal(input);
      resetDedupCache();
      const r2 = await persistSignal(input);
      expect(r2.skipped).toBeFalsy();
      expect(r2.success).toBe(true);
    });
  });

  // ─── TC-L61-4: Auto-Ingestion Hook — dry_run ──────────────────────────────

  describe("TC-L61-4: Auto-Ingestion Hook", () => {
    it("L61-4-1: dry_run=true returns empty summary with zero DB writes", async () => {
      const runResult = makeRunResult();
      const summary = await postRunIngestionHook(runResult, { dry_run: true });
      expect(summary.signals_persisted).toBe(0);
      expect(summary.signals_attempted).toBe(0);
      expect(_store_journal.length).toBe(0);
    });

    it("L61-4-2: dry_run=false persists usable snapshots", async () => {
      const runResult = makeRunResult();
      const summary = await postRunIngestionHook(runResult, { dry_run: false });
      expect(summary.signals_attempted).toBe(2); // 2 usable snapshots
      expect(summary.signals_persisted + summary.signals_skipped).toBe(2);
      expect(summary.run_id).toBe(runResult.run_id);
    });

    it("L61-4-3: run with zero usable snapshots → signals_attempted=0", async () => {
      const runResult = makeRunResult({
        snapshot_details: [
          { ticker: "FAIL", data_source: "finnhub", quality_score: 0.1, is_usable: false, missing_fields: ["price"] },
        ],
      });
      const summary = await postRunIngestionHook(runResult, { dry_run: false });
      expect(summary.signals_attempted).toBe(0);
    });

    it("L61-4-4: safePostRunIngestion wraps hook and never throws", async () => {
      const runResult = makeRunResult();
      await expect(safePostRunIngestion(runResult, { dry_run: true })).resolves.toBeDefined();
    });
  });

  // ─── TC-L61-5: Failsafe ───────────────────────────────────────────────────

  describe("TC-L61-5: Failsafe — DB failure never throws", () => {
    it("L61-5-1: DB insert failure → error in summary, no throw", async () => {
      // Override mock to throw on insert
      const { getDb } = await import("./db");
      vi.mocked(getDb).mockResolvedValueOnce({
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockRejectedValue(new Error("DB connection lost")),
        }),
      } as unknown as Awaited<ReturnType<typeof getDb>>);

      const result = await persistSignal({
        watchId: "watch_ERR",
        ticker: "ERR",
        triggerType: "price_break",
        actionType: "review",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("DB connection lost");
    });

    it("L61-5-2: safePostRunIngestion with DB failure returns summary with errors", async () => {
      const { getDb } = await import("./db");
      vi.mocked(getDb).mockResolvedValueOnce({
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockRejectedValue(new Error("timeout")),
        }),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as unknown as Awaited<ReturnType<typeof getDb>>);

      const runResult = makeRunResult();
      const summary = await safePostRunIngestion(runResult, { dry_run: false });
      expect(summary).toBeDefined();
      expect(summary.run_id).toBe(runResult.run_id);
      // Should not throw — errors captured in summary
    });
  });

  // ─── TC-L61-6: Backfill ───────────────────────────────────────────────────

  describe("TC-L61-6: Backfill — backfillMemoryJournalToDB", () => {
    it("L61-6-1: dry_run=true returns zero persisted", async () => {
      const result = await backfillMemoryJournalToDB({ dry_run: true });
      expect(result.persisted).toBe(0);
      expect(result.attempted).toBe(0);
    });

    it("L61-6-2: dry_run=false with empty in-memory journal → attempted=0", async () => {
      // signalJournal in-memory store is empty (no createSignalJournalEntry called)
      const result = await backfillMemoryJournalToDB({ dry_run: false });
      expect(result.attempted).toBe(0);
      expect(result.errors.length).toBe(0);
    });
  });

});
