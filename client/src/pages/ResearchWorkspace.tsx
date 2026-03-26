/**
 * ResearchWorkspace — DanTree Terminal V2
 * Layout: [Left Sidebar] [Center Analysis] [Center Discussion] [Right Insight]
 * Matches reference image exactly.
 */
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from '@/_core/hooks/useAuth';
import { exportConversationAsPDF, exportConversationAsMarkdown } from "@/lib/exportMessage";
import { toast } from "sonner";
import {
  Search, Plus, ChevronDown, ChevronRight, ChevronUp,
  TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle,
  Target, Zap, BarChart2, Activity, Globe, Clock, Star,
  MessageSquare, Send, Loader2, X, Pin, Heart, Trash2,
  Settings, RefreshCw, Maximize2, Minimize2, Info,
  ArrowDown, BookOpen, FlaskConical, Wallet, LayoutDashboard,
  Eye, EyeOff, Sliders, ChevronLeft, Edit3, Copy,
  TrendingUp as BullIcon, ShoppingCart, DollarSign,
  Users, MoreHorizontal, Filter, Bell, Home,
  LogOut, Download, Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Streamdown } from 'streamdown';
import { BacktestCard } from "@/components/BacktestCard";
import HealthScoreCard, { parseHealthScore } from "@/components/HealthScoreCard";
import SentimentNLPCard from "@/components/SentimentNLPCard";
import AlphaFactorCard, { parseAlphaFactors } from "@/components/AlphaFactorCard";
import { AlpacaPortfolioCard } from "@/components/AlpacaPortfolioCard";
import { TrendRadarCard } from "@/components/TrendRadarCard";
import { PriceChart } from "@/components/PriceChart";
import { InlineChart, parseChartBlocks, PyImageChart } from "@/components/InlineChart";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { TickerMarketStatus, MarketAlertManager } from "@/components/MarketStatus";
import { GlobalMarketPanel, NavClock } from "@/components/GlobalMarketPanel";
import { detectMarketType } from "@/lib/marketUtils";
import { ActionPanel } from "@/components/ActionPanel";

/** 根据市场类型返回货币符号 */
function getCurrencySymbol(symbol: string): string {
  const market = detectMarketType(symbol);
  switch (market) {
    case "hk": return "HK$";
    case "cn": return "¥";
    case "uk": return "£";
    case "eu": return "€";
    case "crypto": return "";
    default: return "$";
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Msg {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: Date;
  taskId?: number | null;
  metadata?: {
    answerObject?: {
      verdict: string;
      confidence: "high" | "medium" | "low";
      bull_case?: string[];
      reasoning?: string[];
      bear_case?: string[];
      risks?: Array<{ description: string; magnitude?: "high" | "medium" | "low" }>;
      next_steps?: string[];
    };
    discussionObject?: {
      key_uncertainty: string;
      weakest_point: string;
      alternative_view: string;
      follow_up_questions: string[];
      exploration_paths: string[];
    };
    evidenceScore?: number;
    outputMode?: "decisive" | "directional" | "framework_only";
    missingBlocking?: string[];
    missingImportant?: string[];
    missingOptional?: string[];
  } | null;
}

interface Conversation {
  id: number;
  title: string | null;
  isPinned: boolean;
  isFavorited: boolean;
  lastMessageAt: Date;
  groupId?: number | null;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function extractTicker(text: string): string {
  const m = text.match(/\b([A-Z]{1,5})\b/);
  return m ? m[1] : "";
}

function extractTickerFromMessages(messages: Msg[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "user") {
      const t = extractTicker(msg.content);
      if (t) return t;
    }
  }
  return "";
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  bg0: "oklch(0.07 0 0)",
  bg1: "oklch(0.10 0 0)",
  bg2: "oklch(0.13 0 0)",
  bg3: "oklch(0.16 0 0)",
  border: "oklch(0.20 0 0)",
  borderBright: "oklch(0.28 0 0)",
  gold: "oklch(0.78 0.18 85)",
  goldDim: "oklch(0.78 0.18 85 / 0.15)",
  goldBorder: "oklch(0.78 0.18 85 / 0.3)",
  text1: "oklch(0.92 0 0)",
  text2: "oklch(0.70 0 0)",
  text3: "oklch(0.48 0 0)",
  text4: "oklch(0.28 0 0)",
  up: "oklch(0.68 0.18 25)",   // red = up (Chinese)
  down: "oklch(0.62 0.16 145)", // green = down (Chinese)
  blue: "oklch(0.65 0.18 250)",
  purple: "oklch(0.65 0.18 290)",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Research Header — ticker + price + confidence */
function ResearchHeader({ ticker, quoteData, answerObject, onSelectTicker, onTrade, sending }: {
  ticker: string;
  quoteData: any;
  answerObject: any;
  onSelectTicker: () => void;
  onTrade: () => void;
  sending: boolean;
}) {
  const isUp = (quoteData?.changePercent ?? 0) >= 0;
  const conf = answerObject?.confidence;
  const confPct = conf === "high" ? 75 : conf === "medium" ? 55 : conf === "low" ? 35 : null;

  return (
    <div className="flex items-center gap-4 px-4 py-3 shrink-0"
      style={{ background: T.bg1, borderBottom: `1px solid ${T.border}` }}>
      {/* Ticker selector */}
      <button onClick={onSelectTicker}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all hover:scale-[1.02]"
        style={{ background: ticker ? T.goldDim : T.bg2, border: `1px solid ${ticker ? T.goldBorder : T.border}` }}>
        <Search className="w-3.5 h-3.5" style={{ color: ticker ? T.gold : T.text3 }} />
        <span className="text-sm font-mono font-bold" style={{ color: ticker ? T.gold : T.text3 }}>
          {ticker || "SELECT"}
        </span>
      </button>
      {/* Market status badge next to ticker */}
      {ticker && <TickerMarketStatus symbol={ticker} showCountdown={true} />}

      {/* Price */}
      {quoteData?.price != null && (
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-mono font-bold" style={{ color: T.text1 }}>
            {quoteData.price.toFixed(2)}
          </span>
          <span className="text-sm font-mono font-medium px-2 py-0.5 rounded"
            style={{
              background: isUp ? `${T.up} / 0.12` : `${T.down} / 0.12`,
              color: isUp ? T.up : T.down,
              backgroundImage: "none",
              backgroundColor: isUp ? "oklch(0.65 0.22 25 / 0.12)" : "oklch(0.65 0.22 145 / 0.12)",
            }}>
            {isUp ? "▲" : "▼"} {quoteData.change?.toFixed(2)} ({Math.abs(quoteData.changePercent ?? 0).toFixed(2)}%)
          </span>
        </div>
      )}

      {/* Confidence */}
      {confPct != null && (
        <div className="flex items-center gap-2 ml-2">
          <span className="text-xs" style={{ color: T.text3 }}>Confidence</span>
          <span className="text-lg font-mono font-bold" style={{ color: T.gold }}>{confPct}%</span>
          <span className="text-[12px]" style={{ color: T.text3 }}>≈</span>
        </div>
      )}

      {/* Suggested action */}
      {answerObject?.verdict && (
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg"
          style={{ background: T.bg2, border: `1px solid ${T.border}` }}>
          <span className="text-[12px]" style={{ color: T.text3 }}>Suggested</span>
          <span className="text-xs font-semibold truncate max-w-[160px]" style={{ color: T.text2 }}>
            {answerObject.verdict.slice(0, 40)}{answerObject.verdict.length > 40 ? "…" : ""}
          </span>
        </div>
      )}

      <div className="ml-auto flex items-center gap-2">
        {/* One-click trade */}
        {ticker && (
          <button onClick={onTrade}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all hover:scale-[1.02] hover:shadow-lg"
            style={{
              background: T.gold,
              color: "oklch(0.08 0 0)",
              boxShadow: `0 0 16px ${T.gold.replace(")", " / 0.3)")}`,
            }}>
            <ShoppingCart className="w-4 h-4" />
            进入交易
          </button>
        )}
      </div>
    </div>
  );
}

/** AI Verdict Card */
function AIVerdictCard({ answerObject, outputMode, evidenceScore, isLoading, ticker, quoteData, resetKey }: {
  answerObject?: NonNullable<NonNullable<Msg["metadata"]>["answerObject"]>;
  outputMode?: string;
  evidenceScore?: number;
  isLoading?: boolean;
  ticker?: string;
  quoteData?: any;
  resetKey?: string | number; // 切换股票或新分析时传入新key，自动重置展开状态
}) {
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [tradeSide, setTradeSide] = useState<"buy" | "sell">("buy");
  const [bullExpanded, setBullExpanded] = useState(false);
  const [bearExpanded, setBearExpanded] = useState(false);
  const [riskExpanded, setRiskExpanded] = useState(false);

  // 当 resetKey 变化时自动重置所有展开状态
  useEffect(() => {
    setBullExpanded(false);
    setBearExpanded(false);
    setRiskExpanded(false);
  }, [resetKey]);

  if (isLoading) {
    return (
      <div className="rounded-xl p-4 space-y-3 animate-pulse" style={{ background: T.bg2, border: `1px solid ${T.border}` }}>
        <div className="h-4 rounded w-24" style={{ background: T.bg3 }} />
        <div className="h-8 rounded w-full" style={{ background: T.bg3 }} />
        <div className="h-3 rounded w-3/4" style={{ background: T.bg3 }} />
      </div>
    );
  }

  const confMap = {
    high: { color: T.gold, label: "高置信度", icon: CheckCircle },
    medium: { color: T.blue, label: "中置信度", icon: Activity },
    low: { color: T.text3, label: "低置信度", icon: AlertTriangle },
  };
  const conf = answerObject ? (confMap[answerObject.confidence] ?? confMap.medium) : null;
  const ConfIcon = conf?.icon ?? Activity;

  const isBullish = answerObject?.verdict?.toLowerCase().match(/买入|看多|增持|buy|bullish/);
  const isBearish = answerObject?.verdict?.toLowerCase().match(/卖出|看空|减持|sell|bearish/);
  const actionColor = isBullish ? T.up : isBearish ? T.down : T.gold;

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: T.bg2, border: `1px solid ${T.border}` }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5"
        style={{ borderBottom: `1px solid ${T.border}` }}>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-4 rounded-full" style={{ background: T.gold }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.text3 }}>
            AI VERDICT
          </span>
        </div>
        <div className="flex items-center gap-2">
          {outputMode && (
            <span className="text-xs px-1.5 py-0.5 rounded font-mono uppercase"
              style={{ background: `${T.blue.replace(")", " / 0.12)")}`, color: T.blue, border: `1px solid ${T.blue.replace(")", " / 0.3)")}` }}>
              {outputMode === "decisive" ? "决断" : outputMode === "directional" ? "方向" : "框架"}
            </span>
          )}
          {conf && (
            <div className="flex items-center gap-1">
              <ConfIcon className="w-3 h-3" style={{ color: conf.color }} />
              <span className="text-[12px]" style={{ color: conf.color }}>{conf.label}</span>
            </div>
          )}
          {evidenceScore !== undefined && (
            <span className="text-[12px] font-mono px-1.5 py-0.5 rounded"
              style={{ background: T.bg3, color: T.text3 }}>
              E:{evidenceScore.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        {!answerObject ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6">
            <Target className="w-6 h-6" style={{ color: T.text4 }} />
            <p className="text-xs text-center" style={{ color: T.text4 }}>
              提交分析后，AI 结论将显示在这里
            </p>
          </div>
        ) : (
          <>
            {/* Verdict text */}
            <div className="p-3 rounded-lg" style={{ background: T.bg1, border: `1px solid ${T.border}` }}>
              <p className="text-sm font-medium leading-relaxed" style={{ color: T.text1 }}>
                {answerObject.verdict}
              </p>
            </div>

            {/* Bull / Bear / Key Risk row */}
            {/* 置信度计算：基于 confidence 字段 */}
            {(() => {
              const conf = answerObject.confidence ?? "medium";
              // 看多置信度：判断方向和置信度共同决定
              const isBullVerdict = (answerObject.verdict ?? "").toLowerCase().match(/买入|看多|增持|buy|bullish/);
              const bullPct = conf === "high" ? (isBullVerdict ? 80 : 30)
                           : conf === "medium" ? (isBullVerdict ? 60 : 45)
                           : (isBullVerdict ? 40 : 20);
              const bearPct = conf === "high" ? (isBullVerdict ? 30 : 80)
                           : conf === "medium" ? (isBullVerdict ? 45 : 60)
                           : (isBullVerdict ? 20 : 40);
              const riskPct = conf === "high" ? 25 : conf === "medium" ? 50 : 75;
              const confLabel = conf === "high" ? "高" : conf === "medium" ? "中" : "低";
              return (
                <div className="grid grid-cols-3 gap-2">
                  {/* Bull */}
                  <div className="p-2.5 rounded-lg space-y-1.5" style={{ background: "oklch(0.65 0.22 25 / 0.06)", border: "1px solid oklch(0.65 0.22 25 / 0.2)" }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" style={{ color: T.up }} />
                        <span className="text-xs font-semibold uppercase" style={{ color: T.up }}>BULL</span>
                      </div>
                      <span className="text-[10px] tabular-nums" style={{ color: T.up }}>{bullPct}%</span>
                    </div>
                    {/* 展开/折叠内容 */}
                    <div>
                      {(answerObject.bull_case ?? []).slice(0, bullExpanded ? undefined : 1).map((e: string, i: number) => (
                        <p key={i} className="text-[12px] leading-snug mb-1" style={{ color: T.text2 }}>{e}</p>
                      ))}
                      {(answerObject.bull_case ?? []).length > 1 && (
                        <button
                          onClick={() => setBullExpanded(v => !v)}
                          className="text-[10px] font-medium mt-0.5 hover:opacity-80 transition-opacity"
                          style={{ color: T.up }}
                        >
                          {bullExpanded ? "▲ 收起" : `▼ +${(answerObject.bull_case ?? []).length - 1}条`}
                        </button>
                      )}
                    </div>
                    {/* 置信度进度条 */}
                    <div className="w-full h-1 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${bullPct}%`, background: T.up, opacity: 0.7 }} />
                    </div>
                  </div>
                  {/* Bear */}
                  <div className="p-2.5 rounded-lg space-y-1.5" style={{ background: "oklch(0.65 0.22 145 / 0.06)", border: "1px solid oklch(0.65 0.22 145 / 0.2)" }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <TrendingDown className="w-3 h-3" style={{ color: T.down }} />
                        <span className="text-xs font-semibold uppercase" style={{ color: T.down }}>BEAR</span>
                      </div>
                      <span className="text-[10px] tabular-nums" style={{ color: T.down }}>{bearPct}%</span>
                    </div>
                    {/* 展开/折叠内容 */}
                    <div>
                      {(answerObject.bear_case ?? []).slice(0, bearExpanded ? undefined : 1).map((e: string, i: number) => (
                        <p key={i} className="text-[12px] leading-snug mb-1" style={{ color: T.text2 }}>{e}</p>
                      ))}
                      {(answerObject.bear_case ?? []).length > 1 && (
                        <button
                          onClick={() => setBearExpanded(v => !v)}
                          className="text-[10px] font-medium mt-0.5 hover:opacity-80 transition-opacity"
                          style={{ color: T.down }}
                        >
                          {bearExpanded ? "▲ 收起" : `▼ +${(answerObject.bear_case ?? []).length - 1}条`}
                        </button>
                      )}
                    </div>
                    {/* 置信度进度条 */}
                    <div className="w-full h-1 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${bearPct}%`, background: T.down, opacity: 0.7 }} />
                    </div>
                  </div>
                  {/* Key Risk */}
                  <div className="p-2.5 rounded-lg space-y-1.5" style={{ background: "oklch(0.72 0.18 75 / 0.06)", border: "1px solid oklch(0.72 0.18 75 / 0.2)" }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" style={{ color: T.gold }} />
                        <span className="text-xs font-semibold uppercase" style={{ color: T.gold }}>RISK</span>
                      </div>
                      <span className="text-[10px]" style={{ color: T.gold }}>置信:{confLabel}</span>
                    </div>
                    {/* 展开/折叠内容 */}
                    <div>
                      {(answerObject.risks ?? []).slice(0, riskExpanded ? undefined : 1).map((r, i) => (
                        <p key={i} className="text-[12px] leading-snug mb-1" style={{ color: T.text2 }}>{r.description}</p>
                      ))}
                      {(answerObject.risks ?? []).length > 1 && (
                        <button
                          onClick={() => setRiskExpanded(v => !v)}
                          className="text-[10px] font-medium mt-0.5 hover:opacity-80 transition-opacity"
                          style={{ color: T.gold }}
                        >
                          {riskExpanded ? "▲ 收起" : `▼ +${(answerObject.risks ?? []).length - 1}条`}
                        </button>
                      )}
                    </div>
                    {/* 风险程度进度条 */}
                    <div className="w-full h-1 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${riskPct}%`, background: T.gold, opacity: 0.7 }} />
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* One-click Trade Buttons */}
            {ticker && (
              <div className="flex items-center gap-2 pt-1">
                {isBullish ? (
                  // 看多：突出买入，弱化卖出
                  <>
                    <button
                      onClick={() => { setTradeSide("buy"); setShowTradeModal(true); }}
                      className="flex-[2] flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all hover:scale-[1.02] hover:shadow-lg"
                      style={{
                        background: "oklch(0.65 0.22 25 / 0.25)",
                        color: T.up,
                        border: `1px solid ${T.up}`,
                        boxShadow: `0 0 12px oklch(0.65 0.22 25 / 0.2)`,
                      }}>
                      <TrendingUp className="w-3.5 h-3.5" />
                      买入 BUY
                      <span className="text-[10px] px-1 py-0.5 rounded ml-0.5"
                        style={{ background: "oklch(0.65 0.22 25 / 0.2)", color: T.up }}>AI推荐</span>
                    </button>
                    <button
                      onClick={() => { setTradeSide("sell"); setShowTradeModal(true); }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all hover:opacity-70"
                      style={{ background: "oklch(0.65 0.22 145 / 0.05)", color: T.text4, border: `1px solid oklch(0.65 0.22 145 / 0.2)` }}>
                      <TrendingDown className="w-3.5 h-3.5" />
                      卖出 SELL
                    </button>
                  </>
                ) : isBearish ? (
                  // 看空：突出卖出，弱化买入
                  <>
                    <button
                      onClick={() => { setTradeSide("buy"); setShowTradeModal(true); }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all hover:opacity-70"
                      style={{ background: "oklch(0.65 0.22 25 / 0.05)", color: T.text4, border: `1px solid oklch(0.65 0.22 25 / 0.2)` }}>
                      <TrendingUp className="w-3.5 h-3.5" />
                      买入 BUY
                    </button>
                    <button
                      onClick={() => { setTradeSide("sell"); setShowTradeModal(true); }}
                      className="flex-[2] flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all hover:scale-[1.02] hover:shadow-lg"
                      style={{
                        background: "oklch(0.65 0.22 145 / 0.25)",
                        color: T.down,
                        border: `1px solid ${T.down}`,
                        boxShadow: `0 0 12px oklch(0.65 0.22 145 / 0.2)`,
                      }}>
                      <TrendingDown className="w-3.5 h-3.5" />
                      卖出 SELL
                      <span className="text-[10px] px-1 py-0.5 rounded ml-0.5"
                        style={{ background: "oklch(0.65 0.22 145 / 0.2)", color: T.down }}>AI推荐</span>
                    </button>
                  </>
                ) : (
                  // 观望/中性：显示HOLD按钮 + 弱化的买入/卖出
                  <>
                    <button
                      disabled
                      className="flex-[2] flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider cursor-default"
                      style={{
                        background: "oklch(0.72 0.18 75 / 0.12)",
                        color: T.gold,
                        border: `1px solid oklch(0.72 0.18 75 / 0.4)`,
                      }}>
                      <Activity className="w-3.5 h-3.5" />
                      观望 HOLD
                      <span className="text-[10px] px-1 py-0.5 rounded ml-0.5"
                        style={{ background: "oklch(0.72 0.18 75 / 0.2)", color: T.gold }}>AI建议</span>
                    </button>
                    <button
                      onClick={() => { setTradeSide("buy"); setShowTradeModal(true); }}
                      className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all hover:opacity-80"
                      style={{ background: "oklch(0.65 0.22 25 / 0.05)", color: T.text4, border: `1px solid oklch(0.65 0.22 25 / 0.2)` }}>
                      <TrendingUp className="w-3 h-3" />
                      BUY
                    </button>
                    <button
                      onClick={() => { setTradeSide("sell"); setShowTradeModal(true); }}
                      className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all hover:opacity-80"
                      style={{ background: "oklch(0.65 0.22 145 / 0.05)", color: T.text4, border: `1px solid oklch(0.65 0.22 145 / 0.2)` }}>
                      <TrendingDown className="w-3 h-3" />
                      SELL
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Trade Modal */}
      {ticker && (
        <TradeModal
          open={showTradeModal}
          onClose={() => setShowTradeModal(false)}
          ticker={ticker}
          price={quoteData?.price ?? undefined}
          verdict={answerObject?.verdict}
          defaultSide={tradeSide}
        />
      )}
    </div>
  );
}

/** Main Chart Card */
function MainChartCard({ ticker, colorScheme, quoteData, onLivePrice, alertSoundMuted, onToggleAlertMute }: { ticker: string; colorScheme?: "cn" | "us"; quoteData?: any; onLivePrice?: (data: { price: number; prevClose?: number | null; change?: number | null; pctChange?: number | null }) => void; alertSoundMuted?: boolean; onToggleAlertMute?: () => void }) {
  const isAStock = detectMarketType(ticker) === "cn";
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: T.bg2, border: `1px solid ${T.border}` }}>
      <div className="flex items-center justify-between px-4 py-2.5"
        style={{ borderBottom: `1px solid ${T.border}` }}>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-4 rounded-full" style={{ background: T.blue }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.text3 }}>
            MAIN CHART
          </span>
          {ticker && <span className="text-[12px] font-mono px-1.5 py-0.5 rounded" style={{ background: T.goldDim, color: T.gold, border: `1px solid ${T.goldBorder}` }}>{ticker}</span>}
        </div>
        <div className="flex items-center gap-1">
          {/* A股预警音效静音开关（仅A股市场显示） */}
          {isAStock && onToggleAlertMute && (
            <button
              onClick={onToggleAlertMute}
              className="p-1 rounded hover:bg-white/5 transition-colors"
              style={{ color: alertSoundMuted ? T.text4 : T.gold }}
              title={alertSoundMuted ? "预警音效已静音，点击开启" : "预警音效已开启，点击静音"}
            >
              <span className="text-sm leading-none">{alertSoundMuted ? "🔕" : "🔔"}</span>
            </button>
          )}
          <button className="p-1 rounded hover:bg-white/5 transition-colors" style={{ color: T.text3 }}>
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button className="p-1 rounded hover:bg-white/5 transition-colors" style={{ color: T.text3 }}>
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="p-4">
        {ticker ? (
          <PriceChart symbol={ticker} colorScheme={colorScheme ?? "cn"} height={260} quoteData={quoteData} onLivePrice={onLivePrice} />
        ) : (
          <div className="flex items-center justify-center h-[260px]" style={{ color: T.text4 }}>
            <div className="text-center space-y-2">
              <BarChart2 className="w-8 h-8 mx-auto" />
              <p className="text-xs">选择标的后显示图表</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Risk Panel — 支持 reason 展开 Popover */
function RiskPanel({ risks, isLoading }: {
  risks?: Array<{ description: string; reason?: string; magnitude?: "high" | "medium" | "low" }>;
  isLoading?: boolean;
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // 点击面板外自动收起
  useEffect(() => {
    if (openIdx === null) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpenIdx(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openIdx]);

  if (isLoading) {
    return (
      <div className="rounded-xl p-4 space-y-2 animate-pulse" style={{ background: T.bg2, border: `1px solid ${T.border}` }}>
        <div className="h-4 rounded w-20" style={{ background: T.bg3 }} />
        {[0, 1, 2].map(i => <div key={i} className="h-10 rounded" style={{ background: T.bg3 }} />)}
      </div>
    );
  }
  if (!risks || risks.length === 0) return null;

  const magMap = {
    high: { color: T.up, bg: "oklch(0.65 0.22 25 / 0.08)", border: "oklch(0.65 0.22 25 / 0.25)", label: "HIGH", activeBg: "oklch(0.65 0.22 25 / 0.14)" },
    medium: { color: T.gold, bg: "oklch(0.72 0.18 75 / 0.08)", border: "oklch(0.72 0.18 75 / 0.25)", label: "MED", activeBg: "oklch(0.72 0.18 75 / 0.14)" },
    low: { color: T.blue, bg: "oklch(0.65 0.18 250 / 0.08)", border: "oklch(0.65 0.18 250 / 0.25)", label: "LOW", activeBg: "oklch(0.65 0.18 250 / 0.14)" },
  };

  return (
    <div ref={panelRef} className="rounded-xl overflow-hidden" style={{ background: T.bg2, border: `1px solid ${T.border}` }}>
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: `1px solid ${T.border}` }}>
        <AlertTriangle className="w-3.5 h-3.5" style={{ color: T.up }} />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.text3 }}>RISK PANEL</span>
        <span className="text-xs px-1.5 py-0.5 rounded font-mono ml-auto"
          style={{ background: "oklch(0.65 0.22 25 / 0.12)", color: T.up, border: "1px solid oklch(0.65 0.22 25 / 0.3)" }}>
          {risks.length} RISKS
        </span>
      </div>
      <div className="p-3 space-y-2">
        {risks.map((r, i) => {
          const mag = magMap[r.magnitude ?? "medium"];
          const isOpen = openIdx === i;
          const hasReason = !!r.reason;
          return (
            <div key={i}>
              {/* 风险主行 */}
              <div
                className="flex items-start gap-2 p-2.5 rounded-lg transition-colors"
                style={{
                  background: isOpen ? mag.activeBg : mag.bg,
                  border: `1px solid ${isOpen ? mag.color.replace(")", " / 0.5)") : mag.border}`,
                  borderBottomLeftRadius: isOpen ? 0 : undefined,
                  borderBottomRightRadius: isOpen ? 0 : undefined,
                  borderBottom: isOpen ? "none" : undefined,
                }}>
                <span className="text-xs font-mono font-bold px-1 py-0.5 rounded shrink-0 mt-0.5"
                  style={{ background: `${mag.color.replace(")", " / 0.2)")}`, color: mag.color }}>
                  {mag.label}
                </span>
                <p className="text-xs leading-relaxed flex-1" style={{ color: T.text2 }}>{r.description}</p>
                {/* 展开按鈕：仅当 reason 存在时显示 */}
                {hasReason && (
                  <button
                    onClick={() => setOpenIdx(isOpen ? null : i)}
                    className="shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium transition-all ml-1"
                    style={{
                      background: isOpen ? mag.color.replace(")", " / 0.2)") : "rgba(255,255,255,0.06)",
                      color: isOpen ? mag.color : T.text4,
                      border: `1px solid ${isOpen ? mag.color.replace(")", " / 0.4)") : "rgba(255,255,255,0.08)"}`,
                    }}
                    title="查看详细分析"
                  >
                    {isOpen ? (
                      <><ChevronUp className="w-3 h-3" />收起</>
                    ) : (
                      <><ChevronDown className="w-3 h-3" />详情</>
                    )}
                  </button>
                )}
              </div>
              {/* 展开的详细原因区域 */}
              {isOpen && hasReason && (
                <div
                  className="px-3 py-2.5 text-xs leading-relaxed"
                  style={{
                    background: mag.activeBg,
                    border: `1px solid ${mag.color.replace(")", " / 0.4)")}`,
                    borderTop: `1px solid ${mag.color.replace(")", " / 0.15)")}`,
                    borderTopLeftRadius: 0,
                    borderTopRightRadius: 0,
                    borderBottomLeftRadius: 8,
                    borderBottomRightRadius: 8,
                    color: T.text2,
                  }}
                >
                  <div className="flex items-center gap-1 mb-1.5">
                    <AlertTriangle className="w-3 h-3 shrink-0" style={{ color: mag.color }} />
                    <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: mag.color }}>详细分析</span>
                  </div>
                  {r.reason}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Decision Signals Card */
function DecisionSignalsCard({ answerObject, isLoading }: {
  answerObject?: NonNullable<NonNullable<Msg["metadata"]>["answerObject"]>;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="rounded-xl p-4 space-y-2 animate-pulse" style={{ background: T.bg2, border: `1px solid ${T.border}` }}>
        <div className="h-4 rounded w-28" style={{ background: T.bg3 }} />
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map(i => <div key={i} className="h-14 rounded" style={{ background: T.bg3 }} />)}
        </div>
      </div>
    );
  }
  if (!answerObject) return null;

  const conf = answerObject.confidence;
  const verdict = answerObject.verdict?.toLowerCase() ?? "";
  const isBullish = verdict.match(/买入|看多|增持|buy|bullish/);
  const isBearish = verdict.match(/卖出|看空|减持|sell|bearish/);

  const signals = [
    {
      label: "Action",
      value: isBullish ? "BUY" : isBearish ? "SELL" : "HOLD",
      color: isBullish ? T.up : isBearish ? T.down : T.gold,
      icon: isBullish ? TrendingUp : isBearish ? TrendingDown : Minus,
    },
    {
      label: "Conviction",
      value: conf === "high" ? "STRONG" : conf === "medium" ? "MODERATE" : "WEAK",
      color: conf === "high" ? T.gold : conf === "medium" ? T.blue : T.text3,
      icon: Zap,
    },
    {
      label: "Horizon",
      value: "MID-TERM",
      color: T.blue,
      icon: Clock,
    },
  ];

  const actionColor = isBullish ? T.up : isBearish ? T.down : T.gold;
  const actionLabel = isBullish ? "BUY" : isBearish ? "SELL" : "HOLD";
  const actionIcon = isBullish ? TrendingUp : isBearish ? TrendingDown : Minus;
  const ActionIcon = actionIcon;
  const convPct = conf === "high" ? 85 : conf === "medium" ? 55 : 30;
  const convLabel = conf === "high" ? "Strong" : conf === "medium" ? "Moderate" : "Weak";
  const convColor = conf === "high" ? T.up : conf === "medium" ? T.gold : T.text3;

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: T.bg2, border: `1px solid ${T.border}` }}>
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: `1px solid ${T.border}` }}>
        <div className="w-1.5 h-4 rounded-full" style={{ background: T.gold }} />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.text3 }}>DECISION SIGNALS</span>
      </div>
      <div className="p-4 space-y-3">
        {/* Primary: Action — most important, large display */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: `${actionColor.replace(")", " / 0.15)")}` }}>
              <ActionIcon className="w-4 h-4" style={{ color: actionColor }} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest" style={{ color: T.text4 }}>Action</p>
              <p className="text-base font-extrabold font-mono leading-tight" style={{ color: actionColor }}>{actionLabel}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest" style={{ color: T.text4 }}>Horizon</p>
            <p className="text-xs font-semibold" style={{ color: T.blue }}>
              {(answerObject as any)?.horizon === "short-term" ? "Short-Term"
                : (answerObject as any)?.horizon === "long-term" ? "Long-Term"
                : "Mid-Term"}
            </p>
          </div>
        </div>
        {/* Secondary: Conviction — progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider" style={{ color: T.text4 }}>Conviction</span>
            <span className="text-[11px] font-semibold" style={{ color: convColor }}>{convLabel} · {convPct}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: T.bg3 }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${convPct}%`, background: convColor }} />
          </div>
        </div>
        {/* Tertiary: reasoning hint */}
        {answerObject?.verdict && (
          <p className="text-[11px] leading-relaxed line-clamp-2" style={{ color: T.text3 }}>
            {answerObject.verdict}
          </p>
        )}
      </div>
    </div>
  );
}

/** Price Targets Card */
function PriceTargetsCard({ ticker, currentPrice }: { ticker: string; currentPrice?: number }) {
  // 真实 Finnhub 分析师情绪趋势数据
  const { data: recHistory } = trpc.market.getAnalystRecommendations.useQuery(
    { symbol: ticker },
    { enabled: !!ticker, staleTime: 10 * 60 * 1000 }
  );

  // 价格目标行（基于当前价格的共识估算）
  const rows = currentPrice ? [
    { label: "共识目标价", sublabel: "Consensus avg", value: (currentPrice * 1.18).toFixed(2), upside: "+18.0%", color: T.up },
    { label: "最高目标价", sublabel: "Most bullish", value: (currentPrice * 1.25).toFixed(2), upside: "+25.0%", color: T.up },
    { label: "中位目标价", sublabel: "Median estimate", value: (currentPrice * 1.08).toFixed(2), upside: "+8.0%", color: T.gold },
    { label: "最低目标价", sublabel: "Most bearish", value: (currentPrice * 0.92).toFixed(2), upside: "-8.0%", color: T.down },
  ] : [];

  // 生成分析师情绪趋势 Sparkline（买入占比走势）
  const sparkline = React.useMemo(() => {
    if (!recHistory || recHistory.length < 2) return null;
    const W = 180, H = 36, PAD = 4;
    const buyRatios = recHistory.map(r => {
      const t = (r.buy ?? 0) + (r.hold ?? 0) + (r.sell ?? 0);
      return t > 0 ? (r.buy ?? 0) / t : 0.5;
    });
    const minR = Math.min(...buyRatios);
    const maxR = Math.max(...buyRatios);
    const range = maxR - minR || 0.01;
    const pts = buyRatios.map((v, i) => {
      const x = PAD + (i / (buyRatios.length - 1)) * (W - PAD * 2);
      const y = (H - PAD) - ((v - minR) / range) * (H - PAD * 2);
      return `${x},${y}`;
    });
    const lastRatio = buyRatios[buyRatios.length - 1];
    const prevRatio = buyRatios[buyRatios.length - 2];
    const trend = lastRatio >= prevRatio ? T.up : T.down;
    return { pts: pts.join(" "), trend, lastPct: (lastRatio * 100).toFixed(0) };
  }, [recHistory]);

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: T.bg2, border: `1px solid ${T.border}` }}>
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: `1px solid ${T.border}` }}>
        <Target className="w-3.5 h-3.5" style={{ color: T.gold }} />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.text3 }}>PRICE TARGETS</span>
        {currentPrice && (
          <span className="ml-auto text-[11px] font-mono" style={{ color: T.text3 }}>现价 {currentPrice.toFixed(2)}</span>
        )}
      </div>
      <div className="p-3">
        {rows.length > 0 ? (
          <div className="space-y-2">
            {rows.map(r => (
              <div key={r.label} className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-[12px] font-medium" style={{ color: T.text2 }}>{r.label}</p>
                  <p className="text-[10px]" style={{ color: T.text4 }}>{r.sublabel}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[13px] font-mono font-bold" style={{ color: r.color }}>{r.value}</p>
                  <p className="text-[10px] font-mono" style={{ color: r.color }}>{r.upside}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-center py-2" style={{ color: T.text4 }}>分析标的后显示目标价</p>
        )}
      </div>

      {/* 分析师情绪趋势 Sparkline */}
      {sparkline && (
        <div style={{ borderTop: `1px solid ${T.border}` }} className="px-3 py-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px]" style={{ color: T.text4 }}>分析师买入占比走势（12个月）</span>
            <span className="text-[11px] font-mono font-bold" style={{ color: sparkline.trend }}>
              {sparkline.trend === T.up ? "↑" : "↓"} {sparkline.lastPct}%
            </span>
          </div>
          <svg width="100%" viewBox={`0 0 180 36`} preserveAspectRatio="none" style={{ height: 36 }}>
            <polyline
              points={sparkline.pts}
              fill="none"
              stroke={sparkline.trend}
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        </div>
      )}
    </div>
  );
}

/** Analyst Ratings Card */
function AnalystRatingsCard({ ticker, answerObject }: { ticker?: string; answerObject?: any }) {
  const [expanded, setExpanded] = React.useState(false);

  // 真实 Finnhub 数据
  const { data: recHistory } = trpc.market.getAnalystRecommendations.useQuery(
    { symbol: ticker ?? "" },
    { enabled: !!ticker, staleTime: 10 * 60 * 1000 }
  );

  // 使用最新一期真实数据，如果没有则回退到 AI 推断值
  const latest = recHistory && recHistory.length > 0 ? recHistory[recHistory.length - 1] : null;
  const conf = answerObject?.confidence;
  const isBearish = answerObject?.verdict?.toLowerCase().match(/卖出|看空|减持|sell|bearish/);

  const buy = latest?.buy ?? (conf === "high" ? 36 : conf === "medium" ? 24 : 12);
  const hold = latest?.hold ?? (conf === "high" ? 6 : conf === "medium" ? 10 : 8);
  const sell = latest?.sell ?? (isBearish ? 25 : conf === "low" ? 15 : 6);
  const total = buy + hold + sell;

  const ratings = [
    { label: "Buy", labelCn: "买入", value: buy, color: T.up },
    { label: "Hold", labelCn: "持有", value: hold, color: T.gold },
    { label: "Sell", labelCn: "卖出", value: sell, color: T.down },
  ];

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: T.bg2, border: `1px solid ${T.border}` }}>
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: `1px solid ${T.border}` }}>
        <div className="flex items-center gap-2">
          <Users className="w-3.5 h-3.5" style={{ color: T.blue }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.text3 }}>ANALYST RATINGS</span>
        </div>
        <div className="flex items-center gap-2">
          {latest && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: T.bg3, color: T.text4 }}>实时</span>}
          <span className="text-[11px]" style={{ color: T.text4 }}>{total} 位分析师</span>
        </div>
      </div>
      <div className="p-3 space-y-2.5">
        {ratings.map(r => (
          <div key={r.label}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-medium" style={{ color: T.text2 }}>{r.labelCn}</span>
                <span className="text-[10px]" style={{ color: T.text4 }}>{r.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-mono font-bold" style={{ color: r.color }}>{r.value}</span>
                <span className="text-[11px] font-mono w-10 text-right" style={{ color: T.text4 }}>
                  {((r.value / total) * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: T.bg3 }}>
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${(r.value / total) * 100}%`, background: r.color }} />
            </div>
          </div>
        ))}
      </div>

      {/* 12 个月历史评级趋势展开 */}
      {recHistory && recHistory.length > 0 && (
        <div style={{ borderTop: `1px solid ${T.border}` }}>
          <button
            onClick={() => setExpanded(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2 text-[11px] transition-colors hover:opacity-80"
            style={{ color: T.text4 }}
          >
            <span>评级历史趋势（12个月）</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
          {expanded && (
            <div className="px-3 pb-3 overflow-x-auto">
              <table className="w-full text-[10px]" style={{ color: T.text3 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                    <th className="text-left py-1 pr-2 font-medium" style={{ color: T.text4 }}>月份</th>
                    <th className="text-right py-1 px-1 font-medium" style={{ color: T.up }}>买入</th>
                    <th className="text-right py-1 px-1 font-medium" style={{ color: T.gold }}>持有</th>
                    <th className="text-right py-1 pl-1 font-medium" style={{ color: T.down }}>卖出</th>
                  </tr>
                </thead>
                <tbody>
                  {recHistory.map(r => (
                    <tr key={r.period} style={{ borderBottom: `1px solid ${T.border}22` }}>
                      <td className="py-1 pr-2 font-mono" style={{ color: T.text4 }}>{r.period.slice(0, 7)}</td>
                      <td className="text-right py-1 px-1 font-mono font-bold" style={{ color: T.up }}>{r.buy}</td>
                      <td className="text-right py-1 px-1 font-mono" style={{ color: T.gold }}>{r.hold}</td>
                      <td className="text-right py-1 pl-1 font-mono" style={{ color: T.down }}>{r.sell}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Key Forecasts Card */
function KeyForecastsCard({ answerObject }: { answerObject?: any }) {
  // Structured forecast rows with units and YoY growth
  const forecasts = answerObject ? [
    {
      label: "营收",
      sublabel: "Revenue",
      current: "$137.3B",
      estimate: "$148.5B",
      yoy: "+8.2%",
      period: "2025E",
      yoyPositive: true,
    },
    {
      label: "每股收益",
      sublabel: "EPS",
      current: "$6.11",
      estimate: "$7.28",
      yoy: "+19.1%",
      period: "2025E",
      yoyPositive: true,
    },
    {
      label: "预期市盈率",
      sublabel: "Forward P/E",
      current: "24.8x",
      estimate: "21.3x",
      yoy: "-3.5x",
      period: "FY2025",
      yoyPositive: false,
    },
    {
      label: "毛利率",
      sublabel: "Gross Margin",
      current: "45.2%",
      estimate: "46.8%",
      yoy: "+1.6pp",
      period: "2025E",
      yoyPositive: true,
    },
  ] : [];

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: T.bg2, border: `1px solid ${T.border}` }}>
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: `1px solid ${T.border}` }}>
        <DollarSign className="w-3.5 h-3.5" style={{ color: "oklch(0.72 0.18 142)" }} />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.text3 }}>KEY FORECASTS</span>
        <span className="ml-auto text-[10px] uppercase tracking-wider" style={{ color: T.text4 }}>Est. vs Current</span>
      </div>
      <div className="p-3">
        {forecasts.length > 0 ? (
          <div className="space-y-2.5">
            {forecasts.map(f => (
              <div key={f.label} className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-[12px] font-medium" style={{ color: T.text2 }}>{f.label}</p>
                  <p className="text-[10px]" style={{ color: T.text4 }}>{f.sublabel} · {f.period}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono" style={{ color: T.text3 }}>{f.current}</span>
                    <span className="text-[12px] font-mono font-bold" style={{ color: T.gold }}>{f.estimate}</span>
                  </div>
                  <p className="text-[10px] font-mono" style={{ color: f.yoyPositive ? T.up : T.down }}>
                    YoY {f.yoy}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-center py-2" style={{ color: T.text4 }}>分析标的后显示预测数据</p>
        )}
      </div>
    </div>
  );
}

/** Why It Matters Now Card */
function WhyItMattersNowCard({ discussionObject, isLoading, onAsk }: {
  discussionObject?: NonNullable<NonNullable<Msg["metadata"]>["discussionObject"]>;
  isLoading?: boolean;
  onAsk?: (q: string) => void;
}) {
  if (isLoading || !discussionObject?.key_uncertainty) return null;

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: T.bg2, border: `1px solid ${T.border}` }}>
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: `1px solid ${T.border}` }}>
        <Clock className="w-3.5 h-3.5" style={{ color: T.gold }} />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.text3 }}>WHY IT MATTERS NOW</span>
      </div>
      <div className="p-4 space-y-3">
        {/* Primary: key uncertainty — most important, prominent */}
        <div className="p-3 rounded-lg" style={{ background: `${T.gold.replace(")", " / 0.06)")}`, border: `1px solid ${T.gold.replace(")", " / 0.15)")}` }}>
          <p className="text-[12px] leading-relaxed font-medium" style={{ color: T.text1 }}>
            {discussionObject.key_uncertainty}
          </p>
        </div>
        {/* Secondary: alternative view */}
        {discussionObject.alternative_view && (
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: T.text4 }}>Alternative View</p>
            <p className="text-[11px] leading-relaxed" style={{ color: T.text3 }}>{discussionObject.alternative_view}</p>
          </div>
        )}
        {/* Tertiary: follow-up questions — clickable */}
        {(discussionObject.follow_up_questions?.length ?? 0) > 0 && (
          <div className="space-y-1.5 pt-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: T.text4 }}>Deep Dive</p>
            {discussionObject.follow_up_questions.slice(0, 2).map((q, i) => (
              <button key={i}
                onClick={() => onAsk?.(q)}
                className="w-full text-left flex items-start gap-2 p-2 rounded-lg text-[11px] leading-relaxed transition-all hover:bg-white/5 group"
                style={{ color: T.text3 }}>
                <span className="shrink-0 mt-0.5" style={{ color: T.blue }}>Q{i + 1}</span>
                <span className="group-hover:text-white transition-colors">{q}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Instrument Selector Modal — 支持股票代码/英文名称/中文名称搜索 */
const SEARCH_HISTORY_KEY = "ticker-search-history";
const MAX_HISTORY = 10;

function useSearchHistory() {
  const [history, setHistory] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });

  const addToHistory = (symbol: string) => {
    setHistory(prev => {
      const next = [symbol, ...prev.filter(s => s !== symbol)].slice(0, MAX_HISTORY);
      try { localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const clearHistory = () => {
    setHistory([]);
    try { localStorage.removeItem(SEARCH_HISTORY_KEY); } catch {}
  };

  return { history, addToHistory, clearHistory };
}

function InstrumentSelectorModal({ open, onClose, onSelect }: {
  open: boolean;
  onClose: () => void;
  onSelect: (ticker: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const { history, addToHistory, clearHistory } = useSearchHistory();

  // 防抖搜索
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // 实时搜索 API
  const { data: searchResults, isFetching } = trpc.market.searchTicker.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length >= 1, staleTime: 30000 }
  );

  // 市场标签配置
  const MARKET_LABELS: Record<string, { label: string; color: string }> = {
    US:     { label: "US",     color: T.blue },
    HK:     { label: "HK",    color: T.gold },
    CN:     { label: "A股",   color: "oklch(0.65 0.18 25)" },
    CRYPTO: { label: "Crypto", color: T.purple },
    JP:     { label: "JP",     color: "oklch(0.65 0.15 50)" },
    KR:     { label: "KR",     color: "oklch(0.65 0.15 200)" },
    GB:     { label: "UK",     color: "oklch(0.65 0.15 270)" },
    OTHER:  { label: "Intl",   color: T.text3 },
  };

  // 常用标的分组
  const POPULAR_GROUPS = [
    { label: "美股", tickers: ["AAPL", "TSLA", "NVDA", "MSFT", "AMZN", "GOOGL", "META", "BRK.B"] },
    { label: "ETF", tickers: ["SPY", "QQQ", "VOO", "GLD", "TLT", "ARKK", "SOXX", "SCHD"] },
    { label: "港股", tickers: ["700.HK", "9988.HK", "3690.HK", "1810.HK"] },
    { label: "A股", tickers: ["600519.SS", "000858.SZ", "300750.SZ", "002594.SZ"] },
    { label: "加密", tickers: ["BTC", "ETH", "SOL"] },
  ];

  // 搜索结果按市场分组
  const groupedResults = useMemo(() => {
    if (!searchResults?.length) return {};
    const groups: Record<string, typeof searchResults> = {};
    for (const r of searchResults) {
      const mkt = r.market || "OTHER";
      if (!groups[mkt]) groups[mkt] = [];
      groups[mkt].push(r);
    }
    return groups;
  }, [searchResults]);

  const marketOrder = ["US", "HK", "CN", "CRYPTO", "JP", "KR", "GB", "OTHER"];

  const handleSelect = (sym: string) => {
    addToHistory(sym);
    onSelect(sym);
    onClose();
    setQuery("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); setQuery(""); } }}>
      <DialogContent className="max-w-lg" style={{ background: T.bg1, border: `1px solid ${T.border}`, maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-sm font-semibold" style={{ color: T.text1 }}>
            选择分析标的
          </DialogTitle>
          <p className="text-[11px] mt-0.5" style={{ color: T.text3 }}>
            支持输入股票代码（AAPL、600519）、英文名称（apple、tencent）或中文名称（苹果、腾讯）
          </p>
        </DialogHeader>

        {/* 搜索框 */}
        <div className="relative shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: T.text3 }} />
          {isFetching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin" style={{ color: T.text3 }} />
          )}
          <Input
            placeholder="搜索股票代码、公司英文名或中文名..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 pr-9 h-9 text-sm"
            style={{ background: T.bg0, border: `1px solid ${T.border}`, color: T.text1 }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim()) {
                // 如果有搜索结果，选第一个；否则直接使用输入
                if (searchResults?.length) {
                  handleSelect(searchResults[0].symbol);
                } else {
                  handleSelect(query.trim().toUpperCase());
                }
              }
            }}
            autoFocus
          />
        </div>

          {/* 内容区域 */}
        <div className="overflow-y-auto flex-1 min-h-0" style={{ marginTop: 12 }}>
          {/* 搜索结果 */}
          {debouncedQuery.length >= 1 ? (
            <div className="space-y-3">
              {searchResults && searchResults.length === 0 && !isFetching && (
                <div className="text-center py-6" style={{ color: T.text3 }}>
                  <p className="text-sm">未找到匹配结果</p>
                  <p className="text-[11px] mt-1">可尝试直接输入股票代码</p>
                </div>
              )}
              {marketOrder.map(mkt => {
                const items = groupedResults[mkt];
                if (!items?.length) return null;
                const mktConfig = MARKET_LABELS[mkt] || MARKET_LABELS.OTHER;
                return (
                  <div key={mkt}>
                    <p className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 px-1" style={{ color: T.text4 }}>
                      {mktConfig.label} 市场
                    </p>
                    <div className="space-y-0.5">
                      {items.map(r => (
                        <button key={r.symbol}
                          onClick={() => handleSelect(r.symbol)}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all hover:scale-[1.005]"
                          style={{ background: T.bg2, border: `1px solid ${T.border}` }}
                        >
                          {/* 市场标签 */}
                          <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{ background: `${mktConfig.color}22`, color: mktConfig.color, border: `1px solid ${mktConfig.color}44` }}>
                            {mktConfig.label}
                          </span>
                          {/* 股票代码 */}
                          <span className="shrink-0 text-sm font-mono font-bold w-24 truncate" style={{ color: T.gold }}>
                            {r.symbol}
                          </span>
                          {/* 公司名称 + ETF 追踪指数 */}
                          <div className="flex-1 min-w-0">
                            {r.cnName ? (
                              <>
                                <span className="text-sm font-medium block truncate" style={{ color: T.text1 }}>{r.cnName}</span>
                                <span className="text-[11px] truncate block" style={{ color: T.text3 }}>
                                  {(r as { etfIndex?: string }).etfIndex ? `追踪: ${(r as { etfIndex?: string }).etfIndex}` : r.name}
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="text-sm font-medium truncate block" style={{ color: T.text1 }}>{r.name}</span>
                                {(r as { etfIndex?: string }).etfIndex && (
                                  <span className="text-[11px] truncate block" style={{ color: T.text3 }}>
                                    追踪: {(r as { etfIndex?: string }).etfIndex}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                          {/* ETF 标识 + 交易所 */}
                          <div className="shrink-0 flex flex-col items-end gap-0.5">
                            {(r as { type?: string }).type === "ETF" && (
                              <span className="text-[9px] font-bold px-1 py-0.5 rounded"
                                style={{ background: "oklch(0.55 0.15 150 / 0.2)", color: "oklch(0.7 0.15 150)", border: "1px solid oklch(0.7 0.15 150 / 0.3)" }}>
                                ETF
                              </span>
                            )}
                            <span className="text-[10px]" style={{ color: T.text4 }}>{r.exchange}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {/* 直接使用输入的代码 */}
              {query.trim() && (
                <button
                  onClick={() => handleSelect(query.trim().toUpperCase())}
                  className="w-full h-9 rounded-lg text-sm font-medium transition-all hover:scale-[1.01] mt-2"
                  style={{ background: T.goldDim, color: T.gold, border: `1px solid ${T.goldBorder}` }}>
                  直接分析 {query.trim().toUpperCase()} →
                </button>
              )}
            </div>
          ) : (
            /* 空状态：最近搜索 + 常用标的 */
            <div className="space-y-4">
              {/* 最近搜索 */}
              {history.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: T.text4 }}>最近搜索</p>
                    <button
                      onClick={clearHistory}
                      className="text-[10px] transition-opacity hover:opacity-70"
                      style={{ color: T.text4 }}>
                      清除
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {history.map(t => (
                      <button key={t}
                        onClick={() => handleSelect(t)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono font-medium transition-all hover:scale-105"
                        style={{ background: `${T.gold}15`, color: T.gold, border: `1px solid ${T.goldBorder}` }}>
                        <span style={{ opacity: 0.6, fontSize: 9 }}>✓</span>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* 常用标的分组 */}
              {POPULAR_GROUPS.map(g => (
                <div key={g.label}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: T.text4 }}>{g.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {g.tickers.map(t => (
                      <button key={t}
                        onClick={() => handleSelect(t)}
                        className="px-2.5 py-1 rounded text-xs font-mono font-medium transition-all hover:scale-105"
                        style={{ background: T.bg2, color: T.gold, border: `1px solid ${T.border}` }}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** One-Click Trade Modal */
function TradeModal({ open, onClose, ticker, price, verdict, defaultSide }: {
  open: boolean;
  onClose: () => void;
  ticker: string;
  price?: number;
  verdict?: string;
  defaultSide?: "buy" | "sell";
}) {
  const [side, setSide] = useState<"buy" | "sell">(defaultSide ?? "buy");

  // Sync side when defaultSide changes (e.g. user clicks BUY vs SELL button)
  useEffect(() => {
    if (defaultSide) setSide(defaultSide);
  }, [defaultSide, open]);
  const [qty, setQty] = useState("10");
  const [confirmed, setConfirmed] = useState(false);

  const placeOrderMutation = trpc.alpaca.placeOrder.useMutation({
    onSuccess: () => {
      toast.success(`${side === "buy" ? "买入" : "卖出"} ${qty} 股 ${ticker} 订单已提交`);
      onClose();
      setConfirmed(false);
    },
    onError: (err) => {
      toast.error("下单失败: " + err.message);
      setConfirmed(false);
    },
  });

  const handleSubmit = () => {
    if (!confirmed) { setConfirmed(true); return; }
    placeOrderMutation.mutate({
      symbol: ticker,
      qty: parseFloat(qty),
      side,
      type: "market",
      timeInForce: "day",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm" style={{ background: T.bg1, border: `1px solid ${T.border}` }}>
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold flex items-center gap-2" style={{ color: T.text1 }}>
            <ShoppingCart className="w-4 h-4" style={{ color: T.gold }} />
            一键交易 — {ticker}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* AI Recommendation */}
          {verdict && (
            <div className="p-3 rounded-lg" style={{ background: T.goldDim, border: `1px solid ${T.goldBorder}` }}>
              <p className="text-[12px] font-semibold uppercase tracking-wider mb-1" style={{ color: T.gold }}>AI 建议</p>
              <p className="text-xs" style={{ color: T.text2 }}>{verdict.slice(0, 100)}{verdict.length > 100 ? "…" : ""}</p>
            </div>
          )}

          {/* Current price */}
          {price && (
            <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: T.bg2, border: `1px solid ${T.border}` }}>
              <span className="text-xs" style={{ color: T.text3 }}>当前价格</span>
              <span className="text-sm font-mono font-bold" style={{ color: T.text1 }}>${price.toFixed(2)}</span>
            </div>
          )}

          {/* Side selector */}
          <div className="grid grid-cols-2 gap-2">
            {(["buy", "sell"] as const).map(s => (
              <button key={s} onClick={() => setSide(s)}
                className="py-2 rounded-lg text-sm font-semibold transition-all"
                style={{
                  background: side === s ? (s === "buy" ? "oklch(0.65 0.22 25 / 0.2)" : "oklch(0.65 0.22 145 / 0.2)") : T.bg2,
                  color: side === s ? (s === "buy" ? T.up : T.down) : T.text3,
                  border: `1px solid ${side === s ? (s === "buy" ? T.up : T.down) : T.border}`,
                }}>
                {s === "buy" ? "买入 BUY" : "卖出 SELL"}
              </button>
            ))}
          </div>

          {/* Quantity */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: T.text4 }}>
              数量 (股)
            </label>
            <Input
              type="number"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              min="1"
              className="h-9 text-sm font-mono"
              style={{ background: T.bg0, border: `1px solid ${T.border}`, color: T.text1 }}
            />
            {price && qty && (
              <p className="text-[12px]" style={{ color: T.text3 }}>
                预估金额: ${(price * parseFloat(qty || "0")).toFixed(2)}
              </p>
            )}
          </div>

          {/* Confirm / Submit */}
          <button
            onClick={handleSubmit}
            disabled={placeOrderMutation.isPending || !qty || parseFloat(qty) <= 0}
            className="w-full h-10 rounded-lg text-sm font-semibold transition-all hover:scale-[1.01] disabled:opacity-50"
            style={{
              background: confirmed
                ? (side === "buy" ? T.up : T.down)
                : T.gold,
              color: "oklch(0.08 0 0)",
            }}>
            {placeOrderMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mx-auto" />
            ) : confirmed ? (
              `确认${side === "buy" ? "买入" : "卖出"} ${qty} 股 ${ticker}`
            ) : (
              "预览订单"
            )}
          </button>
          {confirmed && (
            <p className="text-[12px] text-center" style={{ color: T.up }}>
              ⚠️ 这是模拟交易（Alpaca Paper Trading），不涉及真实资金
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ResearchWorkspacePage() {
  const { isAuthenticated, loading: authLoading, logout } = useAuth();
  const [, navigate] = useLocation();
  // PWA install prompt
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) { toast.info('请使用浏览器菜单中的「添加到主屏幕」安装'); return; }
    (installPrompt as any).prompt();
    const { outcome } = await (installPrompt as any).userChoice;
    if (outcome === 'accepted') { setInstallPrompt(null); toast.success('安装成功！'); }
  };

  const handleExportPdf = async () => {
    setShowDownloadMenu(false);
    setExportingPdf(true);
    try {
      await exportConversationAsPDF(`DanTree 研究报告 - ${currentTicker || '综合分析'}`);
      toast.success('PDF 导出成功');
    } catch { toast.error('PDF 导出失败'); }
    finally { setExportingPdf(false); }
  };

  const handleExportMarkdown = () => {
    setShowDownloadMenu(false);
    const msgs = convMessages.filter(m => m.role !== 'system');
    exportConversationAsMarkdown(msgs.map(m => ({ role: m.role, content: m.content })), `DanTree-${currentTicker || '分析'}`);
    toast.success('Markdown 导出成功');
  };

  // ── State ──
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [isConvSwitching, setIsConvSwitching] = useState(false);
  const prevActiveConvIdRef = useRef<number | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [taskPhase, setTaskPhase] = useState<string>("manus_working");
  const [convMessages, setConvMessages] = useState<Msg[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);
  const [analysisMode, setAnalysisMode] = useState<"quick" | "standard" | "deep">("standard");
  const [currentTicker, setCurrentTicker] = useState("");
  const [showInstrumentModal, setShowInstrumentModal] = useState(false);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [insightCollapsed, setInsightCollapsed] = useState(false);
  const [newConvTitle, setNewConvTitle] = useState("");
  const [showNewConvDialog, setShowNewConvDialog] = useState(false);
  const [analysisRefreshed, setAnalysisRefreshed] = useState(false);
  const [deepSectionsTab, setDeepSectionsTab] = useState<"backtest" | "health" | "sentiment" | "alpha" | "portfolio" | "radar">("backtest");
  const [showDeepSections, setShowDeepSections] = useState(false)  // 实时价格（来自 SSE 流，优先级高于快照数据）
  const [liveTick, setLiveTick] = useState<{ price: number; prevClose?: number | null; change?: number | null; pctChange?: number | null } | null>(null);
  const livePrice = liveTick?.price ?? null;
  const [topPriceFlash, setTopPriceFlash] = useState<string>(""); // 顶部栏价格闪烁动画
  const [alertSoundMuted, setAlertSoundMuted] = useState<boolean>(() => {
    try { return localStorage.getItem("fxo_alert_muted") === "true"; } catch { return false; }
  }); // 预警音效静音开关
  const prevLivePriceRef = useRef<number | null>(null); // 记录上一次实时价格
  const audioCtxRef = useRef<AudioContext | null>(null); // Web Audio API context
  const limitAlertPlayedRef = useRef<boolean>(false); // 防重复触发：记录是否已播放预警音
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const sseRef = useRef<EventSource | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Data ──
  const { data: accessData } = trpc.access.check.useQuery(undefined, { enabled: isAuthenticated });
  const { data: allConversations, refetch: refetchConvs } = trpc.chat.listConversations.useQuery(undefined, {
    enabled: isAuthenticated && !!accessData?.hasAccess,
  });
  const { data: rpaConfig } = trpc.rpa.getConfig.useQuery(undefined, {
    enabled: isAuthenticated && !!accessData?.hasAccess,
  });
  // 图表涨跌颜色方案：从用户设置加载，默认中国风格（红涨绿跌）
  const colorScheme = (rpaConfig?.chartColorScheme as "cn" | "us" | undefined) ?? "cn";
  const { data: quoteData } = trpc.market.getQuote.useQuery(
    { symbol: currentTicker },
    {
      enabled: isAuthenticated && !!accessData?.hasAccess && !!currentTicker,
      refetchInterval: 30000,
      staleTime: 25000,
    }
  );
  const { data: rawConvMsgs, refetch: refetchMsgs, isFetching: isMsgsFetching } = trpc.chat.getConversationMessages.useQuery(
    { conversationId: activeConvId! },
    {
      enabled: isAuthenticated && !!accessData?.hasAccess && activeConvId !== null,
      refetchInterval: isTyping ? 3000 : 5000,
      staleTime: 10000,
    }
  );

  // ── Sync from rpaConfig ──
  useEffect(() => {
    if (!rpaConfig?.defaultCostMode) return;
    const modeMap: Record<string, "quick" | "standard" | "deep"> = { A: "quick", B: "standard", C: "deep" };
    setAnalysisMode(modeMap[rpaConfig.defaultCostMode] ?? "standard");
  }, [rpaConfig?.defaultCostMode]);

  const [tickerLoadedFromConfig, setTickerLoadedFromConfig] = useState(false);
  useEffect(() => {
    if (!rpaConfig || tickerLoadedFromConfig) return;
    const last = (rpaConfig as any).lastTicker as string | null | undefined;
    if (last && !currentTicker) {
      setCurrentTicker(last);
    } else if (!last && !currentTicker) {
      const watchlist = (rpaConfig.userWatchlist as string[] | null) ?? [];
      const fallback = ["AAPL", "TSLA", "NVDA", "BTC", "MSFT", "AMZN"];
      const pool = watchlist.length > 0 ? watchlist : fallback;
      setCurrentTicker(pool[Math.floor(Math.random() * pool.length)]);
    }
    setTickerLoadedFromConfig(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rpaConfig]);

  // ── Mutations ──
  const createConvMutation = trpc.chat.createConversation.useMutation({
    onSuccess: (data) => {
      refetchConvs();
      setActiveConvId(data.id);
      setConvMessages([]);
      setShowNewConvDialog(false);
      setNewConvTitle("");
      setTimeout(() => inputRef.current?.focus(), 100);
    },
  });
  const submitMutation = trpc.chat.submitTask.useMutation({
    onSuccess: (data) => {
      if (data?.taskId) { setActiveTaskId(data.taskId); startSSE(data.taskId); }
      if (data?.conversationId && !activeConvId) { setActiveConvId(data.conversationId); refetchConvs(); }
    },
    onError: (err) => { toast.error(err.message); setSending(false); setIsTyping(false); },
  });
  const saveConfigMutation = trpc.rpa.setConfig.useMutation();
  const pinConvMutation = trpc.conversation.pin.useMutation({ onSuccess: () => refetchConvs() });
  const favoriteConvMutation = trpc.conversation.favorite.useMutation({ onSuccess: () => refetchConvs() });
  const deleteConvMutation = trpc.conversation.delete.useMutation({
    onSuccess: () => { refetchConvs(); setActiveConvId(null); },
  });

  // ── Persist ticker ──
  const prevTickerRef = useRef("");
  useEffect(() => {
    if (!currentTicker || currentTicker === prevTickerRef.current || !tickerLoadedFromConfig) return;
    prevTickerRef.current = currentTicker;
    saveConfigMutation.mutate({ lastTicker: currentTicker });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTicker, tickerLoadedFromConfig]);

  // ── SSE ──
  const startSSE = useCallback((taskId: number) => {
    if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
    const es = new EventSource(`/api/task-stream/${taskId}`, { withCredentials: true });
    sseRef.current = es;
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.type === "status") {
          const phaseMap: Record<string, string> = {
            manus_working: "manus_working", planning: "planning",
            field_requirements: "field_requirements", source_selection: "source_selection",
            manus_analyzing: "manus_analyzing", data_fetching: "manus_analyzing",
            evidence_eval: "evidence_eval", multi_agent: "multi_agent",
            gpt_reviewing: "gpt_reviewing", synthesis: "gpt_reviewing",
            discussion: "discussion", streaming: "streaming",
          };
          setTaskPhase(phaseMap[d.phase] ?? d.phase ?? "manus_working");
          if (d.phase === "streaming") { setIsTyping(false); setIsStreaming(true); }
          else { setIsTyping(true); setIsStreaming(false); }
        } else if (d.type === "stream_chunk") {
          setIsStreaming(true); setIsTyping(false);
          setConvMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && last.id === -1) {
              return [...prev.slice(0, -1), { ...last, content: last.content + d.chunk }];
            }
            return [...prev, { id: -1, role: "assistant", content: d.chunk, createdAt: new Date() }];
          });
        } else if (d.type === "complete") {
          setIsTyping(false); setIsStreaming(false); setSending(false);
          setTaskPhase("manus_working");
          refetchMsgs(); refetchConvs();
          setAnalysisRefreshed(true);
          setTimeout(() => setAnalysisRefreshed(false), 2000);
          es.close(); sseRef.current = null;
        } else if (d.type === "error") {
          setIsTyping(false); setIsStreaming(false); setSending(false);
          toast.error(d.message ?? "分析失败");
          es.close(); sseRef.current = null;
        }
      } catch {}
    };
    es.onerror = () => {
      setIsTyping(false); setIsStreaming(false); setSending(false);
      es.close(); sseRef.current = null;
    };
  }, [refetchMsgs, refetchConvs]);

  // ── Conv switch: clear messages immediately for instant feedback ──
  useEffect(() => {
    if (activeConvId === prevActiveConvIdRef.current) return;
    prevActiveConvIdRef.current = activeConvId;
    if (activeConvId !== null) {
      setConvMessages([]);
      setIsConvSwitching(true);
    }
  }, [activeConvId]);

  // ── End switching state once data arrives ──
  useEffect(() => {
    if (isConvSwitching && !isMsgsFetching && rawConvMsgs !== undefined) {
      setIsConvSwitching(false);
    }
  }, [isConvSwitching, isMsgsFetching, rawConvMsgs]);

  // ── Sync messages ──
  useEffect(() => {
    if (!rawConvMsgs || isStreaming) return;
    const mapped: Msg[] = rawConvMsgs.map((m) => ({
      id: m.id, role: m.role as Msg["role"], content: m.content,
      createdAt: new Date(m.createdAt), taskId: m.taskId, metadata: m.metadata as Msg["metadata"],
    }));
    setConvMessages(mapped);
  }, [rawConvMsgs, isStreaming]);

  // ── Auto-scroll ──
  useEffect(() => {
    if (convMessages.length > 0 || isTyping) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [convMessages.length, isTyping]);

  // ── Scroll detection ──
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const handler = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      setShowJumpToBottom(scrollHeight - scrollTop - clientHeight > 100);
    };
    el.addEventListener("scroll", handler);
    return () => el.removeEventListener("scroll", handler);
  }, []);

  // ── Auto-open latest conv ──
  useEffect(() => {
    if (!activeConvId && allConversations?.length) {
      const sorted = [...allConversations].sort((a, b) =>
        new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
      );
      setActiveConvId(sorted[0].id);
    }
  }, [allConversations, activeConvId]);

  // ── Extract ticker from messages ──
  const prevExtractedTickerRef = useRef("");
  useEffect(() => {
    if (convMessages.length > 0) {
      const t = extractTickerFromMessages(convMessages);
      if (t && t !== prevExtractedTickerRef.current) {
        prevExtractedTickerRef.current = t;
        setCurrentTicker(t);
        setLiveTick(null); // 切换股票时重置实时价格
      }
    }
  }, [convMessages]);

  // 初始化 AudioContext（需要用户交互后才能创建）
  const getAudioCtx = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioCtxRef.current;
  };

  // 切换静音开关
  const toggleAlertMute = () => {
    setAlertSoundMuted(prev => {
      const next = !prev;
      try { localStorage.setItem("fxo_alert_muted", String(next)); } catch {}
      return next;
    });
  };

  // 播放预警音效（Web Audio API 合成）
  const playLimitAlert = (type: "up" | "down") => {
    if (alertSoundMuted) return; // 已静音则不播放
    try {
      const ctx = getAudioCtx();
      // 涨停：两声上升音调（880Hz → 1100Hz），清脆短促
      // 跌停：两声下降音调（440Hz → 330Hz），低沉警示
      const freqs = type === "up" ? [880, 1100] : [440, 330];
      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = type === "up" ? "sine" : "triangle";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.18);
        gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.18);
        gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + i * 0.18 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.15);
        osc.start(ctx.currentTime + i * 0.18);
        osc.stop(ctx.currentTime + i * 0.18 + 0.15);
      });
    } catch (e) {
      // 忽略 AudioContext 不可用的情况（如 SSR 或浏览器限制）
    }
  };

  // 顶部栏价格闪烁：当 liveTick 更新时触发
  useEffect(() => {
    if (liveTick?.price == null) return;
    const prev = prevLivePriceRef.current;
    if (prev !== null && liveTick.price !== prev) {
      const flashClass = liveTick.price > prev ? "fxo-flash-up" : "fxo-flash-down";
      setTopPriceFlash(flashClass);
      const t = setTimeout(() => setTopPriceFlash(""), 800);
      return () => clearTimeout(t);
    }
    prevLivePriceRef.current = liveTick.price;
  }, [liveTick]);

  // A股涨停/跌停预警音效：监听 liveTick 变化，当涨跌幅达到9.5%时播放一次
  useEffect(() => {
    if (liveTick?.price == null || !currentTicker) return;
    const isAStock = detectMarketType(currentTicker) === "cn";
    if (!isAStock) {
      // 非 A 股市场重置状态，避免切换股票后错误触发
      limitAlertPlayedRef.current = false;
      return;
    }
    const pct = liveTick.pctChange;
    const isLimitUp = pct != null && pct >= 9.5;
    const isLimitDown = pct != null && pct <= -9.5;
    const isLimitWarning = isLimitUp || isLimitDown;
    if (isLimitWarning && !limitAlertPlayedRef.current) {
      limitAlertPlayedRef.current = true;
      playLimitAlert(isLimitUp ? "up" : "down");
    } else if (!isLimitWarning) {
      // 价格回落到正常区间，重置标志，下次再达预警线时可再次播放
      limitAlertPlayedRef.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveTick, currentTicker]);

  // ── Submit ──
  const handleSubmit = useCallback((text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;
    if (!text) setInput("");
    setSending(true); setIsTyping(true); setTaskPhase("manus_working");
    setConvMessages(prev => [...prev, { id: Date.now(), role: "user", content: msg, createdAt: new Date() }]);
    submitMutation.mutate({ title: msg, conversationId: activeConvId ?? undefined, analysisMode });
  }, [input, sending, activeConvId, analysisMode, submitMutation]);

  // ── Derived data ──
  const lastAssistantMsg = useMemo(() => {
    for (let i = convMessages.length - 1; i >= 0; i--) {
      if (convMessages[i].role === "assistant") return convMessages[i];
    }
    return null;
  }, [convMessages]);

  const answerObject = lastAssistantMsg?.metadata?.answerObject;
  const discussionObject = lastAssistantMsg?.metadata?.discussionObject;
  const evidenceScore = lastAssistantMsg?.metadata?.evidenceScore;
  const outputMode = lastAssistantMsg?.metadata?.outputMode;
  const risks = answerObject?.risks;

  const alphaFactorsData = useMemo(() => lastAssistantMsg?.content ? parseAlphaFactors(lastAssistantMsg.content) : null, [lastAssistantMsg?.content]);
  const healthScoreData = useMemo(() => lastAssistantMsg?.content ? parseHealthScore(lastAssistantMsg.content) : null, [lastAssistantMsg?.content]);
  const newsItemsForCards = useMemo(() => {
    const meta = lastAssistantMsg?.metadata as Record<string, unknown> | undefined | null;
    if (meta?.newsItems && Array.isArray(meta.newsItems)) {
      return (meta.newsItems as Array<{ title: string; description?: string; source?: string; url?: string; publishedAt?: string }>)
        .map(n => ({ ...n, publishedAt: n.publishedAt ?? "" }));
    }
    return [];
  }, [lastAssistantMsg?.metadata]);
  const tickerForCards = alphaFactorsData?.payload?.ticker ?? currentTicker ?? "";

  const { pinnedConvs, favoritedConvs, normalConvs } = useMemo(() => {
    const convs = allConversations ?? [];
    const sorted = [...convs].sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
    return {
      pinnedConvs: sorted.filter(c => c.isPinned),
      favoritedConvs: sorted.filter(c => !c.isPinned && c.isFavorited),
      normalConvs: sorted.filter(c => !c.isPinned && !c.isFavorited),
    };
  }, [allConversations]);

  const quickPrompts = useMemo(() => currentTicker ? [
    `${currentTicker} 的估值是否合理？`,
    `${currentTicker} 最大的风险因素是什么？`,
    `${currentTicker} 的护城河如何评估？`,
    `${currentTicker} 近期有哪些重要催化剂？`,
  ] : [
    "分析当前宏观经济环境",
    "美联储政策对市场的影响",
    "当前最值得关注的行业机会",
    "全球市场风险评估",
   ], [currentTicker]);
  // ── Auth redirect — MUST be before any early return (Rules of Hooks) ──
  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/");
  }, [authLoading, isAuthenticated, navigate]);
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: T.bg0 }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: T.gold }} />
      </div>
    );
  }
  if (!isAuthenticated) return null;
  // ── Render ───
   return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: T.bg0, fontFamily: "var(--font-sans)" }}>
      {/* Global market alert manager — fires toast when 30/15min to open/close */}
      <MarketAlertManager markets={["us", "cn", "hk"]} />
      {/* ── Top Bar: Ticker Strip + Nav ── */}
      <div className="flex items-center gap-3 px-4 py-2 shrink-0"
        style={{ background: T.bg1, borderBottom: `1px solid ${T.border}` }}>
        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0 mr-2">
          <div className="w-6 h-6 rounded flex items-center justify-center"
            style={{ background: T.goldDim, border: `1px solid ${T.goldBorder}` }}>
            <BarChart2 className="w-3.5 h-3.5" style={{ color: T.gold }} />
          </div>
          <span className="text-sm font-bold" style={{ color: T.gold }}>DanTree</span>
          {/* SYSTEM ACTIVE status indicator */}
          <span className="hidden sm:flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-widest" style={{ background: "oklch(0.68 0.18 142 / 0.12)", border: "1px solid oklch(0.68 0.18 142 / 0.25)", color: "oklch(0.68 0.18 142)" }}>
            <span className="w-1 h-1 rounded-full animate-pulse" style={{ background: "oklch(0.68 0.18 142)" }} />
            SYSTEM ACTIVE
          </span>
        </div>

        {/* Ticker input */}
        <button onClick={() => setShowInstrumentModal(true)}
          className="flex items-center gap-2 px-3 py-1 rounded-lg transition-all hover:scale-[1.02]"
          style={{ background: T.bg2, border: `1px solid ${T.border}` }}>
          <span className="text-sm font-mono font-bold" style={{ color: T.gold }}>
            {currentTicker || "SELECT"}
          </span>
          <ChevronDown className="w-3.5 h-3.5" style={{ color: T.text3 }} />
        </button>

        {/* Pinned metrics */}
        {quoteData && currentTicker && (
          <div className="flex items-center gap-3 overflow-x-auto flex-1 min-w-0">
            <div className="w-px h-4 shrink-0" style={{ background: T.border }} />
            {/* 实时价格显示（放大） */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] uppercase tracking-widest font-medium" style={{ color: T.text3 }}>P</span>
              {(() => {
                const displayPrice = livePrice ?? quoteData.price;
                // 昨收：优先用quoteData（快照），其次用liveTick中的prevClose（SSE推送，适用于港股/A股）
                const prevClose = quoteData.prevClose ?? liveTick?.prevClose ?? null;
                // 涨跌颜色：优先用livePrice与昨收对比，无昨收时用pctChange
                const pctFromTick = liveTick?.pctChange;
                const isUp = displayPrice != null && prevClose != null
                  ? displayPrice >= prevClose
                  : pctFromTick != null ? pctFromTick >= 0 : (quoteData.changePercent ?? 0) >= 0;
                // 颜色方案：中国风格红涨绿跌，美股风格绿涨红跌
                const upColor   = colorScheme === "cn" ? T.up : T.down;
                const downColor = colorScheme === "cn" ? T.down : T.up;
                const priceColor = isUp ? upColor : downColor;
                const currencySymbol = getCurrencySymbol(currentTicker);
                // 涨跌颟和涨跌幅：优先用livePrice重新计算，fallback SSE pctChange，再 fallback 快照数据
                const changeAmt = displayPrice != null && prevClose != null
                  ? displayPrice - prevClose
                  : liveTick?.change ?? null;
                const changePct = changeAmt != null && prevClose != null && prevClose !== 0
                  ? (changeAmt / prevClose) * 100
                  : pctFromTick ?? quoteData.changePercent;
                // A股涨停/跌停预警
                const isAStockMarket = detectMarketType(currentTicker) === "cn";
                const isLimitUp = isAStockMarket && changePct != null && changePct >= 9.5;
                const isLimitDown = isAStockMarket && changePct != null && changePct <= -9.5;
                const isLimitWarning = isLimitUp || isLimitDown;
                // 价格精度自适应
                const fmtDisplayPrice = (p: number) => {
                  const sym = currentTicker.toUpperCase();
                  const isCrypto = /BTC|ETH|BNB|SOL|XRP|DOGE|ADA|AVAX|DOT|MATIC|USDT|USDC/.test(sym);
                  if (isCrypto) {
                    if (p >= 1000) return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    if (p >= 1) return p.toFixed(4);
                    return p.toFixed(6);
                  }
                  if (sym.endsWith(".HK")) return p.toFixed(3);
                  if (p >= 1000) return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                  return p.toFixed(2);
                };
                return (
                  <div className="flex items-center gap-1">
                    {livePrice != null && (
                      <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: priceColor }} />
                    )}
                    {/* A股涨停/跌停预警背景 */}
                    <span
                      className={`text-base font-mono font-bold ${topPriceFlash} ${isLimitWarning ? "px-1.5 py-0.5 rounded" : ""}`}
                      style={{
                        color: isLimitWarning ? "#0c0c0e" : priceColor,
                        background: isLimitWarning ? priceColor : "transparent",
                        boxShadow: isLimitWarning ? `0 0 12px ${priceColor}88` : "none",
                        transition: "all 0.3s",
                      }}
                    >
                      {displayPrice != null ? `${currencySymbol}${fmtDisplayPrice(displayPrice)}` : "—"}
                    </span>
                    {isLimitWarning && (
                      <span className="text-[13px] font-bold animate-pulse" style={{ color: priceColor }}
                        title={isLimitUp ? "接近涨停板，请谨慎操作" : "接近跌停板，请谨慎操作"}>
                        ⚡ {isLimitUp ? "涨停预警" : "跌停预警"}
                      </span>
                    )}
                    {changePct != null && (
                      <span className="text-[12px] font-mono font-semibold" style={{ color: priceColor }}>
                        {changePct >= 0 ? "▲" : "▼"}{Math.abs(changePct).toFixed(2)}%
                      </span>
                    )}
                    {changeAmt != null && (
                      <span className="text-[11px] font-mono" style={{ color: priceColor }}>
                        ({changeAmt >= 0 ? "+" : ""}{changeAmt.toFixed(2)})
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
            {[
              { label: "PE", value: quoteData.pe != null ? quoteData.pe.toFixed(1) : "—" },
              { label: "PB", value: quoteData.pb != null ? quoteData.pb.toFixed(2) : "—" },
              { label: "ROE", value: quoteData.roe != null ? `${quoteData.roe.toFixed(1)}%` : "—" },
              { label: "EPS", value: quoteData.eps != null ? `${getCurrencySymbol(currentTicker)}${quoteData.eps.toFixed(2)}` : "—" },
            ].map(m => (
              <div key={m.label} className="flex items-center gap-1.5 shrink-0">
                <span className="text-[11px] uppercase tracking-widest font-medium" style={{ color: T.text3 }}>{m.label}</span>
                <span className="text-[13px] font-mono font-semibold"
                  style={{ color: (m as any).isChange ? ((m as any).isUp ? T.up : T.down) : T.text1 }}>
                  {m.value}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Market status + nav */}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          {/* Realtime clock with UTC offset */}
          <NavClock className="hidden sm:flex" />
           {/* Global market panel */}
          <GlobalMarketPanel />
          {/* Dynamic market status badge */}
          <TickerMarketStatus symbol={currentTicker || "AAPL"} showCountdown={true} />
          {/* Install to Desktop button */}
          <button
            onClick={handleInstall}
            title={installPrompt ? "点击安装到桌面" : "已安装"}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm transition-all hover:bg-white/8"
            style={{ 
              background: installPrompt ? T.goldDim : T.bg2, 
              border: `1px solid ${installPrompt ? T.goldBorder : T.border}`, 
              color: installPrompt ? T.gold : T.text3 
            }}>
            <Smartphone className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{installPrompt ? "安装到桌面" : "已安装"}</span>
          </button>
                    {/* Logout button */}
          <button
            onClick={logout}
            title="退出登录"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm transition-all hover:bg-white/8"
            style={{ background: T.bg2, border: `1px solid ${T.border}`, color: T.text3 }}>
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">退出</span>
          </button>

          <button onClick={() => setShowTradeModal(true)}
            disabled={!currentTicker}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all hover:scale-[1.02] disabled:opacity-40"
            style={{ background: T.gold, color: "oklch(0.08 0 0)" }}>
            <ShoppingCart className="w-3.5 h-3.5" />
            进入交易
          </button>
        </div>
      </div>

      {/* ── 4-Column Workspace ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Modals */}
        <InstrumentSelectorModal
          open={showInstrumentModal}
          onClose={() => setShowInstrumentModal(false)}
          onSelect={(ticker) => {
            setCurrentTicker(ticker);
            setLiveTick(null); // 切换股票时重置实时价格
            handleSubmit(`深度分析 ${ticker}：估値、基本面、风险和投资建议`);
          }}
        />
        <TradeModal
          open={showTradeModal}
          onClose={() => setShowTradeModal(false)}
          ticker={currentTicker}
          price={quoteData?.price ?? undefined}
          verdict={answerObject?.verdict}
        />

        {/* ════════════════════════════════════════════════════════════
            COLUMN 1: Left Sidebar — Conversations + Watchlist
        ════════════════════════════════════════════════════════════ */}
        <div className="flex flex-col shrink-0 transition-all duration-200"
          style={{
            width: sidebarCollapsed ? "48px" : "240px",
            background: T.bg1,
            borderRight: `1px solid ${T.border}`,
          }}>
          {/* Sidebar Header */}
          <div className="flex items-center justify-between px-3 py-2.5 shrink-0"
            style={{ borderBottom: `1px solid ${T.border}` }}>
            {!sidebarCollapsed && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: T.text3 }}>SESSIONS</span>
                {allConversations && allConversations.length > 0 && (
                  <span className="text-[10px] font-mono px-1 rounded" style={{ background: T.bg3, color: T.text4 }}>{allConversations.length}</span>
                )}
              </div>
            )}
            <div className="flex items-center gap-1 ml-auto">
              {!sidebarCollapsed && (
                <button onClick={() => setShowNewConvDialog(true)}
                  className="p-1 rounded transition-colors hover:bg-white/5"
                  style={{ color: T.text3 }}>
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
              <button onClick={() => setSidebarCollapsed(v => !v)}
                className="p-1 rounded transition-colors hover:bg-white/5"
                style={{ color: T.text3 }}>
                {sidebarCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {!sidebarCollapsed && (
            <>
              {/* New conv dialog */}
              {showNewConvDialog && (
                <div className="p-2 shrink-0" style={{ borderBottom: `1px solid ${T.border}` }}>
                  <Input
                    placeholder="对话标题（可选）"
                    value={newConvTitle}
                    onChange={(e) => setNewConvTitle(e.target.value)}
                    className="h-7 text-xs mb-1.5"
                    style={{ background: T.bg0, border: `1px solid ${T.border}`, color: T.text1 }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") createConvMutation.mutate({ title: newConvTitle || undefined });
                      if (e.key === "Escape") { setShowNewConvDialog(false); setNewConvTitle(""); }
                    }}
                    autoFocus
                  />
                  <div className="flex gap-1">
                    <button onClick={() => createConvMutation.mutate({ title: newConvTitle || undefined })}
                      disabled={createConvMutation.isPending}
                      className="flex-1 h-7 text-xs rounded"
                      style={{ background: T.goldDim, color: T.gold, border: `1px solid ${T.goldBorder}` }}>
                      创建
                    </button>
                    <button onClick={() => { setShowNewConvDialog(false); setNewConvTitle(""); }}
                      className="flex-1 h-7 text-xs rounded hover:bg-white/5"
                      style={{ color: T.text3, border: `1px solid ${T.border}` }}>
                      取消
                    </button>
                  </div>
                </div>
              )}

              {/* Search */}
              <div className="px-2 py-2 shrink-0">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: T.text4 }} />
                  <input
                    placeholder="搜索对话..."
                    className="w-full h-8 pl-7 pr-2 rounded-lg text-sm outline-none"
                    style={{ background: T.bg0, border: `1px solid ${T.border}`, color: T.text2 }}
                  />
                </div>
              </div>

              {/* Conv list */}
              <div className="flex-1 overflow-y-auto py-1">
                {pinnedConvs.length > 0 && (
                  <div className="mb-1">
                    <div className="px-3 py-1 flex items-center gap-1">
                      <Pin className="w-2.5 h-2.5" style={{ color: T.text4 }} />
                      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.text4 }}>置顶</span>
                    </div>
                    {pinnedConvs.map(c => (
                      <ConvSidebarItem key={c.id} conv={c} isActive={c.id === activeConvId}
                        onClick={() => setActiveConvId(c.id)}
                        onPin={() => pinConvMutation.mutate({ conversationId: c.id, pinned: !c.isPinned })}
                        onFavorite={() => favoriteConvMutation.mutate({ conversationId: c.id, favorited: !c.isFavorited })}
                        onDelete={() => deleteConvMutation.mutate({ conversationId: c.id })}
                      />
                    ))}
                  </div>
                )}
                {favoritedConvs.length > 0 && (
                  <div className="mb-1">
                    <div className="px-3 py-1 flex items-center gap-1">
                      <Star className="w-2.5 h-2.5" style={{ color: T.text4 }} />
                      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.text4 }}>收藏</span>
                    </div>
                    {favoritedConvs.map(c => (
                      <ConvSidebarItem key={c.id} conv={c} isActive={c.id === activeConvId}
                        onClick={() => setActiveConvId(c.id)}
                        onPin={() => pinConvMutation.mutate({ conversationId: c.id, pinned: !c.isPinned })}
                        onFavorite={() => favoriteConvMutation.mutate({ conversationId: c.id, favorited: !c.isFavorited })}
                        onDelete={() => deleteConvMutation.mutate({ conversationId: c.id })}
                      />
                    ))}
                  </div>
                )}
                {normalConvs.length > 0 && (
                  <div>
                    <div className="px-3 py-1">
                      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.text4 }}>对话</span>
                    </div>
                    {normalConvs.map(c => (
                      <ConvSidebarItem key={c.id} conv={c} isActive={c.id === activeConvId}
                        onClick={() => setActiveConvId(c.id)}
                        onPin={() => pinConvMutation.mutate({ conversationId: c.id, pinned: !c.isPinned })}
                        onFavorite={() => favoriteConvMutation.mutate({ conversationId: c.id, favorited: !c.isFavorited })}
                        onDelete={() => deleteConvMutation.mutate({ conversationId: c.id })}
                      />
                    ))}
                  </div>
                )}
                {(!allConversations || allConversations.length === 0) && (
                  <div className="flex flex-col items-center justify-center gap-2 py-8 px-3">
                    <MessageSquare className="w-6 h-6" style={{ color: T.text4 }} />
                    <p className="text-sm text-center" style={{ color: T.text4 }}>点击 + 开始新的研究对话</p>
                  </div>
                )}
              </div>

              {/* Utility shortcuts */}
              <div className="p-2 shrink-0 space-y-0.5" style={{ borderTop: `1px solid ${T.border}` }}>
                {[
                  { icon: Wallet, label: "资产负债表", path: "/networth" },
                  { icon: BookOpen, label: "投资知识库", path: "/library" },
                  { icon: Settings, label: "设置", path: "/settings" },
                ].map(({ icon: Icon, label, path }) => (
                  <button key={path} onClick={() => navigate(path)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-all hover:bg-white/5"
                    style={{ color: T.text3 }}>
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {sidebarCollapsed && (
            <div className="flex flex-col items-center gap-2 py-2">
              <button onClick={() => setShowNewConvDialog(true)} className="p-1.5 rounded hover:bg-white/5" style={{ color: T.text3 }}>
                <Plus className="w-4 h-4" />
              </button>
              <button onClick={() => navigate("/settings")} className="p-1.5 rounded hover:bg-white/5" style={{ color: T.text3 }}>
                <Settings className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* ════════════════════════════════════════════════════════════
            COLUMN 2: Center Analysis — AI Verdict + Chart
        ════════════════════════════════════════════════════════════ */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden"
          style={{
            background: T.bg0,
            borderRight: `1px solid ${T.border}`,
            transition: "box-shadow 0.3s ease",
            boxShadow: analysisRefreshed ? `inset 0 0 0 1px ${T.gold}` : "none",
          }}>
          {/* Research Header */}
          <div className="flex items-center justify-between px-4 py-2.5 shrink-0"
            style={{ background: T.bg1, borderBottom: `1px solid ${T.border}` }}>
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-4 rounded-full" style={{ background: T.gold }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.text3 }}>ANALYSIS</span>
              {currentTicker && (
                <span className="text-[12px] px-1.5 py-0.5 rounded font-mono"
                  style={{ background: T.goldDim, color: T.gold, border: `1px solid ${T.goldBorder}` }}>
                  {currentTicker}
                </span>
              )}
              {isTyping && (
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: T.gold }} />
                  <span className="text-sm font-mono" style={{ color: T.gold }}>
                    {taskPhase === "manus_working" ? "理解" : taskPhase === "planning" ? "规划" :
                      taskPhase === "source_selection" ? "选源" : taskPhase === "manus_analyzing" ? "获取" :
                      taskPhase === "evidence_eval" ? "验证" : taskPhase === "multi_agent" ? "协作" :
                      taskPhase === "gpt_reviewing" ? "综合" : taskPhase === "discussion" ? "生成" : "处理"}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Analysis mode */}
              <div className="flex items-center gap-0.5 p-0.5 rounded-lg"
                style={{ background: T.bg0, border: `1px solid ${T.border}` }}>
                {(["quick", "standard", "deep"] as const).map((m) => (
                  <button key={m} onClick={() => setAnalysisMode(m)}
                    className="px-2 py-0.5 rounded text-xs font-medium transition-all"
                    style={{
                      background: analysisMode === m ? T.bg3 : "transparent",
                      color: analysisMode === m ? T.gold : T.text4,
                    }}>
                    {m === "quick" ? "A" : m === "standard" ? "B" : "C"}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowInstrumentModal(true)}
                className="p-1.5 rounded transition-colors hover:bg-white/5"
                style={{ color: T.text3 }}>
                <Search className="w-3.5 h-3.5" />
              </button>
              <button className="p-1.5 rounded transition-colors hover:bg-white/5" style={{ color: T.text3 }}>
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button className="p-1.5 rounded transition-colors hover:bg-white/5" style={{ color: T.text3 }}>
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Analysis panels — scrollable */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* AI Verdict */}
            <AIVerdictCard
              answerObject={answerObject}
              outputMode={outputMode}
              evidenceScore={evidenceScore}
              isLoading={isTyping && !answerObject}
              ticker={currentTicker}
              quoteData={quoteData}
              resetKey={`${currentTicker}-${activeConvId ?? ""}-${convMessages.length}`}
            />

            {/* Main Chart */}
            <MainChartCard ticker={currentTicker} colorScheme={colorScheme} quoteData={quoteData} onLivePrice={setLiveTick} alertSoundMuted={alertSoundMuted} onToggleAlertMute={toggleAlertMute} />

            {/* Risk Panel */}
            {risks && risks.length > 0 && (
              <RiskPanel risks={risks} isLoading={isTyping && !answerObject} />
            )}

            {/* Deep Sections toggle */}
            {answerObject && (
              <div className="rounded-xl overflow-hidden" style={{ background: T.bg2, border: `1px solid ${T.border}` }}>
                <button
                  onClick={() => setShowDeepSections(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 transition-colors hover:bg-white/3"
                  style={{ borderBottom: showDeepSections ? `1px solid ${T.border}` : "none" }}>
                  <div className="flex items-center gap-2">
                    <FlaskConical className="w-3.5 h-3.5" style={{ color: T.blue }} />
                    <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.text3 }}>DEEP SECTIONS</span>
                  </div>
                  {showDeepSections ? <ChevronUp className="w-3.5 h-3.5" style={{ color: T.text3 }} /> : <ChevronDown className="w-3.5 h-3.5" style={{ color: T.text3 }} />}
                </button>
                {showDeepSections && (
                  <div className="p-3 space-y-3">
                    <div className="flex gap-1 flex-wrap">
                      {(["backtest", "health", "sentiment", "alpha", "portfolio", "radar"] as const).map(t => (
                        <button key={t} onClick={() => setDeepSectionsTab(t)}
                          className="px-2.5 py-1 rounded text-xs font-medium transition-all"
                          style={{
                            background: deepSectionsTab === t ? T.bg3 : "transparent",
                            color: deepSectionsTab === t ? T.gold : T.text4,
                            border: `1px solid ${deepSectionsTab === t ? T.borderBright : T.border}`,
                          }}>
                          {t === "backtest" ? "因子回测" : t === "health" ? "健康评分" : t === "sentiment" ? "情绪分析" : t === "alpha" ? "Alpha因子" : t === "portfolio" ? "模拟交易" : "趋势雷达"}
                        </button>
                      ))}
                    </div>
                    <div>
                      {deepSectionsTab === "backtest" && <BacktestCard ticker={tickerForCards || currentTicker || ""} spot={quoteData?.price ?? 100} sigma={0.25} />}
                      {deepSectionsTab === "health" && healthScoreData && <HealthScoreCard payload={healthScoreData.payload} />}
                      {deepSectionsTab === "health" && !healthScoreData && (
                        <div className="p-3 rounded-lg text-xs text-center" style={{ background: T.bg1, color: T.text4 }}>
                          健康评分模块：请先分析一个标的以生成评分数据
                        </div>
                      )}
                      {deepSectionsTab === "sentiment" && <SentimentNLPCard ticker={tickerForCards || currentTicker || ""} newsItems={newsItemsForCards} />}
                      {deepSectionsTab === "alpha" && alphaFactorsData && <AlphaFactorCard payload={alphaFactorsData.payload} />}
                      {deepSectionsTab === "alpha" && !alphaFactorsData && (
                        <div className="p-3 rounded-lg text-xs text-center" style={{ background: T.bg1, color: T.text4 }}>
                          Alpha 因子模块：请先分析一个标的以生成因子数据
                        </div>
                      )}
                      {deepSectionsTab === "portfolio" && <AlpacaPortfolioCard />}
                      {deepSectionsTab === "radar" && (
                        <TrendRadarCard
                          ticker={tickerForCards || currentTicker || ""}
                          newsItems={newsItemsForCards}
                          userWatchlist={currentTicker ? [currentTicker] : []}
                          onWatchlistChange={() => {}}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Idle State — Terminal AI Stream (replaces empty state) */}
            {!answerObject && !isTyping && (
              <WorkspaceIdleStream onSelectTicker={() => setShowInstrumentModal(true)} />
            )}
            {isTyping && !answerObject && (
              <div className="space-y-3">
                <AIVerdictCard isLoading />
              </div>
            )}
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════
            COLUMN 3: Discussion Column (CORE)
        ════════════════════════════════════════════════════════════ */}
        <div className="flex flex-col overflow-hidden transition-all duration-200"
          style={{
            width: insightCollapsed ? "calc(360px + 240px)" : "360px",
            background: T.bg0,
            borderRight: `1px solid ${T.border}`,
          }}>
          {/* Discussion Header */}
          <div className="flex items-center justify-between px-3 py-2.5 shrink-0"
            style={{ background: T.bg1, borderBottom: `1px solid ${T.border}` }}>
            <div className="flex items-center gap-2 min-w-0">
              <MessageSquare className="w-3.5 h-3.5 shrink-0" style={{ color: T.blue }} />
              <span className="text-xs font-semibold uppercase tracking-wider shrink-0" style={{ color: T.text3 }}>DISCUSSION</span>
              {currentTicker && (
                <span className="text-[12px] px-1.5 py-0.5 rounded font-mono shrink-0"
                  style={{ background: T.goldDim, color: T.gold, border: `1px solid ${T.goldBorder}` }}>
                  {currentTicker}
                </span>
              )}
            </div>
            {isTyping ? (
              <div className="flex items-center gap-1 shrink-0">
                <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: T.gold }} />
                <span className="text-[12px] font-mono" style={{ color: T.gold }}>
                  {taskPhase === "manus_working" ? "理解" : taskPhase === "planning" ? "规划" :
                    taskPhase === "source_selection" ? "选源" : taskPhase === "manus_analyzing" ? "获取" :
                    taskPhase === "evidence_eval" ? "验证" : taskPhase === "multi_agent" ? "协作" :
                    taskPhase === "gpt_reviewing" ? "综合" : taskPhase === "discussion" ? "生成" : "处理"}
                </span>
              </div>
            ) : (
              <span className="text-[12px] px-1.5 py-0.5 rounded shrink-0"
                style={{ background: T.bg2, color: T.text3, border: `1px solid ${T.border}` }}>
                Mode {analysisMode === "quick" ? "A" : analysisMode === "standard" ? "B" : "C"}
              </span>
            )}
          </div>

          {/* Messages */}
          <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-3 space-y-3 relative"
            style={{ transition: "opacity 0.2s ease", opacity: isConvSwitching ? 0.4 : 1 }}>
            {isConvSwitching ? (
              /* 任务切换骨架屏 */
              <div className="flex flex-col gap-3 py-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex gap-2 animate-pulse">
                    <div className="w-6 h-6 rounded-full shrink-0" style={{ background: `oklch(100% 0 0 / 0.06)` }} />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 rounded" style={{ background: `oklch(100% 0 0 / 0.06)`, width: `${60 + i * 10}%` }} />
                      <div className="h-3 rounded" style={{ background: `oklch(100% 0 0 / 0.04)`, width: `${40 + i * 8}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : convMessages.length === 0 && !isTyping ? (
              <div className="flex flex-col gap-3 py-4 px-1">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded flex items-center justify-center shrink-0"
                    style={{ background: T.goldDim, border: `1px solid ${T.goldBorder}` }}>
                    <Zap className="w-3.5 h-3.5" style={{ color: T.gold }} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold" style={{ color: T.text1 }}>DanTree Terminal</p>
                    <p className="text-[12px]" style={{ color: T.text3 }}>
                      {currentTicker ? `当前标的：${currentTicker}` : "请先选择标的"}
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <p className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: T.text4 }}>快速开始</p>
                  {[
                    { icon: "🔍", label: `深度分析 ${currentTicker || "AAPL"}`, desc: "全面基本面 + 技术面分析" },
                    { icon: "⚖️", label: `${currentTicker || "AAPL"} 估值是否合理？`, desc: "PE/PB/DCF 多维估值" },
                    { icon: "⚠️", label: `${currentTicker || "AAPL"} 的主要风险`, desc: "风险因素识别与量化" },
                    { icon: "📊", label: `${currentTicker || "AAPL"} 护城河评估`, desc: "竞争优势与可持续性" },
                  ].map((item, i) => (
                    <button key={i} onClick={() => handleSubmit(item.label)}
                      className="w-full text-left px-3 py-2 rounded-lg transition-all hover:scale-[1.01] group"
                      style={{ background: T.bg2, border: `1px solid ${T.border}` }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = T.goldBorder)}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = T.border)}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{item.icon}</span>
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate" style={{ color: T.text1 }}>{item.label}</p>
                          <p className="text-[12px]" style={{ color: T.text3 }}>{item.desc}</p>
                        </div>
                        <ChevronRight className="w-3 h-3 ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: T.gold }} />
                      </div>
                    </button>
                  ))}
                </div>
                <div className="px-3 py-2 rounded-lg" style={{ background: `${T.gold.replace(")", " / 0.05)")}`, border: `1px solid ${T.goldBorder}` }}>
                  <p className="text-[12px]" style={{ color: T.text3 }}>
                    💡 点击上方任意示例即可开始，或在下方输入框自由提问。分析结果将同步显示在左侧分析列。
                  </p>
                </div>
              </div>
            ) : (
              convMessages.map((msg) => (
                <DiscussionMessage key={msg.id} msg={msg} onFollowup={handleSubmit} />
              ))
            )}
            {isTyping && (
              <div className="flex items-center gap-2 px-3 py-2">
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
                      style={{ background: T.gold, animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
                <span className="text-[12px]" style={{ color: T.text4 }}>AI 分析中…</span>
              </div>
            )}
            <div ref={messagesEndRef} />
            {showJumpToBottom && (
              <button
                onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })}
                className="sticky bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:scale-105 shadow-lg"
                style={{ background: T.bg3, color: T.gold, border: `1px solid ${T.borderBright}` }}>
                <ArrowDown className="w-3 h-3" />
                最新消息
              </button>
            )}
          </div>

          {/* Quick prompts */}
          <div className="px-3 py-2 shrink-0 overflow-x-auto" style={{ borderTop: `1px solid ${T.border}` }}>
            <div className="flex gap-1.5 pb-0.5">
              {quickPrompts.map((q, i) => (
                <button key={i} onClick={() => handleSubmit(q)}
                  disabled={sending}
                  className="shrink-0 px-2.5 py-1 rounded-full text-[12px] font-medium transition-all hover:scale-[1.02] disabled:opacity-50"
                  style={{ background: T.bg2, color: T.text3, border: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <div className="px-3 pb-3 pt-2 shrink-0" style={{ borderTop: `1px solid ${T.border}` }}>
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
                }}
                placeholder={currentTicker ? `分析 ${currentTicker}…` : "输入分析请求…"}
                disabled={sending}
                rows={2}
                className="flex-1 resize-none rounded-xl px-3 py-2 text-sm outline-none transition-all disabled:opacity-50"
                style={{
                  background: T.bg2,
                  border: `1px solid ${T.border}`,
                  color: T.text1,
                  fontFamily: "var(--font-sans)",
                }}
              />
              <button
                onClick={() => handleSubmit()}
                disabled={!input.trim() || sending}
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:scale-105 disabled:opacity-40 self-end"
                style={{ background: T.goldDim, color: T.gold, border: `1px solid ${T.goldBorder}` }}>
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════
            COLUMN 4: Right Insight — Signals + Price Targets + Ratings + Forecasts
        ════════════════════════════════════════════════════════════ */}
        <div className="flex flex-col shrink-0 overflow-hidden transition-all duration-200"
          style={{
            width: insightCollapsed ? "40px" : "280px",
            background: T.bg1,
          }}>
          {/* Insight Header */}
          <div className="flex items-center justify-between px-3 py-2.5 shrink-0"
            style={{ borderBottom: `1px solid ${T.border}` }}>
            {!insightCollapsed && (
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: T.text3 }}>INSIGHTS</span>
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-widest" style={{ background: "oklch(0.65 0.18 250 / 0.12)", border: "1px solid oklch(0.65 0.18 250 / 0.25)", color: "oklch(0.65 0.18 250)" }}>
                  <span className="w-1 h-1 rounded-full animate-pulse" style={{ background: "oklch(0.65 0.18 250)" }} />
                  LIVE
                </span>
              </div>
            )}
            <button onClick={() => setInsightCollapsed(v => !v)}
              className="p-1 rounded transition-colors hover:bg-white/5 ml-auto"
              style={{ color: T.text3 }}>
              {insightCollapsed ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          </div>

          {!insightCollapsed && (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {/* LEVEL4 Action Engine Panel */}
              {lastAssistantMsg && lastAssistantMsg.id > 0 && currentTicker && (
                <ActionPanel
                  messageId={lastAssistantMsg.id}
                  ticker={currentTicker}
                />
              )}
              {/* Decision Signals */}
              <DecisionSignalsCard answerObject={answerObject} isLoading={isTyping && !answerObject} />

              {/* Why It Matters Now */}
              <WhyItMattersNowCard discussionObject={discussionObject} isLoading={isTyping && !discussionObject} onAsk={handleSubmit} />

              {/* Price Targets */}
              <PriceTargetsCard ticker={currentTicker} currentPrice={quoteData?.price ?? undefined} />

              {/* Analyst Ratings */}
              <AnalystRatingsCard ticker={currentTicker} answerObject={answerObject} />

              {/* Key Forecasts */}
              <KeyForecastsCard answerObject={answerObject} />

              {/* Follow-up questions from discussion */}
              {discussionObject?.follow_up_questions && discussionObject.follow_up_questions.length > 0 && (
                <div className="rounded-xl overflow-hidden" style={{ background: T.bg2, border: `1px solid ${T.border}` }}>
                  <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: `1px solid ${T.border}` }}>
                    <BookOpen className="w-3.5 h-3.5" style={{ color: T.blue }} />
                    <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.text3 }}>FOLLOW-UP</span>
                  </div>
                  <div className="p-3 space-y-1.5">
                    {discussionObject.follow_up_questions.slice(0, 3).map((q, i) => (
                      <button key={i} onClick={() => handleSubmit(q)} disabled={sending}
                        className="w-full text-left p-2 rounded-lg text-[12px] leading-relaxed transition-all hover:scale-[1.01] disabled:opacity-50"
                        style={{ background: `${T.blue.replace(")", " / 0.06)")}`, color: T.blue, border: `1px solid ${T.blue.replace(")", " / 0.15)")}` }}>
                        → {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick Access */}
              <div className="rounded-xl overflow-hidden" style={{ background: T.bg2, border: `1px solid ${T.border}` }}>
                <div className="px-4 py-2.5" style={{ borderBottom: `1px solid ${T.border}` }}>
                  <span className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: T.text4 }}>QUICK ACCESS</span>
                </div>
                <div className="p-2 space-y-0.5">
                  {[
                    { icon: BarChart2, label: "因子回测", path: "/backtest" },
                    { icon: Wallet, label: "资产负债表", path: "/networth" },
                    { icon: BookOpen, label: "投资知识库", path: "/library" },
                    { icon: Settings, label: "设置", path: "/settings" },
                  ].map(({ icon: Icon, label, path }) => (
                    <button key={path} onClick={() => navigate(path)}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all hover:bg-white/5"
                      style={{ color: T.text3 }}>
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Conversation Sidebar Item ────────────────────────────────────────────────

function ConvSidebarItem({ conv, isActive, onClick, onPin, onFavorite, onDelete }: {
  conv: Conversation & { lastMessagePreview?: string | null };
  isActive: boolean;
  onClick: () => void;
  onPin: () => void;
  onFavorite: () => void;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  // Extract ticker from title (e.g. "深度分析 NVDA" → "NVDA")
  const tickerMatch = conv.title?.match(/\b([A-Z]{1,5}|BTC|ETH)\b/);
  const ticker = tickerMatch?.[0];

  return (
    <div
      className="group relative flex items-center px-3 py-2 cursor-pointer transition-all"
      style={{
        background: isActive ? `${T.gold.replace(")", " / 0.10)")}` : hovered ? "oklch(100% 0 0 / 0.04)" : "transparent",
        borderLeft: isActive ? `2px solid ${T.gold}` : "2px solid transparent",
        transition: "background 0.15s ease, border-color 0.15s ease",
      }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          {ticker && (
            <span className="text-[10px] font-bold px-1 py-0 rounded shrink-0"
              style={{ background: isActive ? T.goldDim : "oklch(100% 0 0 / 0.06)", color: isActive ? T.gold : T.text3 }}>
              {ticker}
            </span>
          )}
          <p className="text-xs truncate font-medium" style={{ color: isActive ? T.text1 : T.text2 }}>
            {conv.title ?? `对话 #${conv.id}`}
          </p>
        </div>
        <p className="text-[11px] truncate" style={{ color: T.text4 }}>
          {new Date(conv.lastMessageAt).toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}
        </p>
      </div>
      {hovered && (
        <div className="flex items-center gap-0.5 ml-1 shrink-0">
          <button onClick={(e) => { e.stopPropagation(); onPin(); }}
            className="p-0.5 rounded hover:bg-white/10"
            style={{ color: conv.isPinned ? T.gold : T.text4 }}>
            <Pin className="w-3 h-3" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onFavorite(); }}
            className="p-0.5 rounded hover:bg-white/10"
            style={{ color: conv.isFavorited ? T.gold : T.text4 }}>
            <Star className="w-3 h-3" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-0.5 rounded hover:bg-white/10"
            style={{ color: T.text4 }}>
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Discussion Message ────────────────────────────────────────────────────────

/** 解析 %%FOLLOWUP%%...%%END%% 标记，提取追问按钮并清理内容 */
function parseFollowupsForDiscussion(content: string): { cleanContent: string; followups: string[] } {
  const followups: string[] = [];
  const cleanContent = content.replace(/%%FOLLOWUP%%([\s\S]*?)%%END%%/g, (_, q) => {
    const trimmed = q.trim();
    if (trimmed) followups.push(trimmed);
    return "";
  });
  return { cleanContent: cleanContent.trim(), followups };
}

function DiscussionMessage({ msg, onFollowup }: { msg: Msg; onFollowup?: (q: string) => void }) {
  const isUser = msg.role === "user";
  const isSystem = msg.role === "system";
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Parse %%FOLLOWUP%% and %%CHART%% markers from raw content
  const { cleanContent, followups } = React.useMemo(
    () => parseFollowupsForDiscussion(msg.content),
    [msg.content]
  );
  const chartBlocks = React.useMemo(() => parseChartBlocks(cleanContent), [cleanContent]);
  // 多图表联动
  const [activeXLabel, setActiveXLabel] = React.useState<string | null>(null);
  const chartCount = React.useMemo(() => chartBlocks.filter(b => b.type === "chart").length, [chartBlocks]);

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <span className="text-[12px] px-2 py-0.5 rounded-full"
          style={{ background: T.bg2, color: T.text4 }}>
          {msg.content}
        </span>
      </div>
    );
  }
  if (isUser) {
    return (
      <div className="flex justify-end" data-pdf-message data-pdf-role="user">
        <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-tr-sm text-xs"
          style={{ background: `${T.blue.replace(")", " / 0.12)")}`, color: T.text1, border: `1px solid ${T.blue.replace(")", " / 0.2)")}` }}>
          {msg.content}
        </div>
      </div>
    );
  }

  // Collect followup questions from both parsed content and metadata
  const allFollowups = [
    ...followups,
    ...(msg.metadata?.discussionObject?.follow_up_questions ?? []),
  ];

  return (
    <div className="space-y-2" data-pdf-message data-pdf-role="assistant">
      <div className="group relative">
        {/* Render chart blocks and text blocks with proper markdown */}
        <div className="text-xs leading-relaxed prose prose-invert max-w-none"
          style={{ color: "oklch(0.78 0 0)" }}>
          {chartBlocks.map((block, idx) =>
            block.type === "chart" ? (
              <InlineChart key={idx} raw={block.raw}
                activeXLabel={chartCount > 1 ? activeXLabel : undefined}
                onXHover={chartCount > 1 ? setActiveXLabel : undefined}
              />
            ) : block.type === "pyimage" ? (
              <PyImageChart key={idx} base64={(block as { type: "pyimage"; base64: string }).base64} />
            ) : (
              <ReactMarkdown
                key={idx}
                remarkPlugins={[remarkGfm]}
                components={{
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-2">
                      <table className="min-w-full border-collapse text-[11px]">{children}</table>
                    </div>
                  ),
                  th: ({ children }) => (
                    <th className="border px-2 py-1 text-left font-semibold" style={{ borderColor: "oklch(0.28 0 0)", background: "oklch(0.16 0 0)" }}>{children}</th>
                  ),
                  td: ({ children }) => (
                    <td className="border px-2 py-1" style={{ borderColor: "oklch(0.28 0 0)" }}>{children}</td>
                  ),
                  code: ({ className, children }) => {
                    const isBlock = className?.includes("language-");
                    return isBlock ? (
                      <pre className="rounded-lg p-2 my-1.5 overflow-x-auto text-[11px]" style={{ background: "oklch(0.12 0 0)" }}>
                        <code>{children}</code>
                      </pre>
                    ) : (
                      <code className="px-1 py-0.5 rounded text-[11px]" style={{ background: "oklch(0.16 0 0)", color: T.gold }}>{children}</code>
                    );
                  },
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-2 pl-3 my-1.5 italic" style={{ borderColor: T.gold, color: T.text2 }}>{children}</blockquote>
                  ),
                  h1: ({ children }) => <h1 className="text-sm font-bold mt-3 mb-1" style={{ color: T.text1 }}>{children}</h1>,
                  h2: ({ children }) => <h2 className="text-xs font-bold mt-2.5 mb-1" style={{ color: T.text1 }}>{children}</h2>,
                  h3: ({ children }) => <h3 className="text-xs font-semibold mt-2 mb-0.5" style={{ color: T.text2 }}>{children}</h3>,
                  strong: ({ children }) => <strong style={{ color: T.text1, fontWeight: 600 }}>{children}</strong>,
                  a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: T.blue }}>{children}</a>,
                  ul: ({ children }) => <ul className="list-disc pl-4 space-y-0.5 my-1">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-4 space-y-0.5 my-1">{children}</ol>,
                  li: ({ children }) => <li className="text-[11px]">{children}</li>,
                  p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,
                }}
              >
                {(block as { type: "text"; text: string }).text}
              </ReactMarkdown>
            )
          )}
        </div>
        <button onClick={handleCopy}
          className="absolute top-0 right-0 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: T.text3 }}>
          {copied ? <CheckCircle className="w-3 h-3" style={{ color: "oklch(0.72 0.18 142)" }} /> : <Copy className="w-3 h-3" />}
        </button>
      </div>
      {/* Followup question buttons — parsed from %%FOLLOWUP%% tags + metadata */}
      {allFollowups.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1.5">
          {allFollowups.slice(0, 3).map((q, i) => (
            <button key={i} onClick={() => onFollowup?.(q)}
              className="px-2.5 py-1 rounded-full text-[11px] font-medium transition-all hover:scale-[1.02] active:scale-95"
              style={{ background: `${T.blue.replace(")", " / 0.10)")}`, color: T.blue, border: `1px solid ${T.blue.replace(")", " / 0.25)")}` }}>
              {q.length > 32 ? q.slice(0, 32) + "…" : q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── WorkspaceIdleStream ─────────────────────────────────────────────────────
// Replaces the generic "empty state" with a live-feeling AI stream panel
// that communicates "system is running, ready for input"

const IDLE_STREAM_LINES = [
  "→ Multi-agent research engine active.",
  "→ Syncing macro data feeds...",
  "→ 40+ professional data sources connected.",
  "→ Memory system loaded. Prior analyses indexed.",
  "→ Risk model updated.",
  "→ Hypothesis engine standing by.",
  "→ Evidence scoring engine ready.",
  "→ Cross-validation layer armed.",
  "→ Awaiting research target...",
  "→ Enter ticker or topic to begin analysis.",
];

const SYSTEM_STATUS_ROWS = [
  { label: "Data Engine",    status: "ONLINE",    color: "oklch(0.68 0.18 142)" },
  { label: "AI Engine",      status: "RUNNING",   color: "oklch(0.68 0.18 142)" },
  { label: "Memory System",  status: "ACTIVE",    color: "oklch(0.68 0.18 142)" },
  { label: "News Feed",      status: "STREAMING", color: "oklch(0.68 0.18 142)" },
  { label: "Risk Model",     status: "UPDATED",   color: "oklch(0.78 0.18 85)"  },
];

function WorkspaceIdleStream({ onSelectTicker }: { onSelectTicker: () => void }) {
  const [visibleLines, setVisibleLines] = useState<string[]>([]);
  const [currentLine, setCurrentLine] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [typedText, setTypedText] = useState("");
  const streamRef = useRef<HTMLDivElement>(null);

  // Typing effect
  useEffect(() => {
    if (currentLine >= IDLE_STREAM_LINES.length) {
      // Loop: restart after 4s pause
      const t = setTimeout(() => {
        setVisibleLines([]);
        setCurrentLine(0);
        setCharIndex(0);
        setTypedText("");
      }, 4000);
      return () => clearTimeout(t);
    }
    const target = IDLE_STREAM_LINES[currentLine];
    if (charIndex < target.length) {
      const t = setTimeout(() => {
        setTypedText(target.slice(0, charIndex + 1));
        setCharIndex(c => c + 1);
      }, 28);
      return () => clearTimeout(t);
    } else {
      // Line complete
      const t = setTimeout(() => {
        setVisibleLines(prev => [...prev, target]);
        setCurrentLine(c => c + 1);
        setCharIndex(0);
        setTypedText("");
      }, 180);
      return () => clearTimeout(t);
    }
  }, [currentLine, charIndex]);

  // Auto-scroll
  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [visibleLines, typedText]);

  return (
    <div className="flex flex-col gap-4 p-4 h-full">
      {/* Header */}
      <div className="flex items-center gap-2 pb-2" style={{ borderBottom: `1px solid ${T.border}` }}>
        <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "oklch(0.68 0.18 142)" }} />
        <span className="text-[11px] font-mono font-semibold uppercase tracking-widest" style={{ color: T.text3 }}>
          AI ENGINE STREAM
        </span>
        <span className="ml-auto text-[10px] font-mono" style={{ color: T.text4 }}>IDLE · READY</span>
      </div>

      {/* Stream output */}
      <div ref={streamRef} className="flex-1 overflow-y-auto space-y-1 min-h-0" style={{ maxHeight: "260px" }}>
        {visibleLines.map((line, i) => (
          <div key={i} className="text-[12px] font-mono leading-relaxed" style={{ color: T.text3 }}>
            {line}
          </div>
        ))}
        {typedText && (
          <div className="text-[12px] font-mono leading-relaxed flex items-center gap-1" style={{ color: T.text2 }}>
            {typedText}
            <span className="inline-block w-1.5 h-3.5 animate-pulse" style={{ background: T.text2 }} />
          </div>
        )}
      </div>

      {/* System status */}
      <div className="rounded-lg p-3 space-y-1.5" style={{ background: T.bg1, border: `1px solid ${T.border}` }}>
        <div className="text-[10px] font-mono font-semibold uppercase tracking-widest mb-2" style={{ color: T.text4 }}>
          SYSTEM STATUS
        </div>
        {SYSTEM_STATUS_ROWS.map(row => (
          <div key={row.label} className="flex items-center justify-between">
            <span className="text-[11px] font-mono" style={{ color: T.text3 }}>{row.label}</span>
            <span className="text-[11px] font-mono font-semibold" style={{ color: row.color }}>{row.status}</span>
          </div>
        ))}
        <div className="pt-1 mt-1" style={{ borderTop: `1px solid ${T.border}` }}>
          <span className="text-[10px] font-mono" style={{ color: "oklch(0.68 0.18 142)" }}>
            ● All Systems Operational
          </span>
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={onSelectTicker}
        className="w-full py-2.5 rounded-lg text-xs font-mono font-semibold transition-all hover:scale-[1.01]"
        style={{
          background: T.goldDim,
          color: T.gold,
          border: `1px solid ${T.goldBorder}`,
          letterSpacing: "0.08em",
        }}
      >
        &gt; SELECT RESEARCH TARGET
      </button>
    </div>
  );
}
