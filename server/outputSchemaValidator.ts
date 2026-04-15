/**
 * LEVEL1A3: Output Schema Validator
 * MISSION: Enforce strict JSON schema on all DanTree outputs.
 * RULE: STRUCTURE FIRST → GPT FILLS → SYSTEM VALIDATES → THEN RENDER
 */

// ── FINAL_OUTPUT_SCHEMA ───────────────────────────────────────────────────────

export interface RiskItem {
  description: string;
  reason: string;
  magnitude: "high" | "medium" | "low";
}

export interface FinalOutputSchema {
  verdict: string;
  confidence: "high" | "medium" | "low";
  horizon: "short-term" | "mid-term" | "long-term";
  bull_case: string[];
  reasoning: string[];
  bear_case: string[];
  risks: RiskItem[];
  next_steps: string[];
  discussion: {
    key_uncertainty: string;
    weakest_point: string;
    alternative_view: string;
    follow_up_questions: string[];
    exploration_paths: string[];
    open_hypotheses: string[];
  };
  // Degraded fallback marker — present only when output is a safe fallback, not real analysis
  degraded?: boolean;
  degraded_reason?: string;
}

// ── SAFE FALLBACK OUTPUT ──────────────────────────────────────────────────────

export function buildSafeFallbackOutput(
  ticker: string,
  outputMode: string,
  evidenceScore: number,
  degradedReason = "output_validation_failed"
): FinalOutputSchema {
  const modeLabel =
    outputMode === "decisive"
      ? "当前证据充分，但结构化输出生成失败"
      : outputMode === "directional"
        ? "当前为方向性判断模式，结构化输出生成失败"
        : "当前证据不足，仅输出研究框架";

  return {
    verdict: `[${ticker || "标的"}] ${modeLabel}。请重新提交分析请求。`,
    confidence: "low",
    horizon: "mid-term",
    bull_case: ["数据收集完成，请重新分析以获取完整看多论点"],
    reasoning: ["系统验证层检测到输出格式异常，已启用安全兜底模式"],
    bear_case: [
      "结构化输出失败，无法提供完整看空论点",
      "建议补充数据后重新分析",
      "当前证据强度：" + evidenceScore + "/100",
    ],
    risks: [
      {
        description: "输出质量风险",
        reason: "本次分析的结构化输出未通过验证层检查，可能存在数据不完整或格式异常。建议重新提交分析请求。",
        magnitude: "high",
      },
    ],
    next_steps: ["重新提交分析请求", "检查数据源可用性"],
    // Degraded fallback marker — this is NOT a real analysis result
    degraded: true,
    degraded_reason: degradedReason,
    discussion: {
      key_uncertainty: "当前分析输出未能通过结构验证，无法确定核心不确定性",
      weakest_point: "结构化输出生成失败是本次分析最薄弱的环节",
      alternative_view: "建议从不同角度重新提交分析请求以获取完整结论",
      follow_up_questions: [
        "请重新提交分析请求以获取完整的结构化输出",
        "是否需要补充特定数据源？",
      ],
      exploration_paths: ["重新分析", "补充数据后再次分析"],
      open_hypotheses: [],
    },
  };
}

// ── VALIDATION LOGIC ──────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  output: FinalOutputSchema | null;
}

/**
 * Validate and parse a raw JSON string against FINAL_OUTPUT_SCHEMA.
 * Returns { valid, errors, output }.
 */
export function validateFinalOutput(raw: string): ValidationResult {
  const errors: string[] = [];

  // Step 1: Parse JSON (strip markdown code fences if present)
  let parsed: any;
  try {
    const stripped = raw.trim().replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
    parsed = JSON.parse(stripped);
  } catch (e) {
    return {
      valid: false,
      errors: ["JSON_PARSE_ERROR: " + (e instanceof Error ? e.message : String(e))],
      output: null,
    };
  }

  // Step 2: Check required top-level fields
  const requiredTopLevel = [
    "verdict",
    "confidence",
    "horizon",
    "bull_case",
    "reasoning",
    "bear_case",
    "risks",
    "next_steps",
    "discussion",
  ];
  for (const key of requiredTopLevel) {
    if (!(key in parsed)) {
      errors.push(`MISSING_FIELD: ${key}`);
    }
  }

  // Step 3: Check critical non-empty fields
  if ("verdict" in parsed && (typeof parsed.verdict !== "string" || parsed.verdict.trim() === "")) {
    errors.push("EMPTY_FIELD: verdict");
  }
  if ("confidence" in parsed && !["high", "medium", "low"].includes(parsed.confidence)) {
    errors.push(`INVALID_VALUE: confidence must be high|medium|low, got: ${parsed.confidence}`);
  }
  if ("horizon" in parsed && !["short-term", "mid-term", "long-term"].includes(parsed.horizon)) {
    errors.push(`INVALID_VALUE: horizon must be short-term|mid-term|long-term, got: ${parsed.horizon}`);
  }
  if ("bull_case" in parsed && (!Array.isArray(parsed.bull_case) || parsed.bull_case.length === 0)) {
    errors.push("EMPTY_ARRAY: bull_case must have at least 1 item");
  }
  if ("reasoning" in parsed && (!Array.isArray(parsed.reasoning) || parsed.reasoning.length === 0)) {
    errors.push("EMPTY_ARRAY: reasoning must have at least 1 item");
  }
  if ("bear_case" in parsed && (!Array.isArray(parsed.bear_case) || parsed.bear_case.length < 2)) {
    errors.push("INSUFFICIENT_ITEMS: bear_case must have at least 2 items");
  }
  if ("risks" in parsed && (!Array.isArray(parsed.risks) || parsed.risks.length === 0)) {
    errors.push("EMPTY_ARRAY: risks must have at least 1 item");
  }
  if ("next_steps" in parsed && (!Array.isArray(parsed.next_steps) || parsed.next_steps.length === 0)) {
    errors.push("EMPTY_ARRAY: next_steps must have at least 1 item");
  }

  // Step 4: Validate risks structure
  if (Array.isArray(parsed.risks)) {
    parsed.risks.forEach((r: any, i: number) => {
      if (!r.description || typeof r.description !== "string") {
        errors.push(`INVALID_RISK[${i}]: missing description`);
      }
      if (!r.reason || typeof r.reason !== "string") {
        errors.push(`INVALID_RISK[${i}]: missing reason`);
      }
      if (!["high", "medium", "low"].includes(r.magnitude)) {
        errors.push(`INVALID_RISK[${i}]: magnitude must be high|medium|low`);
      }
    });
  }

  // Step 5: Validate discussion sub-object
  if ("discussion" in parsed && typeof parsed.discussion === "object" && parsed.discussion !== null) {
    const disc = parsed.discussion;
    const requiredDiscFields = [
      "key_uncertainty",
      "weakest_point",
      "alternative_view",
      "follow_up_questions",
      "exploration_paths",
    ];
    for (const key of requiredDiscFields) {
      if (!(key in disc)) {
        errors.push(`MISSING_DISCUSSION_FIELD: discussion.${key}`);
      }
    }
    if ("follow_up_questions" in disc && (!Array.isArray(disc.follow_up_questions) || disc.follow_up_questions.length === 0)) {
      errors.push("EMPTY_ARRAY: discussion.follow_up_questions");
    }
    if ("exploration_paths" in disc && (!Array.isArray(disc.exploration_paths) || disc.exploration_paths.length === 0)) {
      errors.push("EMPTY_ARRAY: discussion.exploration_paths");
    }
    // open_hypotheses is optional but must be array if present
    if ("open_hypotheses" in disc && !Array.isArray(disc.open_hypotheses)) {
      errors.push("INVALID_TYPE: discussion.open_hypotheses must be array");
    }
    // Ensure open_hypotheses exists (add empty array if missing)
    if (!("open_hypotheses" in disc)) {
      disc.open_hypotheses = [];
    }
  } else {
    errors.push("MISSING_FIELD: discussion (must be object)");
  }

  if (errors.length > 0) {
    return { valid: false, errors, output: null };
  }

  // Step 6: Normalize and return
  const output: FinalOutputSchema = {
    verdict: parsed.verdict,
    confidence: parsed.confidence,
    horizon: parsed.horizon,
    bull_case: parsed.bull_case,
    reasoning: parsed.reasoning,
    bear_case: parsed.bear_case,
    risks: parsed.risks,
    next_steps: parsed.next_steps,
    discussion: {
      key_uncertainty: parsed.discussion.key_uncertainty,
      weakest_point: parsed.discussion.weakest_point,
      alternative_view: parsed.discussion.alternative_view,
      follow_up_questions: parsed.discussion.follow_up_questions,
      exploration_paths: parsed.discussion.exploration_paths,
      open_hypotheses: parsed.discussion.open_hypotheses ?? [],
    },
  };

  return { valid: true, errors: [], output };
}

// ── SCHEMA RENDERER ───────────────────────────────────────────────────────────

/**
 * Render FinalOutputSchema to human-readable Markdown report.
 * This is the SYSTEM RENDERER — GPT does NOT generate prose.
 */
export function renderFinalOutputToMarkdown(
  output: FinalOutputSchema,
  ticker: string,
  outputMode: string
): string {
  const confidenceLabel =
    output.confidence === "high" ? "高置信度" : output.confidence === "medium" ? "中置信度" : "低置信度";
  const horizonLabel =
    output.horizon === "short-term" ? "短期" : output.horizon === "mid-term" ? "中期" : "长期";
  const modeWarning =
    outputMode === "framework_only"
      ? "\n> ⚠️ **当前证据不足，以下为研究框架而非投资建议**\n"
      : outputMode === "directional"
        ? "\n> ℹ️ **方向性判断模式：证据尚不充分，以下为方向性判断**\n"
        : "";

  const lines: string[] = [];

  // Header
  lines.push(`## ${ticker ? `[${ticker}] ` : ""}分析报告`);
  if (modeWarning) lines.push(modeWarning);

  // Verdict
  lines.push(`\n> **核心判断（${confidenceLabel} · ${horizonLabel}）**`);
  lines.push(`> ${output.verdict}`);

  // Reasoning
  if (output.reasoning.length > 0) {
    lines.push(`\n## 推理链`);
    output.reasoning.forEach((r, i) => lines.push(`${i + 1}. ${r}`));
  }

  // Bull / Bear
  lines.push(`\n## 多空论点`);
  lines.push(`\n**看多（Bull Case）**`);
  output.bull_case.forEach((b) => lines.push(`- ${b}`));
  lines.push(`\n**看空（Bear Case）**`);
  output.bear_case.forEach((b) => lines.push(`- ${b}`));

  // Risks
  if (output.risks.length > 0) {
    lines.push(`\n## 风险清单`);
    output.risks.forEach((r) => {
      const mag = r.magnitude === "high" ? "🔴 高" : r.magnitude === "medium" ? "🟡 中" : "🟢 低";
      lines.push(`\n**${r.description}** [${mag}]`);
      lines.push(`${r.reason}`);
    });
  }

  // Next Steps
  if (output.next_steps.length > 0) {
    lines.push(`\n## 建议行动`);
    output.next_steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  }

  return lines.join("\n");
}

/**
 * Render discussion section to Markdown.
 */
export function renderDiscussionToMarkdown(disc: FinalOutputSchema["discussion"]): string {
  const lines: string[] = [];
  lines.push(`\n---\n## 深度讨论`);
  lines.push(`\n**核心不确定性**\n${disc.key_uncertainty}`);
  lines.push(`\n**分析最薄弱环节**\n${disc.weakest_point}`);
  lines.push(`\n**反向观点**\n${disc.alternative_view}`);

  if (disc.open_hypotheses && disc.open_hypotheses.length > 0) {
    lines.push(`\n**可验证假设**`);
    disc.open_hypotheses.forEach((h, i) => lines.push(`${i + 1}. ${h}`));
  }

  if (disc.follow_up_questions.length > 0) {
    lines.push(`\n**追问方向**`);
    disc.follow_up_questions.forEach((q) => lines.push(`- ${q}`));
  }

  if (disc.exploration_paths.length > 0) {
    lines.push(`\n**延伸研究**`);
    disc.exploration_paths.forEach((p) => lines.push(`- ${p}`));
  }

  return lines.join("\n");
}

// ── STEP3 JSON-ONLY PROMPT BUILDER ────────────────────────────────────────────

/**
 * Build the JSON-only Step3 system message.
 * GPT is a RENDERER, not an author.
 */
export function buildStep3JsonOnlySystemMessage(): string {
  return `You are a structured output renderer for a financial analysis system.
Your ONLY job is to fill in the JSON schema provided. 
RULES:
1. Output ONLY valid JSON. No prose, no markdown, no explanation outside JSON.
2. Do NOT invent new conclusions. Use ONLY the data and synthesis provided.
3. Do NOT leave any field empty. Use empty array [] for missing array fields.
4. All string fields must be non-empty. Use "N/A" only as absolute last resort.
5. Strictly follow the schema structure. No extra fields allowed.
6. The "discussion" object must ALWAYS be present and fully populated.`;
}

/**
 * Build the JSON-only Step3 user message.
 * Provides structuredSynthesis + normalizedTaxonomy + runtimeGate as the ONLY truth source.
 */
export function buildStep3JsonOnlyUserMessage(params: {
  ticker: string;
  taskDescription: string;
  outputMode: string;
  structuredSynthesisBlock: string;
  runtimeGateBlock: string;
  normalizedTaxonomyBlock: string;
  dataPacketSummary: string;
  evidenceScore: number;
  missingBlocking: string[];
  missingImportant: string[];
  historyBlock: string;
  modeHint: string;
}): string {
  const {
    ticker,
    taskDescription,
    outputMode,
    structuredSynthesisBlock,
    runtimeGateBlock,
    normalizedTaxonomyBlock,
    dataPacketSummary,
    evidenceScore,
    missingBlocking,
    missingImportant,
    historyBlock,
    modeHint,
  } = params;

  const modeConstraint =
    outputMode === "decisive"
      ? `OUTPUT_MODE: decisive — You MAY write strong directional verdicts with magnitude. Must include counterarguments.`
      : outputMode === "directional"
        ? `OUTPUT_MODE: directional — Write directional verdicts only (e.g. "likely overvalued"). NO specific magnitude. Flag data gaps.`
        : `OUTPUT_MODE: framework_only — Write research framework only. NO directional verdict. NO investment advice. List all missing blocking fields.`;

  const missingNote =
    missingBlocking.length > 0
      ? `\nMISSING_BLOCKING_FIELDS: ${missingBlocking.join(", ")} — these MUST be flagged in verdict and risks.`
      : "";

  return `[LEVEL1A3|STEP3|JSON_RENDERER]
TICKER: ${ticker}
QUERY: ${taskDescription.slice(0, 300)}
${historyBlock ? `HISTORY_CONTEXT: ${historyBlock.slice(0, 400)}` : ""}
EVIDENCE_SCORE: ${evidenceScore}/100
${modeConstraint}${missingNote}
${modeHint ? `MODE_HINT: ${modeHint}` : ""}

[SYNTHESIS_TRUTH_SOURCE]
${structuredSynthesisBlock}
[/SYNTHESIS_TRUTH_SOURCE]

[AGENT_TAXONOMY]
${normalizedTaxonomyBlock}
[/AGENT_TAXONOMY]

[RUNTIME_GATE]
${runtimeGateBlock}
[/RUNTIME_GATE]

[DATA_SUMMARY]
${dataPacketSummary.slice(0, 2000)}
[/DATA_SUMMARY]

Fill the following JSON schema EXACTLY. Output ONLY the JSON object. No other text.
CRITICAL: "discussion" must be fully populated. "bear_case" must have ≥2 items. "risks" must have ≥1 item with magnitude field.
All reasoning must be derived from SYNTHESIS_TRUTH_SOURCE and AGENT_TAXONOMY. Do NOT invent new conclusions.

{
  "verdict": "one-sentence core judgment with direction and magnitude",
  "confidence": "high|medium|low",
  "horizon": "short-term|mid-term|long-term",
  "bull_case": [
    "primary bull thesis — MUST be the most important bullish driver and MUST be placed at index 0",
    "additional bullish reason"
  ],
  "reasoning": ["reasoning chain 1", "reasoning chain 2", "reasoning chain 3"],
  "bear_case": [
    "primary bear risk — MUST be the most important concern and MUST be placed at index 0",
    "secondary bear risk"
  ],
  "risks": [
    {"description": "risk title ≤15 chars", "reason": "detailed: trigger conditions + quantified impact + probability + monitoring indicator, 100-200 chars", "magnitude": "high"},
    {"description": "risk 2 title", "reason": "detailed reason...", "magnitude": "medium"},
    {"description": "risk 3 title", "reason": "detailed reason...", "magnitude": "low"}
  ],
  "next_steps": ["action 1 with trigger condition", "action 2 with time window"],
  "discussion": {
    "key_uncertainty": "most critical uncertainty directly related to this analysis",
    "weakest_point": "weakest link in this analysis (specific data gap or logic flaw)",
    "alternative_view": "opposing view with specific supporting evidence",
    "follow_up_questions": ["question 1 based on core thesis", "question 2 targeting strongest counterargument", "question 3 for verifying key_uncertainty"],
    "exploration_paths": ["research direction 1 with data source", "research direction 2 with time window"],
    "open_hypotheses": ["H1: testable hypothesis 1", "H2: testable hypothesis 2", "H3: testable hypothesis 3"]
  }
}`;
}

// ── NORMALIZED TAXONOMY FORMATTER ─────────────────────────────────────────────

/**
 * Format NormalizedTaxonomy for injection into Step3 JSON-only prompt.
 */
export function formatNormalizedTaxonomyForPrompt(taxonomy: any): string {
  if (!taxonomy) return "[TAXONOMY: unavailable]";
  const lines: string[] = ["[NORMALIZED_TAXONOMY]"];
  if (taxonomy.valuation) {
    lines.push(`VALUATION:`);
    if (taxonomy.valuation.core_claims?.length) lines.push(`  core_claims: ${taxonomy.valuation.core_claims.join(" | ")}`);
    if (taxonomy.valuation.premium_or_discount?.length) lines.push(`  premium_or_discount: ${taxonomy.valuation.premium_or_discount.join(" | ")}`);
    if (taxonomy.valuation.valuation_risks?.length) lines.push(`  valuation_risks: ${taxonomy.valuation.valuation_risks.join(" | ")}`);
  }
  if (taxonomy.business) {
    lines.push(`BUSINESS:`);
    if (taxonomy.business.moat_signals?.length) lines.push(`  moat_signals: ${taxonomy.business.moat_signals.join(" | ")}`);
    if (taxonomy.business.growth_drivers?.length) lines.push(`  growth_drivers: ${taxonomy.business.growth_drivers.join(" | ")}`);
    if (taxonomy.business.execution_risks?.length) lines.push(`  execution_risks: ${taxonomy.business.execution_risks.join(" | ")}`);
  }
  if (taxonomy.risk) {
    lines.push(`RISK:`);
    if (taxonomy.risk.primary_risks?.length) lines.push(`  primary_risks: ${taxonomy.risk.primary_risks.join(" | ")}`);
    if (taxonomy.risk.tail_risks?.length) lines.push(`  tail_risks: ${taxonomy.risk.tail_risks.join(" | ")}`);
    if (taxonomy.risk.risk_mitigants?.length) lines.push(`  risk_mitigants: ${taxonomy.risk.risk_mitigants.join(" | ")}`);
  }
  if (taxonomy.market_context) {
    lines.push(`MARKET_CONTEXT:`);
    if (taxonomy.market_context.macro_tailwinds?.length) lines.push(`  macro_tailwinds: ${taxonomy.market_context.macro_tailwinds.join(" | ")}`);
    if (taxonomy.market_context.macro_headwinds?.length) lines.push(`  macro_headwinds: ${taxonomy.market_context.macro_headwinds.join(" | ")}`);
  }
  lines.push("[/NORMALIZED_TAXONOMY]");
  return lines.join("\n");
}
