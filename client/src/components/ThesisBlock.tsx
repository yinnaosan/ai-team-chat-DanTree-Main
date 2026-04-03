/**
 * ThesisBlock.tsx — DanTree Workspace v2.1-B5
 * Decision Canvas｜论点核心模块
 */
import React, { useState } from "react";
import { ChevronDown, ChevronRight, Target } from "lucide-react";

export interface ThesisBlockProps {
  coreThesis?: string;
  criticalDriver?: string;
  failureCondition?: string;
  confidenceScore?: number | null;
  evidenceState?: "strong" | "moderate" | "weak" | "insufficient";
  keyVariables?: Array<{ name: string; signal: string; status: "active" | "warning" | "fail" }>;
}

const EV = {
  strong: { label: "证据强", color: "#34d399", bg: "#0d2b1e" },
  moderate: { label: "证据中", color: "#60a5fa", bg: "#0d1a2b" },
  weak: { label: "证据弱", color: "#fbbf24", bg: "#2b1e0d" },
  insufficient: { label: "不足", color: "#6b7280", bg: "#151820" },
};

export function ThesisBlock({
  coreThesis,
  criticalDriver,
  failureCondition,
  confidenceScore = null,
  evidenceState = "insufficient",
  keyVariables = [],
}: ThesisBlockProps) {
  const [open, setOpen] = useState(true);
  const ev = EV[evidenceState] ?? EV.insufficient;
  const confColor = (confidenceScore ?? 0) >= 65 ? "#34d399" : (confidenceScore ?? 0) >= 40 ? "#fbbf24" : "#f87171";

  return (
    <div style={{ background: "#0a0e1a", border: "1px solid #1e2736", borderRadius: 10, overflow: "hidden" }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", cursor: "pointer", background: "transparent", border: "none", borderBottom: open ? "1px solid #1e2736" : "none" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Target size={13} color="#60a5fa" />
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "#64748b", textTransform: "uppercase" }}>核心论点</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: ev.color, background: ev.bg, padding: "1px 6px", borderRadius: 3, border: `1px solid ${ev.color}30` }}>{ev.label}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {confidenceScore != null && <span style={{ fontSize: 13, fontWeight: 700, color: confColor }}>{confidenceScore}%</span>}
          {open ? <ChevronDown size={13} color="#374151" /> : <ChevronRight size={13} color="#374151" />}
        </div>
      </button>
      {open && (
        <div style={{ padding: "13px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontSize: 13, lineHeight: 1.75, color: "#cbd5e1", margin: 0, borderLeft: "2px solid #3b82f6", paddingLeft: 11 }}>
            {coreThesis}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ background: "#0d2b1e", border: "1px solid #1a4030", borderRadius: 7, padding: "9px 11px" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#34d399", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>▲ 驱动因子</div>
              <div style={{ fontSize: 12, color: "#86efac", lineHeight: 1.5 }}>{criticalDriver}</div>
            </div>
            <div style={{ background: "#1a0d0d", border: "1px solid #3a1a1a", borderRadius: 7, padding: "9px 11px" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#f87171", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>✕ 失效条件</div>
              <div style={{ fontSize: 12, color: "#fca5a5", lineHeight: 1.5 }}>{failureCondition}</div>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>关键变量</div>
            {keyVariables.map((v, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 9px", background: "#080c14", borderRadius: 5, marginBottom: 3, border: "1px solid #131c2e" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", flexShrink: 0, background: v.status === "active" ? "#34d399" : v.status === "warning" ? "#fbbf24" : "#f87171" }} />
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>{v.name}</span>
                </div>
                <span style={{ fontSize: 11, color: "#475569" }}>{v.signal}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
