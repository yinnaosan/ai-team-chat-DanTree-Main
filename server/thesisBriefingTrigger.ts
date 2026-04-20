/**
 * DANTREE_BRIEFING_C1 — Thesis Briefing Trigger
 *
 * Scope: STRONG-only post-analysis notification trigger.
 * - shouldTriggerBriefing(): pure deterministic gate (no I/O)
 * - buildBriefingPayload(): pure payload builder (no I/O)
 *
 * DENY: subscription management, email/SMS, deepResearch, schema changes.
 * advisory_only: always enforced.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** 24-hour debounce window in milliseconds */
export const DEBOUNCE_MS = 86_400_000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BriefingTriggerInput {
  /** Signal strength from thesisEvolutionEngine */
  signalStrength: string;
  /** Timestamp (ms) of the last STRONG signal write, or null if none */
  lastStrongAt: number | null;
  /** Override for current time (used in tests) */
  nowMs?: number;
}

export interface BriefingPayloadInput {
  /** Ticker symbol (e.g. "AAPL") */
  ticker: string;
  /** Signal strength — must be "STRONG" */
  signalStrength: string;
  /** Up to N inflection evidence strings (capped at 3 internally) */
  inflectionEvidence: string[];
}

export interface BriefingPayload {
  title: string;
  content: string;
}

// ─── shouldTriggerBriefing ────────────────────────────────────────────────────

/**
 * Pure gate function — no I/O.
 *
 * Gate 1: signal must be exactly "STRONG"
 * Gate 2: 24h debounce — if lastStrongAt is within DEBOUNCE_MS, suppress
 *
 * Returns true only when both gates pass.
 */
export function shouldTriggerBriefing(input: BriefingTriggerInput): boolean {
  // Gate 1: STRONG-only
  if (input.signalStrength !== "STRONG") return false;

  // Gate 2: 24h debounce
  const now = input.nowMs ?? Date.now();
  if (input.lastStrongAt !== null && now - input.lastStrongAt < DEBOUNCE_MS) {
    return false;
  }

  return true;
}

// ─── buildBriefingPayload ─────────────────────────────────────────────────────

/**
 * Pure payload builder — no I/O, no recommendation language.
 *
 * Title format: [DanTree] {ticker} 论点出现强信号变化
 * Content:
 *   信号强度: STRONG
 *   <evidence item 1>  (up to 3, via .slice(0, 3))
 *   <evidence item 2>
 *   <evidence item 3>
 *   [advisory_only: 仅供参考，非投资建议]
 *
 * advisory_only disclaimer is ALWAYS the last line.
 * No buy/sell/推荐/建议买入 language anywhere.
 */
export function buildBriefingPayload(input: BriefingPayloadInput): BriefingPayload {
  const title = `[DanTree] ${input.ticker} 论点出现强信号变化`;

  const lines: string[] = [];
  lines.push(`信号强度: ${input.signalStrength}`);

  // Cap evidence at 3
  const evidence = input.inflectionEvidence.slice(0, 3);
  for (const item of evidence) {
    lines.push(item);
  }

  // advisory_only disclaimer — always last
  lines.push("[advisory_only: 仅供参考，非投资建议]");

  const content = lines.join("\n");

  return { title, content };
}
