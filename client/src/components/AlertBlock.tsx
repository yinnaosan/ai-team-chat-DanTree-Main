/**
 * AlertBlock — DanTree Workspace v2.1-B2b
 * 交互层：整体折叠/展开 + 单条警报详情展开
 * ui-ux-pro-max: Financial Dashboard + max-height/opacity smooth collapse + hover/press state
 * 动效：0.22s ease-out（进入），0.18s ease-in（退出），prefers-reduced-motion 兼容
 * 风格：冷静、精密、克制
 */
import React, { useState } from "react";
import type { AlertViewModel } from "@/hooks/useWorkspaceViewModel";
import { DS, chipStyle, cardStyle, sectionTitleStyle } from "@/lib/designSystem";

interface AlertBlockProps {
  vm: AlertViewModel;
  blockRef?: React.RefObject<HTMLDivElement | null>;
}

function severityAccent(sev: string | null | undefined): string {
  if (!sev) return DS.border1;
  const s = sev.toLowerCase();
  if (s === "critical") return DS.bear;
  if (s === "high") return "#ea580c";
  if (s === "medium") return DS.medium;
  return DS.border1;
}

function severityDot(sev: string | null | undefined): string {
  if (!sev) return DS.text3;
  const s = sev.toLowerCase();
  if (s === "critical") return DS.bear;
  if (s === "high") return "#ea580c";
  if (s === "medium") return DS.medium;
  return DS.text3;
}

function severityChip(sev: string | null | undefined) {
  if (!sev) return null;
  const s = sev.toLowerCase();
  if (s === "critical") return <span style={chipStyle("critical")}>严重</span>;
  if (s === "high") return <span style={chipStyle("high")}>高风险</span>;
  if (s === "medium") return <span style={chipStyle("medium")}>中风险</span>;
  return <span style={chipStyle("low")}>低风险</span>;
}

// ─── Chevron icon ─────────────────────────────────────────────────────────────
function Chevron({ open, size = 12 }: { open: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      style={{
        transition: "transform 0.2s ease",
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        color: DS.text3,
        flexShrink: 0,
      }}
    >
      <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Smooth collapse panel ────────────────────────────────────────────────────
function CollapsePanel({ open, children, maxH = "600px" }: { open: boolean; children: React.ReactNode; maxH?: string }) {
  return (
    <div
      style={{
        maxHeight: open ? maxH : "0px",
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

// ─── AlertRow: single alert with expandable detail ────────────────────────────
function AlertRow({
  alert,
  index,
  isLast,
}: {
  alert: { severity: string; message: string };
  index: number;
  isLast: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const dot = severityDot(alert.severity);

  return (
    <div
      style={{
        borderBottom: !isLast ? `1px solid ${DS.border0}` : "none",
      }}
    >
      {/* Alert row — clickable */}
      <div
        role="button"
        aria-expanded={open}
        aria-label={open ? "收起详情" : "展开详情"}
        onClick={() => setOpen(o => !o)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          gap: DS.sp2,
          alignItems: "flex-start",
          padding: `${DS.sp2} ${DS.sp4}`,
          cursor: "pointer",
          background: open ? DS.surface3 : hovered ? DS.surface2 : "transparent",
          transition: DS.transition,
        }}
      >
        {/* Severity dot */}
        <span style={{
          width: "5px",
          height: "5px",
          borderRadius: "50%",
          background: dot,
          flexShrink: 0,
          marginTop: "5px",
          boxShadow: `0 0 4px ${dot}80`,
        }} />
        {/* Alert content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{
            fontFamily: DS.fontMono,
            fontSize: "8px",
            color: dot,
            fontWeight: 600,
            letterSpacing: "0.06em",
            marginRight: DS.sp2,
          }}>
            [{alert.severity.toUpperCase()}]
          </span>
          <span style={{
            fontFamily: DS.fontSans,
            fontSize: "10px",
            color: DS.text2,
            lineHeight: 1.5,
          }}>
            {alert.message}
          </span>
        </div>
        {/* Expand chevron */}
        <Chevron open={open} size={10} />
      </div>

      {/* 详情展开区域（平滑动画）*/}
      <CollapsePanel open={open} maxH="200px">
        <div style={{
          padding: `${DS.sp2} ${DS.sp4} ${DS.sp3} calc(${DS.sp4} + 13px)`,
          background: DS.surface3,
          borderTop: `1px solid ${DS.border0}`,
        }}>
          {/* Severity 行 */}
          <div style={{ display: "flex", alignItems: "center", gap: DS.sp2, marginBottom: DS.sp2 }}>
            <span style={{ ...sectionTitleStyle, fontSize: "8px" }}>Severity</span>
            {severityChip(alert.severity)}
          </div>
          {/* 风险解释 */}
          <div>
            <span style={{
              ...sectionTitleStyle,
              fontSize: "8px",
              display: "block",
              marginBottom: "4px",
            }}>
              风险解释
            </span>
            <span style={{
              fontFamily: DS.fontSans,
              fontSize: "10px",
              color: DS.text2,
              lineHeight: 1.65,
              letterSpacing: "0.01em",
            }}>
              {alert.message}
            </span>
          </div>
        </div>
      </CollapsePanel>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function AlertBlock({ vm, blockRef }: AlertBlockProps) {
  const [expanded, setExpanded] = useState(true);
  const [headerHovered, setHeaderHovered] = useState(false);

  if (!vm.available || vm.alertCount === 0) return null;

  const accent = severityAccent(vm.highestSeverity);

  return (
    <div
      id="block-alert"
      data-block="alert"
      ref={blockRef as React.RefObject<HTMLDivElement>}
      style={{
        ...cardStyle,
        borderLeft: `2px solid ${accent}`,
        borderRadius: `0 ${DS.r2} ${DS.r2} 0`,
        overflow: "hidden",
      }}
    >
      {/* ── Header row（可点击整体折叠/展开）── */}
      <div
        role="button"
        aria-expanded={expanded}
        aria-label={expanded ? "收起风险预警" : "展开风险预警"}
        onClick={() => setExpanded(e => !e)}
        onMouseEnter={() => setHeaderHovered(true)}
        onMouseLeave={() => setHeaderHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: DS.sp2,
          padding: `${DS.sp2} ${DS.sp4}`,
          borderBottom: `1px solid ${DS.border0}`,
          background: headerHovered ? DS.surface3 : DS.surface2,
          cursor: "pointer",
          userSelect: "none",
          transition: DS.transition,
        }}
      >
        <span style={sectionTitleStyle}>Alert 风险预警</span>

        {/* 折叠态：显示最高级别 chip + 条数 */}
        {!expanded && (
          <div style={{ display: "flex", alignItems: "center", gap: DS.sp2, flex: 1 }}>
            {severityChip(vm.highestSeverity)}
            <span style={{ fontFamily: DS.fontMono, fontSize: "9px", color: DS.text3 }}>
              {vm.alertCount} 条
            </span>
          </div>
        )}

        <div style={{ marginLeft: expanded ? "auto" : "0", display: "flex", alignItems: "center", gap: DS.sp2, flexShrink: 0 }}>
          {expanded && severityChip(vm.highestSeverity)}
          {expanded && (
            <span style={{ fontFamily: DS.fontMono, fontSize: "9px", color: DS.text3 }}>
              {vm.alertCount} 条
            </span>
          )}
          <Chevron open={expanded} />
        </div>
      </div>

      {/* ── Expanded content（平滑折叠动画）── */}
      <CollapsePanel open={expanded}>
        {/* Alert list with per-alert detail expansion */}
        {vm.keyAlerts.length > 0 && (
          <div style={{
            display: "flex",
            flexDirection: "column",
            borderBottom: vm.summaryText ? `1px solid ${DS.border0}` : "none",
          }}>
            {vm.keyAlerts.map((alert, i) => (
              <AlertRow
                key={i}
                alert={alert}
                index={i}
                isLast={i === vm.keyAlerts.length - 1}
              />
            ))}
          </div>
        )}

        {/* Summary text */}
        {vm.summaryText && (
          <div style={{
            padding: `${DS.sp2} ${DS.sp4}`,
            fontFamily: DS.fontSans,
            fontSize: "11px",
            color: DS.text2,
            lineHeight: 1.65,
            letterSpacing: "0.01em",
          }}>
            {vm.summaryText}
          </div>
        )}
      </CollapsePanel>
    </div>
  );
}
