/**
 * TimingBlock.tsx — DanTree Workspace 卡片系统 v2
 *
 * 完善点：
 * - 最大视觉权重给 readiness + action bias，而不是三个并列小格
 * - "现在该动 vs 等待"的判断感更强
 * - 关键确认条件作为 checklist，有行动意义
 * - noActionReason 更像阻塞说明，不是系统提示
 * - 催化剂/进场区作为 supporting detail，不抢主区
 */
import React, { useState } from "react";
import { ChevronDown, ChevronRight, Zap, Clock, CheckCircle2, Circle } from "lucide-react";

export interface TimingBlockProps {
  readinessState?: "ready" | "conditional" | "not_ready" | "blocked";
  actionBias?: "BUY" | "HOLD" | "WAIT" | "AVOID" | "NONE";
  entryQuality?: "high" | "moderate" | "low" | "unavailable";
  timingRisk?: "low" | "medium" | "high" | "critical";
  confirmationState?: "confirmed" | "partial" | "unconfirmed" | "conflicted";
  noActionReason?: string | null;
  timingSummary?: string;
  confirmationItems?: Array<{ label: string; met: boolean }>;
  entryZone?: string;
  nextCatalyst?: string;
  catalystDays?: number;
}

const READINESS_CFG = {
  ready:       { label: "可进场",   color: "#10b981", bg: "rgba(16,185,129,0.10)", desc: "条件具备，可以执行" },
  conditional: { label: "条件待定", color: "#f59e0b", bg: "rgba(245,158,11,0.08)", desc: "需等待关键确认" },
  not_ready:   { label: "未就绪",   color: "#6b7280", bg: "rgba(107,114,128,0.07)", desc: "条件不足，继续观察" },
  blocked:     { label: "被阻止",   color: "#ef4444", bg: "rgba(239,68,68,0.08)",  desc: "当前不适合操作" },
};

const ACTION_CFG = {
  BUY:   { label: "买入",  color: "#10b981", weight: "strong" },
  HOLD:  { label: "持有",  color: "#60a5fa", weight: "medium" },
  WAIT:  { label: "等待",  color: "#f59e0b", weight: "medium" },
  AVOID: { label: "回避",  color: "#ef4444", weight: "strong" },
  NONE:  { label: "—",     color: "#4b5563", weight: "weak"   },
};

const CONF_CFG = {
  confirmed:   { label: "已确认", color: "#10b981" },
  partial:     { label: "部分确认", color: "#f59e0b" },
  unconfirmed: { label: "未确认", color: "#6b7280" },
  conflicted:  { label: "信号冲突", color: "#ef4444" },
};

const RISK_CFG = {
  low:      { label: "低", color: "#10b981" },
  medium:   { label: "中", color: "#f59e0b" },
  high:     { label: "高", color: "#f97316" },
  critical: { label: "极高", color: "#ef4444" },
};

export function TimingBlock({
  readinessState = "not_ready",
  actionBias = "NONE",
  entryQuality = "unavailable",
  timingRisk = "medium",
  confirmationState = "unconfirmed",
  noActionReason = null,
  timingSummary,
  confirmationItems = [],
  entryZone,
  nextCatalyst,
  catalystDays,
}: TimingBlockProps) {
  const [open, setOpen] = useState(true);
  const rd = READINESS_CFG[readinessState] ?? READINESS_CFG.not_ready;
  const ac = ACTION_CFG[actionBias] ?? ACTION_CFG.NONE;
  const cf = CONF_CFG[confirmationState] ?? CONF_CFG.unconfirmed;
  const rk = RISK_CFG[timingRisk] ?? RISK_CFG.medium;

  return (
    <section style={{
      background: "rgba(12,16,24,0.82)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 16, overflow: "hidden",
      boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
    }}>
      {/* Header */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center",
          justifyContent: "space-between", padding: "14px 18px",
          cursor: "pointer", background: "transparent", border: "none",
          borderBottom: open ? "1px solid rgba(255,255,255,0.05)" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Zap size={13} color="rgba(245,158,11,0.70)" />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "rgba(255,255,255,0.40)", textTransform: "uppercase" }}>
            Timing
          </span>
          <span style={{
            fontSize: 10, fontWeight: 600, color: rd.color,
            background: rd.bg, padding: "2px 7px", borderRadius: 4,
            border: `1px solid ${rd.color}22`,
          }}>
            {rd.label}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Action bias — 最重要的输出 */}
          <span style={{
            fontSize: 13, fontWeight: 800, color: ac.color,
            background: `${ac.color}12`,
            padding: "3px 10px", borderRadius: 5,
            border: `1px solid ${ac.color}28`,
            letterSpacing: "0.04em",
          }}>
            {ac.label}
          </span>
          {open
            ? <ChevronDown size={12} color="rgba(255,255,255,0.22)" />
            : <ChevronRight size={12} color="rgba(255,255,255,0.22)" />}
        </div>
      </button>

      {open && (
        <div style={{ padding: "14px 18px 16px", display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Readiness description — "现在 vs 等待" */}
          <div style={{
            padding: "10px 13px",
            background: rd.bg,
            border: `1px solid ${rd.color}20`,
            borderRadius: 10,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: rd.color, marginBottom: 2 }}>
                {rd.desc}
              </div>
              {noActionReason && (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", lineHeight: 1.5 }}>
                  {noActionReason}
                </div>
              )}
            </div>
          </div>

          {/* Supporting metrics row */}
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { label: "进场质量", value: entryQuality === "high" ? "高" : entryQuality === "moderate" ? "中" : entryQuality === "low" ? "低" : "—", color: entryQuality === "high" ? "#10b981" : entryQuality === "moderate" ? "#60a5fa" : "#6b7280" },
              { label: "时机风险", value: rk.label, color: rk.color },
              { label: "信号确认", value: cf.label, color: cf.color },
            ].map((item, i) => (
              <div key={i} style={{
                flex: 1, padding: "8px 10px",
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.05)",
                borderRadius: 8, textAlign: "center",
              }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.28)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>
                  {item.label}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: item.color }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          {/* Confirmation checklist — 关键确认条件 */}
          {confirmationItems.length > 0 && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.22)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 6 }}>
                确认条件
              </div>
              {confirmationItems.map((item, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "5px 0",
                  borderBottom: i < confirmationItems.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                }}>
                  {item.met
                    ? <CheckCircle2 size={13} color="#10b981" />
                    : <Circle size={13} color="rgba(255,255,255,0.20)" />}
                  <span style={{ fontSize: 12, color: item.met ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.35)" }}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Entry zone + catalyst — supporting detail */}
          {(entryZone || nextCatalyst) && (
            <div style={{ display: "flex", gap: 8 }}>
              {entryZone && (
                <div style={{
                  flex: 1, padding: "8px 10px",
                  background: "rgba(16,185,129,0.05)",
                  border: "1px solid rgba(16,185,129,0.12)",
                  borderRadius: 8,
                }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: "rgba(16,185,129,0.55)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>
                    介入区间
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#10b981", fontVariantNumeric: "tabular-nums" }}>
                    {entryZone}
                  </div>
                </div>
              )}
              {nextCatalyst && (
                <div style={{
                  flex: 1, padding: "8px 10px",
                  background: "rgba(245,158,11,0.05)",
                  border: "1px solid rgba(245,158,11,0.12)",
                  borderRadius: 8,
                }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: "rgba(245,158,11,0.55)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3, display: "flex", alignItems: "center", gap: 4 }}>
                    <Clock size={9} />
                    下一催化剂
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.60)", lineHeight: 1.4 }}>
                    {nextCatalyst}
                    {catalystDays != null && (
                      <span style={{ color: "#f59e0b", fontWeight: 700, marginLeft: 5 }}>
                        {catalystDays}d
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {timingSummary && (
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", margin: 0, lineHeight: 1.6 }}>
              {timingSummary}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
