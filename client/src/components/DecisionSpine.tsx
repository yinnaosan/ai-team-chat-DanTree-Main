/**
 * DecisionSpine.tsx — DanTree Workspace v2.1-B5
 *
 * Decision Canvas 主脊柱 — 仅负责 Thesis / Timing / Alert / History
 * DecisionHeader 已解耦，由外层 ResearchWorkspaceShell 在 Column 2 顶部独立渲染。
 * DecisionSpine 不再包含 DecisionHeader。
 *
 * M1 fix: removed `import type { XxxBlockProps }` (not exported by blocks);
 *         declared local pass-through types instead.
 */
import React from "react";
import { ThesisBlock } from "./ThesisBlock";
import { TimingBlock } from "./TimingBlock";
import { AlertBlock } from "./AlertBlock";
import { HistoryBlock } from "./HistoryBlock";

// Local pass-through types — mirrors each block's Props interface
type ThesisBlockProps = { vm?: any; blockRef?: React.RefObject<HTMLDivElement | null>; sessionId?: string | null };
type TimingBlockProps = { vm?: any; blockRef?: React.RefObject<HTMLDivElement | null>; sessionId?: string | null };
type AlertBlockProps  = { vm?: any; blockRef?: React.RefObject<HTMLDivElement | null>; sessionId?: string | null };
type HistoryBlockProps = { vm?: any; blockRef?: React.RefObject<HTMLDivElement | null>; sessionId?: string | null };

export interface DecisionSpineProps {
  thesis?: ThesisBlockProps;
  timing?: TimingBlockProps;
  alerts?: AlertBlockProps;
  history?: HistoryBlockProps;
  isLoading?: boolean;
}

function SkeletonBlock({ height = 80 }: { height?: number }) {
  return (
    <div style={{ height, background: "#0a0e1a", border: "1px solid #1a2030", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ height: "100%", background: "linear-gradient(90deg, #0d1117 25%, #111827 50%, #0d1117 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite" }} />
    </div>
  );
}

export function DecisionSpine({ thesis, timing, alerts, history, isLoading = false }: DecisionSpineProps) {
  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <SkeletonBlock height={160} />
        <SkeletonBlock height={120} />
        <SkeletonBlock height={100} />
        <SkeletonBlock height={130} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <ThesisBlock {...(thesis as any ?? {})} />
      <TimingBlock {...(timing as any ?? {})} />
      <AlertBlock {...(alerts as any ?? {})} />
      <HistoryBlock {...(history as any ?? {})} />
    </div>
  );
}
