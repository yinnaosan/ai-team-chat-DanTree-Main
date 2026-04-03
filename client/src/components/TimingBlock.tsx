/**
 * TimingBlock — DanTree Workspace v2.1-B2b
 * 交互层：折叠/展开（默认展开），折叠态保留 readiness chip + action bias + 1行 timingSummary
 * ui-ux-pro-max: Financial Dashboard + max-height/opacity smooth collapse + hover/press state
 * 动效：0.2s ease-out（进入），0.18s ease-in（退出），prefers-reduced-motion 兼容
 * 风格：冷静、精密、克制，对标 Apple / Tesla / NVIDIA
 */
import React, { useState, useRef } from "react";
import type { TimingViewModel } from "@/hooks/useWorkspaceViewModel";
import { DS, chipStyle, cardStyle, sectionTitleStyle } from "@/lib/designSystem";

interface TimingBlockProps {
  vm: TimingViewModel;
  blockRef?: React.RefObject<HTMLDivElement | null>;
}

// ─── Readiness accent color ───────────────────────────────────────────────────
function readinessAccent(state: string | null | undefined): string {
  if (!state) return DS.medium;
  const s = state.toLowerCase();
  if (s === "ready") return DS.bull;
  if (s === "conditional") return DS.medium;
  return DS.border1;
}

// ─── Risk color ───────────────────────────────────────────────────────────────
function riskColor(risk: string | null | undefined): string {
  if (!risk) return DS.text3;
  const r = risk.toLowerCase();
  if (r === "high") return DS.bear;
  if (r === "medium") return DS.medium;
  if (r === "low") return DS.bull;
  return DS.text2;
}

// ─── Chevron icon ─────────────────────────────────────────────────────────────
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
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

// ─── Smooth collapse wrapper ──────────────────────────────────────────────────
// ui-ux-pro-max: max-height + opacity + overflow hidden, 0.2s ease-out
function CollapsePanel({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div
      style={{
        maxHeight: open ? "600px" : "0px",
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

// ─── Main Component ───────────────────────────────────────────────────────────
export function TimingBlock({ vm, blockRef }: TimingBlockProps) {
  const [expanded, setExpanded] = useState(true);
  const [headerHovered, setHeaderHovered] = useState(false);

  if (!vm.available) return null;

  const accent = readinessAccent(vm.readinessState);

  const readinessChip = () => {
    if (!vm.readinessState) return null;
    const s = vm.readinessState.toLowerCase();
    if (s === "ready") return <span style={chipStyle("ready")}>时机就绪</span>;
    if (s === "conditional") return <span style={chipStyle("conditional")}>条件就绪</span>;
    return <span style={chipStyle("muted")}>时机未到</span>;
  };

  const biasChip = () => {
    if (!vm.actionBias) return null;
    const s = vm.actionBias.toUpperCase();
    if (s === "BUY") return <span style={chipStyle("buy")}>BUY</span>;
    if (s === "AVOID") return <span style={chipStyle("avoid")}>AVOID</span>;
    if (s === "HOLD") return <span style={chipStyle("hold")}>HOLD</span>;
    return null;
  };

  // 折叠态：1行 timingSummary（截断 60 字符）
  const collapsedSummary = vm.timingSummary
    ? vm.timingSummary.length > 60
      ? vm.timingSummary.slice(0, 60) + "…"
      : vm.timingSummary
    : null;

  return (
    <div
      id="block-timing"
      data-block="timing"
      ref={blockRef as React.RefObject<HTMLDivElement>}
      style={{
        ...cardStyle,
        borderLeft: `2px solid ${accent}`,
        borderRadius: `0 ${DS.r2} ${DS.r2} 0`,
        overflow: "hidden",
      }}
    >
      {/* ── Header row（可点击折叠/展开）── */}
      <div
        role="button"
        aria-expanded={expanded}
        aria-label={expanded ? "收起时机分析" : "展开时机分析"}
        onClick={() => setExpanded(e => !e)}
        onMouseEnter={() => setHeaderHovered(true)}
        onMouseLeave={() => setHeaderHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: DS.sp2,
          padding: `${DS.sp2} ${DS.sp4}`,
          borderBottom: expanded ? `1px solid ${DS.border0}` : "none",
          background: headerHovered ? DS.surface3 : DS.surface2,
          cursor: "pointer",
          userSelect: "none",
          transition: DS.transition,
        }}
      >
        <span style={sectionTitleStyle}>Timing 时机</span>

        {/* 折叠态：内联显示 readiness + bias + summary */}
        {!expanded && (
          <div style={{ display: "flex", alignItems: "center", gap: DS.sp2, flex: 1, overflow: "hidden" }}>
            {readinessChip()}
            {biasChip()}
            {collapsedSummary && (
              <span style={{
                fontFamily: DS.fontSans,
                fontSize: "10px",
                color: DS.text3,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
              }}>
                {collapsedSummary}
              </span>
            )}
          </div>
        )}

        <div style={{ marginLeft: expanded ? "auto" : "0", display: "flex", alignItems: "center", gap: DS.sp2, flexShrink: 0 }}>
          {expanded && readinessChip()}
          {expanded && biasChip()}
          <Chevron open={expanded} />
        </div>
      </div>

      {/* ── Expanded content（平滑折叠动画）── */}
      <CollapsePanel open={expanded}>
        {/* Action matrix */}
        <div style={{
          display: "flex",
          gap: DS.sp4,
          alignItems: "flex-start",
          flexWrap: "wrap",
          padding: `${DS.sp3} ${DS.sp4}`,
          borderBottom: vm.timingSummary ? `1px solid ${DS.border0}` : "none",
        }}>
          {/* Action bias */}
          {vm.actionBias && (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ ...sectionTitleStyle, fontSize: "8px" }}>操作偏向</span>
              {biasChip()}
            </div>
          )}

          {/* Timing risk */}
          {vm.timingRisk && (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ ...sectionTitleStyle, fontSize: "8px" }}>时机风险</span>
              <span style={{ fontFamily: DS.fontMono, fontSize: "10px", color: riskColor(vm.timingRisk), fontWeight: 500 }}>
                {vm.timingRisk.toUpperCase()}
              </span>
            </div>
          )}

          {/* Confirmation state */}
          {vm.confirmationState && (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ ...sectionTitleStyle, fontSize: "8px" }}>确认状态</span>
              <span style={{ fontFamily: DS.fontMono, fontSize: "10px", color: DS.text2, fontWeight: 500 }}>
                {vm.confirmationState}
              </span>
            </div>
          )}
        </div>

        {/* Summary text */}
        {vm.timingSummary && (
          <div style={{
            padding: `${DS.sp2} ${DS.sp4}`,
            fontFamily: DS.fontSans,
            fontSize: "11px",
            color: DS.text2,
            lineHeight: 1.65,
            letterSpacing: "0.01em",
          }}>
            {vm.timingSummary}
          </div>
        )}
      </CollapsePanel>
    </div>
  );
}
