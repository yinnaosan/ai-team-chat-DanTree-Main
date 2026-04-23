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

// ── Extended technical signals with real numeric values ─────────────────────

export interface Level4RealTechnicalData {
  // RSI
  rsi14: number | null;          // latest RSI(14) value
  // MACD
  macdLine: number | null;       // latest MACD line value
  macdSignalLine: number | null; // latest MACD signal line value
  macdHistogram: number | null;  // macdLine - macdSignalLine
  // Moving Averages
  ema20: number | null;
  ema50: number | null;
  sma200: number | null;
  currentPrice: number | null;
  // Bollinger Bands
  bbUpper: number | null;
  bbMiddle: number | null;
  bbLower: number | null;
  // Volume
  latestVolume: number | null;
  avgVolume20: number | null;    // 20-day average volume
  volumeRatio: number | null;    // latestVolume / avgVolume20
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
  // Real numeric indicator data from localIndicators.ts (preferred over technicalSignals)
  realTechnicalData?: Level4RealTechnicalData | null;
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

CORE RULE: WHY decides direction. TIMING decides entry/exit timing. Volume confirms or weakens timing signal.
No single indicator can dominate the final timing decision.

STATE DECISION RULES:
- BUY: strong thesis + early/mid cycle + TIMING = STRONG ENTRY or BUILD ENTRY
- HOLD: good asset already held, no compelling exit, timing not ideal for new entry
- SELL: deteriorating thesis + late/decline cycle + TIMING = EXIT RISK
- WAIT: strong thesis but TIMING = EXTENDED or WAIT (overbought, unclear momentum)
- SELECT: asset worth monitoring but thesis not yet confirmed

TIMING SIGNAL RULES (MUST use combination of all 5, never single indicator):
- STRONG ENTRY: strong thesis + RSI not overbought (<65) + MACD bullish cross or positive histogram + price above EMA20 + volume ratio > 1.0 (confirming)
- BUILD ENTRY: decent thesis + RSI neutral-low (40-60) + MACD turning bullish + price near EMA20 support + volume neutral
- WAIT: strong thesis BUT RSI neutral (50-65) + no clear MACD direction + price between MAs + volume ambiguous
- EXTENDED: RSI overbought (>70) + price at or above Bollinger upper band + MACD histogram declining + volume diverging (price up, volume down)
- EXIT RISK: RSI overbought (>72) + MACD bearish cross (line below signal) + price at Bollinger upper + volume divergence (distribution pattern)

VOLUME CONFIRMATION RULES:
- volumeRatio > 1.3: strong confirmation — upgrades WAIT to BUILD ENTRY, upgrades BUILD ENTRY to STRONG ENTRY
- volumeRatio 0.8-1.3: neutral — no change to base signal
- volumeRatio < 0.8: divergence — downgrades STRONG ENTRY to BUILD ENTRY, downgrades BUILD ENTRY to WAIT

PRIORITY ORDER when signals conflict: WHY (fundamental) > CYCLE > TIMING > ACTION
If timing data is incomplete, use best-effort classification and note uncertainty in interpretation fields.

Output ONLY valid JSON matching the provided schema. No markdown, no explanation outside JSON.
CRITICAL OUTPUT FORMAT RULES:
- ALL JSON keys MUST use camelCase (e.g., timingSignal, timingIndicators, movingAverage)
- NEVER use snake_case keys (e.g., timing_signal, timing_indicators are WRONG)
- The "why" object is REQUIRED and MUST contain exactly: surface, trend, hidden (all non-empty strings)
- Do NOT omit "why". Do NOT rename it to reason, rationale, analysis, or explanation.
- The action state field MUST be named "state", NOT "verdict", "decision", "action_state", or any other name.`;
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

  // Real technical data (preferred — numeric values from localIndicators.ts)
  const rtd = input.realTechnicalData;
  if (rtd) {
    lines.push(`\nTECHNICAL DATA (real numeric values):`);
    // RSI
    if (rtd.rsi14 != null) {
      const rsiState = rtd.rsi14 > 72 ? "OVERBOUGHT" : rtd.rsi14 > 65 ? "elevated" : rtd.rsi14 < 30 ? "OVERSOLD" : rtd.rsi14 < 45 ? "low-neutral" : "neutral";
      lines.push(`  RSI(14): ${rtd.rsi14.toFixed(1)} [${rsiState}]`);
    }
    // MACD
    if (rtd.macdLine != null && rtd.macdSignalLine != null) {
      const hist = rtd.macdHistogram ?? (rtd.macdLine - rtd.macdSignalLine);
      const macdDir = rtd.macdLine > rtd.macdSignalLine ? "bullish" : "bearish";
      lines.push(`  MACD: line=${rtd.macdLine.toFixed(4)}, signal=${rtd.macdSignalLine.toFixed(4)}, histogram=${hist.toFixed(4)} [${macdDir}]`);
    }
    // Moving Averages
    if (rtd.currentPrice != null) {
      const maLines: string[] = [];
      if (rtd.ema20 != null) maLines.push(`EMA20=${rtd.ema20.toFixed(2)} (price ${rtd.currentPrice > rtd.ema20 ? "above" : "below"})`);
      if (rtd.ema50 != null) maLines.push(`EMA50=${rtd.ema50.toFixed(2)} (price ${rtd.currentPrice > rtd.ema50 ? "above" : "below"})`);
      if (rtd.sma200 != null) maLines.push(`SMA200=${rtd.sma200.toFixed(2)} (price ${rtd.currentPrice > rtd.sma200 ? "above" : "below"})`);
      if (maLines.length > 0) lines.push(`  MA: price=${rtd.currentPrice.toFixed(2)}, ${maLines.join(", ")}`);
    }
    // Bollinger Bands
    if (rtd.bbUpper != null && rtd.bbLower != null && rtd.currentPrice != null) {
      const bbRange = rtd.bbUpper - rtd.bbLower;
      const bbPct = bbRange > 0 ? ((rtd.currentPrice - rtd.bbLower) / bbRange * 100).toFixed(1) : "N/A";
      const bbPos = rtd.currentPrice >= rtd.bbUpper ? "at/above upper" : rtd.currentPrice <= rtd.bbLower ? "at/below lower" : "mid-band";
      lines.push(`  Boll: upper=${rtd.bbUpper.toFixed(2)}, mid=${rtd.bbMiddle?.toFixed(2) ?? "N/A"}, lower=${rtd.bbLower.toFixed(2)}, price_pct=${bbPct}% [${bbPos}]`);
    }
    // Volume
    if (rtd.volumeRatio != null) {
      const volState = rtd.volumeRatio > 1.3 ? "CONFIRMING (strong)" : rtd.volumeRatio > 0.8 ? "neutral" : "DIVERGING (weak)";
      lines.push(`  Volume: ratio=${rtd.volumeRatio.toFixed(2)}x avg [${volState}]${rtd.latestVolume != null ? `, latest=${(rtd.latestVolume / 1e6).toFixed(1)}M` : ""}`);
    }
  } else {
    // Fallback to legacy technicalSignals if realTechnicalData not available
    const ts = input.technicalSignals;
    if (ts) {
      lines.push(`\nTECHNICAL SIGNALS (partial):`);
      if (ts.rsi != null) lines.push(`  RSI: ${ts.rsi}`);
      if (ts.macdSignal) lines.push(`  MACD: ${ts.macdSignal}`);
      if (ts.bollingerPosition) lines.push(`  Bollinger: ${ts.bollingerPosition} band`);
      if (ts.maAbove != null) lines.push(`  Price vs MA: ${ts.maAbove ? "above" : "below"}`);
      if (ts.volumeConfirmation != null) lines.push(`  Volume: ${ts.volumeConfirmation ? "confirming" : "diverging"}`);
    } else {
      lines.push(`\nTECHNICAL DATA: Not available — use fundamental analysis only for timing estimate.`);
    }
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
    // Strip markdown code fences if present (Claude may wrap JSON in ```json...``` despite instructions)
    const stripped = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
    console.log(`[LEVEL4-DEBUG] ${input.ticker} raw(first200): ${stripped.slice(0, 200)}`);
    const rawParsed = JSON.parse(stripped) as Record<string, unknown>;
    // ── MOVE_L4N1: Narrow alias normalization (snake_case → camelCase, explicit safe set only) ──
    // Only normalize exact known field aliases. Never do broad recursive remapping.
    // Never convert a plain string into a structured why object.
    const aliasLog: string[] = [];
    // timing_signal → timingSignal (exact alias, unambiguous equivalence)
    if (rawParsed.timing_signal !== undefined && rawParsed.timingSignal === undefined) {
      rawParsed.timingSignal = rawParsed.timing_signal;
      aliasLog.push("timing_signal→timingSignal");
    }
    // timing_indicators → timingIndicators (exact alias)
    if (rawParsed.timing_indicators !== undefined && rawParsed.timingIndicators === undefined) {
      rawParsed.timingIndicators = rawParsed.timing_indicators;
      aliasLog.push("timing_indicators→timingIndicators");
    }
    // why alias: only accept if the alias value is a STRUCTURAL object with surface/trend/hidden
    // NEVER accept a plain string as why — hard gate must remain
    const WHY_ALIASES = ["rationale", "reason", "analysis", "explanation"] as const;
    if (rawParsed.why === undefined) {
      for (const alias of WHY_ALIASES) {
        const candidate = rawParsed[alias];
        if (
          candidate !== null &&
          typeof candidate === "object" &&
          !Array.isArray(candidate) &&
          typeof (candidate as Record<string, unknown>).surface === "string" &&
          typeof (candidate as Record<string, unknown>).trend === "string" &&
          typeof (candidate as Record<string, unknown>).hidden === "string"
        ) {
          rawParsed.why = candidate;
          aliasLog.push(`${alias}→why (structural object)`);
          break;
        }
        // Plain string: do NOT convert — hard gate will catch this
      }
    }
    if (aliasLog.length > 0) {
      console.log(`[LEVEL4] ${input.ticker} alias-normalized: ${aliasLog.join(", ")}`);
    }
    const parsed = rawParsed as Omit<Level4ActionResult, "ticker" | "generatedAt" | "sourceMetadata">;

      // ── Hard-required fields (throw → fallback if missing/invalid) ────────────
    const VALID_STATES: ActionState[] = ["SELECT", "WAIT", "BUY", "HOLD", "SELL"];
    // ── MOVE_L4N1b: verdict → state alias (narrow, enum-only) ──
    // Only map if: (1) state is missing, (2) verdict exists, (3) verdict is a valid VALID_STATES member
    // NEVER override an already-present state. NEVER map non-enum natural-language values.
    // Use rawParsed (Record<string, unknown>) to access non-schema fields safely.
    const parsedRec = parsed as Record<string, unknown>;
    if (!parsed.state && parsedRec.verdict !== undefined) {
      const v = String(parsedRec.verdict).trim().toUpperCase();
      if (VALID_STATES.includes(v as ActionState)) {
        parsedRec.state = v;
        console.log(`[LEVEL4] ${input.ticker} alias-normalized: verdict→state ('${v}')`);
      }
      // Non-enum value (e.g. "Bearish", "减持") → do NOT map → hard gate will catch
    }
    if (!parsed.state || !VALID_STATES.includes(parsed.state as ActionState)) {
      throw new Error(`Missing or invalid: state='${parsed.state}'`);
    }
    const why = parsed.why as Level4WhyLayer | undefined;
    if (!why?.surface || !why?.trend || !why?.hidden) {
      throw new Error(`Missing or incomplete: why (needs surface/trend/hidden)`);
    }
    // ── Soft-required fields (normalize with conservative defaults, log if changed) ─
    const VALID_CYCLES: CyclePhase[] = ["Early", "Mid", "Late", "Decline"];
    const VALID_TIMING_SIGNALS: TimingSignal[] = ["STRONG ENTRY", "BUILD ENTRY", "WAIT", "EXTENDED", "EXIT RISK"];
    const safeCycle: CyclePhase = VALID_CYCLES.includes(parsed.cycle as CyclePhase) ? (parsed.cycle as CyclePhase) : "Mid";
    const safeTimingSignal: TimingSignal = VALID_TIMING_SIGNALS.includes(parsed.timingSignal as TimingSignal) ? (parsed.timingSignal as TimingSignal) : "WAIT";
    const safeAction: Level4ActionBlock = (parsed.action as Level4ActionBlock)?.entry ? (parsed.action as Level4ActionBlock) : { entry: "Pullback", sizing: "Small", execution: "Wait" };
    const safeRisks: string[] = (Array.isArray(parsed.risks) && parsed.risks.length > 0) ? (parsed.risks as string[]) : [];
    // Log normalized soft fields only when normalization actually fired
    const normalizedFields: string[] = [];
    if (safeCycle !== parsed.cycle) normalizedFields.push(`cycle→"${safeCycle}"`);
    if (safeTimingSignal !== parsed.timingSignal) normalizedFields.push(`timingSignal→"${safeTimingSignal}"`);
    if (safeAction !== parsed.action) normalizedFields.push(`action→{Pullback,Small,Wait}`);
    if (normalizedFields.length > 0) {
      console.log(`[LEVEL4] ${input.ticker} soft-defaulted: ${normalizedFields.join(", ")}`);
    }
    console.log(`[LEVEL4] ${input.ticker} → STATE:${parsed.state} TIMING:${safeTimingSignal} (${Date.now() - startMs}ms)`);
    return {
      ticker: input.ticker,
      ...parsed,
      cycle: safeCycle,
      timingSignal: safeTimingSignal,
      action: safeAction,
      risks: safeRisks,
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
