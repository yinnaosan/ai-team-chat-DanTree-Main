/**
 * AlertBlock — DanTree Workspace v2.1-B1e v3
 * 统一设计系统：DS tokens + chipStyle factory
 */
import React from "react";
import type { AlertViewModel } from "@/hooks/useWorkspaceViewModel";
import { DS, chipStyle, cardStyle, sectionTitleStyle } from "@/lib/designSystem";

interface AlertBlockProps {
  vm: AlertViewModel;
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

export function AlertBlock({ vm }: AlertBlockProps) {
  if (!vm.available || vm.alertCount === 0) return null;

  const accent = severityAccent(vm.highestSeverity);

  return (
    <div
      data-block="alert"
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
        <span style={sectionTitleStyle}>风险预警</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: DS.sp2 }}>
          {severityChip(vm.highestSeverity)}
          <span style={{ fontFamily: DS.fontMono, fontSize: "9px", color: DS.text3 }}>
            {vm.alertCount} 条
          </span>
        </div>
      </div>

      {/* Alert list */}
      {vm.keyAlerts.length > 0 && (
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          padding: `${DS.sp3} ${DS.sp4}`,
          borderBottom: vm.summaryText ? `1px solid ${DS.border0}` : "none",
        }}>
          {vm.keyAlerts.map((alert, i) => {
            const dot = severityDot(alert.severity);
            return (
              <div key={i} style={{ display: "flex", gap: DS.sp2, alignItems: "flex-start" }}>
                {/* Severity dot */}
                <span style={{
                  width: "5px",
                  height: "5px",
                  borderRadius: "50%",
                  background: dot,
                  flexShrink: 0,
                  marginTop: "4px",
                  boxShadow: `0 0 4px ${dot}80`,
                }} />
                {/* Alert content */}
                <div style={{ flex: 1 }}>
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
              </div>
            );
          })}
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
    </div>
  );
}
