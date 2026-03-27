import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { History, ChevronDown, ChevronUp, Clock } from "lucide-react";

// ── Action badge config ────────────────────────────────────────────────────
const ACTION_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  BUY:     { label: "买入",   color: "#10b981", bg: "rgba(16,185,129,0.12)" },
  HOLD:    { label: "持有",   color: "#3b82f6", bg: "rgba(59,130,246,0.12)" },
  WAIT:    { label: "等待",   color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  SELL:    { label: "卖出",   color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  SELECT:  { label: "观察",   color: "#8b5cf6", bg: "rgba(139,92,246,0.12)" },
  WATCH:   { label: "关注",   color: "#6366f1", bg: "rgba(99,102,241,0.12)" },
  PASS:    { label: "放弃",   color: "#6b7280", bg: "rgba(107,114,128,0.12)" },
};

const SOURCE_LABEL: Record<string, string> = {
  manual:    "手动分析",
  candidate: "候选机会",
  radar:     "雷达发现",
};

function getActionConfig(action: string) {
  const key = action.toUpperCase();
  return ACTION_CONFIG[key] ?? { label: action, color: "#94a3b8", bg: "rgba(148,163,184,0.10)" };
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}

// ── Component ──────────────────────────────────────────────────────────────
export function DecisionHistoryPanel() {
  const [expanded, setExpanded] = useState(true);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const { data: rows, isLoading } = trpc.decisionHistory.list.useQuery(
    { limit: 20 },
    { refetchOnWindowFocus: false, staleTime: 30_000 }
  );

  const T = {
    bg: "rgba(15,20,30,0.95)",
    bg2: "rgba(20,28,42,0.9)",
    border: "rgba(255,255,255,0.07)",
    text1: "#e2e8f0",
    text2: "#94a3b8",
    text3: "#64748b",
    accent: "#3b82f6",
  };

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: T.bg, border: `1px solid ${T.border}` }}
    >
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 transition-colors hover:bg-white/5"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-2">
          <History className="w-4 h-4" style={{ color: T.accent }} />
          <span className="text-sm font-semibold" style={{ color: T.text1 }}>决策历史</span>
          {rows && rows.length > 0 && (
            <span
              className="text-xs px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(59,130,246,0.15)", color: T.accent }}
            >
              {rows.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: T.text3 }}>最近 20 条</span>
          {expanded
            ? <ChevronUp className="w-3.5 h-3.5" style={{ color: T.text3 }} />
            : <ChevronDown className="w-3.5 h-3.5" style={{ color: T.text3 }} />
          }
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-1.5">
          {/* Semantic label */}
          <p className="text-xs px-1 pb-1" style={{ color: T.text3 }}>
            决策记录 · 自动存档 · 仅供回顾参考
          </p>

          {isLoading && (
            <div className="text-center py-4">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs mt-2" style={{ color: T.text3 }}>加载历史...</p>
            </div>
          )}

          {!isLoading && (!rows || rows.length === 0) && (
            <div className="text-center py-6">
              <Clock className="w-6 h-6 mx-auto mb-2" style={{ color: T.text3 }} />
              <p className="text-xs" style={{ color: T.text3 }}>暂无决策记录</p>
              <p className="text-xs mt-1" style={{ color: T.text3, opacity: 0.6 }}>
                完成分析后将自动存档
              </p>
            </div>
          )}

          {rows && rows.map((row) => {
            const cfg = getActionConfig(row.action);
            const isOpen = expandedRow === row.id;
            const hasDetail = row.whySurface || row.whyTrend || row.whyHidden || row.timingSignal;

            return (
              <div
                key={row.id}
                className="rounded-lg overflow-hidden"
                style={{ background: T.bg2, border: `1px solid ${T.border}` }}
              >
                {/* Row header */}
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-white/5"
                  onClick={() => hasDetail && setExpandedRow(isOpen ? null : row.id)}
                >
                  {/* Action badge */}
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0"
                    style={{ color: cfg.color, background: cfg.bg }}
                  >
                    {cfg.label}
                  </span>

                  {/* Ticker */}
                  <span className="text-sm font-mono font-semibold" style={{ color: T.text1 }}>
                    {row.ticker}
                  </span>

                  {/* State */}
                  {row.state && (
                    <span className="text-xs truncate" style={{ color: T.text2 }}>
                      {row.state}
                    </span>
                  )}

                  <div className="ml-auto flex items-center gap-2 shrink-0">
                    {/* Source */}
                    <span className="text-xs" style={{ color: T.text3 }}>
                      {SOURCE_LABEL[row.source] ?? row.source}
                    </span>
                    {/* Time */}
                    <span className="text-xs" style={{ color: T.text3 }}>
                      {formatRelativeTime(row.createdAt)}
                    </span>
                    {/* Expand chevron */}
                    {hasDetail && (
                      isOpen
                        ? <ChevronUp className="w-3 h-3" style={{ color: T.text3 }} />
                        : <ChevronDown className="w-3 h-3" style={{ color: T.text3 }} />
                    )}
                  </div>
                </button>

                {/* Expanded detail */}
                {isOpen && hasDetail && (
                  <div className="px-3 pb-3 space-y-2 border-t" style={{ borderColor: T.border }}>
                    {row.cycle && (
                      <div className="flex items-center gap-2 pt-2">
                        <span className="text-xs" style={{ color: T.text3 }}>周期</span>
                        <span className="text-xs font-medium" style={{ color: T.text2 }}>{row.cycle}</span>
                      </div>
                    )}
                    {row.timingSignal && (
                      <div className="pt-1">
                        <p className="text-xs mb-0.5" style={{ color: T.text3 }}>时机信号</p>
                        <p className="text-xs leading-relaxed" style={{ color: T.text2 }}>{row.timingSignal}</p>
                      </div>
                    )}
                    {row.whySurface && (
                      <div>
                        <p className="text-xs mb-0.5" style={{ color: T.text3 }}>表面层</p>
                        <p className="text-xs leading-relaxed" style={{ color: T.text2 }}>{row.whySurface}</p>
                      </div>
                    )}
                    {row.whyTrend && (
                      <div>
                        <p className="text-xs mb-0.5" style={{ color: T.text3 }}>趋势层</p>
                        <p className="text-xs leading-relaxed" style={{ color: T.text2 }}>{row.whyTrend}</p>
                      </div>
                    )}
                    {row.whyHidden && (
                      <div>
                        <p className="text-xs mb-0.5" style={{ color: T.text3 }}>隐含层</p>
                        <p className="text-xs leading-relaxed" style={{ color: T.text2 }}>{row.whyHidden}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
