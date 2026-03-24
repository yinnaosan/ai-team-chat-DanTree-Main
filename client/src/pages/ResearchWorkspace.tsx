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
import { GlobalMarketPanel } from "@/components/GlobalMarketPanel";
import { detectMarketType } from "@/lib/marketUtils";

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
      key_evidence?: string[];
      reasoning?: string[];
      counterarguments?: string[];
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
function AIVerdictCard({ answerObject, outputMode, evidenceScore, isLoading, ticker, quoteData }: {
  answerObject?: NonNullable<NonNullable<Msg["metadata"]>["answerObject"]>;
  outputMode?: string;
  evidenceScore?: number;
  isLoading?: boolean;
  ticker?: string;
  quoteData?: any;
}) {
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [tradeSide, setTradeSide] = useState<"buy" | "sell">("buy");

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
            <div className="grid grid-cols-3 gap-2">
              {/* Bull */}
              <div className="p-2.5 rounded-lg space-y-1" style={{ background: "oklch(0.65 0.22 25 / 0.06)", border: "1px solid oklch(0.65 0.22 25 / 0.2)" }}>
                <div className="flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" style={{ color: T.up }} />
                  <span className="text-xs font-semibold uppercase" style={{ color: T.up }}>BULL</span>
                </div>
                {(answerObject.key_evidence ?? []).slice(0, 1).map((e, i) => (
                  <p key={i} className="text-[12px] leading-snug" style={{ color: T.text2 }}>{e}</p>
                ))}
              </div>
              {/* Bear */}
              <div className="p-2.5 rounded-lg space-y-1" style={{ background: "oklch(0.65 0.22 145 / 0.06)", border: "1px solid oklch(0.65 0.22 145 / 0.2)" }}>
                <div className="flex items-center gap-1">
                  <TrendingDown className="w-3 h-3" style={{ color: T.down }} />
                  <span className="text-xs font-semibold uppercase" style={{ color: T.down }}>BEAR</span>
                </div>
                {(answerObject.counterarguments ?? []).slice(0, 1).map((e, i) => (
                  <p key={i} className="text-[12px] leading-snug" style={{ color: T.text2 }}>{e}</p>
                ))}
              </div>
              {/* Key Risk */}
              <div className="p-2.5 rounded-lg space-y-1" style={{ background: "oklch(0.72 0.18 75 / 0.06)", border: "1px solid oklch(0.72 0.18 75 / 0.2)" }}>
                <div className="flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" style={{ color: T.gold }} />
                  <span className="text-xs font-semibold uppercase" style={{ color: T.gold }}>RISK</span>
                </div>
                {(answerObject.risks ?? []).slice(0, 1).map((r, i) => (
                  <p key={i} className="text-[12px] leading-snug" style={{ color: T.text2 }}>{r.description}</p>
                ))}
              </div>
            </div>

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
function MainChartCard({ ticker, colorScheme, quoteData, onLivePrice }: { ticker: string; colorScheme?: "cn" | "us"; quoteData?: any; onLivePrice?: (data: { price: number; prevClose?: number | null; change?: number | null; pctChange?: number | null }) => void }) {
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

/** Risk Panel */
function RiskPanel({ risks, isLoading }: {
  risks?: Array<{ description: string; magnitude?: "high" | "medium" | "low" }>;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="rounded-xl p-4 space-y-2 animate-pulse" style={{ background: T.bg2, border: `1px solid ${T.border}` }}>
        <div className="h-4 rounded w-20" style={{ background: T.bg3 }} />
        {[0, 1].map(i => <div key={i} className="h-8 rounded" style={{ background: T.bg3 }} />)}
      </div>
    );
  }
  if (!risks || risks.length === 0) return null;

  const magMap = {
    high: { color: T.up, bg: "oklch(0.65 0.22 25 / 0.08)", border: "oklch(0.65 0.22 25 / 0.25)", label: "HIGH" },
    medium: { color: T.gold, bg: "oklch(0.72 0.18 75 / 0.08)", border: "oklch(0.72 0.18 75 / 0.25)", label: "MED" },
    low: { color: T.blue, bg: "oklch(0.65 0.18 250 / 0.08)", border: "oklch(0.65 0.18 250 / 0.25)", label: "LOW" },
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: T.bg2, border: `1px solid ${T.border}` }}>
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: `1px solid ${T.border}` }}>
        <AlertTriangle className="w-3.5 h-3.5" style={{ color: T.up }} />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.text3 }}>RISK PANEL</span>
        <span className="text-xs px-1.5 py-0.5 rounded font-mono ml-auto"
          style={{ background: "oklch(0.65 0.22 25 / 0.12)", color: T.up, border: "1px solid oklch(0.65 0.22 25 / 0.3)" }}>
          {risks.length} RISKS
        </span>
      </div>
      <div className="p-3 space-y-2">
        {risks.slice(0, 4).map((r, i) => {
          const mag = magMap[r.magnitude ?? "medium"];
          return (
            <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg"
              style={{ background: mag.bg, border: `1px solid ${mag.border}` }}>
              <span className="text-xs font-mono font-bold px-1 py-0.5 rounded shrink-0 mt-0.5"
                style={{ background: `${mag.color.replace(")", " / 0.2)")}`, color: mag.color }}>
                {mag.label}
              </span>
              <p className="text-xs leading-relaxed" style={{ color: T.text2 }}>{r.description}</p>
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

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: T.bg2, border: `1px solid ${T.border}` }}>
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: `1px solid ${T.border}` }}>
        <div className="w-1.5 h-4 rounded-full" style={{ background: T.gold }} />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.text3 }}>DECISION SIGNALS</span>
      </div>
      <div className="p-3 grid grid-cols-3 gap-2">
        {signals.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="p-3 rounded-lg flex flex-col items-center gap-1.5"
              style={{ background: `${s.color.replace(")", " / 0.08)")}`, border: `1px solid ${s.color.replace(")", " / 0.2)")}` }}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: `${s.color.replace(")", " / 0.15)")}` }}>
                <Icon className="w-3.5 h-3.5" style={{ color: s.color }} />
              </div>
              <span className="text-xs font-extrabold font-mono" style={{ color: s.color }}>{s.value}</span>
              <span className="text-xs uppercase tracking-widest" style={{ color: T.text4 }}>{s.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Price Targets Card */
function PriceTargetsCard({ ticker, currentPrice }: { ticker: string; currentPrice?: number }) {
  // Static mock data — in production this would come from analyst data API
  const targets = currentPrice ? [
    { label: "Current", value: currentPrice.toFixed(2), color: T.text1 },
    { label: "20PT", value: (currentPrice * 1.18).toFixed(0), color: T.up },
    { label: "Mag", value: (currentPrice * 1.25).toFixed(0), color: T.up },
    { label: "Mpr", value: (currentPrice * 1.08).toFixed(0), color: T.gold },
    { label: "Dev", value: (currentPrice * 0.92).toFixed(0), color: T.down },
  ] : [];

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: T.bg2, border: `1px solid ${T.border}` }}>
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: `1px solid ${T.border}` }}>
        <div className="flex items-center gap-2">
          <Target className="w-3.5 h-3.5" style={{ color: T.gold }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.text3 }}>PRICE TARGETS</span>
        </div>
        <button className="p-1 rounded hover:bg-white/5" style={{ color: T.text3 }}>
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="p-3">
        {targets.length > 0 ? (
          <table className="w-full text-xs">
            <thead>
              <tr>
                {targets.map(t => (
                  <th key={t.label} className="text-xs font-semibold uppercase text-center pb-1.5"
                    style={{ color: T.text4 }}>{t.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {targets.map(t => (
                  <td key={t.label} className="text-center font-mono font-semibold text-xs"
                    style={{ color: t.color }}>{t.value}</td>
                ))}
              </tr>
              <tr>
                {targets.map((t, i) => (
                  <td key={t.label} className="text-center text-xs pt-1"
                    style={{ color: T.text4 }}>
                    {i === 0 ? "—" : i === 1 ? "10:0" : i === 2 ? "67%" : i === 3 ? "220" : "180"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="text-[12px] text-center py-2" style={{ color: T.text4 }}>分析后显示目标价</p>
        )}
      </div>
    </div>
  );
}

/** Analyst Ratings Card */
function AnalystRatingsCard({ answerObject }: { answerObject?: any }) {
  // Derived from AI analysis confidence + verdict
  const conf = answerObject?.confidence;
  const isBullish = answerObject?.verdict?.toLowerCase().match(/买入|看多|增持|buy|bullish/);
  const isBearish = answerObject?.verdict?.toLowerCase().match(/卖出|看空|减持|sell|bearish/);

  const buy = conf === "high" ? 36 : conf === "medium" ? 24 : 12;
  const hold = conf === "high" ? 6 : conf === "medium" ? 10 : 8;
  const sell = isBearish ? 25 : conf === "low" ? 15 : 6;
  const total = buy + hold + sell;

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: T.bg2, border: `1px solid ${T.border}` }}>
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: `1px solid ${T.border}` }}>
        <div className="flex items-center gap-2">
          <Users className="w-3.5 h-3.5" style={{ color: T.blue }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.text3 }}>ANALYST RATINGS</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-1 rounded hover:bg-white/5" style={{ color: T.text3 }}>
            <Globe className="w-3 h-3" />
          </button>
          <button className="p-1 rounded hover:bg-white/5" style={{ color: T.text3 }}>
            <MoreHorizontal className="w-3 h-3" />
          </button>
        </div>
      </div>
      <div className="p-3 space-y-2">
        {[
          { label: "Buy", value: buy, color: T.up },
          { label: "Hold", value: hold, color: T.gold },
          { label: "Sell", value: sell, color: T.down },
        ].map(r => (
          <div key={r.label} className="flex items-center gap-2">
            <span className="text-[12px] w-8" style={{ color: T.text3 }}>{r.label}</span>
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: T.bg3 }}>
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${(r.value / total) * 100}%`, background: r.color }} />
            </div>
            <span className="text-[12px] font-mono w-6 text-right" style={{ color: r.color }}>{r.value}</span>
            <span className="text-xs w-4 text-right" style={{ color: T.text4 }}>6</span>
            <span className="text-xs w-4 text-right" style={{ color: T.text4 }}>{r.label === "Buy" ? "3" : r.label === "Hold" ? "3" : "2"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Key Forecasts Card */
function KeyForecastsCard({ answerObject }: { answerObject?: any }) {
  const forecasts = answerObject ? [
    { label: "Revenue", v1: "137.27", v2: "39.09", v3: "2025E" },
    { label: "EPS", v1: "1.29", v2: "39.08", v3: "2025E" },
    { label: "Forward P21", v1: "0.6%", v2: "168.55", v3: "" },
  ] : [];

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: T.bg2, border: `1px solid ${T.border}` }}>
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: `1px solid ${T.border}` }}>
        <div className="flex items-center gap-2">
          <DollarSign className="w-3.5 h-3.5" style={{ color: "oklch(0.72 0.18 142)" }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.text3 }}>KEY FORECASTS</span>
        </div>
        <button className="p-1 rounded hover:bg-white/5" style={{ color: T.text3 }}>
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="p-3">
        {forecasts.length > 0 ? (
          <table className="w-full text-xs">
            <tbody className="space-y-1">
              {forecasts.map(f => (
                <tr key={f.label} className="border-b" style={{ borderColor: T.border }}>
                  <td className="py-1.5 text-[12px]" style={{ color: T.text3 }}>{f.label}</td>
                  <td className="py-1.5 text-right font-mono text-xs" style={{ color: T.text1 }}>{f.v1}</td>
                  <td className="py-1.5 text-right font-mono text-xs" style={{ color: T.gold }}>{f.v2}</td>
                  <td className="py-1.5 text-right text-xs" style={{ color: T.text4 }}>{f.v3}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-[12px] text-center py-2" style={{ color: T.text4 }}>分析后显示预测数据</p>
        )}
      </div>
    </div>
  );
}

/** Why It Matters Now Card */
function WhyItMattersNowCard({ discussionObject, isLoading }: {
  discussionObject?: NonNullable<NonNullable<Msg["metadata"]>["discussionObject"]>;
  isLoading?: boolean;
}) {
  if (isLoading || !discussionObject?.key_uncertainty) return null;

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: T.bg2, border: `1px solid ${T.border}` }}>
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: `1px solid ${T.border}` }}>
        <Clock className="w-3.5 h-3.5" style={{ color: T.gold }} />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.text3 }}>WHY IT MATTERS NOW</span>
      </div>
      <div className="p-3 space-y-2">
        <p className="text-xs leading-relaxed" style={{ color: T.text2 }}>{discussionObject.key_uncertainty}</p>
        {discussionObject.alternative_view && (
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.text4 }}>Alternative View</p>
            <p className="text-xs leading-relaxed" style={{ color: T.text3 }}>{discussionObject.alternative_view}</p>
          </div>
        )}
        {(discussionObject.follow_up_questions?.length ?? 0) > 0 && (
          <div className="flex flex-col gap-1 pt-1">
            {discussionObject.follow_up_questions.slice(0, 2).map((q, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[12px]" style={{ color: T.text3 }}>
                <span style={{ color: T.gold }}>›</span>
                <span>{q}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Instrument Selector Modal */
function InstrumentSelectorModal({ open, onClose, onSelect }: {
  open: boolean;
  onClose: () => void;
  onSelect: (ticker: string) => void;
}) {
  const [query, setQuery] = useState("");
  const popularTickers = ["AAPL", "TSLA", "NVDA", "MSFT", "AMZN", "GOOGL", "META", "BRK.B", "SPY", "QQQ", "BTC", "ETH"];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md" style={{ background: T.bg1, border: `1px solid ${T.border}` }}>
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold" style={{ color: T.text1 }}>
            选择分析标的
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: T.text3 }} />
            <Input
              placeholder="输入股票代码或公司名称..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 h-9 text-sm"
              style={{ background: T.bg0, border: `1px solid ${T.border}`, color: T.text1 }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && query.trim()) {
                  onSelect(query.trim().toUpperCase());
                  onClose();
                }
              }}
              autoFocus
            />
          </div>
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider mb-2" style={{ color: T.text4 }}>常用标的</p>
            <div className="flex flex-wrap gap-1.5">
              {popularTickers.map(t => (
                <button key={t}
                  onClick={() => { onSelect(t); onClose(); }}
                  className="px-2.5 py-1 rounded text-xs font-mono font-medium transition-all hover:scale-105"
                  style={{ background: T.bg2, color: T.gold, border: `1px solid ${T.border}` }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          {query.trim() && (
            <button
              onClick={() => { onSelect(query.trim().toUpperCase()); onClose(); }}
              className="w-full h-9 rounded-lg text-sm font-medium transition-all hover:scale-[1.01]"
              style={{ background: T.goldDim, color: T.gold, border: `1px solid ${T.goldBorder}` }}>
              分析 {query.trim().toUpperCase()} →
            </button>
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
  const [showDeepSections, setShowDeepSections] = useState(false);
  // 实时价格（来自SSE流，优先级高于快照数据）
  const [liveTick, setLiveTick] = useState<{ price: number; prevClose?: number | null; change?: number | null; pctChange?: number | null } | null>(null);
  const livePrice = liveTick?.price ?? null;
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
  const { data: rawConvMsgs, refetch: refetchMsgs } = trpc.chat.getConversationMessages.useQuery(
    { conversationId: activeConvId! },
    {
      enabled: isAuthenticated && !!accessData?.hasAccess && activeConvId !== null,
      refetchInterval: isTyping ? 3000 : 5000,
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
                return (
                  <div className="flex items-center gap-1">
                    {livePrice != null && (
                      <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: priceColor }} />
                    )}
                    <span className="text-base font-mono font-bold" style={{ color: priceColor }}>
                      {displayPrice != null ? `${currencySymbol}${displayPrice.toFixed(2)}` : "—"}
                    </span>
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
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.text3 }}>
                Research
              </span>
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
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.text3 }}>
                Research Header
              </span>
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
            />

            {/* Main Chart */}
            <MainChartCard ticker={currentTicker} colorScheme={colorScheme} quoteData={quoteData} onLivePrice={setLiveTick} />

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

            {/* Empty state */}
            {!answerObject && !isTyping && (
              <div className="flex flex-col items-center justify-center gap-3 py-12">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ background: T.bg2, border: `1px solid ${T.border}` }}>
                  <BarChart2 className="w-6 h-6" style={{ color: T.text4 }} />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-medium" style={{ color: T.text3 }}>分析结果将显示在这里</p>
                  <p className="text-xs" style={{ color: T.text4 }}>在右侧讨论栏输入分析请求</p>
                </div>
                <button onClick={() => setShowInstrumentModal(true)}
                  className="px-4 py-2 rounded-lg text-xs font-medium transition-all hover:scale-[1.02]"
                  style={{ background: T.goldDim, color: T.gold, border: `1px solid ${T.goldBorder}` }}>
                  选择分析标的 →
                </button>
              </div>
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
        <div className="flex flex-col shrink-0 overflow-hidden"
          style={{
            width: "360px",
            background: T.bg0,
            borderRight: `1px solid ${T.border}`,
          }}>
          {/* Discussion Header */}
          <div className="flex items-center justify-between px-3 py-2.5 shrink-0"
            style={{ background: T.bg1, borderBottom: `1px solid ${T.border}` }}>
            <div className="flex items-center gap-2 min-w-0">
              <MessageSquare className="w-3.5 h-3.5 shrink-0" style={{ color: T.blue }} />
              <span className="text-xs font-semibold shrink-0" style={{ color: T.text1 }}>Discussion</span>
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
          <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-3 space-y-3 relative">
            {convMessages.length === 0 && !isTyping ? (
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
              <span className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: T.text4 }}>
                Insights
              </span>
            )}
            <button onClick={() => setInsightCollapsed(v => !v)}
              className="p-1 rounded transition-colors hover:bg-white/5 ml-auto"
              style={{ color: T.text3 }}>
              {insightCollapsed ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          </div>

          {!insightCollapsed && (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {/* Decision Signals */}
              <DecisionSignalsCard answerObject={answerObject} isLoading={isTyping && !answerObject} />

              {/* Why It Matters Now */}
              <WhyItMattersNowCard discussionObject={discussionObject} isLoading={isTyping && !discussionObject} />

              {/* Price Targets */}
              <PriceTargetsCard ticker={currentTicker} currentPrice={quoteData?.price ?? undefined} />

              {/* Analyst Ratings */}
              <AnalystRatingsCard answerObject={answerObject} />

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
  conv: Conversation;
  isActive: boolean;
  onClick: () => void;
  onPin: () => void;
  onFavorite: () => void;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="group relative flex items-center px-3 py-1.5 cursor-pointer transition-all"
      style={{
        background: isActive ? `${T.gold.replace(")", " / 0.08)")}` : hovered ? "oklch(100% 0 0 / 0.03)" : "transparent",
        borderLeft: isActive ? `2px solid ${T.gold}` : "2px solid transparent",
      }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate" style={{ color: isActive ? T.text1 : T.text2 }}>
          {conv.title ?? `对话 #${conv.id}`}
        </p>
        <p className="text-xs" style={{ color: T.text4 }}>
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
              <InlineChart key={idx} raw={block.raw} />
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
