/**
 * HistoryBlock — DanTree Workspace v2.1-B2c
 * 轻交互：前次摘要"查看更多/收起"，平滑折叠动画
 * 稳定化：sessionStorage 持久化折叠状态（key: spine_{sessionId}_history_expanded）
 * ui-ux-pro-max: Financial Dashboard + max-height/opacity smooth collapse + hover/press state
 * 动效：0.22s ease-out（进入），0.18s ease-in（退出）
 * 风格：冷静、精密、克制
 */
import React, { useState } from "react";
import type { HistoryViewModel } from "@/hooks/useWorkspaceViewModel";
import { DS, chipStyle, cardStyle, sectionTitleStyle } from "@/lib/designSystem";
import { useSpineExpanded } from "@/hooks/useSpineExpanded";

interface HistoryBlockProps {
  vm: HistoryViewModel;
  blockRef?: React.RefObject<HTMLDivElement | null>;
  sessionId?: string | null;
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

// ─── Smooth collapse panel ────────────────────────────────────────────────────
function CollapsePanel({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div
      style={{
        maxHeight: open ? "400px" : "0px",
        opacity: open ? 1 : 0,
        overflow: "hidden",
        transition: open
          ? "max-height 0.22s ease-out, opacity 0.18s ease-out"
          : "max-height 0.18s ease-in, opacity 0.14s ease-in",
      }}
    >
      {children}
    </div>
  );
}

export function HistoryBlock({ vm, blockRef, sessionId }: HistoryBlockProps) {
  // 前次快照展开状态不持久化（轻交互，每次进入默认收起）
  const [showPrevious, setShowPrevious] = useState(false);
  const [moreHovered, setMoreHovered] = useState(false);
  // HistoryBlock 本身不折叠（无整体折叠交互），保持 B2b 设计
  // 但 sessionId 传入以备未来扩展

  if (!vm.available) return null;

  const showChange = vm.changeMarker && vm.changeMarker !== "stable" && vm.changeMarker !== "first_observation";
  const accentColor = DS.accent;
  const hasPrevious = !!vm.previousSummary;

  return (
    <div
      id="block-history"
      data-block="history"
      ref={blockRef as React.RefObject<HTMLDivElement>}
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
        <span style={sectionTitleStyle}>History 历史变化</span>
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
          borderBottom: vm.stateSummaryText ? `1px solid ${DS.border0}` : "none",
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
          borderBottom: hasPrevious ? `1px solid ${DS.border0}` : "none",
        }}>
          {vm.stateSummaryText}
        </div>
      )}

      {/* Previous snapshot — 轻量"查看更多/收起"（平滑动画）*/}
      {hasPrevious && (
        <div>
          <div
            role="button"
            aria-expanded={showPrevious}
            aria-label={showPrevious ? "收起前次快照" : "查看前次快照"}
            onClick={() => setShowPrevious(p => !p)}
            onMouseEnter={() => setMoreHovered(true)}
            onMouseLeave={() => setMoreHovered(false)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: DS.sp1,
              padding: `${DS.sp1} ${DS.sp4}`,
              cursor: "pointer",
              background: moreHovered ? DS.surface2 : "transparent",
              transition: DS.transition,
            }}
          >
            <span style={{
              fontFamily: DS.fontMono,
              fontSize: "9px",
              color: moreHovered ? DS.accent : DS.text3,
              letterSpacing: "0.04em",
              transition: DS.transition,
            }}>
              {showPrevious ? "▴ 收起前次快照" : "▾ 查看前次快照"}
            </span>
          </div>

          <CollapsePanel open={showPrevious}>
            <div style={{
              padding: `${DS.sp2} ${DS.sp4} ${DS.sp3}`,
              background: DS.surface3,
              borderTop: `1px solid ${DS.border0}`,
            }}>
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
          </CollapsePanel>
        </div>
      )}
    </div>
  );
}
