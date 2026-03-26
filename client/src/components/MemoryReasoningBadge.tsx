/**
 * LEVEL3B: MemoryReasoningBadge
 * Displays memory-driven reasoning signals in the chat message UI.
 * Shows:
 * - Whether memory influenced the trigger decision
 * - Whether a memory conflict was detected (verdict flip / confidence drop)
 * - A brief summary of the prior analysis context
 */

import { useState } from "react";
import { Brain, AlertTriangle, ChevronDown, ChevronUp, ArrowLeftRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MemoryConflictData {
  has_conflict: boolean;
  conflict_type: "verdict_flip" | "confidence_drop" | "risk_escalation" | "none";
  summary: string;
  prior_verdict?: string;
  current_verdict?: string;
  severity?: "low" | "medium" | "high";
}

export interface MemoryReasoningBadgeProps {
  memorySeedUsed?: boolean;
  memoryInfluencedTrigger?: boolean;
  memoryInfluenceSummary?: string;
  memoryConflict?: MemoryConflictData | null;
  className?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function conflictTypeLabel(type: MemoryConflictData["conflict_type"]): string {
  switch (type) {
    case "verdict_flip":     return "判断反转";
    case "confidence_drop":  return "置信度下降";
    case "risk_escalation":  return "风险升级";
    default:                 return "记忆冲突";
  }
}

function conflictSeverityColor(severity?: string): string {
  switch (severity) {
    case "high":   return "text-red-400 border-red-500/40 bg-red-500/10";
    case "medium": return "text-amber-400 border-amber-500/40 bg-amber-500/10";
    default:       return "text-yellow-400 border-yellow-500/40 bg-yellow-500/10";
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MemoryReasoningBadge({
  memorySeedUsed,
  memoryInfluencedTrigger,
  memoryInfluenceSummary,
  memoryConflict,
  className,
}: MemoryReasoningBadgeProps) {
  const [expanded, setExpanded] = useState(false);

  // Nothing to show
  if (!memorySeedUsed && !memoryConflict?.has_conflict) return null;

  const hasConflict = memoryConflict?.has_conflict && memoryConflict.conflict_type !== "none";

  return (
    <div className={cn("mt-2 space-y-1", className)}>
      {/* ── Conflict Badge (priority display) ─────────────────────────────── */}
      {hasConflict && memoryConflict && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs cursor-pointer select-none",
            conflictSeverityColor(memoryConflict.severity)
          )}
          onClick={() => setExpanded(v => !v)}
        >
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">
                记忆冲突 · {conflictTypeLabel(memoryConflict.conflict_type)}
              </span>
              {expanded
                ? <ChevronUp className="h-3 w-3 shrink-0" />
                : <ChevronDown className="h-3 w-3 shrink-0" />
              }
            </div>
            {expanded && (
              <div className="mt-1.5 space-y-1 text-[11px] opacity-90">
                <p>{memoryConflict.summary}</p>
                {memoryConflict.prior_verdict && memoryConflict.current_verdict && (
                  <div className="flex items-center gap-1.5 font-mono">
                    <span className="opacity-70">{memoryConflict.prior_verdict}</span>
                    <ArrowLeftRight className="h-3 w-3 shrink-0" />
                    <span>{memoryConflict.current_verdict}</span>
                  </div>
                )}
                {memoryInfluencedTrigger && (
                  <p className="opacity-70">已触发二次推理循环以解决冲突</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Memory Seed Badge (no conflict, just context used) ─────────────── */}
      {memorySeedUsed && !hasConflict && (
        <div
          className="flex items-center gap-1.5 rounded-md border border-blue-500/30 bg-blue-500/8 px-2.5 py-1.5 text-[11px] text-blue-400 cursor-pointer select-none"
          onClick={() => setExpanded(v => !v)}
        >
          <Brain className="h-3 w-3 shrink-0" />
          <span className="font-medium">记忆上下文已注入</span>
          {memoryInfluencedTrigger && (
            <Badge
              variant="outline"
              className="ml-1 h-4 px-1 text-[10px] border-blue-500/40 text-blue-300"
            >
              影响触发
            </Badge>
          )}
          {expanded
            ? <ChevronUp className="h-3 w-3 ml-auto shrink-0" />
            : <ChevronDown className="h-3 w-3 ml-auto shrink-0" />
          }
        </div>
      )}

      {/* ── Expanded detail for seed (no conflict) ─────────────────────────── */}
      {memorySeedUsed && !hasConflict && expanded && memoryInfluenceSummary && (
        <div className="ml-5 rounded border border-blue-500/20 bg-blue-500/5 px-2.5 py-1.5 text-[11px] text-blue-300/80">
          {memoryInfluenceSummary}
        </div>
      )}
    </div>
  );
}

export default MemoryReasoningBadge;
