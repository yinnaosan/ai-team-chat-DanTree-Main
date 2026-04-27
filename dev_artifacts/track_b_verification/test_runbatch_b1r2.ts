/**
 * B1R2 retest: real runBatch batchSize:3, dry_run=false
 * Uses SchedulerService.batchEvaluateTriggers with inline snapshotProvider
 * that exactly mirrors _buildRealSnapshotProvider_impl logic
 */
import { SchedulerService } from "./server/watchService";
import { buildSignalsFromLiveData } from "./server/liveSignalEngine";
import type { TriggerInput } from "./server/watchlistEngine";

async function main() {
  console.log("[B1R2-RETEST] Starting real runBatch batchSize:3 dry_run=false");
  console.log("[B1R2-RETEST] Timestamp:", new Date().toISOString());

  // Inline snapshotProvider — exactly mirrors _buildRealSnapshotProvider_impl
  const snapshotProvider = async (tickers: string[]): Promise<Record<string, TriggerInput>> => {
    try {
      const signals = await buildSignalsFromLiveData(tickers);
      const signalMap = new Map(signals.map(s => [s.ticker, s]));
      return Object.fromEntries(tickers.map(ticker => {
        const sig = signalMap.get(ticker);
        if (!sig) return [ticker, { evaluated_at: Date.now() }];
        const riskScore = Math.max(0, Math.min(1,
          0.5 * Math.abs(sig.signals.price_momentum) + 0.5 * sig.signals.volatility
        ));
        return [ticker, {
          risk_score: riskScore,
          earnings_event_detected: sig.event_signal.type === 'earnings',
          macro_change_detected:
            sig.event_signal.type === 'policy' ||
            Math.abs(sig.signals.macro_exposure) >= 0.5,
          macro_change_magnitude: Math.abs(sig.signals.macro_exposure),
          evaluated_at: Date.now(),
        } as TriggerInput];
      }));
    } catch (err) {
      console.warn('[B1R2-RETEST] snapshotProvider failed (non-fatal):', (err as Error).message);
      return Object.fromEntries(tickers.map(t => [t, { evaluated_at: Date.now() }]));
    }
  };

  const result = await SchedulerService.batchEvaluateTriggers(
    snapshotProvider,
    {
      batch_size: 3,
      max_runtime_ms: 60_000,
      max_errors_before_abort: 20,
      evaluation_interval_minutes: 0, // override cooldown for retest
      dry_run: false,
    }
  );

  console.log("[B1R2-RETEST] Result:", JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch(e => {
  console.error("[B1R2-RETEST] Fatal error:", e);
  process.exit(1);
});
