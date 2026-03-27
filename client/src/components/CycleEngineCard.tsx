/**
 * CycleEngineCard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * CYCLE ENGINE FOUNDATION — Lightweight Column 4 macro cycle display module
 *
 * Displays:
 *   1. 当前宏观阶段
 *   2. 市场风格 (risk-on / risk-off / neutral)
 *   3. 领先板块 / 落后板块 / 资金流向
 *   4. 为什么 (Surface / Trend / Hidden)
 *   5. 风险提示
 *   6. 关键数据快照
 *
 * Semantic: READ-ONLY macro context. Does NOT generate BUY signals.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Activity,
  BarChart3,
  Layers,
  Eye,
} from "lucide-react";

// ─── Types (mirrored from server) ─────────────────────────────────────────────

type MacroStage = "Early Expansion" | "Mid Expansion" | "Late Cycle" | "Slowdown / Recession";
type MarketStyle = "risk-on" | "risk-off" | "neutral";

interface CycleOutput {
  stage: MacroStage;
  stageLabel: string;
  marketStyle: MarketStyle;
  marketStyleLabel: string;
  sectorRotation: {
    leading: string[];
    lagging: string[];
    emerging: string[];
    capitalFlow: string;
  };
  why: { surface: string; trend: string; hidden: string };
  riskWarnings: string[];
  confidence: number;
  dataSnapshot: {
    fedFundsRate: number | null;
    treasury10y: number | null;
    treasury2y: number | null;
    yieldCurveSpread: number | null;
    unemployment: number | null;
    gdpGrowth: number | null;
    corePce: number | null;
    creditSpread: number | null;
  };
  generatedAt: number;
  cacheHit?: boolean;
  cacheAgeMinutes?: number;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const STAGE_CONFIG: Record<MacroStage, { color: string; bg: string; border: string; icon: React.ReactNode }> = {
  "Early Expansion": {
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    icon: <TrendingUp className="w-3.5 h-3.5" />,
  },
  "Mid Expansion": {
    color: "text-sky-400",
    bg: "bg-sky-500/10",
    border: "border-sky-500/30",
    icon: <Activity className="w-3.5 h-3.5" />,
  },
  "Late Cycle": {
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    icon: <Minus className="w-3.5 h-3.5" />,
  },
  "Slowdown / Recession": {
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    icon: <TrendingDown className="w-3.5 h-3.5" />,
  },
};

const STYLE_CONFIG: Record<MarketStyle, { label: string; color: string; dot: string }> = {
  "risk-on": { label: "风险偏好", color: "text-emerald-400", dot: "bg-emerald-400" },
  "risk-off": { label: "风险规避", color: "text-red-400", dot: "bg-red-400" },
  "neutral": { label: "中性观望", color: "text-slate-400", dot: "bg-slate-400" },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function DataPill({ label, value, warn }: { label: string; value: string | null; warn?: boolean }) {
  if (value === null) return null;
  return (
    <div className={`flex items-center justify-between px-2 py-1 rounded text-xs ${warn ? "bg-amber-500/10 border border-amber-500/20" : "bg-white/5"}`}>
      <span className="text-slate-400">{label}</span>
      <span className={warn ? "text-amber-300 font-medium" : "text-slate-200"}>{value}</span>
    </div>
  );
}

function WhyBlock({ why }: { why: CycleOutput["why"] }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-2 text-xs">
        <span className="shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-600/50 text-slate-300">表面</span>
        <span className="text-slate-300 leading-relaxed">{why.surface}</span>
      </div>
      <div className="flex items-start gap-2 text-xs">
        <span className="shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-600/30 text-sky-300">趋势</span>
        <span className="text-slate-300 leading-relaxed">{why.trend}</span>
      </div>
      <div className="flex items-start gap-2 text-xs">
        <span className="shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-600/30 text-purple-300">隐含</span>
        <span className="text-slate-300 leading-relaxed">{why.hidden}</span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CycleEngineCard() {
  const [result, setResult] = useState<CycleOutput | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showData, setShowData] = useState(false);

  const analyzeMutation = trpc.cycleEngine.analyze.useMutation({
    onSuccess: (data) => {
      setResult(data as CycleOutput);
      setExpanded(true);
    },
  });

  const handleRun = (forceRefresh = false) => {
    analyzeMutation.mutate({ forceRefresh });
  };

  const stageConfig = result ? STAGE_CONFIG[result.stage] : null;
  const styleConfig = result ? STYLE_CONFIG[result.marketStyle] : null;

  return (
    <div className="rounded-xl border border-white/10 bg-[#0f1117] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-semibold text-white">宏观周期引擎</span>
          <span className="text-[10px] text-slate-500 px-1.5 py-0.5 rounded bg-white/5 border border-white/8">
            Cycle Engine
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {result?.cacheHit && (
            <span className="text-[10px] text-slate-500">
              缓存 {result.cacheAgeMinutes}min 前
            </span>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-slate-400 hover:text-white"
            onClick={() => handleRun(false)}
            disabled={analyzeMutation.isPending}
          >
            {analyzeMutation.isPending ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {!result && !analyzeMutation.isPending && (
        <div className="px-4 py-6 text-center">
          <Layers className="w-8 h-8 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-500 mb-1">宏观周期尚未分析</p>
          <p className="text-xs text-slate-600 mb-4">基于 FRED 实时数据判断当前经济周期阶段</p>
          <Button
            size="sm"
            className="bg-violet-600 hover:bg-violet-500 text-white text-xs h-8 px-4"
            onClick={() => handleRun(false)}
          >
            启动周期分析
          </Button>
        </div>
      )}

      {/* Loading state */}
      {analyzeMutation.isPending && (
        <div className="px-4 py-6 text-center">
          <RefreshCw className="w-6 h-6 text-violet-400 mx-auto mb-3 animate-spin" />
          <p className="text-sm text-slate-400">正在采集宏观数据并推理周期阶段...</p>
          <p className="text-xs text-slate-600 mt-1">FRED → 周期分类 → 行业轮动 → LLM 三层解释</p>
        </div>
      )}

      {/* Result */}
      {result && stageConfig && styleConfig && (
        <div className="px-4 py-3 space-y-3">
          {/* Stage + Style row */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${stageConfig.bg} ${stageConfig.border}`}>
              <span className={stageConfig.color}>{stageConfig.icon}</span>
              <span className={`text-sm font-semibold ${stageConfig.color}`}>{result.stageLabel}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 border border-white/10">
              <span className={`w-1.5 h-1.5 rounded-full ${styleConfig.dot}`} />
              <span className={`text-xs font-medium ${styleConfig.color}`}>{styleConfig.label}</span>
            </div>
            <div className="ml-auto flex items-center gap-1 text-xs text-slate-500">
              <Eye className="w-3 h-3" />
              <span>置信度 {result.confidence}%</span>
            </div>
          </div>

          {/* Capital flow */}
          <div className="text-xs text-slate-400 bg-white/3 rounded-lg px-3 py-2 border border-white/8">
            <span className="text-slate-500 mr-1">资金流向：</span>
            {result.sectorRotation.capitalFlow}
          </div>

          {/* Sector rotation */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] text-emerald-400 font-medium mb-1.5 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> 领先板块
              </p>
              <div className="space-y-1">
                {result.sectorRotation.leading.slice(0, 3).map((s) => (
                  <div key={s} className="text-xs text-slate-300 bg-emerald-500/8 border border-emerald-500/15 rounded px-2 py-0.5 truncate">
                    {s}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-red-400 font-medium mb-1.5 flex items-center gap-1">
                <TrendingDown className="w-3 h-3" /> 落后板块
              </p>
              <div className="space-y-1">
                {result.sectorRotation.lagging.slice(0, 3).map((s) => (
                  <div key={s} className="text-xs text-slate-300 bg-red-500/8 border border-red-500/15 rounded px-2 py-0.5 truncate">
                    {s}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Expandable: Why block */}
          <div>
            <button
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors w-full"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              为什么（Surface / Trend / Hidden）
            </button>
            {expanded && (
              <div className="mt-2 bg-white/3 rounded-lg p-3 border border-white/8">
                <WhyBlock why={result.why} />
              </div>
            )}
          </div>

          {/* Risk warnings */}
          {result.riskWarnings.length > 0 && (
            <div className="space-y-1.5">
              {result.riskWarnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 text-xs bg-amber-500/8 border border-amber-500/15 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span className="text-amber-200/80 leading-relaxed">{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Data snapshot toggle */}
          <div>
            <button
              className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-400 transition-colors"
              onClick={() => setShowData(!showData)}
            >
              {showData ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              关键数据快照（FRED）
            </button>
            {showData && (
              <div className="mt-2 space-y-1">
                <DataPill label="联邦基金利率" value={result.dataSnapshot.fedFundsRate !== null ? `${result.dataSnapshot.fedFundsRate}%` : null} />
                <DataPill label="核心PCE" value={result.dataSnapshot.corePce !== null ? `${result.dataSnapshot.corePce}%` : null} />
                <DataPill label="失业率" value={result.dataSnapshot.unemployment !== null ? `${result.dataSnapshot.unemployment}%` : null} />
                <DataPill label="实际GDP增速" value={result.dataSnapshot.gdpGrowth !== null ? `${result.dataSnapshot.gdpGrowth}%` : null} />
                <DataPill label="10年期美债" value={result.dataSnapshot.treasury10y !== null ? `${result.dataSnapshot.treasury10y}%` : null} />
                <DataPill
                  label="收益率曲线(10Y-2Y)"
                  value={result.dataSnapshot.yieldCurveSpread !== null ? `${result.dataSnapshot.yieldCurveSpread}%` : null}
                  warn={(result.dataSnapshot.yieldCurveSpread ?? 0) < 0}
                />
                <DataPill label="高收益信用利差" value={result.dataSnapshot.creditSpread !== null ? `${result.dataSnapshot.creditSpread}%` : null} />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-1 border-t border-white/8">
            <span className="text-[10px] text-slate-600">
              {new Date(result.generatedAt).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-slate-700 text-slate-500">
                宏观参考 · 非买入建议
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                className="h-5 px-2 text-[10px] text-slate-500 hover:text-white"
                onClick={() => handleRun(true)}
                disabled={analyzeMutation.isPending}
              >
                强制刷新
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CycleEngineCard;
