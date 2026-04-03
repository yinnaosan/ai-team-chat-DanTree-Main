/**
 * HistoryBlock — DanTree B1b 主脊柱子块
 * 消费 HistoryViewModel，显示历史变化与快照对比
 * B-1c 视觉 polish 留到 ui ux pro max 阶段
 */
import React from "react";
import type { HistoryViewModel } from "@/hooks/useWorkspaceViewModel";

interface HistoryBlockProps {
  vm: HistoryViewModel;
}

const formatTs = (ts: number | null) => {
  if (!ts) return null;
  return new Date(ts).toLocaleString();
};

export function HistoryBlock({ vm }: HistoryBlockProps) {
  if (!vm.available) return null;

  return (
    <div
      className="te-panel"
      style={{ marginTop: "12px", borderLeft: "2px solid rgba(20,184,166,0.3)" }}
      data-block="history"
    >
      {/* 标题行 */}
      <div className="te-panel-header">
        <span className="te-panel-label">历史变化</span>
        {vm.changeMarker && vm.changeMarker !== "stable" && vm.changeMarker !== "first_observation" && (
          <span style={{
            fontSize: "8px", fontFamily: "monospace", padding: "1px 5px", borderRadius: "2px",
            background: "#1e293b", border: "1px solid #334155", color: "#2dd4bf",
          }}>
            {vm.changeMarker.replace(/_/g, " ").toUpperCase()}
          </span>
        )}
      </div>

      {/* 内容区 */}
      <div className="te-panel-body" style={{ padding: "10px 14px" }}>
        {/* 变化摘要 */}
        {vm.deltaSummary && (
          <div style={{ fontSize: "9px", color: "#475569", fontFamily: "monospace", lineHeight: 1.6, marginBottom: "5px" }}>
            {vm.deltaSummary}
          </div>
        )}

        {/* 当前快照摘要 */}
        {vm.stateSummaryText && (
          <div style={{ fontSize: "9px", color: "#334155", fontFamily: "monospace", lineHeight: 1.6, marginBottom: "5px" }}>
            {vm.stateSummaryText}
          </div>
        )}

        {/* 上一快照摘要 */}
        {vm.previousSummary && (
          <div style={{ marginTop: "6px" }}>
            <span style={{ fontSize: "8px", color: "#4b5563", fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              上一 Snapshot
            </span>
            <div style={{ fontSize: "9px", color: "#334155", fontFamily: "monospace", lineHeight: 1.6, marginTop: "2px" }}>
              {vm.previousSummary}
            </div>
          </div>
        )}

        {/* 最近更新时间 */}
        {vm.lastSnapshotAt && (
          <div style={{ marginTop: "6px", fontSize: "8px", color: "#374151", fontFamily: "monospace" }}>
            最近更新 {formatTs(vm.lastSnapshotAt)}
          </div>
        )}
      </div>
    </div>
  );
}
