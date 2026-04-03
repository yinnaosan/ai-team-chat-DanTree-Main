/**
 * ThesisBlock — DanTree B1b 主脊柱子块
 * 消费 ThesisViewModel，显示当前 Thesis 状态
 * B-1c 视觉 polish 留到 ui ux pro max 阶段
 */
import React from "react";
import type { ThesisViewModel } from "@/hooks/useWorkspaceViewModel";

interface ThesisBlockProps {
  vm: ThesisViewModel;
}

const stanceColor = (stance: string | null) => {
  if (stance === "bullish") return { bg: "#14532d", text: "#86efac", border: "#16a34a" };
  if (stance === "bearish") return { bg: "#7f1d1d", text: "#fca5a5", border: "#ef4444" };
  if (stance === "neutral") return { bg: "#1e3a5f", text: "#93c5fd", border: "#3b82f6" };
  return { bg: "#1e293b", text: "#94a3b8", border: "#334155" };
};

export function ThesisBlock({ vm }: ThesisBlockProps) {
  if (!vm.available) return null;

  const sc = stanceColor(vm.stance);

  return (
    <div
      className="te-panel"
      style={{ marginTop: "12px", borderLeft: "2px solid rgba(168,85,247,0.3)" }}
      data-block="thesis"
    >
      {/* 标题行 */}
      <div className="te-panel-header">
        <span className="te-panel-label">Thesis</span>
        {vm.stance && (
          <span style={{
            fontSize: "8px", fontFamily: "monospace", padding: "1px 5px", borderRadius: "2px",
            background: sc.bg, color: sc.text, border: `1px solid ${sc.border}`,
          }}>
            {vm.stance.toUpperCase()}
          </span>
        )}
        {vm.advisoryOnly && (
          <span style={{ fontSize: "9px", color: "#475569", fontFamily: "monospace", marginLeft: "auto" }}>advisory</span>
        )}
      </div>

      {/* 内容区 */}
      <div className="te-panel-body" style={{ padding: "10px 14px" }}>
        {/* 状态标签行 */}
        <div style={{ display: "flex", gap: "12px", marginBottom: "6px", flexWrap: "wrap" }}>
          {vm.evidenceState && (
            <span style={{ fontSize: "9px", color: "#64748b", fontFamily: "monospace" }}>
              证据 <span style={{ color: "#94a3b8" }}>{vm.evidenceState}</span>
            </span>
          )}
          {vm.gateState && (
            <span style={{ fontSize: "9px", color: "#64748b", fontFamily: "monospace" }}>
              Gate <span style={{ color: "#94a3b8" }}>{vm.gateState}</span>
            </span>
          )}
          {vm.sourceState && (
            <span style={{ fontSize: "9px", color: "#64748b", fontFamily: "monospace" }}>
              来源 <span style={{ color: "#94a3b8" }}>{vm.sourceState}</span>
            </span>
          )}
          {vm.fragilityScore != null && (
            <span style={{ fontSize: "9px", color: "#64748b", fontFamily: "monospace" }}>
              脆弱性 <span style={{ color: "#fbbf24" }}>{(vm.fragilityScore * 100).toFixed(0)}%</span>
            </span>
          )}
        </div>

        {/* 变化标记 */}
        {vm.changeMarker && vm.changeMarker !== "stable" && vm.changeMarker !== "unknown" && (
          <div style={{ marginBottom: "5px" }}>
            <span style={{
              fontSize: "8px", fontFamily: "monospace", padding: "1px 5px", borderRadius: "2px",
              background: "#1e293b", border: "1px solid #334155", color: "#fbbf24",
            }}>
              {vm.changeMarker.replace(/_/g, " ").toUpperCase()}
            </span>
          </div>
        )}

        {/* 摘要文本 */}
        {vm.stateSummaryText && (
          <div style={{ fontSize: "9px", color: "#475569", fontFamily: "monospace", lineHeight: 1.6 }}>
            {vm.stateSummaryText}
          </div>
        )}
      </div>
    </div>
  );
}
