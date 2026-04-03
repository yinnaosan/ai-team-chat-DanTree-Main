/**
 * DecisionHeader — DanTree Workspace v2.1-B3a
 * 交互层：点击 chip 滚动到对应区块（方案 A）+ activeSection 双向联动高亮
 * ui-ux-pro-max: Financial Dashboard 颜色系统 + Fira Code 字体
 * activeSection 高亮：稳定强调，非高饱和闪烁，底部 2px 线 + 轻微亮度提升
 * B2c 新增：独立 timing chip（readinessState → timing section）
 * B3a 升级：timing chip 双状态表达（readinessState + actionBias 单 chip 内分层）
 * 风格：冷静、精密、克制，对标 Apple / Tesla / NVIDIA
 */
import React, { useState } from "react";
import type { HeaderViewModel } from "@/hooks/useWorkspaceViewModel";

export type ScrollToSection = "thesis" | "timing" | "alert" | "history";

interface DecisionHeaderProps {
  vm: HeaderViewModel;
  onScrollTo?: (section: ScrollToSection) => void;
  activeSection?: ScrollToSection | null;
}

// ─── 颜色系统（ui-ux-pro-max Financial Dashboard）───────────────────────────
const C = {
  bg: "rgba(9, 13, 20, 0.88)",
  border: "rgba(51, 65, 85, 0.45)",
  textPrimary: "#f1f5f9",
  textSecondary: "#64748b",
  textDim: "#334155",
  // Stance
  bullish: { bg: "rgba(20, 83, 45, 0.55)", text: "#86efac", border: "rgba(22, 163, 74, 0.5)" },
  bearish: { bg: "rgba(127, 29, 29, 0.55)", text: "#fca5a5", border: "rgba(239, 68, 68, 0.5)" },
  neutral: { bg: "rgba(30, 58, 95, 0.55)", text: "#93c5fd", border: "rgba(59, 130, 246, 0.5)" },
  // Readiness / Timing
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

// ─── Chip 组件（支持可点击交互 + active 高亮）──────────────────────────────────
// ui-ux-pro-max: active 样式 = 底部 2px 线 + 轻微亮度提升 + 稳定强调（非高饱和闪烁）
const Chip = ({
  label,
  s,
  size = "sm",
  onClick,
  title,
  active = false,
}: {
  label: string;
  s: { bg: string; text: string; border: string };
  size?: "xs" | "sm";
  onClick?: () => void;
  title?: string;
  active?: boolean;
}) => {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isClickable = !!onClick;

  return (
    <span
      role={isClickable ? "button" : undefined}
      title={title}
      onClick={onClick}
      onMouseEnter={() => isClickable && setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => isClickable && setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: size === "xs" ? "9px" : "10px",
        fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
        fontWeight: active ? 600 : 500,
        padding: size === "xs" ? "1px 5px" : "2px 7px",
        borderRadius: "3px",
        // active 态：背景轻微提亮，底部 2px 强调线
        background: active
          ? s.bg.replace(/[\d.]+\)$/, m => `${Math.min(parseFloat(m) + 0.2, 0.85)})`)
          : s.bg,
        color: s.text,
        border: `1px solid ${s.border}`,
        // active 态：底部加 2px 强调线（稳定高亮，非闪烁）
        borderBottom: active ? `2px solid ${s.text}` : `1px solid ${s.border}`,
        letterSpacing: "0.06em",
        lineHeight: 1.4,
        whiteSpace: "nowrap",
        transition: "opacity 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease, background 0.2s ease, border-color 0.2s ease",
        cursor: isClickable ? "pointer" : "default",
        opacity: pressed ? 0.75 : 1,
        transform: pressed ? "scale(0.96)" : hovered ? "scale(1.03)" : "scale(1)",
        boxShadow: active
          ? `0 0 8px ${s.border}, inset 0 0 4px ${s.bg}`
          : hovered && isClickable
            ? `0 0 6px ${s.border}`
            : "none",
        userSelect: "none",
      }}
    >
      {label}
      {isClickable && (
        <span style={{ marginLeft: "3px", opacity: active ? 0.8 : 0.5, fontSize: "8px" }}>↓</span>
      )}
    </span>
  );
};

// ─── TimingDualChip — B3a 双状态 Timing chip ───────────────────────────────────────────────────────────────────────
// 规则：readiness 主文字 + · + actionBias 次文字（降低不透明度），单 chip 内分层表达
// 颜色：以 readinessState 为主色，actionBias 仅作文字分层，不新增 chip
const TimingDualChip = ({
  readinessState,
  actionBias,
  readinessS,
  biasS,
  onClick,
  active = false,
}: {
  readinessState: string;
  actionBias: string | null;
  readinessS: { bg: string; text: string; border: string };
  biasS: { bg: string; text: string; border: string } | null;
  onClick?: () => void;
  active?: boolean;
}) => {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isClickable = !!onClick;

  // readinessState 主文字映射
  const readinessLabel =
    readinessState === "ready" ? "时机就绪" :
    readinessState === "conditional" ? "条件就绪" :
    "时机未到";

  // actionBias 次文字（仅显示有意义的值）
  const showBias = actionBias && actionBias !== "NONE" && actionBias !== "UNKNOWN";

  return (
    <span
      role={isClickable ? "button" : undefined}
      title="点击跳转到 Timing 时机分析"
      onClick={onClick}
      onMouseEnter={() => isClickable && setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => isClickable && setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0",
        fontSize: "10px",
        fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
        fontWeight: active ? 600 : 500,
        padding: "2px 7px",
        borderRadius: "3px",
        background: active
          ? readinessS.bg.replace(/[\d.]+\)$/, m => `${Math.min(parseFloat(m) + 0.2, 0.85)})`)
          : readinessS.bg,
        color: readinessS.text,
        border: `1px solid ${readinessS.border}`,
        borderBottom: active ? `2px solid ${readinessS.text}` : `1px solid ${readinessS.border}`,
        letterSpacing: "0.06em",
        lineHeight: 1.4,
        whiteSpace: "nowrap",
        transition: "opacity 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease, background 0.2s ease",
        cursor: isClickable ? "pointer" : "default",
        opacity: pressed ? 0.75 : 1,
        transform: pressed ? "scale(0.96)" : hovered ? "scale(1.03)" : "scale(1)",
        boxShadow: active
          ? `0 0 8px ${readinessS.border}, inset 0 0 4px ${readinessS.bg}`
          : hovered && isClickable
            ? `0 0 6px ${readinessS.border}`
            : "none",
        userSelect: "none",
      }}
    >
      {/* readinessState 主文字 */}
      <span>{readinessLabel}</span>

      {/* 分隔符 + actionBias 次文字 */}
      {showBias && (
        <>
          <span style={{
            margin: "0 3px",
            opacity: 0.4,
            color: readinessS.text,
            fontSize: "9px",
          }}>·</span>
          <span style={{
            // actionBias 使用自身语义色（若有），降低不透明度以保持分层感
            color: biasS ? biasS.text : readinessS.text,
            opacity: 0.75,
            fontSize: "9px",
            fontWeight: 500,
            letterSpacing: "0.08em",
          }}>{actionBias}</span>
        </>
      )}

      {/* 可点击指示符 */}
      {isClickable && (
        <span style={{ marginLeft: "3px", opacity: active ? 0.8 : 0.5, fontSize: "8px" }}>↓</span>
      )}
    </span>
  );
};

// ─── 格式化时间 ───────────────────────────────────────────────────────────────────────
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

// ─── 主组件 ──────────────────────────────────────────────────────────────────
export function DecisionHeader({ vm, onScrollTo, activeSection }: DecisionHeaderProps) {
  const stanceS =
    vm.stance === "bullish" ? C.bullish :
    vm.stance === "bearish" ? C.bearish :
    vm.stance === "neutral" ? C.neutral : null;

  // B2c: readinessState → timing chip（独立联动 timing section）
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

      {/* Thesis Stance — 点击滚动到 Thesis 区块，active 高亮 */}
      {stanceS && vm.stance && (
        <Chip
          label={
            vm.stance === "bullish" ? "多" :
            vm.stance === "bearish" ? "空" :
            "中性"
          }
          s={stanceS}
          onClick={onScrollTo ? () => onScrollTo("thesis") : undefined}
          title="点击跳转到 Thesis 论题分析"
          active={activeSection === "thesis"}
        />
      )}

      {/* ── B3a: Timing chip 双状态表达（readinessState + actionBias 单 chip 内分层）── */}
      {/* 规则：readinessState 主文字 + 分隔符 · + actionBias 次文字（降低不透明度）*/}
      {/* 颜色：以 readinessState 为主色，actionBias 仅作文字分层，不新增 chip */}
      {readinessS && vm.readinessState && (
        <TimingDualChip
          readinessState={vm.readinessState}
          actionBias={vm.actionBias}
          readinessS={readinessS}
          biasS={biasS}
          onClick={onScrollTo ? () => onScrollTo("timing") : undefined}
          active={activeSection === "timing"}
        />
      )}

      {/* Action Bias — 仅在没有 readinessState 时独立显示（fallback） */}
      {!vm.readinessState && biasS && vm.actionBias && vm.actionBias !== "NONE" && (
        <Chip label={vm.actionBias} s={biasS} />
      )}

      {/* Alert Severity — 点击滚动到 Alert 区块，active 高亮 */}
      {sevS && vm.highestSeverity && (
        <Chip
          label={
            vm.highestSeverity === "critical" ? "严重风险" :
            vm.highestSeverity === "high" ? "高风险" :
            "中风险"
          }
          s={sevS}
          onClick={onScrollTo ? () => onScrollTo("alert") : undefined}
          title="点击跳转到 Alert 风险预警"
          active={activeSection === "alert"}
        />
      )}

      {/* Change Marker — 点击滚动到 History 区块，active 高亮 */}
      {showChange && vm.changeMarker && (
        <Chip
          label={vm.changeMarker.replace(/_/g, " ").toUpperCase()}
          s={C.change}
          size="xs"
          onClick={onScrollTo ? () => onScrollTo("history") : undefined}
          title="点击跳转到 History 历史变化"
          active={activeSection === "history"}
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
