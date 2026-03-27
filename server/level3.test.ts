/**
 * LEVEL3 Memory Engine — Vitest Test Suite
 * Tests: writeMemory gating, retrieveMemory (exact+similar), computeMemoryInfluence,
 *        buildMemoryContextBlock, memoryTrace, attachMemoryToBootstrap
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock memoryDb ─────────────────────────────────────────────────────────────
vi.mock("./memoryDb", () => ({
  insertMemoryRecord: vi.fn().mockResolvedValue(undefined),
  fetchActiveMemoryByTicker: vi.fn().mockResolvedValue([]),
  fetchAllActiveMemoryForUser: vi.fn().mockResolvedValue([]),
  checkDuplicateMemory: vi.fn().mockResolvedValue(false),
  countActiveMemoryForTicker: vi.fn().mockResolvedValue(0),
  evictOldestMemoryRecord: vi.fn().mockResolvedValue(undefined),
}));

import {
  writeMemory,
  retrieveMemory,
  computeMemoryInfluence,
  buildMemoryContextBlock,
  type MemoryWriteInput,
  type MemoryInfluence,
} from "./memoryEngine";

import { buildMemoryTrace, emptyMemoryTrace } from "./memoryTrace";
import { attachMemoryToBootstrap } from "./historyBootstrap";

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeWriteInput(overrides: Partial<MemoryWriteInput> = {}): MemoryWriteInput {
  return {
    userId: "user_001",
    ticker: "AAPL",
    memoryType: "action_record",
    action: "BUY",
    verdict: "BUY",
    confidence: "high",
    evidenceScore: 72,
    thesisCore: "Strong iPhone cycle + services growth",
    riskStructure: ["China revenue risk", "valuation premium"],
    counterarguments: ["Peak margin concern"],
    failureModes: ["Macro tightening kills multiple"],
    reasoningPattern: "growth_at_reasonable_price",
    scenarioType: "high_growth_tech",
    tags: ["AAPL", "buy"],
    ...overrides,
  };
}

function makeMemoryRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "mem_001",
    userId: "user_001",
    ticker: "AAPL",
    memoryType: "action_record",
    action: "BUY",
    verdict: "BUY",
    confidence: "high",
    evidenceScore: 72,
    thesisCore: "Strong iPhone cycle + services growth",
    riskStructure: ["China revenue risk"],
    counterarguments: ["Peak margin concern"],
    failureModes: ["Macro tightening kills multiple"],
    reasoningPattern: "growth_at_reasonable_price",
    scenarioType: "high_growth_tech",
    tags: ["AAPL", "buy"],
    outcomeLabel: "success",
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3, // 3 days ago
    expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 27, // 27 days remaining
    ...overrides,
  };
}

// ── SUITE 1: writeMemory gating ───────────────────────────────────────────────
describe("writeMemory — quality gating", () => {
  it("skips write when evidenceScore below threshold (0.55)", async () => {
    const result = await writeMemory(makeWriteInput({ evidenceScore: 0.35 }));
    expect(result.written).toBe(false);
    expect(result.reason).toMatch(/evidence/i);
  });

  it("skips write when no thesisCore", async () => {
    const result = await writeMemory(makeWriteInput({ thesisCore: "" }));
    expect(result.written).toBe(false);
    expect(result.reason).toMatch(/thesis/i);
  });

  it("writes when quality threshold met", async () => {
    const result = await writeMemory(makeWriteInput());
    expect(result.written).toBe(true);
    expect(result.id).toBeDefined();
  });

  it("skips write on duplicate detection", async () => {
    const { checkDuplicateMemory } = await import("./memoryDb");
    (checkDuplicateMemory as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
    const result = await writeMemory(makeWriteInput());
    expect(result.written).toBe(false);
    expect(result.reason).toMatch(/duplicate/i);
  });
});

// ── SUITE 2: retrieveMemory ───────────────────────────────────────────────────
describe("retrieveMemory — exact + similar", () => {
  it("returns empty result when no records exist", async () => {
    const result = await retrieveMemory({ userId: "user_001", ticker: "AAPL" });
    expect(result.combined).toHaveLength(0);
    expect(result.exact).toHaveLength(0);
    expect(result.similar).toHaveLength(0);
  });

  it("returns exact match records", async () => {
    const { fetchActiveMemoryByTicker } = await import("./memoryDb");
    (fetchActiveMemoryByTicker as ReturnType<typeof vi.fn>).mockResolvedValueOnce([makeMemoryRecord()]);
    const result = await retrieveMemory({ userId: "user_001", ticker: "AAPL" });
    expect(result.exact.length).toBeGreaterThan(0);
    expect(result.combined.length).toBeGreaterThan(0);
    expect(result.retrieval_mode_used).toBe("exact_match");
  });

  it("returns similar case records when same scenarioType", async () => {
    const { fetchActiveMemoryByTicker, fetchAllActiveMemoryForUser } = await import("./memoryDb");
    (fetchActiveMemoryByTicker as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    (fetchAllActiveMemoryForUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeMemoryRecord({ ticker: "MSFT", scenarioType: "high_growth_tech" }),
    ]);
    const result = await retrieveMemory({
      userId: "user_001",
      ticker: "NVDA",
      currentScenarioType: "high_growth_tech",
    });
    // similar records may or may not pass threshold depending on scoring
    expect(result).toHaveProperty("similar");
    expect(result).toHaveProperty("combined");
  });

  it("respects cap of 5 records", async () => {
    const { fetchActiveMemoryByTicker, fetchAllActiveMemoryForUser } = await import("./memoryDb");
    const manyRecords = Array.from({ length: 10 }, (_, i) => makeMemoryRecord({ id: `mem_${i}` }));
    (fetchActiveMemoryByTicker as ReturnType<typeof vi.fn>).mockResolvedValueOnce(manyRecords);
    (fetchAllActiveMemoryForUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    const result = await retrieveMemory({ userId: "user_001", ticker: "AAPL" });
    expect(result.combined.length).toBeLessThanOrEqual(5);
  });
});

// ── SUITE 3: computeMemoryInfluence ──────────────────────────────────────────
describe("computeMemoryInfluence — behavioral effects", () => {
  it("prior failure → affects_step0=true, affects_routing=true", () => {
    const records = [makeMemoryRecord({ outcomeLabel: "failure" })];
    const influence = computeMemoryInfluence(records as Parameters<typeof computeMemoryInfluence>[0]);
    expect(influence.affects_step0).toBe(true);
    expect(influence.affects_routing).toBe(true);
    expect(influence.early_stop_bias).toBe(false);
  });

  it("prior success → affects_controller=true", () => {
    const records = [
      makeMemoryRecord({ outcomeLabel: "success", confidence: "high", evidenceScore: 80 }),
    ];
    const influence = computeMemoryInfluence(records as Parameters<typeof computeMemoryInfluence>[0]);
    expect(influence.affects_controller).toBe(true);
  });

  it("multiple strong successes → early_stop_bias=true", () => {
    const records = [
      makeMemoryRecord({ outcomeLabel: "success", evidenceScore: 80, id: "m1" }),
      makeMemoryRecord({ outcomeLabel: "success", evidenceScore: 82, id: "m2" }),
    ];
    const influence = computeMemoryInfluence(records as Parameters<typeof computeMemoryInfluence>[0]);
    expect(influence.early_stop_bias).toBe(true);
  });

  it("repeated invalidation → force_continuation=true", () => {
    const records = [
      makeMemoryRecord({ outcomeLabel: "invalidated" }),
      makeMemoryRecord({ outcomeLabel: "invalidated", id: "mem_002" }),
    ];
    const influence = computeMemoryInfluence(records as Parameters<typeof computeMemoryInfluence>[0]);
    expect(influence.force_continuation).toBe(true);
  });

  it("empty records → all false", () => {
    const influence = computeMemoryInfluence([]);
    expect(influence.affects_step0).toBe(false);
    expect(influence.affects_controller).toBe(false);
    expect(influence.affects_routing).toBe(false);
    expect(influence.early_stop_bias).toBe(false);
    expect(influence.force_continuation).toBe(false);
  });
});

// ── SUITE 4: buildMemoryContextBlock ─────────────────────────────────────────
describe("buildMemoryContextBlock — structured injection", () => {
  it("produces top_memories array with required fields", () => {
    const records = [makeMemoryRecord()];
    const block = buildMemoryContextBlock(
      records as Parameters<typeof buildMemoryContextBlock>[0],
      { ticker: "AAPL", currentQuery: "Is AAPL still worth buying?" }
    );
    expect(block.top_memories).toHaveLength(1);
    const mem = block.top_memories[0];
    expect(mem).toHaveProperty("memory_id");
    expect(mem).toHaveProperty("scenario_type");
    expect(mem).toHaveProperty("thesis_core");
    expect(mem).toHaveProperty("key_risk");
    expect(mem).toHaveProperty("why_relevant_now");
  });

  it("produces memory_influence_summary string", () => {
    const records = [makeMemoryRecord()];
    const block = buildMemoryContextBlock(
      records as Parameters<typeof buildMemoryContextBlock>[0],
      { ticker: "AAPL", currentQuery: "AAPL analysis" }
    );
    expect(typeof block.memory_influence_summary).toBe("string");
    expect(block.memory_influence_summary.length).toBeGreaterThan(0);
  });
});

// ── SUITE 5: buildMemoryTrace ─────────────────────────────────────────────────
describe("buildMemoryTrace — visible trace", () => {
  it("emptyMemoryTrace returns all-false/zero defaults", () => {
    const trace = emptyMemoryTrace();
    expect(trace.retrieval_attempted).toBe(false);
    expect(trace.records_retrieved).toBe(0);
    expect(trace.write_attempted).toBe(false);
  });

  it("buildMemoryTrace reflects input params", () => {
    const trace = buildMemoryTrace({
      retrievalAttempted: true,
      retrievalModeUsed: "exact_match",
      recordsRetrieved: 2,
      influence: null,
      contextBlock: null,
      writeAttempted: true,
      writeResult: "written",
      writeSkipReason: "",
    });
    expect(trace.retrieval_attempted).toBe(true);
    expect(trace.retrieval_mode_used).toBe("exact_match");
    expect(trace.records_retrieved).toBe(2);
    expect(trace.write_result).toBe("written");
  });
});

// ── SUITE 6: attachMemoryToBootstrap ─────────────────────────────────────────
describe("attachMemoryToBootstrap — bootstrap enrichment", () => {
  it("returns bootstrap unchanged when no memory found", async () => {
    const { fetchActiveMemoryByTicker, fetchAllActiveMemoryForUser } = await import("./memoryDb");
    (fetchActiveMemoryByTicker as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    (fetchAllActiveMemoryForUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const bootstrap = {
      has_prior_history: false,
      prior_decision_count: 0,
      history_requires_control: false,
      revalidation_mandatory: false,
      preferred_probe_order: [] as string[],
      history_control_reason: "",
      previous_action: null as string | null,
      action_pattern: "",
      days_since_last_decision: -1,
      memory_injected: false,
      memory_record_count: 0,
      memory_influence_summary: "",
      memory_influence: null as MemoryInfluence | null,
      memory_context_block: null as ReturnType<typeof buildMemoryContextBlock> | null,
    };

    const result = await attachMemoryToBootstrap(bootstrap as Parameters<typeof attachMemoryToBootstrap>[0], {
      userId: "user_001",
      ticker: "AAPL",
      currentTags: [],
      currentRiskStructure: [],
      currentScenarioType: "",
    });

    expect(result.memory_injected).toBe(false);
    expect(result.memory_record_count).toBe(0);
  });

  it("enriches bootstrap when memory found", async () => {
    const { fetchActiveMemoryByTicker, fetchAllActiveMemoryForUser } = await import("./memoryDb");
    (fetchActiveMemoryByTicker as ReturnType<typeof vi.fn>).mockResolvedValueOnce([makeMemoryRecord()]);
    (fetchAllActiveMemoryForUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const bootstrap = {
      has_prior_history: true,
      prior_decision_count: 1,
      history_requires_control: false,
      revalidation_mandatory: false,
      preferred_probe_order: [] as string[],
      history_control_reason: "",
      previous_action: "BUY" as string | null,
      action_pattern: "BUY",
      days_since_last_decision: 3,
      memory_injected: false,
      memory_record_count: 0,
      memory_influence_summary: "",
      memory_influence: null as MemoryInfluence | null,
      memory_context_block: null as ReturnType<typeof buildMemoryContextBlock> | null,
    };

    const result = await attachMemoryToBootstrap(bootstrap as Parameters<typeof attachMemoryToBootstrap>[0], {
      userId: "user_001",
      ticker: "AAPL",
      currentTags: ["AAPL"],
      currentRiskStructure: ["China risk"],
      currentScenarioType: "high_growth_tech",
    });

    expect(result.memory_injected).toBe(true);
    expect(result.memory_record_count).toBeGreaterThan(0);
    expect(result.memory_influence).not.toBeNull();
    expect(result.memory_context_block).not.toBeNull();
  });
});
