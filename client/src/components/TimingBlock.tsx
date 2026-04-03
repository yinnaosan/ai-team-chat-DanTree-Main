/**
 * TimingBlock — DanTree B1c 视觉层
 * 时机感 + 操作偏向矩阵：克制的黄色系 + 精密感
 * ui-ux-pro-max: Financial Dashboard 颜色系统 + Fira Code
 */
import React from "react";
import type { TimingViewModel } from "@/hooks/useWorkspaceViewModel";

interface TimingBlockProps {
  vm: TimingViewModel;
}

const readinessMap = {
  ready: { bg: "rgba(20, 83, 45, 0.5)", text: "#86efac", border: "rgba(22, 163, 74, 0.45)", accent: "#16a34a" },
  conditional: { bg: "rgba(69, 26, 3, 0.55)", text: "#fbbf24", border: "rgba(217, 119, 6, 0.5)", accent: "#d97706" },
  not_ready: { bg: "rgba(30, 41, 59, 0.4)", text: "#64748b", border: "rgba(51, 65, 85, 0.4)", accent: "#334155" },
};

const biasMap = {
  BUY: { bg: "rgba(20, 83, 45, 0.45)", text: "#4ade80", border: "rgba(22, 163, 74, 0.4)" },
  HOLD: { bg: "rgba(30, 58, 95, 0.45)", text: "#7dd3fc", border: "rgba(59, 130, 246, 0.4)" },
  AVOID: { bg: "rgba(127, 29, 29, 0.45)", text: "#f87171", border: "rgba(239, 68, 68, 0.4)" },
};

const riskColor = (risk: string | null) => {
  if (!risk) return "#475569";
  const r = risk.toLowerCase();
  if (r === "high") return "#f87171";
  if (r === "medium") return "#fbbf24";
  if (r === "low") return "#4ade80";
  return "#94a3b8";
};

export function TimingBlock({ vm }: TimingBlockProps) {
  if (!vm.available) return null;

  const rs = vm.readinessState ? readinessMap[vm.readinessState as keyof typeof readinessMap] : null;
  const bs = vm.actionBias ? biasMap[vm.actionBias as keyof typeof biasMap] : null;
  const accentColor = rs?.accent ?? "#d97706";

  return (
    <div
      data-block="timing"
      style={{
        background: "rgba(12, 15, 20, 0.85)",
        borderLeft: `2px solid ${accentColor}`,
        padding: "10px 14px",
        transition: "background 0.15s ease",
      }}
    >
      {/* ── 标题行 ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        marginBottom: "8px",
      }}>
        <span style={{
          fontSize: "9px",
          fontFamily: "'Fira Code', monospace",
          fontWeight: 700,
          color: "#3b5070",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          flex: 1,
        }}>
          Timing
        </span>

        {/* Readiness chip */}
        {rs && vm.readinessState && (
          <span style={{
            fontSize: "9px",
            fontFamily: "'Fira Code', monospace",
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: "3px",
            background: rs.bg,
            color: rs.text,
            border: `1px solid ${rs.border}`,
            letterSpacing: "0.05em",
          }}>
            {vm.readinessState === "ready" ? "时机就绪" :
             vm.readinessState === "conditional" ? "条件就绪" : "时机未到"}
          </span>
        )}
      </div>

      {/* ── 操作矩阵 ── */}
      <div style={{
        display: "flex",
        gap: "12px",
        alignItems: "center",
        flexWrap: "wrap",
        marginBottom: vm.timingSummary ? "8px" : "0",
        paddingBottom: vm.timingSummary ? "8px" : "0",
        borderBottom: vm.timingSummary ? "1px solid rgba(51, 65, 85, 0.2)" : "none",
      }}>
        {/* Action Bias */}
        {bs && vm.actionBias && (
          <span style={{
            fontSize: "11px",
            fontFamily: "'Fira Code', monospace",
            fontWeight: 700,
            padding: "3px 10px",
            borderRadius: "3px",
            background: bs.bg,
            color: bs.text,
            border: `1px solid ${bs.border}`,
            letterSpacing: "0.08em",
          }}>
            {vm.actionBias}
          </span>
        )}

        {/* Timing Risk */}
        {vm.timingRisk && (
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <span style={{ fontSize: "8px", fontFamily: "'Fira Code', monospace", color: "#475569", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              时机风险
            </span>
            <span style={{ fontSize: "10px", fontFamily: "'Fira Code', monospace", color: riskColor(vm.timingRisk), fontWeight: 500 }}>
              {vm.timingRisk.toUpperCase()}
            </span>
          </div>
        )}

        {/* Confirmation State */}
        {vm.confirmationState && (
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <span style={{ fontSize: "8px", fontFamily: "'Fira Code', monospace", color: "#475569", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              确认状态
            </span>
            <span style={{ fontSize: "10px", fontFamily: "'Fira Code', monospace", color: "#94a3b8", fontWeight: 500 }}>
              {vm.confirmationState}
            </span>
          </div>
        )}
      </div>

      {/* ── 摘要文本 ── */}
      {vm.timingSummary && (
        <div style={{
          fontSize: "10px",
          fontFamily: "'Fira Code', monospace",
          color: "#64748b",
          lineHeight: 1.65,
          letterSpacing: "0.01em",
        }}>
          {vm.timingSummary}
        </div>
      )}
    </div>
  );
}
