/**
 * DANTREE LEVEL5.1 — Live Operations Scheduler
 * Phase 1: Cron enablement (shadow_mode default)
 * Phase 2: Primary source routing and fallback chain
 *
 * NON-NEGOTIABLE:
 * - shadow_mode = true by default (no DB side effects until explicitly enabled)
 * - auto_trade_allowed = ALWAYS false
 * - manual run and scheduled run coexist without conflict
 */

import { runRealScheduler, type RealRunConfig } from "./level5RealScheduler";
import type { WatchItem } from "./watchlistEngine";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SchedulerMode = "shadow" | "live";

export type PrimarySource = "finnhub" | "twelve_data" | "polygon" | "fmp";

export interface SourceRoutingConfig {
  /** Primary data source to try first */
  primary_source: PrimarySource;
  /** Ordered fallback chain (excluding primary) */
  fallback_chain: PrimarySource[];
  /** Minimum quality score to accept a snapshot (0-1) */
  min_quality_score: number;
  /** Timeout per source in ms */
  source_timeout_ms: number;
}

export interface CronConfig {
  /** Whether cron is enabled at all */
  enabled: boolean;
  /** Cron expression (e.g. "0 0/30 * * * *" = every 30 min) */
  cron_expression: string;
  /** Human-readable description */
  cron_description: string;
  /** Default scheduler mode */
  default_mode: SchedulerMode;
  /** Maximum watches per live run */
  max_watches_per_run: number;
}

export interface LiveOpsSchedulerConfig {
  cron: CronConfig;
  source_routing: SourceRoutingConfig;
  /** Enable feedback loop to LEVEL3 memory */
  enable_feedback_loop: boolean;
  /** Maximum consecutive source failures before health degrades */
  max_consecutive_failures: number;
}

export interface ScheduledRunResult {
  run_id: string;
  mode: SchedulerMode;
  primary_source_used: PrimarySource;
  actual_source_used: PrimarySource | "unavailable";
  fallback_triggered: boolean;
  fallback_reason?: string;
  watches_evaluated: number;
  triggers_fired: number;
  actions_created: number;
  alerts_created: number;
  memory_updates: number;
  source_breakdown: Record<string, number>;
  failed_watches: string[];
  duration_ms: number;
  started_at: number;
  completed_at: number;
  shadow_mode: boolean;
  error?: string;
}

export interface PerWatchSample {
  watch_id: string;
  ticker: string;
  snapshot_quality: number;
  trigger_fired: boolean;
  trigger_type: string | null;
  action_type: string | null;
  reasoning_requested: boolean;
  memory_updated: boolean;
  source_used: string;
  evaluated_at: number;
}

// ─── Default Configuration ────────────────────────────────────────────────────

export const DEFAULT_LIVE_OPS_CONFIG: LiveOpsSchedulerConfig = {
  cron: {
    enabled: false, // must be explicitly enabled
    cron_expression: "0 0/30 * * * *", // every 30 minutes
    cron_description: "Every 30 minutes",
    default_mode: "shadow", // shadow_mode by default
    max_watches_per_run: 10, // first rollout: max 10 watches
  },
  source_routing: {
    primary_source: "finnhub",
    fallback_chain: ["twelve_data", "polygon", "fmp"],
    min_quality_score: 0.3,
    source_timeout_ms: 8000,
  },
  enable_feedback_loop: true,
  max_consecutive_failures: 3,
};

// ─── Config Override (runtime) ────────────────────────────────────────────────

let _configOverride: Partial<LiveOpsSchedulerConfig> | null = null;

export function setLiveOpsConfigOverride(
  override: Partial<LiveOpsSchedulerConfig>
): void {
  _configOverride = override;
}

export function resetLiveOpsConfig(): void {
  _configOverride = null;
}

export function getLiveOpsConfig(): LiveOpsSchedulerConfig {
  if (!_configOverride) return DEFAULT_LIVE_OPS_CONFIG;
  return {
    ...DEFAULT_LIVE_OPS_CONFIG,
    ..._configOverride,
    cron: { ...DEFAULT_LIVE_OPS_CONFIG.cron, ..._configOverride.cron },
    source_routing: {
      ...DEFAULT_LIVE_OPS_CONFIG.source_routing,
      ..._configOverride.source_routing,
    },
  };
}

// ─── Source Routing ───────────────────────────────────────────────────────────

/**
 * Build the ordered source chain based on routing config.
 * Primary source is always first; fallback chain follows.
 */
export function buildSourceChain(
  routing: SourceRoutingConfig
): PrimarySource[] {
  const chain: PrimarySource[] = [routing.primary_source];
  for (const src of routing.fallback_chain) {
    if (src !== routing.primary_source) {
      chain.push(src);
    }
  }
  return chain;
}

/**
 * Determine which source was actually used based on snapshot data_source field.
 * Returns the source name or "unavailable".
 */
export function resolveActualSource(
  dataSource: string | undefined
): PrimarySource | "unavailable" {
  const validSources: PrimarySource[] = [
    "finnhub",
    "twelve_data",
    "polygon",
    "fmp",
  ];
  if (!dataSource) return "unavailable";
  const normalized = dataSource.toLowerCase().replace(/[^a-z_]/g, "_");
  if (validSources.includes(normalized as PrimarySource)) {
    return normalized as PrimarySource;
  }
  // Map common aliases
  if (normalized.includes("finnhub")) return "finnhub";
  if (normalized.includes("twelve") || normalized.includes("twelvedata"))
    return "twelve_data";
  if (normalized.includes("polygon")) return "polygon";
  if (normalized.includes("fmp") || normalized.includes("financialmodelingprep"))
    return "fmp";
  return "unavailable";
}

/**
 * Check if fallback was triggered (actual source != primary source).
 */
export function wasFallbackTriggered(
  primarySource: PrimarySource,
  actualSource: PrimarySource | "unavailable"
): boolean {
  return actualSource !== primarySource && actualSource !== "unavailable";
}

// ─── Scheduled Run ────────────────────────────────────────────────────────────

/**
 * Execute a scheduled live ops run.
 * Respects shadow_mode, source routing, and watch limits.
 */
export async function executeScheduledRun(
  watches: WatchItem[],
  options: {
    mode?: SchedulerMode;
    config?: Partial<LiveOpsSchedulerConfig>;
    run_id?: string;
  } = {}
): Promise<ScheduledRunResult> {
  const cfg = options.config
    ? {
        ...getLiveOpsConfig(),
        ...options.config,
        cron: { ...getLiveOpsConfig().cron, ...options.config.cron },
        source_routing: {
          ...getLiveOpsConfig().source_routing,
          ...options.config.source_routing,
        },
      }
    : getLiveOpsConfig();

  const mode = options.mode ?? cfg.cron.default_mode;
  const isShadow = mode === "shadow";
  const runId =
    options.run_id ??
    `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();

  // Limit watches per run
  const watchSubset = watches.slice(0, cfg.cron.max_watches_per_run);

  // Build source chain
  const sourceChain = buildSourceChain(cfg.source_routing);

  // Build RealRunConfig for level5RealScheduler
  const liveRunConfig = {
    dry_run: isShadow,
    enable_feedback_loop: !isShadow && cfg.enable_feedback_loop,
    min_snapshot_quality: cfg.source_routing.min_quality_score,
    batch_size: cfg.cron.max_watches_per_run,
  };

  let runResult;
  let error: string | undefined;

  try {
    runResult = await runRealScheduler(liveRunConfig);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    runResult = null;
  }

  const completedAt = Date.now();

  // Aggregate source breakdown
  const sourceBreakdown: Record<string, number> = {};
  const perWatchSamples: PerWatchSample[] = [];
  let triggersFired = 0;
  let actionsCreated = 0;
  let alertsCreated = 0;
  let memoryUpdates = 0;
  const failedWatches: string[] = [];
  let actualSource: PrimarySource | "unavailable" = "unavailable";

  if (runResult) {
    // Extract aggregates from run result
    triggersFired = runResult.triggers_fired ?? 0;
    actionsCreated = runResult.actions_created ?? 0;
    alertsCreated = runResult.alerts_created ?? 0;
    memoryUpdates = runResult.feedback_loop?.memories_updated ?? 0;
    // Build per-watch samples from snapshot_details
    if (runResult.snapshot_details) {
      for (const sd of runResult.snapshot_details) {
        const src = resolveActualSource(sd.data_source);
        sourceBreakdown[src] = (sourceBreakdown[src] ?? 0) + 1;
        if (actualSource === "unavailable" && src !== "unavailable") {
          actualSource = src;
        }
        if (!sd.is_usable) {
          failedWatches.push(sd.ticker);
        }
        perWatchSamples.push({
          watch_id: sd.ticker, // use ticker as watch_id proxy in snapshot_details
          ticker: sd.ticker,
          snapshot_quality: sd.quality_score ?? 0,
          trigger_fired: false, // not available at snapshot level
          trigger_type: null,
          action_type: null,
          reasoning_requested: false,
          memory_updated: false,
          source_used: sd.data_source ?? "unavailable",
          evaluated_at: completedAt,
        });
      }
    }
  }

  const fallbackTriggered = wasFallbackTriggered(
    cfg.source_routing.primary_source,
    actualSource
  );

  return {
    run_id: runId,
    mode,
    primary_source_used: cfg.source_routing.primary_source,
    actual_source_used: actualSource,
    fallback_triggered: fallbackTriggered,
    fallback_reason: fallbackTriggered
      ? `Primary source (${cfg.source_routing.primary_source}) unavailable; used ${actualSource}`
      : undefined,
    watches_evaluated: watchSubset.length,
    triggers_fired: triggersFired,
    actions_created: actionsCreated,
    alerts_created: alertsCreated,
    memory_updates: memoryUpdates,
    source_breakdown: sourceBreakdown,
    failed_watches: failedWatches,
    duration_ms: completedAt - startedAt,
    started_at: startedAt,
    completed_at: completedAt,
    shadow_mode: isShadow,
    error,
  };
}

// ─── Cron Registration ────────────────────────────────────────────────────────

let _cronHandle: ReturnType<typeof setInterval> | null = null;
let _cronEnabled = false;

/**
 * Start the cron scheduler.
 * Uses setInterval as a lightweight cron approximation.
 * For production, integrate with node-cron or similar.
 */
export function startCronScheduler(
  watchProvider: () => Promise<WatchItem[]>,
  options: {
    interval_ms?: number;
    mode?: SchedulerMode;
    onRunComplete?: (result: ScheduledRunResult) => void;
    onError?: (err: Error) => void;
  } = {}
): void {
  if (_cronHandle) {
    stopCronScheduler();
  }

  const cfg = getLiveOpsConfig();
  if (!cfg.cron.enabled) {
    return; // cron disabled — no-op
  }

  // Default: 30 minutes
  const intervalMs = options.interval_ms ?? 30 * 60 * 1000;
  _cronEnabled = true;

  _cronHandle = setInterval(async () => {
    if (!_cronEnabled) return;
    try {
      const watches = await watchProvider();
      const result = await executeScheduledRun(watches, {
        mode: options.mode ?? cfg.cron.default_mode,
      });
      options.onRunComplete?.(result);
    } catch (err) {
      options.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }, intervalMs);
}

export function stopCronScheduler(): void {
  _cronEnabled = false;
  if (_cronHandle) {
    clearInterval(_cronHandle);
    _cronHandle = null;
  }
}

export function isCronRunning(): boolean {
  return _cronEnabled && _cronHandle !== null;
}

/**
 * Manual trigger — run once immediately, independent of cron schedule.
 * Safe to call even when cron is running.
 */
export async function triggerManualRun(
  watches: WatchItem[],
  mode: SchedulerMode = "shadow"
): Promise<ScheduledRunResult> {
  return executeScheduledRun(watches, { mode });
}
