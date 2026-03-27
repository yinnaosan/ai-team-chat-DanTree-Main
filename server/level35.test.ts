/**
 * DANTREE_LEVEL3.5_MEMORY_EVOLUTION — vitest unit tests
 * Tests: updateMemoryOutcome, extractFailurePattern, reinforceSuccessPattern, applyMemoryDecay
 * All DB calls are mocked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock DB layer ─────────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../drizzle/schema", () => ({
  memoryRecords: { id: "id", userId: "user_id", ticker: "ticker", isActive: "is_active", outcomeLabel: "outcome_label" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ col, val })),
  and: vi.fn((...args: unknown[]) => ({ args })),
}));

import { getDb } from "./db";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDbMock(rows: object[]) {
  const updateMock = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  });
  const selectMock = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  });
  return { select: selectMock, update: updateMock };
}

function makeMemoryRecord(overrides: object = {}) {
  return {
    id: "mem-001",
    ticker: "AAPL",
    userId: "user-001",
    memoryType: "action_record",
    action: "BUY",
    verdict: "BUY",
    confidence: "high",
    evidenceScore: "0.8000",
    outcomeLabel: null,
    failureModes: [],
    riskStructure: ["valuation_risk", "rate_risk"],
    reasoningPattern: "growth_momentum",
    successStrengthScore: null,
    failureIntensityScore: null,
    freshnessScore: "1.0000",
    changeLog: null,
    createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000, // 7 days ago
    expiresAt: null,
    isActive: true,
    affectsStep0: false,
    affectsController: false,
    affectsRouting: false,
    ...overrides,
  };
}

// ── Test: updateMemoryOutcome ─────────────────────────────────────────────────

describe("updateMemoryOutcome", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should return memory_not_found when record does not exist", async () => {
    vi.mocked(getDb).mockResolvedValue(makeDbMock([]) as any);
    const { updateMemoryOutcome } = await import("./memoryEvolution");
    const result = await updateMemoryOutcome("nonexistent-id", "failure", "test");
    expect(result.memory_updated).toBe(false);
    expect(result.reason).toContain("memory_not_found");
  });

  it("should return outcome_unchanged when outcome is same", async () => {
    const record = makeMemoryRecord({ outcomeLabel: "failure" });
    vi.mocked(getDb).mockResolvedValue(makeDbMock([record]) as any);
    const { updateMemoryOutcome } = await import("./memoryEvolution");
    const result = await updateMemoryOutcome("mem-001", "failure", "test");
    expect(result.memory_updated).toBe(false);
    expect(result.reason).toBe("outcome_unchanged");
  });

  it("should update outcome and append change log", async () => {
    const record = makeMemoryRecord({ outcomeLabel: null });
    const db = makeDbMock([record]);
    vi.mocked(getDb).mockResolvedValue(db as any);
    const { updateMemoryOutcome } = await import("./memoryEvolution");
    const result = await updateMemoryOutcome("mem-001", "failure", "opposite_action");
    expect(result.memory_updated).toBe(true);
    expect(result.old_outcome).toBeNull();
    expect(result.new_outcome).toBe("failure");
    expect(db.update).toHaveBeenCalled();
  });

  it("should return db_unavailable when db is null", async () => {
    vi.mocked(getDb).mockResolvedValue(null as any);
    const { updateMemoryOutcome } = await import("./memoryEvolution");
    const result = await updateMemoryOutcome("mem-001", "failure", "test");
    expect(result.memory_updated).toBe(false);
    expect(result.reason).toBe("db_unavailable");
  });
});

// ── Test: extractFailurePattern ───────────────────────────────────────────────

describe("extractFailurePattern", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should return null for non-failure records", async () => {
    const record = makeMemoryRecord({ outcomeLabel: "success" });
    vi.mocked(getDb).mockResolvedValue(makeDbMock([record]) as any);
    const { extractFailurePattern } = await import("./memoryEvolution");
    const result = await extractFailurePattern("mem-001");
    expect(result).toBeNull();
  });

  it("should compute failure_intensity_score for failure record", async () => {
    const record = makeMemoryRecord({
      outcomeLabel: "failure",
      failureModes: ["overvaluation", "rate_sensitivity"],
    });
    const db = makeDbMock([record]);
    vi.mocked(getDb).mockResolvedValue(db as any);
    const { extractFailurePattern } = await import("./memoryEvolution");
    const result = await extractFailurePattern("mem-001");
    expect(result).not.toBeNull();
    // base 0.5 + 2 modes * 0.1 = 0.7
    expect(result!.failure_intensity_score).toBeCloseTo(0.7, 2);
    expect(result!.failure_modes_extracted).toHaveLength(2);
    expect(result!.reasoning_pattern_marked_weak).toBe(true);
    expect(db.update).toHaveBeenCalled();
  });

  it("should boost riskStructure with [HIGH] prefix", async () => {
    const record = makeMemoryRecord({
      outcomeLabel: "invalidated",
      failureModes: ["macro_shock"],
      riskStructure: ["valuation_risk"],
    });
    const db = makeDbMock([record]);
    vi.mocked(getDb).mockResolvedValue(db as any);
    const { extractFailurePattern } = await import("./memoryEvolution");
    const result = await extractFailurePattern("mem-001");
    expect(result!.risk_structure_boosted).toBe(true);
  });

  it("should cap failure_intensity_score at 1.0", async () => {
    const record = makeMemoryRecord({
      outcomeLabel: "failure",
      failureModes: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"], // 10 modes
    });
    vi.mocked(getDb).mockResolvedValue(makeDbMock([record]) as any);
    const { extractFailurePattern } = await import("./memoryEvolution");
    const result = await extractFailurePattern("mem-001");
    expect(result!.failure_intensity_score).toBeLessThanOrEqual(1.0);
  });
});

// ── Test: reinforceSuccessPattern ─────────────────────────────────────────────

describe("reinforceSuccessPattern", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should return null for non-success records", async () => {
    const record = makeMemoryRecord({ outcomeLabel: "failure" });
    vi.mocked(getDb).mockResolvedValue(makeDbMock([record]) as any);
    const { reinforceSuccessPattern } = await import("./memoryEvolution");
    const result = await reinforceSuccessPattern("mem-001");
    expect(result).toBeNull();
  });

  it("should compute success_strength_score for success record", async () => {
    const record = makeMemoryRecord({
      outcomeLabel: "success",
      evidenceScore: "0.8000",
    });
    const db = makeDbMock([record]);
    vi.mocked(getDb).mockResolvedValue(db as any);
    const { reinforceSuccessPattern } = await import("./memoryEvolution");
    const result = await reinforceSuccessPattern("mem-001");
    expect(result).not.toBeNull();
    // base 0.5 + 0.8 * 0.5 = 0.9
    expect(result!.success_strength_score).toBeCloseTo(0.9, 2);
    expect(result!.reasoning_pattern_reinforced).toBe(true);
    expect(db.update).toHaveBeenCalled();
  });

  it("should set early_stop_bias_eligible when strength >= 0.75", async () => {
    const record = makeMemoryRecord({
      outcomeLabel: "success",
      evidenceScore: "0.8000",
    });
    vi.mocked(getDb).mockResolvedValue(makeDbMock([record]) as any);
    const { reinforceSuccessPattern } = await import("./memoryEvolution");
    const result = await reinforceSuccessPattern("mem-001");
    expect(result!.early_stop_bias_eligible).toBe(true);
  });

  it("should NOT set early_stop_bias_eligible when strength < 0.75", async () => {
    const record = makeMemoryRecord({
      outcomeLabel: "success",
      evidenceScore: "0.3000", // 0.5 + 0.3*0.5 = 0.65 < 0.75
    });
    vi.mocked(getDb).mockResolvedValue(makeDbMock([record]) as any);
    const { reinforceSuccessPattern } = await import("./memoryEvolution");
    const result = await reinforceSuccessPattern("mem-001");
    expect(result!.early_stop_bias_eligible).toBe(false);
  });
});

// ── Test: applyMemoryDecay ────────────────────────────────────────────────────

describe("applyMemoryDecay", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should reduce freshness for old records", async () => {
    const record = makeMemoryRecord({
      freshnessScore: "1.0000",
      createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago
    });
    const db = makeDbMock([record]);
    vi.mocked(getDb).mockResolvedValue(db as any);
    const { applyMemoryDecay } = await import("./memoryEvolution");
    const result = await applyMemoryDecay("mem-001");
    expect(result).not.toBeNull();
    // 30 days * 0.035 decay rate → e^(-1.05) ≈ 0.35
    expect(result!.new_freshness).toBeLessThan(result!.old_freshness);
    expect(result!.new_freshness).toBeGreaterThan(0);
    expect(db.update).toHaveBeenCalled();
  });

  it("should deactivate record when freshness drops below 0.1", async () => {
    const record = makeMemoryRecord({
      freshnessScore: "1.0000",
      createdAt: Date.now() - 200 * 24 * 60 * 60 * 1000, // 200 days ago → ~0.001
    });
    const db = makeDbMock([record]);
    vi.mocked(getDb).mockResolvedValue(db as any);
    const { applyMemoryDecay } = await import("./memoryEvolution");
    const result = await applyMemoryDecay("mem-001");
    expect(result!.deactivated).toBe(true);
    expect(result!.new_freshness).toBeLessThan(0.1);
  });

  it("should downgrade influence when freshness is between 0.1 and 0.4", async () => {
    const record = makeMemoryRecord({
      freshnessScore: "1.0000",
      createdAt: Date.now() - 35 * 24 * 60 * 60 * 1000, // ~35 days → ~0.29
    });
    const db = makeDbMock([record]);
    vi.mocked(getDb).mockResolvedValue(db as any);
    const { applyMemoryDecay } = await import("./memoryEvolution");
    const result = await applyMemoryDecay("mem-001");
    // 35 * 0.035 = 1.225 → e^(-1.225) ≈ 0.294 → between 0.1 and 0.4
    if (result!.new_freshness >= 0.1 && result!.new_freshness < 0.4) {
      expect(result!.influence_downgraded).toBe(true);
    }
  });

  it("should return null when db is unavailable", async () => {
    vi.mocked(getDb).mockResolvedValue(null as any);
    const { applyMemoryDecay } = await import("./memoryEvolution");
    const result = await applyMemoryDecay("mem-001");
    expect(result).toBeNull();
  });

  it("should not go below 0 for extremely old records", async () => {
    const record = makeMemoryRecord({
      freshnessScore: "1.0000",
      createdAt: Date.now() - 1000 * 24 * 60 * 60 * 1000, // 1000 days
    });
    vi.mocked(getDb).mockResolvedValue(makeDbMock([record]) as any);
    const { applyMemoryDecay } = await import("./memoryEvolution");
    const result = await applyMemoryDecay("mem-001");
    expect(result!.new_freshness).toBeGreaterThanOrEqual(0);
  });
});

// ── Test: runPostOutcomeEvolution ─────────────────────────────────────────────

describe("runPostOutcomeEvolution", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should call extractFailurePattern for failure outcome", async () => {
    const record = makeMemoryRecord({ outcomeLabel: "failure", failureModes: ["test_mode"] });
    vi.mocked(getDb).mockResolvedValue(makeDbMock([record]) as any);
    const { runPostOutcomeEvolution } = await import("./memoryEvolution");
    const result = await runPostOutcomeEvolution("mem-001", "failure");
    expect(result).not.toBeNull();
    expect((result as any).failure_intensity_score).toBeDefined();
  });

  it("should call reinforceSuccessPattern for success outcome", async () => {
    const record = makeMemoryRecord({ outcomeLabel: "success", evidenceScore: "0.7000" });
    vi.mocked(getDb).mockResolvedValue(makeDbMock([record]) as any);
    const { runPostOutcomeEvolution } = await import("./memoryEvolution");
    const result = await runPostOutcomeEvolution("mem-001", "success");
    expect(result).not.toBeNull();
    expect((result as any).success_strength_score).toBeDefined();
  });
});
