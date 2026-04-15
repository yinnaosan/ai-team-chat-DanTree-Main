import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { BarChart2, ChevronDown, ChevronUp } from "lucide-react";

// ── Action config ──────────────────────────────────────────────────────────
const ACTION_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  BUY:     { label: "买入",   color: "#10b981", bg: "#10b981" },
  HOLD:    { label: "持有",   color: "#3b82f6", bg: "#3b82f6" },
  WAIT:    { label: "等待",   color: "#f59e0b", bg: "#f59e0b" },
  SELL:    { label: "卖出",   color: "#ef4444", bg: "#ef4444" },
  SELECT:  { label: "观察",   color: "#8b5cf6", bg: "#8b5cf6" },
  WATCH:   { label: "关注",   color: "#6366f1", bg: "#6366f1" },
  PASS:    { label: "放弃",   color: "#6b7280", bg: "#6b7280" },
};

function getActionCfg(action: string) {
  return ACTION_CONFIG[action.toUpperCase()] ?? { label: action, color: "#94a3b8", bg: "#94a3b8" };
}

const PERIOD_OPTIONS = [
  { label: "7天",  days: 7 },
  { label: "30天", days: 30 },
  { label: "90天", days: 90 },
];

// ── Component ──────────────────────────────────────────────────────────────
export function DecisionAnalyticsPanel() {
  const { isAuthenticated } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [days, setDays] = useState(30);

  const { data, isLoading } = trpc.decisionHistory.analytics.useQuery(
    { days },
    { enabled: isAuthenticated && expanded, refetchOnWindowFocus: false, staleTime: 60_000 }
  );

  const T = {
    bg:     "rgba(15,20,30,0.95)",
    bg2:    "rgba(20,28,42,0.9)",
    border: "rgba(255,255,255,0.07)",
    text1:  "#e2e8f0",
    text2:  "#94a3b8",
    text3:  "#64748b",
    accent: "#3b82f6",
  };

  const total = data?.total ?? 0;
  const maxActionCount = Math.max(1, ...(data?.actionDistribution ?? []).map(a => a.count));
  const maxTickerCount = Math.max(1, ...(data?.topTickers ?? []).map(t => t.count));
  const maxTimelineCount = Math.max(1, ...(data?.timeline ?? []).map(t => t.count));

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
          <BarChart2 className="w-4 h-4" style={{ color: T.accent }} />
          <span className="text-sm font-semibold" style={{ color: T.text1 }}>决策统计</span>
          {total > 0 && (
            <span
              className="text-xs px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(59,130,246,0.15)", color: T.accent }}
            >
              {total} 条
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs" style={{ color: T.text3 }}>模式分析</span>
          {expanded
            ? <ChevronUp className="w-3.5 h-3.5" style={{ color: T.text3 }} />
            : <ChevronDown className="w-3.5 h-3.5" style={{ color: T.text3 }} />
          }
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-4 space-y-4">
          {/* Period selector */}
          <div className="flex gap-1.5">
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.days}
                onClick={() => setDays(opt.days)}
                className="text-xs px-2.5 py-1 rounded-md transition-colors"
                style={{
                  background: days === opt.days ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.05)",
                  color: days === opt.days ? T.accent : T.text3,
                  border: `1px solid ${days === opt.days ? "rgba(59,130,246,0.4)" : T.border}`,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-6">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs ml-2" style={{ color: T.text3 }}>计算中...</span>
            </div>
          )}

          {!isLoading && total === 0 && (
            <div className="text-center py-4">
              <p className="text-xs" style={{ color: T.text3 }}>近 {days} 天暂无决策记录</p>
            </div>
          )}

          {!isLoading && total > 0 && (
            <>
              {/* ── Action Distribution ─────────────────────────────── */}
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: T.text2 }}>决策分布</p>
                <div className="space-y-1.5">
                  {(data?.actionDistribution ?? []).map(({ action, count }) => {
                    const cfg = getActionCfg(action);
                    const pct = Math.round((count / maxActionCount) * 100);
                    return (
                      <div key={action} className="flex items-center gap-2">
                        <span
                          className="text-xs font-bold w-10 shrink-0 text-right"
                          style={{ color: cfg.color }}
                        >
                          {cfg.label}
                        </span>
                        <div className="flex-1 h-4 rounded-sm overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                          <div
                            className="h-full rounded-sm transition-all duration-500"
                            style={{ width: `${pct}%`, background: cfg.bg, opacity: 0.75 }}
                          />
                        </div>
                        <span className="text-xs w-6 text-right shrink-0" style={{ color: T.text3 }}>
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Top Tickers ─────────────────────────────────────── */}
              {(data?.topTickers ?? []).length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-2" style={{ color: T.text2 }}>最常分析标的</p>
                  <div className="space-y-1.5">
                    {(data?.topTickers ?? []).slice(0, 6).map(({ ticker, count }) => {
                      const pct = Math.round((count / maxTickerCount) * 100);
                      return (
                        <div key={ticker} className="flex items-center gap-2">
                          <span
                            className="text-xs font-mono font-semibold w-16 shrink-0"
                            style={{ color: T.text1 }}
                          >
                            {ticker}
                          </span>
                          <div className="flex-1 h-3 rounded-sm overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                            <div
                              className="h-full rounded-sm transition-all duration-500"
                              style={{ width: `${pct}%`, background: T.accent, opacity: 0.6 }}
                            />
                          </div>
                          <span className="text-xs w-6 text-right shrink-0" style={{ color: T.text3 }}>
                            {count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Timeline ────────────────────────────────────────── */}
              {(data?.timeline ?? []).length > 1 && (
                <div>
                  <p className="text-xs font-semibold mb-2" style={{ color: T.text2 }}>决策频率</p>
                  <div className="flex items-end gap-0.5 h-14">
                    {(data?.timeline ?? []).map(({ date, count }) => {
                      const heightPct = Math.max(8, Math.round((count / maxTimelineCount) * 100));
                      const label = date.slice(5); // MM-DD
                      return (
                        <div
                          key={date}
                          className="flex-1 flex flex-col items-center gap-0.5 group"
                          title={`${date}: ${count} 条`}
                        >
                          <div
                            className="w-full rounded-t-sm transition-all duration-300"
                            style={{
                              height: `${heightPct}%`,
                              background: T.accent,
                              opacity: 0.55,
                              minHeight: 3,
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  {/* X-axis: show first and last date */}
                  {(data?.timeline ?? []).length > 0 && (
                    <div className="flex justify-between mt-1">
                      <span className="text-xs" style={{ color: T.text3 }}>
                        {(data?.timeline ?? [])[0]?.date?.slice(5)}
                      </span>
                      <span className="text-xs" style={{ color: T.text3 }}>
                        {(data?.timeline ?? [])[(data?.timeline ?? []).length - 1]?.date?.slice(5)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Semantic label */}
              <p className="text-xs" style={{ color: T.text3, opacity: 0.7 }}>
                模式统计 · 不含绩效评分 · 仅供参考
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
