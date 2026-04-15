/**
 * DecisionSpine.tsx — DanTree Workspace v2.1-B5
 *
 * Decision Canvas 主脊柱 — 仅负责 Thesis / Timing / Alert / History
 * DecisionHeader 已解耦，由外层 ResearchWorkspaceShell 在 Column 2 顶部独立渲染。
 * DecisionSpine 不再包含 DecisionHeader。
 */
import React from "react";
import { ThesisBlock, type ThesisBlockProps } from "./ThesisBlock";
import { TimingBlock, type TimingBlockProps } from "./TimingBlock";
import { AlertBlock, type AlertBlockProps } from "./AlertBlock";
import { HistoryBlock, type HistoryBlockProps } from "./HistoryBlock";

// ─── Compat type exports (旧 ResearchWorkspace.tsx 依赖) ─────────────────────
export interface SpineBlockRefs {
  thesis: React.RefObject<HTMLDivElement | null>;
  timing: React.RefObject<HTMLDivElement | null>;
  alert: React.RefObject<HTMLDivElement | null>;
  history: React.RefObject<HTMLDivElement | null>;
}

// 允许旧页面传入额外字段（vm / blockRef / sessionId）而不报 TSC 错误
export interface DecisionSpineProps {
  thesis?: ThesisBlockProps & { vm?: unknown; blockRef?: unknown; sessionId?: unknown };
  timing?: TimingBlockProps & { vm?: unknown; blockRef?: unknown; sessionId?: unknown };
  alerts?: AlertBlockProps & { vm?: unknown; blockRef?: unknown; sessionId?: unknown };
  history?: HistoryBlockProps & { vm?: unknown; blockRef?: unknown; sessionId?: unknown };
  isLoading?: boolean;
  attentionState?: {
    stability: 'STABLE' | 'CHANGED' | 'REVERSED';
    is_stale: boolean;
  };
}

function SkeletonBlock({ height = 80 }: { height?: number }) {
  return (
    <div style={{ height, background: "rgba(9,11,18,0.96)", border: "1px solid rgba(255,255,255,0.11)", borderTop: "2px solid rgba(52,211,153,0.25)", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ height: "100%", background: "linear-gradient(90deg, rgba(255,255,255,0.01) 25%, rgba(255,255,255,0.03) 50%, rgba(255,255,255,0.01) 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite" }} />
    </div>
  );
}

export function DecisionSpine({ thesis, timing, alerts, history, isLoading = false, attentionState }: DecisionSpineProps) {
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
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <ThesisBlock {...(thesis ?? {})} attentionState={attentionState} />
      <TimingBlock {...(timing ?? {})} />
      <AlertBlock {...(alerts ?? {})} />
      <HistoryBlock {...(history ?? {})} />
    </div>
  );
}
