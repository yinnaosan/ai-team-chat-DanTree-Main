/**
 * LEVEL2D: Loop Summary Badge
 * Renders an expandable badge showing LEVEL2 reasoning loop results.
 * MODULE_ID: LEVEL2D_LOOP_SUMMARY_BADGE
 *
 * LEVEL21B: Extended with HistoryControlTraceBadge sub-component.
 * Shows history control trace when history_controlled=true.
 */

import { useState } from "react";
import { Brain, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus, History, GitBranch, AlertCircle } from "lucide-react";

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
  // LEVEL21 history fields
  history_bootstrap_used?: boolean;
  history_record_count?: number;
  history_action_pattern?: string;
  history_days_since_last?: number;
  history_revalidation_summary?: string;
  step0_ran?: boolean;
  // LEVEL21B history control trace
  history_requires_control?: boolean;
  revalidation_mandatory?: boolean;
  history_control_reason?: string;
  preferred_probe_order?: string[];
  history_controlled?: boolean;
  controller_path?: string[];
  delta_stop_applied?: boolean;
  delta_stop_reason?: string;
  require_thesis_update_step?: boolean;
  history_control_summary_line?: string;
  action_changed?: boolean;
  thesis_changed?: boolean;
}

interface LoopSummaryBadgeProps {
  meta: LoopMetadata;
}

// ── LEVEL21B: History Control Trace Badge ─────────────────────────────────────

function HistoryControlTraceBadge({ meta }: { meta: LoopMetadata }) {
  const [expanded, setExpanded] = useState(false);

  // Only render if history was actually used as a controller
  if (!meta.history_controlled && !meta.history_requires_control && !meta.delta_stop_applied) {
    return null;
  }

  const hasActionChange = meta.action_changed;
  const hasThesisChange = meta.thesis_changed;
  const isDeltaStop = meta.delta_stop_applied;
  const requiresThesisUpdate = meta.require_thesis_update_step;

  // Color scheme based on change type
  const traceColor = hasActionChange
    ? "oklch(0.72 0.18 35)"    // amber — action changed
    : hasThesisChange
      ? "oklch(0.65 0.18 200)" // blue — thesis changed
      : "oklch(0.65 0.18 145)"; // green — reaffirmed

  const traceBg = hasActionChange
    ? "oklch(0.72 0.18 35 / 0.08)"
    : hasThesisChange
      ? "oklch(0.65 0.18 200 / 0.08)"
      : "oklch(0.65 0.18 145 / 0.08)";

  const traceBorder = hasActionChange
    ? "oklch(0.72 0.18 35 / 0.3)"
    : hasThesisChange
      ? "oklch(0.65 0.18 200 / 0.3)"
      : "oklch(0.65 0.18 145 / 0.3)";

  const statusLabel = hasActionChange
    ? "行动方向变化"
    : hasThesisChange
      ? "论点已更新"
      : "历史重申";

  const TraceIcon = hasActionChange ? AlertCircle : hasThesisChange ? GitBranch : History;

  return (
    <div className="mt-1.5 rounded-lg overflow-hidden w-fit max-w-full"
      style={{ border: `1px solid ${traceBorder}`, background: traceBg }}>
      <button
        className="flex items-center gap-2 px-3 py-1.5 text-xs w-full text-left"
        style={{ color: traceColor }}
        onClick={() => setExpanded(v => !v)}
      >
        <TraceIcon className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="font-medium">历史控制追踪</span>
        <span className="mx-1 opacity-50">·</span>
        <span className="font-semibold">{statusLabel}</span>
        {isDeltaStop && (
          <>
            <span className="mx-1 opacity-50">·</span>
            <span className="opacity-70">Delta停止</span>
          </>
        )}
        {requiresThesisUpdate && (
          <>
            <span className="mx-1 opacity-50">·</span>
            <span style={{ color: "oklch(0.72 0.18 35)" }}>需论点更新</span>
          </>
        )}
        <span className="ml-auto pl-2 opacity-60">
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 text-xs space-y-1.5"
          style={{ borderTop: `1px solid ${traceBorder}`, color: "oklch(0.75 0 0)" }}>
          {/* Summary Line */}
          {meta.history_control_summary_line && (
            <div className="leading-relaxed opacity-90">{meta.history_control_summary_line}</div>
          )}
          {/* Control Reason */}
          {meta.history_control_reason && (
            <div className="flex items-start gap-2">
              <span className="opacity-50 shrink-0">控制原因</span>
              <span className="opacity-80">{meta.history_control_reason}</span>
            </div>
          )}
          {/* Delta Stop Reason */}
          {isDeltaStop && meta.delta_stop_reason && (
            <div className="flex items-start gap-2">
              <span className="opacity-50 shrink-0">Delta信号</span>
              <span className="font-mono opacity-80">{meta.delta_stop_reason}</span>
            </div>
          )}
          {/* Controller Path */}
          {meta.controller_path && meta.controller_path.length > 0 && (
            <div className="flex items-start gap-2">
              <span className="opacity-50 shrink-0">控制路径</span>
              <div className="flex flex-wrap gap-1">
                {meta.controller_path.map((step, i) => (
                  <span key={i} className="px-1.5 py-0.5 rounded font-mono text-xs"
                    style={{ background: "oklch(0.2 0 0 / 0.4)", border: "1px solid oklch(0.4 0 0 / 0.3)" }}>
                    {step}
                  </span>
                ))}
              </div>
            </div>
          )}
          {/* Preferred Probe Order */}
          {meta.preferred_probe_order && meta.preferred_probe_order.length > 0 && (
            <div className="flex items-start gap-2">
              <span className="opacity-50 shrink-0">探针顺序</span>
              <span className="opacity-70">{meta.preferred_probe_order.join(" → ")}</span>
            </div>
          )}
          {/* History Pattern */}
          {meta.history_action_pattern && (
            <div className="flex items-center gap-2">
              <span className="opacity-50">历史模式</span>
              <span className="font-mono opacity-80">{meta.history_action_pattern}</span>
              {meta.history_record_count !== undefined && meta.history_record_count > 0 && (
                <span className="opacity-50">({meta.history_record_count} 条记录)</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main LoopSummaryBadge ─────────────────────────────────────────────────────

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
    <div className="mb-2 space-y-0">
      {/* ── Main Loop Badge ── */}
      <div className="rounded-lg overflow-hidden w-fit max-w-full"
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

      {/* ── LEVEL21B: History Control Trace Badge (sub-badge) ── */}
      <HistoryControlTraceBadge meta={meta} />
    </div>
  );
}
