/**
 * DecisionHeader — DanTree B1c 视觉层
 * Apple/Tesla/NVIDIA 风格：克制、精密、高级感
 * ui-ux-pro-max: Financial Dashboard 颜色系统 + Fira Code 字体
 * sticky top + backdrop blur + 主次分明的状态栏
 */
import React from "react";
import type { HeaderViewModel } from "@/hooks/useWorkspaceViewModel";

interface DecisionHeaderProps {
  vm: HeaderViewModel;
}

// ─── 颜色系统（ui-ux-pro-max Financial Dashboard）───────────────────────────
const C = {
  bg: "rgba(9, 13, 20, 0.88)",           // 深底，接近 #020617
  border: "rgba(51, 65, 85, 0.45)",      // 细线，#334155 @ 45%
  textPrimary: "#f1f5f9",                // 主文字
  textSecondary: "#64748b",              // 次要文字
  textDim: "#334155",                    // 分隔符
  // Stance
  bullish: { bg: "rgba(20, 83, 45, 0.55)", text: "#86efac", border: "rgba(22, 163, 74, 0.5)" },
  bearish: { bg: "rgba(127, 29, 29, 0.55)", text: "#fca5a5", border: "rgba(239, 68, 68, 0.5)" },
  neutral: { bg: "rgba(30, 58, 95, 0.55)", text: "#93c5fd", border: "rgba(59, 130, 246, 0.5)" },
  // Readiness
  ready: { bg: "rgba(20, 83, 45, 0.45)", text: "#4ade80", border: "rgba(22, 163, 74, 0.4)" },
  conditional: { bg: "rgba(69, 26, 3, 0.55)", text: "#fbbf24", border: "rgba(217, 119, 6, 0.5)" },
  not_ready: { bg: "rgba(30, 41, 59, 0.4)", text: "#64748b", border: "rgba(51, 65, 85, 0.4)" },
  // Action bias
  BUY: { bg: "rgba(20, 83, 45, 0.45)", text: "#4ade80", border: "rgba(22, 163, 74, 0.4)" },
  HOLD: { bg: "rgba(30, 58, 95, 0.45)", text: "#7dd3fc", border: "rgba(59, 130, 246, 0.4)" },
  AVOID: { bg: "rgba(127, 29, 29, 0.45)", text: "#f87171", border: "rgba(239, 68, 68, 0.4)" },
  // Severity
  critical: { bg: "rgba(127, 29, 29, 0.6)", text: "#fca5a5", border: "rgba(239, 68, 68, 0.6)" },
  high: { bg: "rgba(67, 20, 7, 0.6)", text: "#fb923c", border: "rgba(234, 88, 12, 0.55)" },
  medium: { bg: "rgba(69, 26, 3, 0.5)", text: "#fbbf24", border: "rgba(217, 119, 6, 0.45)" },
  // Change marker
  change: { bg: "rgba(30, 41, 59, 0.5)", text: "#fbbf24", border: "rgba(51, 65, 85, 0.4)" },
  // Session type
  sessionType: { bg: "rgba(30, 41, 59, 0.4)", text: "#475569", border: "rgba(51, 65, 85, 0.35)" },
};

// ─── Chip 组件 ─────────────────────────────────────────────────────────────
const Chip = ({
  label,
  s,
  size = "sm",
}: {
  label: string;
  s: { bg: string; text: string; border: string };
  size?: "xs" | "sm";
}) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      fontSize: size === "xs" ? "9px" : "10px",
      fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
      fontWeight: 500,
      padding: size === "xs" ? "1px 5px" : "2px 7px",
      borderRadius: "3px",
      background: s.bg,
      color: s.text,
      border: `1px solid ${s.border}`,
      letterSpacing: "0.06em",
      lineHeight: 1.4,
      whiteSpace: "nowrap",
      transition: "opacity 0.15s ease",
    }}
  >
    {label}
  </span>
);

// ─── 格式化时间 ─────────────────────────────────────────────────────────────
const formatTs = (ts: number | null) => {
  if (!ts) return null;
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} 小时前`;
  return d.toLocaleDateString();
};

// ─── 主组件 ────────────────────────────────────────────────────────────────
export function DecisionHeader({ vm }: DecisionHeaderProps) {
  const stanceS =
    vm.stance === "bullish" ? C.bullish :
    vm.stance === "bearish" ? C.bearish :
    vm.stance === "neutral" ? C.neutral : null;

  const readinessS =
    vm.readinessState === "ready" ? C.ready :
    vm.readinessState === "conditional" ? C.conditional :
    vm.readinessState === "not_ready" ? C.not_ready : null;

  const biasS =
    vm.actionBias === "BUY" ? C.BUY :
    vm.actionBias === "HOLD" ? C.HOLD :
    vm.actionBias === "AVOID" ? C.AVOID : null;

  const sevS =
    vm.highestSeverity === "critical" ? C.critical :
    vm.highestSeverity === "high" ? C.high :
    vm.highestSeverity === "medium" ? C.medium : null;

  const showChange =
    vm.changeMarker &&
    vm.changeMarker !== "stable" &&
    vm.changeMarker !== "unknown";

  return (
    <div
      data-component="decision-header"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "7px 16px",
        borderBottom: `1px solid ${C.border}`,
        background: C.bg,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        flexWrap: "wrap",
        minHeight: "38px",
        boxShadow: "0 1px 0 rgba(0,0,0,0.4)",
      }}
    >
      {/* ── 当前对象 ── 主标识，最大视觉权重 */}
      <span
        style={{
          fontSize: "13px",
          fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
          fontWeight: 700,
          color: C.textPrimary,
          letterSpacing: "0.06em",
          lineHeight: 1,
        }}
      >
        {vm.entity || "—"}
      </span>

      {/* 会话类型 — 次要，灰色小徽章 */}
      {vm.sessionType && vm.sessionType !== "entity" && (
        <Chip
          label={vm.sessionType}
          s={C.sessionType}
          size="xs"
        />
      )}

      {/* ── 分隔线 ── */}
      <span
        style={{
          width: "1px",
          height: "14px",
          background: C.border,
          flexShrink: 0,
        }}
      />

      {/* Thesis Stance */}
      {stanceS && vm.stance && (
        <Chip
          label={
            vm.stance === "bullish" ? "多" :
            vm.stance === "bearish" ? "空" :
            "中性"
          }
          s={stanceS}
        />
      )}

      {/* Readiness */}
      {readinessS && vm.readinessState && (
        <Chip
          label={
            vm.readinessState === "ready" ? "时机就绪" :
            vm.readinessState === "conditional" ? "条件就绪" :
            "时机未到"
          }
          s={readinessS}
        />
      )}

      {/* Action Bias */}
      {biasS && vm.actionBias && vm.actionBias !== "NONE" && (
        <Chip label={vm.actionBias} s={biasS} />
      )}

      {/* Alert Severity — 仅 medium+ 显示 */}
      {sevS && vm.highestSeverity && (
        <Chip
          label={
            vm.highestSeverity === "critical" ? "严重风险" :
            vm.highestSeverity === "high" ? "高风险" :
            "中风险"
          }
          s={sevS}
        />
      )}

      {/* Change Marker — 仅非 stable/unknown 显示 */}
      {showChange && vm.changeMarker && (
        <Chip
          label={vm.changeMarker.replace(/_/g, " ").toUpperCase()}
          s={C.change}
          size="xs"
        />
      )}

      {/* ── 右侧：最近更新 ── */}
      {vm.lastSnapshotAt && (
        <span
          style={{
            fontSize: "9px",
            fontFamily: "'Fira Code', monospace",
            color: C.textSecondary,
            marginLeft: "auto",
            whiteSpace: "nowrap",
            letterSpacing: "0.02em",
          }}
        >
          快照 {formatTs(vm.lastSnapshotAt)}
        </span>
      )}
    </div>
  );
}
