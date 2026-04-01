/**
 * [LEVEL13.2-B] Tests for outputGatingEngine.ts
 */

import { describe, it, expect } from "vitest";
import { buildOutputGateResult, buildFallbackOutputGateResult } from "./outputGatingEngine";
import type { EvidencePacket } from "./evidenceValidator";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function makePacket(overrides: Partial<EvidencePacket> = {}): EvidencePacket {
  return {
    taskDescription: "Test task",
    facts: [],
    hardMissing: [],
    evidenceScore: 75,
    evidenceLevel: "sufficient",
    allowInvestmentAdvice: true,
    step3Instruction: "Proceed with decisive output.",
    outputMode: "decisive",
    claimWhitelist: ["Price: $150"],
    missingBlocking: [],
    missingImportant: [],
    missingOptional: [],
    freshnessLabel: "realtime",
    conflictList: [],
    discussability: true,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("buildOutputGateResult", () => {
  it("returns gate_passed=true when evidence_score >= 40 and no blocking fields", () => {
    const result = buildOutputGateResult(makePacket({ evidenceScore: 75 }), 0.72, 0.3);
    expect(result.gate_passed).toBe(true);
    expect(result.evidence_score).toBe(75);
    expect(result.advisory_only).toBe(true);
  });

  it("returns gate_passed=false when evidence_score < 40", () => {
    const result = buildOutputGateResult(makePacket({ evidenceScore: 30, evidenceLevel: "insufficient" }), 0.4, 0.5);
    expect(result.gate_passed).toBe(false);
    expect(result.gate_reason).toContain("insufficient evidence");
  });

  it("returns gate_passed=false when blocking fields exist regardless of score", () => {
    const result = buildOutputGateResult(
      makePacket({ evidenceScore: 65, missingBlocking: ["price.current", "valuation.pe"] }),
      0.6,
      0.4
    );
    expect(result.gate_passed).toBe(false);
    expect(result.blocking_fields).toHaveLength(2);
    expect(result.gate_reason).toContain("blocking field");
  });

  it("reflects output_mode from EvidencePacket", () => {
    const result = buildOutputGateResult(makePacket({ outputMode: "framework_only", evidenceScore: 45 }), 0.5, 0.5);
    expect(result.output_mode).toBe("framework_only");
  });

  it("reflects directional output_mode", () => {
    const result = buildOutputGateResult(makePacket({ outputMode: "directional", evidenceScore: 55 }), 0.6, 0.3);
    expect(result.output_mode).toBe("directional");
    expect(result.gate_passed).toBe(true);
  });

  it("clamps thesis_confidence to [0, 1]", () => {
    const r1 = buildOutputGateResult(makePacket(), 1.5, 0.5);
    const r2 = buildOutputGateResult(makePacket(), -0.3, 0.5);
    expect(r1.thesis_confidence).toBe(1);
    expect(r2.thesis_confidence).toBe(0);
  });

  it("clamps semantic_fragility to [0, 1]", () => {
    const r1 = buildOutputGateResult(makePacket(), 0.7, 2.0);
    const r2 = buildOutputGateResult(makePacket(), 0.7, -1.0);
    expect(r1.semantic_fragility).toBe(1);
    expect(r2.semantic_fragility).toBe(0);
  });

  it("defaults semantic_fragility to 0.5 when not provided", () => {
    const result = buildOutputGateResult(makePacket(), 0.7);
    expect(result.semantic_fragility).toBe(0.5);
  });

  it("counts conflict_count from conflictList", () => {
    const packet = makePacket({
      conflictList: [
        { field: "price.current", valueA: "150", sourceA: "yahoo", valueB: "152", sourceB: "finnhub" },
        { field: "valuation.pe", valueA: "28", sourceA: "yahoo", valueB: "30", sourceB: "fmp" },
      ],
    });
    const result = buildOutputGateResult(packet, 0.65, 0.4);
    expect(result.conflict_count).toBe(2);
  });

  it("reflects freshness label from EvidencePacket", () => {
    const result = buildOutputGateResult(makePacket({ freshnessLabel: "stale" }), 0.5, 0.5);
    expect(result.freshness).toBe("stale");
  });

  it("includes strong evidence message in gate_reason when score >= 70", () => {
    const result = buildOutputGateResult(makePacket({ evidenceScore: 80 }), 0.75, 0.2);
    expect(result.gate_reason).toContain("strong evidence");
  });
});

describe("buildFallbackOutputGateResult", () => {
  it("returns a safe fallback with gate_passed=false", () => {
    const result = buildFallbackOutputGateResult();
    expect(result.gate_passed).toBe(false);
    expect(result.evidence_score).toBe(0);
    expect(result.evidence_level).toBe("insufficient");
    expect(result.output_mode).toBe("framework_only");
    expect(result.advisory_only).toBe(true);
    expect(result.gate_reason).toContain("fallback");
  });
});
