/**
 * WorldMonitorCard - World Monitor-style global financial radar
 * Inspired by koala73/worldmonitor (42.8k stars)
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Globe, TrendingUp, TrendingDown, Minus, RefreshCw, Activity } from "lucide-react";

interface GlobalSignal {
  asset: string;
  assetType: string;
  signal: "bullish" | "bearish" | "neutral";
  strength: number;
  correlation: number;
  reason: string;
  dataPoint?: string;
}

interface CrossStreamAnalysis {
  ticker: string;
  timestamp: string;
  globalSignals: GlobalSignal[];
  correlationMatrix: Array<{ asset: string; correlation: number; lagDays: number }>;
  riskIndicators: {
    vixLevel: string;
    creditSpread: string;
    dollarStrength: string;
    yieldCurve: string;
  };
  worldPulse: {
    usMarket: number;
    europeMarket: number;
    asiaMarket: number;
    emergingMarkets: number;
    cryptoMarket: number;
    commodities: number;
  };
  aiNarrative: string;
}

interface WorldMonitorCardProps {
  ticker: string;
  marketData?: {
    vix?: number;
    sp500Change?: number;
    btcChange?: number;
    goldChange?: number;
    dxyChange?: number;
    yieldSpread?: number;
    sectorPerformance?: Record<string, number>;
    relatedTickers?: Array<{ symbol: string; change: number }>;
  };
  /** 分析完成后，回调相关性最强的资产列表（用于回写 TrendRadar watchlist） */
  onTopCorrelationsFound?: (assets: string[]) => void;
}

const ASSET_TYPE_ICONS: Record<string, string> = {
  stock: "📈",
  crypto: "₿",
  commodity: "🛢️",
  forex: "💱",
  index: "📊",
  macro: "🏛️",
};

const SIGNAL_COLORS = {
  bullish: "text-emerald-400",
  bearish: "text-red-400",
  neutral: "text-amber-400",
};

const VIX_COLORS: Record<string, string> = {
  low: "text-emerald-400",
  elevated: "text-amber-400",
  high: "text-orange-400",
  extreme: "text-red-400",
};

const VIX_LABELS: Record<string, string> = {
  low: "低恐慌",
  elevated: "略高",
  high: "高恐慌",
  extreme: "极度恐慌",
};

function SignalRow({ signal }: { signal: GlobalSignal }) {
  const corrColor =
    signal.correlation > 30 ? "text-emerald-400" :
    signal.correlation < -30 ? "text-red-400" : "text-amber-400";
  const icon =
    signal.signal === "bullish" ? <TrendingUp className="w-3 h-3 text-emerald-400" /> :
    signal.signal === "bearish" ? <TrendingDown className="w-3 h-3 text-red-400" /> :
    <Minus className="w-3 h-3 text-amber-400" />;

  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-border/10 last:border-0">
      <span className="text-sm">{ASSET_TYPE_ICONS[signal.assetType] ?? "📌"}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium">{signal.asset}</span>
          {signal.dataPoint && (
            <span className="text-[10px] text-muted-foreground">{signal.dataPoint}</span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground truncate">{signal.reason}</p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {icon}
        <span className={`text-[10px] font-medium ${corrColor}`}>
          {signal.correlation > 0 ? "+" : ""}{signal.correlation}%
        </span>
      </div>
    </div>
  );
}

export function WorldMonitorCard({ ticker, marketData = {}, onTopCorrelationsFound }: WorldMonitorCardProps) {
  const [result, setResult] = useState<CrossStreamAnalysis | null>(null);
  const analyzeMutation = trpc.worldMonitor.analyze.useMutation({
    onSuccess: (data) => {
      const analysis = data as CrossStreamAnalysis;
      setResult(analysis);
      // 回调相关性绝对値最高的前 3 个资产（排除主 ticker 本身）
      if (onTopCorrelationsFound && analysis.correlationMatrix?.length) {
        const topAssets = [...analysis.correlationMatrix]
          .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))
          .slice(0, 3)
          .map(c => c.asset)
          .filter(a => a.toUpperCase() !== ticker.toUpperCase());
        if (topAssets.length > 0) onTopCorrelationsFound(topAssets);
      }
    },
  });

  const handleAnalyze = () => {
    analyzeMutation.mutate({ ticker, ...marketData });
  };

  // Prepare radar chart data from worldPulse
  const radarData = result ? [
    { subject: "美股", value: Math.max(0, result.worldPulse.usMarket + 100) / 2 },
    { subject: "欧股", value: Math.max(0, result.worldPulse.europeMarket + 100) / 2 },
    { subject: "亚股", value: Math.max(0, result.worldPulse.asiaMarket + 100) / 2 },
    { subject: "新兴", value: Math.max(0, result.worldPulse.emergingMarkets + 100) / 2 },
    { subject: "加密", value: Math.max(0, result.worldPulse.cryptoMarket + 100) / 2 },
    { subject: "大宗", value: Math.max(0, result.worldPulse.commodities + 100) / 2 },
  ] : [];

  const ri = result?.riskIndicators;

  return (
    <div className="rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-gradient-to-r from-blue-500/10 to-cyan-500/10">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold">World Monitor 全球雷达</span>
          <span className="text-xs text-muted-foreground">{ticker}</span>
        </div>
        <button
          onClick={handleAnalyze}
          disabled={analyzeMutation.isPending}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 transition-colors disabled:opacity-50"
        >
          {analyzeMutation.isPending ? (
            <RefreshCw className="w-3 h-3 animate-spin" />
          ) : (
            <Activity className="w-3 h-3" />
          )}
          扫描全球
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Error */}
        {analyzeMutation.error && (
          <div className="text-xs text-red-400 bg-red-500/10 rounded-lg p-2">
            分析失败：{analyzeMutation.error.message}
          </div>
        )}

        {/* Empty state */}
        {!result && !analyzeMutation.isPending && (
          <div className="text-center py-6 text-muted-foreground">
            <Globe className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs">点击「扫描全球」获取跨资产信号分析</p>
            <p className="text-[10px] mt-1 opacity-60">基于 World Monitor 全球金融雷达框架</p>
          </div>
        )}

        {/* Loading */}
        {analyzeMutation.isPending && (
          <div className="text-center py-6 text-muted-foreground">
            <Globe className="w-6 h-6 mx-auto mb-2 animate-pulse text-blue-400" />
            <p className="text-xs">正在扫描全球市场信号...</p>
          </div>
        )}

        {/* Results */}
        {result && (
          <>
            {/* AI narrative */}
            <div className="text-xs text-muted-foreground bg-muted/20 rounded-lg p-2.5 leading-relaxed border border-border/20">
              <Globe className="w-3 h-3 inline mr-1 text-blue-400" />
              {result.aiNarrative}
            </div>

            {/* Risk indicators */}
            {ri && (
              <div className="grid grid-cols-4 gap-1.5">
                <div className="flex flex-col items-center p-2 rounded-lg bg-muted/20">
                  <span className="text-[9px] text-muted-foreground uppercase">VIX</span>
                  <span className={`text-xs font-bold ${VIX_COLORS[ri.vixLevel]}`}>
                    {VIX_LABELS[ri.vixLevel] ?? ri.vixLevel}
                  </span>
                </div>
                <div className="flex flex-col items-center p-2 rounded-lg bg-muted/20">
                  <span className="text-[9px] text-muted-foreground uppercase">信用</span>
                  <span className={`text-xs font-bold ${ri.creditSpread === "tight" ? "text-emerald-400" : ri.creditSpread === "distressed" ? "text-red-400" : "text-amber-400"}`}>
                    {ri.creditSpread === "tight" ? "收窄" : ri.creditSpread === "wide" ? "走阔" : ri.creditSpread === "distressed" ? "危机" : "正常"}
                  </span>
                </div>
                <div className="flex flex-col items-center p-2 rounded-lg bg-muted/20">
                  <span className="text-[9px] text-muted-foreground uppercase">美元</span>
                  <span className={`text-xs font-bold ${ri.dollarStrength === "strong" ? "text-blue-400" : ri.dollarStrength === "weak" ? "text-red-400" : "text-amber-400"}`}>
                    {ri.dollarStrength === "strong" ? "强势" : ri.dollarStrength === "weak" ? "弱势" : "中性"}
                  </span>
                </div>
                <div className="flex flex-col items-center p-2 rounded-lg bg-muted/20">
                  <span className="text-[9px] text-muted-foreground uppercase">收益率</span>
                  <span className={`text-xs font-bold ${ri.yieldCurve === "normal" ? "text-emerald-400" : ri.yieldCurve === "inverted" ? "text-red-400" : "text-amber-400"}`}>
                    {ri.yieldCurve === "normal" ? "正常" : ri.yieldCurve === "inverted" ? "倒挂" : "平坦"}
                  </span>
                </div>
              </div>
            )}

            {/* World pulse radar */}
            {radarData.length > 0 && (
              <div>
                <span className="text-xs font-medium text-muted-foreground">全球市场脉搏</span>
                <div className="h-44 mt-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="rgba(255,255,255,0.1)" />
                      <PolarAngleAxis dataKey="subject" tick={{ fontSize: 13, fill: "#94a3b8" }} />
                      <Radar
                        name="市场情绪"
                        dataKey="value"
                        stroke="#3b82f6"
                        fill="#3b82f6"
                        fillOpacity={0.2}
                      />
                      <Tooltip
                        contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", fontSize: "13px" }}
                        formatter={(v: number) => [`${(v * 2 - 100).toFixed(0)}`, "情绪指数"]}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Global signals */}
            {result.globalSignals.length > 0 && (
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  跨资产信号 ({result.globalSignals.length})
                </span>
                <div className="space-y-0">
                  {result.globalSignals
                    .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))
                    .map((sig, i) => (
                      <SignalRow key={i} signal={sig} />
                    ))}
                </div>
              </div>
            )}

            {/* Correlation matrix */}
            {result.correlationMatrix.length > 0 && (
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">相关性矩阵</span>
                <div className="flex flex-wrap gap-1.5">
                  {result.correlationMatrix.map((c, i) => {
                    const corrColor =
                      c.correlation > 50 ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" :
                      c.correlation < -50 ? "bg-red-500/20 text-red-300 border-red-500/30" :
                      "bg-muted/20 text-muted-foreground border-border/30";
                    return (
                      <div key={i} className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded border ${corrColor}`}>
                        <span className="font-medium">{c.asset}</span>
                        <span>{c.correlation > 0 ? "+" : ""}{c.correlation}%</span>
                        {c.lagDays > 0 && <span className="opacity-60">L{c.lagDays}d</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="text-[10px] text-muted-foreground/50 text-right">
              分析时间: {new Date(result.timestamp).toLocaleTimeString()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
