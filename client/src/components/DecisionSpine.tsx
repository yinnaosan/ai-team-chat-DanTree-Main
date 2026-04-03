/**
 * DecisionSpine — DanTree B1b 中间主脊柱容器
 * 按固定顺序渲染：ThesisBlock → TimingBlock → AlertBlock → HistoryBlock
 * B-1c 视觉 polish 留到 ui ux pro max 阶段
 */
import React from "react";
import type { WorkspaceViewModel } from "@/hooks/useWorkspaceViewModel";
import { ThesisBlock } from "./ThesisBlock";
import { TimingBlock } from "./TimingBlock";
import { AlertBlock } from "./AlertBlock";
import { HistoryBlock } from "./HistoryBlock";

interface DecisionSpineProps {
  vm: WorkspaceViewModel;
}

export function DecisionSpine({ vm }: DecisionSpineProps) {
  const { thesisViewModel, timingViewModel, alertViewModel, historyViewModel } = vm;

  // 如果所有子块均不可用，不渲染容器
  const hasAny =
    thesisViewModel.available ||
    timingViewModel.available ||
    alertViewModel.available ||
    historyViewModel.available;

  if (!hasAny) return null;

  return (
    <div data-component="decision-spine">
      {/* 固定顺序：Thesis → Timing → Alert → History */}
      <ThesisBlock vm={thesisViewModel} />
      <TimingBlock vm={timingViewModel} />
      <AlertBlock vm={alertViewModel} />
      <HistoryBlock vm={historyViewModel} />
    </div>
  );
}
