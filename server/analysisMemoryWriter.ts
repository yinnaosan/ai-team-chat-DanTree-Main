/**
 * LEVEL3A: Analysis Memory Writer + Retrieval
 * Converts DanTree from "every analysis starts from zero"
 * to "repeated entity analysis starts from prior structured memory".
 *
 * MODULE_ID: LEVEL3A_MEMORY_WRITER
 * ZERO_NEW_LLM_CALLS: true
 * NON_FATAL: write/read failures must never break main pipeline
 */

import { getDb } from "./db";
import { analysisMemory } from "../drizzle/schema";
import { eq, and, gt, desc } from "drizzle-orm";
import type { FinalOutputSchema } from "./outputSchemaValidator";

// ── TTL Config ────────────────────────────────────────────────────────────────
const MEMORY_TTL_DAYS = 30; // default: 30 days expiry

// ── Eligible task types for memory write ─────────────────────────────────────
const MEMORY_ELIGIBLE_TASK_TYPES = new Set([
  "stock_analysis",
  "comparison",
  "macro_analysis",
]);

// ── Ineligible output modes (noisy / non-analytical) ─────────────────────────
const MEMORY_SKIP_MODES = new Set([
  "quick",
  "discussion",
  "general",
]);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WriteMemoryParams {
  userId: number;
  taskId: number;
  ticker: string;
  taskType: string;
  verdict: string;
  confidenceLevel: string;
  evidenceScore: number;
  bullCaseSummary: string;
  bearCaseSummary: string;
  keyUncertainty: string;
  openHypotheses: string[];
  outputMode: string;
  loopRan: boolean;
}

export interface MemoryRecord {
  ticker: string;
  taskType: string;
  verdict: string;
  confidenceLevel: string;
  evidenceScore: number;
  bullCaseSummary: string;
  bearCaseSummary: string;
  keyUncertainty: string;
  openHypotheses: string[];
  outputMode: string;
  loopRan: boolean;
  createdAt: string;
}

export type MemoryResult =
  | { found: false; memory: null }
  | { found: true; memory: MemoryRecord };

// ── Helper: extract concise summaries from FinalOutputSchema ──────────────────

export function extractMemoryFromOutput(
  output: FinalOutputSchema,
  outputMode: string
): Pick<WriteMemoryParams, "bullCaseSummary" | "bearCaseSummary" | "keyUncertainty" | "openHypotheses" | "verdict" | "confidenceLevel"> {
  // Bull case: join first 2 items, max 300 chars
  const bullCaseSummary = output.bull_case
    .slice(0, 2)
    .join(" | ")
    .slice(0, 300);

  // Bear case: join first 2 items, max 300 chars
  const bearCaseSummary = output.bear_case
    .slice(0, 2)
    .join(" | ")
    .slice(0, 300);

  // Key uncertainty: from discussion field, max 200 chars
  const keyUncertainty = (output.discussion?.key_uncertainty ?? "").slice(0, 200);

  // Open hypotheses: structured array, max 3 items
  const openHypotheses = (output.discussion?.open_hypotheses ?? []).slice(0, 3);

  return {
    verdict: (output.verdict ?? "").slice(0, 200),
    confidenceLevel: output.confidence ?? "medium",
    bullCaseSummary,
    bearCaseSummary,
    keyUncertainty,
    openHypotheses,
  };
}

// ── Phase 1: Write Analysis Memory ───────────────────────────────────────────

export async function writeAnalysisMemory(params: WriteMemoryParams): Promise<void> {
  // Gate: only write for eligible task types
  if (!MEMORY_ELIGIBLE_TASK_TYPES.has(params.taskType)) {
    return;
  }
  // Gate: skip noisy modes
  if (MEMORY_SKIP_MODES.has(params.outputMode)) {
    return;
  }
  // Gate: skip empty ticker
  if (!params.ticker || params.ticker.trim() === "") {
    return;
  }

  try {
    const db = await getDb();
    if (!db) return;

    const expiresAt = new Date(Date.now() + MEMORY_TTL_DAYS * 24 * 60 * 60 * 1000);

    await db.insert(analysisMemory).values({
      userId: params.userId,
      taskId: params.taskId,
      ticker: params.ticker.toUpperCase().trim(),
      taskType: params.taskType,
      verdict: params.verdict,
      confidenceLevel: params.confidenceLevel,
      evidenceScore: String(params.evidenceScore / 100), // store as 0-1 decimal
      bullCaseSummary: params.bullCaseSummary || null,
      bearCaseSummary: params.bearCaseSummary || null,
      keyUncertainty: params.keyUncertainty || null,
      openHypotheses: params.openHypotheses.length > 0
        ? JSON.stringify(params.openHypotheses)
        : null,
      outputMode: params.outputMode,
      loopRan: params.loopRan ? 1 : 0,
      expiresAt,
    });

    console.log(`[LEVEL3A] Memory written: ticker=${params.ticker}, verdict=${params.verdict}, taskId=${params.taskId}`);
  } catch (e) {
    // Non-fatal: memory write failure must never break the main flow
    console.error("[LEVEL3A] Memory write failed (non-fatal):", (e as Error).message);
  }
}

// ── Phase 2: Retrieve Analysis Memory ────────────────────────────────────────

export async function getAnalysisMemory(params: {
  userId: number;
  ticker: string;
  taskType?: string;
}): Promise<MemoryResult> {
  if (!params.ticker || params.ticker.trim() === "") {
    return { found: false, memory: null };
  }

  try {
    const db = await getDb();
    if (!db) return { found: false, memory: null };

    const now = new Date();
    const normalizedTicker = params.ticker.toUpperCase().trim();

    const rows = await db
      .select()
      .from(analysisMemory)
      .where(
        and(
          eq(analysisMemory.userId, params.userId),
          eq(analysisMemory.ticker, normalizedTicker),
          gt(analysisMemory.expiresAt, now)
        )
      )
      .orderBy(desc(analysisMemory.createdAt))
      .limit(1);

    if (!rows || rows.length === 0) {
      return { found: false, memory: null };
    }

    const row = rows[0];

    // Parse openHypotheses from JSON string
    let openHypotheses: string[] = [];
    if (row.openHypotheses) {
      try {
        const parsed = JSON.parse(row.openHypotheses);
        if (Array.isArray(parsed)) openHypotheses = parsed;
      } catch {
        // ignore parse error
      }
    }

    return {
      found: true,
      memory: {
        ticker: row.ticker,
        taskType: row.taskType,
        verdict: row.verdict,
        confidenceLevel: row.confidenceLevel,
        evidenceScore: parseFloat(String(row.evidenceScore ?? "0")),
        bullCaseSummary: row.bullCaseSummary ?? "",
        bearCaseSummary: row.bearCaseSummary ?? "",
        keyUncertainty: row.keyUncertainty ?? "",
        openHypotheses,
        outputMode: row.outputMode,
        loopRan: row.loopRan === 1,
        createdAt: row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
      },
    };
  } catch (e) {
    // Non-fatal: retrieval failure must never break the main flow
    console.error("[LEVEL3A] Memory retrieval failed (non-fatal):", (e as Error).message);
    return { found: false, memory: null };
  }
}

// ── Phase 3 Helper: Build PRIOR_ANALYSIS_CONTEXT block ───────────────────────

export function buildPriorAnalysisContextBlock(memory: MemoryRecord): string {
  const hypothesesStr = memory.openHypotheses.length > 0
    ? memory.openHypotheses.map((h, i) => `  ${i + 1}. ${h}`).join("\n")
    : "  (none)";

  const createdDate = memory.createdAt
    ? new Date(memory.createdAt).toLocaleDateString("zh-CN")
    : "unknown";

  return `[PRIOR_ANALYSIS_CONTEXT]
TICKER: ${memory.ticker}
LAST_ANALYSIS_DATE: ${createdDate}
LAST_VERDICT: ${memory.verdict}
LAST_CONFIDENCE: ${memory.confidenceLevel}
LAST_EVIDENCE_SCORE: ${(memory.evidenceScore * 100).toFixed(1)}/100
LAST_BULL_CASE: ${memory.bullCaseSummary || "(not available)"}
LAST_BEAR_CASE: ${memory.bearCaseSummary || "(not available)"}
LAST_KEY_UNCERTAINTY: ${memory.keyUncertainty || "(not available)"}
OPEN_HYPOTHESES:
${hypothesesStr}
INSTRUCTION:
Focus on what changed relative to prior analysis.
Do not restate unchanged known risks unless they materially changed.
Highlight any new developments that alter the prior verdict or confidence.
[/PRIOR_ANALYSIS_CONTEXT]`;
}
