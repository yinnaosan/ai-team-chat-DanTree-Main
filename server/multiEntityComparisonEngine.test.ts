/**
 * multiEntityComparisonEngine.test.ts
 * Level 15.0B — Multi-Entity Comparison Engine Tests
 */

import { describe, it, expect } from "vitest";
import {
  buildMultiEntityComparison,
  type MultiEntityComparisonResult,
  type ComparisonDimension,
} from "./multiEntityComparisonEngine";

// ── Helpers ───────────────────────────────────────────────────────────────────

function isValidWinner(w: ComparisonDimension["winner"]): boolean {
  return ["left", "right", "tie", "unavailable"].includes(w);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("buildMultiEntityComparison", () => {
  let result: MultiEntityComparisonResult;

  it("returns a result without throwing", () => {
    expect(() => {
      result = buildMultiEntityComparison("AAPL", "MSFT");
    }).not.toThrow();
  });

  it("has correct entity labels", () => {
    result = buildMultiEntityComparison("AAPL", "MSFT");
    expect(result.left_entity).toBe("AAPL");
    expect(result.right_entity).toBe("MSFT");
  });

  it("sets advisory_only = true", () => {
    result = buildMultiEntityComparison("AAPL", "MSFT");
    expect(result.advisory_only).toBe(true);
  });

  it("has a valid generated_at ISO string", () => {
    result = buildMultiEntityComparison("AAPL", "MSFT");
    expect(() => new Date(result.generated_at)).not.toThrow();
    expect(new Date(result.generated_at).getTime()).toBeGreaterThan(0);
  });

  it("includes all 5 comparison dimensions", () => {
    result = buildMultiEntityComparison("AAPL", "MSFT");
    expect(result.semantic_comparison.dimension).toBe("semantic_direction");
    expect(result.evidence_comparison.dimension).toBe("evidence_strength");
    expect(result.gate_comparison.dimension).toBe("output_gate");
    expect(result.source_comparison.dimension).toBe("source_breadth");
    expect(result.fragility_comparison.dimension).toBe("fragility");
  });

  it("all dimension winners are valid enum values", () => {
    result = buildMultiEntityComparison("AAPL", "MSFT");
    const dims = [
      result.semantic_comparison,
      result.evidence_comparison,
      result.gate_comparison,
      result.source_comparison,
      result.fragility_comparison,
    ];
    for (const dim of dims) {
      expect(isValidWinner(dim.winner)).toBe(true);
    }
  });

  it("evidence_comparison has numeric values", () => {
    result = buildMultiEntityComparison("AAPL", "MSFT");
    expect(typeof result.evidence_comparison.left_value).toBe("number");
    expect(typeof result.evidence_comparison.right_value).toBe("number");
  });

  it("source_comparison has numeric values", () => {
    result = buildMultiEntityComparison("AAPL", "MSFT");
    expect(typeof result.source_comparison.left_value).toBe("number");
    expect(typeof result.source_comparison.right_value).toBe("number");
  });

  it("gate_comparison values are PASS or BLOCK", () => {
    result = buildMultiEntityComparison("AAPL", "MSFT");
    expect(["PASS", "BLOCK"]).toContain(result.gate_comparison.left_value);
    expect(["PASS", "BLOCK"]).toContain(result.gate_comparison.right_value);
  });

  it("comparison_summary is a non-empty string", () => {
    result = buildMultiEntityComparison("AAPL", "MSFT");
    expect(typeof result.comparison_summary).toBe("string");
    expect(result.comparison_summary.length).toBeGreaterThan(10);
  });

  it("comparison_summary contains advisory disclaimer", () => {
    result = buildMultiEntityComparison("AAPL", "MSFT");
    expect(result.comparison_summary).toContain("Advisory only");
  });

  it("works with same entity on both sides", () => {
    expect(() => buildMultiEntityComparison("AAPL", "AAPL")).not.toThrow();
    const r = buildMultiEntityComparison("AAPL", "AAPL");
    expect(r.left_entity).toBe("AAPL");
    expect(r.right_entity).toBe("AAPL");
  });

  it("works with non-standard tickers", () => {
    expect(() => buildMultiEntityComparison("BTC-USD", "ETH-USD")).not.toThrow();
  });

  it("left_semantic and right_semantic have entity labels", () => {
    result = buildMultiEntityComparison("AAPL", "TSLA");
    expect(result.left_semantic.entity).toBe("AAPL");
    expect(result.right_semantic.entity).toBe("TSLA");
  });

  it("left_evidence and right_evidence have entity labels", () => {
    result = buildMultiEntityComparison("AAPL", "TSLA");
    expect(result.left_evidence.entity).toBe("AAPL");
    expect(result.right_evidence.entity).toBe("TSLA");
  });

  it("left_source and right_source have entity labels", () => {
    result = buildMultiEntityComparison("AAPL", "TSLA");
    expect(result.left_source.entity).toBe("AAPL");
    expect(result.right_source.entity).toBe("TSLA");
  });

  it("evidence_score is between 0 and 100", () => {
    result = buildMultiEntityComparison("AAPL", "MSFT");
    expect(result.left_evidence.evidence_score).toBeGreaterThanOrEqual(0);
    expect(result.left_evidence.evidence_score).toBeLessThanOrEqual(100);
    expect(result.right_evidence.evidence_score).toBeGreaterThanOrEqual(0);
    expect(result.right_evidence.evidence_score).toBeLessThanOrEqual(100);
  });

  it("source_count is non-negative", () => {
    result = buildMultiEntityComparison("AAPL", "MSFT");
    expect(result.left_source.source_count).toBeGreaterThanOrEqual(0);
    expect(result.right_source.source_count).toBeGreaterThanOrEqual(0);
  });
});
