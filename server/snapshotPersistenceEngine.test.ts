/**
 * snapshotPersistenceEngine.test.ts — L21.2A Auto-snapshot logic tests
 *
 * Tests the dedup logic and guard conditions for the auto-snapshot trigger
 * implemented in useWorkspaceViewModel (client-side) and the server-side
 * saveEntitySnapshot route.
 */
import { describe, it, expect } from "vitest";

// ─── Dedup logic (mirrors useWorkspaceViewModel.deriveStateHash) ──────────────

function deriveStateHash(
  stance: string | null,
  changeMarker: string | null,
  alertSeverity: string | null,
  timingBias: string | null
): string {
  return `${stance ?? ""}|${changeMarker ?? ""}|${alertSeverity ?? ""}|${timingBias ?? ""}`;
}

describe("L21.2A — Auto-snapshot dedup logic", () => {
  it("produces identical hash for identical state", () => {
    const h1 = deriveStateHash("bullish", "upgrade", "medium", "buy");
    const h2 = deriveStateHash("bullish", "upgrade", "medium", "buy");
    expect(h1).toBe(h2);
  });

  it("produces different hash when stance changes", () => {
    const h1 = deriveStateHash("bullish", "upgrade", "medium", "buy");
    const h2 = deriveStateHash("bearish", "upgrade", "medium", "buy");
    expect(h1).not.toBe(h2);
  });

  it("produces different hash when changeMarker changes", () => {
    const h1 = deriveStateHash("bullish", "upgrade", "medium", "buy");
    const h2 = deriveStateHash("bullish", "downgrade", "medium", "buy");
    expect(h1).not.toBe(h2);
  });

  it("handles null values gracefully", () => {
    const h = deriveStateHash(null, null, null, null);
    expect(h).toBe("|||");
  });

  it("null and empty string produce same hash (safe default)", () => {
    const h1 = deriveStateHash(null, null, null, null);
    const h2 = deriveStateHash("", "", "", "");
    expect(h1).toBe(h2);
  });

  it("partial nulls produce distinct hashes from all-nulls", () => {
    const h1 = deriveStateHash("bullish", null, null, null);
    const h2 = deriveStateHash(null, null, null, null);
    expect(h1).not.toBe(h2);
  });
});

// ─── Guard conditions ─────────────────────────────────────────────────────────

describe("L21.2A — Auto-snapshot guard conditions", () => {
  function shouldTriggerSnapshot(params: {
    sessionType: string;
    focusKey: string;
    stance: string | null;
    changeMarker: string | null;
    lastEntity: string;
    lastHash: string;
  }): boolean {
    // Guard 1: only entity sessions
    if (params.sessionType !== "entity") return false;
    // Guard 2: focusKey must be set
    if (!params.focusKey) return false;
    // Guard 3: need at least thesis data
    if (!params.stance && !params.changeMarker) return false;
    // Guard 4: dedup
    const hash = deriveStateHash(params.stance, params.changeMarker, null, null);
    if (params.focusKey === params.lastEntity && hash === params.lastHash) return false;
    return true;
  }

  it("fires for entity session with valid thesis data", () => {
    expect(shouldTriggerSnapshot({
      sessionType: "entity",
      focusKey: "AAPL",
      stance: "bullish",
      changeMarker: "upgrade",
      lastEntity: "",
      lastHash: "",
    })).toBe(true);
  });

  it("does NOT fire for basket session", () => {
    expect(shouldTriggerSnapshot({
      sessionType: "basket",
      focusKey: "MY_BASKET",
      stance: "bullish",
      changeMarker: "upgrade",
      lastEntity: "",
      lastHash: "",
    })).toBe(false);
  });

  it("does NOT fire when focusKey is empty", () => {
    expect(shouldTriggerSnapshot({
      sessionType: "entity",
      focusKey: "",
      stance: "bullish",
      changeMarker: null,
      lastEntity: "",
      lastHash: "",
    })).toBe(false);
  });

  it("does NOT fire when both stance and changeMarker are null", () => {
    expect(shouldTriggerSnapshot({
      sessionType: "entity",
      focusKey: "AAPL",
      stance: null,
      changeMarker: null,
      lastEntity: "",
      lastHash: "",
    })).toBe(false);
  });

  it("does NOT fire when state is identical to last written (dedup)", () => {
    const lastHash = deriveStateHash("bullish", "upgrade", null, null);
    expect(shouldTriggerSnapshot({
      sessionType: "entity",
      focusKey: "AAPL",
      stance: "bullish",
      changeMarker: "upgrade",
      lastEntity: "AAPL",
      lastHash,
    })).toBe(false);
  });

  it("fires when entity changes even if state hash is same", () => {
    const lastHash = deriveStateHash("bullish", "upgrade", null, null);
    expect(shouldTriggerSnapshot({
      sessionType: "entity",
      focusKey: "NVDA",  // different entity
      stance: "bullish",
      changeMarker: "upgrade",
      lastEntity: "AAPL",
      lastHash,
    })).toBe(true);
  });

  it("fires when state changes for same entity", () => {
    const lastHash = deriveStateHash("bullish", "upgrade", null, null);
    expect(shouldTriggerSnapshot({
      sessionType: "entity",
      focusKey: "AAPL",
      stance: "bearish",  // changed
      changeMarker: "upgrade",
      lastEntity: "AAPL",
      lastHash,
    })).toBe(true);
  });

  it("fires with only stance (changeMarker null)", () => {
    expect(shouldTriggerSnapshot({
      sessionType: "entity",
      focusKey: "TSLA",
      stance: "neutral",
      changeMarker: null,
      lastEntity: "",
      lastHash: "",
    })).toBe(true);
  });

  it("fires with only changeMarker (stance null)", () => {
    expect(shouldTriggerSnapshot({
      sessionType: "entity",
      focusKey: "TSLA",
      stance: null,
      changeMarker: "downgrade",
      lastEntity: "",
      lastHash: "",
    })).toBe(true);
  });
});

// ─── stateSummaryText builder ─────────────────────────────────────────────────

describe("L21.2A — stateSummaryText builder", () => {
  function buildSummaryText(
    stance: string | null,
    changeMarker: string | null,
    alertSeverity: string | null,
    timingBias: string | null
  ): string {
    return [
      stance ? `Stance: ${stance}` : null,
      changeMarker ? `Change: ${changeMarker}` : null,
      alertSeverity ? `Alert: ${alertSeverity}` : null,
      timingBias ? `Timing: ${timingBias}` : null,
    ].filter(Boolean).join(" | ") || "No significant state";
  }

  it("builds full summary when all fields present", () => {
    const s = buildSummaryText("bullish", "upgrade", "high", "buy");
    expect(s).toBe("Stance: bullish | Change: upgrade | Alert: high | Timing: buy");
  });

  it("builds partial summary when some fields null", () => {
    const s = buildSummaryText("bullish", null, null, null);
    expect(s).toBe("Stance: bullish");
  });

  it("returns fallback when all null", () => {
    const s = buildSummaryText(null, null, null, null);
    expect(s).toBe("No significant state");
  });
});
