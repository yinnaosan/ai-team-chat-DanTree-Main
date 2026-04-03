/**
 * HistoryBlock — DanTree Workspace v2.1-B1e v3
 * 统一设计系统：DS tokens + chipStyle factory
 */
import React from "react";
import type { HistoryViewModel } from "@/hooks/useWorkspaceViewModel";
import { DS, chipStyle, cardStyle, sectionTitleStyle } from "@/lib/designSystem";

interface HistoryBlockProps {
  vm: HistoryViewModel;
}

function formatTs(ts: number | null | undefined): string {
  if (!ts) return "—";
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} 小时前`;
  return d.toLocaleDateString();
}

function changeColor(marker: string | null | undefined): string {
  if (!marker) return DS.accent;
  if (marker.includes("upgrade") || marker.includes("improve") || marker.includes("strengthen")) return DS.bull;
  if (marker.includes("downgrade") || marker.includes("weaken") || marker.includes("deteriorat")) return DS.bear;
  return DS.accent;
}

export function HistoryBlock({ vm }: HistoryBlockProps) {
  if (!vm.available) return null;

  const showChange = vm.changeMarker && vm.changeMarker !== "stable" && vm.changeMarker !== "first_observation";
  const accentColor = DS.accent; // 青色系

  return (
    <div
      data-block="history"
      style={{
        ...cardStyle,
        borderLeft: `2px solid ${accentColor}`,
        borderRadius: `0 ${DS.r2} ${DS.r2} 0`,
        overflow: "hidden",
      }}
    >
      {/* Header row */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: DS.sp2,
        padding: `${DS.sp2} ${DS.sp4}`,
        borderBottom: `1px solid ${DS.border0}`,
        background: DS.surface2,
      }}>
        <span style={sectionTitleStyle}>历史变化</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: DS.sp2 }}>
          {showChange && vm.changeMarker && (
            <span style={{
              ...chipStyle("muted"),
              color: changeColor(vm.changeMarker),
            }}>
              {vm.changeMarker.replace(/_/g, " ").toUpperCase()}
            </span>
          )}
          {vm.lastSnapshotAt && (
            <span style={{ fontFamily: DS.fontMono, fontSize: "9px", color: DS.text3 }}>
              {formatTs(vm.lastSnapshotAt)}
            </span>
          )}
        </div>
      </div>

      {/* Delta summary */}
      {vm.deltaSummary && (
        <div style={{
          padding: `${DS.sp3} ${DS.sp4} ${DS.sp2}`,
          fontFamily: DS.fontSans,
          fontSize: "11px",
          color: DS.text2,
          lineHeight: 1.65,
          letterSpacing: "0.01em",
          borderBottom: vm.stateSummaryText || vm.previousSummary ? `1px solid ${DS.border0}` : "none",
        }}>
          {vm.deltaSummary}
        </div>
      )}

      {/* Current snapshot summary */}
      {vm.stateSummaryText && (
        <div style={{
          padding: `${DS.sp2} ${DS.sp4}`,
          fontFamily: DS.fontSans,
          fontSize: "10px",
          color: DS.text2,
          lineHeight: 1.65,
          letterSpacing: "0.01em",
          borderBottom: vm.previousSummary ? `1px solid ${DS.border0}` : "none",
        }}>
          {vm.stateSummaryText}
        </div>
      )}

      {/* Previous snapshot */}
      {vm.previousSummary && (
        <div style={{ padding: `${DS.sp2} ${DS.sp4}` }}>
          <div style={{ ...sectionTitleStyle, fontSize: "8px", marginBottom: DS.sp1 }}>上一快照</div>
          <div style={{
            fontFamily: DS.fontSans,
            fontSize: "10px",
            color: DS.text3,
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
