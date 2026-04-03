/**
 * AlertBlock.tsx — DanTree Workspace v2.1-B5
 * Decision Canvas｜风险告警模块
 */
import React, { useState } from "react";
import { ChevronDown, ChevronRight, Bell } from "lucide-react";

export interface AlertItem {
  alertType: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  reason: string;
}

export interface AlertBlockProps {
  alerts?: AlertItem[];
  alertCount?: number;
  highestSeverity?: "low" | "medium" | "high" | "critical" | null;
  summaryText?: string;
}

const SEV = {
  low:      { color: "#60a5fa", bg: "#0d1a2b", dot: "#60a5fa" },
  medium:   { color: "#fbbf24", bg: "#2b1e0d", dot: "#fbbf24" },
  high:     { color: "#f97316", bg: "#2b1208", dot: "#f97316" },
  critical: { color: "#f87171", bg: "#2b0d0d", dot: "#f87171" },
};

// 无默认 demo 告警 — 由父组件传入真实告警数据

export function AlertBlock({ alerts = [], alertCount, highestSeverity, summaryText }: AlertBlockProps) {
  const [open, setOpen] = useState(true);
  const count = alertCount ?? alerts.length;
  const highest = highestSeverity ?? (alerts.length > 0 ? alerts[0].severity : null);
  const sevCfg = highest ? SEV[highest] : null;

  return (
    <div style={{ background: "#0a0e1a", border: `1px solid ${sevCfg ? `${sevCfg.dot}25` : "#1e2736"}`, borderRadius: 10, overflow: "hidden" }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", cursor: "pointer", background: "transparent", border: "none", borderBottom: open ? "1px solid #1e2736" : "none" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Bell size={13} color={sevCfg?.color ?? "#6b7280"} />
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "#64748b", textTransform: "uppercase" }}>告警</span>
          {count > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, color: sevCfg?.color, background: sevCfg?.bg, padding: "1px 6px", borderRadius: 3, border: `1px solid ${sevCfg?.color}30` }}>
              {count} 条
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {count === 0 && <span style={{ fontSize: 11, color: "#374151" }}>全部正常</span>}
          {open ? <ChevronDown size={13} color="#374151" /> : <ChevronRight size={13} color="#374151" />}
        </div>
      </button>
      {open && (
        <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
          {count === 0 ? (
            <div style={{ fontSize: 12, color: "#374151", textAlign: "center", padding: "8px 0" }}>暂无告警，监控正常</div>
          ) : (
            alerts.map((a, i) => {
              const s = SEV[a.severity] ?? SEV.low;
              return (
                <div key={i} style={{ display: "flex", gap: 10, padding: "9px 11px", background: "#080c14", borderRadius: 7, border: `1px solid ${s.dot}20` }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, marginTop: 4, background: s.dot, boxShadow: `0 0 6px ${s.dot}60` }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: s.color, marginBottom: 2 }}>{a.message}</div>
                    <div style={{ fontSize: 10, color: "#4b5563", lineHeight: 1.5 }}>{a.reason}</div>
                  </div>
                </div>
              );
            })
          )}
          {summaryText && count > 0 && (
            <p style={{ fontSize: 10, color: "#374151", margin: 0, paddingTop: 2 }}>{summaryText}</p>
          )}
        </div>
      )}
    </div>
  );
}
