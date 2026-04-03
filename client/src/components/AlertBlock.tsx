/**
 * AlertBlock — DanTree B1b 主脊柱子块
 * 消费 AlertViewModel，显示风险警报状态
 * B-1c 视觉 polish 留到 ui ux pro max 阶段
 */
import React from "react";
import type { AlertViewModel } from "@/hooks/useWorkspaceViewModel";

interface AlertBlockProps {
  vm: AlertViewModel;
}

const severityStyle = (sev: string | null) => {
  if (sev === "critical") return { bg: "#7f1d1d", text: "#fca5a5", border: "#ef4444" };
  if (sev === "high") return { bg: "#431407", text: "#fb923c", border: "#ea580c" };
  if (sev === "medium") return { bg: "#451a03", text: "#fbbf24", border: "#d97706" };
  return { bg: "#1e293b", text: "#94a3b8", border: "#334155" };
};

export function AlertBlock({ vm }: AlertBlockProps) {
  if (!vm.available || vm.alertCount === 0) return null;

  const ss = severityStyle(vm.highestSeverity);

  return (
    <div
      className="te-panel"
      style={{ marginTop: "12px", borderLeft: "2px solid rgba(251,146,60,0.3)" }}
      data-block="alert"
    >
      {/* 标题行 */}
      <div className="te-panel-header">
        <span className="te-panel-label">Alert</span>
        {vm.highestSeverity && (
          <span style={{
            fontSize: "8px", fontFamily: "monospace", padding: "1px 5px", borderRadius: "2px",
            background: ss.bg, color: ss.text, border: `1px solid ${ss.border}`,
          }}>
            {vm.highestSeverity.toUpperCase()}
          </span>
        )}
        <span style={{ fontSize: "9px", color: "#475569", fontFamily: "monospace", marginLeft: "4px" }}>
          {vm.alertCount} 条
        </span>
        {vm.advisoryOnly && (
          <span style={{ fontSize: "9px", color: "#475569", fontFamily: "monospace", marginLeft: "auto" }}>advisory</span>
        )}
      </div>

      {/* 内容区 */}
      <div className="te-panel-body" style={{ padding: "10px 14px" }}>
        {/* 关键警报列表 */}
        {vm.keyAlerts.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "5px", marginBottom: "5px" }}>
            {vm.keyAlerts.map((alert, i) => {
              const as = severityStyle(alert.severity);
              return (
                <div key={i} style={{ display: "flex", gap: "6px", alignItems: "flex-start" }}>
                  <span style={{
                    fontSize: "8px", fontFamily: "monospace", padding: "1px 4px", borderRadius: "2px",
                    background: as.bg, color: as.text, border: `1px solid ${as.border}`,
                    flexShrink: 0, marginTop: "1px",
                  }}>
                    {alert.severity.toUpperCase()}
                  </span>
                  <span style={{ fontSize: "9px", color: "#94a3b8", fontFamily: "monospace", lineHeight: 1.5 }}>
                    {alert.message}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* 摘要文本 */}
        {vm.summaryText && (
          <div style={{ fontSize: "9px", color: "#475569", fontFamily: "monospace", lineHeight: 1.6 }}>
            {vm.summaryText}
          </div>
        )}
      </div>
    </div>
  );
}
