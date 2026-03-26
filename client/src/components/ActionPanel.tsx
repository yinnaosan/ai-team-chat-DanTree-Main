/**
 * ActionPanel — LEVEL4 Action Engine UI
 * ─────────────────────────────────────────────────────────────────────────────
 * Displays the actionable investment decision for the current analysis.
 * STATE (large) · TIMING SIGNAL (color coded) · WHY (collapsible) · TIMING (compact)
 *
 * Usage:
 *   <ActionPanel messageId={msg.id} ticker="AAPL" />
 */

import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, Zap, TrendingUp, TrendingDown, Minus, AlertTriangle, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

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

const STATE_CONFIG: Record<ActionState, { label: string; bg: string; text: string; border: string; icon: React.ReactNode }> = {
  BUY: {
    label: "BUY",
    bg: "bg-emerald-950/60",
    text: "text-emerald-300",
    border: "border-emerald-500/40",
    icon: <TrendingUp className="w-5 h-5" />,
  },
  HOLD: {
    label: "HOLD",
    bg: "bg-sky-950/60",
    text: "text-sky-300",
    border: "border-sky-500/40",
    icon: <Minus className="w-5 h-5" />,
  },
  SELL: {
    label: "SELL",
    bg: "bg-red-950/60",
    text: "text-red-300",
    border: "border-red-500/40",
    icon: <TrendingDown className="w-5 h-5" />,
  },
  WAIT: {
    label: "WAIT",
    bg: "bg-amber-950/60",
    text: "text-amber-300",
    border: "border-amber-500/40",
    icon: <AlertTriangle className="w-5 h-5" />,
  },
  SELECT: {
    label: "SELECT",
    bg: "bg-violet-950/60",
    text: "text-violet-300",
    border: "border-violet-500/40",
    icon: <Zap className="w-5 h-5" />,
  },
};

const TIMING_CONFIG: Record<TimingSignal, { dot: string; text: string; label: string }> = {
  "STRONG ENTRY": { dot: "bg-emerald-400", text: "text-emerald-300", label: "STRONG ENTRY" },
  "BUILD ENTRY":  { dot: "bg-sky-400",     text: "text-sky-300",     label: "BUILD ENTRY" },
  "WAIT":         { dot: "bg-amber-400",   text: "text-amber-300",   label: "WAIT" },
  "EXTENDED":     { dot: "bg-orange-400",  text: "text-orange-300",  label: "EXTENDED" },
  "EXIT RISK":    { dot: "bg-red-400",     text: "text-red-300",     label: "EXIT RISK" },
};

const CYCLE_CONFIG: Record<CyclePhase, { bar: string; label: string }> = {
  Early:   { bar: "bg-emerald-500", label: "Early" },
  Mid:     { bar: "bg-sky-500",     label: "Mid" },
  Late:    { bar: "bg-amber-500",   label: "Late" },
  Decline: { bar: "bg-red-500",     label: "Decline" },
};

const CYCLE_PHASES: CyclePhase[] = ["Early", "Mid", "Late", "Decline"];

// ── Sub-components ────────────────────────────────────────────────────────────

function StateBadge({ state }: { state: ActionState }) {
  const cfg = STATE_CONFIG[state];
  return (
    <div className={cn("flex items-center gap-2 px-4 py-2 rounded-lg border", cfg.bg, cfg.border)}>
      <span className={cn("", cfg.text)}>{cfg.icon}</span>
      <span className={cn("text-2xl font-black tracking-widest font-mono", cfg.text)}>{cfg.label}</span>
    </div>
  );
}

function TimingSignalBadge({ signal }: { signal: TimingSignal }) {
  const cfg = TIMING_CONFIG[signal];
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("w-2 h-2 rounded-full animate-pulse", cfg.dot)} />
      <span className={cn("text-xs font-bold tracking-widest font-mono", cfg.text)}>{cfg.label}</span>
    </div>
  );
}

function CycleBar({ cycle }: { cycle: CyclePhase }) {
  const idx = CYCLE_PHASES.indexOf(cycle);
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-[#4a5568] font-mono uppercase tracking-widest">CYCLE</span>
      <div className="flex gap-0.5">
        {CYCLE_PHASES.map((p, i) => (
          <div
            key={p}
            className={cn(
              "h-1.5 w-6 rounded-sm transition-all",
              i <= idx ? CYCLE_CONFIG[cycle].bar : "bg-[#2a2f3a]"
            )}
          />
        ))}
      </div>
      <span className={cn("text-[10px] font-bold font-mono", CYCLE_CONFIG[cycle].bar.replace("bg-", "text-"))}>
        {cycle.toUpperCase()}
      </span>
    </div>
  );
}

function WhyBlock({ why }: { why: Level4ActionResult["why"] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-[#2a2f3a] rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-[#1a1f2e]/60 hover:bg-[#1e2436]/80 transition-colors"
      >
        <span className="text-[10px] font-bold tracking-widest text-[#8892a4] font-mono uppercase">WHY</span>
        {open ? <ChevronUp className="w-3 h-3 text-[#4a5568]" /> : <ChevronDown className="w-3 h-3 text-[#4a5568]" />}
      </button>
      {open && (
        <div className="px-3 py-2 space-y-2 bg-[#0f1117]/40">
          {[
            { label: "Surface", value: why.surface },
            { label: "Trend",   value: why.trend },
            { label: "Hidden",  value: why.hidden },
          ].map(({ label, value }) => (
            <div key={label} className="space-y-0.5">
              <div className="text-[9px] font-bold tracking-widest text-[#4a5568] font-mono uppercase">{label}</div>
              <div className="text-[11px] text-[#a0aec0] leading-relaxed">{value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TimingBlock({ indicators }: { indicators: Level4ActionResult["timingIndicators"] }) {
  const [open, setOpen] = useState(false);

  const rsiColor =
    (indicators.rsi.value ?? 50) > 70 ? "text-red-400" :
    (indicators.rsi.value ?? 50) < 30 ? "text-emerald-400" :
    "text-[#8892a4]";

  const macdColor =
    indicators.macd.direction === "bullish" ? "text-emerald-400" :
    indicators.macd.direction === "bearish" ? "text-red-400" :
    "text-[#8892a4]";

  const volColor =
    indicators.volume.signal === "confirmation" ? "text-emerald-400" :
    indicators.volume.signal === "divergence" ? "text-red-400" :
    "text-[#8892a4]";

  return (
    <div className="border border-[#2a2f3a] rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-[#1a1f2e]/60 hover:bg-[#1e2436]/80 transition-colors"
      >
        <span className="text-[10px] font-bold tracking-widest text-[#8892a4] font-mono uppercase">TIMING</span>
        {open ? <ChevronUp className="w-3 h-3 text-[#4a5568]" /> : <ChevronDown className="w-3 h-3 text-[#4a5568]" />}
      </button>
      {open && (
        <div className="px-3 py-2 bg-[#0f1117]/40 grid grid-cols-2 gap-x-3 gap-y-1.5">
          {/* RSI */}
          <div className="flex items-center justify-between col-span-2">
            <span className="text-[9px] text-[#4a5568] font-mono uppercase tracking-widest">RSI</span>
            <span className={cn("text-[11px] font-bold font-mono", rsiColor)}>
              {indicators.rsi.value != null ? indicators.rsi.value.toFixed(1) : "—"}
              <span className="text-[9px] font-normal text-[#4a5568] ml-1">{indicators.rsi.interpretation}</span>
            </span>
          </div>
          {/* MACD */}
          <div className="flex items-center justify-between col-span-2">
            <span className="text-[9px] text-[#4a5568] font-mono uppercase tracking-widest">MACD</span>
            <span className={cn("text-[11px] font-bold font-mono uppercase", macdColor)}>
              {indicators.macd.direction}
              <span className="text-[9px] font-normal text-[#4a5568] ml-1">{indicators.macd.note}</span>
            </span>
          </div>
          {/* MA */}
          <div className="flex items-center justify-between col-span-2">
            <span className="text-[9px] text-[#4a5568] font-mono uppercase tracking-widest">MA</span>
            <span className="text-[11px] font-mono text-[#8892a4] uppercase">
              {indicators.movingAverage.position}
              <span className="text-[9px] font-normal text-[#4a5568] ml-1">{indicators.movingAverage.levels}</span>
            </span>
          </div>
          {/* Bollinger */}
          <div className="flex items-center justify-between col-span-2">
            <span className="text-[9px] text-[#4a5568] font-mono uppercase tracking-widest">BB</span>
            <span className="text-[11px] font-mono text-[#8892a4] uppercase">
              {indicators.bollinger.position}
              <span className="text-[9px] font-normal text-[#4a5568] ml-1">{indicators.bollinger.note}</span>
            </span>
          </div>
          {/* Volume */}
          <div className="flex items-center justify-between col-span-2">
            <span className="text-[9px] text-[#4a5568] font-mono uppercase tracking-widest">VOL</span>
            <span className={cn("text-[11px] font-bold font-mono uppercase", volColor)}>
              {indicators.volume.signal}
              <span className="text-[9px] font-normal text-[#4a5568] ml-1">{indicators.volume.note}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionBlock({ action }: { action: Level4ActionResult["action"] }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {[
        { label: "ENTRY",     value: action.entry },
        { label: "SIZING",    value: action.sizing },
        { label: "EXECUTION", value: action.execution },
      ].map(({ label, value }) => (
        <div key={label} className="bg-[#1a1f2e]/60 border border-[#2a2f3a] rounded-md px-2 py-1.5 text-center">
          <div className="text-[8px] text-[#4a5568] font-mono uppercase tracking-widest mb-0.5">{label}</div>
          <div className="text-[11px] font-bold text-[#c0cce0] font-mono uppercase">{value}</div>
        </div>
      ))}
    </div>
  );
}

function RisksBlock({ risks }: { risks: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-[#2a2f3a] rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-[#1a1f2e]/60 hover:bg-[#1e2436]/80 transition-colors"
      >
        <span className="text-[10px] font-bold tracking-widest text-[#8892a4] font-mono uppercase">
          RISK <span className="text-[#4a5568]">({risks.length})</span>
        </span>
        {open ? <ChevronUp className="w-3 h-3 text-[#4a5568]" /> : <ChevronDown className="w-3 h-3 text-[#4a5568]" />}
      </button>
      {open && (
        <div className="px-3 py-2 space-y-1.5 bg-[#0f1117]/40">
          {risks.map((r, i) => (
            <div key={i} className="flex gap-2 items-start">
              <span className="text-[10px] text-red-500/60 font-mono mt-0.5">▸</span>
              <span className="text-[11px] text-[#a0aec0] leading-relaxed">{r}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface ActionPanelProps {
  messageId: number;
  ticker: string;
  className?: string;
  initialResult?: Level4ActionResult | null;
}

export function ActionPanel({ messageId, ticker, className, initialResult }: ActionPanelProps) {
  // ── State ────────────────────────────────────────────────────────────────────
  // initialResult is the persisted value from DB metadata.
  // We track the previous messageId to detect conversation switches and
  // reset local state so stale results from another conversation never leak.
  const prevMessageIdRef = useRef<number>(messageId);
  const [result, setResult] = useState<Level4ActionResult | null>(initialResult ?? null);
  const [error, setError] = useState<string | null>(null);
  const [autoFailed, setAutoFailed] = useState(false);

  // ── Rehydration fix ──────────────────────────────────────────────────────────
  // When messageId changes (conversation switch / new analysis), sync from the
  // new initialResult prop. This is the key fix: useState() only runs once on
  // mount, so we must explicitly sync on prop changes.
  useEffect(() => {
    if (messageId !== prevMessageIdRef.current) {
      prevMessageIdRef.current = messageId;
      // Reset to new conversation's persisted result (may be null for old convs)
      setResult(initialResult ?? null);
      setError(null);
      setAutoFailed(false);
    }
  }, [messageId, initialResult]);

  // ── Detect auto-generation failure ──────────────────────────────────────────
  // If analysis is complete (initialResult was expected but is null after a
  // short delay), show a lightweight failure indicator.
  const hasAnalysisResult = !!(initialResult === undefined ? false : initialResult === null);
  useEffect(() => {
    if (initialResult === null && messageId > 0) {
      // Give the auto-trigger a moment; if still null, mark as auto-failed
      const t = setTimeout(() => setAutoFailed(true), 500);
      return () => clearTimeout(t);
    } else {
      setAutoFailed(false);
    }
  }, [initialResult, messageId]);

  const mutation = trpc.chat.getLevel4Action.useMutation({
    onSuccess: (data) => {
      setResult(data as Level4ActionResult);
      setError(null);
      setAutoFailed(false);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleGenerate = () => {
    setError(null);
    mutation.mutate({ messageId, ticker });
  };

  // ── Idle state ──────────────────────────────────────────────────────────────
  if (!result && !mutation.isPending) {
    return (
      <div className={cn("border border-[#2a2f3a] rounded-xl bg-[#0f1117]/60 p-3", className)}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-[#4a5568]" />
            <span className="text-[10px] font-bold tracking-widest text-[#4a5568] font-mono uppercase">ACTION ENGINE</span>
          </div>
          <span className="text-[9px] text-[#2a3040] font-mono">LEVEL4</span>
        </div>
        {/* Lightweight failure notice — non-blocking */}
        {autoFailed && !error && (
          <div className="text-[10px] text-[#4a5568] mb-2 px-1 font-mono">行动层暂未生成</div>
        )}
        {error && (
          <div className="text-[10px] text-red-400/70 mb-2 px-1">{error}</div>
        )}
        <button
          onClick={handleGenerate}
          className="w-full py-2 rounded-lg border border-[#2a2f3a] bg-[#1a1f2e]/60 hover:bg-[#1e2436]/80 hover:border-[#3a4050] transition-all text-[10px] font-bold tracking-widest text-[#8892a4] font-mono uppercase flex items-center justify-center gap-1.5"
        >
          <Zap className="w-3 h-3" />
          GENERATE ACTION DECISION
        </button>
      </div>
    );
  }

  // ── Loading state ───────────────────────────────────────────────────────────
  if (mutation.isPending) {
    return (
      <div className={cn("border border-[#2a2f3a] rounded-xl bg-[#0f1117]/60 p-3", className)}>
        <div className="flex items-center gap-2 py-3 justify-center">
          <RefreshCw className="w-3.5 h-3.5 text-[#4a5568] animate-spin" />
          <span className="text-[10px] text-[#4a5568] font-mono uppercase tracking-widest">ANALYZING {ticker}...</span>
        </div>
      </div>
    );
  }

  // ── Result state ────────────────────────────────────────────────────────────
  if (!result) return null;

  const stateConfig = STATE_CONFIG[result.state];
  const timingConfig = TIMING_CONFIG[result.timingSignal];

  return (
    <div className={cn("border rounded-xl bg-[#0f1117]/80 overflow-hidden", stateConfig.border, className)}>
      {/* Header bar */}
      <div className={cn("flex items-center justify-between px-3 py-2 border-b", stateConfig.bg, stateConfig.border)}>
        <div className="flex items-center gap-1.5">
          <Zap className="w-3 h-3 text-[#4a5568]" />
          <span className="text-[9px] font-bold tracking-widest text-[#4a5568] font-mono uppercase">ACTION ENGINE</span>
          <span className="text-[9px] text-[#2a3040] font-mono">· LEVEL4</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-[#4a5568] font-mono">{ticker}</span>
          <button
            onClick={handleGenerate}
            className="text-[#2a3040] hover:text-[#4a5568] transition-colors"
            title="Regenerate"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* 1. STATE — primary decision badge */}
        <div className="flex items-center justify-between gap-2">
          <StateBadge state={result.state} />
          <TimingSignalBadge signal={result.timingSignal} />
        </div>

        {/* 2. ACTION — execution instructions, immediately below STATE */}
        <ActionBlock action={result.action} />

        {/* 3. WHY — three-layer reasoning: Surface / Trend / Hidden */}
        <WhyBlock why={result.why} />

        {/* 4. CYCLE — business/market cycle phase */}
        <div className="flex items-center justify-between px-3 py-2 border border-[#2a2f3a] rounded-lg bg-[#1a1f2e]/60">
          <span className="text-[10px] font-bold tracking-widest text-[#8892a4] font-mono uppercase">CYCLE</span>
          <CycleBar cycle={result.cycle} />
        </div>

        {/* 5. TIMING — five indicators collapsible */}
        <TimingBlock indicators={result.timingIndicators} />

        {/* 6. RISKS collapsible */}
        <RisksBlock risks={result.risks} />

        {/* Footer metadata */}
        <div className="flex items-center justify-between pt-1 border-t border-[#1a1f2e]">
          <div className="flex items-center gap-2">
            {result.sourceMetadata.evidenceScore != null && (
              <span className="text-[9px] text-[#2a3040] font-mono">
                EV:{result.sourceMetadata.evidenceScore}
              </span>
            )}
            {result.sourceMetadata.confidence && (
              <span className="text-[9px] text-[#2a3040] font-mono uppercase">
                {result.sourceMetadata.confidence}
              </span>
            )}
          </div>
          <span className="text-[9px] text-[#2a3040] font-mono">
            {new Date(result.generatedAt).toLocaleTimeString()}
          </span>
        </div>
      </div>
    </div>
  );
}

export default ActionPanel;
