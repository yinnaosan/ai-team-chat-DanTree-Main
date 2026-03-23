/**
 * BacktestCard - Qbot-style quantitative backtesting visualization
 * Displays strategy comparison, equity curves, and performance metrics
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { TrendingUp, TrendingDown, BarChart2, RefreshCw, Play } from "lucide-react";

interface BacktestMetrics {
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

interface EquityPoint {
  day: number;
  value: number;
  bh: number;
}

interface BacktestResult {
  strategy: string;
  metrics: BacktestMetrics;
  equity_curve: EquityPoint[];
  signals: Array<{ day: number; action: string; price: number; return?: number }>;
  days: number;
}

interface BacktestCardProps {
  ticker: string;
  spot: number;
  sigma: number;
  alphaScore?: number;
  prices?: number[];
  alphaScores?: number[];
  suggestedStrategy?: string; // Alpha 因子推断的预选策略
}

const STRATEGY_LABELS: Record<string, string> = {
  momentum: "动量策略",
  mean_reversion: "均值回归",
  ma_crossover: "均线交叉",
  alpha_factor: "Alpha 因子",
  buy_hold: "买入持有",
};

const STRATEGY_COLORS: Record<string, string> = {
  momentum: "#6366f1",
  mean_reversion: "#f59e0b",
  ma_crossover: "#10b981",
  alpha_factor: "#ec4899",
  buy_hold: "#94a3b8",
};

function MetricBadge({
  label,
  value,
  unit = "",
  good,
}: {
  label: string;
  value: number;
  unit?: string;
  good?: boolean;
}) {
  const color =
    good === undefined
      ? "text-foreground"
      : good
      ? "text-emerald-400"
      : "text-red-400";
  return (
    <div className="flex flex-col items-center p-2 rounded-lg bg-muted/30 min-w-[80px]">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className={`text-sm font-bold ${color}`}>
        {value >= 0 ? "" : ""}
        {value.toFixed(2)}
        {unit}
      </span>
    </div>
  );
}

function StrategyResultRow({ result }: { result: BacktestResult }) {
  const m = result.metrics;
  const label = STRATEGY_LABELS[result.strategy] ?? result.strategy;
  const color = STRATEGY_COLORS[result.strategy] ?? "#94a3b8";
  const isPositive = m.total_return > 0;
  const beatsMarket = m.alpha > 0;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 border border-border/30">
      <div
        className="w-3 h-3 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{label}</span>
          {beatsMarket && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium">
              跑赢市场 +{m.alpha.toFixed(1)}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className={`text-xs font-medium ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
            {isPositive ? "+" : ""}{m.total_return.toFixed(1)}% 总收益
          </span>
          <span className="text-xs text-muted-foreground">Sharpe {m.sharpe.toFixed(2)}</span>
          <span className="text-xs text-muted-foreground">最大回撤 {m.max_drawdown.toFixed(1)}%</span>
          <span className="text-xs text-muted-foreground">胜率 {m.win_rate.toFixed(0)}%</span>
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className={`text-base font-bold ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
          {isPositive ? "+" : ""}{m.ann_return.toFixed(1)}%
        </div>
        <div className="text-[10px] text-muted-foreground">年化</div>
      </div>
    </div>
  );
}

export function BacktestCard({ ticker, spot, sigma, prices, alphaScores, suggestedStrategy }: BacktestCardProps) {
  const [activeStrategy, setActiveStrategy] = useState<string>(suggestedStrategy ?? "momentum");
  const [showComparison, setShowComparison] = useState(false);

  const runMutation = trpc.backtest.run.useMutation();
  const compareMutation = trpc.backtest.compare.useMutation();

  const handleRunSingle = () => {
    runMutation.mutate({
      strategy: activeStrategy as "momentum" | "mean_reversion" | "ma_crossover" | "alpha_factor" | "buy_hold",
      spot,
      sigma,
      days: 252,
      prices,
      alpha_scores: alphaScores,
    });
    setShowComparison(false);
  };

  const handleCompare = () => {
    compareMutation.mutate({ spot, sigma, days: 252, prices });
    setShowComparison(true);
  };

  const singleResult = runMutation.data;
  const compareResults = compareMutation.data ?? [];
  const isLoading = runMutation.isPending || compareMutation.isPending;

  // Merge equity curves for comparison chart
  const mergedEquity = showComparison && compareResults.length > 0
    ? compareResults[0].equity_curve.map((pt, i) => {
        const merged: Record<string, number> = { day: pt.day };
        compareResults.forEach((r) => {
          merged[r.strategy] = r.equity_curve[i]?.value ?? 1;
        });
        merged["buy_hold_bh"] = pt.bh;
        return merged;
      })
    : singleResult?.equity_curve.map((pt) => ({
        day: pt.day,
        strategy: pt.value,
        buy_hold: pt.bh,
      })) ?? [];

  return (
    <div className="rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-gradient-to-r from-indigo-500/10 to-purple-500/10">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-semibold">Qbot 量化回测</span>
          <span className="text-xs text-muted-foreground">{ticker}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            σ={sigma.toFixed(2)} S₀={spot.toFixed(0)}
          </span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Strategy selector */}
        <div className="flex flex-wrap gap-2">
          {Object.entries(STRATEGY_LABELS).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveStrategy(key)}
              className={`relative text-xs px-2.5 py-1 rounded-full border transition-colors ${
                activeStrategy === key
                  ? "border-indigo-500 bg-indigo-500/20 text-indigo-300"
                  : "border-border/40 text-muted-foreground hover:border-border"
              }`}
            >
              {label}
              {key === suggestedStrategy && (
                <span className="absolute -top-1.5 -right-1 text-[8px] px-1 py-px rounded-full bg-pink-500/80 text-white font-bold leading-none">
                  推荐
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleRunSingle}
            disabled={isLoading}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/30 transition-colors disabled:opacity-50"
          >
            {isLoading && !showComparison ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : (
              <Play className="w-3 h-3" />
            )}
            运行单策略
          </button>
          <button
            onClick={handleCompare}
            disabled={isLoading}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 transition-colors disabled:opacity-50"
          >
            {isLoading && showComparison ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : (
              <BarChart2 className="w-3 h-3" />
            )}
            四策略对比
          </button>
        </div>

        {/* Error */}
        {(runMutation.error || compareMutation.error) && (
          <div className="text-xs text-red-400 bg-red-500/10 rounded-lg p-2">
            回测失败：{(runMutation.error || compareMutation.error)?.message}
          </div>
        )}

        {/* Single strategy result */}
        {!showComparison && singleResult && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {STRATEGY_LABELS[singleResult.strategy]} — {singleResult.days} 交易日
              </span>
              {singleResult.metrics.alpha > 0 ? (
                <TrendingUp className="w-3 h-3 text-emerald-400" />
              ) : (
                <TrendingDown className="w-3 h-3 text-red-400" />
              )}
            </div>

            {/* Metrics row */}
            <div className="flex flex-wrap gap-2">
              <MetricBadge
                label="总收益"
                value={singleResult.metrics.total_return}
                unit="%"
                good={singleResult.metrics.total_return > 0}
              />
              <MetricBadge
                label="年化"
                value={singleResult.metrics.ann_return}
                unit="%"
                good={singleResult.metrics.ann_return > 0}
              />
              <MetricBadge
                label="Sharpe"
                value={singleResult.metrics.sharpe}
                good={singleResult.metrics.sharpe > 1}
              />
              <MetricBadge
                label="Sortino"
                value={singleResult.metrics.sortino}
                good={singleResult.metrics.sortino > 1}
              />
              <MetricBadge
                label="最大回撤"
                value={singleResult.metrics.max_drawdown}
                unit="%"
                good={singleResult.metrics.max_drawdown < 15}
              />
              <MetricBadge
                label="Alpha"
                value={singleResult.metrics.alpha}
                unit="%"
                good={singleResult.metrics.alpha > 0}
              />
              <MetricBadge
                label="胜率"
                value={singleResult.metrics.win_rate}
                unit="%"
                good={singleResult.metrics.win_rate > 50}
              />
            </div>

            {/* Equity curve */}
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mergedEquity} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(v) => `${(v * 100 - 100).toFixed(0)}%`} />
                  <Tooltip
                    contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", fontSize: "11px" }}
                    formatter={(v: number, name: string) => [
                      `${((v - 1) * 100).toFixed(2)}%`,
                      name === "strategy" ? STRATEGY_LABELS[singleResult.strategy] : "买入持有",
                    ]}
                  />
                  <ReferenceLine y={1} stroke="#475569" strokeDasharray="4 4" />
                  <Line
                    type="monotone"
                    dataKey="strategy"
                    stroke={STRATEGY_COLORS[singleResult.strategy] ?? "#6366f1"}
                    dot={false}
                    strokeWidth={2}
                    name={STRATEGY_LABELS[singleResult.strategy]}
                  />
                  <Line
                    type="monotone"
                    dataKey="buy_hold"
                    stroke="#94a3b8"
                    dot={false}
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    name="买入持有"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Strategy comparison */}
        {showComparison && compareResults.length > 0 && (
          <div className="space-y-3">
            <span className="text-xs font-medium text-muted-foreground">四策略对比 — 252 交易日</span>

            {/* Comparison equity chart */}
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mergedEquity} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(v) => `${(v * 100 - 100).toFixed(0)}%`} />
                  <Tooltip
                    contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", fontSize: "11px" }}
                    formatter={(v: number, name: string) => [
                      `${((v - 1) * 100).toFixed(2)}%`,
                      STRATEGY_LABELS[name] ?? name,
                    ]}
                  />
                  <ReferenceLine y={1} stroke="#475569" strokeDasharray="4 4" />
                  <Legend formatter={(v) => STRATEGY_LABELS[v] ?? v} wrapperStyle={{ fontSize: "11px" }} />
                  {compareResults.map((r) => (
                    <Line
                      key={r.strategy}
                      type="monotone"
                      dataKey={r.strategy}
                      stroke={STRATEGY_COLORS[r.strategy] ?? "#94a3b8"}
                      dot={false}
                      strokeWidth={r.strategy === "buy_hold" ? 1 : 2}
                      strokeDasharray={r.strategy === "buy_hold" ? "4 4" : undefined}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Strategy ranking */}
            <div className="space-y-2">
              {[...compareResults]
                .sort((a, b) => b.metrics.total_return - a.metrics.total_return)
                .map((r) => (
                  <StrategyResultRow key={r.strategy} result={r} />
                ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !singleResult && compareResults.length === 0 && (
          <div className="text-center py-6 text-muted-foreground">
            <BarChart2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs">选择策略并点击「运行」开始回测</p>
            <p className="text-[10px] mt-1 opacity-60">基于 Qbot 量化框架 · GBM 价格模拟</p>
          </div>
        )}
      </div>
    </div>
  );
}
