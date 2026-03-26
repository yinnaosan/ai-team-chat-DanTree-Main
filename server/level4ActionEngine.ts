/**
 * LEVEL4 Action Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Transforms existing analysis outputs into actionable investment decisions.
 * Answers: Should I act? When? How?
 *
 * INPUT:  FinalOutputSchema + technical signals + evidence metadata
 * OUTPUT: Level4ActionResult (STATE / WHY / CYCLE / TIMING / ACTION / RISK)
 *
 * RULE: DO NOT modify any existing engine. This is a pure output-transformation layer.
 */

import { invokeLLM } from "./_core/llm.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActionState = "SELECT" | "WAIT" | "BUY" | "HOLD" | "SELL";
export type CyclePhase = "Early" | "Mid" | "Late" | "Decline";
export type TimingSignal = "STRONG ENTRY" | "BUILD ENTRY" | "WAIT" | "EXTENDED" | "EXIT RISK";
export type EntryType = "Now" | "Pullback" | "Gradual";
export type SizingType = "Small" | "Medium" | "Large";
export type ExecutionType = "Buy" | "Wait" | "Reduce" | "Exit";

export interface Level4WhyLayer {
  surface: string;   // what is happening
  trend: string;     // what is changing
  hidden: string;    // what is actually going on
}

export interface Level4TimingIndicators {
  rsi: { value: number | null; interpretation: string };
  macd: { direction: "bullish" | "bearish" | "neutral"; note: string };
  movingAverage: { position: "above" | "below" | "at"; levels: string };
  bollinger: { position: "upper" | "mid" | "lower"; note: string };
  volume: { signal: "confirmation" | "divergence" | "neutral"; note: string };
}

export interface Level4ActionBlock {
  entry: EntryType;
  sizing: SizingType;
  execution: ExecutionType;
}

export interface Level4ActionResult {
  ticker: string;
  state: ActionState;
  why: Level4WhyLayer;
  cycle: CyclePhase;
  timingIndicators: Level4TimingIndicators;
  timingSignal: TimingSignal;
  action: Level4ActionBlock;
  risks: string[];           // 2–4 items
  generatedAt: number;       // UTC ms
  sourceMetadata: {
    evidenceScore: number | null;
    outputMode: string | null;
    verdict: string | null;
    confidence: string | null;
  };
}

// ── Input shape (extracted from message metadata) ─────────────────────────────

export interface Level4Input {
  ticker: string;
  // From FinalOutputSchema / answerObject
  verdict?: string | null;
  confidence?: string | null;
  horizon?: string | null;
  bullCase?: string[];
  bearCase?: string[];
  reasoning?: string[];
  risks?: Array<{ description?: string; reason?: string; magnitude?: string }>;
  discussion?: {
    key_uncertainty?: string;
    weakest_point?: string;
    alternative_view?: string;
  };
  // From evidence metadata
  evidenceScore?: number | null;
  outputMode?: string | null;
  // From technical signals (localIndicators / alphaVantage)
  technicalSignals?: {
    rsi?: number | null;
    macdSignal?: "bullish" | "bearish" | "neutral" | null;
    bollingerPosition?: "upper" | "mid" | "lower" | null;
    maAbove?: boolean | null;
    volumeConfirmation?: boolean | null;
  } | null;
}

// ── JSON Schema for LLM structured output ────────────────────────────────────

const LEVEL4_JSON_SCHEMA = {
  type: "object",
  properties: {
    state: {
      type: "string",
      enum: ["SELECT", "WAIT", "BUY", "HOLD", "SELL"],
      description: "Primary action state for this asset",
    },
    why: {
      type: "object",
      properties: {
        surface: { type: "string", description: "What is happening right now (1-2 sentences)" },
        trend: { type: "string", description: "What is changing directionally (1-2 sentences)" },
        hidden: { type: "string", description: "The underlying driver most people miss (1-2 sentences)" },
      },
      required: ["surface", "trend", "hidden"],
      additionalProperties: false,
    },
    cycle: {
      type: "string",
      enum: ["Early", "Mid", "Late", "Decline"],
      description: "Current business/market cycle phase for this asset",
    },
    timingIndicators: {
      type: "object",
      properties: {
        rsi: {
          type: "object",
          properties: {
            value: { type: ["number", "null"] },
            interpretation: { type: "string" },
          },
          required: ["value", "interpretation"],
          additionalProperties: false,
        },
        macd: {
          type: "object",
          properties: {
            direction: { type: "string", enum: ["bullish", "bearish", "neutral"] },
            note: { type: "string" },
          },
          required: ["direction", "note"],
          additionalProperties: false,
        },
        movingAverage: {
          type: "object",
          properties: {
            position: { type: "string", enum: ["above", "below", "at"] },
            levels: { type: "string" },
          },
          required: ["position", "levels"],
          additionalProperties: false,
        },
        bollinger: {
          type: "object",
          properties: {
            position: { type: "string", enum: ["upper", "mid", "lower"] },
            note: { type: "string" },
          },
          required: ["position", "note"],
          additionalProperties: false,
        },
        volume: {
          type: "object",
          properties: {
            signal: { type: "string", enum: ["confirmation", "divergence", "neutral"] },
            note: { type: "string" },
          },
          required: ["signal", "note"],
          additionalProperties: false,
        },
      },
      required: ["rsi", "macd", "movingAverage", "bollinger", "volume"],
      additionalProperties: false,
    },
    timingSignal: {
      type: "string",
      enum: ["STRONG ENTRY", "BUILD ENTRY", "WAIT", "EXTENDED", "EXIT RISK"],
      description: "Composite timing signal derived from all technical indicators",
    },
    action: {
      type: "object",
      properties: {
        entry: { type: "string", enum: ["Now", "Pullback", "Gradual"] },
        sizing: { type: "string", enum: ["Small", "Medium", "Large"] },
        execution: { type: "string", enum: ["Buy", "Wait", "Reduce", "Exit"] },
      },
      required: ["entry", "sizing", "execution"],
      additionalProperties: false,
    },
    risks: {
      type: "array",
      items: { type: "string" },
      minItems: 2,
      maxItems: 4,
      description: "2-4 key risks, each a concise sentence",
    },
  },
  required: ["state", "why", "cycle", "timingIndicators", "timingSignal", "action", "risks"],
  additionalProperties: false,
};

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are LEVEL4 Action Engine — an investment decision layer that transforms analysis into actionable decisions.

Your job is to answer THREE questions for the given asset:
1. Should I act? → STATE
2. When should I act? → TIMING SIGNAL
3. How should I act? → ACTION

STATE DECISION RULES:
- BUY: strong trend + positive hidden logic + early/mid cycle + good timing
- HOLD: good asset, already positioned, no compelling exit signal
- SELL: overextended + weak momentum + late/decline cycle
- WAIT: good asset but bad timing (overbought, extended, unclear cycle)
- SELECT: asset worth monitoring but not yet ready to act

TIMING SIGNAL RULES (use combination, never single indicator):
- STRONG ENTRY: RSI oversold + MACD bullish + price above MA + volume confirmation
- BUILD ENTRY: RSI neutral-low + MACD turning + price near support
- WAIT: RSI neutral + no clear momentum direction
- EXTENDED: RSI overbought (>70) + price at Bollinger upper + volume divergence
- EXIT RISK: RSI overbought + MACD bearish cross + volume divergence

PRIORITY ORDER when signals conflict: WHY (fundamental) > CYCLE > TIMING > ACTION

Output ONLY valid JSON matching the provided schema. No markdown, no explanation outside JSON.`;
}

// ── Build user prompt from input ──────────────────────────────────────────────

function buildUserPrompt(input: Level4Input): string {
  const lines: string[] = [`ASSET: ${input.ticker}`];

  if (input.verdict) lines.push(`VERDICT: ${input.verdict}`);
  if (input.confidence) lines.push(`CONFIDENCE: ${input.confidence}`);
  if (input.horizon) lines.push(`HORIZON: ${input.horizon}`);
  if (input.outputMode) lines.push(`OUTPUT_MODE: ${input.outputMode}`);
  if (input.evidenceScore != null) lines.push(`EVIDENCE_SCORE: ${input.evidenceScore}/100`);

  if (input.bullCase?.length) {
    lines.push(`\nBULL CASE:\n${input.bullCase.map(b => `- ${b}`).join("\n")}`);
  }
  if (input.bearCase?.length) {
    lines.push(`\nBEAR CASE:\n${input.bearCase.map(b => `- ${b}`).join("\n")}`);
  }
  if (input.reasoning?.length) {
    lines.push(`\nREASONING:\n${input.reasoning.map(r => `- ${r}`).join("\n")}`);
  }
  if (input.risks?.length) {
    lines.push(`\nEXISTING RISKS:\n${input.risks.map(r => `- ${r.description ?? r.reason ?? ""}`).join("\n")}`);
  }
  if (input.discussion) {
    const d = input.discussion;
    lines.push(`\nDISCUSSION:`);
    if (d.key_uncertainty) lines.push(`  Key Uncertainty: ${d.key_uncertainty}`);
    if (d.weakest_point) lines.push(`  Weakest Point: ${d.weakest_point}`);
    if (d.alternative_view) lines.push(`  Alternative View: ${d.alternative_view}`);
  }

  // Technical signals
  const ts = input.technicalSignals;
  if (ts) {
    lines.push(`\nTECHNICAL SIGNALS:`);
    if (ts.rsi != null) lines.push(`  RSI: ${ts.rsi}`);
    if (ts.macdSignal) lines.push(`  MACD: ${ts.macdSignal}`);
    if (ts.bollingerPosition) lines.push(`  Bollinger: ${ts.bollingerPosition} band`);
    if (ts.maAbove != null) lines.push(`  Price vs MA: ${ts.maAbove ? "above" : "below"}`);
    if (ts.volumeConfirmation != null) lines.push(`  Volume: ${ts.volumeConfirmation ? "confirming" : "diverging"}`);
  }

  lines.push(`\nGenerate the LEVEL4 action decision JSON now.`);
  return lines.join("\n");
}

// ── Fallback output when LLM fails ────────────────────────────────────────────

function buildFallback(input: Level4Input): Level4ActionResult {
  return {
    ticker: input.ticker,
    state: "WAIT",
    why: {
      surface: "Insufficient data to determine current market state.",
      trend: "No clear directional trend identified from available signals.",
      hidden: "Analysis requires more data before a confident decision can be made.",
    },
    cycle: "Mid",
    timingIndicators: {
      rsi: { value: input.technicalSignals?.rsi ?? null, interpretation: "Neutral — no overbought/oversold signal" },
      macd: { direction: "neutral", note: "No clear momentum shift detected" },
      movingAverage: { position: "at", levels: "Price near key moving average levels" },
      bollinger: { position: "mid", note: "Price within normal range" },
      volume: { signal: "neutral", note: "No volume confirmation or divergence" },
    },
    timingSignal: "WAIT",
    action: { entry: "Pullback", sizing: "Small", execution: "Wait" },
    risks: [
      "Insufficient evidence to make a high-confidence decision.",
      "Market conditions may change rapidly — reassess after next data update.",
    ],
    generatedAt: Date.now(),
    sourceMetadata: {
      evidenceScore: input.evidenceScore ?? null,
      outputMode: input.outputMode ?? null,
      verdict: input.verdict ?? null,
      confidence: input.confidence ?? null,
    },
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runLevel4ActionEngine(input: Level4Input): Promise<Level4ActionResult> {
  const startMs = Date.now();

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system" as const, content: buildSystemPrompt() },
        { role: "user" as const, content: buildUserPrompt(input) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "level4_action_result",
          strict: true,
          schema: LEVEL4_JSON_SCHEMA,
        },
      },
    });

     const rawContent = response?.choices?.[0]?.message?.content;
    if (!rawContent) throw new Error("Empty LLM response");
    const raw = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
    const parsed = JSON.parse(raw) as Omit<Level4ActionResult, "ticker" | "generatedAt" | "sourceMetadata">;

    // Validate required fields
    if (!parsed.state || !parsed.why || !parsed.cycle || !parsed.timingSignal || !parsed.action) {
      throw new Error("Missing required fields in LLM response");
    }

    console.log(`[LEVEL4] ${input.ticker} → STATE:${parsed.state} TIMING:${parsed.timingSignal} (${Date.now() - startMs}ms)`);

    return {
      ticker: input.ticker,
      ...parsed,
      generatedAt: Date.now(),
      sourceMetadata: {
        evidenceScore: input.evidenceScore ?? null,
        outputMode: input.outputMode ?? null,
        verdict: input.verdict ?? null,
        confidence: input.confidence ?? null,
      },
    };
  } catch (err) {
    console.warn(`[LEVEL4] ${input.ticker} fallback:`, err instanceof Error ? err.message : err);
    return buildFallback(input);
  }
}

/**
 * Extract Level4Input from message metadata (existing system output)
 * This bridges the existing analysis output into LEVEL4 input format.
 */
export function extractLevel4Input(
  ticker: string,
  metadata: Record<string, unknown>,
): Level4Input {
  // Try answerObject first (JSON-only path), then level1a3Output
  const ao = (metadata?.answerObject ?? metadata?.level1a3Output) as Record<string, unknown> | null | undefined;

  // Extract technical signals from metadata
  const techRaw = metadata?.technicalSignals as Record<string, unknown> | null | undefined;
  const alphaRaw = metadata?.alphaFactors as Record<string, unknown> | null | undefined;

  let technicalSignals: Level4Input["technicalSignals"] = null;

  if (techRaw || alphaRaw) {
    // Try to extract RSI from various possible locations
    const rsiVal =
      (techRaw?.rsi as number | null | undefined) ??
      (alphaRaw?.rsi as number | null | undefined) ??
      null;

    const macdSignalRaw =
      (techRaw?.macdSignal as string | null | undefined) ??
      (techRaw?.macd_signal as string | null | undefined) ??
      null;

    const macdSignal: "bullish" | "bearish" | "neutral" | null =
      macdSignalRaw === "bullish" || macdSignalRaw === "bearish" || macdSignalRaw === "neutral"
        ? macdSignalRaw
        : null;

    const bollingerRaw = (techRaw?.bollingerPosition ?? techRaw?.bollinger_position) as string | null | undefined;
    const bollingerPosition: "upper" | "mid" | "lower" | null =
      bollingerRaw === "upper" || bollingerRaw === "mid" || bollingerRaw === "lower"
        ? bollingerRaw
        : null;

    const maAbove = (techRaw?.priceAboveMA ?? techRaw?.price_above_ma) as boolean | null | undefined;
    const volumeConf = (techRaw?.volumeConfirmation ?? techRaw?.volume_confirmation) as boolean | null | undefined;

    technicalSignals = {
      rsi: typeof rsiVal === "number" ? rsiVal : null,
      macdSignal: macdSignal,
      bollingerPosition: bollingerPosition,
      maAbove: typeof maAbove === "boolean" ? maAbove : null,
      volumeConfirmation: typeof volumeConf === "boolean" ? volumeConf : null,
    };
  }

  // Extract risks from answerObject
  const rawRisks = ao?.risks as Array<Record<string, unknown>> | string[] | null | undefined;
  const risks = Array.isArray(rawRisks)
    ? rawRisks.map(r =>
        typeof r === "string"
          ? { description: r }
          : { description: r?.description as string, reason: r?.reason as string, magnitude: r?.magnitude as string }
      )
    : undefined;

  return {
    ticker,
    verdict: ao?.verdict as string | null | undefined,
    confidence: ao?.confidence as string | null | undefined,
    horizon: ao?.horizon as string | null | undefined,
    bullCase: ao?.bull_case as string[] | undefined,
    bearCase: ao?.bear_case as string[] | undefined,
    reasoning: ao?.reasoning as string[] | undefined,
    risks,
    discussion: ao?.discussion as Level4Input["discussion"],
    evidenceScore: metadata?.evidenceScore as number | null | undefined,
    outputMode: metadata?.outputMode as string | null | undefined,
    technicalSignals,
  };
}
