/**
 * TimingBlock — DanTree Workspace v2.1-B1e v3
 * 统一设计系统：DS tokens + chipStyle factory
 */
import React from "react";
import type { TimingViewModel } from "@/hooks/useWorkspaceViewModel";
import { DS, chipStyle, cardStyle, sectionTitleStyle } from "@/lib/designSystem";

interface TimingBlockProps {
  vm: TimingViewModel;
}

function readinessAccent(state: string | null | undefined): string {
  if (!state) return DS.medium;
  const s = state.toLowerCase();
  if (s === "ready") return DS.bull;
  if (s === "conditional") return DS.medium;
  return DS.border1;
}

function riskColor(risk: string | null | undefined): string {
  if (!risk) return DS.text3;
  const r = risk.toLowerCase();
  if (r === "high") return DS.bear;
  if (r === "medium") return DS.medium;
  if (r === "low") return DS.bull;
  return DS.text2;
}

export function TimingBlock({ vm }: TimingBlockProps) {
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

  return (
    <div
      data-block="timing"
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
        <span style={sectionTitleStyle}>时机分析</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: DS.sp2 }}>
          {readinessChip()}
        </div>
      </div>

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
    </div>
  );
}
