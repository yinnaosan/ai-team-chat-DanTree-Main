/**
 * TimingBlock.tsx — DanTree Workspace v2.1-B5
 * Decision Canvas｜执行时机模块
 */
import React, { useState } from "react";
import { ChevronDown, ChevronRight, Zap } from "lucide-react";

export interface TimingBlockProps {
  readinessState?: "ready" | "conditional" | "not_ready" | "blocked";
  actionBias?: "BUY" | "HOLD" | "WAIT" | "AVOID" | "NONE";
  entryQuality?: "high" | "moderate" | "low" | "unavailable";
  timingRisk?: "low" | "medium" | "high" | "critical";
  confirmationState?: "confirmed" | "partial" | "unconfirmed" | "conflicted";
  noActionReason?: string | null;
  timingSummary?: string;
}

const READINESS = {
  ready:       { label: "可进场", color: "#34d399", bg: "#0d2b1e" },
  conditional: { label: "条件待定", color: "#fbbf24", bg: "#2b1e0d" },
  not_ready:   { label: "未就绪", color: "#6b7280", bg: "#151820" },
  blocked:     { label: "被阻止", color: "#f87171", bg: "#2b0d0d" },
};
const ACTION = {
  BUY:  { label: "买入", color: "#34d399", bg: "#0d2b1e" },
  HOLD: { label: "持有", color: "#60a5fa", bg: "#0d1a2b" },
  WAIT: { label: "等待", color: "#fbbf24", bg: "#2b1e0d" },
  AVOID:{ label: "回避", color: "#f87171", bg: "#2b0d0d" },
  NONE: { label: "—",   color: "#4b5563", bg: "#111827" },
};
const RISK = {
  low:      { label: "低", color: "#34d399" },
  medium:   { label: "中", color: "#fbbf24" },
  high:     { label: "高", color: "#f97316" },
  critical: { label: "极高", color: "#f87171" },
};

export function TimingBlock({
  readinessState = "conditional",
  actionBias = "HOLD",
  entryQuality = "moderate",
  timingRisk = "medium",
  confirmationState = "partial",
  noActionReason = null,
  timingSummary,
}: TimingBlockProps) {
  const [open, setOpen] = useState(true);
  const rd = READINESS[readinessState] ?? READINESS.not_ready;
  const ac = ACTION[actionBias] ?? ACTION.NONE;
  const rk = RISK[timingRisk] ?? RISK.medium;

  return (
    <div style={{ background: "#0a0e1a", border: "1px solid #1e2736", borderRadius: 10, overflow: "hidden" }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", cursor: "pointer", background: "transparent", border: "none", borderBottom: open ? "1px solid #1e2736" : "none" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Zap size={13} color="#fbbf24" />
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "#64748b", textTransform: "uppercase" }}>执行时机</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: rd.color, background: rd.bg, padding: "1px 6px", borderRadius: 3, border: `1px solid ${rd.color}30` }}>{rd.label}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: ac.color, background: ac.bg, padding: "2px 9px", borderRadius: 4, letterSpacing: "0.05em", border: `1px solid ${ac.color}40` }}>{ac.label}</span>
          {open ? <ChevronDown size={13} color="#374151" /> : <ChevronRight size={13} color="#374151" />}
        </div>
      </button>
      {open && (
        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {[
              { label: "进场质量", value: entryQuality === "high" ? "高" : entryQuality === "moderate" ? "中" : entryQuality === "low" ? "低" : "—", color: entryQuality === "high" ? "#34d399" : entryQuality === "moderate" ? "#60a5fa" : "#f87171" },
              { label: "时机风险", value: rk.label, color: rk.color },
              { label: "信号确认", value: confirmationState === "confirmed" ? "已确认" : confirmationState === "partial" ? "部分" : confirmationState === "conflicted" ? "冲突" : "未确认", color: confirmationState === "confirmed" ? "#34d399" : confirmationState === "conflicted" ? "#f87171" : "#fbbf24" },
            ].map((item, i) => (
              <div key={i} style={{ background: "#080c14", border: "1px solid #131c2e", borderRadius: 7, padding: "8px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>{item.label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: item.color }}>{item.value}</div>
              </div>
            ))}
          </div>
          {noActionReason && (
            <div style={{ fontSize: 11, color: "#6b7280", background: "#0d0f18", border: "1px solid #1e2736", borderRadius: 6, padding: "7px 10px", lineHeight: 1.5 }}>
              ⚠ {noActionReason}
            </div>
          )}
          {timingSummary && (
            <p style={{ fontSize: 11, color: "#475569", margin: 0, lineHeight: 1.6 }}>{timingSummary}</p>
          )}
        </div>
      )}
    </div>
  );
}
