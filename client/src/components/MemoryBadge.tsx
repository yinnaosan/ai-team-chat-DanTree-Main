/**
 * LEVEL3A: Memory Badge
 * Renders a compact non-intrusive signal when prior analysis memory was used.
 * MODULE_ID: LEVEL3A_MEMORY_BADGE
 */
import { useState } from "react";
import { History, ChevronDown, ChevronUp } from "lucide-react";

interface MemoryBadgeProps {
  ticker: string;
  recordCreatedAt: string;
  summary?: string;
}

export function MemoryBadge({ ticker, recordCreatedAt, summary }: MemoryBadgeProps) {
  const [expanded, setExpanded] = useState(false);

  const dateStr = recordCreatedAt
    ? new Date(recordCreatedAt).toLocaleDateString("zh-CN", {
        month: "short",
        day: "numeric",
      })
    : "";

  return (
    <div
      className="mb-2 w-fit max-w-full rounded-md overflow-hidden"
      style={{
        border: "1px solid oklch(0.55 0.18 260 / 0.35)",
        background: "oklch(0.55 0.18 260 / 0.08)",
      }}
    >
      {/* ── Header (always visible) ── */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs w-full text-left"
        style={{ color: "oklch(0.65 0.18 260)" }}
        aria-label="展开记忆详情"
      >
        <History size={11} strokeWidth={2} />
        <span className="font-medium">基于上次分析更新</span>
        {ticker && (
          <span
            className="px-1.5 py-0.5 rounded text-xs font-mono"
            style={{
              background: "oklch(0.55 0.18 260 / 0.15)",
              color: "oklch(0.65 0.18 260)",
            }}
          >
            {ticker}
          </span>
        )}
        {dateStr && (
          <span style={{ color: "oklch(0.55 0.15 260)" }}>
            · {dateStr}
          </span>
        )}
        <span className="ml-auto" style={{ color: "oklch(0.55 0.15 260)" }}>
          {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </span>
      </button>

      {/* ── Expanded detail ── */}
      {expanded && summary && (
        <div
          className="px-2.5 pb-2 text-xs"
          style={{ color: "oklch(0.6 0.12 260)", borderTop: "1px solid oklch(0.55 0.18 260 / 0.15)" }}
        >
          <div className="pt-1.5 leading-relaxed">{summary}</div>
          <div className="mt-1" style={{ color: "oklch(0.5 0.1 260)" }}>
            本次分析已聚焦于相较上次的变化点
          </div>
        </div>
      )}
    </div>
  );
}
