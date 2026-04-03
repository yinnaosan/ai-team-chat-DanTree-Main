/**
 * DecisionSpine — DanTree Workspace v2.1-B3a
 * 统一设计系统：DS tokens，纵向节奏容器
 * 交互层：接收并转发 blockRefs，支持 DecisionHeader scroll-to-section 联动
 * 稳定化：接收 sessionId 并传递给四块，用于折叠状态持久化
 * B3a 新增：vm.isLoading / !hasAny 场景下显示 skeleton state（四块占位 + 克制 shimmer）
 * ui-ux-pro-max: skeleton screens > blank screen | reserve space for async content | prefers-reduced-motion
 */
import React, { useRef } from "react";
import type { WorkspaceViewModel } from "@/hooks/useWorkspaceViewModel";
import { DS } from "@/lib/designSystem";
import { ThesisBlock } from "./ThesisBlock";
import { TimingBlock } from "./TimingBlock";
import { AlertBlock } from "./AlertBlock";
import { HistoryBlock } from "./HistoryBlock";

export interface SpineBlockRefs {
  thesis: React.RefObject<HTMLDivElement | null>;
  timing: React.RefObject<HTMLDivElement | null>;
  alert: React.RefObject<HTMLDivElement | null>;
  history: React.RefObject<HTMLDivElement | null>;
}

interface DecisionSpineProps {
  vm: WorkspaceViewModel;
  blockRefs?: SpineBlockRefs;
  sessionId?: string | null;
}

// ─── Skeleton 组件 ────────────────────────────────────────────────────────────
// ui-ux-pro-max: 克制 shimmer（单方向渐变扫过），不做大面积发光
// prefers-reduced-motion: 直接显示静态占位，不播放动画
const SkeletonBar = ({
  width = "100%",
  height = "10px",
  style,
}: {
  width?: string;
  height?: string;
  style?: React.CSSProperties;
}) => (
  <div
    className="spine-skeleton-bar"
    style={{
      width,
      height,
      borderRadius: DS.r1,
      background: DS.surface3,
      overflow: "hidden",
      position: "relative",
      ...style,
    }}
  >
    {/* shimmer overlay — 克制单次扫过，不循环闪烁 */}
    <div className="spine-skeleton-shimmer" />
  </div>
);

// 单块骨架占位（模拟 header + 2-3 行内容）
const BlockSkeleton = ({
  label,
  rows = 2,
  headerHeight = "34px",
}: {
  label: string;
  rows?: number;
  headerHeight?: string;
}) => (
  <div
    style={{
      borderBottom: `1px solid ${DS.border0}`,
      overflow: "hidden",
    }}
  >
    {/* Header 占位 */}
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: `0 ${DS.sp4}`,
        height: headerHeight,
        borderBottom: `1px solid ${DS.border0}`,
        background: DS.surface1,
      }}
    >
      {/* 区块标签 */}
      <span
        style={{
          fontSize: "9px",
          fontFamily: DS.fontMono,
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase" as const,
          color: DS.text3,
          opacity: 0.6,
          userSelect: "none",
        }}
      >
        {label}
      </span>
      {/* chip 占位 */}
      <SkeletonBar width="52px" height="16px" />
      <SkeletonBar width="40px" height="16px" />
    </div>
    {/* 内容行占位 */}
    <div
      style={{
        padding: `${DS.sp3} ${DS.sp4}`,
        display: "flex",
        flexDirection: "column",
        gap: DS.sp2,
        background: DS.surface1,
      }}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonBar
          key={i}
          width={i === 0 ? "80%" : i === 1 ? "60%" : "70%"}
          height="10px"
        />
      ))}
    </div>
  </div>
);

// ─── 主组件 ──────────────────────────────────────────────────────────────────
export function DecisionSpine({ vm, blockRefs, sessionId }: DecisionSpineProps) {
  const { thesisViewModel, timingViewModel, alertViewModel, historyViewModel } = vm;

  // Internal refs if not provided externally
  const internalThesisRef = useRef<HTMLDivElement | null>(null);
  const internalTimingRef = useRef<HTMLDivElement | null>(null);
  const internalAlertRef = useRef<HTMLDivElement | null>(null);
  const internalHistoryRef = useRef<HTMLDivElement | null>(null);

  const thesisRef = blockRefs?.thesis ?? internalThesisRef;
  const timingRef = blockRefs?.timing ?? internalTimingRef;
  const alertRef = blockRefs?.alert ?? internalAlertRef;
  const historyRef = blockRefs?.history ?? internalHistoryRef;

  const hasAny =
    thesisViewModel.available ||
    timingViewModel.available ||
    alertViewModel.available ||
    historyViewModel.available;

  // B3a: loading 或 unavailable 时显示 skeleton，而非直接返回 null
  // ui-ux-pro-max: "Show feedback during async operations" (Severity: High)
  const showSkeleton = vm.isLoading || !hasAny;

  // 容器样式（skeleton 和内容共用，保持布局稳定）
  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "1px",
    margin: `${DS.sp4} 0`,
    background: DS.surface1,
    border: `1px solid ${DS.border1}`,
    borderRadius: DS.r2,
    overflow: "hidden",
    boxShadow: `0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 ${DS.border0}`,
    // B3a: opacity 过渡，避免内容突然跳出
    transition: "opacity 0.2s ease-out",
    opacity: showSkeleton ? 0.7 : 1,
    // 最小高度：保持布局稳定，避免高度塌陷
    minHeight: "220px",
  };

  if (showSkeleton) {
    return (
      <>
        {/* B3a: shimmer keyframe — 仅在此处注入，避免全局污染 */}
        <style>{`
          @keyframes spine-shimmer {
            0%   { transform: translateX(-100%); }
            100% { transform: translateX(200%); }
          }
          .spine-skeleton-shimmer {
            position: absolute;
            inset: 0;
            background: linear-gradient(
              90deg,
              transparent 0%,
              rgba(255,255,255,0.04) 40%,
              rgba(255,255,255,0.07) 50%,
              rgba(255,255,255,0.04) 60%,
              transparent 100%
            );
            animation: spine-shimmer 1.8s ease-in-out infinite;
          }
          @media (prefers-reduced-motion: reduce) {
            .spine-skeleton-shimmer { animation: none; }
          }
        `}</style>
        <div data-component="decision-spine-skeleton" style={containerStyle}>
          <BlockSkeleton label="Thesis" rows={2} />
          <BlockSkeleton label="Timing" rows={2} />
          <BlockSkeleton label="Alert" rows={3} />
          <BlockSkeleton label="History" rows={2} />
        </div>
      </>
    );
  }

  return (
    <div
      data-component="decision-spine"
      style={containerStyle}
    >
      {/* 固定顺序：Thesis → Timing → Alert → History */}
      <ThesisBlock vm={thesisViewModel} blockRef={thesisRef} sessionId={sessionId} />
      <TimingBlock vm={timingViewModel} blockRef={timingRef} sessionId={sessionId} />
      <AlertBlock vm={alertViewModel} blockRef={alertRef} sessionId={sessionId} />
      <HistoryBlock vm={historyViewModel} blockRef={historyRef} sessionId={sessionId} />
    </div>
  );
}
