/**
 * SentimentNLPCard.tsx
 * PrimoGPT 风格的 NLP 情绪分析可视化卡片
 * 展示：情绪极性分数、时间趋势、看多/看空信号、实体识别
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus, Brain, Zap, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid,
} from "recharts";

// ── 类型定义 ──────────────────────────────────────────────────────────────────
interface SentimentTimeSeries {
  date: string;
  score: number;
  label: string;
  articleCount: number;
  topHeadline: string;
}

interface NLPAnalysisResult {
  ticker: string;
  overallScore: number;
  overallLabel: string;
  timeSeries: SentimentTimeSeries[];
  summary: string;
  bullishSignals: string[];
  bearishSignals: string[];
  sentimentMomentum: "improving" | "deteriorating" | "stable";
  analysisTimestamp: number;
}

interface NewsItem {
  title: string;
  description?: string;
  publishedAt: string;
  source?: string;
}

interface SentimentNLPCardProps {
  ticker: string;
  newsItems: NewsItem[];
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────
function getScoreColor(score: number): string {
  if (score > 0.5) return "text-emerald-400";
  if (score > 0.15) return "text-green-400";
  if (score < -0.5) return "text-red-400";
  if (score < -0.15) return "text-orange-400";
  return "text-slate-400";
}

function getScoreBg(score: number): string {
  if (score > 0.5) return "bg-emerald-500/20 border-emerald-500/30";
  if (score > 0.15) return "bg-green-500/20 border-green-500/30";
  if (score < -0.5) return "bg-red-500/20 border-red-500/30";
  if (score < -0.15) return "bg-orange-500/20 border-orange-500/30";
  return "bg-slate-500/20 border-slate-500/30";
}

function getLabelText(label: string): string {
  const map: Record<string, string> = {
    very_bullish: "极度看多",
    bullish: "看多",
    neutral: "中性",
    bearish: "看空",
    very_bearish: "极度看空",
  };
  return map[label] ?? label;
}

function getMomentumIcon(momentum: string) {
  if (momentum === "improving") return <TrendingUp className="w-3 h-3 text-emerald-400" />;
  if (momentum === "deteriorating") return <TrendingDown className="w-3 h-3 text-red-400" />;
  return <Minus className="w-3 h-3 text-slate-400" />;
}

// ── 情绪仪表盘 ────────────────────────────────────────────────────────────────
function SentimentGauge({ score }: { score: number }) {
  const pct = ((score + 1) / 2) * 100; // -1~+1 → 0~100%
  const clampedPct = Math.max(0, Math.min(100, pct));
  const color = score > 0.3 ? "#10b981" : score < -0.3 ? "#ef4444" : "#f59e0b";

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-24 h-12 overflow-hidden">
        {/* 半圆背景 */}
        <div className="absolute inset-0 rounded-t-full border-4 border-white/10" style={{ borderBottomWidth: 0 }} />
        {/* 情绪填充（SVG 弧形） */}
        <svg viewBox="0 0 100 50" className="absolute inset-0 w-full h-full">
          <path
            d="M 5 50 A 45 45 0 0 1 95 50"
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <path
            d="M 5 50 A 45 45 0 0 1 95 50"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${clampedPct * 1.41} 141`}
            opacity={0.85}
          />
          {/* 指针 */}
          <line
            x1="50"
            y1="50"
            x2={50 + 35 * Math.cos(Math.PI * (1 - clampedPct / 100))}
            y2={50 - 35 * Math.sin(Math.PI * (1 - clampedPct / 100))}
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="50" cy="50" r="3" fill={color} />
        </svg>
      </div>
      <span className={cn("text-xl font-bold font-mono", getScoreColor(score))}>
        {score > 0 ? "+" : ""}{score.toFixed(2)}
      </span>
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────────────
export default function SentimentNLPCard({ ticker, newsItems }: SentimentNLPCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [result, setResult] = useState<NLPAnalysisResult | null>(null);

  const analyze = trpc.chat.analyzeNewsSentiment.useMutation({
    onSuccess: (data) => setResult(data as NLPAnalysisResult),
  });

  const handleAnalyze = () => {
    analyze.mutate({ ticker, newsItems: newsItems.slice(0, 15) });
  };

  return (
    <Card className="my-3 border border-blue-500/20 bg-blue-500/5 overflow-hidden">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-blue-400" />
            <CardTitle className="text-sm font-semibold text-foreground/90">
              NLP 情绪分析 — {ticker}
            </CardTitle>
            <Badge variant="outline" className="text-xs px-1.5 py-0 text-blue-400 border-blue-500/30">
              PrimoGPT Pipeline
            </Badge>
            <span className="text-xs text-muted-foreground/50">{newsItems.length} 条新闻</span>
          </div>
          <div className="flex items-center gap-2">
            {!result && (
              <button
                onClick={handleAnalyze}
                disabled={analyze.isPending}
                className="text-xs px-3 py-1 rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors border border-blue-500/30"
              >
                {analyze.isPending ? "分析中..." : "运行 NLP 分析"}
              </button>
            )}
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-3">
        {!result && !analyze.isPending && (
          <div className="text-center py-4 text-muted-foreground/50 text-xs">
            <p>点击「运行 NLP 分析」对 {newsItems.length} 条新闻进行情绪极性评分</p>
            <p className="mt-1 text-muted-foreground/30">基于 PrimoGPT 架构：FinBERT 风格 LLM 情绪分析 + 时间序列趋势</p>
          </div>
        )}

        {analyze.isPending && (
          <div className="text-center py-4 text-blue-400/70 text-xs">
            <div className="flex items-center justify-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-400/50 animate-pulse" />
              <span>正在对 {Math.min(newsItems.length, 15)} 条新闻进行 NLP 情绪评分...</span>
            </div>
          </div>
        )}

        {result && expanded && (
          <div className="space-y-4">
            {/* 综合情绪仪表盘 */}
            <div className="flex items-start gap-4">
              <SentimentGauge score={result.overallScore} />
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={cn("text-xs px-2 py-0.5 border", getScoreBg(result.overallScore))}>
                    {getLabelText(result.overallLabel)}
                  </Badge>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground/60">
                    {getMomentumIcon(result.sentimentMomentum)}
                    <span>
                      {result.sentimentMomentum === "improving" ? "情绪改善" :
                       result.sentimentMomentum === "deteriorating" ? "情绪恶化" : "情绪稳定"}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-foreground/70 leading-relaxed">{result.summary}</p>
              </div>
            </div>

            {/* 情绪时间序列 */}
            {result.timeSeries.length > 1 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground/70 mb-2">情绪趋势（{result.timeSeries.length} 天）</p>
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={result.timeSeries} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 12, fill: "rgba(148,163,184,0.6)" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => v.slice(5)} // MM-DD
                      />
                      <YAxis
                        domain={[-1, 1]}
                        tick={{ fontSize: 12, fill: "rgba(148,163,184,0.6)" }}
                        axisLine={false}
                        tickLine={false}
                        width={28}
                      />
                      <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
                      <ReferenceLine y={0.3} stroke="rgba(16,185,129,0.2)" strokeDasharray="2 4" />
                      <ReferenceLine y={-0.3} stroke="rgba(239,68,68,0.2)" strokeDasharray="2 4" />
                      <Tooltip
                        contentStyle={{ background: "rgba(10,10,20,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: "12px" }}
                        formatter={(v: number) => [v.toFixed(2), "情绪分"]}
                        labelFormatter={(l) => `${l} (${result.timeSeries.find(t => t.date === l)?.articleCount ?? 0} 篇)`}
                      />
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke="#60a5fa"
                        strokeWidth={2}
                        dot={{ r: 3, fill: "#60a5fa" }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* 看多/看空信号 */}
            <div className="grid grid-cols-2 gap-3">
              {result.bullishSignals.length > 0 && (
                <div>
                  <div className="flex items-center gap-1 mb-1.5">
                    <Zap className="w-3 h-3 text-emerald-400" />
                    <span className="text-xs font-medium text-emerald-400">看多催化剂</span>
                  </div>
                  <ul className="space-y-1">
                    {result.bullishSignals.slice(0, 4).map((s, i) => (
                      <li key={i} className="text-xs text-foreground/60 flex items-start gap-1">
                        <span className="text-emerald-400/50 mt-0.5">+</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.bearishSignals.length > 0 && (
                <div>
                  <div className="flex items-center gap-1 mb-1.5">
                    <AlertTriangle className="w-3 h-3 text-red-400" />
                    <span className="text-xs font-medium text-red-400">风险因素</span>
                  </div>
                  <ul className="space-y-1">
                    {result.bearishSignals.slice(0, 4).map((s, i) => (
                      <li key={i} className="text-xs text-foreground/60 flex items-start gap-1">
                        <span className="text-red-400/50 mt-0.5">-</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* 重新分析按钮 */}
            <div className="flex justify-end">
              <button
                onClick={handleAnalyze}
                disabled={analyze.isPending}
                className="text-xs px-2.5 py-1 rounded bg-white/5 text-muted-foreground/60 hover:bg-white/10 hover:text-foreground/70 disabled:opacity-40 transition-colors border border-white/10"
              >
                重新分析
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
