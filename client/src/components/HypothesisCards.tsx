/**
 * LEVEL3_PREP: Multi-Hypothesis Frontend Cards
 * Renders open_hypotheses from LEVEL1A3 structured output as clickable cards.
 * Each card is a testable hypothesis that can be sent as a follow-up query.
 * MODULE_ID: LEVEL3_PREP_HYPOTHESIS_CARDS
 */

import { useState } from "react";
import { FlaskConical, ChevronRight, ChevronDown, Lightbulb } from "lucide-react";

interface HypothesisCardsProps {
  hypotheses: string[];
  onFollowup?: (hypothesis: string) => void;
  ticker?: string;
}

export function HypothesisCards({ hypotheses, onFollowup, ticker }: HypothesisCardsProps) {
  const [expanded, setExpanded] = useState(false);

  if (!hypotheses || hypotheses.length === 0) return null;

  // Show first 2 by default, rest behind expand
  const visibleHypotheses = expanded ? hypotheses : hypotheses.slice(0, 2);
  const hasMore = hypotheses.length > 2;

  return (
    <div className="mt-2 mb-3 rounded-xl overflow-hidden"
      style={{
        background: "oklch(0.14 0.025 290 / 0.6)",
        border: "1px solid oklch(0.65 0.18 290 / 0.25)",
        boxShadow: "0 2px 12px oklch(0 0 0 / 0.25)",
      }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5"
        style={{
          background: "oklch(0.65 0.18 290 / 0.08)",
          borderBottom: "1px solid oklch(0.65 0.18 290 / 0.15)",
        }}>
        <div className="flex items-center gap-2">
          <FlaskConical className="w-3.5 h-3.5" style={{ color: "oklch(0.65 0.18 290)" }} />
          <span className="text-[10px] font-bold tracking-widest uppercase"
            style={{ color: "oklch(0.65 0.18 290)", fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.1em" }}>
            OPEN HYPOTHESES
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono"
            style={{ background: "oklch(0.65 0.18 290 / 0.15)", color: "oklch(0.65 0.18 290)" }}>
            {hypotheses.length}
          </span>
        </div>
        <span className="text-[10px] opacity-40">
          {onFollowup ? "点击卡片发起验证" : "待验证假设"}
        </span>
      </div>

      {/* Hypothesis Cards */}
      <div className="px-3 py-2.5 flex flex-col gap-2">
        {visibleHypotheses.map((hyp, i) => (
          <HypothesisCard
            key={i}
            index={i}
            hypothesis={hyp}
            ticker={ticker}
            onFollowup={onFollowup}
          />
        ))}

        {/* Expand / Collapse */}
        {hasMore && (
          <button
            className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg w-fit transition-all hover:opacity-80"
            style={{ color: "oklch(0.65 0.18 290)", background: "oklch(0.65 0.18 290 / 0.08)" }}
            onClick={() => setExpanded(v => !v)}
          >
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {expanded ? "收起" : `展开全部 ${hypotheses.length} 个假设`}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Single Hypothesis Card ────────────────────────────────────────────────────
function HypothesisCard({ index, hypothesis, ticker, onFollowup }: {
  index: number;
  hypothesis: string;
  ticker?: string;
  onFollowup?: (q: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  // Build a structured follow-up query from the hypothesis
  const buildFollowUpQuery = () => {
    const tickerPrefix = ticker ? `[${ticker}] ` : "";
    return `${tickerPrefix}验证以下假设：${hypothesis}`;
  };

  const handleClick = () => {
    if (onFollowup) {
      onFollowup(buildFollowUpQuery());
    }
  };

  // Assign different accent colors to hypotheses for visual distinction
  const accentColors = [
    "oklch(0.65 0.18 290)",  // purple
    "oklch(0.72 0.18 35)",   // amber
    "oklch(0.65 0.18 145)",  // green
    "oklch(0.72 0.18 250)",  // blue
    "oklch(0.65 0.18 25)",   // red
  ];
  const accent = accentColors[index % accentColors.length];

  return (
    <button
      className="flex items-start gap-3 text-left rounded-lg px-3 py-2.5 transition-all w-full"
      style={{
        background: hovered && onFollowup
          ? `${accent.replace(")", " / 0.08)")}`
          : "oklch(0.18 0.01 290 / 0.4)",
        border: `1px solid ${accent.replace(")", " / 0.2)")}`,
        cursor: onFollowup ? "pointer" : "default",
        transform: hovered && onFollowup ? "translateX(2px)" : "none",
        transition: "all 0.15s ease",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
      disabled={!onFollowup}
    >
      {/* Index Badge */}
      <div className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold font-mono mt-0.5"
        style={{ background: `${accent.replace(")", " / 0.15)")}`, color: accent }}>
        H{index + 1}
      </div>

      {/* Hypothesis Text */}
      <div className="flex-1 min-w-0">
        <p className="text-xs leading-relaxed" style={{ color: "oklch(0.82 0 0)" }}>
          {hypothesis}
        </p>
        {onFollowup && (
          <p className="text-[10px] mt-1 opacity-40 flex items-center gap-1">
            <Lightbulb className="w-2.5 h-2.5" />
            点击发起假设验证
          </p>
        )}
      </div>

      {/* Arrow */}
      {onFollowup && (
        <ChevronRight
          className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 transition-transform"
          style={{
            color: accent,
            opacity: hovered ? 0.8 : 0.3,
            transform: hovered ? "translateX(2px)" : "none",
          }}
        />
      )}
    </button>
  );
}
