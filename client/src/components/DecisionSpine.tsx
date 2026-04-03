/**
 * DecisionSpine — DanTree Workspace v2.1-B1e v3
 * 统一设计系统：DS tokens，纵向节奏容器
 */
import React from "react";
import type { WorkspaceViewModel } from "@/hooks/useWorkspaceViewModel";
import { DS } from "@/lib/designSystem";
import { ThesisBlock } from "./ThesisBlock";
import { TimingBlock } from "./TimingBlock";
import { AlertBlock } from "./AlertBlock";
import { HistoryBlock } from "./HistoryBlock";

interface DecisionSpineProps {
  vm: WorkspaceViewModel;
}

export function DecisionSpine({ vm }: DecisionSpineProps) {
  const { thesisViewModel, timingViewModel, alertViewModel, historyViewModel } = vm;

  const hasAny =
    thesisViewModel.available ||
    timingViewModel.available ||
    alertViewModel.available ||
    historyViewModel.available;

  if (!hasAny) return null;

  return (
    <div
      data-component="decision-spine"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1px",
        margin: `${DS.sp4} 0`,
        background: DS.surface1,
        border: `1px solid ${DS.border1}`,
        borderRadius: DS.r2,
        overflow: "hidden",
        boxShadow: `0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 ${DS.border0}`,
      }}
    >
      {/* 固定顺序：Thesis → Timing → Alert → History */}
      <ThesisBlock vm={thesisViewModel} />
      <TimingBlock vm={timingViewModel} />
      <AlertBlock vm={alertViewModel} />
      <HistoryBlock vm={historyViewModel} />
    </div>
  );
}
