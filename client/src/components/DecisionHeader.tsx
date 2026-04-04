/**
 * DecisionHeader.tsx — DanTree Workspace 最终视觉母版 v1
 *
 * Global Top Bar / Decision Control Strip
 * 驾驶舱全局控制条：一抬头看到最重要状态
 * 不是行情栏，不是 navbar，是 decision-first 的全局状态条
 */
import React from "react";
import {
  Leaf, TrendingUp, TrendingDown, Minus, Zap, AlertTriangle,
  Activity, Clock, Search, Shield, ChevronDown,
} from "lucide-react";

// ─── Compat type exports (旧 ResearchWorkspace.tsx 依赖) ─────────────────────
export type ScrollToSection = "thesis" | "timing" | "alert" | "history";

export interface DecisionHeaderProps {
  // ─── Compat fields (旧 ResearchWorkspace.tsx 依赖) ───
  vm?: unknown;
  onScrollTo?: unknown;
  activeSection?: unknown;
  // ─── Real props ───
  entity?: string;
  stance?: "bullish" | "bearish" | "neutral" | "mixed" | "unavailable";
  confidence?: number | null;
  changeMarker?: "stable" | "strengthening" | "weakening" | "reversal" | "unknown";
  alertCount?: number;
  highestAlertSeverity?: "low" | "medium" | "high" | "critical" | null;
  gateState?: "pass" | "block" | "fallback";
  lastUpdated?: string;
  onEntitySearch?: () => void;
}

const STANCE = {
  bullish:     { label: "看多",   color: "#10b981", dim: "rgba(16,185,129,0.12)",  Icon: TrendingUp },
  bearish:     { label: "看空",   color: "#ef4444", dim: "rgba(239,68,68,0.10)",   Icon: TrendingDown },
  neutral:     { label: "中性",   color: "#94a3b8", dim: "rgba(148,163,184,0.08)", Icon: Minus },
  mixed:       { label: "混合",   color: "#f59e0b", dim: "rgba(245,158,11,0.09)",  Icon: Activity },
  unavailable: { label: "未分析", color: "#374151", dim: "rgba(55,65,81,0.08)",    Icon: Minus },
};

const GATE_LABEL: Record<string, { label: string; color: string }> = {
  pass:     { label: "介入",  color: "#10b981" },
  block:    { label: "回避",  color: "#ef4444" },
  fallback: { label: "待评",  color: "#6b7280" },
};

const SEVERITY_COLOR: Record<string, string> = {
  low: "#60a5fa", medium: "#f59e0b", high: "#f97316", critical: "#ef4444",
};

const MARKER_LABEL: Record<string, { label: string; color: string }> = {
  strengthening: { label: "↑ 强化",   color: "#10b981" },
  weakening:     { label: "↓ 弱化",   color: "#f87171" },
  reversal:      { label: "⟳ 逆转",   color: "#f97316" },
  stable:        { label: "— 稳定",   color: "#4b5563" },
  unknown:       { label: "—",        color: "#374151" },
};

export function DecisionHeader({
  entity, stance = "unavailable", confidence = null,
  changeMarker = "unknown", alertCount = 0,
  highestAlertSeverity = null, gateState = "fallback",
  lastUpdated, onEntitySearch,
}: DecisionHeaderProps) {
  const st = STANCE[stance] ?? STANCE.unavailable;
  const gt = GATE_LABEL[gateState] ?? GATE_LABEL.fallback;
  const mk = MARKER_LABEL[changeMarker] ?? MARKER_LABEL.unknown;
  const { Icon: StIcon } = st;

  return (
    <header style={{
      height: 52, flexShrink: 0, width: "100%",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 22px",
      background: "#070B12",
      borderBottom: "1px solid rgba(255,255,255,0.07)",
      position: "sticky", top: 0, zIndex: 50,
    }}>

      {/* ── Left: Brand + Entity Selector ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 20, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
          <Leaf size={14} color="rgba(16,185,129,0.75)" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.70)", letterSpacing: "0.06em", fontFamily: "'Inter', system-ui, sans-serif" }}>
            DanTree
          </span>
        </div>

        <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.06)", flexShrink: 0 }} />

        <button
          onClick={onEntitySearch}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "5px 12px 5px 9px", borderRadius: 8,
            background: entity ? "rgba(16,185,129,0.07)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${entity ? "rgba(16,185,129,0.18)" : "rgba(255,255,255,0.07)"}`,
            cursor: "pointer",
          }}
        >
          {entity ? (
            <>
              <div style={{
                width: 24, height: 24, borderRadius: 5,
                background: "rgba(16,185,129,0.14)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: "#10b981" }}>
                  {entity[0]}
                </span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.92)", letterSpacing: "0.03em", fontFamily: "ui-monospace, monospace" }}>
                {entity}
              </span>
              <ChevronDown size={11} color="rgba(255,255,255,0.28)" />
            </>
          ) : (
            <>
              <Search size={12} color="rgba(255,255,255,0.28)" />
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>选择研究标的</span>
            </>
          )}
        </button>
      </div>

      {/* ── Center: Decision State ── */}
      {entity && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>

          {/* Stance */}
          <div style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "4px 10px", borderRadius: 6,
            background: st.dim,
            border: `1px solid ${st.color}22`,
          }}>
            <StIcon size={12} color={st.color} />
            <span style={{ fontSize: 12, fontWeight: 700, color: st.color, letterSpacing: "0.02em" }}>
              {st.label}
            </span>
          </div>

          {/* Readiness — 5-bar visual */}
          {confidence != null && (
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ display: "flex", gap: 2 }}>
                {[1,2,3,4,5].map(i => {
                  const filled = i <= Math.round(confidence / 20);
                  return (
                    <div key={i} style={{
                      width: 4, height: 13, borderRadius: 2,
                      background: filled ? `rgba(255,255,255,0.72)` : "rgba(255,255,255,0.10)",
                      transition: "background 0.2s",
                    }} />
                  );
                })}
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.65)", fontVariantNumeric: "tabular-nums" }}>
                {Math.round(confidence / 20)}/5
              </span>
            </div>
          )}

          {/* Action bias */}
          <div style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "4px 10px", borderRadius: 6,
            background: "rgba(16,185,129,0.08)",
            border: "1px solid rgba(16,185,129,0.16)",
          }}>
            <Zap size={11} color={gt.color} />
            <span style={{ fontSize: 12, fontWeight: 700, color: gt.color }}>
              {gt.label}
            </span>
          </div>

          {/* Alert severity */}
          {alertCount > 0 && highestAlertSeverity && (
            <div style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "4px 10px", borderRadius: 6,
              background: "rgba(245,158,11,0.07)",
              border: "1px solid rgba(245,158,11,0.15)",
            }}>
              <AlertTriangle size={11} color={SEVERITY_COLOR[highestAlertSeverity] ?? "#f59e0b"} />
              <span style={{ fontSize: 11, fontWeight: 600, color: SEVERITY_COLOR[highestAlertSeverity] ?? "#f59e0b" }}>
                {alertCount} 风险
              </span>
            </div>
          )}

          {/* Change marker */}
          <span style={{ fontSize: 11, fontWeight: 600, color: mk.color, letterSpacing: "0.01em" }}>
            {mk.label}
          </span>
        </div>
      )}

      {/* ── Right: System Clock ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
        <Clock size={10} color="rgba(255,255,255,0.18)" />
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.22)", fontVariantNumeric: "tabular-nums" }}>
          {lastUpdated ?? "—"}
        </span>
      </div>
    </header>
  );
}
