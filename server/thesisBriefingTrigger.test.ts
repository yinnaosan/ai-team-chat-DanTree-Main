/**
 * DANTREE_BRIEFING_C1 — thesisBriefingTrigger.test.ts
 *
 * 20 deterministic test cases. No I/O, no DB, no LLM.
 * Groups:
 *   T1-T9:  shouldTriggerBriefing (9 cases)
 *   T10-T16: buildBriefingPayload (7 cases)
 *   T17-T20: payload rules (4 cases)
 */

import { describe, it, expect } from "vitest";
import {
  shouldTriggerBriefing,
  buildBriefingPayload,
  DEBOUNCE_MS,
} from "./thesisBriefingTrigger";

const NOW = 1_700_000_000_000; // fixed reference time

// ─── shouldTriggerBriefing ────────────────────────────────────────────────────

describe("shouldTriggerBriefing", () => {
  // T1: STRONG, no prior, watchItemActive=true → true
  it("T1: STRONG with lastStrongAt=null, watchItemActive=true → true", () => {
    expect(shouldTriggerBriefing({
      signalStrength: "STRONG",
      lastStrongAt: null,
      nowMs: NOW,
      watchItemActive: true,
    })).toBe(true);
  });

  // T2: MODERATE → false (Gate 1)
  it("T2: MODERATE → false", () => {
    expect(shouldTriggerBriefing({
      signalStrength: "MODERATE",
      lastStrongAt: null,
      nowMs: NOW,
    })).toBe(false);
  });

  // T3: WEAK → false (Gate 1)
  it("T3: WEAK → false", () => {
    expect(shouldTriggerBriefing({
      signalStrength: "WEAK",
      lastStrongAt: null,
      nowMs: NOW,
    })).toBe(false);
  });

  // T4: INSUFFICIENT_DATA → false (Gate 1)
  it("T4: INSUFFICIENT_DATA → false", () => {
    expect(shouldTriggerBriefing({
      signalStrength: "INSUFFICIENT_DATA",
      lastStrongAt: null,
      nowMs: NOW,
    })).toBe(false);
  });

  // T5: empty string → false (Gate 1)
  it("T5: empty string → false", () => {
    expect(shouldTriggerBriefing({
      signalStrength: "",
      lastStrongAt: null,
      nowMs: NOW,
    })).toBe(false);
  });

  // T6: STRONG, lastStrongAt exactly at boundary (DEBOUNCE_MS ago), watchItemActive=true → true
  it("T6: STRONG, lastStrongAt exactly DEBOUNCE_MS ago, watchItemActive=true → true", () => {
    expect(shouldTriggerBriefing({
      signalStrength: "STRONG",
      lastStrongAt: NOW - DEBOUNCE_MS,
      nowMs: NOW,
      watchItemActive: true,
    })).toBe(true);
  });

  // T7: STRONG, lastStrongAt 1ms inside debounce window → false
  it("T7: STRONG, lastStrongAt 1ms inside debounce → false", () => {
    expect(shouldTriggerBriefing({
      signalStrength: "STRONG",
      lastStrongAt: NOW - DEBOUNCE_MS + 1,
      nowMs: NOW,
    })).toBe(false);
  });

  // T8: STRONG, lastStrongAt 1ms outside debounce window, watchItemActive=true → true
  it("T8: STRONG, lastStrongAt 1ms outside debounce, watchItemActive=true → true", () => {
    expect(shouldTriggerBriefing({
      signalStrength: "STRONG",
      lastStrongAt: NOW - DEBOUNCE_MS - 1,
      nowMs: NOW,
      watchItemActive: true,
    })).toBe(true);
  });

  // T9: STRONG, lastStrongAt = 1 second ago (well within debounce) → false
  it("T9: STRONG, lastStrongAt 1s ago → false", () => {
    expect(shouldTriggerBriefing({
      signalStrength: "STRONG",
      lastStrongAt: NOW - 1_000,
      nowMs: NOW,
    })).toBe(false);
  });
});

// ─── buildBriefingPayload ─────────────────────────────────────────────────────

describe("buildBriefingPayload", () => {
  // T10: title format
  it("T10: title format is correct", () => {
    const { title } = buildBriefingPayload({
      ticker: "AAPL",
      signalStrength: "STRONG",
      inflectionEvidence: [],
    });
    expect(title).toBe("[DanTree] AAPL 论点出现强信号变化");
  });

  // T11: content starts with signal strength line
  it("T11: content starts with 信号强度: STRONG", () => {
    const { content } = buildBriefingPayload({
      ticker: "TSLA",
      signalStrength: "STRONG",
      inflectionEvidence: [],
    });
    expect(content.startsWith("信号强度: STRONG")).toBe(true);
  });

  // T12: advisory_only disclaimer is always last line
  it("T12: advisory_only disclaimer is always last line", () => {
    const { content } = buildBriefingPayload({
      ticker: "NVDA",
      signalStrength: "STRONG",
      inflectionEvidence: ["evidence A"],
    });
    const lines = content.split("\n");
    expect(lines[lines.length - 1]).toBe("[advisory_only: 仅供参考，非投资建议]");
  });

  // T13: 3 evidence items → all 3 included
  it("T13: 3 evidence items → all 3 in content", () => {
    const { content } = buildBriefingPayload({
      ticker: "MSFT",
      signalStrength: "STRONG",
      inflectionEvidence: ["ev1", "ev2", "ev3"],
    });
    expect(content).toContain("ev1");
    expect(content).toContain("ev2");
    expect(content).toContain("ev3");
  });

  // T14: 5 evidence items → only first 3 included (cap at 3)
  it("T14: 5 evidence items → capped at 3", () => {
    const { content } = buildBriefingPayload({
      ticker: "GOOGL",
      signalStrength: "STRONG",
      inflectionEvidence: ["ev1", "ev2", "ev3", "ev4", "ev5"],
    });
    expect(content).toContain("ev1");
    expect(content).toContain("ev2");
    expect(content).toContain("ev3");
    expect(content).not.toContain("ev4");
    expect(content).not.toContain("ev5");
  });

  // T15: 0 evidence items → header + disclaimer only (2 lines)
  it("T15: 0 evidence items → 2 lines (header + disclaimer)", () => {
    const { content } = buildBriefingPayload({
      ticker: "META",
      signalStrength: "STRONG",
      inflectionEvidence: [],
    });
    const lines = content.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("信号强度: STRONG");
    expect(lines[1]).toBe("[advisory_only: 仅供参考，非投资建议]");
  });

  // T16: no recommendation language in payload
  it("T16: no buy/sell/推荐/建议买入 language in payload", () => {
    const { title, content } = buildBriefingPayload({
      ticker: "BABA",
      signalStrength: "STRONG",
      inflectionEvidence: ["revenue growth acceleration", "margin expansion"],
    });
    const full = title + "\n" + content;
    expect(full).not.toMatch(/buy|sell|推荐|建议买入|建议卖出/i);
  });
});

// ─── Payload rules ────────────────────────────────────────────────────────────

describe("payload rules", () => {
  // T17: ticker appears in title
  it("T17: ticker appears in title", () => {
    const { title } = buildBriefingPayload({
      ticker: "600519",
      signalStrength: "STRONG",
      inflectionEvidence: [],
    });
    expect(title).toContain("600519");
  });

  // T18: content lines count with 1 evidence = 3 (header + 1 evidence + disclaimer)
  it("T18: 1 evidence item → 3 lines", () => {
    const { content } = buildBriefingPayload({
      ticker: "AMZN",
      signalStrength: "STRONG",
      inflectionEvidence: ["single evidence"],
    });
    expect(content.split("\n")).toHaveLength(3);
  });

  // T19: disclaimer text exact match
  it("T19: disclaimer exact text", () => {
    const { content } = buildBriefingPayload({
      ticker: "NFLX",
      signalStrength: "STRONG",
      inflectionEvidence: [],
    });
    expect(content).toContain("[advisory_only: 仅供参考，非投资建议]");
  });

  // T20: DEBOUNCE_MS constant equals 24 hours
  it("T20: DEBOUNCE_MS = 86_400_000 (24h)", () => {
    expect(DEBOUNCE_MS).toBe(86_400_000);
  });
});

// ─── C2: watchItemActive gate ─────────────────────────────────────────────────

describe("C2: watchItemActive gate", () => {
  // TC1: STRONG, watchItemActive=false → false (Gate 0 blocks)
  it("TC1: STRONG, watchItemActive=false → false", () => {
    expect(shouldTriggerBriefing({
      signalStrength: "STRONG",
      lastStrongAt: null,
      nowMs: NOW,
      watchItemActive: false,
    })).toBe(false);
  });

  // TC2: STRONG, watchItemActive=undefined → false (conservative default)
  it("TC2: STRONG, watchItemActive=undefined → false", () => {
    expect(shouldTriggerBriefing({
      signalStrength: "STRONG",
      lastStrongAt: null,
      nowMs: NOW,
      watchItemActive: undefined,
    })).toBe(false);
  });

  // TC3: STRONG, watchItemActive omitted → false (conservative default)
  it("TC3: STRONG, watchItemActive omitted → false", () => {
    expect(shouldTriggerBriefing({
      signalStrength: "STRONG",
      lastStrongAt: null,
      nowMs: NOW,
      // watchItemActive not provided
    })).toBe(false);
  });

  // TC4: MODERATE, watchItemActive=true → false (Gate 1 still blocks)
  it("TC4: MODERATE, watchItemActive=true → false (STRONG gate preserved)", () => {
    expect(shouldTriggerBriefing({
      signalStrength: "MODERATE",
      lastStrongAt: null,
      nowMs: NOW,
      watchItemActive: true,
    })).toBe(false);
  });

  // TC5: STRONG, watchItemActive=true, within debounce → false (Gate 2 still blocks)
  it("TC5: STRONG, watchItemActive=true, within 24h debounce → false (debounce preserved)", () => {
    expect(shouldTriggerBriefing({
      signalStrength: "STRONG",
      lastStrongAt: NOW - 1_000, // 1 second ago
      nowMs: NOW,
      watchItemActive: true,
    })).toBe(false);
  });
});
