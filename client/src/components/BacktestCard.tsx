/**
 * BacktestCard - Dual-mode quantitative backtesting
 * Mode A: Qbot GBM (Monte Carlo simulation, no ticker needed)
 * Mode B: Factor Backtest (real historical data, ticker-aware)
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
import { TrendingUp, TrendingDown, BarChart2, RefreshCw, Play, Database, Cpu } from "lucide-react";

// ── Qbot GBM types ──────────────────────────────────────────────────────────
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

// ── Factor Backtest types ────────────────────────────────────────────────────
interface FactorMetrics {
  totalReturn: number;
  annualizedReturn: number;
  maxDrawdown: number;
  sharpe: number;
  alpha: number;
  calmar: number;
  winRate: number;
  totalTrades: number;
  benchmarkReturn: number;
}

interface FactorDailyResult {
  date: string;
  timestamp: number;
  close: number;
  factorValue: number;
  signal: number;
  portfolioValue: number;
  benchmarkValue: number;
  position: number;
}

interface FactorTrade {
  date: string;
  action: string;
  price: number;
  shares: number;
  value: number;
  return?: number;
}

interface FactorBacktestResult {
  ticker: string;
  factorId: string;
  factorName: string;
  period: string;
  metrics: FactorMetrics;
  dailyResults: FactorDailyResult[];
  trades: FactorTrade[];
  dataSource: string;
  barsCount: number;
}

// ── Props ────────────────────────────────────────────────────────────────────
interface BacktestCardProps {
  ticker: string;
  spot: number;
  sigma: number;
  alphaScore?: number;
  prices?: number[];
  alphaScores?: number[];
  suggestedStrategy?: string;
  expectedWinRate?: number;
}

// ── Constants ────────────────────────────────────────────────────────────────
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

const FACTOR_LABELS: Record<string, string> = {
  macd: "MACD 趋势跟踪",
  rsi: "RSI 超买超卖",
  bollinger: "布林带波动率",
  ma_cross: "均线交叉",
  momentum: "动量因子",
  kdj: "KDJ 随机指标",
};

const PERIOD_LABELS: Record<string, string> = {
  "6mo": "6个月",
  "1y": "1年",
  "2y": "2年",
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtPct(v: number) {
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

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
        {value.toFixed(2)}{unit}
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
      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
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

// ── Main Component ────────────────────────────────────────────────────────────
export function BacktestCard({ ticker, spot, sigma, prices, alphaScores, suggestedStrategy, expectedWinRate }: BacktestCardProps) {
  // Mode toggle: "gbm" = Qbot GBM simulation, "factor" = real historical factor backtest
  const [mode, setMode] = useState<"gbm" | "factor">("factor");

  // GBM state
  const [activeStrategy, setActiveStrategy] = useState<string>(suggestedStrategy ?? "momentum");
  const [showComparison, setShowComparison] = useState(false);
  const runMutation = trpc.backtest.run.useMutation();
  const compareMutation = trpc.backtest.compare.useMutation();

  // Factor backtest state
  const [factorId, setFactorId] = useState("macd");
  const [period, setPeriod] = useState("1y");
  const [factorResult, setFactorResult] = useState<FactorBacktestResult | null>(null);
  const { data: factorsData } = trpc.backtest.getFactors.useQuery();
  const factorRunMutation = trpc.backtest.factorRun.useMutation({
    onSuccess: (data) => setFactorResult(data as unknown as FactorBacktestResult),
  });

  // GBM handlers
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

  // Factor backtest handler
  const handleFactorRun = () => {
    if (!ticker) return;
    factorRunMutation.mutate({ ticker, factorId: factorId as "macd" | "rsi" | "bollinger" | "ma_cross" | "momentum" | "kdj", period: period as "6mo" | "1y" | "2y" });
    setFactorResult(null);
  };

  const singleResult = runMutation.data;
  const compareResults = compareMutation.data ?? [];
  const isGbmLoading = runMutation.isPending || compareMutation.isPending;
  const isFactorLoading = factorRunMutation.isPending;

  const mergedEquity = showComparison && compareResults.length > 0
    ? compareResults[0].equity_curve.map((pt, i) => {
        const merged: Record<string, number> = { day: pt.day };
        compareResults.forEach((r) => { merged[r.strategy] = r.equity_curve[i]?.value ?? 1; });
        merged["buy_hold_bh"] = pt.bh;
        return merged;
      })
    : singleResult?.equity_curve.map((pt) => ({
        day: pt.day,
        strategy: pt.value,
        buy_hold: pt.bh,
      })) ?? [];

  // Factor equity chart data
  const factorEquityData = factorResult?.dailyResults.map((d, i) => ({
    day: i,
    date: d.date,
    portfolio: d.portfolioValue / 1000000,
    benchmark: d.benchmarkValue / 1000000,
  })) ?? [];

  const availableFactors = factorsData ?? [
    { id: "macd", name: "MACD" },
    { id: "rsi", name: "RSI" },
    { id: "bollinger", name: "布林带" },
    { id: "ma_cross", name: "均线交叉" },
    { id: "momentum", name: "动量" },
    { id: "kdj", name: "KDJ" },
  ];

  return (
    <div className="rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-gradient-to-r from-indigo-500/10 to-purple-500/10">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-semibold">量化回测</span>
          {ticker && (
            <span className="text-xs px-2 py-0.5 rounded-full font-mono font-bold"
              style={{ background: "oklch(0.88 0.18 85 / 0.15)", color: "oklch(0.88 0.18 85)", border: "1px solid oklch(0.88 0.18 85 / 0.3)" }}>
              {ticker}
            </span>
          )}
        </div>
        {/* Mode toggle */}
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-muted/40 border border-border/30">
          <button
            onClick={() => setMode("factor")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-medium transition-all ${
              mode === "factor" ? "bg-indigo-500/30 text-indigo-300" : "text-muted-foreground hover:text-foreground"
            }`}>
            <Database className="w-3 h-3" />
            历史回测
          </button>
          <button
            onClick={() => setMode("gbm")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-medium transition-all ${
              mode === "gbm" ? "bg-purple-500/30 text-purple-300" : "text-muted-foreground hover:text-foreground"
            }`}>
            <Cpu className="w-3 h-3" />
            Qbot GBM
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">

        {/* ── MODE A: Factor Backtest (real historical data) ── */}
        {mode === "factor" && (
          <>
            {/* Ticker info */}
            {!ticker && (
              <div className="text-xs text-amber-400 bg-amber-500/10 rounded-lg p-2 border border-amber-500/20">
                请先选择分析标的，历史回测需要真实 ticker 数据
              </div>
            )}

            {/* Factor selector */}
            <div className="space-y-2">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">选择因子</span>
              <div className="flex flex-wrap gap-1.5">
                {availableFactors.map((f: { id: string; name: string }) => (
                  <button key={f.id} onClick={() => setFactorId(f.id)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      factorId === f.id
                        ? "border-indigo-500 bg-indigo-500/20 text-indigo-300"
                        : "border-border/40 text-muted-foreground hover:border-border"
                    }`}>
                    {FACTOR_LABELS[f.id] ?? f.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Period selector */}
            <div className="space-y-2">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">回测周期</span>
              <div className="flex gap-1.5">
                {Object.entries(PERIOD_LABELS).map(([k, v]) => (
                  <button key={k} onClick={() => setPeriod(k)}
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                      period === k
                        ? "border-indigo-500 bg-indigo-500/20 text-indigo-300"
                        : "border-border/40 text-muted-foreground hover:border-border"
                    }`}>
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* Run button */}
            <button
              onClick={handleFactorRun}
              disabled={isFactorLoading || !ticker}
              className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/30 transition-colors disabled:opacity-50 w-full justify-center font-medium">
              {isFactorLoading ? (
                <><RefreshCw className="w-3.5 h-3.5 animate-spin" />正在获取 {ticker} 历史数据...</>
              ) : (
                <><Play className="w-3.5 h-3.5" />运行 {ticker} · {FACTOR_LABELS[factorId] ?? factorId} · {PERIOD_LABELS[period]}</>
              )}
            </button>

            {/* Factor error */}
            {factorRunMutation.error && (
              <div className="text-xs text-red-400 bg-red-500/10 rounded-lg p-2">
                回测失败：{factorRunMutation.error.message}
              </div>
            )}

            {/* Factor result */}
            {factorResult && (
              <div className="space-y-3">
                {/* Summary row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-muted-foreground">
                    {factorResult.ticker} · {factorResult.factorName} · {PERIOD_LABELS[factorResult.period] ?? factorResult.period}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground">
                    {factorResult.barsCount} 根K线 · {factorResult.dataSource}
                  </span>
                  {factorResult.metrics.alpha > 0 ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                      跑赢基准 {fmtPct(factorResult.metrics.alpha)}
                    </span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
                      落后基准 {fmtPct(factorResult.metrics.alpha)}
                    </span>
                  )}
                </div>

                {/* Metrics */}
                <div className="flex flex-wrap gap-2">
                  <MetricBadge label="总收益" value={factorResult.metrics.totalReturn} unit="%" good={factorResult.metrics.totalReturn > 0} />
                  <MetricBadge label="年化" value={factorResult.metrics.annualizedReturn} unit="%" good={factorResult.metrics.annualizedReturn > 0} />
                  <MetricBadge label="Sharpe" value={factorResult.metrics.sharpe} good={factorResult.metrics.sharpe > 1} />
                  <MetricBadge label="最大回撤" value={factorResult.metrics.maxDrawdown} unit="%" good={factorResult.metrics.maxDrawdown < 15} />
                  <MetricBadge label="Alpha" value={factorResult.metrics.alpha} unit="%" good={factorResult.metrics.alpha > 0} />
                  <MetricBadge label="胜率" value={factorResult.metrics.winRate} unit="%" good={factorResult.metrics.winRate > 50} />
                  <MetricBadge label="基准收益" value={factorResult.metrics.benchmarkReturn} unit="%" />
                </div>

                {/* Equity curve */}
                {factorEquityData.length > 0 && (
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={factorEquityData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="day" tick={{ fontSize: 9, fill: "#94a3b8" }} interval={Math.floor(factorEquityData.length / 6)} />
                        <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} tickFormatter={(v) => `${((v - 1) * 100).toFixed(0)}%`} />
                        <Tooltip
                          contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", fontSize: "11px" }}
                          formatter={(v: number, name: string) => [
                            `${((v - 1) * 100).toFixed(2)}%`,
                            name === "portfolio" ? `${factorResult.factorName} 策略` : "基准买入持有",
                          ]}
                        />
                        <ReferenceLine y={1} stroke="#475569" strokeDasharray="4 4" />
                        <Legend formatter={(v) => v === "portfolio" ? `${factorResult.factorName} 策略` : "基准买入持有"} wrapperStyle={{ fontSize: "10px" }} />
                        <Line type="monotone" dataKey="portfolio" stroke="#6366f1" dot={false} strokeWidth={2} />
                        <Line type="monotone" dataKey="benchmark" stroke="#94a3b8" dot={false} strokeWidth={1} strokeDasharray="4 4" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Recent trades */}
                {factorResult.trades.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">最近交易记录（共 {factorResult.trades.length} 笔）</span>
                    <div className="max-h-32 overflow-y-auto space-y-0.5">
                      {factorResult.trades.slice(-8).reverse().map((t, i) => (
                        <div key={i} className="flex items-center gap-2 text-[10px] px-2 py-1 rounded bg-muted/20">
                          <span className={`font-medium ${t.action === "BUY" ? "text-red-400" : "text-emerald-400"}`}>{t.action}</span>
                          <span className="text-muted-foreground">{t.date}</span>
                          <span className="font-mono">${t.price.toFixed(2)}</span>
                          {t.return !== undefined && (
                            <span className={`ml-auto font-medium ${t.return >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {fmtPct(t.return)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Empty state */}
            {!isFactorLoading && !factorResult && !factorRunMutation.error && (
              <div className="text-center py-6 text-muted-foreground">
                <Database className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs">选择因子和周期，点击「运行」开始历史回测</p>
                <p className="text-[10px] mt-1 opacity-60">基于真实 {ticker || "标的"} 历史行情数据 · Polygon / Yahoo Finance</p>
              </div>
            )}
          </>
        )}

        {/* ── MODE B: Qbot GBM Simulation ── */}
        {mode === "gbm" && (
          <>
            <div className="text-[10px] text-muted-foreground px-1">
              GBM 模式：基于几何布朗运动蒙特卡洛模拟，使用当前价格 S₀={spot.toFixed(0)} 和波动率 σ={sigma.toFixed(2)}
            </div>

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
                  }`}>
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
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleRunSingle}
                disabled={isGbmLoading}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/30 transition-colors disabled:opacity-50">
                {isGbmLoading && !showComparison ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Play className="w-3 h-3" />
                )}
                运行单策略
              </button>
              <button
                onClick={handleCompare}
                disabled={isGbmLoading}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 transition-colors disabled:opacity-50">
                {isGbmLoading && showComparison ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <BarChart2 className="w-3 h-3" />
                )}
                四策略对比
              </button>
              {expectedWinRate !== undefined && (
                <span
                  className={`ml-auto text-[10px] px-2.5 py-1 rounded-lg border font-semibold ${
                    expectedWinRate >= 60
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      : expectedWinRate >= 55
                      ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                      : "bg-slate-500/15 text-slate-400 border-slate-500/30"
                  }`}
                  title="基于 Alpha 因子 zScore 加权信号强度估算，仅供参考">
                  基于 Alpha 信号预期胜率 {expectedWinRate}%
                </span>
              )}
            </div>

            {/* GBM Error */}
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
                <div className="flex flex-wrap gap-2">
                  <MetricBadge label="总收益" value={singleResult.metrics.total_return} unit="%" good={singleResult.metrics.total_return > 0} />
                  <MetricBadge label="年化" value={singleResult.metrics.ann_return} unit="%" good={singleResult.metrics.ann_return > 0} />
                  <MetricBadge label="Sharpe" value={singleResult.metrics.sharpe} good={singleResult.metrics.sharpe > 1} />
                  <MetricBadge label="Sortino" value={singleResult.metrics.sortino} good={singleResult.metrics.sortino > 1} />
                  <MetricBadge label="最大回撤" value={singleResult.metrics.max_drawdown} unit="%" good={singleResult.metrics.max_drawdown < 15} />
                  <MetricBadge label="Alpha" value={singleResult.metrics.alpha} unit="%" good={singleResult.metrics.alpha > 0} />
                  <MetricBadge label="胜率" value={singleResult.metrics.win_rate} unit="%" good={singleResult.metrics.win_rate > 50} />
                </div>
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
                      <Line type="monotone" dataKey="strategy" stroke={STRATEGY_COLORS[singleResult.strategy] ?? "#6366f1"} dot={false} strokeWidth={2} name={STRATEGY_LABELS[singleResult.strategy]} />
                      <Line type="monotone" dataKey="buy_hold" stroke="#94a3b8" dot={false} strokeWidth={1} strokeDasharray="4 4" name="买入持有" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Strategy comparison */}
            {showComparison && compareResults.length > 0 && (
              <div className="space-y-3">
                <span className="text-xs font-medium text-muted-foreground">四策略对比 — 252 交易日</span>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={mergedEquity} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(v) => `${(v * 100 - 100).toFixed(0)}%`} />
                      <Tooltip
                        contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", fontSize: "11px" }}
                        formatter={(v: number, name: string) => [`${((v - 1) * 100).toFixed(2)}%`, STRATEGY_LABELS[name] ?? name]}
                      />
                      <ReferenceLine y={1} stroke="#475569" strokeDasharray="4 4" />
                      <Legend formatter={(v) => STRATEGY_LABELS[v] ?? v} wrapperStyle={{ fontSize: "11px" }} />
                      {compareResults.map((r) => (
                        <Line key={r.strategy} type="monotone" dataKey={r.strategy}
                          stroke={STRATEGY_COLORS[r.strategy] ?? "#94a3b8"} dot={false}
                          strokeWidth={r.strategy === "buy_hold" ? 1 : 2}
                          strokeDasharray={r.strategy === "buy_hold" ? "4 4" : undefined} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {[...compareResults].sort((a, b) => b.metrics.total_return - a.metrics.total_return).map((r) => (
                    <StrategyResultRow key={r.strategy} result={r} />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!isGbmLoading && !singleResult && compareResults.length === 0 && (
              <div className="text-center py-6 text-muted-foreground">
                <BarChart2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs">选择策略并点击「运行」开始回测</p>
                <p className="text-[10px] mt-1 opacity-60">基于 Qbot 量化框架 · GBM 价格模拟</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
