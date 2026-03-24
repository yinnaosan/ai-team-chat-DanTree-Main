/**
 * ResearchWorkspacePage — DANTREE FRONTEND FINAL REBUILD
 * 4-column premium research workspace:
 *   [Sidebar] [Analysis Column] [Discussion Column] [Insight Column]
 */
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from '@/_core/hooks/useAuth';
import { toast } from "sonner";
import {
  Search, Plus, ChevronDown, ChevronRight, ChevronUp,
  TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle,
  Target, Zap, BarChart2, Activity, Globe, Clock, Star,
  MessageSquare, Send, Loader2, X, Pin, Heart, Trash2,
  Settings, RefreshCw, Maximize2, Minimize2, Info,
  ArrowDown, BookOpen, FlaskConical, Wallet, LayoutDashboard,
  Eye, EyeOff, Sliders, ChevronLeft, Edit3, Copy,
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

// ─── Sub-components ───────────────────────────────────────────────────────────

/** AI Verdict Card — primary decision output */
function AIVerdictCard({ answerObject, outputMode, evidenceScore, isLoading }: {
  answerObject?: Msg["metadata"] extends null | undefined ? never : NonNullable<NonNullable<Msg["metadata"]>["answerObject"]>;
  outputMode?: string;
  evidenceScore?: number;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="bloomberg-card p-4 space-y-3 animate-pulse">
        <div className="h-4 rounded w-24" style={{ background: "var(--bloomberg-surface-3)" }} />
        <div className="h-8 rounded w-full" style={{ background: "var(--bloomberg-surface-3)" }} />
        <div className="h-3 rounded w-3/4" style={{ background: "var(--bloomberg-surface-3)" }} />
      </div>
    );
  }
  if (!answerObject) {
    return (
      <div className="bloomberg-card p-4 flex flex-col items-center justify-center gap-2 min-h-[120px]">
        <Target className="w-6 h-6" style={{ color: "oklch(30% 0 0)" }} />
        <p className="text-xs text-center" style={{ color: "oklch(35% 0 0)" }}>
          提交分析后，AI 结论将显示在这里
        </p>
      </div>
    );
  }

  const confMap = {
    high: { color: "oklch(0.72 0.18 142)", label: "高置信度", icon: CheckCircle },
    medium: { color: "oklch(0.72 0.18 75)", label: "中置信度", icon: Activity },
    low: { color: "oklch(0.72 0.18 25)", label: "低置信度", icon: AlertTriangle },
  };
  const conf = confMap[answerObject.confidence] ?? confMap.medium;
  const ConfIcon = conf.icon;

  const modeMap: Record<string, { label: string; color: string }> = {
    decisive: { label: "决定性", color: "oklch(0.72 0.18 142)" },
    directional: { label: "方向性", color: "oklch(0.72 0.18 75)" },
    framework_only: { label: "框架", color: "oklch(0.72 0.18 250)" },
  };
  const mode = outputMode ? modeMap[outputMode] : null;

  return (
    <div className="bloomberg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-5 rounded-full" style={{ background: conf.color }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "oklch(50% 0 0)" }}>
            AI Verdict
          </span>
        </div>
        <div className="flex items-center gap-2">
          {mode && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-mono"
              style={{ background: `${mode.color.replace(")", " / 0.12)")}`, color: mode.color, border: `1px solid ${mode.color.replace(")", " / 0.3)")}` }}>
              {mode.label}
            </span>
          )}
          <div className="flex items-center gap-1">
            <ConfIcon className="w-3 h-3" style={{ color: conf.color }} />
            <span className="text-[10px] font-medium" style={{ color: conf.color }}>{conf.label}</span>
          </div>
          {evidenceScore !== undefined && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
              style={{ background: "var(--bloomberg-surface-2)", color: "oklch(55% 0 0)" }}>
              E:{evidenceScore.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {/* Verdict */}
      <div className="p-3 rounded-xl" style={{ background: "var(--bloomberg-surface-2)", border: "1px solid var(--bloomberg-border-dim)" }}>
        <p className="text-sm font-medium leading-relaxed" style={{ color: "var(--bloomberg-text-primary)" }}>
          {answerObject.verdict}
        </p>
      </div>

      {/* Key Evidence */}
      {(answerObject.key_evidence?.length ?? 0) > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "oklch(40% 0 0)" }}>
            关键证据
          </p>
          {answerObject.key_evidence!.slice(0, 3).map((e, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold mt-0.5"
                style={{ background: "oklch(0.72 0.18 250 / 0.15)", color: "oklch(0.72 0.18 250)" }}>
                {i + 1}
              </span>
              <span style={{ color: "oklch(72% 0 0)" }}>{e}</span>
            </div>
          ))}
        </div>
      )}

      {/* Next Steps */}
      {(answerObject.next_steps?.length ?? 0) > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "oklch(40% 0 0)" }}>
            建议行动
          </p>
          {answerObject.next_steps!.slice(0, 2).map((s, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className="shrink-0 mt-0.5" style={{ color: "oklch(0.72 0.18 250)" }}>→</span>
              <span style={{ color: "oklch(72% 0 0)" }}>{s}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Key Analysis Card — Bull/Bear/Macro */
function KeyAnalysisCard({ answerObject, isLoading }: {
  answerObject?: NonNullable<NonNullable<Msg["metadata"]>["answerObject"]>;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="bloomberg-card p-4 space-y-3 animate-pulse">
        <div className="h-4 rounded w-32" style={{ background: "var(--bloomberg-surface-3)" }} />
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map(i => <div key={i} className="h-20 rounded" style={{ background: "var(--bloomberg-surface-3)" }} />)}
        </div>
      </div>
    );
  }
  if (!answerObject) return null;

  const bullPoints = answerObject.key_evidence?.slice(0, 2) ?? [];
  const bearPoints = answerObject.counterarguments?.slice(0, 2) ?? [];
  const reasoning = answerObject.reasoning?.slice(0, 2) ?? [];

  return (
    <div className="bloomberg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-5 rounded-full" style={{ background: "oklch(0.72 0.18 250)" }} />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "oklch(50% 0 0)" }}>
          Key Analysis
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {/* Bull Case */}
        <div className="p-2.5 rounded-lg space-y-1.5" style={{ background: "oklch(0.72 0.18 142 / 0.08)", border: "1px solid oklch(0.72 0.18 142 / 0.2)" }}>
          <div className="flex items-center gap-1">
            <TrendingUp className="w-3 h-3" style={{ color: "oklch(0.72 0.18 142)" }} />
            <span className="text-[10px] font-semibold" style={{ color: "oklch(0.72 0.18 142)" }}>Bull Case</span>
          </div>
          {bullPoints.length > 0 ? bullPoints.map((p, i) => (
            <p key={i} className="text-[10px] leading-relaxed" style={{ color: "oklch(65% 0 0)" }}>{p}</p>
          )) : <p className="text-[10px]" style={{ color: "oklch(35% 0 0)" }}>暂无数据</p>}
        </div>
        {/* Bear Case */}
        <div className="p-2.5 rounded-lg space-y-1.5" style={{ background: "oklch(0.72 0.18 25 / 0.08)", border: "1px solid oklch(0.72 0.18 25 / 0.2)" }}>
          <div className="flex items-center gap-1">
            <TrendingDown className="w-3 h-3" style={{ color: "oklch(0.72 0.18 25)" }} />
            <span className="text-[10px] font-semibold" style={{ color: "oklch(0.72 0.18 25)" }}>Bear Case</span>
          </div>
          {bearPoints.length > 0 ? bearPoints.map((p, i) => (
            <p key={i} className="text-[10px] leading-relaxed" style={{ color: "oklch(65% 0 0)" }}>{p}</p>
          )) : <p className="text-[10px]" style={{ color: "oklch(35% 0 0)" }}>暂无数据</p>}
        </div>
        {/* Macro */}
        <div className="p-2.5 rounded-lg space-y-1.5" style={{ background: "oklch(0.72 0.18 250 / 0.08)", border: "1px solid oklch(0.72 0.18 250 / 0.2)" }}>
          <div className="flex items-center gap-1">
            <Globe className="w-3 h-3" style={{ color: "oklch(0.72 0.18 250)" }} />
            <span className="text-[10px] font-semibold" style={{ color: "oklch(0.72 0.18 250)" }}>Macro</span>
          </div>
          {reasoning.length > 0 ? reasoning.map((p, i) => (
            <p key={i} className="text-[10px] leading-relaxed" style={{ color: "oklch(65% 0 0)" }}>{p}</p>
          )) : <p className="text-[10px]" style={{ color: "oklch(35% 0 0)" }}>暂无数据</p>}
        </div>
      </div>
    </div>
  );
}

/** Risk Panel — high-visibility risk display */
function RiskPanel({ risks, isLoading }: {
  risks?: Array<{ description: string; magnitude?: "high" | "medium" | "low" }>;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="bloomberg-card p-4 space-y-2 animate-pulse">
        <div className="h-4 rounded w-20" style={{ background: "var(--bloomberg-surface-3)" }} />
        {[0, 1].map(i => <div key={i} className="h-8 rounded" style={{ background: "var(--bloomberg-surface-3)" }} />)}
      </div>
    );
  }
  if (!risks || risks.length === 0) return null;

  const magMap = {
    high: { color: "oklch(0.65 0.22 25)", bg: "oklch(0.65 0.22 25 / 0.1)", border: "oklch(0.65 0.22 25 / 0.3)", label: "HIGH" },
    medium: { color: "oklch(0.72 0.18 75)", bg: "oklch(0.72 0.18 75 / 0.1)", border: "oklch(0.72 0.18 75 / 0.3)", label: "MED" },
    low: { color: "oklch(0.72 0.18 250)", bg: "oklch(0.72 0.18 250 / 0.1)", border: "oklch(0.72 0.18 250 / 0.3)", label: "LOW" },
  };

  return (
    <div className="bloomberg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4" style={{ color: "oklch(0.65 0.22 25)" }} />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "oklch(50% 0 0)" }}>
          Risk Panel
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded font-mono"
          style={{ background: "oklch(0.65 0.22 25 / 0.15)", color: "oklch(0.65 0.22 25)", border: "1px solid oklch(0.65 0.22 25 / 0.3)" }}>
          {risks.length} RISKS
        </span>
      </div>
      <div className="space-y-2">
        {risks.map((r, i) => {
          const mag = magMap[r.magnitude ?? "medium"];
          return (
            <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg"
              style={{ background: mag.bg, border: `1px solid ${mag.border}` }}>
              <span className="text-[9px] font-mono font-bold px-1 py-0.5 rounded shrink-0 mt-0.5"
                style={{ background: mag.color.replace(")", " / 0.2)"), color: mag.color }}>
                {mag.label}
              </span>
              <p className="text-xs leading-relaxed" style={{ color: "oklch(75% 0 0)" }}>{r.description}</p>
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
      <div className="bloomberg-card p-4 space-y-2 animate-pulse">
        <div className="h-4 rounded w-28" style={{ background: "var(--bloomberg-surface-3)" }} />
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map(i => <div key={i} className="h-14 rounded" style={{ background: "var(--bloomberg-surface-3)" }} />)}
        </div>
      </div>
    );
  }
  if (!answerObject) return null;

  const conf = answerObject.confidence;
  const verdict = answerObject.verdict?.toLowerCase() ?? "";

  const isBullish = verdict.includes("买入") || verdict.includes("看多") || verdict.includes("增持") || verdict.includes("buy") || verdict.includes("bullish");
  const isBearish = verdict.includes("卖出") || verdict.includes("看空") || verdict.includes("减持") || verdict.includes("sell") || verdict.includes("bearish");

  const signals = [
    {
      label: "Action",
      value: isBullish ? "BUY" : isBearish ? "SELL" : "HOLD",
      color: isBullish ? "oklch(0.72 0.18 142)" : isBearish ? "oklch(0.65 0.22 25)" : "oklch(0.72 0.18 75)",
      icon: isBullish ? TrendingUp : isBearish ? TrendingDown : Minus,
    },
    {
      label: "Conviction",
      value: conf === "high" ? "STRONG" : conf === "medium" ? "MODERATE" : "WEAK",
      color: conf === "high" ? "oklch(0.72 0.18 142)" : conf === "medium" ? "oklch(0.72 0.18 75)" : "oklch(0.65 0.22 25)",
      icon: Zap,
    },
    {
      label: "Horizon",
      value: "MID-TERM",
      color: "oklch(0.72 0.18 250)",
      icon: Clock,
    },
  ];

  return (
    <div className="bloomberg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-5 rounded-full" style={{ background: "oklch(0.72 0.18 142)" }} />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "oklch(50% 0 0)" }}>
          Decision Signals
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {signals.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="p-3 rounded-lg flex flex-col items-center gap-2"
              style={{ background: `${s.color.replace(")", " / 0.1)")}`, border: `1px solid ${s.color.replace(")", " / 0.25)")}` }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: `${s.color.replace(")", " / 0.15)")}` }}>
                <Icon className="w-4.5 h-4.5" style={{ color: s.color }} />
              </div>
              <span className="text-[12px] font-extrabold font-mono leading-none text-center" style={{ color: s.color }}>{s.value}</span>
              <span className="text-[9px] uppercase tracking-widest font-medium" style={{ color: "oklch(42% 0 0)" }}>{s.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Why It Matters Now Card */
function WhyItMattersNowCard({ discussionObject, isLoading }: {
  discussionObject?: NonNullable<NonNullable<Msg["metadata"]>["discussionObject"]>;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="bloomberg-card p-4 space-y-2 animate-pulse">
        <div className="h-4 rounded w-32" style={{ background: "var(--bloomberg-surface-3)" }} />
        <div className="h-16 rounded" style={{ background: "var(--bloomberg-surface-3)" }} />
      </div>
    );
  }
  if (!discussionObject?.key_uncertainty) return null;

  return (
    <div className="bloomberg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4" style={{ color: "var(--bloomberg-gold)" }} />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "oklch(50% 0 0)" }}>
          Why It Matters Now
        </span>
      </div>
      <div className="p-3 rounded-xl" style={{ background: "oklch(0.72 0.18 75 / 0.08)", border: "1px solid oklch(0.72 0.18 75 / 0.2)" }}>
        <p className="text-xs leading-relaxed" style={{ color: "oklch(75% 0 0)" }}>
          {discussionObject.key_uncertainty}
        </p>
      </div>
      {discussionObject.alternative_view && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "oklch(40% 0 0)" }}>
            Alternative View
          </p>
          <p className="text-xs leading-relaxed" style={{ color: "oklch(60% 0 0)" }}>
            {discussionObject.alternative_view}
          </p>
        </div>
      )}
    </div>
  );
}

/** Recommended Actions Card */
function RecommendedActionsCard({ answerObject, isLoading }: {
  answerObject?: NonNullable<NonNullable<Msg["metadata"]>["answerObject"]>;
  isLoading?: boolean;
}) {
  if (isLoading || !answerObject?.next_steps?.length) return null;

  return (
    <div className="bloomberg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Target className="w-4 h-4" style={{ color: "oklch(0.72 0.18 250)" }} />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "oklch(50% 0 0)" }}>
          Recommended Actions
        </span>
      </div>
      <div className="space-y-2">
        {answerObject.next_steps.map((s, i) => (
          <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg"
            style={{ background: "oklch(0.72 0.18 250 / 0.06)", border: "1px solid oklch(0.72 0.18 250 / 0.15)" }}>
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
              style={{ background: "oklch(0.72 0.18 250 / 0.2)", color: "oklch(0.72 0.18 250)" }}>
              {i + 1}
            </span>
            <p className="text-xs leading-relaxed" style={{ color: "oklch(72% 0 0)" }}>{s}</p>
          </div>
        ))}
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
  const popularTickers = ["AAPL", "TSLA", "NVDA", "MSFT", "AMZN", "GOOGL", "META", "BRK.B", "SPY", "QQQ"];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md" style={{ background: "var(--bloomberg-surface-1)", border: "1px solid var(--bloomberg-border-dim)" }}>
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold" style={{ color: "var(--bloomberg-text-primary)" }}>
            Instrument Selector
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "oklch(40% 0 0)" }} />
            <Input
              placeholder="搜索股票代码或公司名称..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 h-9 text-sm"
              style={{ background: "var(--bloomberg-surface-0)", border: "1px solid var(--bloomberg-border-dim)", color: "var(--bloomberg-text-primary)" }}
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
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "oklch(40% 0 0)" }}>
              常用标的
            </p>
            <div className="flex flex-wrap gap-1.5">
              {popularTickers.map(t => (
                <button key={t}
                  onClick={() => { onSelect(t); onClose(); }}
                  className="px-2.5 py-1 rounded text-xs font-mono font-medium transition-all hover:scale-105"
                  style={{ background: "var(--bloomberg-surface-2)", color: "var(--bloomberg-gold)", border: "1px solid var(--bloomberg-border-dim)" }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          {query.trim() && (
            <button
              onClick={() => { onSelect(query.trim().toUpperCase()); onClose(); }}
              className="w-full h-9 rounded-lg text-sm font-medium transition-all"
              style={{ background: "oklch(0.72 0.18 75 / 0.15)", color: "var(--bloomberg-gold)", border: "1px solid oklch(0.72 0.18 75 / 0.3)" }}>
              分析 {query.trim().toUpperCase()} →
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Customize Workspace Modal */
function CustomizeWorkspaceModal({ open, onClose, panelVisibility, onTogglePanel, columnWidths, onColumnWidthsChange, onSave }: {
  open: boolean;
  onClose: () => void;
  panelVisibility: Record<string, boolean>;
  onTogglePanel: (key: string) => void;
  columnWidths?: { sidebar: number; analysis: number; discussion: number; insight: number };
  onColumnWidthsChange?: (key: string, value: number) => void;
  onSave?: () => void;
}) {
  const [activeTab, setActiveTab] = React.useState<"panels" | "layout">("panels");
  const panels = [
    { key: "verdict", label: "AI Verdict Card", desc: "主要决策输出" },
    { key: "keyAnalysis", label: "Key Analysis", desc: "Bull/Bear/Macro 三栏" },
    { key: "riskPanel", label: "Risk Panel", desc: "风险因素列表" },
    { key: "decisionSignals", label: "Decision Signals", desc: "Action/Conviction/Horizon" },
    { key: "whyNow", label: "Why It Matters Now", desc: "时效性上下文" },
    { key: "recommendedActions", label: "Recommended Actions", desc: "建议行动步骤" },
    { key: "deepSections", label: "Deep Sections", desc: "高级分析模块" },
  ];
  const colDefs: Array<{ key: keyof NonNullable<typeof columnWidths>; label: string; min: number; max: number }> = [
    { key: "sidebar", label: "侧边栏", min: 160, max: 360 },
    { key: "analysis", label: "分析列", min: 220, max: 560 },
    { key: "discussion", label: "讨论列", min: 260, max: 560 },
    { key: "insight", label: "Insight 列", min: 200, max: 480 },
  ];
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm" style={{ background: "var(--bloomberg-surface-1)", border: "1px solid var(--bloomberg-border-dim)" }}>
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold" style={{ color: "var(--bloomberg-text-primary)" }}>
            Customize Workspace
          </DialogTitle>
        </DialogHeader>
        {/* Tab switcher */}
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: "var(--bloomberg-surface-2)" }}>
          {(["panels", "layout"] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className="flex-1 py-1 text-[11px] font-medium rounded-md transition-all"
              style={activeTab === t
                ? { background: "var(--bloomberg-surface-3)", color: "var(--bloomberg-gold)" }
                : { color: "oklch(45% 0 0)" }}>
              {t === "panels" ? "卡片显示" : "列宽布局"}
            </button>
          ))}
        </div>
        {activeTab === "panels" ? (
          <div className="space-y-2">
            {panels.map(p => (
              <div key={p.key} className="flex items-center justify-between p-2.5 rounded-lg"
                style={{ background: "var(--bloomberg-surface-2)", border: "1px solid var(--bloomberg-border-dim)" }}>
                <div>
                  <p className="text-xs font-medium" style={{ color: "var(--bloomberg-text-primary)" }}>{p.label}</p>
                  <p className="text-[10px]" style={{ color: "oklch(40% 0 0)" }}>{p.desc}</p>
                </div>
                <button
                  onClick={() => onTogglePanel(p.key)}
                  className="p-1.5 rounded transition-colors"
                  style={{ color: panelVisibility[p.key] ? "var(--bloomberg-gold)" : "oklch(35% 0 0)" }}>
                  {panelVisibility[p.key] ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {colDefs.map(col => (
              <div key={col.key} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium" style={{ color: "var(--bloomberg-text-secondary)" }}>{col.label}</span>
                  <span className="text-[11px] font-mono" style={{ color: "var(--bloomberg-gold)" }}>
                    {columnWidths?.[col.key] ?? col.min}px
                  </span>
                </div>
                <input
                  type="range"
                  min={col.min}
                  max={col.max}
                  step={10}
                  value={columnWidths?.[col.key] ?? col.min}
                  onChange={e => onColumnWidthsChange?.(col.key, Number(e.target.value))}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                  style={{ accentColor: "var(--bloomberg-gold)" }}
                />
                <div className="flex justify-between">
                  <span className="text-[9px]" style={{ color: "oklch(30% 0 0)" }}>{col.min}</span>
                  <span className="text-[9px]" style={{ color: "oklch(30% 0 0)" }}>{col.max}</span>
                </div>
              </div>
            ))}
            <Button
              onClick={onSave}
              className="w-full h-8 text-xs font-medium"
              style={{ background: "var(--bloomberg-gold)", color: "oklch(10% 0 0)" }}>
              保存列宽配置
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ResearchWorkspacePage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();

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
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [panelVisibility, setPanelVisibility] = useState<Record<string, boolean>>({
    verdict: true, keyAnalysis: true, riskPanel: true,
    decisionSignals: true, whyNow: true, recommendedActions: true, deepSections: false,
  });
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [deepSectionsTab, setDeepSectionsTab] = useState<"backtest" | "health" | "sentiment" | "alpha" | "portfolio" | "radar">("backtest");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [insightCollapsed, setInsightCollapsed] = useState(false);
  const [newConvTitle, setNewConvTitle] = useState("");
  const [showNewConvDialog, setShowNewConvDialog] = useState(false);
  const [analysisRefreshed, setAnalysisRefreshed] = useState(false);
  const [columnWidths, setColumnWidths] = useState<{sidebar: number; analysis: number; discussion: number; insight: number}>({
    sidebar: 220, analysis: 280, discussion: 380, insight: 260,
  });

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
  const { data: quoteData } = trpc.market.getQuote.useQuery(
    { symbol: currentTicker },
    {
      enabled: isAuthenticated && !!accessData?.hasAccess && !!currentTicker,
      refetchInterval: 30000, // 30秒刷新一次
      staleTime: 25000,
    }
  );
  const { data: rawConvMsgs, isLoading: _msgsLoading, refetch: refetchMsgs } = trpc.chat.getConversationMessages.useQuery(
    { conversationId: activeConvId! },
    {
      enabled: isAuthenticated && !!accessData?.hasAccess && activeConvId !== null,
      refetchInterval: isTyping ? 3000 : 5000,
    }
  );

  // ── Sync defaultCostMode from settings ──
  useEffect(() => {
    if (!rpaConfig?.defaultCostMode) return;
    const modeMap: Record<string, "quick" | "standard" | "deep"> = {
      A: "quick", B: "standard", C: "deep",
    };
    setAnalysisMode(modeMap[rpaConfig.defaultCostMode] ?? "standard");
  }, [rpaConfig?.defaultCostMode]);
  // ── Sync columnWidths from rpaConfig ──
  useEffect(() => {
    if (!rpaConfig?.columnWidths) return;
    const cw = rpaConfig.columnWidths as {sidebar?: number; analysis?: number; discussion?: number; insight?: number};
    setColumnWidths(prev => ({
      sidebar: cw.sidebar ?? prev.sidebar,
      analysis: cw.analysis ?? prev.analysis,
      discussion: cw.discussion ?? prev.discussion,
      insight: cw.insight ?? prev.insight,
    }));
  }, [rpaConfig?.columnWidths]);
  // ── Sync lastTicker from rpaConfig (cross-session persistence) ──
  const [tickerLoadedFromConfig, setTickerLoadedFromConfig] = useState(false);
  useEffect(() => {
    if (!rpaConfig || tickerLoadedFromConfig) return;
    const last = (rpaConfig as any).lastTicker as string | null | undefined;
    if (last && !currentTicker) {
      // User has a saved ticker — restore it
      setCurrentTicker(last);
    } else if (!last && !currentTicker) {
      // No saved ticker — pick a random default from watchlist so the workspace isn't blank
      const watchlist = (rpaConfig.userWatchlist as string[] | null) ?? [];
      const fallback = ["AAPL", "TSLA", "NVDA", "BTC", "MSFT", "AMZN"];
      const pool = watchlist.length > 0 ? watchlist : fallback;
      const randomTicker = pool[Math.floor(Math.random() * pool.length)];
      setCurrentTicker(randomTicker);
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
      if (data?.taskId) {
        setActiveTaskId(data.taskId);
        startSSE(data.taskId);
      }
      if (data?.conversationId && !activeConvId) {
        setActiveConvId(data.conversationId);
        refetchConvs();
      }
    },
    onError: (err) => {
      toast.error(err.message);
      setSending(false);
      setIsTyping(false);
    },
  });
  const saveConfigMutation = trpc.rpa.setConfig.useMutation({
    onError: (err) => toast.error("保存失败: " + err.message),
  });
  const saveConfigWithToastMutation = trpc.rpa.setConfig.useMutation({
    onSuccess: () => toast.success("工作台配置已保存"),
    onError: (err) => toast.error("保存失败: " + err.message),
  });
  // ── Persist currentTicker when it changes ──
  const prevTickerRef = useRef("");
  useEffect(() => {
    if (!currentTicker || currentTicker === prevTickerRef.current || !tickerLoadedFromConfig) return;
    prevTickerRef.current = currentTicker;
    saveConfigMutation.mutate({ lastTicker: currentTicker });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTicker, tickerLoadedFromConfig]);
  const pinConvMutation = trpc.conversation.pin.useMutation({ onSuccess: () => refetchConvs(), onError: (err) => toast.error(err.message) });
  const favoriteConvMutation = trpc.conversation.favorite.useMutation({ onSuccess: () => refetchConvs(), onError: (err) => toast.error(err.message) });
  const deleteConvMutation = trpc.conversation.delete.useMutation({
    onSuccess: () => {
      refetchConvs();
      setActiveConvId(null);
    },
    onError: (err) => toast.error(err.message),
  });

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
          refetchMsgs();
          refetchConvs();
          // 触发分析列刷新动画
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
      id: m.id,
      role: m.role as Msg["role"],
      content: m.content,
      createdAt: new Date(m.createdAt),
      taskId: m.taskId,
      metadata: m.metadata as Msg["metadata"],
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
  useEffect(() => {
    if (convMessages.length > 0) {
      const t = extractTickerFromMessages(convMessages);
      if (t) setCurrentTicker(t);
    }
  }, [convMessages]);

  // ── Submit ──
  const handleSubmit = useCallback((text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;
    if (!text) setInput("");
    setSending(true);
    setIsTyping(true);
    setTaskPhase("manus_working");
    const userMsg: Msg = {
      id: Date.now(),
      role: "user",
      content: msg,
      createdAt: new Date(),
    };
    setConvMessages(prev => [...prev, userMsg]);
    submitMutation.mutate({
      title: msg,
      conversationId: activeConvId ?? undefined,
      analysisMode,
    });
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
  // ── Parse specialized card data from last assistant message ──
  const alphaFactorsData = useMemo(() => {
    if (!lastAssistantMsg?.content) return null;
    return parseAlphaFactors(lastAssistantMsg.content);
  }, [lastAssistantMsg?.content]);
  const healthScoreData = useMemo(() => {
    if (!lastAssistantMsg?.content) return null;
    return parseHealthScore(lastAssistantMsg.content);
  }, [lastAssistantMsg?.content]);
  const newsItemsForCards = useMemo(() => {
    const meta = lastAssistantMsg?.metadata as Record<string, unknown> | undefined | null;
    if (meta?.newsItems && Array.isArray(meta.newsItems)) {
      return (meta.newsItems as Array<{ title: string; description?: string; source?: string; url?: string; publishedAt?: string }>)
        .map(n => ({ ...n, publishedAt: n.publishedAt ?? "" }));
    }
    return [];
  }, [lastAssistantMsg?.metadata]);
  const tickerForCards = alphaFactorsData?.payload?.ticker ?? currentTicker ?? "";

  const activeConvTitle = useMemo(() => {
    if (!activeConvId || !allConversations) return null;
    return allConversations.find(c => c.id === activeConvId)?.title || `对话 #${activeConvId}`;
  }, [activeConvId, allConversations]);

  // Conversation grouping
  const { pinnedConvs, favoritedConvs, normalConvs } = useMemo(() => {
    const convs = allConversations ?? [];
    const sorted = [...convs].sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
    return {
      pinnedConvs: sorted.filter(c => c.isPinned),
      favoritedConvs: sorted.filter(c => !c.isPinned && c.isFavorited),
      normalConvs: sorted.filter(c => !c.isPinned && !c.isFavorited),
    };
  }, [allConversations]);

  // Quick prompts based on ticker
  const quickPrompts = useMemo(() => {
    if (currentTicker) {
      return [
        `${currentTicker} 的估值是否合理？`,
        `${currentTicker} 最大的风险因素是什么？`,
        `${currentTicker} 的护城河如何评估？`,
        `${currentTicker} 近期有哪些重要催化剂？`,
      ];
    }
    return [
      "分析当前宏观经济环境",
      "美联储政策对市场的影响",
      "当前最值得关注的行业机会",
      "全球市场风险评估",
    ];
  }, [currentTicker]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bloomberg-surface-0)" }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--bloomberg-gold)" }} />
      </div>
    );
  }

  if (!isAuthenticated) {
    navigate("/");
    return null;
  }

  // ── Render ──
  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: "var(--bloomberg-surface-0)", fontFamily: "var(--font-sans)" }}>
      {/* ── Pinned Metrics Top Bar ── */}
      {currentTicker && quoteData && (
        <div className="flex items-center gap-4 px-4 py-1.5 shrink-0 overflow-x-auto"
          style={{ background: "var(--bloomberg-surface-1)", borderBottom: "1px solid var(--bloomberg-border-dim)" }}>
          {/* Ticker + Price */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-mono font-bold" style={{ color: "var(--bloomberg-gold)" }}>{currentTicker}</span>
            <span className="text-[13px] font-mono font-semibold" style={{ color: "var(--bloomberg-text-primary)" }}>
              {quoteData.price != null ? `$${quoteData.price.toFixed(2)}` : "—"}
            </span>
            {quoteData.changePercent != null && (
              <span className="text-[11px] font-mono font-medium px-1.5 py-0.5 rounded"
                style={{
                  background: quoteData.changePercent >= 0 ? "oklch(0.65 0.18 145 / 0.15)" : "oklch(0.65 0.18 25 / 0.15)",
                  color: quoteData.changePercent >= 0 ? "oklch(0.72 0.18 145)" : "oklch(0.72 0.18 25)",
                }}>
                {quoteData.changePercent >= 0 ? "▲" : "▼"} {Math.abs(quoteData.changePercent).toFixed(2)}%
              </span>
            )}
          </div>
          <div className="w-px h-4 shrink-0" style={{ background: "var(--bloomberg-border-dim)" }} />
          {/* Metrics row */}
          {[
            { label: "开盘", value: quoteData.open != null ? `$${quoteData.open.toFixed(2)}` : "—" },
            { label: "最高", value: quoteData.high != null ? `$${quoteData.high.toFixed(2)}` : "—" },
            { label: "最低", value: quoteData.low != null ? `$${quoteData.low.toFixed(2)}` : "—" },
            { label: "前收", value: quoteData.prevClose != null ? `$${quoteData.prevClose.toFixed(2)}` : "—" },
            { label: "PE", value: quoteData.pe != null ? quoteData.pe.toFixed(1) : "—" },
            { label: "PB", value: quoteData.pb != null ? quoteData.pb.toFixed(2) : "—" },
            // Finnhub roeTTM is already a percentage value (e.g. 159.94 = 159.94%), NOT a decimal
            { label: "ROE", value: quoteData.roe != null ? `${quoteData.roe.toFixed(1)}%` : "—" },
            { label: "EPS", value: quoteData.eps != null ? `$${quoteData.eps.toFixed(2)}` : "—" },
          ].map(m => (
            <div key={m.label} className="flex items-center gap-2 shrink-0 px-2 py-0.5 rounded"
              style={{ background: "oklch(12% 0 0 / 0.5)" }}>
              <span className="text-[9px] uppercase tracking-widest font-medium" style={{ color: "oklch(38% 0 0)" }}>{m.label}</span>
              <span className="text-[12px] font-mono font-medium" style={{ color: "var(--bloomberg-text-primary)" }}>{m.value}</span>
            </div>
          ))}
          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "oklch(0.72 0.18 145)" }} />
            <span className="text-[9px]" style={{ color: "oklch(35% 0 0)" }}>LIVE · 30s</span>
          </div>
        </div>
      )}
      {/* ── 4-Column workspace ── */}
      <div className="flex flex-1 overflow-hidden">
      {/* ── Modals (rendered outside columns to avoid layout issues) ── */}
      <InstrumentSelectorModal
        open={showInstrumentModal}
        onClose={() => setShowInstrumentModal(false)}
        onSelect={(ticker) => {
          setCurrentTicker(ticker);
          handleSubmit(`深度分析 ${ticker}：估值、基本面、风险和投资建议`);
        }}
      />

      {/* ── Customize Workspace Modal ── */}
      <CustomizeWorkspaceModal
        open={showCustomizeModal}
        onClose={() => setShowCustomizeModal(false)}
        panelVisibility={panelVisibility}
        columnWidths={columnWidths}
        onColumnWidthsChange={(key, value) => setColumnWidths(prev => ({ ...prev, [key]: value }))}
        onSave={() => saveConfigWithToastMutation.mutate({ columnWidths })}
        onTogglePanel={(key) => setPanelVisibility(prev => ({ ...prev, [key]: !prev[key] }))}
      />

      {/* ════════════════════════════════════════════════════════════
          COLUMN 1: Conversation Sidebar
      ════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col shrink-0 transition-all duration-200"
        style={{
          width: sidebarCollapsed ? "48px" : `${columnWidths.sidebar}px`,
          background: "var(--bloomberg-surface-1)",
          borderRight: "1px solid var(--bloomberg-border-dim)",
        }}>
        {/* Sidebar Header */}
        <div className="flex items-center justify-between px-3 py-2.5 shrink-0"
          style={{ borderBottom: "1px solid var(--bloomberg-border-dim)" }}>
          {!sidebarCollapsed && (
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "oklch(40% 0 0)" }}>
              Research
            </span>
          )}
          <div className="flex items-center gap-1 ml-auto">
            {!sidebarCollapsed && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={() => setShowNewConvDialog(true)}
                    className="p-1 rounded transition-colors hover:bg-white/5"
                    style={{ color: "oklch(50% 0 0)" }}>
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>新建对话</TooltipContent>
              </Tooltip>
            )}
            <button onClick={() => setSidebarCollapsed(v => !v)}
              className="p-1 rounded transition-colors hover:bg-white/5"
              style={{ color: "oklch(50% 0 0)" }}>
              {sidebarCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* New Conv Dialog */}
        {showNewConvDialog && !sidebarCollapsed && (
          <div className="p-2 shrink-0" style={{ borderBottom: "1px solid var(--bloomberg-border-dim)" }}>
            <Input
              placeholder="对话标题（可选）"
              value={newConvTitle}
              onChange={(e) => setNewConvTitle(e.target.value)}
              className="h-7 text-xs mb-1.5"
              style={{ background: "var(--bloomberg-surface-0)", border: "1px solid var(--bloomberg-border-dim)", color: "var(--bloomberg-text-primary)" }}
              onKeyDown={(e) => {
                if (e.key === "Enter")    createConvMutation.mutate({ title: newConvTitle || undefined });              if (e.key === "Escape") { setShowNewConvDialog(false); setNewConvTitle(""); }
              }}
              autoFocus
            />
            <div className="flex gap-1">
              <button
                onClick={() => createConvMutation.mutate({ title: newConvTitle || undefined })}
                disabled={createConvMutation.isPending}
                className="flex-1 h-6 text-[10px] rounded transition-colors"
                style={{ background: "oklch(0.72 0.18 75 / 0.15)", color: "var(--bloomberg-gold)", border: "1px solid oklch(0.72 0.18 75 / 0.3)" }}>
                创建
              </button>
              <button onClick={() => { setShowNewConvDialog(false); setNewConvTitle(""); }}
                className="flex-1 h-6 text-[10px] rounded transition-colors hover:bg-white/5"
                style={{ color: "oklch(40% 0 0)", border: "1px solid var(--bloomberg-border-dim)" }}>
                取消
              </button>
            </div>
          </div>
        )}

        {/* Conv List */}
        {!sidebarCollapsed && (
          <div className="flex-1 overflow-y-auto py-1">
            {/* Pinned */}
            {pinnedConvs.length > 0 && (
              <div className="mb-1">
                <div className="px-3 py-1 flex items-center gap-1">
                  <Pin className="w-2.5 h-2.5" style={{ color: "oklch(40% 0 0)" }} />
                  <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "oklch(35% 0 0)" }}>置顶</span>
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
            {/* Favorited */}
            {favoritedConvs.length > 0 && (
              <div className="mb-1">
                <div className="px-3 py-1 flex items-center gap-1">
                  <Star className="w-2.5 h-2.5" style={{ color: "oklch(40% 0 0)" }} />
                  <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "oklch(35% 0 0)" }}>收藏</span>
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
            {/* Normal */}
            {normalConvs.length > 0 && (
              <div>
                <div className="px-3 py-1">
                  <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "oklch(30% 0 0)" }}>对话</span>
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
                <MessageSquare className="w-6 h-6" style={{ color: "oklch(25% 0 0)" }} />
                <p className="text-[10px] text-center" style={{ color: "oklch(30% 0 0)" }}>
                  点击 + 开始新的研究对话
                </p>
              </div>
            )}
          </div>
        )}

        {/* Collapsed: just icons */}
        {sidebarCollapsed && (
          <div className="flex flex-col items-center gap-2 py-2">
            <button onClick={() => setShowNewConvDialog(true)}
              className="p-1.5 rounded transition-colors hover:bg-white/5"
              style={{ color: "oklch(50% 0 0)" }}>
              <Plus className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════
          COLUMN 2: Analysis Column (center-left)
      ════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden"
        style={{
          borderRight: "1px solid var(--bloomberg-border-dim)",
          transition: "box-shadow 0.3s ease",
          boxShadow: analysisRefreshed ? "inset 0 0 0 1px var(--bloomberg-gold)" : "none",
        }}>
        {/* Analysis Header */}
        <div className="flex items-center justify-between px-4 py-2.5 shrink-0"
          style={{ background: "var(--bloomberg-surface-1)", borderBottom: "1px solid var(--bloomberg-border-dim)" }}>
          <div className="flex items-center gap-3">
            {/* Analysis refreshed badge */}
            {analysisRefreshed && (
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded animate-pulse"
                style={{ background: "oklch(0.65 0.18 145 / 0.2)", color: "oklch(0.72 0.18 145)", border: "1px solid oklch(0.65 0.18 145 / 0.4)" }}>
                ✓ 分析已更新
              </span>
            )}
            {/* Ticker badge */}
            <button onClick={() => setShowInstrumentModal(true)}
              className="flex items-center gap-2 px-2.5 py-1 rounded-lg transition-all hover:scale-[1.02]"
              style={{ background: currentTicker ? "oklch(0.72 0.18 75 / 0.12)" : "var(--bloomberg-surface-2)", border: `1px solid ${currentTicker ? "oklch(0.72 0.18 75 / 0.3)" : "var(--bloomberg-border-dim)"}` }}>
              <Search className="w-3 h-3" style={{ color: currentTicker ? "var(--bloomberg-gold)" : "oklch(40% 0 0)" }} />
              <span className="text-xs font-mono font-semibold" style={{ color: currentTicker ? "var(--bloomberg-gold)" : "oklch(40% 0 0)" }}>
                {currentTicker || "SELECT INSTRUMENT"}
              </span>
            </button>
            {/* Context header */}
            {activeConvTitle && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px]" style={{ color: "oklch(30% 0 0)" }}>·</span>
                <span className="text-[10px] truncate max-w-[180px]" style={{ color: "oklch(42% 0 0)" }}>
                  {activeConvTitle}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Analysis mode */}
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg"
              style={{ background: "var(--bloomberg-surface-0)", border: "1px solid var(--bloomberg-border-dim)" }}>
              {(["quick", "standard", "deep"] as const).map((m) => (
                <button key={m} onClick={() => setAnalysisMode(m)}
                  className="px-2 py-0.5 rounded text-[10px] font-medium transition-all"
                  style={{
                    background: analysisMode === m ? "var(--bloomberg-surface-3)" : "transparent",
                    color: analysisMode === m ? "var(--bloomberg-gold)" : "oklch(35% 0 0)",
                  }}>
                  {m === "quick" ? "A" : m === "standard" ? "B" : "C"}
                </button>
              ))}
            </div>
            <button onClick={() => setShowCustomizeModal(true)}
              className="p-1.5 rounded transition-colors hover:bg-white/5"
              style={{ color: "oklch(40% 0 0)" }}>
              <Sliders className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Analysis Panels — scrollable */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {panelVisibility.verdict && (
            <AIVerdictCard
              answerObject={answerObject}
              outputMode={outputMode}
              evidenceScore={evidenceScore}
              isLoading={isTyping && !answerObject}
            />
          )}
          {panelVisibility.keyAnalysis && answerObject && (
            <KeyAnalysisCard answerObject={answerObject} isLoading={isTyping && !answerObject} />
          )}
          {panelVisibility.riskPanel && risks && risks.length > 0 && (
            <RiskPanel risks={risks} isLoading={isTyping && !answerObject} />
          )}
          {panelVisibility.deepSections && answerObject && (
            <div className="bloomberg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <FlaskConical className="w-4 h-4" style={{ color: "oklch(0.72 0.18 250)" }} />
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "oklch(50% 0 0)" }}>
                  Deep Sections
                </span>
              </div>
              <div className="flex gap-1 flex-wrap">
                {(["backtest", "health", "sentiment", "alpha", "portfolio", "radar"] as const).map(t => (
                  <button key={t} onClick={() => setDeepSectionsTab(t)}
                    className="px-2.5 py-1 rounded text-[10px] font-medium transition-all"
                    style={{
                      background: deepSectionsTab === t ? "var(--bloomberg-surface-3)" : "transparent",
                      color: deepSectionsTab === t ? "var(--bloomberg-gold)" : "oklch(35% 0 0)",
                      border: `1px solid ${deepSectionsTab === t ? "var(--bloomberg-border-bright)" : "var(--bloomberg-border-dim)"}`,
                    }}>
                    {t === "backtest" ? "因子回测" : t === "health" ? "健康评分" : t === "sentiment" ? "情绪分析" : t === "alpha" ? "Alpha因子" : t === "portfolio" ? "模拟交易" : "趋势雷达"}
                  </button>
                ))}
              </div>
              <div>
                {deepSectionsTab === "backtest" && (
                  <BacktestCard ticker={tickerForCards || "AAPL"} spot={100} sigma={0.25} />
                )}
                {deepSectionsTab === "health" && healthScoreData && (
                  <HealthScoreCard payload={healthScoreData.payload} />
                )}
                {deepSectionsTab === "health" && !healthScoreData && (
                  <div className="p-3 rounded-lg text-xs text-center" style={{ background: "var(--bloomberg-surface-2)", color: "oklch(40% 0 0)" }}>
                    健康评分模块：请先分析一个标的以生成评分数据
                  </div>
                )}
                {deepSectionsTab === "sentiment" && (
                  <SentimentNLPCard ticker={tickerForCards || "AAPL"} newsItems={newsItemsForCards} />
                )}
                {deepSectionsTab === "alpha" && alphaFactorsData && (
                  <AlphaFactorCard payload={alphaFactorsData.payload} />
                )}
                {deepSectionsTab === "alpha" && !alphaFactorsData && (
                  <div className="p-3 rounded-lg text-xs text-center" style={{ background: "var(--bloomberg-surface-2)", color: "oklch(40% 0 0)" }}>
                    Alpha 因子模块：请先分析一个标的以生成因子数据
                  </div>
                )}
                {deepSectionsTab === "portfolio" && (
                  <AlpacaPortfolioCard />
                )}
                {deepSectionsTab === "radar" && (
                  <TrendRadarCard
                    ticker={tickerForCards || "AAPL"}
                    newsItems={newsItemsForCards}
                    userWatchlist={currentTicker ? [currentTicker] : []}
                    onWatchlistChange={() => {}}
                  />
                )}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!answerObject && !isTyping && (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: "var(--bloomberg-surface-2)", border: "1px solid var(--bloomberg-border-dim)" }}>
                <BarChart2 className="w-6 h-6" style={{ color: "oklch(30% 0 0)" }} />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium" style={{ color: "oklch(45% 0 0)" }}>分析结果将显示在这里</p>
                <p className="text-xs" style={{ color: "oklch(30% 0 0)" }}>在右侧讨论栏输入分析请求</p>
              </div>
              <button onClick={() => setShowInstrumentModal(true)}
                className="px-4 py-2 rounded-lg text-xs font-medium transition-all hover:scale-[1.02]"
                style={{ background: "oklch(0.72 0.18 75 / 0.12)", color: "var(--bloomberg-gold)", border: "1px solid oklch(0.72 0.18 75 / 0.3)" }}>
                选择分析标的 →
              </button>
            </div>
          )}

          {/* Loading state */}
          {isTyping && !answerObject && (
            <div className="space-y-3">
              <AIVerdictCard isLoading />
              <KeyAnalysisCard isLoading />
              <DecisionSignalsCard isLoading />
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          COLUMN 3: Discussion Column (center-right)
      ════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col shrink-0 overflow-hidden"
        style={{
          width: `${columnWidths.discussion}px`,
          background: "var(--bloomberg-surface-0)",
          borderRight: "1px solid var(--bloomberg-border-dim)",
        }}>
        {/* Discussion Header */}
        <div className="flex items-center justify-between px-3 py-2 shrink-0"
          style={{ background: "var(--bloomberg-surface-1)", borderBottom: "1px solid var(--bloomberg-border-dim)" }}>
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare className="w-3.5 h-3.5 shrink-0" style={{ color: "oklch(0.72 0.18 250)" }} />
            <span className="text-xs font-semibold shrink-0" style={{ color: "var(--bloomberg-text-primary)" }}>Discussion</span>
            {currentTicker && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0"
                style={{ background: "oklch(0.72 0.18 75 / 0.12)", color: "var(--bloomberg-gold)", border: "1px solid oklch(0.72 0.18 75 / 0.3)" }}>
                {currentTicker}
              </span>
            )}
            {/* Active conversation title — truncated, shown as tooltip */}
            {activeConvId && allConversations && (() => {
              const conv = allConversations.find(c => c.id === activeConvId);
              return conv?.title ? (
                <span className="text-[10px] truncate" style={{ color: "oklch(38% 0 0)", maxWidth: 120 }}
                  title={conv.title}>
                  {conv.title}
                </span>
              ) : null;
            })()}
          </div>
          {/* Pipeline indicator OR mode badge */}
          {isTyping ? (
            <div className="flex items-center gap-1 shrink-0">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--bloomberg-gold)" }} />
              <span className="text-[10px] font-mono" style={{ color: "var(--bloomberg-gold)" }}>
                {taskPhase === "manus_working" ? "理解" :
                  taskPhase === "planning" ? "规划" :
                  taskPhase === "source_selection" ? "选源" :
                  taskPhase === "manus_analyzing" ? "获取" :
                  taskPhase === "evidence_eval" ? "验证" :
                  taskPhase === "multi_agent" ? "协作" :
                  taskPhase === "gpt_reviewing" ? "综合" :
                  taskPhase === "discussion" ? "生成" : "处理"}
              </span>
            </div>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
              style={{ background: "var(--bloomberg-surface-2)", color: "oklch(40% 0 0)", border: "1px solid var(--bloomberg-border-dim)" }}>
              Mode {analysisMode === "quick" ? "A" : analysisMode === "standard" ? "B" : "C"}
            </span>
          )}
        </div>

        {/* Messages */}
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-3 space-y-3 relative">
          {convMessages.length === 0 && !isTyping ? (
            <div className="flex flex-col gap-3 py-4 px-1">
              {/* Welcome header */}
              <div className="flex items-center gap-2 mb-1">
                <div className="w-6 h-6 rounded flex items-center justify-center shrink-0"
                  style={{ background: "oklch(78% 0.18 75 / 0.12)", border: "1px solid oklch(78% 0.18 75 / 0.25)" }}>
                  <Zap className="w-3.5 h-3.5" style={{ color: "var(--bloomberg-gold)" }} />
                </div>
                <div>
                  <p className="text-xs font-semibold" style={{ color: "var(--bloomberg-text-primary)" }}>
                    DanTree Terminal
                  </p>
                  <p className="text-[10px]" style={{ color: "oklch(40% 0 0)" }}>
                    {currentTicker ? `当前标的：${currentTicker}` : "请先选择标的"}
                  </p>
                </div>
              </div>

              {/* Quick start examples */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "oklch(35% 0 0)" }}>快速开始</p>
                {[
                  { icon: "🔍", label: `深度分析 ${currentTicker || "AAPL"}`, desc: "全面基本面 + 技术面分析" },
                  { icon: "⚖️", label: `${currentTicker || "AAPL"} 估值是否合理？`, desc: "PE/PB/DCF 多维估值" },
                  { icon: "⚠️", label: `${currentTicker || "AAPL"} 的主要风险`, desc: "风险因素识别与量化" },
                  { icon: "📊", label: `${currentTicker || "AAPL"} 护城河评估`, desc: "竞争优势与可持续性" },
                ].map((item, i) => (
                  <button key={i}
                    onClick={() => handleSubmit(item.label)}
                    className="w-full text-left px-3 py-2 rounded-lg transition-all hover:scale-[1.01] group"
                    style={{ background: "var(--bloomberg-surface-2)", border: "1px solid var(--bloomberg-border-dim)" }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = "oklch(78% 0.18 75 / 0.3)")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--bloomberg-border-dim)")}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{item.icon}</span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium truncate" style={{ color: "var(--bloomberg-text-primary)" }}>{item.label}</p>
                        <p className="text-[10px]" style={{ color: "oklch(40% 0 0)" }}>{item.desc}</p>
                      </div>
                      <ChevronRight className="w-3 h-3 ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--bloomberg-gold)" }} />
                    </div>
                  </button>
                ))}
              </div>

              {/* Tip */}
              <div className="px-3 py-2 rounded-lg" style={{ background: "oklch(78% 0.18 75 / 0.05)", border: "1px solid oklch(78% 0.18 75 / 0.12)" }}>
                <p className="text-[10px]" style={{ color: "oklch(50% 0 0)" }}>
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
                    style={{ background: "var(--bloomberg-gold)", animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
              <span className="text-[10px]" style={{ color: "oklch(35% 0 0)" }}>AI 分析中…</span>
            </div>
          )}
          <div ref={messagesEndRef} />

          {/* Jump to bottom */}
          {showJumpToBottom && (
            <button
              onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })}
              className="sticky bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:scale-105 shadow-lg"
              style={{ background: "var(--bloomberg-surface-3)", color: "var(--bloomberg-gold)", border: "1px solid var(--bloomberg-border-bright)" }}>
              <ArrowDown className="w-3 h-3" />
              最新消息
            </button>
          )}
        </div>

        {/* Quick Prompts */}
        <div className="px-3 py-2 shrink-0 overflow-x-auto"
          style={{ borderTop: "1px solid var(--bloomberg-border-dim)" }}>
          <div className="flex gap-1.5 pb-0.5">
            {quickPrompts.map((q, i) => (
              <button key={i} onClick={() => handleSubmit(q)}
                disabled={sending}
                className="shrink-0 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all hover:scale-[1.02] disabled:opacity-50"
                style={{ background: "var(--bloomberg-surface-2)", color: "oklch(55% 0 0)", border: "1px solid var(--bloomberg-border-dim)", whiteSpace: "nowrap" }}>
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Input */}
        <div className="px-3 pb-3 pt-2 shrink-0"
          style={{ borderTop: "1px solid var(--bloomberg-border-dim)" }}>
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
                background: "var(--bloomberg-surface-2)",
                border: "1px solid var(--bloomberg-border-dim)",
                color: "var(--bloomberg-text-primary)",
                fontFamily: "var(--font-sans)",
              }}
            />
            <button
              onClick={() => handleSubmit()}
              disabled={!input.trim() || sending}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:scale-105 disabled:opacity-40 self-end"
              style={{ background: "oklch(0.72 0.18 75 / 0.2)", color: "var(--bloomberg-gold)", border: "1px solid oklch(0.72 0.18 75 / 0.4)" }}>
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          COLUMN 4: Insight Column (right)
      ════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col shrink-0 overflow-hidden transition-all duration-200"
        style={{
          width: insightCollapsed ? "40px" : `${columnWidths.insight}px`,
          background: "var(--bloomberg-surface-1)",
        }}>
        {/* Insight Header */}
        <div className="flex items-center justify-between px-3 py-2.5 shrink-0"
          style={{ borderBottom: "1px solid var(--bloomberg-border-dim)" }}>
          {!insightCollapsed && (
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "oklch(40% 0 0)" }}>
              Insights
            </span>
          )}
          <button onClick={() => setInsightCollapsed(v => !v)}
            className="p-1 rounded transition-colors hover:bg-white/5 ml-auto"
            style={{ color: "oklch(40% 0 0)" }}>
            {insightCollapsed ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Insight Panels */}
        {!insightCollapsed && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {panelVisibility.decisionSignals && (
              <DecisionSignalsCard answerObject={answerObject} isLoading={isTyping && !answerObject} />
            )}
            {panelVisibility.whyNow && (
              <WhyItMattersNowCard discussionObject={discussionObject} isLoading={isTyping && !discussionObject} />
            )}
            {panelVisibility.recommendedActions && (
              <RecommendedActionsCard answerObject={answerObject} isLoading={isTyping && !answerObject} />
            )}

            {/* Discussion insights */}
            {discussionObject && (
              <div className="bloomberg-card p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4" style={{ color: "oklch(0.72 0.18 250)" }} />
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "oklch(50% 0 0)" }}>
                    Discussion Insights
                  </span>
                </div>
                {discussionObject.weakest_point && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "oklch(40% 0 0)" }}>
                      Weakest Point
                    </p>
                    <p className="text-xs leading-relaxed" style={{ color: "oklch(65% 0 0)" }}>
                      {discussionObject.weakest_point}
                    </p>
                  </div>
                )}
                {(discussionObject.follow_up_questions?.length ?? 0) > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "oklch(40% 0 0)" }}>
                      Follow-up Questions
                    </p>
                    {discussionObject.follow_up_questions.slice(0, 3).map((q, i) => (
                      <button key={i} onClick={() => handleSubmit(q)} disabled={sending}
                        className="w-full text-left p-2 rounded-lg text-[10px] leading-relaxed transition-all hover:scale-[1.01] disabled:opacity-50"
                        style={{ background: "oklch(0.72 0.18 250 / 0.06)", color: "oklch(0.72 0.18 250)", border: "1px solid oklch(0.72 0.18 250 / 0.15)" }}>
                        → {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Navigation shortcuts */}
            <div className="bloomberg-card p-3 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "oklch(35% 0 0)" }}>
                Quick Access
              </p>
              {[
                { icon: BarChart2, label: "因子回测", path: "/backtest" },
                { icon: Wallet, label: "资产负债表", path: "/networth" },
                { icon: BookOpen, label: "投资知识库", path: "/library" },
                { icon: Settings, label: "设置", path: "/settings" },
              ].map(({ icon: Icon, label, path }) => (
                <button key={path} onClick={() => navigate(path)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all hover:bg-white/5"
                  style={{ color: "oklch(45% 0 0)" }}>
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{label}</span>
                </button>
              ))}
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
        background: isActive ? "oklch(0.72 0.18 75 / 0.08)" : hovered ? "oklch(100% 0 0 / 0.03)" : "transparent",
        borderLeft: isActive ? "2px solid var(--bloomberg-gold)" : "2px solid transparent",
      }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex-1 min-w-0">
        <p className="text-xs truncate" style={{ color: isActive ? "var(--bloomberg-text-primary)" : "oklch(50% 0 0)" }}>
          {conv.title ?? `对话 #${conv.id}`}
        </p>
        <p className="text-[9px]" style={{ color: "oklch(28% 0 0)" }}>
          {new Date(conv.lastMessageAt).toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}
        </p>
      </div>
      {/* Action buttons on hover */}
      {hovered && (
        <div className="flex items-center gap-0.5 ml-1 shrink-0">
          <button onClick={(e) => { e.stopPropagation(); onPin(); }}
            className="p-0.5 rounded transition-colors hover:bg-white/10"
            style={{ color: conv.isPinned ? "var(--bloomberg-gold)" : "oklch(35% 0 0)" }}>
            <Pin className="w-2.5 h-2.5" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onFavorite(); }}
            className="p-0.5 rounded transition-colors hover:bg-white/10"
            style={{ color: conv.isFavorited ? "oklch(0.72 0.18 75)" : "oklch(35% 0 0)" }}>
            <Star className="w-2.5 h-2.5" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-0.5 rounded transition-colors hover:bg-white/10"
            style={{ color: "oklch(35% 0 0)" }}>
            <Trash2 className="w-2.5 h-2.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Discussion Message ────────────────────────────────────────────────────────

function DiscussionMessage({ msg, onFollowup }: { msg: Msg; onFollowup?: (q: string) => void }) {
  const isUser = msg.role === "user";
  const isSystem = msg.role === "system";
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <span className="text-[10px] px-2 py-0.5 rounded-full"
          style={{ background: "var(--bloomberg-surface-2)", color: "oklch(35% 0 0)" }}>
          {msg.content}
        </span>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-tr-sm text-xs"
          style={{ background: "oklch(0.72 0.18 250 / 0.12)", color: "var(--bloomberg-text-primary)", border: "1px solid oklch(0.72 0.18 250 / 0.2)" }}>
          {msg.content}
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="space-y-2">
      <div className="group relative">
        <div className="text-xs leading-relaxed prose prose-invert max-w-none"
          style={{ color: "oklch(78% 0 0)" }}>
          <Streamdown>{msg.content}</Streamdown>
        </div>
        {/* Copy button */}
        <button onClick={handleCopy}
          className="absolute top-0 right-0 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: "oklch(40% 0 0)" }}>
          {copied ? <CheckCircle className="w-3 h-3" style={{ color: "oklch(0.72 0.18 142)" }} /> : <Copy className="w-3 h-3" />}
        </button>
      </div>

      {/* Discussion follow-up questions inline */}
      {msg.metadata?.discussionObject?.follow_up_questions && msg.metadata.discussionObject.follow_up_questions.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {msg.metadata.discussionObject.follow_up_questions.slice(0, 2).map((q, i) => (
            <button key={i} onClick={() => onFollowup?.(q)}
              className="px-2 py-0.5 rounded-full text-[10px] transition-all hover:scale-[1.02]"
              style={{ background: "oklch(0.72 0.18 250 / 0.08)", color: "oklch(0.72 0.18 250)", border: "1px solid oklch(0.72 0.18 250 / 0.2)" }}>
              {q.slice(0, 28)}{q.length > 28 ? "…" : ""}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
