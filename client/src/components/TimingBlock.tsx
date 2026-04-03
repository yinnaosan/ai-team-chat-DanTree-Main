/**
 * TimingBlock — DanTree B1b 主脊柱子块
 * 消费 TimingViewModel，显示执行时机状态
 * B-1c 视觉 polish 留到 ui ux pro max 阶段
 */
import React from "react";
import type { TimingViewModel } from "@/hooks/useWorkspaceViewModel";

interface TimingBlockProps {
  vm: TimingViewModel;
}

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

export function TimingBlock({ vm }: TimingBlockProps) {
  if (!vm.available) return null;

  const rs = readinessStyle(vm.readinessState);
  const bs = biasStyle(vm.actionBias);

  return (
    <div
      className="te-panel"
      style={{ marginTop: "12px", borderLeft: "2px solid rgba(234,179,8,0.3)" }}
      data-block="timing"
    >
      {/* 标题行 */}
      <div className="te-panel-header">
        <span className="te-panel-label">Timing</span>
        {vm.readinessState && (
          <span style={{
            fontSize: "8px", fontFamily: "monospace", padding: "1px 5px", borderRadius: "2px",
            background: rs.bg, color: rs.text, border: `1px solid ${rs.border}`,
          }}>
            {vm.readinessState.toUpperCase()}
          </span>
        )}
        {vm.advisoryOnly && (
          <span style={{ fontSize: "9px", color: "#475569", fontFamily: "monospace", marginLeft: "auto" }}>advisory</span>
        )}
      </div>

      {/* 内容区 */}
      <div className="te-panel-body" style={{ padding: "10px 14px" }}>
        {/* 操作偏向 + 风险 + 确认状态 */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "6px", flexWrap: "wrap", alignItems: "center" }}>
          {vm.actionBias && (
            <span style={{
              fontSize: "9px", fontFamily: "monospace", padding: "2px 7px", borderRadius: "2px",
              background: bs.bg, color: bs.text, border: `1px solid ${bs.border}`,
            }}>
              {vm.actionBias}
            </span>
          )}
          {vm.timingRisk != null && (
            <span style={{ fontSize: "9px", color: "#64748b", fontFamily: "monospace" }}>
              风险 <span style={{ color: "#94a3b8" }}>{vm.timingRisk.toUpperCase()}</span>
            </span>
          )}
          {vm.confirmationState && (
            <span style={{ fontSize: "9px", color: "#64748b", fontFamily: "monospace" }}>
              确认 <span style={{ color: "#94a3b8" }}>{vm.confirmationState}</span>
            </span>
          )}
        </div>

        {/* 摘要文本 */}
        {vm.timingSummary && (
          <div style={{ fontSize: "9px", color: "#475569", fontFamily: "monospace", lineHeight: 1.6 }}>
            {vm.timingSummary}
          </div>
        )}
      </div>
    </div>
  );
}
