/**
 * DecisionSpine — DanTree B1c 视觉层
 * 中间主脊柱容器：统一 4 个子块的纵向节奏
 * ui-ux-pro-max: 克制间距 + 统一边框系统 + 深度层级
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
        gap: "1px",                          // 子块之间极细间隙，形成统一体感
        margin: "12px 0",
        background: "rgba(26, 37, 53, 0.3)", // 脊柱整体底色
        border: "1px solid rgba(51, 65, 85, 0.3)",
        borderRadius: "4px",
        overflow: "hidden",                  // 子块圆角统一由容器控制
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
