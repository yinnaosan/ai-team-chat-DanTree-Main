/**
 * ThesisBlock.tsx — DanTree Workspace 卡片系统 v2
 *
 * 完善点：
 * - 结论先行：核心论点作为第一视觉焦点
 * - 驱动因子 / 失效条件并排，一眼分清"为何成立"vs"何时失效"
 * - Evidence 指标有明确含义标签，不只显示值
 * - keyVariables 从"变量列表"升级为"信号监控栏"，有状态感
 * - 去掉模板化标题，改用判断价值更高的表达
 */
import React, { useState } from "react";
import { ChevronDown, ChevronRight, Target, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

export interface ThesisBlockProps {
  coreThesis?: string;
  criticalDriver?: string;
  failureCondition?: string;
  confidenceScore?: number | null;
  evidenceState?: "strong" | "moderate" | "weak" | "insufficient";
  keyVariables?: Array<{ name: string; signal: string; status: "active" | "warning" | "fail" }>;
  evidenceDetail?: string;
  sourceCount?: number;
  fragilityLevel?: "low" | "medium" | "high";
}

const EV_CFG = {
  strong:      { label: "证据充分",  color: "#10b981", bg: "rgba(16,185,129,0.08)",  bar: 4 },
  moderate:    { label: "证据尚可",  color: "#60a5fa", bg: "rgba(96,165,250,0.08)",  bar: 3 },
  weak:        { label: "证据薄弱",  color: "#f59e0b", bg: "rgba(245,158,11,0.08)",  bar: 2 },
  insufficient:{ label: "证据不足",  color: "#6b7280", bg: "rgba(107,114,128,0.06)", bar: 1 },
};

const FRAG_CFG = {
  low:    { label: "稳定",   color: "#10b981" },
  medium: { label: "中等",   color: "#f59e0b" },
  high:   { label: "脆弱",   color: "#f87171" },
};

const STATUS_ICON = {
  active:  CheckCircle2,
  warning: AlertTriangle,
  fail:    XCircle,
};

const STATUS_COLOR = {
  active:  "#10b981",
  warning: "#f59e0b",
  fail:    "#f87171",
};

export function ThesisBlock({
  coreThesis,
  criticalDriver,
  failureCondition,
  confidenceScore = null,
  evidenceState = "insufficient",
  keyVariables = [],
  evidenceDetail,
  sourceCount,
  fragilityLevel,
}: ThesisBlockProps) {
  const [open, setOpen] = useState(true);
  const ev = EV_CFG[evidenceState] ?? EV_CFG.insufficient;
  const confPct = confidenceScore ?? 0;
  const confColor = confPct >= 65 ? "#10b981" : confPct >= 40 ? "#f59e0b" : "#f87171";

  return (
    <section style={{
      background: "#0a0e18",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 10, overflow: "hidden",
    }}>
      {/* Header */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center",
          justifyContent: "space-between", padding: "12px 16px",
          cursor: "pointer", background: "transparent", border: "none",
          borderBottom: open ? "1px solid rgba(255,255,255,0.05)" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Target size={13} color="rgba(96,165,250,0.70)" />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", color: "rgba(255,255,255,0.35)", textTransform: "uppercase" }}>
            Thesis
          </span>
          {/* Evidence badge */}
          <span style={{
            fontSize: 10, fontWeight: 600, color: ev.color,
            background: ev.bg, padding: "2px 7px", borderRadius: 4,
            border: `1px solid ${ev.color}25`,
          }}>
            {ev.label}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Evidence strength bar */}
          <div style={{ display: "flex", gap: 2 }}>
            {[1,2,3,4].map(i => (
              <div key={i} style={{
                width: 3, height: 10, borderRadius: 1.5,
                background: i <= ev.bar ? ev.color : "rgba(255,255,255,0.08)",
              }} />
            ))}
          </div>
          {confidenceScore != null && (
            <span style={{ fontSize: 13, fontWeight: 700, color: confColor, fontVariantNumeric: "tabular-nums" }}>
              {confidenceScore}%
            </span>
          )}
          {open
            ? <ChevronDown size={12} color="rgba(255,255,255,0.22)" />
            : <ChevronRight size={12} color="rgba(255,255,255,0.22)" />}
        </div>
      </button>

      {open && (
        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Core thesis — 结论先行，最大视觉权重 */}
          {coreThesis ? (
            <p style={{
              fontSize: 14, lineHeight: 1.80,
              color: "rgba(255,255,255,0.82)",
              margin: 0,
              paddingLeft: 12,
              borderLeft: "2px solid rgba(96,165,250,0.45)",
            }}>
              {coreThesis}
            </p>
          ) : (
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.20)", margin: 0, fontStyle: "italic" }}>
              暂无核心论点 — 开始分析后自动填入
            </p>
          )}

          {/* Driver + Failure 并排 */}
          {(criticalDriver || failureCondition) && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {criticalDriver && (
                <div style={{
                  padding: "10px 12px",
                  background: "rgba(16,185,129,0.06)",
                  border: "1px solid rgba(16,185,129,0.14)",
                  borderRadius: 7,
                }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(16,185,129,0.60)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 5 }}>
                    核心驱动
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(134,239,172,0.85)", lineHeight: 1.55 }}>
                    {criticalDriver}
                  </div>
                </div>
              )}
              {failureCondition && (
                <div style={{
                  padding: "10px 12px",
                  background: "rgba(239,68,68,0.05)",
                  border: "1px solid rgba(239,68,68,0.14)",
                  borderRadius: 7,
                }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(248,113,113,0.65)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 5 }}>
                    失效条件
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(252,165,165,0.80)", lineHeight: 1.55 }}>
                    {failureCondition}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Evidence meta — source count + fragility */}
          {(sourceCount != null || fragilityLevel || evidenceDetail) && (
            <div style={{
              display: "flex", alignItems: "center", gap: 14,
              padding: "8px 10px",
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.04)",
              borderRadius: 6,
            }}>
              {sourceCount != null && (
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.65)", fontVariantNumeric: "tabular-nums" }}>
                    {sourceCount}
                  </div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.28)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                    来源
                  </div>
                </div>
              )}
              {fragilityLevel && (
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: FRAG_CFG[fragilityLevel].color }}>
                    {FRAG_CFG[fragilityLevel].label}
                  </div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.28)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                    稳定性
                  </div>
                </div>
              )}
              {evidenceDetail && (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", flex: 1, lineHeight: 1.5 }}>
                  {evidenceDetail}
                </div>
              )}
            </div>
          )}

          {/* Key variables — 信号监控，不是列表 */}
          {keyVariables.length > 0 && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.22)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 7 }}>
                信号监控
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {keyVariables.map((v, i) => {
                  const Icon = STATUS_ICON[v.status];
                  const col = STATUS_COLOR[v.status];
                  return (
                    <div key={i} style={{
                      display: "flex", alignItems: "center",
                      justifyContent: "space-between",
                      padding: "6px 10px",
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.04)",
                      borderRadius: 5,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <Icon size={11} color={col} />
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.58)" }}>{v.name}</span>
                      </div>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{v.signal}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
