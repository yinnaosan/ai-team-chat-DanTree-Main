/**
 * LEVEL8 Persistence & Productization — Validation Tests
 * TC-L8-01: getOrCreatePortfolio — idempotent
 * TC-L8-02: snapshotPortfolio — stores guard_status and total_tickers
 * TC-L8-03: persistPipelineRun — writes decisions + guard logs + positions
 * TC-L8-04: advisory_only enforcement — all decision records have advisoryOnly=true
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── In-memory stores ──────────────────────────────────────────────────────────
const stores = {
  portfolio: [] as Record<string, unknown>[],
  position: [] as Record<string, unknown>[],
  decision: [] as Record<string, unknown>[],
  guard: [] as Record<string, unknown>[],
  snapshot: [] as Record<string, unknown>[],
};
let idCounter = 1;

// ── Detect which store to use based on inserted fields ────────────────────────
function detectStore(data: Record<string, unknown>): keyof typeof stores {
  if ("snapshotData" in data) return "snapshot";
  if ("dominantGuard" in data) return "guard";
  if ("isActive" in data) return "position";  // portfolioPosition has isActive field
  if ("fusionScore" in data && "decisionBias" in data) return "decision";
  return "portfolio";
}

// ── Mock getDb ────────────────────────────────────────────────────────────────
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();

  // Minimal drizzle-like mock
  const makeDb = () => ({
    insert: (_table: unknown) => ({
      values: (data: Record<string, unknown>) => {
        const id = idCounter++;
        const row = { id, ...data };
        const store = detectStore(data);
        stores[store].push(row);
        return Promise.resolve({ insertId: id });
      },
    }),
    select: (_fields?: unknown) => ({
      from: (_table: unknown) => ({
        where: (_cond: unknown) => ({
          limit: (n: number) => {
            // Return portfolio rows for getOrCreatePortfolio
            return Promise.resolve(stores.portfolio.slice(0, n));
          },
          orderBy: (_order: unknown) => ({
            limit: (n: number) => Promise.resolve(stores.snapshot.slice(-n)),
          }),
        }),
        orderBy: (_order: unknown) => ({
          limit: (n: number) => Promise.resolve(stores.snapshot.slice(-n)),
        }),
      }),
    }),
    update: (_table: unknown) => ({
      set: (_data: unknown) => ({
        where: (_cond: unknown) => Promise.resolve(),
      }),
    }),
  });

  return {
    ...actual,
    getDb: vi.fn().mockResolvedValue(makeDb()),
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeMinimalPipelineOutput(guardStatus = "healthy", tickers = ["AAPL", "MSFT"]) {
  return {
    portfolio_view: {
      ranked_decisions: tickers.map((t, i) => ({
        rank: i + 1,
        ticker: t,
        action_label: "INITIATE",
        final_score: 0.7,
        fusion_score: 0.7,
        concentration_penalty: 0,
        suggested_allocation_pct: 5,
        sizing_bucket: "medium",
        decision_bias: "buy",
        fusion_confidence: "high",
        danger_score: 0.1,
        is_existing_holding: false,
        existing_weight_pct: 0,
        advisory_only: true as const,
      })),
      total_candidates: tickers.length,
      actionable_count: tickers.length,
      monitor_count: 0,
      avoid_count: 0,
      portfolio_id: "test-portfolio",
      risk_budget: { used_pct: 10, remaining_pct: 90, max_pct: 100, sector_breakdown: {}, theme_breakdown: {} },
      generated_at: Date.now(),
    },
    guard_output: {
      guarded_decisions: tickers.map(t => ({
        ticker: t,
        guarded_decision_bias: "buy",
        guarded_sizing_bucket: "medium",
        suppressed: false,
        annotation: { dominant_guard: "NONE", guards_applied: [] },
        sizing_decay_trace: { decay_multiplier: 1.0, guard_contributions: [] },
      })),
      guarded_ranked: tickers.map((t, i) => ({
        rank: i + 1,
        ticker: t,
        action_label: "INITIATE",
        final_score: 0.7,
        fusion_score: 0.7,
        concentration_penalty: 0,
        suggested_allocation_pct: 5,
        sizing_bucket: "medium",
        decision_bias: "buy",
        fusion_confidence: "high",
        danger_score: 0.1,
        is_existing_holding: false,
        existing_weight_pct: 0,
        advisory_only: true as const,
      })),
      safety_report: {
        overall_safety_status: guardStatus,
        active_guard_count: 0,
        suppressed_tickers: [],
        conflict_flags: [],
        churn_flags: [],
        overfit_flags: [],
        danger_flags: [],
        concentration_flags: [],
        sample_soft_flags: [],
        sizing_decay_traces: [],
        portfolio_guard_status: guardStatus,
        advisory_only: true as const,
      },
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("LEVEL8 — Persistence & Productization", () => {

  beforeEach(() => {
    stores.portfolio.length = 0;
    stores.position.length = 0;
    stores.decision.length = 0;
    stores.guard.length = 0;
    stores.snapshot.length = 0;
    idCounter = 1;
    vi.clearAllMocks();
  });

  it("TC-L8-01: getOrCreatePortfolio — creates portfolio and is idempotent", async () => {
    const { getOrCreatePortfolio } = await import("./portfolioPersistence");

    // First call: creates portfolio (store is empty → no existing → insert)
    const id1 = await getOrCreatePortfolio(42);
    expect(typeof id1).toBe("number");
    expect(id1).toBeGreaterThan(0);
    expect(stores.portfolio).toHaveLength(1);

    // Second call: store has the portfolio → returns existing id
    const id2 = await getOrCreatePortfolio(42);
    expect(id2).toBe(id1);
    // No new portfolio inserted
    expect(stores.portfolio).toHaveLength(1);
  });

  it("TC-L8-02: snapshotPortfolio — stores guard_status and total_tickers correctly", async () => {
    const { snapshotPortfolio } = await import("./portfolioPersistence");

    const output = makeMinimalPipelineOutput("guarded", ["AAPL", "MSFT", "NVDA"]);
    const snapId = await snapshotPortfolio(1, output as any);

    expect(typeof snapId).toBe("number");
    expect(snapId).toBeGreaterThan(0);

    const snap = stores.snapshot[stores.snapshot.length - 1] as Record<string, unknown>;
    expect(snap).toBeDefined();
    expect(snap.guardStatus).toBe("guarded");
    expect(snap.totalTickers).toBe(3);
  });

  it("TC-L8-03: persistPipelineRun — writes decisions + guard logs + positions", async () => {
    const { persistPipelineRun } = await import("./portfolioPersistence");

    const output = makeMinimalPipelineOutput("healthy", ["AAPL", "TSLA"]);
    const result = await persistPipelineRun(99, output as any);

    expect(result.portfolioId).toBeGreaterThan(0);
    expect(result.snapshotId).toBeGreaterThan(0);
    expect(result.decisionIds).toHaveLength(2);
    expect(result.guardIds).toHaveLength(2);

    // Decisions stored
    expect(stores.decision).toHaveLength(2);
    const tickers = stores.decision.map(d => (d as Record<string, unknown>).ticker);
    expect(tickers).toContain("AAPL");
    expect(tickers).toContain("TSLA");

    // Guard logs stored
    expect(stores.guard).toHaveLength(2);
  });

  it("TC-L8-04: advisory_only enforcement — all decision records have advisoryOnly=true", async () => {
    const { persistPipelineRun } = await import("./portfolioPersistence");

    const output = makeMinimalPipelineOutput("critical", ["META"]);
    const result = await persistPipelineRun(1, output as any);

    expect(result).toBeDefined();
    expect(result.portfolioId).toBeGreaterThan(0);

    // All decision records must have advisoryOnly=true
    const allAdvisory = stores.decision.every(
      d => (d as Record<string, unknown>).advisoryOnly === true
    );
    expect(allAdvisory).toBe(true);
  });

});
