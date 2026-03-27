/**
 * LEVEL3 Memory Engine — Core
 * Memory-augmented reasoning: write, retrieve, compute influence.
 * Priority: Step0 override > memory influence > history control > default logic
 */

import { randomUUID } from "crypto";
import {
  insertMemoryRecord,
  fetchActiveMemoryByTicker,
  fetchAllActiveMemoryForUser,
  checkDuplicateMemory,
  countActiveMemoryForTicker,
  evictOldestMemoryRecord,
} from "./memoryDb";
import type { MemoryRecordRow } from "../drizzle/schema";

// ── Constants ─────────────────────────────────────────────────────────────────

const MEMORY_CAP_PER_TICKER = 50;
const EVIDENCE_THRESHOLD = 0.55;
const SIMILAR_CASE_THRESHOLD = 0.4;   // GPT Q4: adjusted from 0.3
const MAX_INJECT = 3;
const MAX_INJECT_TOKENS = 800;
const BUDGET_GATE_RATIO = 0.7;

const TTL_MS: Record<string, number> = {
  action_record:    90 * 24 * 60 * 60 * 1000,
  thesis_snapshot:  30 * 24 * 60 * 60 * 1000,
  risk_flag:        14 * 24 * 60 * 60 * 1000,
  catalyst_note:     7 * 24 * 60 * 60 * 1000,
};

const TYPE_WEIGHT: Record<string, number> = {
  risk_flag:        1.5,
  action_record:    1.2,
  thesis_snapshot:  1.0,
  catalyst_note:    1.0,
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MemoryWriteInput {
  userId: string;
  ticker: string;
  memoryType: "action_record" | "thesis_snapshot" | "risk_flag" | "catalyst_note";
  action?: string;
  verdict?: string;
  confidence?: string;
  evidenceScore?: number;
  sourceQuery?: string;
  tags?: string[];
  // Reasoning-grade fields (from structuredSynthesis)
  thesisCore?: string;
  riskStructure?: string[];
  counterarguments?: string[];
  failureModes?: string[];
  reasoningPattern?: string;
  scenarioType?: string;
}

export interface MemoryWriteResult {
  written: boolean;
  reason: string;
  id?: string;
}

export interface MemoryInfluence {
  affects_step0: boolean;
  affects_controller: boolean;
  affects_routing: boolean;
  failure_count: number;
  invalidation_count: number;
  success_count: number;
  avg_success_score: number;
  has_failure_memory: boolean;
  has_success_with_catalyst: boolean;
  early_stop_bias: boolean;
  force_continuation: boolean;
  elevated_probe: string | null;
  memory_pattern_summary: string;
}

export interface MemoryContextBlock {
  top_memories: Array<{
    memory_id: string;
    scenario_type: string;
    thesis_core: string;
    key_risk: string;
    why_relevant_now: string;
    outcome_label?: string;
  }>;
  memory_influence_summary: string;
  memory_injected: boolean;
  records_used: number;
}

export interface MemoryRetrievalResult {
  exact: MemoryRecordRow[];
  similar: MemoryRecordRow[];
  combined: MemoryRecordRow[];
  retrieval_mode_used: string;
}

// ── Write Pipeline ────────────────────────────────────────────────────────────

/**
 * Write a memory record.
 * GPT Q5: only write if loop_ran=true AND quality threshold met.
 * Caller is responsible for checking loop_ran before calling this.
 */
export async function writeMemory(input: MemoryWriteInput): Promise<MemoryWriteResult> {
  // 1. Quality gate: evidenceScore threshold (except risk_flag)
  if (
    input.memoryType !== "risk_flag" &&
    (input.evidenceScore === undefined || input.evidenceScore < EVIDENCE_THRESHOLD)
  ) {
    return { written: false, reason: `evidence_score_below_threshold (${input.evidenceScore ?? "none"} < ${EVIDENCE_THRESHOLD})` };
  }

  // 2. Meaningful thesis check
  if (!input.thesisCore || input.thesisCore.trim().length < 20) {
    return { written: false, reason: "no_meaningful_thesis" };
  }

  // 3. Dedup check
  const isDuplicate = await checkDuplicateMemory(
    input.userId, input.ticker, input.action, input.verdict, input.confidence
  );
  if (isDuplicate) {
    return { written: false, reason: "duplicate_within_24h" };
  }

  // 4. Cap enforcement: evict oldest if at cap
  const count = await countActiveMemoryForTicker(input.userId, input.ticker);
  if (count >= MEMORY_CAP_PER_TICKER) {
    await evictOldestMemoryRecord(input.userId, input.ticker);
  }

  // 5. Compute influence flags
  const affectsStep0 = !!(
    input.memoryType === "risk_flag" ||
    (input.failureModes && input.failureModes.length > 0)
  );
  const affectsController = !!(
    input.memoryType === "action_record" || input.memoryType === "thesis_snapshot"
  );
  const affectsRouting = !!(
    input.riskStructure && input.riskStructure.length > 0
  );

  // 6. Compute TTL
  const now = Date.now();
  const ttl = TTL_MS[input.memoryType] ?? TTL_MS.action_record;
  const expiresAt = now + ttl;

  const id = randomUUID();
  await insertMemoryRecord({
    id,
    ticker: input.ticker,
    userId: input.userId,
    memoryType: input.memoryType,
    action: input.action,
    verdict: input.verdict,
    confidence: input.confidence,
    evidenceScore: input.evidenceScore?.toFixed(4) as unknown as string,
    sourceQuery: input.sourceQuery,
    tags: input.tags ?? [],
    thesisCore: input.thesisCore,
    riskStructure: input.riskStructure ?? [],
    counterarguments: input.counterarguments ?? [],
    failureModes: input.failureModes ?? [],
    reasoningPattern: input.reasoningPattern,
    scenarioType: input.scenarioType,
    affectsStep0,
    affectsController,
    affectsRouting,
    createdAt: now,
    expiresAt,
    isActive: true,
    embeddingReady: false,
  });

  return { written: true, reason: "ok", id };
}

// ── Retrieval ─────────────────────────────────────────────────────────────────

export async function retrieveMemory(params: {
  userId: string;
  ticker: string;
  limit?: number;
  currentTags?: string[];
  currentRiskStructure?: string[];
  currentScenarioType?: string;
}): Promise<MemoryRetrievalResult> {
  const limit = params.limit ?? MAX_INJECT;

  // Exact match: same ticker
  const exact = await fetchActiveMemoryByTicker(params.userId, params.ticker, limit * 2);
  const exactRanked = rankRecords(exact, Date.now()).slice(0, limit);

  // Similar case: other tickers with structural similarity
  const allRecords = await fetchAllActiveMemoryForUser(params.userId, 200);
  const otherRecords = allRecords.filter(r => r.ticker !== params.ticker);
  const similar = scoreSimilarCases(otherRecords, params)
    .filter(r => r._score >= SIMILAR_CASE_THRESHOLD)
    .slice(0, limit)
    .map(r => r.record);

  // Combine, deduplicate, cap at 5
  const exactIds = new Set(exactRanked.map(r => r.id));
  const combined = [
    ...exactRanked,
    ...similar.filter(r => !exactIds.has(r.id)),
  ].slice(0, 5);

  const mode = exactRanked.length > 0 && similar.length > 0
    ? "combined"
    : exactRanked.length > 0 ? "exact_match" : "similar_case";

  return { exact: exactRanked, similar, combined, retrieval_mode_used: mode };
}

// ── Ranking ───────────────────────────────────────────────────────────────────

function rankRecords(records: MemoryRecordRow[], now: number): MemoryRecordRow[] {
  return records
    .map(r => {
      const ageDays = (now - r.createdAt) / (24 * 60 * 60 * 1000);
      const recencyScore = Math.max(0, 1 - ageDays / 90);
      const evidenceScore = parseFloat(String(r.evidenceScore ?? "0.5"));
      const typeWeight = TYPE_WEIGHT[r.memoryType] ?? 1.0;
      return { record: r, score: recencyScore * evidenceScore * typeWeight };
    })
    .sort((a, b) => b.score - a.score)
    .map(x => x.record);
}

function scoreSimilarCases(
  records: MemoryRecordRow[],
  params: { currentTags?: string[]; currentRiskStructure?: string[]; currentScenarioType?: string }
): Array<{ record: MemoryRecordRow; _score: number }> {
  return records.map(r => {
    const rTags = (r.tags as string[]) ?? [];
    const rRisk = (r.riskStructure as string[]) ?? [];
    const cTags = params.currentTags ?? [];
    const cRisk = params.currentRiskStructure ?? [];

    const tagOverlap = overlap(rTags, cTags);
    const riskOverlap = overlap(rRisk, cRisk);
    const scenarioMatch = params.currentScenarioType && r.scenarioType === params.currentScenarioType ? 1.0 : 0.0;

    const score = 0.4 * tagOverlap + 0.35 * riskOverlap + 0.25 * scenarioMatch;
    return { record: r, _score: score };
  });
}

function overlap(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a.map(s => s.toLowerCase()));
  const intersection = b.filter(s => setA.has(s.toLowerCase())).length;
  return intersection / Math.max(a.length, b.length, 1);
}

// ── Memory Influence Computation ──────────────────────────────────────────────

export function computeMemoryInfluence(
  records: MemoryRecordRow[],
  budgetUsed?: number,
  budgetMax?: number
): MemoryInfluence {
  // Gating: skip if budget exceeded
  if (budgetUsed !== undefined && budgetMax !== undefined) {
    if (budgetUsed > BUDGET_GATE_RATIO * budgetMax) {
      return emptyInfluence("budget_gate_triggered");
    }
  }

  if (records.length === 0) return emptyInfluence("no_records");

  const failureCount = records.filter(r => r.outcomeLabel === "failure").length;
  const invalidationCount = records.filter(r => r.outcomeLabel === "invalidated").length;
  const successRecords = records.filter(r => r.outcomeLabel === "success");
  const successCount = successRecords.length;
  const avgSuccessScore = successCount > 0
    ? successRecords.reduce((s, r) => s + parseFloat(String(r.evidenceScore ?? "0")), 0) / successCount
    : 0;

  const hasFailureMemory = failureCount > 0;
  const hasSuccessWithCatalyst = successCount >= 2 && avgSuccessScore > 0.75;

  // affects_step0: any failure/invalidated record with failure_modes
  const affects_step0 = records.some(r =>
    (r.outcomeLabel === "failure" || r.outcomeLabel === "invalidated") &&
    Array.isArray(r.failureModes) && (r.failureModes as string[]).length > 0
  );

  // affects_controller: any action_record or thesis_snapshot with outcomeLabel set
  const affects_controller = records.some(r =>
    (r.memoryType === "action_record" || r.memoryType === "thesis_snapshot") &&
    r.outcomeLabel !== null && r.outcomeLabel !== undefined
  );

  // affects_routing: any record with riskStructure
  const affects_routing = records.some(r =>
    Array.isArray(r.riskStructure) && (r.riskStructure as string[]).length > 0
  );

  // early_stop_bias (GPT Q3: affects evaluateStopCondition threshold only)
  const early_stop_bias = hasSuccessWithCatalyst;

  // force_continuation: repeated invalidation
  const force_continuation = invalidationCount >= 2;

  // elevated probe
  let elevated_probe: string | null = null;
  if (hasFailureMemory) elevated_probe = "risk_probe";
  else if (hasSuccessWithCatalyst) elevated_probe = "catalyst_scan";

  // Pattern summary
  const parts: string[] = [];
  if (failureCount > 0) parts.push(`${failureCount} failure(s)`);
  if (invalidationCount > 0) parts.push(`${invalidationCount} invalidation(s)`);
  if (successCount > 0) parts.push(`${successCount} success(es) avg_score=${avgSuccessScore.toFixed(2)}`);
  const memory_pattern_summary = parts.length > 0 ? parts.join(", ") : "no_outcome_data";

  return {
    affects_step0,
    affects_controller,
    affects_routing,
    failure_count: failureCount,
    invalidation_count: invalidationCount,
    success_count: successCount,
    avg_success_score: avgSuccessScore,
    has_failure_memory: hasFailureMemory,
    has_success_with_catalyst: hasSuccessWithCatalyst,
    early_stop_bias,
    force_continuation,
    elevated_probe,
    memory_pattern_summary,
  };
}

function emptyInfluence(reason: string): MemoryInfluence {
  return {
    affects_step0: false,
    affects_controller: false,
    affects_routing: false,
    failure_count: 0,
    invalidation_count: 0,
    success_count: 0,
    avg_success_score: 0,
    has_failure_memory: false,
    has_success_with_catalyst: false,
    early_stop_bias: false,
    force_continuation: false,
    elevated_probe: null,
    memory_pattern_summary: reason,
  };
}

// ── Memory Context Block Builder ──────────────────────────────────────────────

export function buildMemoryContextBlock(
  records: MemoryRecordRow[],
  influence: MemoryInfluence
): MemoryContextBlock {
  if (records.length === 0) {
    return {
      top_memories: [],
      memory_influence_summary: "No prior memory found.",
      memory_injected: false,
      records_used: 0,
    };
  }

  // Cap at MAX_INJECT, estimate tokens (~200 per record)
  const capped = records.slice(0, MAX_INJECT);

  const top_memories = capped.map(r => ({
    memory_id: r.id,
    scenario_type: r.scenarioType ?? "unknown",
    thesis_core: (r.thesisCore ?? "").slice(0, 200),
    key_risk: ((r.riskStructure as string[]) ?? [])[0] ?? "none",
    why_relevant_now: buildRelevanceReason(r, influence),
    outcome_label: r.outcomeLabel ?? undefined,
  }));

  const influenceParts: string[] = [];
  if (influence.has_failure_memory) influenceParts.push("Prior failure case detected → risk_probe elevated");
  if (influence.force_continuation) influenceParts.push("Repeated invalidation → force continuation");
  if (influence.early_stop_bias) influenceParts.push("Strong prior success → early stop bias enabled");
  if (influence.elevated_probe) influenceParts.push(`Probe priority: ${influence.elevated_probe}`);

  return {
    top_memories,
    memory_influence_summary: influenceParts.join(". ") || "Memory context available, no strong signal.",
    memory_injected: true,
    records_used: capped.length,
  };
}

function buildRelevanceReason(r: MemoryRecordRow, influence: MemoryInfluence): string {
  if (r.outcomeLabel === "failure") return "Prior failure case — failure modes must be addressed";
  if (r.outcomeLabel === "invalidated") return "Prior thesis was invalidated — revalidation required";
  if (r.outcomeLabel === "success") return "Prior success case — thesis pattern may apply";
  if (r.memoryType === "risk_flag") return "Risk flag from prior analysis";
  return "Similar scenario or risk structure detected";
}

// ── Prompt Injection String ───────────────────────────────────────────────────

export function buildMemoryPromptBlock(block: MemoryContextBlock): string {
  if (!block.memory_injected || block.top_memories.length === 0) return "";

  const lines: string[] = ["[MEMORY CONTEXT]", "Prior analysis of similar scenarios:"];
  block.top_memories.forEach((m, i) => {
    lines.push(
      `${i + 1}. [${m.memory_id.slice(0, 8)}] Scenario: ${m.scenario_type} | Thesis: ${m.thesis_core}`,
      `   Key Risk: ${m.key_risk}${m.outcome_label ? ` | Outcome: ${m.outcome_label.toUpperCase()}` : ""}`,
      `   Relevance: ${m.why_relevant_now}`
    );
  });
  lines.push(`\nMemory Influence: ${block.memory_influence_summary}`);
  return lines.join("\n");
}

// ── Vector-Ready Abstraction (Phase 7 stub) ───────────────────────────────────

export interface VectorMemoryAdapter {
  upsertEmbedding(id: string, vector: number[], metadata: Record<string, unknown>): Promise<void>;
  searchSimilar(queryVector: number[], topK: number): Promise<Array<{ id: string; score: number }>>;
}

export class NullVectorAdapter implements VectorMemoryAdapter {
  async upsertEmbedding(): Promise<void> { /* no-op */ }
  async searchSimilar(): Promise<Array<{ id: string; score: number }>> { return []; }
}

export const defaultVectorAdapter: VectorMemoryAdapter = new NullVectorAdapter();
