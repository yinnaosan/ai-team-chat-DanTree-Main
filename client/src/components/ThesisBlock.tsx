/**
 * ThesisBlock — DanTree B1c 视觉层
 * Apple/Tesla/NVIDIA 风格：逻辑感 + 状态感 + 高密度但不乱
 * ui-ux-pro-max: Financial Dashboard 颜色系统 + Fira Code
 */
import React from "react";
import type { ThesisViewModel } from "@/hooks/useWorkspaceViewModel";

interface ThesisBlockProps {
  vm: ThesisViewModel;
}

// ─── 共享颜色系统 ────────────────────────────────────────────────────────────
const stanceMap = {
  bullish: { bg: "rgba(20, 83, 45, 0.5)", text: "#86efac", border: "rgba(22, 163, 74, 0.45)", accent: "#16a34a" },
  bearish: { bg: "rgba(127, 29, 29, 0.5)", text: "#fca5a5", border: "rgba(239, 68, 68, 0.45)", accent: "#ef4444" },
  neutral: { bg: "rgba(30, 58, 95, 0.5)", text: "#93c5fd", border: "rgba(59, 130, 246, 0.45)", accent: "#3b82f6" },
};

const stateColor = (state: string | null) => {
  if (!state) return "#334155";
  const s = state.toLowerCase();
  if (s.includes("strong") || s.includes("high") || s.includes("pass") || s.includes("confirmed")) return "#4ade80";
  if (s.includes("weak") || s.includes("low") || s.includes("fail") || s.includes("conflict")) return "#f87171";
  if (s.includes("moderate") || s.includes("partial") || s.includes("mixed")) return "#fbbf24";
  return "#94a3b8";
};

// ─── 状态单元 ────────────────────────────────────────────────────────────────
const StateUnit = ({ label, value }: { label: string; value: string | null }) => {
  if (!value) return null;
  const color = stateColor(value);
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: "2px",
      minWidth: "60px",
    }}>
      <span style={{
        fontSize: "8px",
        fontFamily: "'Fira Code', monospace",
        color: "#475569",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
      }}>
        {label}
      </span>
      <span style={{
        fontSize: "10px",
        fontFamily: "'Fira Code', monospace",
        color,
        fontWeight: 500,
        lineHeight: 1.2,
      }}>
        {value}
      </span>
    </div>
  );
};

// ─── 主组件 ────────────────────────────────────────────────────────────────
export function ThesisBlock({ vm }: ThesisBlockProps) {
  if (!vm.available) return null;

  const sc = vm.stance ? stanceMap[vm.stance as keyof typeof stanceMap] : null;
  const accentColor = sc?.accent ?? "#334155";
  const showChange = vm.changeMarker && vm.changeMarker !== "stable" && vm.changeMarker !== "unknown";

  return (
    <div
      data-block="thesis"
      style={{
        background: "rgba(12, 15, 20, 0.85)",
        borderLeft: `2px solid ${accentColor}`,
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
        {/* 区块标签 */}
        <span style={{
          fontSize: "9px",
          fontFamily: "'Fira Code', monospace",
          fontWeight: 700,
          color: "#3b5070",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          flex: 1,
        }}>
          论题分析
        </span>

        {/* Stance chip */}
        {sc && vm.stance && (
          <span style={{
            fontSize: "9px",
            fontFamily: "'Fira Code', monospace",
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: "3px",
            background: sc.bg,
            color: sc.text,
            border: `1px solid ${sc.border}`,
            letterSpacing: "0.05em",
          }}>
            {vm.stance === "bullish" ? "多" : vm.stance === "bearish" ? "空" : "中性"}
          </span>
        )}

        {/* Change marker */}
        {showChange && vm.changeMarker && (
          <span style={{
            fontSize: "8px",
            fontFamily: "'Fira Code', monospace",
            padding: "1px 5px",
            borderRadius: "2px",
            background: "rgba(30, 41, 59, 0.5)",
            color: "#fbbf24",
            border: "1px solid rgba(51, 65, 85, 0.4)",
            letterSpacing: "0.04em",
          }}>
            {vm.changeMarker.replace(/_/g, " ").toUpperCase()}
          </span>
        )}
      </div>

      {/* ── 状态矩阵 ── */}
      <div style={{
        display: "flex",
        gap: "16px",
        flexWrap: "wrap",
        marginBottom: vm.stateSummaryText ? "8px" : "0",
        paddingBottom: vm.stateSummaryText ? "8px" : "0",
        borderBottom: vm.stateSummaryText ? "1px solid rgba(51, 65, 85, 0.2)" : "none",
      }}>
        <StateUnit label="证据" value={vm.evidenceState} />
        <StateUnit label="Gate门禁" value={vm.gateState} />
        <StateUnit label="来源" value={vm.sourceState} />
        {vm.fragilityScore != null && (
          <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "60px" }}>
            <span style={{
              fontSize: "8px",
              fontFamily: "'Fira Code', monospace",
              color: "#475569",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}>
              脆弱性
            </span>
            <span style={{
              fontSize: "10px",
              fontFamily: "'Fira Code', monospace",
              color: vm.fragilityScore > 0.6 ? "#f87171" : vm.fragilityScore > 0.3 ? "#fbbf24" : "#4ade80",
              fontWeight: 500,
            }}>
              {(vm.fragilityScore * 100).toFixed(0)}%
            </span>
          </div>
        )}
      </div>

      {/* ── 摘要文本 ── */}
      {vm.stateSummaryText && (
        <div style={{
          fontSize: "10px",
          fontFamily: "'Fira Code', monospace",
          color: "#64748b",
          lineHeight: 1.65,
          letterSpacing: "0.01em",
        }}>
          {vm.stateSummaryText}
        </div>
      )}
    </div>
  );
}
