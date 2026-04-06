/**
 * AlertBlock.tsx — DanTree Workspace 卡片系统 v2
 * (内部重命名为 Risk Control，但对外 export 保持不变以兼容导入)
 *
 * 完善点：
 * - 从"告警列表"升级为"纪律系统"
 * - 突出当前最需要尊重的 top 1-2 风险
 * - 每个风险必须有对应的"应对动作"，不只是描述
 * - 整体风险评分可选显示
 * - 去掉过度警报感，保留克制与专业
 * - 全部正常时：简洁确认状态
 */
import React, { useState } from "react";
import { ChevronDown, ChevronRight, Shield, AlertTriangle, CheckCircle2 } from "lucide-react";

export interface AlertItem {
  alertType: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  reason: string;
  action?: string;        // 应对动作（新增字段）
  probability?: number;   // 发生概率 0-100（可选）
}

export interface AlertBlockProps {
  alerts?: AlertItem[];
  alertCount?: number;
  highestSeverity?: "low" | "medium" | "high" | "critical" | null;
  summaryText?: string;
  overallRiskScore?: number;    // 0-100 整体风险分（可选）
  disciplineItems?: Array<{ label: string; checked: boolean; detail?: string }>;
}

const SEV_CFG = {
  low:      { color: "rgba(255,255,255,0.55)", bg: "rgba(255,255,255,0.04)",  border: "rgba(255,255,255,0.10)",  label: "低" },
  medium:   { color: "#f59e0b", bg: "rgba(245,158,11,0.06)",  border: "rgba(245,158,11,0.14)",  label: "中" },
  high:     { color: "#f97316", bg: "rgba(249,115,22,0.06)",  border: "rgba(249,115,22,0.14)",  label: "高" },
  critical: { color: "#ef4444", bg: "rgba(239,68,68,0.06)",   border: "rgba(239,68,68,0.14)",   label: "严重" },
};

export function AlertBlock({
  alerts = [],
  alertCount,
  highestSeverity,
  summaryText,
  overallRiskScore,
  disciplineItems = [],
}: AlertBlockProps) {
  const [open, setOpen] = useState(true);
  const count = alertCount ?? alerts.length;
  const highest = highestSeverity ?? (alerts.length > 0 ? alerts[0].severity : null);
  const sev = highest ? SEV_CFG[highest] : null;

  return (
    <section style={{
      background: "rgba(9,11,18,0.96)",
      backdropFilter: "blur(16px)",
      WebkitBackdropFilter: "blur(16px)",
      border: `1px solid ${sev ? sev.border.replace("0.14", "0.20") : "rgba(255,255,255,0.13)"}`,
      borderTop: `2px solid ${sev ? sev.border.replace("0.14", "0.55") : "rgba(52,211,153,0.55)"}`,
      borderRadius: 10, overflow: "hidden",
      boxShadow: "0 10px 40px rgba(0,0,0,0.85), 0 1px 0 rgba(255,255,255,0.07) inset, 0 0 0 1px rgba(52,211,153,0.08), 0 0 20px rgba(52,211,153,0.05)",
    }}>
      {/* Header */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center",
          justifyContent: "space-between", padding: "14px 18px",
          cursor: "pointer", background: "transparent", border: "none",
          borderBottom: open ? "1px solid rgba(255,255,255,0.05)" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Shield size={13} color={sev?.color ?? "rgba(52,211,153,0.80)"} />
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", color: "rgba(52,211,153,0.92)" }}>
            风险控制
          </span>
          {count > 0 && sev && (
            <span style={{
              fontSize: 10, fontWeight: 600, color: sev.color,
              background: sev.bg, padding: "2px 7px", borderRadius: 4,
              border: `1px solid ${sev.border}`,
            }}>
              {count} 项 · {sev.label}风险
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {count === 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <CheckCircle2 size={12} color="#34d399" />
              <span style={{ fontSize: 11, color: "#34d399" }}>纪律正常</span>
            </div>
          )}
          {overallRiskScore != null && (
            <span style={{
              fontSize: 12, fontWeight: 700,
              color: overallRiskScore >= 70 ? "#f87171" : overallRiskScore >= 40 ? "#fbbf24" : "#34d399",
              fontVariantNumeric: "tabular-nums",
              fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
            }}>
              {overallRiskScore}
            </span>
          )}
          {open
            ? <ChevronDown size={12} color="rgba(255,255,255,0.22)" />
            : <ChevronRight size={12} color="rgba(255,255,255,0.22)" />}
        </div>
      </button>

      {open && (
        <div style={{ padding: "14px 18px 16px", display: "flex", flexDirection: "column", gap: 10 }}>

          {/* No risks */}
          {count === 0 && (
            <div style={{
              padding: "12px 14px",
              background: "rgba(52,211,153,0.05)",
              border: "1px solid rgba(52,211,153,0.12)",
              borderRadius: 10, textAlign: "center",
            }}>
              <div style={{ fontSize: 12, color: "rgba(52,211,153,0.80)" }}>当前无需关注的重大风险</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.32)", marginTop: 3 }}>
                系统持续监控中，出现变化将自动提示
              </div>
            </div>
          )}

          {/* Risk items — top 1-2 突出，纪律系统感 */}
          {alerts.map((a, i) => {
            const s = SEV_CFG[a.severity] ?? SEV_CFG.low;
            return (
              <div key={i} style={{
                padding: "11px 13px",
                background: s.bg,
                border: `1px solid ${s.border}`,
                borderRadius: 10,
              }}>
                {/* Risk header */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <AlertTriangle size={12} color={s.color} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(237,237,239,0.88)" }}>
                      {a.message}
                    </span>
                  </div>
                  {a.probability != null && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: s.color,
                      background: `${s.color}15`, padding: "1px 6px", borderRadius: 3,
                      flexShrink: 0, marginLeft: 8,
                    }}>
                      P: {a.probability}%
                    </span>
                  )}
                </div>
                {/* Reason */}
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.50)", margin: 0, lineHeight: 1.6, marginBottom: a.action ? 8 : 0 }}>
                  {a.reason}
                </p>
                {/* Action — 纪律应对 */}
                {a.action && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    paddingTop: 7,
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                  }}>
                    <Shield size={10} color={s.color} />
                    <span style={{ fontSize: 11, fontWeight: 500, color: s.color }}>
                      {a.action}
                    </span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Discipline checklist */}
          {disciplineItems.length > 0 && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.32)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 7 }}>
                决策纪律
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                {disciplineItems.map((item, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 7,
                    padding: "6px 9px",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 7,
                  }}>
                    {item.checked
                      ? <CheckCircle2 size={12} color="#34d399" />
                      : <AlertTriangle size={12} color="#fbbf24" />}
                    <span style={{ fontSize: 11, color: "rgba(237,237,239,0.68)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.label}
                    </span>
                    {item.detail && (
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", flexShrink: 0 }}>
                        {item.detail}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {summaryText && count > 0 && (
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", margin: 0, lineHeight: 1.5 }}>
              {summaryText}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
