/**
 * WorkspaceDiscussionRender.tsx — DanTree Workspace Output Refactor v1
 *
 * Renders DiscussionViewModel as segmented blocks.
 * Replaces the current "one giant message" rendering pattern.
 *
 * INPUT:  DiscussionViewModel from workspaceOutputAdapter
 * RENDERS: thesis → reasoning → narrative → charts → followups
 *
 * FALLBACK: if isStructured=false, renders rawFallback as plain prose
 */
import React from "react";
import { Target, ArrowRight, BarChart2, AlertCircle } from "lucide-react";
import { InlineChart } from "@/components/InlineChart";
import { PyImageChart } from "@/components/InlineChart";
import type { DiscussionViewModel, DiscussionBlock } from "@/lib/WorkspaceOutputModel";

// ─────────────────────────────────────────────────────────────────────────────
// Block renderers
// ─────────────────────────────────────────────────────────────────────────────

function ThesisBlockRender({ block }: { block: DiscussionBlock }) {
  return (
    <div style={{
      padding: "14px 16px",
      background: "rgba(16,185,129,0.05)",
      border: "1px solid rgba(16,185,129,0.12)",
      borderRadius: 8, marginBottom: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <Target size={11} color="rgba(16,185,129,0.60)" />
        <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(16,185,129,0.55)", textTransform: "uppercase", letterSpacing: "0.09em" }}>
          核心结论
        </span>
      </div>
      <p style={{ fontSize: 14, lineHeight: 1.78, color: "rgba(255,255,255,0.85)", margin: 0, fontWeight: 500 }}>
        {block.content}
      </p>
    </div>
  );
}

function ReasoningBlockRender({ block }: { block: DiscussionBlock }) {
  const points = block.content.split("\n").filter(p => p.trim().length > 0);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 7, paddingLeft: 2 }}>
        关键推理
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {points.map((pt, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "flex-start", gap: 9,
            padding: "8px 11px", borderRadius: 6,
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.04)",
          }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(96,165,250,0.55)", marginTop: 2, flexShrink: 0 }}>
              {i + 1}.
            </span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.58)", lineHeight: 1.65 }}>
              {pt.replace(/^[-*•]\s*/, "")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NarrativeBlockRender({ block }: { block: DiscussionBlock }) {
  return (
    <div style={{ marginBottom: 10, paddingLeft: 2 }}>
      <p style={{ fontSize: 13, lineHeight: 1.78, color: "rgba(255,255,255,0.58)", margin: 0 }}>
        {block.content}
      </p>
    </div>
  );
}

function ChartBlockRender({ block }: { block: DiscussionBlock }) {
  // %%CHART%% → InlineChart (interactive chart component)
  if (block.type === "chart" && block.chartRaw) {
    try {
      return (
        <div style={{ marginBottom: 12, borderRadius: 8, overflow: "hidden" }}>
          <InlineChart raw={block.chartRaw} />
        </div>
      );
    } catch {
      // Fallback: chart parse failed — show silent indicator, do not break UI
      return (
        <div style={{
          marginBottom: 10, padding: "8px 12px",
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.04)",
          borderRadius: 6, display: "flex", alignItems: "center", gap: 7,
        }}>
          <BarChart2 size={11} color="rgba(255,255,255,0.18)" />
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.22)" }}>图表数据（渲染失败）</span>
        </div>
      );
    }
  }

  // %%PYIMAGE%% → PyImageChart (matplotlib base64 PNG)
  if (block.type === "image_chart" && block.chartBase64) {
    try {
      return (
        <div style={{ marginBottom: 12, borderRadius: 8, overflow: "hidden" }}>
          <PyImageChart base64={block.chartBase64} />
        </div>
      );
    } catch {
      return (
        <div style={{
          marginBottom: 10, padding: "8px 12px",
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.04)",
          borderRadius: 6, display: "flex", alignItems: "center", gap: 7,
        }}>
          <AlertCircle size={11} color="rgba(255,255,255,0.18)" />
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.22)" }}>图像数据（渲染失败）</span>
        </div>
      );
    }
  }

  // Unknown chart type — safe no-op
  return null;
}

function FollowupsBlockRender({ block }: { block: DiscussionBlock }) {
  if (!block.followups?.length) return null;
  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.22)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 7 }}>
        继续探讨
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {block.followups.map((q, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "flex-start", gap: 8,
            padding: "7px 10px", borderRadius: 6,
            background: "rgba(16,185,129,0.04)",
            border: "1px solid rgba(16,185,129,0.09)",
            cursor: "pointer",
          }}>
            <ArrowRight size={10} color="rgba(16,185,129,0.45)" style={{ marginTop: 2, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: "rgba(16,185,129,0.58)", lineHeight: 1.55 }}>
              {q}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main render component
// ─────────────────────────────────────────────────────────────────────────────

interface WorkspaceDiscussionRenderProps {
  viewModel: DiscussionViewModel;
  /** Called when a followup button is clicked */
  onFollowup?: (question: string) => void;
}

export function WorkspaceDiscussionRender({ viewModel, onFollowup }: WorkspaceDiscussionRenderProps) {
  // STRICT: no rawFallback. If adapter fails → empty state, never raw dump.
  if (viewModel.blocks.length === 0) {
    return null;
  }

  return (
    <div style={{ padding: "12px 18px 4px" }}>
      {viewModel.blocks.map((block, i) => {
        switch (block.type) {
          case "thesis":    return <ThesisBlockRender    key={i} block={block} />;
          case "reasoning": return <ReasoningBlockRender key={i} block={block} />;
          case "narrative": return <NarrativeBlockRender key={i} block={block} />;
          case "chart":     return <ChartBlockRender key={i} block={block} />;
          case "image_chart": return <ChartBlockRender key={i} block={block} />;
          case "followups": return (
            <div key={i} onClick={e => {
              const btn = (e.target as HTMLElement).closest("[data-followup]");
              const q = btn?.getAttribute("data-followup");
              if (q && onFollowup) onFollowup(q);
            }}>
              {block.followups?.map((q, qi) => (
                <div
                  key={qi}
                  data-followup={q}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 8,
                    padding: "7px 10px", borderRadius: 6, marginBottom: 4,
                    background: "rgba(16,185,129,0.04)",
                    border: "1px solid rgba(16,185,129,0.09)",
                    cursor: "pointer",
                  }}
                >
                  <ArrowRight size={10} color="rgba(16,185,129,0.45)" style={{ marginTop: 2, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "rgba(16,185,129,0.58)", lineHeight: 1.55 }}>{q}</span>
                </div>
              ))}
            </div>
          );
          default: return null;
        }
      })}
    </div>
  );
}
