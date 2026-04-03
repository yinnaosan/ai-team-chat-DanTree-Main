/**
 * DecisionSpine — DanTree Workspace v2.1-B2a
 * 统一设计系统：DS tokens，纵向节奏容器
 * 交互层：接收并转发 blockRefs，支持 DecisionHeader scroll-to-section 联动
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
}

export function DecisionSpine({ vm, blockRefs }: DecisionSpineProps) {
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
      <ThesisBlock vm={thesisViewModel} blockRef={thesisRef} />
      <TimingBlock vm={timingViewModel} blockRef={timingRef} />
      <AlertBlock vm={alertViewModel} blockRef={alertRef} />
      <HistoryBlock vm={historyViewModel} blockRef={historyRef} />
    </div>
  );
}
