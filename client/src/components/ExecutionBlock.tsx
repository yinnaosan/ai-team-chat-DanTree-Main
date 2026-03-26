/**
 * ExecutionBlock.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Institutional-grade execution block system for DanTree Terminal.
 * Replaces chat bubbles with structured pipeline blocks.
 *
 * Block types: SYSTEM | PLANNER | SOURCE | REASONING | EVIDENCE | RISK | SYNTHESIS | FINAL
 *
 * Visual system (strict):
 *   bg:       #0f1115
 *   card:     #161a21
 *   elevated: #1b2130
 *   border:   #232937
 *   text-1:   #e6e8eb
 *   text-2:   #9aa4b2
 *   accent:   #3b6ef5
 *   success:  #16a34a
 *   risk:     #dc2626
 */

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Copy, Check } from "lucide-react";
import { Streamdown } from "streamdown";

// ── Types ─────────────────────────────────────────────────────────────────────

export type BlockType =
  | "SYSTEM"
  | "PLANNER"
  | "SOURCE"
  | "REASONING"
  | "EVIDENCE"
  | "RISK"
  | "SYNTHESIS"
  | "FINAL";

export interface ExecutionBlockData {
  id: string;
  type: BlockType;
  label: string;       // e.g. "PLANNER · Stage 1"
  meta?: string;       // e.g. "3 sources · 1.2s"
  content: string;     // Markdown content
  timestamp?: number;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

// ── Color config per block type ───────────────────────────────────────────────

const BLOCK_CONFIG: Record<BlockType, {
  accent: string;
  accentOpacity: string;
  labelColor: string;
  bg: string;
}> = {
  SYSTEM: {
    accent: "#4a5568",
    accentOpacity: "rgba(74,85,104,0.4)",
    labelColor: "#6b7280",
    bg: "#161a21",
  },
  PLANNER: {
    accent: "#3b6ef5",
    accentOpacity: "rgba(59,110,245,0.5)",
    labelColor: "#3b6ef5",
    bg: "#161a21",
  },
  SOURCE: {
    accent: "#3b6ef5",
    accentOpacity: "rgba(59,110,245,0.25)",
    labelColor: "#5a7fd4",
    bg: "#161a21",
  },
  REASONING: {
    accent: "#4a5568",
    accentOpacity: "rgba(74,85,104,0.4)",
    labelColor: "#9aa4b2",
    bg: "#161a21",
  },
  EVIDENCE: {
    accent: "#16a34a",
    accentOpacity: "rgba(22,163,74,0.5)",
    labelColor: "#16a34a",
    bg: "#161a21",
  },
  RISK: {
    accent: "#dc2626",
    accentOpacity: "rgba(220,38,38,0.5)",
    labelColor: "#dc2626",
    bg: "#161a21",
  },
  SYNTHESIS: {
    accent: "#4a5568",
    accentOpacity: "rgba(74,85,104,0.4)",
    labelColor: "#9aa4b2",
    bg: "#161a21",
  },
  FINAL: {
    accent: "#3b6ef5",
    accentOpacity: "rgba(59,110,245,0.3)",
    labelColor: "#e6e8eb",
    bg: "#1b2130",
  },
};

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
      style={{ color: "#4a5568" }}
      title="Copy"
    >
      {copied ? <Check className="w-3 h-3" style={{ color: "#16a34a" }} /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

// ── Single ExecutionBlock ─────────────────────────────────────────────────────

export function ExecutionBlock({ block }: { block: ExecutionBlockData }) {
  const cfg = BLOCK_CONFIG[block.type];
  const [collapsed, setCollapsed] = useState(block.defaultCollapsed ?? false);

  return (
    <div
      className="group relative rounded-lg overflow-hidden"
      style={{
        background: cfg.bg,
        border: "1px solid #232937",
        borderLeft: `2px solid ${cfg.accentOpacity}`,
      }}
    >
      {/* Label row */}
      <div
        className="flex items-center justify-between px-3.5 py-2.5 cursor-pointer select-none"
        style={{ borderBottom: collapsed ? "none" : "1px solid #1e2330" }}
        onClick={() => block.collapsible && setCollapsed(v => !v)}
      >
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-mono font-bold uppercase tracking-widest"
            style={{ color: cfg.labelColor }}
          >
            {block.label}
          </span>
          {block.meta && (
            <span className="text-[9px] font-mono" style={{ color: "#3a4050" }}>
              · {block.meta}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <CopyButton text={block.content} />
          {block.collapsible && (
            <button
              className="p-0.5 rounded transition-colors"
              style={{ color: "#3a4050" }}
              onClick={(e) => { e.stopPropagation(); setCollapsed(v => !v); }}
            >
              {collapsed
                ? <ChevronRight className="w-3 h-3" />
                : <ChevronDown className="w-3 h-3" />
              }
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {!collapsed && (
        <div className="px-3.5 py-3">
          {block.type === "FINAL" ? (
            <div className="prose-terminal">
              <Streamdown>{block.content}</Streamdown>
            </div>
          ) : (
            <div
              className="text-[13px] leading-relaxed whitespace-pre-wrap"
              style={{ color: "#c8cdd6", fontFamily: "var(--font-sans)" }}
            >
              {block.content}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Message → Block parser ────────────────────────────────────────────────────
/**
 * Converts a raw assistant message + its metadata into an ordered sequence
 * of ExecutionBlockData items for display in the Execution Stream.
 *
 * Mapping rules:
 *   metadata.intentContext  → PLANNER block
 *   metadata.citationHits   → SOURCE block
 *   metadata.evidenceScore  → EVIDENCE block
 *   answerObject.risks      → RISK block
 *   answerObject.reasoning  → REASONING block
 *   answerObject.verdict +
 *   answerObject.bull_case +
 *   answerObject.bear_case  → SYNTHESIS block
 *   msg.content (final text)→ FINAL block
 *   user messages           → SYSTEM block
 */

interface Msg {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: Record<string, any> | null;
  createdAt?: Date | string | number;
}

function makeId(prefix: string, msgId: number) {
  return `${prefix}-${msgId}`;
}

export function parseMessageToBlocks(msg: Msg): ExecutionBlockData[] {
  const blocks: ExecutionBlockData[] = [];
  const meta = msg.metadata ?? {};

  if (msg.role === "user") {
    blocks.push({
      id: makeId("sys", msg.id),
      type: "SYSTEM",
      label: "SYSTEM · Query",
      content: msg.content,
    });
    return blocks;
  }

  if (msg.role !== "assistant") return blocks;

  // ── PLANNER block ──────────────────────────────────────────────────────────
  const intent = meta.intentContext;
  if (intent) {
    const lines: string[] = [];
    if (intent.task_type) lines.push(`• Task Type: ${intent.task_type}`);
    if (intent.interaction_mode) lines.push(`• Mode: ${intent.interaction_mode}`);
    if (intent.entity_scope) lines.push(`• Scope: ${intent.entity_scope}`);
    if (intent.risk_focus) lines.push(`• Risk Focus: ${intent.risk_focus}`);
    if (intent.growth_focus) lines.push(`• Growth Focus: ${intent.growth_focus}`);
    if (meta.sourceSelectionSummary) lines.push(`\n${meta.sourceSelectionSummary}`);
    if (lines.length > 0) {
      blocks.push({
        id: makeId("planner", msg.id),
        type: "PLANNER",
        label: "PLANNER · Stage 1",
        meta: meta.outputMode ? `mode: ${meta.outputMode}` : undefined,
        content: lines.join("\n"),
        collapsible: true,
        defaultCollapsed: false,
      });
    }
  }

  // ── SOURCE block ───────────────────────────────────────────────────────────
  const citations: any[] = meta.citationHits ?? [];
  const apiSources: any[] = meta.apiSources ?? [];
  const dataSources: any[] = meta.dataSources ?? [];
  if (citations.length > 0 || apiSources.length > 0 || dataSources.length > 0) {
    const lines: string[] = [];
    if (citations.length > 0) {
      lines.push(`• ${citations.length} registered data sources hit`);
      const cats = Array.from(new Set(citations.map((c: any) => c.category).filter(Boolean)));
      if (cats.length > 0) lines.push(`  Categories: ${cats.join(", ")}`);
      const whitelisted = citations.filter((c: any) => c.isWhitelisted);
      if (whitelisted.length > 0) lines.push(`  Whitelisted: ${whitelisted.map((c: any) => c.name).join(", ")}`);
    }
    if (apiSources.length > 0) {
      lines.push(`• ${apiSources.length} API source(s) queried`);
    }
    if (dataSources.length > 0) {
      lines.push(`• ${dataSources.length} web source(s) retrieved`);
    }
    if (meta.sourceValidationNote) lines.push(`\n${meta.sourceValidationNote}`);
    blocks.push({
      id: makeId("source", msg.id),
      type: "SOURCE",
      label: `SOURCE · ${citations.length + apiSources.length} feeds`,
      meta: meta.sourceConfidenceAdjustment != null
        ? `confidence adj: ${meta.sourceConfidenceAdjustment > 0 ? "+" : ""}${meta.sourceConfidenceAdjustment}`
        : undefined,
      content: lines.join("\n"),
      collapsible: true,
      defaultCollapsed: true,
    });
  }

  // ── REASONING block ────────────────────────────────────────────────────────
  const answerObj = meta.answerObject;
  if (answerObj?.reasoning && answerObj.reasoning.length > 0) {
    const lines = answerObj.reasoning.map((r: string) => `• ${r}`);
    blocks.push({
      id: makeId("reasoning", msg.id),
      type: "REASONING",
      label: "REASONING · Valuation",
      content: lines.join("\n"),
      collapsible: true,
      defaultCollapsed: false,
    });
  }

  // ── EVIDENCE block ─────────────────────────────────────────────────────────
  const evidenceScore = meta.evidenceScore ?? meta.evidenceStrengthScore;
  if (evidenceScore != null) {
    const lines: string[] = [];
    lines.push(`• Evidence Score: ${evidenceScore}/100`);
    if (meta.outputMode) lines.push(`• Output Mode: ${meta.outputMode.toUpperCase()}`);
    if (meta.evidenceGatingMode) lines.push(`• Gating Mode: ${meta.evidenceGatingMode}`);
    if (meta.evidenceConflictCount != null && meta.evidenceConflictCount > 0) {
      lines.push(`• Conflicts Detected: ${meta.evidenceConflictCount}`);
      if (meta.evidenceConflictFields) lines.push(`  Fields: ${meta.evidenceConflictFields}`);
    }
    if (meta.missingBlocking && meta.missingBlocking.length > 0) {
      lines.push(`• Missing (blocking): ${meta.missingBlocking.join(", ")}`);
    }
    if (meta.missingImportant && meta.missingImportant.length > 0) {
      lines.push(`• Missing (important): ${meta.missingImportant.join(", ")}`);
    }
    blocks.push({
      id: makeId("evidence", msg.id),
      type: "EVIDENCE",
      label: "EVIDENCE · Cross-verified",
      meta: `score: ${evidenceScore}`,
      content: lines.join("\n"),
      collapsible: true,
      defaultCollapsed: false,
    });
  }

  // ── RISK block ─────────────────────────────────────────────────────────────
  const risks: any[] = answerObj?.risks ?? [];
  if (risks.length > 0) {
    const lines = risks.map((r: any) => {
      const desc = r.description ?? r.reason ?? "";
      const mag = r.magnitude ? ` [${r.magnitude.toUpperCase()}]` : "";
      return `• ${desc}${mag}`;
    });
    blocks.push({
      id: makeId("risk", msg.id),
      type: "RISK",
      label: `RISK · ${risks.length} identified`,
      content: lines.join("\n"),
      collapsible: true,
      defaultCollapsed: false,
    });
  }

  // ── SYNTHESIS block ────────────────────────────────────────────────────────
  if (answerObj && (answerObj.bull_case?.length > 0 || answerObj.bear_case?.length > 0)) {
    const lines: string[] = [];
    if (answerObj.verdict) lines.push(`Verdict: ${answerObj.verdict}\n`);
    if (answerObj.bull_case?.length > 0) {
      lines.push("Bull Case:");
      answerObj.bull_case.forEach((b: string) => lines.push(`  • ${b}`));
    }
    if (answerObj.bear_case?.length > 0) {
      lines.push("\nBear Case:");
      answerObj.bear_case.forEach((b: string) => lines.push(`  • ${b}`));
    }
    if (answerObj.next_steps?.length > 0) {
      lines.push("\nNext Steps:");
      answerObj.next_steps.forEach((s: string) => lines.push(`  • ${s}`));
    }
    blocks.push({
      id: makeId("synthesis", msg.id),
      type: "SYNTHESIS",
      label: "SYNTHESIS · Output",
      meta: answerObj.confidence ? `confidence: ${answerObj.confidence}` : undefined,
      content: lines.join("\n"),
      collapsible: true,
      defaultCollapsed: false,
    });
  }

  // ── FINAL block ────────────────────────────────────────────────────────────
  if (msg.content && msg.content.trim().length > 0) {
    blocks.push({
      id: makeId("final", msg.id),
      type: "FINAL",
      label: "FINAL · Output",
      meta: answerObj?.horizon ? `horizon: ${answerObj.horizon}` : undefined,
      content: msg.content,
      collapsible: true,
      defaultCollapsed: false,
    });
  }

  return blocks;
}

// ── Execution Stream ──────────────────────────────────────────────────────────
/**
 * Renders an ordered list of ExecutionBlocks with 12px spacing.
 */
export function ExecutionStream({ blocks }: { blocks: ExecutionBlockData[] }) {
  return (
    <div className="flex flex-col" style={{ gap: "12px" }}>
      {blocks.map(block => (
        <ExecutionBlock key={block.id} block={block} />
      ))}
    </div>
  );
}

// ── Strategy Module ───────────────────────────────────────────────────────────
/**
 * Sticky bottom overlay showing the most important strategic decision.
 * Extracted from answerObject (verdict + bull_case reasons + action hints).
 */
interface StrategyModuleProps {
  answerObject?: Record<string, any> | null;
  discussionObject?: Record<string, any> | null;
  onDismiss?: () => void;
}

export function StrategyModule({ answerObject, discussionObject, onDismiss }: StrategyModuleProps) {
  const [dismissed, setDismissed] = useState(false);

  const verdict = answerObject?.verdict;
  const confidence = answerObject?.confidence;
  const horizon = answerObject?.horizon;
  const bullReasons = (answerObject?.bull_case ?? []).slice(0, 3) as string[];
  const bearReasons = (answerObject?.bear_case ?? []).slice(0, 2) as string[];
  const nextSteps = (answerObject?.next_steps ?? []).slice(0, 2) as string[];
  const risks = (answerObject?.risks ?? []).slice(0, 1) as any[];

  // Derive position / sizing / timing from verdict + confidence
  const isBullish = verdict && /买|增持|BUY|LONG|bullish/i.test(verdict);
  const isBearish = verdict && /卖|减持|SELL|SHORT|bearish/i.test(verdict);
  const position = isBullish ? "LONG" : isBearish ? "SHORT" : "NEUTRAL";
  const sizing = confidence === "high" ? "MEDIUM–LARGE" : confidence === "medium" ? "SMALL–MEDIUM" : "MINIMAL";
  const timing = horizon === "short-term" ? "NEAR-TERM" : horizon === "long-term" ? "LONG-TERM" : "MID-TERM";

  if (!verdict || dismissed) return null;

  return (
    <div
      className="mx-3 mb-3 rounded-xl overflow-hidden"
      style={{
        background: "#1b2130",
        border: "1px solid #2a3245",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ borderBottom: "1px solid #232937" }}
      >
        <div className="flex items-center gap-2">
          <span
            className="text-[9px] font-mono font-bold uppercase tracking-widest"
            style={{ color: "#3b6ef5" }}
          >
            CORE STRATEGY
          </span>
          {confidence && (
            <span
              className="text-[9px] font-mono px-1.5 py-0.5 rounded"
              style={{
                background: "rgba(59,110,245,0.1)",
                color: "#3b6ef5",
                border: "1px solid rgba(59,110,245,0.2)",
              }}
            >
              {confidence.toUpperCase()}
            </span>
          )}
        </div>
        <button
          onClick={() => { setDismissed(true); onDismiss?.(); }}
          className="text-[10px] font-mono transition-colors"
          style={{ color: "#3a4050" }}
        >
          ✕
        </button>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Position / Sizing / Timing row */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "POSITION", value: position },
            { label: "SIZING", value: sizing },
            { label: "TIMING", value: timing },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-lg px-3 py-2 text-center"
              style={{ background: "#161a21", border: "1px solid #232937" }}
            >
              <div className="text-[9px] font-mono uppercase tracking-widest mb-1" style={{ color: "#4a5568" }}>
                {label}
              </div>
              <div
                className="text-sm font-mono font-bold"
                style={{
                  color: label === "POSITION"
                    ? (position === "LONG" ? "#16a34a" : position === "SHORT" ? "#dc2626" : "#9aa4b2")
                    : "#e6e8eb",
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* WHY — bull reasons */}
        {bullReasons.length > 0 && (
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest mb-1.5" style={{ color: "#4a5568" }}>
              WHY
            </div>
            <div className="space-y-1">
              {bullReasons.map((r, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-[10px] mt-0.5 shrink-0" style={{ color: "#16a34a" }}>•</span>
                  <span className="text-[12px] leading-relaxed" style={{ color: "#c8cdd6" }}>{r}</span>
                </div>
              ))}
              {bearReasons.map((r, i) => (
                <div key={`bear-${i}`} className="flex items-start gap-2">
                  <span className="text-[10px] mt-0.5 shrink-0" style={{ color: "#dc2626" }}>•</span>
                  <span className="text-[12px] leading-relaxed" style={{ color: "#c8cdd6" }}>{r}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* OPTIONAL — next steps + hedge */}
        {(nextSteps.length > 0 || risks.length > 0) && (
          <div style={{ borderTop: "1px solid #1e2330", paddingTop: "8px" }}>
            <div className="text-[9px] font-mono uppercase tracking-widest mb-1.5" style={{ color: "#4a5568" }}>
              OPTIONAL
            </div>
            <div className="space-y-1">
              {nextSteps.map((s, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-[10px] mt-0.5 shrink-0" style={{ color: "#3b6ef5" }}>→</span>
                  <span className="text-[12px] leading-relaxed" style={{ color: "#9aa4b2" }}>{s}</span>
                </div>
              ))}
              {risks.map((r: any, i: number) => (
                <div key={`risk-${i}`} className="flex items-start gap-2">
                  <span className="text-[10px] mt-0.5 shrink-0" style={{ color: "#dc2626" }}>⚠</span>
                  <span className="text-[12px] leading-relaxed" style={{ color: "#9aa4b2" }}>
                    Hedge: {r.description ?? r.reason ?? ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Typing indicator block ────────────────────────────────────────────────────

export function TypingBlock() {
  return (
    <div
      className="rounded-lg px-3.5 py-3 flex items-center gap-2"
      style={{
        background: "#161a21",
        border: "1px solid #232937",
        borderLeft: "2px solid rgba(59,110,245,0.3)",
      }}
    >
      <div className="flex gap-1">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full animate-bounce"
            style={{ background: "#3b6ef5", animationDelay: `${i * 0.15}s`, opacity: 0.7 }}
          />
        ))}
      </div>
      <span className="text-[11px] font-mono" style={{ color: "#4a5568" }}>
        PROCESSING PIPELINE…
      </span>
    </div>
  );
}

export default ExecutionBlock;
