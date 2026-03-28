/**
 * DANTREE CRON + Outcome Auto-Resolve — Phase 1+2
 * cronServerMount.ts
 *
 * Responsibilities:
 *   1. Mount the DanTree cron scheduler onto the Express server lifecycle
 *   2. Startup guard: validate prerequisites before enabling cron
 *   3. Graceful shutdown: stop cron on SIGTERM/SIGINT
 *   4. Idempotency: ensure only one cron instance runs per process
 */

import { getLiveOpsConfig, setLiveOpsConfigOverride, isCronRunning, startCronScheduler, stopCronScheduler } from "./liveOpsScheduler";
import { evaluateGuard } from "./liveOpsGuard";
import { getHealthSummary } from "./sourceHealthMonitor";

// ─── Types ───────────────────────────────────────────────────────────────────

export type CronMountStatus =
  | "mounted"
  | "skipped_already_mounted"
  | "skipped_guard_blocked"
  | "skipped_startup_guard_failed"
  | "disabled";

export interface CronMountResult {
  status: CronMountStatus;
  reason: string;
  mounted_at_ms: number | null;
  guard_state: string;
  cron_enabled: boolean;
}

export interface StartupGuardResult {
  passed: boolean;
  checks: StartupGuardCheck[];
  blocking_failures: string[];
}

export interface StartupGuardCheck {
  name: string;
  passed: boolean;
  detail: string;
}

// ─── Module State ─────────────────────────────────────────────────────────────

let _isMounted = false;
let _mountedAtMs: number | null = null;
let _cronIntervalHandle: ReturnType<typeof setInterval> | null = null;

// Cron interval in milliseconds (default: 15 minutes for market-hours polling)
const DEFAULT_CRON_INTERVAL_MS = 15 * 60 * 1000;

// ─── Startup Guard ────────────────────────────────────────────────────────────

/**
 * Validates prerequisites before enabling the cron scheduler.
 * Non-blocking failures are warnings; blocking failures prevent cron mount.
 */
export function runStartupGuard(): StartupGuardResult {
  const checks: StartupGuardCheck[] = [];

  // Check 1: Environment — ensure we're not in test mode
  const isTestEnv = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
  checks.push({
    name: "not_test_environment",
    passed: !isTestEnv,
    detail: isTestEnv ? "NODE_ENV=test — cron disabled in test environment" : "ok",
  });

  // Check 2: Guard state — ensure kill switch is not active
  const guard = evaluateGuard();
  const killSwitchActive = guard.kill_switch_active === true;
  checks.push({
    name: "kill_switch_not_active",
    passed: !killSwitchActive,
    detail: killSwitchActive ? "Kill switch is active — cron blocked" : "ok",
  });

  // Check 3: Auto-failsafe — ensure not in failsafe mode
  const failsafeActive = guard.auto_failsafe_active === true;
  checks.push({
    name: "auto_failsafe_not_active",
    passed: !failsafeActive,
    detail: failsafeActive ? "Auto-failsafe is active — cron blocked" : "ok",
  });

  // Check 4: Source health — at least one source must be non-failing
  const healthSummary = getHealthSummary();
  const allSources = Object.values(healthSummary.sources) as Array<{ status: string }>;
  const usableSources = allSources.filter(s => s.status !== "failing").length;
  const hasUsableSource = usableSources > 0;
  checks.push({
    name: "at_least_one_source_available",
    passed: hasUsableSource,
    detail: hasUsableSource
      ? `${usableSources} source(s) available`
      : "All data sources are failing — cron blocked",
  });

  // Check 5: Idempotency — not already mounted
  checks.push({
    name: "not_already_mounted",
    passed: !_isMounted,
    detail: _isMounted ? `Already mounted at ${_mountedAtMs}` : "ok",
  });

  const blockingChecks = ["not_test_environment", "kill_switch_not_active", "auto_failsafe_not_active"];
  const blockingFailures = checks
    .filter(c => blockingChecks.includes(c.name) && !c.passed)
    .map(c => c.detail);

  return {
    passed: blockingFailures.length === 0,
    checks,
    blocking_failures: blockingFailures,
  };
}

// ─── Cron Tick ────────────────────────────────────────────────────────────────

/**
 * Called on each cron tick. Evaluates guard before running.
 * All errors are caught — cron must never crash the process.
 */
async function onCronTick(): Promise<void> {
  try {
    const guard = evaluateGuard();
    if (guard.decision !== "allow") {
      console.log(`[DanTree Cron] Tick skipped — guard=${guard.decision} reason=${guard.reason}`);
      return;
    }

  const config = getLiveOpsConfig();
  if (!config.cron.enabled) {
    console.log("[DanTree Cron] Tick skipped — scheduler disabled");
    return;
  }

  console.log(`[DanTree Cron] Tick at ${new Date().toISOString()} — mode=${config.cron.default_mode}`);

    // Dynamic import to avoid circular deps at module load time
    const { runRealScheduler } = await import("./level5RealScheduler");
    const result = await runRealScheduler({
      dry_run: config.cron.default_mode === "shadow",
      batch_size: 20,
    });

    console.log(
      `[DanTree Cron] Tick complete — triggered=${result.triggers_fired} ` +
      `snapshots=${result.snapshot_quality.total_tickers} errors=${result.errors_count}`
    );

    // Post-run ingestion hook (LEVEL6.1)
    try {
      const { safePostRunIngestion } = await import("./signalPersistence");
      const ingestion = await safePostRunIngestion(result);
      if (ingestion.errors.length > 0) {
        console.warn(`[DanTree Cron] Ingestion warnings: ${ingestion.errors.join(", ")}`);
      }
    } catch (ingestionErr) {
      console.warn("[DanTree Cron] Ingestion hook failed (non-critical):", ingestionErr);
    }

  } catch (err) {
    console.error("[DanTree Cron] Tick error (non-critical):", err);
  }
}

// ─── Mount / Unmount ──────────────────────────────────────────────────────────

/**
 * Mount the DanTree cron scheduler.
 * Called once from server startup (server._core/index.ts).
 */
export function mountCronScheduler(
  intervalMs: number = DEFAULT_CRON_INTERVAL_MS
): CronMountResult {
  // Run startup guard
  const guard = runStartupGuard();

  if (!guard.passed) {
    return {
      status: "skipped_startup_guard_failed",
      reason: guard.blocking_failures.join("; "),
      mounted_at_ms: null,
      guard_state: "blocked",
      cron_enabled: false,
    };
  }

  // Idempotency check
  if (_isMounted) {
    return {
      status: "skipped_already_mounted",
      reason: `Already mounted at ${_mountedAtMs}`,
      mounted_at_ms: _mountedAtMs,
      guard_state: "ok",
      cron_enabled: true,
    };
  }

  // Check live ops guard
  const liveGuard = evaluateGuard();
  if (liveGuard.decision !== "allow" && liveGuard.decision !== "shadow_only") {
    return {
      status: "skipped_guard_blocked",
      reason: liveGuard.reason,
      mounted_at_ms: null,
      guard_state: liveGuard.decision,
      cron_enabled: false,
    };
  }

  // Check if scheduler is configured as enabled
  const config = getLiveOpsConfig();
  if (!config.cron.enabled) {
    return {
      status: "disabled",
      reason: "Scheduler is configured as disabled (enabled=false). Enable via liveOps.updateConfig.",
      mounted_at_ms: null,
      guard_state: "ok",
      cron_enabled: false,
    };
  }

  // Mount the interval
  _cronIntervalHandle = setInterval(() => {
    onCronTick().catch(err => {
      console.error("[DanTree Cron] Unhandled tick error:", err);
    });
  }, intervalMs);

  _isMounted = true;
  _mountedAtMs = Date.now();

  // Register graceful shutdown
  registerShutdownHandlers();

  console.log(
    `[DanTree Cron] Mounted — interval=${intervalMs}ms mode=${config.cron.default_mode} ` +
    `guard=${liveGuard.decision}`
  );

  return {
    status: "mounted",
    reason: `Cron mounted with interval=${intervalMs}ms`,
    mounted_at_ms: _mountedAtMs,
    guard_state: liveGuard.decision,
    cron_enabled: true,
  };
}

/**
 * Unmount the cron scheduler (for testing or manual shutdown).
 */
export function unmountCronScheduler(): void {
  if (_cronIntervalHandle !== null) {
    clearInterval(_cronIntervalHandle);
    _cronIntervalHandle = null;
  }
  _isMounted = false;
  _mountedAtMs = null;
  console.log("[DanTree Cron] Unmounted");
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

let _shutdownRegistered = false;

function registerShutdownHandlers(): void {
  if (_shutdownRegistered) return;
  _shutdownRegistered = true;

  const shutdown = (signal: string) => {
    console.log(`[DanTree Cron] Received ${signal} — stopping cron scheduler`);
    unmountCronScheduler();
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

// ─── Status Accessors ─────────────────────────────────────────────────────────

export interface CronMountState {
  is_mounted: boolean;
  mounted_at_ms: number | null;
  uptime_ms: number | null;
  interval_ms: number;
  guard_state: string;
  scheduler_enabled: boolean;
  scheduler_mode: string;
}

export function getCronMountState(): CronMountState {
  const config = getLiveOpsConfig();
  const guard = evaluateGuard();
  return {
    is_mounted: _isMounted,
    mounted_at_ms: _mountedAtMs,
    uptime_ms: _mountedAtMs !== null ? Date.now() - _mountedAtMs : null,
    interval_ms: DEFAULT_CRON_INTERVAL_MS,
    guard_state: guard.decision,
    scheduler_enabled: config.cron.enabled,
    scheduler_mode: config.cron.default_mode,
  };
}

/**
 * Enable the scheduler and attempt to mount cron.
 * Convenience wrapper for tRPC liveOps.enableCron procedure.
 */
export function enableAndMountCron(intervalMs?: number): CronMountResult {
  // Enable the scheduler first
  setLiveOpsConfigOverride({ cron: { ...getLiveOpsConfig().cron, enabled: true } });
  return mountCronScheduler(intervalMs);
}

/**
 * Disable the scheduler and unmount cron.
 * Convenience wrapper for tRPC liveOps.disableCron procedure.
 */
export function disableAndUnmountCron(): void {
  setLiveOpsConfigOverride({ cron: { ...getLiveOpsConfig().cron, enabled: false } });
  unmountCronScheduler();
}
