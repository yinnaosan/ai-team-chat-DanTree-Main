/**
 * DecisionHeader — DanTree B1b 顶部决策栏
 * 消费 HeaderViewModel，显示当前对象 / 会话类型 / Thesis stance /
 * Readiness / Action bias / Alert severity / Change marker / 最近更新
 * 文案优先中文，专业词汇保留英文
 * B-1c 视觉 polish 留到 ui ux pro max 阶段
 */
import React from "react";
import type { HeaderViewModel } from "@/hooks/useWorkspaceViewModel";

interface DecisionHeaderProps {
  vm: HeaderViewModel;
}

const stanceStyle = (stance: string | null) => {
  if (stance === "bullish") return { bg: "#14532d", text: "#86efac", border: "#16a34a" };
  if (stance === "bearish") return { bg: "#7f1d1d", text: "#fca5a5", border: "#ef4444" };
  if (stance === "neutral") return { bg: "#1e3a5f", text: "#93c5fd", border: "#3b82f6" };
  return { bg: "#1e293b", text: "#94a3b8", border: "#334155" };
};

const readinessStyle = (state: string | null) => {
  if (state === "ready") return { bg: "#14532d", text: "#86efac", border: "#16a34a" };
  if (state === "conditional") return { bg: "#451a03", text: "#fbbf24", border: "#d97706" };
  return { bg: "#1e293b", text: "#94a3b8", border: "#334155" };
};

const biasStyle = (bias: string | null) => {
  if (bias === "BUY") return { bg: "#14532d", text: "#86efac", border: "#16a34a" };
  if (bias === "AVOID") return { bg: "#7f1d1d", text: "#fca5a5", border: "#ef4444" };
  if (bias === "HOLD") return { bg: "#1e3a5f", text: "#93c5fd", border: "#3b82f6" };
  return { bg: "#1e293b", text: "#94a3b8", border: "#334155" };
};

const severityStyle = (sev: string | null) => {
  if (sev === "critical") return { bg: "#7f1d1d", text: "#fca5a5", border: "#ef4444" };
  if (sev === "high") return { bg: "#431407", text: "#fb923c", border: "#ea580c" };
  if (sev === "medium") return { bg: "#451a03", text: "#fbbf24", border: "#d97706" };
  return null; // low/null → 不显示
};

const chip = (label: string, s: { bg: string; text: string; border: string }) => (
  <span style={{
    fontSize: "8px", fontFamily: "monospace", padding: "2px 6px", borderRadius: "2px",
    background: s.bg, color: s.text, border: `1px solid ${s.border}`,
    letterSpacing: "0.04em",
  }}>
    {label}
  </span>
);

const formatTs = (ts: number | null) => {
  if (!ts) return null;
  return new Date(ts).toLocaleString();
};

export function DecisionHeader({ vm }: DecisionHeaderProps) {
  const ss = stanceStyle(vm.stance);
  const rs = readinessStyle(vm.readinessState);
  const bs = biasStyle(vm.actionBias);
  const sevS = severityStyle(vm.highestSeverity);

  return (
    <div
      data-component="decision-header"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(15,23,42,0.6)",
        flexWrap: "wrap",
        minHeight: "36px",
      }}
    >
      {/* 当前对象 */}
      <span style={{
        fontSize: "11px", fontFamily: "monospace", fontWeight: 700,
        color: "#e2e8f0", letterSpacing: "0.08em",
      }}>
        {vm.entity || "—"}
      </span>

      {/* 会话类型 */}
      {vm.sessionType && (
        <span style={{
          fontSize: "8px", fontFamily: "monospace", color: "#475569",
          padding: "1px 5px", borderRadius: "2px",
          background: "#1e293b", border: "1px solid #334155",
        }}>
          {vm.sessionType}
        </span>
      )}

      {/* 分隔 */}
      <span style={{ color: "#1e293b", fontSize: "10px" }}>|</span>

      {/* Thesis stance */}
      {vm.stance && chip(vm.stance.toUpperCase(), ss)}

      {/* Readiness */}
      {vm.readinessState && chip(vm.readinessState.toUpperCase(), rs)}

      {/* Action bias */}
      {vm.actionBias && vm.actionBias !== "NONE" && chip(vm.actionBias, bs)}

      {/* Alert severity */}
      {sevS && vm.highestSeverity && chip(vm.highestSeverity.toUpperCase(), sevS)}

      {/* Change marker */}
      {vm.changeMarker && vm.changeMarker !== "stable" && vm.changeMarker !== "unknown" && (
        <span style={{
          fontSize: "8px", fontFamily: "monospace", padding: "1px 5px", borderRadius: "2px",
          background: "#1e293b", border: "1px solid #334155", color: "#fbbf24",
        }}>
          {vm.changeMarker.replace(/_/g, " ").toUpperCase()}
        </span>
      )}

      {/* Advisory only 标记 */}
      {vm.advisoryOnly && (
        <span style={{ fontSize: "8px", color: "#374151", fontFamily: "monospace" }}>advisory</span>
      )}

      {/* 最近更新 — 右对齐 */}
      {vm.lastSnapshotAt && (
        <span style={{
          fontSize: "8px", color: "#374151", fontFamily: "monospace",
          marginLeft: "auto", whiteSpace: "nowrap",
        }}>
          最近更新 {formatTs(vm.lastSnapshotAt)}
        </span>
      )}
    </div>
  );
}
