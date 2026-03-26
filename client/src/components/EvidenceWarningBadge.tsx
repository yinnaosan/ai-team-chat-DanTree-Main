import { useState } from "react";
import { AlertTriangle, CheckCircle, ShieldAlert, ChevronDown, ChevronUp } from "lucide-react";

interface EvidenceWarningBadgeProps {
  evidenceStrengthScore?: number;
  evidenceConflictCount?: number;
  evidenceGatingMode?: "decisive" | "directional" | "framework_only";
  evidenceConflictFields?: string;
}

export function EvidenceWarningBadge({
  evidenceStrengthScore,
  evidenceConflictCount,
  evidenceGatingMode,
  evidenceConflictFields,
}: EvidenceWarningBadgeProps) {
  const [expanded, setExpanded] = useState(false);

  // Only render if we have LEVEL1C data
  if (evidenceStrengthScore === undefined && evidenceConflictCount === undefined) return null;

  const score = evidenceStrengthScore ?? 0;
  const conflictCount = evidenceConflictCount ?? 0;
  const gatingMode = evidenceGatingMode ?? "directional";

  // Determine severity
  const hasConflict = conflictCount > 0;
  const isWeak = score < 0.4;
  const isStrong = score >= 0.75 && !hasConflict;

  if (isStrong && gatingMode === "decisive") {
    // Clean evidence — show minimal badge
    return (
      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs w-fit">
        <CheckCircle className="w-3 h-3" />
        <span>证据充分 · {(score * 100).toFixed(0)}分</span>
      </div>
    );
  }

  const badgeColor = hasConflict || isWeak
    ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
    : "bg-blue-500/10 border-blue-500/20 text-blue-400";

  const Icon = hasConflict ? ShieldAlert : AlertTriangle;
  const iconColor = hasConflict ? "text-amber-400" : "text-blue-400";

  const modeLabel: Record<string, string> = {
    decisive: "强判断",
    directional: "方向性",
    framework_only: "框架分析",
  };

  return (
    <div className={`rounded-lg border ${badgeColor} text-xs overflow-hidden w-fit max-w-xs`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 px-2.5 py-1 w-full hover:opacity-80 transition-opacity"
      >
        <Icon className={`w-3 h-3 flex-shrink-0 ${iconColor}`} />
        <span className="font-medium">
          {hasConflict ? `数据冲突 ×${conflictCount}` : isWeak ? "证据偏弱" : "证据评估"}
        </span>
        <span className="opacity-60 ml-1">
          {(score * 100).toFixed(0)}分 · {modeLabel[gatingMode] ?? gatingMode}
        </span>
        {expanded ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
      </button>

      {expanded && (
        <div className="px-2.5 pb-2 space-y-1 border-t border-current/10">
          <div className="flex justify-between pt-1.5">
            <span className="opacity-60">证据强度</span>
            <span className="font-mono">{(score * 100).toFixed(1)} / 100</span>
          </div>
          <div className="flex justify-between">
            <span className="opacity-60">输出门控</span>
            <span className="font-medium">{modeLabel[gatingMode] ?? gatingMode}</span>
          </div>
          {conflictCount > 0 && (
            <div className="flex justify-between">
              <span className="opacity-60">主要冲突</span>
              <span>{conflictCount} 个字段</span>
            </div>
          )}
          {evidenceConflictFields && (
            <div className="pt-0.5">
              <span className="opacity-60">冲突字段：</span>
              <span className="font-mono text-[10px] break-all">{evidenceConflictFields}</span>
            </div>
          )}
          {isWeak && (
            <p className="opacity-70 pt-0.5 leading-relaxed">
              证据不足，结论仅供参考，建议补充更多数据源后重新分析。
            </p>
          )}
          {hasConflict && (
            <p className="opacity-70 pt-0.5 leading-relaxed">
              多个数据源对同一指标存在分歧，系统已选择可靠性最高的来源作为基准。
            </p>
          )}
        </div>
      )}
    </div>
  );
}
