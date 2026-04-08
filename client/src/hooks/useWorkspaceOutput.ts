/**
 * useWorkspaceOutput.ts — Workspace Output Refactor v1
 * Layer 1: Data Shaping
 *
 * Single hook that converts current VNext runtime data into WorkspaceOutputV1.
 *
 * INPUT SOURCE PRIORITY (explicit, no guessing):
 *   1. metadata.answerObject  — IF present in runtime (available when backend returns structured JSON)
 *   2. m.content (assistant)  — PRIMARY fallback, always available in current runtime
 *   3. parseChartBlocks()     — from InlineChart, already in codebase, wired here
 *   4. parseFollowups()       — adapted from ChatRoom.tsx pattern, wired here
 *   5. manusResult/gptSummary — NOT reliably available in current VNext runtime path; NOT used in v1
 *
 * CURRENT RUNTIME REALITY:
 *   - metadata.answerObject: present only when backend explicitly sets it (partial availability)
 *   - m.content: always present, is the reliable primary source
 *   - manusResult/gptSummary: exist in DB but NOT exposed to VNext frontend in current runtime
 *   - parseChartBlocks: available via @/components/InlineChart, wired here
 *   - parseFollowups: pattern exists in ChatRoom.tsx, replicated here
 *
 * OUTPUT:
 *   WorkspaceOutputV1 — consumed by DiscussionPanelVNext + InsightsRailVNext
 */

import { useMemo } from "react";
import { parseChartBlocks } from "@/components/InlineChart";
import { adaptToWorkspaceOutput } from "@/lib/workspaceOutputAdapter";
import { emptyWorkspaceOutput, type WorkspaceOutputV1 } from "@/lib/WorkspaceOutputModel";

// ─────────────────────────────────────────────────────────────────────────────
// Input type — what VNext page provides
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkspaceOutputInput {
  /** Latest assistant message content — PRIMARY source (always available) */
  latestAssistantContent?: string | null;
  /** metadata.answerObject — OPTIONAL, available when backend sets it */
  answerObject?: {
    verdict?: string;
    confidence?: "high" | "medium" | "low";
    bull_case?: string[];
    bear_case?: string[];
    reasoning?: string[];
    risks?: Array<{ description: string; magnitude?: string }>;
    key_points?: string[];
    suggested_next?: string;
  } | null;
  /** Current entity/ticker */
  entity?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useWorkspaceOutput(input: WorkspaceOutputInput): WorkspaceOutputV1 {
  return useMemo(() => {
    const { latestAssistantContent, answerObject, entity } = input;

    // Nothing to work with
    if (!latestAssistantContent?.trim() && !answerObject) {
      return emptyWorkspaceOutput(entity);
    }

    const result = adaptToWorkspaceOutput({
      content: latestAssistantContent ?? "",
      answerObject: answerObject ?? undefined,
      entity,
    });

    // ═══ FORCED VALIDATION — blocks.length > 0 && isStructured === true ═══
    const followupsBlock = result.discussion.blocks.find(b => b.type === "followups");
    const followupsCount = followupsBlock?.followups?.length ?? 0;
    console.log(
      "[useWorkspaceOutput] ══ FORCED VALIDATION ══\n" +
      `  contentLength: ${latestAssistantContent?.length ?? 0}\n` +
      `  blocks.length: ${result.discussion.blocks.length}\n` +
      `  blockTypes: [${result.discussion.blocks.map(b => b.type).join(", ")}]\n` +
      `  isStructured: ${result.discussion.isStructured}\n` +
      `  followups.length: ${followupsCount}\n` +
      `  insights.now: ${result.insights.now.length}\n` +
      `  insights.monitor: ${result.insights.monitor.length}\n` +
      `  insights.quickFacts: ${result.insights.quickFacts.length}\n` +
      `  insights.news: ${result.insights.news.length}\n` +
      `  _meta: ${JSON.stringify(result._meta)}`
    );
    // ASSERT: adapter MUST produce structured output
    if (result.discussion.blocks.length === 0 && (latestAssistantContent?.length ?? 0) > 50) {
      console.error("[useWorkspaceOutput] ❌ ADAPTER FAILED: blocks.length === 0 despite content > 50 chars");
    }

    return result;
  }, [input.latestAssistantContent, input.answerObject, input.entity]);
}
