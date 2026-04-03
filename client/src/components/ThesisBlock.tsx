/**
 * ThesisBlock — DanTree Workspace v2.1-B1e v3
 * 统一设计系统：DS tokens + chipStyle factory
 * 风格：克制精密，高密度，长期可读
 */
import React from "react";
import type { ThesisViewModel } from "@/hooks/useWorkspaceViewModel";
import { DS, chipStyle, cardStyle, sectionTitleStyle, rowStyle, rowLabelStyle, rowValueStyle } from "@/lib/designSystem";

interface ThesisBlockProps {
  vm: ThesisViewModel;
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

// ─── Main Component ───────────────────────────────────────────────────────────
export function ThesisBlock({ vm }: ThesisBlockProps) {
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

  return (
    <div
      data-block="thesis"
      style={{
        ...cardStyle,
        borderLeft: `2px solid ${accent}`,
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
        <span style={sectionTitleStyle}>论题分析</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: DS.sp2 }}>
          {stanceLabel()}
          {showChange && vm.changeMarker && (
            <span style={chipStyle("muted")}>{vm.changeMarker.replace(/_/g, " ").toUpperCase()}</span>
          )}
        </div>
      </div>

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
    </div>
  );
}
