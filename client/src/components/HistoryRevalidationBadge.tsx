import { useState } from "react";
import { History, ChevronDown, ChevronUp, GitBranch } from "lucide-react";

export interface HistoryRevalidationBadgeProps {
  historyBootstrapUsed: boolean;
  historyRecordCount: number;
  historyActionPattern: string;
  historyDaysSinceLast: number;
  historyRevalidationSummary: string;
  thesisDelta?: string;    // JSON string
  actionDelta?: string;    // JSON string
  step0Ran: boolean;
}

interface ThesisDelta {
  change_type: string;
  previous_thesis: string;
  current_thesis_summary: string;
  what_changed: string;
  confidence_delta: string;
}

interface ActionDelta {
  change_type: string;
  previous_action: string;
  current_action: string;
  reconsideration_trigger: string;
  days_elapsed: number | null;
}

const CHANGE_TYPE_COLORS: Record<string, string> = {
  unchanged:    "text-slate-400",
  strengthened: "text-emerald-400",
  weakened:     "text-amber-400",
  reversed:     "text-red-400",
  invalidated:  "text-red-500",
};

const CHANGE_TYPE_LABELS: Record<string, string> = {
  unchanged:    "论点不变",
  strengthened: "论点强化",
  weakened:     "论点弱化",
  reversed:     "论点反转",
  invalidated:  "论点失效",
};

export function HistoryRevalidationBadge({
  historyBootstrapUsed,
  historyRecordCount,
  historyActionPattern,
  historyDaysSinceLast,
  historyRevalidationSummary,
  thesisDelta,
  actionDelta,
  step0Ran,
}: HistoryRevalidationBadgeProps) {
  const [expanded, setExpanded] = useState(false);

  // Only render if history was used
  if (!historyBootstrapUsed && !step0Ran) return null;

  let parsedThesis: ThesisDelta | null = null;
  let parsedAction: ActionDelta | null = null;
  try {
    if (thesisDelta) parsedThesis = JSON.parse(thesisDelta);
    if (actionDelta) parsedAction = JSON.parse(actionDelta);
  } catch {
    // ignore parse errors
  }

  const thesisColor = parsedThesis
    ? (CHANGE_TYPE_COLORS[parsedThesis.change_type] ?? "text-slate-400")
    : "text-slate-400";
  const thesisLabel = parsedThesis
    ? (CHANGE_TYPE_LABELS[parsedThesis.change_type] ?? parsedThesis.change_type)
    : "";

  return (
    <div className="mt-2 rounded border border-violet-500/30 bg-violet-950/20 text-xs">
      {/* Header row */}
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-violet-900/20 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <History className="h-3.5 w-3.5 text-violet-400 shrink-0" />
        <span className="text-violet-300 font-medium">历史决策重验证</span>
        {historyRecordCount > 0 && (
          <span className="text-violet-400/70">
            · {historyRecordCount} 条记录
            {historyDaysSinceLast >= 0 && ` · ${historyDaysSinceLast}天前`}
          </span>
        )}
        {historyActionPattern && (
          <span className="ml-auto text-violet-400/60 font-mono text-[10px]">
            {historyActionPattern}
          </span>
        )}
        {expanded
          ? <ChevronUp className="h-3 w-3 text-violet-400/60 shrink-0" />
          : <ChevronDown className="h-3 w-3 text-violet-400/60 shrink-0" />
        }
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-violet-500/20 px-3 py-2 space-y-2">
          {/* Revalidation summary */}
          {historyRevalidationSummary && (
            <p className="text-slate-300 leading-relaxed">
              {historyRevalidationSummary}
            </p>
          )}

          {/* Thesis delta */}
          {parsedThesis && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <GitBranch className="h-3 w-3 text-violet-400/70" />
                <span className="text-violet-300/80 font-medium">论点演变</span>
                <span className={`${thesisColor} font-medium`}>· {thesisLabel}</span>
              </div>
              {parsedThesis.what_changed && (
                <p className="text-slate-400 pl-4">{parsedThesis.what_changed}</p>
              )}
              {parsedThesis.confidence_delta && (
                <p className="text-slate-500 pl-4">置信度：{parsedThesis.confidence_delta}</p>
              )}
            </div>
          )}

          {/* Action delta */}
          {parsedAction && parsedAction.change_type !== "unchanged" && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-violet-300/80 font-medium">行动变化</span>
                {parsedAction.previous_action && (
                  <span className="text-slate-400">
                    {parsedAction.previous_action} → {parsedAction.current_action}
                  </span>
                )}
                {parsedAction.days_elapsed != null && (
                  <span className="text-slate-500">({parsedAction.days_elapsed}天后)</span>
                )}
              </div>
              {parsedAction.reconsideration_trigger && (
                <p className="text-slate-400 pl-4">{parsedAction.reconsideration_trigger}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
