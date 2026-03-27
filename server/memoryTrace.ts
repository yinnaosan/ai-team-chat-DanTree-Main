/**
 * LEVEL3 Memory Engine — Trace Module
 * Builds memory_trace object for loop_metadata.
 * Provides structured audit of memory retrieval, influence, and write decisions.
 */

import type { MemoryInfluence, MemoryContextBlock } from "./memoryEngine";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MemoryTrace {
  // Retrieval
  retrieval_attempted: boolean;
  retrieval_mode_used: string;
  records_retrieved: number;
  // Influence
  memory_injected: boolean;
  affects_step0: boolean;
  affects_controller: boolean;
  affects_routing: boolean;
  elevated_probe: string | null;
  force_continuation: boolean;
  early_stop_bias: boolean;
  // Outcome
  failure_count: number;
  invalidation_count: number;
  success_count: number;
  // Write
  write_attempted: boolean;
  write_result: "written" | "skipped" | "not_attempted";
  write_skip_reason: string;
  // Summary
  memory_influence_summary: string;
  memory_pattern_summary: string;
  top_memory_ids: string[];
}

// ── Builder ───────────────────────────────────────────────────────────────────

export function buildMemoryTrace(params: {
  retrievalAttempted: boolean;
  retrievalModeUsed?: string;
  recordsRetrieved?: number;
  influence?: MemoryInfluence | null;
  contextBlock?: MemoryContextBlock | null;
  writeAttempted?: boolean;
  writeResult?: "written" | "skipped" | "not_attempted";
  writeSkipReason?: string;
}): MemoryTrace {
  const {
    retrievalAttempted,
    retrievalModeUsed = "none",
    recordsRetrieved = 0,
    influence = null,
    contextBlock = null,
    writeAttempted = false,
    writeResult = "not_attempted",
    writeSkipReason = "",
  } = params;

  const topMemoryIds = contextBlock?.top_memories?.map(m => m.memory_id.slice(0, 8)) ?? [];

  if (!influence) {
    return {
      retrieval_attempted: retrievalAttempted,
      retrieval_mode_used: retrievalModeUsed,
      records_retrieved: recordsRetrieved,
      memory_injected: false,
      affects_step0: false,
      affects_controller: false,
      affects_routing: false,
      elevated_probe: null,
      force_continuation: false,
      early_stop_bias: false,
      failure_count: 0,
      invalidation_count: 0,
      success_count: 0,
      write_attempted: writeAttempted,
      write_result: writeResult,
      write_skip_reason: writeSkipReason,
      memory_influence_summary: contextBlock?.memory_influence_summary ?? "no_influence",
      memory_pattern_summary: "no_records",
      top_memory_ids: topMemoryIds,
    };
  }

  return {
    retrieval_attempted: retrievalAttempted,
    retrieval_mode_used: retrievalModeUsed,
    records_retrieved: recordsRetrieved,
    memory_injected: contextBlock?.memory_injected ?? false,
    affects_step0: influence.affects_step0,
    affects_controller: influence.affects_controller,
    affects_routing: influence.affects_routing,
    elevated_probe: influence.elevated_probe,
    force_continuation: influence.force_continuation,
    early_stop_bias: influence.early_stop_bias,
    failure_count: influence.failure_count,
    invalidation_count: influence.invalidation_count,
    success_count: influence.success_count,
    write_attempted: writeAttempted,
    write_result: writeResult,
    write_skip_reason: writeSkipReason,
    memory_influence_summary: contextBlock?.memory_influence_summary ?? influence.memory_pattern_summary,
    memory_pattern_summary: influence.memory_pattern_summary,
    top_memory_ids: topMemoryIds,
  };
}

// ── Empty trace (when memory not attempted) ───────────────────────────────────

export function emptyMemoryTrace(): MemoryTrace {
  return buildMemoryTrace({ retrievalAttempted: false });
}
