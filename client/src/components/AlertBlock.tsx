/**
 * AlertBlock — DanTree B1c 视觉层
 * 风险感知 + 分级视觉系统：红色系 + 紧迫感但不刺眼
 * ui-ux-pro-max: Financial Dashboard 颜色系统 + Fira Code
 */
import React from "react";
import type { AlertViewModel } from "@/hooks/useWorkspaceViewModel";

interface AlertBlockProps {
  vm: AlertViewModel;
}

const severityMap = {
  critical: { bg: "rgba(127, 29, 29, 0.55)", text: "#fca5a5", border: "rgba(239, 68, 68, 0.55)", accent: "#ef4444", dot: "#ef4444" },
  high:     { bg: "rgba(67, 20, 7, 0.55)",   text: "#fb923c", border: "rgba(234, 88, 12, 0.5)",  accent: "#ea580c", dot: "#ea580c" },
  medium:   { bg: "rgba(69, 26, 3, 0.5)",    text: "#fbbf24", border: "rgba(217, 119, 6, 0.45)", accent: "#d97706", dot: "#d97706" },
  low:      { bg: "rgba(30, 41, 59, 0.4)",   text: "#94a3b8", border: "rgba(51, 65, 85, 0.4)",   accent: "#334155", dot: "#475569" },
};

const getSeverityStyle = (sev: string | null) => {
  if (!sev) return severityMap.low;
  return severityMap[sev as keyof typeof severityMap] ?? severityMap.low;
};

export function AlertBlock({ vm }: AlertBlockProps) {
  if (!vm.available || vm.alertCount === 0) return null;

  const ss = getSeverityStyle(vm.highestSeverity);

  return (
    <div
      data-block="alert"
      style={{
        background: "rgba(12, 15, 20, 0.85)",
        borderLeft: `2px solid ${ss.accent}`,
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
          Alert
        </span>

        {/* Severity chip */}
        {vm.highestSeverity && (
          <span style={{
            fontSize: "9px",
            fontFamily: "'Fira Code', monospace",
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: "3px",
            background: ss.bg,
            color: ss.text,
            border: `1px solid ${ss.border}`,
            letterSpacing: "0.05em",
          }}>
            {vm.highestSeverity === "critical" ? "严重" :
             vm.highestSeverity === "high" ? "高风险" :
             vm.highestSeverity === "medium" ? "中风险" : "低风险"}
          </span>
        )}

        {/* Alert count */}
        <span style={{
          fontSize: "9px",
          fontFamily: "'Fira Code', monospace",
          color: "#475569",
        }}>
          {vm.alertCount} 条
        </span>
      </div>

      {/* ── 关键警报列表 ── */}
      {vm.keyAlerts.length > 0 && (
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: "5px",
          marginBottom: vm.summaryText ? "8px" : "0",
          paddingBottom: vm.summaryText ? "8px" : "0",
          borderBottom: vm.summaryText ? "1px solid rgba(51, 65, 85, 0.2)" : "none",
        }}>
          {vm.keyAlerts.map((alert, i) => {
            const as = getSeverityStyle(alert.severity);
            return (
              <div key={i} style={{
                display: "flex",
                gap: "8px",
                alignItems: "flex-start",
              }}>
                {/* 严重度指示点 */}
                <span style={{
                  width: "5px",
                  height: "5px",
                  borderRadius: "50%",
                  background: as.dot,
                  flexShrink: 0,
                  marginTop: "4px",
                  boxShadow: `0 0 4px ${as.dot}60`,
                }} />

                {/* 警报内容 */}
                <div style={{ flex: 1 }}>
                  <span style={{
                    fontSize: "8px",
                    fontFamily: "'Fira Code', monospace",
                    color: as.text,
                    marginRight: "6px",
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                  }}>
                    [{alert.severity.toUpperCase()}]
                  </span>
                  <span style={{
                    fontSize: "10px",
                    fontFamily: "'Fira Code', monospace",
                    color: "#94a3b8",
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

      {/* ── 摘要文本 ── */}
      {vm.summaryText && (
        <div style={{
          fontSize: "10px",
          fontFamily: "'Fira Code', monospace",
          color: "#64748b",
          lineHeight: 1.65,
          letterSpacing: "0.01em",
        }}>
          {vm.summaryText}
        </div>
      )}
    </div>
  );
}
