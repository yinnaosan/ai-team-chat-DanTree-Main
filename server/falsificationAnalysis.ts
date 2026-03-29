/**
 * DANTREE LEVEL9 — Phase 5: Falsification Feedback Layer
 *
 * Elevates falsification from descriptive text into measurable strategic feedback.
 * Measures whether specific falsification warnings are useful.
 * advisory_only: always true
 */

import { getDb } from "./db";
import { decisionLog, decisionOutcome } from "../drizzle/schema";
import { eq, and, isNotNull } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface FalsificationTagStats {
  tag: string;
  total_occurrences: number;
  failure_rate: number;   // % of decisions with this tag that failed (isPositive=false)
  false_alarm_rate: number; // % that had this tag but succeeded anyway
  avg_return_when_tagged: number;
}

export interface FalsificationAnalysisOutput {
  most_common_falsification_tags: FalsificationTagStats[];
  high_failure_tags: FalsificationTagStats[];   // tags strongly correlated with failures
  high_false_alarm_tags: FalsificationTagStats[]; // tags that warned but outcome was positive
  best_warning_tags: FalsificationTagStats[];    // tags that reliably predict failure
  advisory_only: true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Function
// ─────────────────────────────────────────────────────────────────────────────

export async function analyzeFalsificationPerformance(userId: number): Promise<FalsificationAnalysisOutput> {
  const EMPTY: FalsificationAnalysisOutput = {
    most_common_falsification_tags: [],
    high_failure_tags: [],
    high_false_alarm_tags: [],
    best_warning_tags: [],
    advisory_only: true,
  };

  try {
    const db = await getDb();
    if (!db) return EMPTY;

    const { getPortfolioByUserId } = await import("./portfolioPersistence");
    const portfolios = await getPortfolioByUserId(userId);
    if (portfolios.length === 0) return EMPTY;
    const portfolioId = portfolios[0].id;

    // Fetch decisions with falsification tags + outcomes
    const rows = await db
      .select({
        falsificationTagsJson: decisionLog.falsificationTagsJson,
        returnPct: decisionOutcome.returnPct,
        isPositive: decisionOutcome.isPositive,
      })
      .from(decisionLog)
      .innerJoin(decisionOutcome, eq(decisionOutcome.decisionId, decisionLog.id))
      .where(
        and(
          eq(decisionLog.portfolioId, portfolioId),
          eq(decisionOutcome.evaluated, true),
          isNotNull(decisionOutcome.returnPct),
          isNotNull(decisionLog.falsificationTagsJson)
        )
      )
      .limit(500);

    if (rows.length === 0) return EMPTY;

    // Aggregate per tag
    const tagMap = new Map<string, {
      total: number;
      failures: number;
      successes: number;
      returnSum: number;
    }>();

    for (const row of rows) {
      const tags = parseFalsificationTags(row.falsificationTagsJson);
      if (tags.length === 0) continue;

      const returnVal = parseFloat(row.returnPct ?? "0");
      const failed = !row.isPositive;

      for (const tag of tags) {
        if (!tagMap.has(tag)) {
          tagMap.set(tag, { total: 0, failures: 0, successes: 0, returnSum: 0 });
        }
        const s = tagMap.get(tag)!;
        s.total++;
        if (failed) s.failures++;
        else s.successes++;
        s.returnSum += returnVal;
      }
    }

    // Build stats
    const allStats: FalsificationTagStats[] = Array.from(tagMap.entries())
      .filter(([, s]) => s.total >= 2)
      .map(([tag, s]) => ({
        tag,
        total_occurrences: s.total,
        failure_rate: s.total > 0 ? s.failures / s.total : 0,
        false_alarm_rate: s.total > 0 ? s.successes / s.total : 0,
        avg_return_when_tagged: s.total > 0 ? s.returnSum / s.total : 0,
      }));

    // Sort by frequency
    const byFrequency = [...allStats].sort((a, b) => b.total_occurrences - a.total_occurrences);

    // High failure tags: failure_rate >= 0.60
    const highFailure = allStats
      .filter((s) => s.failure_rate >= 0.60)
      .sort((a, b) => b.failure_rate - a.failure_rate);

    // High false alarm tags: false_alarm_rate >= 0.60 (warned but outcome was positive)
    const highFalseAlarm = allStats
      .filter((s) => s.false_alarm_rate >= 0.60)
      .sort((a, b) => b.false_alarm_rate - a.false_alarm_rate);

    // Best warning tags: high failure rate + sufficient sample size
    const bestWarning = allStats
      .filter((s) => s.failure_rate >= 0.55 && s.total_occurrences >= 3)
      .sort((a, b) => b.failure_rate * b.total_occurrences - a.failure_rate * a.total_occurrences);

    return {
      most_common_falsification_tags: byFrequency.slice(0, 10),
      high_failure_tags: highFailure.slice(0, 5),
      high_false_alarm_tags: highFalseAlarm.slice(0, 5),
      best_warning_tags: bestWarning.slice(0, 5),
      advisory_only: true,
    };
  } catch (err) {
    console.error("[falsificationAnalysis] analyzeFalsificationPerformance error:", err);
    return EMPTY;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function parseFalsificationTags(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((t) => typeof t === "string");
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((t) => typeof t === "string");
    } catch {
      return [];
    }
  }
  return [];
}
