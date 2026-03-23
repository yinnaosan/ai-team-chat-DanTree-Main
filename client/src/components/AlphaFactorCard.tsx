/**
 * AlphaFactorCard.tsx
 * Alpha 因子可视化卡片：信号灯 + 评分条
 * 解析 %%ALPHA_FACTORS%%{JSON}%%END_ALPHA_FACTORS%% 标记
 */

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

// ── 类型定义 ──────────────────────────────────────────────────────────────────
interface AlphaFactorData {
  name: string;
  category: string;
  signal: 1 | -1 | 0;
  strength: number; // 0-100
  value: number | null;
  zScore: number | null;
  description: string;
}

interface AlphaFactorsPayload {
  ticker: string;
  compositeScore: number; // -100 ~ 100
  overallSignal: "strong_long" | "long" | "neutral" | "short" | "strong_short";
  factors: AlphaFactorData[];
  generatedAt: number;
}

// ── 解析工具 ──────────────────────────────────────────────────────────────────
export function parseAlphaFactors(text: string): { payload: AlphaFactorsPayload; rest: string } | null {
  const match = text.match(/%%ALPHA_FACTORS%%([\s\S]*?)%%END_ALPHA_FACTORS%%/);
  if (!match) return null;
  try {
    const payload = JSON.parse(match[1]) as AlphaFactorsPayload;
    const rest = text.replace(/%%ALPHA_FACTORS%%[\s\S]*?%%END_ALPHA_FACTORS%%\n?/, "").trim();
    return { payload, rest };
  } catch {
    return null;
  }
}

// ── 信号配置 ──────────────────────────────────────────────────────────────────
const SIGNAL_CONFIG = {
  strong_long: {
    label: "强烈看多",
    color: "bg-emerald-500",
    textColor: "text-emerald-400",
    borderColor: "border-emerald-500/30",
    bgColor: "bg-emerald-500/10",
    icon: TrendingUp,
    scoreColor: "text-emerald-400",
  },
  long: {
    label: "偏多",
    color: "bg-green-500",
    textColor: "text-green-400",
    borderColor: "border-green-500/30",
    bgColor: "bg-green-500/10",
    icon: TrendingUp,
    scoreColor: "text-green-400",
  },
  neutral: {
    label: "中性",
    color: "bg-slate-400",
    textColor: "text-slate-400",
    borderColor: "border-slate-500/30",
    bgColor: "bg-slate-500/10",
    icon: Minus,
    scoreColor: "text-slate-400",
  },
  short: {
    label: "偏空",
    color: "bg-orange-500",
    textColor: "text-orange-400",
    borderColor: "border-orange-500/30",
    bgColor: "bg-orange-500/10",
    icon: TrendingDown,
    scoreColor: "text-orange-400",
  },
  strong_short: {
    label: "强烈看空",
    color: "bg-red-500",
    textColor: "text-red-400",
    borderColor: "border-red-500/30",
    bgColor: "bg-red-500/10",
    icon: TrendingDown,
    scoreColor: "text-red-400",
  },
};

const CATEGORY_LABELS: Record<string, string> = {
  momentum: "动量",
  reversal: "反转",
  volatility: "波动率",
  volume: "成交量",
  technical: "技术",
  value: "价值",
  quality: "质量",
};

// ── 单个因子行 ────────────────────────────────────────────────────────────────
function FactorRow({ factor }: { factor: AlphaFactorData }) {
  const isLong = factor.signal === 1;
  const isShort = factor.signal === -1;
  const isNeutral = factor.signal === 0;

  const signalColor = isLong
    ? "text-emerald-400"
    : isShort
    ? "text-red-400"
    : "text-slate-400";

  const progressColor = isLong
    ? "bg-emerald-500"
    : isShort
    ? "bg-red-500"
    : "bg-slate-500";

  const SignalIcon = isLong ? TrendingUp : isShort ? TrendingDown : Minus;

  return (
    <div className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-white/5 transition-colors">
      {/* 信号灯 */}
      <div className={cn("flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center", {
        "bg-emerald-500/20": isLong,
        "bg-red-500/20": isShort,
        "bg-slate-500/20": isNeutral,
      })}>
        <SignalIcon className={cn("w-3 h-3", signalColor)} />
      </div>

      {/* 因子名称 + 分类 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-mono text-foreground/90 truncate">{factor.name}</span>
          <span className="text-xs text-muted-foreground/60 flex-shrink-0">
            {CATEGORY_LABELS[factor.category] ?? factor.category}
          </span>
        </div>
        {factor.description && (
          <p className="text-xs text-muted-foreground/50 truncate mt-0.5">{factor.description.split("：")[0]}</p>
        )}
      </div>

      {/* Z-Score */}
      {factor.zScore !== null && (
        <span className={cn("text-xs font-mono flex-shrink-0", signalColor)}>
          z={factor.zScore.toFixed(2)}
        </span>
      )}

      {/* 强度进度条 */}
      <div className="flex-shrink-0 w-20">
        <div className="flex items-center gap-1">
          <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", progressColor)}
              style={{ width: `${factor.strength}%` }}
            />
          </div>
          <span className={cn("text-xs font-mono w-7 text-right", signalColor)}>
            {factor.strength}%
          </span>
        </div>
      </div>
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────────────
export default function AlphaFactorCard({ payload }: { payload: AlphaFactorsPayload }) {
  const [expanded, setExpanded] = useState(false);
  const config = SIGNAL_CONFIG[payload.overallSignal];
  const SignalIcon = config.icon;

  const techFactors = payload.factors.filter(f =>
    ["momentum", "reversal", "volatility", "volume", "technical"].includes(f.category)
  );
  const fundFactors = payload.factors.filter(f =>
    ["value", "quality"].includes(f.category)
  );

  const longCount = payload.factors.filter(f => f.signal === 1).length;
  const shortCount = payload.factors.filter(f => f.signal === -1).length;
  const neutralCount = payload.factors.filter(f => f.signal === 0).length;

  // 综合评分的进度条（-100~100 → 0~100%）
  const scorePercent = (payload.compositeScore + 100) / 2;
  const scoreBarColor =
    payload.compositeScore >= 25 ? "bg-emerald-500" :
    payload.compositeScore <= -25 ? "bg-red-500" :
    "bg-slate-400";

  return (
    <Card className={cn(
      "my-3 border overflow-hidden",
      config.borderColor,
      config.bgColor
    )}>
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <CardTitle className="text-sm font-semibold text-foreground/90">
              Alpha 因子分析 — {payload.ticker}
            </CardTitle>
            <Badge variant="outline" className={cn("text-xs px-1.5 py-0", config.textColor, config.borderColor)}>
              qlib Alpha101/158
            </Badge>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-3">
        {/* 综合评分区域 */}
        <div className="flex items-center gap-4 mb-3">
          {/* 信号徽章 */}
          <div className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border",
            config.borderColor, config.bgColor
          )}>
            <SignalIcon className={cn("w-4 h-4", config.textColor)} />
            <span className={cn("text-sm font-bold", config.textColor)}>{config.label}</span>
          </div>

          {/* 评分条 */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">综合 Alpha 评分</span>
              <span className={cn("text-sm font-bold font-mono", config.scoreColor)}>
                {payload.compositeScore > 0 ? "+" : ""}{payload.compositeScore}
              </span>
            </div>
            <div className="relative h-2 bg-white/10 rounded-full overflow-hidden">
              {/* 中线标记 */}
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/20 z-10" />
              <div
                className={cn("absolute top-0 bottom-0 rounded-full transition-all", scoreBarColor)}
                style={{
                  left: payload.compositeScore >= 0 ? "50%" : `${scorePercent}%`,
                  width: `${Math.abs(payload.compositeScore) / 2}%`,
                }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground/40 mt-0.5">
              <span>-100 看空</span>
              <span>0</span>
              <span>+100 看多</span>
            </div>
          </div>
        </div>

        {/* 因子统计摘要 */}
        <div className="flex gap-3 mb-2">
          <div className="flex items-center gap-1 text-xs">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-emerald-400 font-medium">{longCount}</span>
            <span className="text-muted-foreground/60">看多</span>
          </div>
          <div className="flex items-center gap-1 text-xs">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-red-400 font-medium">{shortCount}</span>
            <span className="text-muted-foreground/60">看空</span>
          </div>
          <div className="flex items-center gap-1 text-xs">
            <div className="w-2 h-2 rounded-full bg-slate-500" />
            <span className="text-slate-400 font-medium">{neutralCount}</span>
            <span className="text-muted-foreground/60">中性</span>
          </div>
          <span className="text-xs text-muted-foreground/40 ml-auto">
            共 {payload.factors.length} 个因子
          </span>
        </div>

        {/* 展开详情：因子列表 */}
        {expanded && (
          <div className="mt-3 space-y-2">
            {techFactors.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground/70 mb-1 px-2">
                  技术因子（{techFactors.length}个）
                </div>
                <div className="space-y-0.5">
                  {techFactors.map(f => <FactorRow key={f.name} factor={f} />)}
                </div>
              </div>
            )}
            {fundFactors.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground/70 mb-1 px-2 mt-2">
                  基本面因子（{fundFactors.length}个）
                </div>
                <div className="space-y-0.5">
                  {fundFactors.map(f => <FactorRow key={f.name} factor={f} />)}
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground/40 px-2 pt-1 border-t border-white/5 mt-2">
              基于 WorldQuant Alpha101、qlib Alpha158 因子集，仅供参考，不构成投资建议
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
