/**
 * HistoryBlock.tsx — DanTree Workspace 卡片系统 v2
 *
 * 完善点：
 * - 从"日志列表"升级为"Thesis 状态追踪"
 * - 每条记录突出"变化类型"（而不是时间）
 * - 最近一条变化有更强的视觉权重
 * - deltaSummary 表达方式更像判断变化，不像操作记录
 * - stance + actionBias 更直观，用颜色编码
 * - 空态：明确说明"建立 baseline 后开始追踪"
 */
import React, { useState } from "react";
import { ChevronDown, ChevronRight, GitBranch } from "lucide-react";

export interface HistoryEntry {
  time: string;
  changeMarker: "first_observation" | "stable" | "strengthening" | "weakening" | "reversal" | "diverging" | "unknown";
  stance: string;
  actionBias: string;
  alertSeverity?: string | null;
  deltaSummary?: string;
}

export interface HistoryBlockProps {
  entity?: string;
  entries?: HistoryEntry[];
}

const MARKER_CFG = {
  first_observation: { label: "初始建立", color: "rgba(52,211,153,0.65)",  dot: "rgba(52,211,153,0.65)",  weight: "normal" },
  stable:            { label: "维持稳定", color: "rgba(255,255,255,0.28)",  dot: "rgba(255,255,255,0.20)",  weight: "light"  },
  strengthening:     { label: "↑ 强化",   color: "#10b981",  dot: "#10b981",  weight: "strong" },
  weakening:         { label: "↓ 弱化",   color: "#f59e0b",  dot: "#f59e0b",  weight: "strong" },
  reversal:          { label: "⟳ 逆转",   color: "#ef4444",  dot: "#ef4444",  weight: "strong" },
  diverging:         { label: "分歧",     color: "#f97316",  dot: "#f97316",  weight: "normal" },
  unknown:           { label: "—",        color: "rgba(255,255,255,0.18)",  dot: "rgba(255,255,255,0.12)",  weight: "light"  },
};

const STANCE_COLOR: Record<string, string> = {
  bullish: "#10b981", bearish: "#ef4444", neutral: "#94a3b8",
};

const ACTION_COLOR: Record<string, string> = {
  BUY: "#10b981", AVOID: "#ef4444", HOLD: "rgba(255,255,255,0.55)",
  WAIT: "#f59e0b", NONE: "rgba(255,255,255,0.25)",
};

export function HistoryBlock({ entity, entries = [] }: HistoryBlockProps) {
  const [open, setOpen] = useState(true);

  const latestSignificant = entries.find(e =>
    e.changeMarker === "strengthening" || e.changeMarker === "weakening" || e.changeMarker === "reversal"
  );

  return (
    <section style={{
      background: "rgba(9,11,18,0.97)",
      backdropFilter: "blur(18px)",
      WebkitBackdropFilter: "blur(18px)",
      border: "1px solid rgba(255,255,255,0.13)",
      borderTop: "2px solid rgba(52,211,153,0.55)",
      borderRadius: 10, overflow: "hidden",
      boxShadow: "0 10px 40px rgba(0,0,0,0.85), 0 1px 0 rgba(255,255,255,0.07) inset, 0 0 0 1px rgba(52,211,153,0.08), 0 0 20px rgba(52,211,153,0.05)",
    }}>
      {/* Header */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center",
          justifyContent: "space-between", padding: "11px 16px",
          cursor: "pointer", background: "transparent", border: "none",
          borderBottom: open ? "1px solid rgba(255,255,255,0.06)" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <GitBranch size={11} color="rgba(52,211,153,0.80)" />
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", color: "rgba(52,211,153,0.92)" }}>
            历史追踪
          </span>
          {entries.length > 0 && (
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.22)" }}>
              {entries.length} 条
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* 最近重大变化快速显示 */}
          {latestSignificant && (
            <span style={{
              fontSize: 10, fontWeight: 600,
              color: MARKER_CFG[latestSignificant.changeMarker].color,
            }}>
              最近: {MARKER_CFG[latestSignificant.changeMarker].label}
            </span>
          )}
          {open
            ? <ChevronDown size={12} color="rgba(255,255,255,0.22)" />
            : <ChevronRight size={12} color="rgba(255,255,255,0.22)" />}
        </div>
      </button>

      {open && (
        <div style={{ padding: "12px 16px" }}>
          {entries.length === 0 ? (
            <div style={{
              padding: "16px 14px", textAlign: "center",
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.04)",
              borderRadius: 7,
            }}>
              <GitBranch size={16} color="rgba(255,255,255,0.12)" style={{ margin: "0 auto 6px", display: "block" }} />
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.22)" }}>
                完成首次分析后开始追踪
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.14)", marginTop: 3 }}>
                每次对话结束后，关键变化将自动记录
              </div>
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              {entries.map((e, i) => {
                const mk = MARKER_CFG[e.changeMarker] ?? MARKER_CFG.unknown;
                const isFirst = i === 0;
                const isSignificant = e.changeMarker === "strengthening" || e.changeMarker === "weakening" || e.changeMarker === "reversal";
                const stanceColor = STANCE_COLOR[e.stance] ?? "rgba(255,255,255,0.55)";
                const actionColor = ACTION_COLOR[e.actionBias] ?? "rgba(255,255,255,0.45)";

                return (
                  <div key={i} style={{
                    display: "flex", gap: 12,
                    paddingBottom: i < entries.length - 1 ? 12 : 0,
                    position: "relative",
                  }}>
                    {/* Timeline line */}
                    {i < entries.length - 1 && (
                      <div style={{
                        position: "absolute", left: 7, top: 16, bottom: 0,
                        width: 1, background: "rgba(255,255,255,0.06)",
                      }} />
                    )}

                    {/* Node dot */}
                    <div style={{
                      width: 15, height: 15, borderRadius: "50%",
                      flexShrink: 0, marginTop: 2,
                      background: isSignificant ? `${mk.dot}18` : "rgba(255,255,255,0.04)",
                      border: `1.5px solid ${isSignificant ? mk.dot : "rgba(255,255,255,0.12)"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <div style={{
                        width: 5, height: 5, borderRadius: "50%",
                        background: isSignificant ? mk.dot : "rgba(255,255,255,0.20)",
                      }} />
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1 }}>
                      {/* Change type + time */}
                      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                        <span style={{
                          fontSize: isSignificant ? 12 : 11,
                          fontWeight: isSignificant ? 700 : 500,
                          color: mk.color,
                        }}>
                          {mk.label}
                        </span>
                        {e.alertSeverity && (
                          <span style={{ fontSize: 9, color: "#f97316", fontWeight: 600 }}>⚠</span>
                        )}
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.20)", marginLeft: "auto" }}>
                          {e.time}
                        </span>
                      </div>

                      {/* Stance + action */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: e.deltaSummary ? 4 : 0 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: stanceColor }}>
                          {e.stance}
                        </span>
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.20)" }}>·</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: actionColor }}>
                          {e.actionBias}
                        </span>
                      </div>

                      {/* Delta summary */}
                      {e.deltaSummary && (
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", lineHeight: 1.5 }}>
                          {e.deltaSummary}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
