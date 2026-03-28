/**
 * DANTREE LEVEL5.1 — Source Health Monitor
 * Phase 3: Source health monitoring (healthy / degraded / failing)
 * Phase 4: Run log and sample capture (run summary + per-watch samples)
 *
 * Design principles:
 * - In-memory state only (no DB writes) — lightweight, zero side effects
 * - Append-only run log (max 100 entries, rolling window)
 * - Health status derived from consecutive failure count
 * - All timestamps in UTC milliseconds
 */

import type { PrimarySource, ScheduledRunResult, PerWatchSample } from "./liveOpsScheduler";

// ─── Types ────────────────────────────────────────────────────────────────────

export type HealthStatus = "healthy" | "degraded" | "failing" | "unknown";

export interface SourceHealthRecord {
  source: PrimarySource;
  status: HealthStatus;
  /** Total successful fetches */
  success_count: number;
  /** Total failed fetches */
  failure_count: number;
  /** Consecutive failures (resets on success) */
  consecutive_failures: number;
  /** Last success timestamp (ms) */
  last_success_at: number | null;
  /** Last failure timestamp (ms) */
  last_failure_at: number | null;
  /** Last error message */
  last_error: string | null;
  /** Average quality score across all successful fetches */
  avg_quality_score: number;
  /** Number of times this source was used as primary */
  primary_use_count: number;
  /** Number of times this source was used as fallback */
  fallback_use_count: number;
}

export interface RunLogEntry {
  run_id: string;
  mode: "shadow" | "live";
  started_at: number;
  completed_at: number;
  duration_ms: number;
  shadow_mode: boolean;
  watches_evaluated: number;
  triggers_fired: number;
  actions_created: number;
  alerts_created: number;
  memory_updates: number;
  primary_source_used: PrimarySource;
  actual_source_used: PrimarySource | "unavailable";
  fallback_triggered: boolean;
  failed_watches: string[];
  error?: string;
  /** Captured per-watch samples (up to 20 per run) */
  samples: PerWatchSample[];
}

export interface HealthSummary {
  overall_status: HealthStatus;
  sources: Record<PrimarySource, SourceHealthRecord>;
  last_run_at: number | null;
  total_runs: number;
  total_triggers_fired: number;
  total_memory_updates: number;
  consecutive_run_failures: number;
}

// ─── State ────────────────────────────────────────────────────────────────────

const MAX_RUN_LOG = 100;
const DEGRADED_THRESHOLD = 2; // consecutive failures → degraded
const FAILING_THRESHOLD = 5;  // consecutive failures → failing

const ALL_SOURCES: PrimarySource[] = ["finnhub", "twelve_data", "polygon", "fmp"];

function _emptyHealthRecord(source: PrimarySource): SourceHealthRecord {
  return {
    source,
    status: "unknown",
    success_count: 0,
    failure_count: 0,
    consecutive_failures: 0,
    last_success_at: null,
    last_failure_at: null,
    last_error: null,
    avg_quality_score: 0,
    primary_use_count: 0,
    fallback_use_count: 0,
  };
}

let _sourceHealth: Record<PrimarySource, SourceHealthRecord> = {
  finnhub: _emptyHealthRecord("finnhub"),
  twelve_data: _emptyHealthRecord("twelve_data"),
  polygon: _emptyHealthRecord("polygon"),
  fmp: _emptyHealthRecord("fmp"),
};

let _runLog: RunLogEntry[] = [];
let _totalRuns = 0;
let _totalTriggersFired = 0;
let _totalMemoryUpdates = 0;
let _consecutiveRunFailures = 0;

// ─── Health Derivation ────────────────────────────────────────────────────────

function _deriveStatus(consecutiveFailures: number): HealthStatus {
  if (consecutiveFailures === 0) return "healthy";
  if (consecutiveFailures < DEGRADED_THRESHOLD) return "degraded";
  if (consecutiveFailures < FAILING_THRESHOLD) return "degraded";
  return "failing";
}

function _overallStatus(
  records: Record<PrimarySource, SourceHealthRecord>
): HealthStatus {
  const statuses = ALL_SOURCES.map((s) => records[s].status);
  if (statuses.every((s) => s === "unknown")) return "unknown";
  if (statuses.some((s) => s === "failing")) return "failing";
  if (statuses.some((s) => s === "degraded")) return "degraded";
  if (statuses.every((s) => s === "healthy")) return "healthy";
  return "degraded";
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Record a successful data fetch for a source.
 */
export function recordSourceSuccess(
  source: PrimarySource,
  qualityScore: number,
  role: "primary" | "fallback" = "primary"
): void {
  const rec = _sourceHealth[source];
  rec.success_count += 1;
  rec.consecutive_failures = 0;
  rec.last_success_at = Date.now();
  rec.last_error = null;
  // Rolling average quality score
  rec.avg_quality_score =
    (rec.avg_quality_score * (rec.success_count - 1) + qualityScore) /
    rec.success_count;
  if (role === "primary") rec.primary_use_count += 1;
  else rec.fallback_use_count += 1;
  rec.status = _deriveStatus(rec.consecutive_failures);
}

/**
 * Record a failed data fetch for a source.
 */
export function recordSourceFailure(
  source: PrimarySource,
  error: string,
  role: "primary" | "fallback" = "primary"
): void {
  const rec = _sourceHealth[source];
  rec.failure_count += 1;
  rec.consecutive_failures += 1;
  rec.last_failure_at = Date.now();
  rec.last_error = error;
  if (role === "primary") rec.primary_use_count += 1;
  else rec.fallback_use_count += 1;
  rec.status = _deriveStatus(rec.consecutive_failures);
}

/**
 * Ingest a completed ScheduledRunResult into the health monitor.
 * Updates source health and appends to run log.
 */
export function ingestRunResult(
  result: ScheduledRunResult,
  samples: PerWatchSample[] = []
): void {
  _totalRuns += 1;
  _totalTriggersFired += result.triggers_fired;
  _totalMemoryUpdates += result.memory_updates;

  // Update source health based on run outcome
  const actualSrc = result.actual_source_used;
  if (actualSrc !== "unavailable") {
    const isPrimary = actualSrc === result.primary_source_used;
    const role: "primary" | "fallback" = isPrimary ? "primary" : "fallback";
    if (result.error) {
      recordSourceFailure(actualSrc, result.error, role);
    } else {
      // Use average quality from source_breakdown as proxy
      const qualityProxy = result.failed_watches.length === 0 ? 0.8 : 0.4;
      recordSourceSuccess(actualSrc, qualityProxy, role);
    }
    // If primary failed and fallback was used, mark primary as failed
    if (result.fallback_triggered && result.primary_source_used !== actualSrc) {
      recordSourceFailure(
        result.primary_source_used,
        result.fallback_reason ?? "Primary source unavailable",
        "primary"
      );
    }
  }

  // Track consecutive run failures
  if (result.error) {
    _consecutiveRunFailures += 1;
  } else {
    _consecutiveRunFailures = 0;
  }

  // Append to run log (rolling window)
  const entry: RunLogEntry = {
    run_id: result.run_id,
    mode: result.mode,
    started_at: result.started_at,
    completed_at: result.completed_at,
    duration_ms: result.duration_ms,
    shadow_mode: result.shadow_mode,
    watches_evaluated: result.watches_evaluated,
    triggers_fired: result.triggers_fired,
    actions_created: result.actions_created,
    alerts_created: result.alerts_created,
    memory_updates: result.memory_updates,
    primary_source_used: result.primary_source_used,
    actual_source_used: result.actual_source_used,
    fallback_triggered: result.fallback_triggered,
    failed_watches: result.failed_watches,
    error: result.error,
    samples: samples.slice(0, 20), // cap at 20 samples per run
  };

  _runLog.push(entry);
  if (_runLog.length > MAX_RUN_LOG) {
    _runLog = _runLog.slice(_runLog.length - MAX_RUN_LOG);
  }
}

/**
 * Get current health summary for all sources.
 */
export function getHealthSummary(): HealthSummary {
  return {
    overall_status: _overallStatus(_sourceHealth),
    sources: { ..._sourceHealth },
    last_run_at: _runLog.length > 0 ? _runLog[_runLog.length - 1].completed_at : null,
    total_runs: _totalRuns,
    total_triggers_fired: _totalTriggersFired,
    total_memory_updates: _totalMemoryUpdates,
    consecutive_run_failures: _consecutiveRunFailures,
  };
}

/**
 * Get the run log (most recent first).
 */
export function getRunLog(limit = 20): RunLogEntry[] {
  return _runLog.slice(-limit).reverse();
}

/**
 * Get the most recent run entry.
 */
export function getLastRun(): RunLogEntry | null {
  return _runLog.length > 0 ? _runLog[_runLog.length - 1] : null;
}

/**
 * Get health record for a specific source.
 */
export function getSourceHealth(source: PrimarySource): SourceHealthRecord {
  return { ..._sourceHealth[source] };
}

/**
 * Reset all health state (for testing).
 */
export function resetHealthMonitor(): void {
  _sourceHealth = {
    finnhub: _emptyHealthRecord("finnhub"),
    twelve_data: _emptyHealthRecord("twelve_data"),
    polygon: _emptyHealthRecord("polygon"),
    fmp: _emptyHealthRecord("fmp"),
  };
  _runLog = [];
  _totalRuns = 0;
  _totalTriggersFired = 0;
  _totalMemoryUpdates = 0;
  _consecutiveRunFailures = 0;
}

/**
 * Compute run statistics from the log.
 */
export function computeRunStats(): {
  avg_duration_ms: number;
  success_rate: number;
  avg_triggers_per_run: number;
  fallback_rate: number;
  shadow_run_pct: number;
} {
  if (_runLog.length === 0) {
    return {
      avg_duration_ms: 0,
      success_rate: 0,
      avg_triggers_per_run: 0,
      fallback_rate: 0,
      shadow_run_pct: 0,
    };
  }

  const total = _runLog.length;
  const successCount = _runLog.filter((r) => !r.error).length;
  const fallbackCount = _runLog.filter((r) => r.fallback_triggered).length;
  const shadowCount = _runLog.filter((r) => r.shadow_mode).length;
  const totalDuration = _runLog.reduce((sum, r) => sum + r.duration_ms, 0);
  const totalTriggers = _runLog.reduce((sum, r) => sum + r.triggers_fired, 0);

  return {
    avg_duration_ms: Math.round(totalDuration / total),
    success_rate: Math.round((successCount / total) * 100) / 100,
    avg_triggers_per_run: Math.round((totalTriggers / total) * 100) / 100,
    fallback_rate: Math.round((fallbackCount / total) * 100) / 100,
    shadow_run_pct: Math.round((shadowCount / total) * 100) / 100,
  };
}
