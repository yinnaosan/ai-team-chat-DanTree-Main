/**
 * HealthScoreCard.tsx
 * 财务健康评分可视化卡片：等级徽章 + Recharts 雷达图四维度
 * 解析 %%HEALTH_SCORE%%{JSON}%%END_HEALTH_SCORE%% 标记
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { ShieldCheck, TrendingUp, DollarSign, BarChart2, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

// ── 类型定义 ──────────────────────────────────────────────────────────────────
interface HealthScorePayload {
  ticker: string;
  score: number;       // 0-100
  grade: string;       // A+, A, B+, B, C+, C, D
  summary: string;
  dimensions: {
    profitability: number;  // 0-100
    solvency: number;       // 0-100
    cashflow: number;       // 0-100
    growth: number;         // 0-100
  };
  generatedAt: number;
}

// ── 解析工具 ──────────────────────────────────────────────────────────────────
export function parseHealthScore(text: string): { payload: HealthScorePayload; rest: string } | null {
  const match = text.match(/%%HEALTH_SCORE%%([\s\S]*?)%%END_HEALTH_SCORE%%/);
  if (!match) return null;
  try {
    const payload = JSON.parse(match[1]) as HealthScorePayload;
    const rest = text.replace(/%%HEALTH_SCORE%%[\s\S]*?%%END_HEALTH_SCORE%%\n?/, "").trim();
    return { payload, rest };
  } catch {
    return null;
  }
}

// ── 等级配置 ──────────────────────────────────────────────────────────────────
const GRADE_CONFIG: Record<string, {
  color: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  radarColor: string;
  label: string;
}> = {
  "A+": {
    color: "bg-emerald-500",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
    textColor: "text-emerald-400",
    radarColor: "#10b981",
    label: "卓越",
  },
  "A": {
    color: "bg-green-500",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/30",
    textColor: "text-green-400",
    radarColor: "#22c55e",
    label: "优秀",
  },
  "B+": {
    color: "bg-teal-500",
    bgColor: "bg-teal-500/10",
    borderColor: "border-teal-500/30",
    textColor: "text-teal-400",
    radarColor: "#14b8a6",
    label: "良好",
  },
  "B": {
    color: "bg-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
    textColor: "text-blue-400",
    radarColor: "#3b82f6",
    label: "中等",
  },
  "C+": {
    color: "bg-yellow-500",
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/30",
    textColor: "text-yellow-400",
    radarColor: "#eab308",
    label: "一般",
  },
  "C": {
    color: "bg-orange-500",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/30",
    textColor: "text-orange-400",
    radarColor: "#f97316",
    label: "偏弱",
  },
  "D": {
    color: "bg-red-500",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/30",
    textColor: "text-red-400",
    radarColor: "#ef4444",
    label: "较差",
  },
};

const DEFAULT_GRADE_CONFIG = GRADE_CONFIG["B"];

// ── 维度图标 ──────────────────────────────────────────────────────────────────
const DIMENSION_ICONS = {
  profitability: BarChart2,
  solvency: ShieldCheck,
  cashflow: DollarSign,
  growth: TrendingUp,
};

const DIMENSION_LABELS = {
  profitability: "盈利能力",
  solvency: "偿债能力",
  cashflow: "现金流质量",
  growth: "成长性",
};

// ── 自定义 Tooltip ────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number; payload: { subject: string } }> }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background/95 border border-border rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-foreground">{payload[0].payload.subject}</p>
      <p className="text-muted-foreground">{payload[0].value}分</p>
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────────────
export default function HealthScoreCard({ payload }: { payload: HealthScorePayload }) {
  const config = GRADE_CONFIG[payload.grade] ?? DEFAULT_GRADE_CONFIG;

  const radarData = [
    { subject: "盈利能力", value: payload.dimensions.profitability, fullMark: 100 },
    { subject: "偿债能力", value: payload.dimensions.solvency, fullMark: 100 },
    { subject: "现金流质量", value: payload.dimensions.cashflow, fullMark: 100 },
    { subject: "成长性", value: payload.dimensions.growth, fullMark: 100 },
  ];

  return (
    <Card className={cn("my-3 border overflow-hidden", config.borderColor, config.bgColor)}>
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-400" />
          <CardTitle className="text-sm font-semibold text-foreground/90">
            财务健康评分 — {payload.ticker}
          </CardTitle>
          <Badge variant="outline" className={cn("text-xs px-1.5 py-0", config.textColor, config.borderColor)}>
            FinanceToolkit
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4">
        <div className="flex gap-4 items-start">
          {/* 左侧：等级徽章 + 评分 */}
          <div className="flex flex-col items-center gap-2 flex-shrink-0">
            {/* 大等级徽章 */}
            <div className={cn(
              "w-16 h-16 rounded-2xl flex flex-col items-center justify-center border-2",
              config.borderColor, config.bgColor
            )}>
              <span className={cn("text-2xl font-black leading-none", config.textColor)}>
                {payload.grade}
              </span>
              <span className={cn("text-xs mt-0.5", config.textColor)}>{config.label}</span>
            </div>
            {/* 综合评分 */}
            <div className="text-center">
              <div className={cn("text-xl font-bold font-mono", config.textColor)}>
                {payload.score}
              </div>
              <div className="text-xs text-muted-foreground/60">/ 100</div>
            </div>
          </div>

          {/* 右侧：雷达图 */}
          <div className="flex-1 h-44">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
                <PolarGrid stroke="rgba(255,255,255,0.1)" />
                <PolarAngleAxis
                  dataKey="subject"
                  tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }}
                />
                <Radar
                  name="评分"
                  dataKey="value"
                  stroke={config.radarColor}
                  fill={config.radarColor}
                  fillOpacity={0.25}
                  strokeWidth={2}
                />
                <Tooltip content={<CustomTooltip />} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 维度详情条 */}
        <div className="mt-3 space-y-2">
          {(Object.entries(payload.dimensions) as [keyof typeof DIMENSION_LABELS, number][]).map(([key, value]) => {
            const Icon = DIMENSION_ICONS[key];
            const barColor =
              value >= 70 ? "bg-emerald-500" :
              value >= 50 ? "bg-blue-500" :
              value >= 30 ? "bg-yellow-500" :
              "bg-red-500";
            return (
              <div key={key} className="flex items-center gap-2">
                <Icon className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0" />
                <span className="text-xs text-muted-foreground/70 w-20 flex-shrink-0">
                  {DIMENSION_LABELS[key]}
                </span>
                <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", barColor)}
                    style={{ width: `${value}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-muted-foreground/60 w-8 text-right">
                  {value}
                </span>
              </div>
            );
          })}
        </div>

        {/* 摘要文字 */}
        {payload.summary && (
          <p className="text-xs text-muted-foreground/60 mt-3 pt-2 border-t border-white/5">
            {payload.summary}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
