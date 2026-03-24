/**
 * TrendRadarCard - TrendRadar-style hot topic radar visualization
 * Inspired by sansan0/TrendRadar (49.6k stars)
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Radio, TrendingUp, TrendingDown, Minus, RefreshCw, AlertTriangle, Zap, Plus, X as XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface TrendItem {
  title: string;
  source: string;
  url?: string;
  publishedAt?: string;
  relevanceScore: number;
  sentimentScore: number;
  category: string;
  impact: string;
  summary: string;
}

interface MarketPulse {
  overallSentiment: number;
  momentumSignal: "bullish" | "bearish" | "neutral";
  keyRisks: string[];
  keyOpportunities: string[];
  watchlist: string[];
}

interface TrendRadarResult {
  ticker: string;
  scanTime: string;
  hotTopics: TrendItem[];
  marketPulse: MarketPulse;
  aiSummary: string;
}

interface TrendRadarCardProps {
  ticker: string;
  onWatchlistClick?: (symbol: string) => void;
  /** WorldMonitor 联动回写的额外关注资产 */
  extraWatchlist?: string[];
  /** 用户手动添加的 watchlist 标的 */
  userWatchlist?: string[];
  /** 当用户修改 watchlist 时回调 */
  onWatchlistChange?: (list: string[]) => void;
  newsItems: Array<{
    title: string;
    description?: string;
    source?: string;
    url?: string;
    publishedAt?: string;
  }>;
}

const CATEGORY_LABELS: Record<string, string> = {
  earnings: "财报",
  macro: "宏观",
  sector: "板块",
  regulatory: "监管",
  technical: "技术",
  other: "其他",
};

const CATEGORY_COLORS: Record<string, string> = {
  earnings: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  macro: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  sector: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  regulatory: "bg-red-500/20 text-red-300 border-red-500/30",
  technical: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  other: "bg-slate-500/20 text-slate-300 border-slate-500/30",
};

const IMPACT_COLORS: Record<string, string> = {
  high: "text-red-400",
  medium: "text-amber-400",
  low: "text-slate-400",
};

function SentimentBar({ score }: { score: number }) {
  const pct = Math.abs(score);
  const isPositive = score >= 0;
  return (
    <div className="flex items-center gap-1.5 w-full">
      <div className="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isPositive ? "bg-emerald-400" : "bg-red-400"}`}
          style={{ width: `${pct}%`, marginLeft: isPositive ? "50%" : `${50 - pct}%` }}
        />
      </div>
      <span className={`text-[10px] font-medium w-8 text-right ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
        {score > 0 ? "+" : ""}{score}
      </span>
    </div>
  );
}

function PulseGauge({ value, label }: { value: number; label: string }) {
  const color =
    value > 30 ? "text-emerald-400" : value < -30 ? "text-red-400" : "text-amber-400";
  const icon =
    value > 30 ? <TrendingUp className="w-3 h-3" /> :
    value < -30 ? <TrendingDown className="w-3 h-3" /> :
    <Minus className="w-3 h-3" />;
  return (
    <div className="flex flex-col items-center gap-0.5 p-2 rounded-lg bg-muted/20 min-w-[64px]">
      <span className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <div className={`flex items-center gap-0.5 ${color}`}>
        {icon}
        <span className="text-xs font-bold">{value > 0 ? "+" : ""}{value}</span>
      </div>
    </div>
  );
}

export function TrendRadarCard({ ticker, newsItems, onWatchlistClick, extraWatchlist = [], userWatchlist = [], onWatchlistChange }: TrendRadarCardProps) {
  const [result, setResult] = useState<TrendRadarResult | null>(null);
  const [editingWatchlist, setEditingWatchlist] = useState(false);
  const [newSymbolInput, setNewSymbolInput] = useState("");
  const scanMutation = trpc.trendRadar.scan.useMutation({
    onSuccess: (data) => setResult(data as TrendRadarResult),
  });

  const handleScan = () => {
    scanMutation.mutate({ ticker, newsItems, maxItems: 8 });
  };

  const pulse = result?.marketPulse;
  const momentumColor =
    pulse?.momentumSignal === "bullish" ? "text-emerald-400" :
    pulse?.momentumSignal === "bearish" ? "text-red-400" : "text-amber-400";

  return (
    <div className="rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-gradient-to-r from-amber-500/10 to-orange-500/10">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold">TrendRadar 热点雷达</span>
          <span className="text-xs text-muted-foreground">{ticker}</span>
        </div>
        <button
          onClick={handleScan}
          disabled={scanMutation.isPending}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition-colors disabled:opacity-50"
        >
          {scanMutation.isPending ? (
            <RefreshCw className="w-3 h-3 animate-spin" />
          ) : (
            <Zap className="w-3 h-3" />
          )}
          AI 扫描
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Error */}
        {scanMutation.error && (
          <div className="text-xs text-red-400 bg-red-500/10 rounded-lg p-2">
            扫描失败：{scanMutation.error.message}
          </div>
        )}

        {/* Empty state */}
        {!result && !scanMutation.isPending && (
          <div className="text-center py-6 text-muted-foreground">
            <Radio className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs">点击「AI 扫描」获取 {ticker} 最新热点</p>
            <p className="text-[10px] mt-1 opacity-60">{newsItems.length > 0 ? `已有 ${newsItems.length} 条新闻` : "自动获取最新新闻"} · 基于 TrendRadar 框架</p>
          </div>
        )}

        {/* Loading */}
        {scanMutation.isPending && (
          <div className="text-center py-6 text-muted-foreground">
            <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin text-amber-400" />
            <p className="text-xs">AI 正在扫描热点...</p>
          </div>
        )}

        {/* Results */}
        {result && (
          <>
            {/* Market pulse */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">市场脉搏</span>
                <span className={`text-xs font-bold ${momentumColor}`}>
                  {pulse?.momentumSignal === "bullish" ? "看涨" :
                   pulse?.momentumSignal === "bearish" ? "看跌" : "中性"}
                </span>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                <PulseGauge value={pulse?.overallSentiment ?? 0} label="综合" />
              </div>
              {/* AI summary */}
              <div className="text-xs text-muted-foreground bg-muted/20 rounded-lg p-2 leading-relaxed">
                {result.aiSummary}
              </div>
            </div>

            {/* Hot topics */}
            {result.hotTopics.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-medium text-muted-foreground">
                  热点事件 ({result.hotTopics.length})
                </span>
                <div className="space-y-2">
                  {result.hotTopics.map((item, i) => (
                    <div key={i} className="p-2.5 rounded-lg bg-muted/20 border border-border/20 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-medium leading-tight flex-1">{item.title}</span>
                        <span className={`text-[10px] font-bold flex-shrink-0 ${IMPACT_COLORS[item.impact]}`}>
                          {item.impact === "high" ? "⚡高" : item.impact === "medium" ? "●中" : "○低"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${CATEGORY_COLORS[item.category] ?? CATEGORY_COLORS.other}`}>
                          {CATEGORY_LABELS[item.category] ?? item.category}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{item.source}</span>
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          相关度 {item.relevanceScore}
                        </span>
                      </div>
                      <SentimentBar score={item.sentimentScore} />
                      <p className="text-[10px] text-muted-foreground">{item.summary}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Risks & Opportunities */}
            <div className="grid grid-cols-2 gap-3">
              {pulse?.keyRisks && pulse.keyRisks.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-red-400" />
                    <span className="text-[10px] font-medium text-red-400">关键风险</span>
                  </div>
                  {pulse.keyRisks.map((r, i) => (
                    <p key={i} className="text-[10px] text-muted-foreground pl-4">{r}</p>
                  ))}
                </div>
              )}
              {pulse?.keyOpportunities && pulse.keyOpportunities.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-emerald-400" />
                    <span className="text-[10px] font-medium text-emerald-400">潜在机会</span>
                  </div>
                  {pulse.keyOpportunities.map((o, i) => (
                    <p key={i} className="text-[10px] text-muted-foreground pl-4">{o}</p>
                  ))}
                </div>
              )}
            </div>

            {/* Watchlist — 可编辑模式 */}
            {(() => {
              // 合并 AI 扫描的 watchlist + WorldMonitor 回写 + 用户手动添加
              const baseList = pulse?.watchlist ?? [];
              const mergedList = Array.from(new Set([...baseList, ...extraWatchlist, ...userWatchlist]));
              const handleAddSymbol = () => {
                const sym = newSymbolInput.trim().toUpperCase();
                if (!sym) return;
                const newList = Array.from(new Set([...userWatchlist, sym]));
                onWatchlistChange?.(newList);
                setNewSymbolInput("");
              };
              const handleRemoveSymbol = (sym: string) => {
                const newList = userWatchlist.filter(s => s !== sym);
                onWatchlistChange?.(newList);
              };
              return (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-medium" style={{ color: "var(--bloomberg-text-secondary)" }}>WATCHLIST</span>
                    <span className="text-[10px] px-1 rounded" style={{ background: "oklch(0.72 0.18 250 / 0.1)", color: "oklch(0.72 0.18 250)" }}>{mergedList.length}</span>
                    {onWatchlistChange && (
                      <button
                        onClick={() => setEditingWatchlist(e => !e)}
                        className="ml-auto text-[10px] px-1.5 py-0.5 rounded transition-colors"
                        style={{ color: editingWatchlist ? "var(--bloomberg-gold)" : "var(--bloomberg-text-dim)", background: editingWatchlist ? "oklch(0.72 0.18 75 / 0.1)" : "transparent", border: "1px solid var(--bloomberg-border-dim)" }}
                      >
                        {editingWatchlist ? "完成" : "编辑"}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {mergedList.map((sym) => {
                      const isFromWorldMonitor = extraWatchlist.includes(sym) && !baseList.includes(sym) && !userWatchlist.includes(sym);
                      const isUserAdded = userWatchlist.includes(sym);
                      return (
                        <div key={sym} className="flex items-center gap-0.5">
                          <button
                            onClick={() => onWatchlistClick?.(sym)}
                            className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded border transition-colors",
                              isFromWorldMonitor
                                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/40"
                                : isUserAdded
                                ? "bg-amber-500/20 text-amber-300 border-amber-500/30 hover:bg-amber-500/40"
                                : "bg-blue-500/20 text-blue-300 border-blue-500/30",
                              onWatchlistClick && "hover:border-opacity-80 cursor-pointer"
                            )}
                            title={isFromWorldMonitor ? `WorldMonitor — ${sym}` : isUserAdded ? `手动添加 — ${sym}` : (onWatchlistClick ? `查看 ${sym}` : undefined)}
                          >
                            {sym}
                            {isFromWorldMonitor && <span className="ml-0.5 text-emerald-400 opacity-80">★</span>}
                            {isUserAdded && <span className="ml-0.5 text-amber-400 opacity-80">+</span>}
                            {!isFromWorldMonitor && !isUserAdded && onWatchlistClick && <span className="ml-0.5 opacity-60">↗</span>}
                          </button>
                          {editingWatchlist && (isUserAdded || isFromWorldMonitor) && (
                            <button
                              onClick={() => handleRemoveSymbol(sym)}
                              className="w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors hover:bg-red-500/20"
                              style={{ color: "oklch(0.65 0.18 25)" }}
                            >
                              <XIcon className="w-2 h-2" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {editingWatchlist && onWatchlistChange && (
                      <div className="flex items-center gap-1">
                        <input
                          value={newSymbolInput}
                          onChange={e => setNewSymbolInput(e.target.value.toUpperCase())}
                          onKeyDown={e => { if (e.key === "Enter") handleAddSymbol(); if (e.key === "Escape") setEditingWatchlist(false); }}
                          placeholder="AAPL"
                          className="w-16 text-[10px] px-1.5 py-0.5 rounded border outline-none"
                          style={{ background: "var(--bloomberg-surface-2)", border: "1px solid var(--bloomberg-border)", color: "var(--bloomberg-text-primary)", caretColor: "var(--bloomberg-gold)" }}
                          autoFocus
                        />
                        <button
                          onClick={handleAddSymbol}
                          className="w-5 h-5 rounded flex items-center justify-center transition-colors"
                          style={{ background: "oklch(0.72 0.18 250 / 0.15)", color: "oklch(0.72 0.18 250)", border: "1px solid oklch(0.72 0.18 250 / 0.3)" }}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                  {(extraWatchlist.length > 0 || userWatchlist.length > 0) && (
                    <p className="text-[10px]" style={{ color: "oklch(40% 0 0)" }}>
                      {extraWatchlist.length > 0 && "★ WorldMonitor  "}
                      {userWatchlist.length > 0 && "+ 手动添加"}
                    </p>
                  )}
                </div>
              );
            })()}

            <div className="text-[10px] text-muted-foreground/50 text-right">
              扫描时间: {new Date(result.scanTime).toLocaleTimeString()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
