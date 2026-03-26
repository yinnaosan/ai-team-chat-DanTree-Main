/**
 * DecisionStrip — Global decision-first entry point
 *
 * Renders as a sticky horizontal strip at the TOP of Column 2 (Analysis),
 * BEFORE AIVerdictCard. This makes Level4 output the primary reading surface.
 *
 * Reading order enforced:
 *   当前状态 → 行动建议 → 为什么 → 周期阶段 → 时机信号 → 风险
 *
 * Deep analysis (AIVerdictCard) appears BELOW this strip.
 */

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, Minus, AlertTriangle, Zap,
  ChevronDown, ChevronUp, RefreshCw,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

// ── Types (mirrored from server/level4ActionEngine.ts) ────────────────────────

type ActionState = "SELECT" | "WAIT" | "BUY" | "HOLD" | "SELL";
type CyclePhase = "Early" | "Mid" | "Late" | "Decline";
type TimingSignal = "STRONG ENTRY" | "BUILD ENTRY" | "WAIT" | "EXTENDED" | "EXIT RISK";

interface Level4ActionResult {
  ticker: string;
  state: ActionState;
  why: { surface: string; trend: string; hidden: string };
  cycle: CyclePhase;
  timingIndicators: {
    rsi: { value: number | null; interpretation: string };
    macd: { direction: "bullish" | "bearish" | "neutral"; note: string };
    movingAverage: { position: "above" | "below" | "at"; levels: string };
    bollinger: { position: "upper" | "mid" | "lower"; note: string };
    volume: { signal: "confirmation" | "divergence" | "neutral"; note: string };
  };
  timingSignal: TimingSignal;
  action: { entry: string; sizing: string; execution: string };
  risks: string[];
  generatedAt: number;
  sourceMetadata: {
    evidenceScore: number | null;
    outputMode: string | null;
    verdict: string | null;
    confidence: string | null;
  };
}

// ── Color maps ────────────────────────────────────────────────────────────────

const STATE_CONFIG: Record<ActionState, {
  label: string; cnLabel: string;
  bg: string; text: string; border: string; dimBg: string;
  icon: React.ReactNode;
}> = {
  BUY: {
    label: "BUY", cnLabel: "买入",
    bg: "bg-emerald-500", text: "text-emerald-300", border: "border-emerald-500/40",
    dimBg: "bg-emerald-950/60",
    icon: <TrendingUp className="w-4 h-4" />,
  },
  HOLD: {
    label: "HOLD", cnLabel: "持有",
    bg: "bg-sky-500", text: "text-sky-300", border: "border-sky-500/40",
    dimBg: "bg-sky-950/60",
    icon: <Minus className="w-4 h-4" />,
  },
  SELL: {
    label: "SELL", cnLabel: "卖出",
    bg: "bg-red-500", text: "text-red-300", border: "border-red-500/40",
    dimBg: "bg-red-950/60",
    icon: <TrendingDown className="w-4 h-4" />,
  },
  WAIT: {
    label: "WAIT", cnLabel: "等待",
    bg: "bg-amber-500", text: "text-amber-300", border: "border-amber-500/40",
    dimBg: "bg-amber-950/60",
    icon: <AlertTriangle className="w-4 h-4" />,
  },
  SELECT: {
    label: "SELECT", cnLabel: "观察",
    bg: "bg-violet-500", text: "text-violet-300", border: "border-violet-500/40",
    dimBg: "bg-violet-950/60",
    icon: <Zap className="w-4 h-4" />,
  },
};

const TIMING_CONFIG: Record<TimingSignal, { dot: string; text: string }> = {
  "STRONG ENTRY": { dot: "bg-emerald-400", text: "text-emerald-300" },
  "BUILD ENTRY":  { dot: "bg-sky-400",     text: "text-sky-300" },
  "WAIT":         { dot: "bg-amber-400",   text: "text-amber-300" },
  "EXTENDED":     { dot: "bg-orange-400",  text: "text-orange-300" },
  "EXIT RISK":    { dot: "bg-red-400",     text: "text-red-300" },
};

const CYCLE_CONFIG: Record<CyclePhase, { bar: string; cn: string }> = {
  Early:   { bar: "bg-emerald-500", cn: "早期" },
  Mid:     { bar: "bg-sky-500",     cn: "中期" },
  Late:    { bar: "bg-amber-500",   cn: "晚期" },
  Decline: { bar: "bg-red-500",     cn: "衰退" },
};

const CYCLE_PHASES: CyclePhase[] = ["Early", "Mid", "Late", "Decline"];

// ── Props ─────────────────────────────────────────────────────────────────────

interface DecisionStripProps {
  messageId: number;
  ticker: string;
  initialResult?: Level4ActionResult | null;
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DecisionStrip({ messageId, ticker, initialResult, className }: DecisionStripProps) {
  const [result, setResult] = useState<Level4ActionResult | null>(initialResult ?? null);
  const [expanded, setExpanded] = useState(false);
  const [autoFailed, setAutoFailed] = useState(false);
  const prevMsgIdRef = useRef<number>(messageId);

  const mutation = trpc.chat.getLevel4Action.useMutation({
    onSuccess: (data) => {
      if (data) setResult(data as Level4ActionResult);
    },
  });

  // ── Rehydration: sync when conversation switches ──────────────────────────
  useEffect(() => {
    if (messageId !== prevMsgIdRef.current) {
      prevMsgIdRef.current = messageId;
      setResult(initialResult ?? null);
      setAutoFailed(false);
    }
  }, [messageId, initialResult]);

  // ── Failure detection ─────────────────────────────────────────────────────
  useEffect(() => {
    if (initialResult === null && messageId > 0) {
      const t = setTimeout(() => setAutoFailed(true), 600);
      return () => clearTimeout(t);
    } else {
      setAutoFailed(false);
    }
  }, [initialResult, messageId]);

  const handleRegenerate = () => {
    if (!ticker || messageId <= 0) return;
    mutation.mutate({ messageId, ticker });
  };

  // ── No message yet ────────────────────────────────────────────────────────
  if (!messageId || messageId <= 0) return null;

  // ── Loading ───────────────────────────────────────────────────────────────
  if (mutation.isPending) {
    return (
      <div className={cn(
        "w-full shrink-0 border-b border-[#1e2436] bg-[#0a0d14]/90",
        className
      )}>
        <div className="flex items-center gap-2 px-4 py-3">
          <RefreshCw className="w-3.5 h-3.5 text-[#4a5568] animate-spin" />
          <span className="text-[10px] text-[#4a5568] font-mono uppercase tracking-widest">
            GENERATING DECISION FOR {ticker}...
          </span>
        </div>
      </div>
    );
  }

  // ── No result (idle / failed) ─────────────────────────────────────────────
  if (!result) {
    return (
      <div className={cn(
        "w-full shrink-0 border-b border-[#1e2436] bg-[#0a0d14]/80",
        className
      )}>
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 rounded-full bg-[#2a3040]" />
            <span className="text-[10px] font-bold tracking-widest text-[#2a3040] font-mono uppercase">
              决策层
            </span>
            {autoFailed && (
              <span className="text-[10px] text-[#4a5568] font-mono">行动层暂未生成</span>
            )}
          </div>
          <button
            onClick={handleRegenerate}
            className="flex items-center gap-1 px-2 py-1 rounded border border-[#2a2f3a] bg-[#1a1f2e]/60 hover:bg-[#1e2436]/80 transition-all text-[9px] font-bold tracking-widest text-[#4a5568] font-mono uppercase"
          >
            <Zap className="w-2.5 h-2.5" />
            生成决策
          </button>
        </div>
      </div>
    );
  }

  // ── Result ────────────────────────────────────────────────────────────────
  const stateConfig = STATE_CONFIG[result.state];
  const timingConfig = TIMING_CONFIG[result.timingSignal];
  const cycleConfig = CYCLE_CONFIG[result.cycle];
  const cycleIdx = CYCLE_PHASES.indexOf(result.cycle);

  return (
    <div className={cn(
      "w-full shrink-0 border-b-2 overflow-hidden transition-all duration-300",
      stateConfig.border,
      "bg-[#080b12]",
      className
    )}>
      {/* ── Collapsed bar (always visible) ─────────────────────────────── */}
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-3 cursor-pointer select-none",
          "hover:bg-white/[0.02] transition-colors"
        )}
        onClick={() => setExpanded(v => !v)}
      >
        {/* Left accent bar */}
        <div className={cn("w-0.5 h-6 rounded-full shrink-0", stateConfig.bg)} />
        {/* STATE badge */}
        <div className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-md border shrink-0",
          stateConfig.dimBg, stateConfig.border
        )}>
          <span className={stateConfig.text}>{stateConfig.icon}</span>
          <span className={cn("text-sm font-black tracking-widest font-mono", stateConfig.text)}>
            {stateConfig.label}
          </span>
          <span className={cn("text-[10px] font-medium font-mono opacity-70", stateConfig.text)}>
            {stateConfig.cnLabel}
          </span>
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-[#2a2f3a] shrink-0" />

        {/* ACTION summary — inline */}
        <div className="flex items-center gap-3 flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[9px] text-[#3a4558] font-mono uppercase tracking-widest">行动建议</span>
            <span className="text-[11px] font-bold text-[#c0cce0] font-mono uppercase truncate max-w-[140px]">
              {result.action.entry}
            </span>
          </div>
          <div className="w-px h-3 bg-[#2a2f3a] shrink-0" />
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[9px] text-[#3a4558] font-mono uppercase tracking-widest">时机信号</span>
            <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse shrink-0", timingConfig.dot)} />
            <span className={cn("text-[10px] font-bold font-mono", timingConfig.text)}>
              {result.timingSignal}
            </span>
          </div>
          <div className="w-px h-3 bg-[#2a2f3a] shrink-0" />
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[9px] text-[#3a4558] font-mono uppercase tracking-widest">周期阶段</span>
            <span className={cn("text-[10px] font-bold font-mono", cycleConfig.bar.replace("bg-", "text-"))}>
              {cycleConfig.cn}
            </span>
          </div>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); handleRegenerate(); }}
            className="text-[#2a3040] hover:text-[#4a5568] transition-colors p-0.5"
            title="重新生成"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
          <div className="text-[#2a3040]">
            {expanded
              ? <ChevronUp className="w-3.5 h-3.5" />
              : <ChevronDown className="w-3.5 h-3.5" />
            }
          </div>
        </div>
      </div>

      {/* ── Expanded detail panel ───────────────────────────────────────── */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 grid grid-cols-3 gap-3 border-t border-[#1e2436]">

          {/* Column A: 行动建议 */}
          <div className="space-y-2">
            <div className="text-[9px] font-bold tracking-widest text-[#4a5568] font-mono uppercase mb-1.5">
              行动建议
            </div>
            {[
              { label: "入场", value: result.action.entry },
              { label: "仓位", value: result.action.sizing },
              { label: "执行", value: result.action.execution },
            ].map(({ label, value }) => (
              <div key={label} className="bg-[#1a1f2e]/60 border border-[#2a2f3a] rounded-md px-2.5 py-1.5">
                <div className="text-[8px] text-[#4a5568] font-mono uppercase tracking-widest mb-0.5">{label}</div>
                <div className="text-[11px] font-bold text-[#c0cce0] font-mono uppercase">{value}</div>
              </div>
            ))}
          </div>

          {/* Column B: 为什么 */}
          <div className="space-y-2">
            <div className="text-[9px] font-bold tracking-widest text-[#4a5568] font-mono uppercase mb-1.5">
              为什么
            </div>
            {[
              { label: "表面", value: result.why.surface },
              { label: "趋势", value: result.why.trend },
              { label: "隐含", value: result.why.hidden },
            ].map(({ label, value }) => (
              <div key={label} className="space-y-0.5">
                <div className="text-[9px] font-bold tracking-widest text-[#4a5568] font-mono uppercase">
                  {label}
                </div>
                <div className="text-[11px] text-[#a0aec0] leading-relaxed">{value}</div>
              </div>
            ))}
          </div>

          {/* Column C: 周期 + 时机信号 + 风险 */}
          <div className="space-y-3">
            {/* 周期阶段 */}
            <div>
              <div className="text-[9px] font-bold tracking-widest text-[#4a5568] font-mono uppercase mb-1.5">
                周期阶段
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex gap-0.5">
                  {CYCLE_PHASES.map((p, i) => (
                    <div
                      key={p}
                      className={cn(
                        "h-1.5 w-8 rounded-sm transition-all",
                        i <= cycleIdx ? cycleConfig.bar : "bg-[#2a2f3a]"
                      )}
                    />
                  ))}
                </div>
                <span className={cn(
                  "text-[10px] font-bold font-mono",
                  cycleConfig.bar.replace("bg-", "text-")
                )}>
                  {cycleConfig.cn}
                </span>
              </div>
            </div>

            {/* 时机信号 — 5 indicators */}
            <div>
              <div className="text-[9px] font-bold tracking-widest text-[#4a5568] font-mono uppercase mb-1.5">
                时机信号
              </div>
              <div className="space-y-1">
                {[
                  {
                    label: "RSI",
                    value: result.timingIndicators.rsi.value != null
                      ? result.timingIndicators.rsi.value.toFixed(1)
                      : "—",
                    note: result.timingIndicators.rsi.interpretation,
                    color: (result.timingIndicators.rsi.value ?? 50) > 70
                      ? "text-red-400"
                      : (result.timingIndicators.rsi.value ?? 50) < 30
                        ? "text-emerald-400"
                        : "text-[#8892a4]",
                  },
                  {
                    label: "MACD",
                    value: result.timingIndicators.macd.direction.toUpperCase(),
                    note: result.timingIndicators.macd.note,
                    color: result.timingIndicators.macd.direction === "bullish"
                      ? "text-emerald-400"
                      : result.timingIndicators.macd.direction === "bearish"
                        ? "text-red-400"
                        : "text-[#8892a4]",
                  },
                  {
                    label: "MA",
                    value: result.timingIndicators.movingAverage.position.toUpperCase(),
                    note: result.timingIndicators.movingAverage.levels,
                    color: "text-[#8892a4]",
                  },
                  {
                    label: "Boll",
                    value: result.timingIndicators.bollinger.position.toUpperCase(),
                    note: result.timingIndicators.bollinger.note,
                    color: "text-[#8892a4]",
                  },
                  {
                    label: "Vol",
                    value: result.timingIndicators.volume.signal.toUpperCase(),
                    note: result.timingIndicators.volume.note,
                    color: result.timingIndicators.volume.signal === "confirmation"
                      ? "text-emerald-400"
                      : result.timingIndicators.volume.signal === "divergence"
                        ? "text-red-400"
                        : "text-[#8892a4]",
                  },
                ].map(({ label, value, note, color }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-[9px] text-[#4a5568] font-mono uppercase tracking-widest w-8 shrink-0">
                      {label}
                    </span>
                    <span className={cn("text-[10px] font-bold font-mono", color)}>
                      {value}
                    </span>
                    <span className="text-[9px] text-[#3a4050] font-mono truncate ml-1 max-w-[80px]">
                      {note}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 风险 */}
            {result.risks.length > 0 && (
              <div>
                <div className="text-[9px] font-bold tracking-widest text-[#4a5568] font-mono uppercase mb-1.5">
                  风险 ({result.risks.length})
                </div>
                <div className="space-y-1">
                  {result.risks.slice(0, 3).map((r, i) => (
                    <div key={i} className="flex gap-1.5 items-start">
                      <span className="text-[9px] text-red-500/50 font-mono mt-0.5 shrink-0">▸</span>
                      <span className="text-[10px] text-[#8892a4] leading-relaxed line-clamp-2">{r}</span>
                    </div>
                  ))}
                  {result.risks.length > 3 && (
                    <div className="text-[9px] text-[#3a4050] font-mono">
                      +{result.risks.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default DecisionStrip;
