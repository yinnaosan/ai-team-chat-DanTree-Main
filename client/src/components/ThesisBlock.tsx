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
  strong:      { label: "证据充分",  color: "#34d399", bg: "rgba(52,211,153,0.08)",  bar: 4 },
  moderate:    { label: "证据尚可",  color: "#60a5fa", bg: "rgba(96,165,250,0.07)",  bar: 3 },
  weak:        { label: "证据薄弱",  color: "#fbbf24", bg: "rgba(251,191,36,0.07)",  bar: 2 },
  insufficient:{ label: "证据不足",  color: "#6b7280", bg: "rgba(107,114,128,0.05)", bar: 1 },
};

const FRAG_CFG = {
  low:    { label: "稳定",   color: "#34d399" },
  medium: { label: "中等",   color: "#fbbf24" },
  high:   { label: "脆弱",   color: "#f87171" },
};

const STATUS_ICON = {
  active:  CheckCircle2,
  warning: AlertTriangle,
  fail:    XCircle,
};

const STATUS_COLOR = {
  active:  "#34d399",
  warning: "#fbbf24",
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
      background: "rgba(10,12,18,0.92)",
      backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderTop: "1px solid rgba(255,255,255,0.11)",
      borderRadius: 10, overflow: "hidden",
      boxShadow: "0 4px 16px rgba(0,0,0,0.55)",
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
          <Target size={13} color="rgba(52,211,153,0.70)" />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "rgba(52,211,153,0.78)", textTransform: "uppercase" }}>
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
            <span style={{ fontSize: 13, fontWeight: 700, color: confColor, fontVariantNumeric: "tabular-nums", fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}>
              {confidenceScore}%
            </span>
          )}
          {open
            ? <ChevronDown size={12} color="rgba(255,255,255,0.22)" />
            : <ChevronRight size={12} color="rgba(255,255,255,0.22)" />}
        </div>
      </button>

      {open && (
        <div style={{ padding: "14px 18px 16px", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Core thesis — 结论先行，最大视觉权重 */}
          {coreThesis ? (
            <p style={{
              fontSize: 14, lineHeight: 1.82,
              color: "rgba(237,237,239,0.88)",
              margin: 0,
              paddingLeft: 12,
              borderLeft: "2px solid rgba(52,211,153,0.40)",
            }}>
              {coreThesis}
            </p>
          ) : (
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.28)", margin: 0, fontStyle: "italic" }}>
              暂无核心论点 — 开始分析后自动填入
            </p>
          )}

          {/* Driver + Failure 并排 */}
          {(criticalDriver || failureCondition) && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {criticalDriver && (
                <div style={{
                  padding: "10px 12px",
                  background: "rgba(52,211,153,0.06)",
                  border: "1px solid rgba(52,211,153,0.14)",
                  borderRadius: 10,
                }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(52,211,153,0.70)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 5 }}>
                    核心驱动
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(167,243,208,0.88)", lineHeight: 1.58 }}>
                    {criticalDriver}
                  </div>
                </div>
              )}
              {failureCondition && (
                <div style={{
                  padding: "10px 12px",
                  background: "rgba(248,113,113,0.05)",
                  border: "1px solid rgba(248,113,113,0.14)",
                  borderRadius: 10,
                }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(248,113,113,0.75)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 5 }}>
                    失效条件
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(252,165,165,0.85)", lineHeight: 1.58 }}>
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
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 8,
            }}>
              {sourceCount != null && (
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(237,237,239,0.78)", fontVariantNumeric: "tabular-nums", fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}>
                    {sourceCount}
                  </div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    来源
                  </div>
                </div>
              )}
              {fragilityLevel && (
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: FRAG_CFG[fragilityLevel].color }}>
                    {FRAG_CFG[fragilityLevel].label}
                  </div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    稳定性
                  </div>
                </div>
              )}
              {evidenceDetail && (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.42)", flex: 1, lineHeight: 1.55 }}>
                  {evidenceDetail}
                </div>
              )}
            </div>
          )}

          {/* Key variables — 信号监控，不是列表 */}
          {keyVariables.length > 0 && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.32)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 7 }}>
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
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.065)",
                      borderRadius: 7,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <Icon size={11} color={col} />
                        <span style={{ fontSize: 11, color: "rgba(237,237,239,0.68)" }}>{v.name}</span>
                      </div>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.42)" }}>{v.signal}</span>
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
