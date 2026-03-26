/**
 * LEVEL2D: Loop Summary Badge
 * Renders an expandable badge showing LEVEL2 reasoning loop results.
 * MODULE_ID: LEVEL2D_LOOP_SUMMARY_BADGE
 */

import { useState } from "react";
import { Brain, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface LoopMetadata {
  loop_ran: boolean;
  iterations_completed: number;
  stop_reason: string;
  convergence_signal: string;
  evidence_score_before: number;
  evidence_score_after: number;
  evidence_score_delta: number;
  confidence_before: string;
  confidence_after: string;
  verdict_changed: boolean;
  change_type: string;
  loop_summary: string;
}

interface LoopSummaryBadgeProps {
  meta: LoopMetadata;
}

export function LoopSummaryBadge({ meta }: LoopSummaryBadgeProps) {
  const [expanded, setExpanded] = useState(false);

  const verdictColor = meta.verdict_changed
    ? "oklch(0.72 0.18 35)"    // amber — changed
    : "oklch(0.65 0.18 145)";  // green — reinforced

  const verdictBg = meta.verdict_changed
    ? "oklch(0.72 0.18 35 / 0.1)"
    : "oklch(0.65 0.18 145 / 0.1)";

  const verdictBorder = meta.verdict_changed
    ? "oklch(0.72 0.18 35 / 0.35)"
    : "oklch(0.65 0.18 145 / 0.35)";

  const deltaSign = meta.evidence_score_delta > 0 ? "+" : "";
  const deltaColor = meta.evidence_score_delta > 0
    ? "oklch(0.65 0.18 145)"
    : meta.evidence_score_delta < 0
      ? "oklch(0.65 0.18 25)"
      : "oklch(0.6 0 0)";

  const DeltaIcon = meta.evidence_score_delta > 0.01
    ? TrendingUp
    : meta.evidence_score_delta < -0.01
      ? TrendingDown
      : Minus;

  return (
    <div className="mb-2 rounded-lg overflow-hidden w-fit max-w-full"
      style={{ border: `1px solid ${verdictBorder}`, background: verdictBg }}>
      {/* ── Badge Header (always visible) ── */}
      <button
        className="flex items-center gap-2 px-3 py-1.5 text-xs w-full text-left"
        style={{ color: verdictColor }}
        onClick={() => setExpanded(v => !v)}
      >
        <Brain className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="font-medium">LEVEL2 推理循环</span>
        <span className="mx-1 opacity-50">·</span>
        {meta.verdict_changed ? (
          <span className="font-semibold">判断已更新 ({meta.change_type})</span>
        ) : (
          <span>判断已强化</span>
        )}
        <span className="mx-1 opacity-50">·</span>
        <DeltaIcon className="w-3 h-3" style={{ color: deltaColor }} />
        <span style={{ color: deltaColor }}>
          {deltaSign}{(meta.evidence_score_delta * 100).toFixed(1)}% 证据
        </span>
        <span className="ml-auto pl-2 opacity-60">
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </span>
      </button>

      {/* ── Expanded Detail Panel ── */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 text-xs space-y-2"
          style={{ borderTop: `1px solid ${verdictBorder}`, color: "oklch(0.75 0 0)" }}>
          {/* Evidence Score Row */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="opacity-60">证据评分</span>
            <span>{(meta.evidence_score_before * 100).toFixed(1)}%</span>
            <span className="opacity-40">→</span>
            <span style={{ color: verdictColor }}>{(meta.evidence_score_after * 100).toFixed(1)}%</span>
            <span className="opacity-40">|</span>
            <span className="opacity-60">置信度</span>
            <span>{meta.confidence_before}</span>
            <span className="opacity-40">→</span>
            <span style={{ color: verdictColor }}>{meta.confidence_after}</span>
          </div>
          {/* Convergence Signal */}
          <div className="flex items-center gap-2">
            <span className="opacity-60">收敛信号</span>
            <span className="px-1.5 py-0.5 rounded text-xs font-mono"
              style={{ background: "oklch(0.2 0 0 / 0.4)", border: "1px solid oklch(0.4 0 0 / 0.3)" }}>
              {meta.convergence_signal}
            </span>
            <span className="opacity-40">|</span>
            <span className="opacity-60">停止原因</span>
            <span className="font-mono opacity-80">{meta.stop_reason}</span>
          </div>
          {/* Loop Summary */}
          {meta.loop_summary && (
            <div className="mt-1 pt-2 leading-relaxed opacity-90"
              style={{ borderTop: `1px solid ${verdictBorder}` }}>
              {meta.loop_summary}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
