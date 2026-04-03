/**
 * ThesisBlock — DanTree Workspace v2.1-B2a
 * 交互层：折叠/展开（默认展开），折叠态保留 stance + 1行 summary
 * ui-ux-pro-max: Financial Dashboard + hover/transition/active state
 * 风格：克制精密，高密度，长期可读
 */
import React, { useState } from "react";
import type { ThesisViewModel } from "@/hooks/useWorkspaceViewModel";
import { DS, chipStyle, cardStyle, sectionTitleStyle } from "@/lib/designSystem";

interface ThesisBlockProps {
  vm: ThesisViewModel;
  blockRef?: React.RefObject<HTMLDivElement | null>;
}

// ─── State color resolver ─────────────────────────────────────────────────────
function stateColor(state: string | null | undefined): string {
  if (!state) return DS.text3;
  const s = state.toLowerCase();
  if (s.includes("strong") || s.includes("high") || s.includes("pass") || s.includes("confirmed")) return DS.bull;
  if (s.includes("weak") || s.includes("low") || s.includes("fail") || s.includes("conflict")) return DS.bear;
  if (s.includes("moderate") || s.includes("partial") || s.includes("mixed")) return DS.medium;
  return DS.text2;
}

// ─── Accent color from stance ─────────────────────────────────────────────────
function stanceAccent(stance: string | null | undefined): string {
  if (!stance) return DS.border1;
  const s = stance.toLowerCase();
  if (s.includes("bull") || s === "多") return DS.bull;
  if (s.includes("bear") || s === "空") return DS.bear;
  return DS.accent;
}

// ─── State unit ───────────────────────────────────────────────────────────────
function StateUnit({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "64px" }}>
      <span style={{ ...sectionTitleStyle, fontSize: "8px" }}>{label}</span>
      <span style={{ fontFamily: DS.fontMono, fontSize: "10px", color: stateColor(value), fontWeight: 500, lineHeight: 1.3 }}>
        {value}
      </span>
    </div>
  );
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

// ─── Main Component ───────────────────────────────────────────────────────────
export function ThesisBlock({ vm, blockRef }: ThesisBlockProps) {
  const [expanded, setExpanded] = useState(true);
  const [headerHovered, setHeaderHovered] = useState(false);

  if (!vm.available) return null;

  const accent = stanceAccent(vm.stance);
  const showChange = vm.changeMarker && vm.changeMarker !== "stable" && vm.changeMarker !== "unknown";

  const stanceLabel = () => {
    if (!vm.stance) return null;
    const s = vm.stance.toLowerCase();
    if (s.includes("bull") || s === "多") return <span style={chipStyle("bull")}>多</span>;
    if (s.includes("bear") || s === "空") return <span style={chipStyle("bear")}>空</span>;
    return <span style={chipStyle("neutral")}>中性</span>;
  };

  // 折叠态：1行 summary（截断）
  const collapsedSummary = vm.stateSummaryText
    ? vm.stateSummaryText.length > 60
      ? vm.stateSummaryText.slice(0, 60) + "…"
      : vm.stateSummaryText
    : null;

  return (
    <div
      id="block-thesis"
      data-block="thesis"
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
        aria-label={expanded ? "收起论题分析" : "展开论题分析"}
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
        <span style={sectionTitleStyle}>Thesis 论题</span>

        {/* 折叠态：内联显示 stance + summary */}
        {!expanded && (
          <div style={{ display: "flex", alignItems: "center", gap: DS.sp2, flex: 1, overflow: "hidden" }}>
            {stanceLabel()}
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
          {expanded && stanceLabel()}
          {expanded && showChange && vm.changeMarker && (
            <span style={chipStyle("muted")}>{vm.changeMarker.replace(/_/g, " ").toUpperCase()}</span>
          )}
          <Chevron open={expanded} />
        </div>
      </div>

      {/* ── Expanded content ── */}
      {expanded && (
        <>
          {/* State matrix */}
          <div style={{
            display: "flex",
            gap: DS.sp5,
            flexWrap: "wrap",
            padding: `${DS.sp3} ${DS.sp4}`,
            borderBottom: vm.stateSummaryText ? `1px solid ${DS.border0}` : "none",
          }}>
            <StateUnit label="证据" value={vm.evidenceState} />
            <StateUnit label="Gate 门禁" value={vm.gateState} />
            <StateUnit label="来源" value={vm.sourceState} />
            {vm.fragilityScore != null && (
              <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "64px" }}>
                <span style={{ ...sectionTitleStyle, fontSize: "8px" }}>脆弱性</span>
                <span style={{
                  fontFamily: DS.fontMono,
                  fontSize: "10px",
                  fontWeight: 500,
                  color: vm.fragilityScore > 0.6 ? DS.bear : vm.fragilityScore > 0.3 ? DS.medium : DS.bull,
                }}>
                  {(vm.fragilityScore * 100).toFixed(0)}%
                </span>
              </div>
            )}
          </div>

          {/* Summary text */}
          {vm.stateSummaryText && (
            <div style={{
              padding: `${DS.sp2} ${DS.sp4}`,
              fontFamily: DS.fontSans,
              fontSize: "11px",
              color: DS.text2,
              lineHeight: 1.65,
              letterSpacing: "0.01em",
            }}>
              {vm.stateSummaryText}
            </div>
          )}
        </>
      )}
    </div>
  );
}
