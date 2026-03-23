/**
 * Qbot-style quantitative backtesting API
 * Wraps the Python qbot_backtest.py script via child_process
 */

import { spawn } from "child_process";
import path from "path";

export interface BacktestParams {
  strategy: "momentum" | "mean_reversion" | "ma_crossover" | "alpha_factor" | "buy_hold";
  spot?: number;
  sigma?: number;
  days?: number;
  lookback?: number;
  window?: number;
  fast?: number;
  slow?: number;
  prices?: number[];
  alpha_scores?: number[];
}

export interface BacktestMetrics {
  total_return: number;
  ann_return: number;
  bh_return: number;
  sharpe: number;
  sortino: number;
  calmar: number;
  max_drawdown: number;
  win_rate: number;
  total_trades: number;
  alpha: number;
}

export interface EquityPoint {
  day: number;
  value: number;
  bh: number;
}

export interface TradeSignal {
  day: number;
  action: "BUY" | "SELL";
  price: number;
  return?: number;
  alpha_score?: number;
  z_score?: number;
  sma?: number;
}

export interface BacktestResult {
  strategy: string;
  metrics: BacktestMetrics;
  equity_curve: EquityPoint[];
  signals: TradeSignal[];
  days: number;
}

export async function runBacktest(params: BacktestParams): Promise<BacktestResult> {
  const scriptPath = path.join(process.cwd(), "server", "qbot_backtest.py");
  const input = JSON.stringify(params);

  return new Promise((resolve, reject) => {
    const proc = spawn("python3.11", [scriptPath], { timeout: 30000 });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code !== 0 && !stdout) {
        reject(new Error(`Python error (code ${code}): ${stderr}`));
        return;
      }
      try {
        const result = JSON.parse(stdout.trim()) as BacktestResult & { error?: string };
        if (result.error) { reject(new Error(result.error)); return; }
        resolve(result);
      } catch (e) {
        reject(new Error(`JSON parse error: ${stdout.slice(0, 200)}`));
      }
    });
    proc.on("error", reject);
    proc.stdin.write(input);
    proc.stdin.end();
  });
}

/**
 * Run all 4 strategies and compare results
 */
export async function runStrategyComparison(
  spot: number,
  sigma: number,
  days: number = 252,
  prices?: number[]
): Promise<BacktestResult[]> {
  const strategies: BacktestParams["strategy"][] = [
    "momentum",
    "mean_reversion",
    "ma_crossover",
    "buy_hold",
  ];

  const results = await Promise.allSettled(
    strategies.map((strategy) =>
      runBacktest({ strategy, spot, sigma, days, prices })
    )
  );

  return results
    .filter((r): r is PromiseFulfilledResult<BacktestResult> => r.status === "fulfilled")
    .map((r) => r.value);
}
