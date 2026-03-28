/**
 * DANTREE LEVEL5.1 — Live Operations Enablement
 * Validation Test Suite
 *
 * TC-L51-1: Cron config + shadow_mode default
 * TC-L51-2: Source routing and fallback chain
 * TC-L51-3: Source health monitor — record/derive/reset
 * TC-L51-4: Guard — kill switch + auto-failsafe
 * TC-L51-5: Ops summary + run log integration
 */

import { describe, it, expect, beforeEach } from "vitest";

// ── Imports ───────────────────────────────────────────────────────────────────
import {
  DEFAULT_LIVE_OPS_CONFIG,
  getLiveOpsConfig,
  setLiveOpsConfigOverride,
  resetLiveOpsConfig,
  buildSourceChain,
  resolveActualSource,
  wasFallbackTriggered,
  isCronRunning,
  stopCronScheduler,
  type ScheduledRunResult,
} from "./liveOpsScheduler";

import {
  recordSourceSuccess,
  recordSourceFailure,
  getHealthSummary,
  getRunLog,
  getLastRun,
  ingestRunResult,
  computeRunStats,
  resetHealthMonitor,
} from "./sourceHealthMonitor";

import {
  activateKillSwitch,
  deactivateKillSwitch,
  checkAndTriggerFailsafe,
  clearAutoFailsafe,
  evaluateGuard,
  getGuardState,
  resetGuardState,
  buildOpsSummary,
  isSafeForLiveRun,
  isSafeForShadowRun,
  isHealthy,
  isDegraded,
  isFailing,
} from "./liveOpsGuard";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMockRunResult(
  overrides: Partial<ScheduledRunResult> = {}
): ScheduledRunResult {
  return {
    run_id: `test_run_${Date.now()}`,
    mode: "shadow",
    primary_source_used: "finnhub",
    actual_source_used: "finnhub",
    fallback_triggered: false,
    watches_evaluated: 3,
    triggers_fired: 1,
    actions_created: 1,
    alerts_created: 0,
    memory_updates: 0,
    source_breakdown: { finnhub: 3 },
    failed_watches: [],
    duration_ms: 450,
    started_at: Date.now() - 450,
    completed_at: Date.now(),
    shadow_mode: true,
    ...overrides,
  };
}

// ── TC-L51-1: Cron Config + Shadow Mode Default ───────────────────────────────

describe("TC-L51-1: Cron config and shadow_mode default", () => {
  beforeEach(() => {
    resetLiveOpsConfig();
    stopCronScheduler();
  });

  it("default cron is disabled", () => {
    const cfg = getLiveOpsConfig();
    expect(cfg.cron.enabled).toBe(false);
  });

  it("default mode is shadow", () => {
    const cfg = getLiveOpsConfig();
    expect(cfg.cron.default_mode).toBe("shadow");
  });

  it("default max_watches_per_run is 10", () => {
    const cfg = getLiveOpsConfig();
    expect(cfg.cron.max_watches_per_run).toBe(10);
  });

  it("cron is not running by default", () => {
    expect(isCronRunning()).toBe(false);
  });

  it("config override applies correctly", () => {
    setLiveOpsConfigOverride({
      cron: { enabled: true, cron_expression: "0 0 * * * *", cron_description: "hourly", default_mode: "shadow", max_watches_per_run: 5 },
    });
    const cfg = getLiveOpsConfig();
    expect(cfg.cron.enabled).toBe(true);
    expect(cfg.cron.max_watches_per_run).toBe(5);
    resetLiveOpsConfig();
    expect(getLiveOpsConfig().cron.enabled).toBe(false);
  });

  it("auto_trade_allowed is always false in default config", () => {
    // auto_trade_allowed is not in LiveOpsSchedulerConfig — it lives in costSafetyGuard
    // This test verifies the config has no auto_trade field that could be set to true
    const cfg = getLiveOpsConfig();
    expect((cfg as Record<string, unknown>)["auto_trade_allowed"]).toBeUndefined();
  });
});

// ── TC-L51-2: Source Routing and Fallback Chain ───────────────────────────────

describe("TC-L51-2: Source routing and fallback chain", () => {
  it("buildSourceChain places primary first", () => {
    const chain = buildSourceChain({
      primary_source: "finnhub",
      fallback_chain: ["twelve_data", "polygon", "fmp"],
      min_quality_score: 0.3,
      source_timeout_ms: 8000,
    });
    expect(chain[0]).toBe("finnhub");
    expect(chain).toContain("twelve_data");
    expect(chain).toContain("polygon");
    expect(chain).toContain("fmp");
  });

  it("buildSourceChain deduplicates primary from fallback", () => {
    const chain = buildSourceChain({
      primary_source: "polygon",
      fallback_chain: ["polygon", "finnhub", "fmp"],
      min_quality_score: 0.3,
      source_timeout_ms: 8000,
    });
    const polygonCount = chain.filter((s) => s === "polygon").length;
    expect(polygonCount).toBe(1);
  });

  it("resolveActualSource maps finnhub correctly", () => {
    expect(resolveActualSource("finnhub")).toBe("finnhub");
    expect(resolveActualSource("Finnhub")).toBe("finnhub");
  });

  it("resolveActualSource maps twelve_data correctly", () => {
    expect(resolveActualSource("twelve_data")).toBe("twelve_data");
    expect(resolveActualSource("twelvedata")).toBe("twelve_data");
  });

  it("resolveActualSource returns unavailable for unknown", () => {
    expect(resolveActualSource(undefined)).toBe("unavailable");
    expect(resolveActualSource("unknown_source")).toBe("unavailable");
  });

  it("wasFallbackTriggered detects fallback correctly", () => {
    expect(wasFallbackTriggered("finnhub", "twelve_data")).toBe(true);
    expect(wasFallbackTriggered("finnhub", "finnhub")).toBe(false);
    expect(wasFallbackTriggered("finnhub", "unavailable")).toBe(false);
  });

  it("default source chain starts with finnhub", () => {
    const cfg = DEFAULT_LIVE_OPS_CONFIG;
    const chain = buildSourceChain(cfg.source_routing);
    expect(chain[0]).toBe("finnhub");
    expect(chain.length).toBe(4);
  });
});

// ── TC-L51-3: Source Health Monitor ──────────────────────────────────────────

describe("TC-L51-3: Source health monitor", () => {
  beforeEach(() => {
    resetHealthMonitor();
  });

  it("initial status is unknown", () => {
    const health = getHealthSummary();
    expect(health.overall_status).toBe("unknown");
    expect(health.sources.finnhub.status).toBe("unknown");
  });

  it("recordSourceSuccess sets status to healthy", () => {
    recordSourceSuccess("finnhub", 0.85, "primary");
    const rec = getHealthSummary().sources.finnhub;
    expect(rec.status).toBe("healthy");
    expect(rec.success_count).toBe(1);
    expect(rec.consecutive_failures).toBe(0);
    expect(rec.avg_quality_score).toBeCloseTo(0.85);
  });

  it("recordSourceFailure increments consecutive_failures", () => {
    recordSourceFailure("finnhub", "timeout", "primary");
    recordSourceFailure("finnhub", "timeout", "primary");
    const rec = getHealthSummary().sources.finnhub;
    expect(rec.consecutive_failures).toBe(2);
    expect(rec.status).toBe("degraded");
  });

  it("5 consecutive failures → failing status", () => {
    for (let i = 0; i < 5; i++) {
      recordSourceFailure("finnhub", "error", "primary");
    }
    expect(getHealthSummary().sources.finnhub.status).toBe("failing");
  });

  it("success after failures resets consecutive_failures", () => {
    recordSourceFailure("finnhub", "error", "primary");
    recordSourceFailure("finnhub", "error", "primary");
    recordSourceSuccess("finnhub", 0.7, "primary");
    const rec = getHealthSummary().sources.finnhub;
    expect(rec.consecutive_failures).toBe(0);
    expect(rec.status).toBe("healthy");
  });

  it("ingestRunResult appends to run log", () => {
    const result = makeMockRunResult();
    ingestRunResult(result);
    expect(getRunLog(5).length).toBe(1);
    expect(getLastRun()?.run_id).toBe(result.run_id);
  });

  it("run log is capped at 100 entries", () => {
    for (let i = 0; i < 110; i++) {
      ingestRunResult(makeMockRunResult({ run_id: `run_${i}` }));
    }
    expect(getRunLog(200).length).toBe(100);
  });

  it("computeRunStats calculates correctly", () => {
    ingestRunResult(makeMockRunResult({ triggers_fired: 2, duration_ms: 300 }));
    ingestRunResult(makeMockRunResult({ triggers_fired: 4, duration_ms: 500 }));
    const stats = computeRunStats();
    expect(stats.avg_duration_ms).toBe(400);
    expect(stats.avg_triggers_per_run).toBeCloseTo(3);
    expect(stats.success_rate).toBe(1);
  });
});

// ── TC-L51-4: Guard — Kill Switch + Auto-Failsafe ────────────────────────────

describe("TC-L51-4: Guard kill switch and auto-failsafe", () => {
  beforeEach(() => {
    resetGuardState();
    resetHealthMonitor();
  });

  it("kill switch forces shadow mode", () => {
    activateKillSwitch("emergency stop");
    const result = evaluateGuard("live");
    expect(result.decision).toBe("shadow_only");
    expect(result.effective_mode).toBe("shadow");
    expect(result.kill_switch_active).toBe(true);
  });

  it("deactivateKillSwitch restores normal evaluation", () => {
    activateKillSwitch("test");
    deactivateKillSwitch();
    const state = getGuardState();
    expect(state.kill_switch_active).toBe(false);
  });

  it("auto-failsafe triggers after 3 consecutive run failures", () => {
    for (let i = 0; i < 3; i++) {
      ingestRunResult(makeMockRunResult({ error: "connection failed", triggers_fired: 0 }));
    }
    const triggered = checkAndTriggerFailsafe();
    expect(triggered).toBe(true);
    expect(getGuardState().auto_failsafe_active).toBe(true);
  });

  it("clearAutoFailsafe resets failsafe state", () => {
    activateKillSwitch("test");
    deactivateKillSwitch();
    // Manually set failsafe
    for (let i = 0; i < 3; i++) {
      ingestRunResult(makeMockRunResult({ error: "err", triggers_fired: 0 }));
    }
    checkAndTriggerFailsafe();
    clearAutoFailsafe();
    expect(getGuardState().auto_failsafe_active).toBe(false);
  });

  it("evaluateGuard allows shadow run when no issues", () => {
    recordSourceSuccess("finnhub", 0.9, "primary");
    const result = evaluateGuard("shadow");
    expect(result.decision).toBe("allow");
    expect(result.effective_mode).toBe("shadow");
  });

  it("isSafeForShadowRun returns true when guard is clear", () => {
    expect(isSafeForShadowRun()).toBe(true);
  });

  it("isSafeForLiveRun returns false when kill switch is active", () => {
    activateKillSwitch("test");
    expect(isSafeForLiveRun()).toBe(false);
  });

  it("health status helpers work correctly", () => {
    expect(isHealthy("healthy")).toBe(true);
    expect(isDegraded("degraded")).toBe(true);
    expect(isFailing("failing")).toBe(true);
    expect(isHealthy("degraded")).toBe(false);
  });
});

// ── TC-L51-5: Ops Summary Integration ────────────────────────────────────────

describe("TC-L51-5: Ops summary and run log integration", () => {
  beforeEach(() => {
    resetGuardState();
    resetHealthMonitor();
    resetLiveOpsConfig();
  });

  it("buildOpsSummary returns all required fields", () => {
    const summary = buildOpsSummary(3);
    expect(summary).toHaveProperty("guard");
    expect(summary).toHaveProperty("health");
    expect(summary).toHaveProperty("stats");
    expect(summary).toHaveProperty("last_run");
    expect(summary).toHaveProperty("recent_runs");
    expect(summary).toHaveProperty("config_snapshot");
    expect(summary).toHaveProperty("generated_at");
  });

  it("config_snapshot reflects default config", () => {
    const summary = buildOpsSummary();
    expect(summary.config_snapshot.cron_enabled).toBe(false);
    expect(summary.config_snapshot.default_mode).toBe("shadow");
    expect(summary.config_snapshot.primary_source).toBe("finnhub");
    expect(summary.config_snapshot.fallback_chain).toContain("twelve_data");
  });

  it("ops summary reflects kill switch state", () => {
    activateKillSwitch("ops test");
    const summary = buildOpsSummary();
    expect(summary.guard.kill_switch_active).toBe(true);
    expect(summary.guard.kill_switch_reason).toBe("ops test");
    deactivateKillSwitch();
  });

  it("ops summary reflects run log after ingestion", () => {
    ingestRunResult(makeMockRunResult({ triggers_fired: 3 }));
    ingestRunResult(makeMockRunResult({ triggers_fired: 1 }));
    const summary = buildOpsSummary(5);
    expect(summary.recent_runs.length).toBe(2);
    expect(summary.health.total_runs).toBe(2);
    expect(summary.health.total_triggers_fired).toBe(4);
  });

  it("ops summary last_run matches most recent ingested run", () => {
    const run1 = makeMockRunResult({ run_id: "run_A" });
    const run2 = makeMockRunResult({ run_id: "run_B" });
    ingestRunResult(run1);
    ingestRunResult(run2);
    const summary = buildOpsSummary();
    expect(summary.last_run?.run_id).toBe("run_B");
  });

  it("generated_at is a recent UTC timestamp", () => {
    const before = Date.now();
    const summary = buildOpsSummary();
    const after = Date.now();
    expect(summary.generated_at).toBeGreaterThanOrEqual(before);
    expect(summary.generated_at).toBeLessThanOrEqual(after);
  });
});
