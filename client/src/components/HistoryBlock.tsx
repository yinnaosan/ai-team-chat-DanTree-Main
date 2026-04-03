/**
 * HistoryBlock — DanTree B1c 视觉层
 * 时间感 + 变化对比：青色系 + 档案质感
 * ui-ux-pro-max: Financial Dashboard 颜色系统 + Fira Code
 */
import React from "react";
import type { HistoryViewModel } from "@/hooks/useWorkspaceViewModel";

interface HistoryBlockProps {
  vm: HistoryViewModel;
}

const formatTs = (ts: number | null) => {
  if (!ts) return null;
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} 小时前`;
  return d.toLocaleDateString();
};

const changeMarkerColor = (marker: string) => {
  if (marker.includes("upgrade") || marker.includes("improve") || marker.includes("strengthen")) return "#4ade80";
  if (marker.includes("downgrade") || marker.includes("weaken") || marker.includes("deteriorat")) return "#f87171";
  return "#2dd4bf";
};

export function HistoryBlock({ vm }: HistoryBlockProps) {
  if (!vm.available) return null;

  const showChange = vm.changeMarker && vm.changeMarker !== "stable" && vm.changeMarker !== "first_observation";
  const changeColor = showChange && vm.changeMarker ? changeMarkerColor(vm.changeMarker) : "#2dd4bf";

  return (
    <div
      data-block="history"
      style={{
        background: "rgba(12, 15, 20, 0.85)",
        borderLeft: `2px solid rgba(20, 184, 166, 0.5)`,
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
          历史变化
        </span>

        {/* Change marker chip */}
        {showChange && vm.changeMarker && (
          <span style={{
            fontSize: "8px",
            fontFamily: "'Fira Code', monospace",
            fontWeight: 600,
            padding: "1px 6px",
            borderRadius: "3px",
            background: "rgba(30, 41, 59, 0.5)",
            color: changeColor,
            border: `1px solid rgba(51, 65, 85, 0.4)`,
            letterSpacing: "0.04em",
          }}>
            {vm.changeMarker.replace(/_/g, " ").toUpperCase()}
          </span>
        )}

        {/* 最近更新时间 */}
        {vm.lastSnapshotAt && (
          <span style={{
            fontSize: "8px",
            fontFamily: "'Fira Code', monospace",
            color: "#334155",
            letterSpacing: "0.02em",
          }}>
            {formatTs(vm.lastSnapshotAt)}
          </span>
        )}
      </div>

      {/* ── 变化摘要 ── */}
      {vm.deltaSummary && (
        <div style={{
          fontSize: "10px",
          fontFamily: "'Fira Code', monospace",
          color: "#64748b",
          lineHeight: 1.65,
          marginBottom: "6px",
          letterSpacing: "0.01em",
        }}>
          {vm.deltaSummary}
        </div>
      )}

      {/* ── 当前快照摘要 ── */}
      {vm.stateSummaryText && (
        <div style={{
          fontSize: "10px",
          fontFamily: "'Fira Code', monospace",
          color: "#475569",
          lineHeight: 1.65,
          marginBottom: "6px",
          letterSpacing: "0.01em",
        }}>
          {vm.stateSummaryText}
        </div>
      )}

      {/* ── 上一快照 ── */}
      {vm.previousSummary && (
        <div style={{
          marginTop: "6px",
          paddingTop: "6px",
          borderTop: "1px solid rgba(51, 65, 85, 0.2)",
        }}>
          <div style={{
            fontSize: "8px",
            fontFamily: "'Fira Code', monospace",
            color: "#334155",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: "3px",
          }}>
            上一快照
          </div>
          <div style={{
            fontSize: "10px",
            fontFamily: "'Fira Code', monospace",
            color: "#3b5070",
            lineHeight: 1.65,
            letterSpacing: "0.01em",
          }}>
            {vm.previousSummary}
          </div>
        </div>
      )}
    </div>
  );
}
