/**
 * DANTREE_LEVEL2 Phase3: Second Pass Execution Wrapper
 * Executes a targeted second-pass LLM call based on the follow-up task.
 * This is NOT a full re-run — it's a constrained, focused call.
 */

import { invokeLLM } from "./_core/llm";
import type { FollowUpTask } from "./followUpTaskGenerator";
import type { FinalOutputSchema } from "./outputSchemaValidator";
import type { LoopState } from "./loopStateTriggerEngine";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SecondPassResult {
  success: boolean;
  raw_response: string;
  parsed_output: SecondPassOutput | null;
  llm_calls_used: number;
  error?: string;
}

export interface SecondPassOutput {
  targeted_finding: string;          // The specific finding from second pass
  evidence_items: SecondPassEvidence[];
  verdict_update: "confirms" | "weakens" | "refutes" | "neutral";
  confidence_delta: "improved" | "unchanged" | "degraded";
  new_risk_found: boolean;
  new_risk_description?: string;
  key_quote?: string;                // Most important quote/data point found
}

export interface SecondPassEvidence {
  claim: string;
  source_type: "quantitative" | "qualitative" | "expert_opinion" | "market_signal";
  strength: "strong" | "moderate" | "weak";
  supports_thesis: boolean;
}

// ── Main Function ─────────────────────────────────────────────────────────────

/**
 * Execute a targeted second-pass LLM call.
 * Uses a constrained prompt that focuses only on the follow-up task.
 */
export async function executeSecondPass(params: {
  followUpTask: FollowUpTask;
  level1a3Output: FinalOutputSchema;
  loopState: LoopState;
  dataContext: string;  // Serialized data packet from Level1 (reused, not re-fetched)
}): Promise<SecondPassResult> {
  const { followUpTask, level1a3Output, dataContext } = params;

  const systemPrompt = buildSecondPassSystemPrompt();
  const userMessage = buildSecondPassUserMessage(followUpTask, level1a3Output, dataContext);

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "second_pass_output",
          strict: true,
          schema: {
            type: "object",
            properties: {
              targeted_finding: { type: "string", description: "The specific finding from this second pass" },
              evidence_items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    claim: { type: "string" },
                    source_type: { type: "string", enum: ["quantitative", "qualitative", "expert_opinion", "market_signal"] },
                    strength: { type: "string", enum: ["strong", "moderate", "weak"] },
                    supports_thesis: { type: "boolean" },
                  },
                  required: ["claim", "source_type", "strength", "supports_thesis"],
                  additionalProperties: false,
                },
              },
              verdict_update: { type: "string", enum: ["confirms", "weakens", "refutes", "neutral"] },
              confidence_delta: { type: "string", enum: ["improved", "unchanged", "degraded"] },
              new_risk_found: { type: "boolean" },
              new_risk_description: { type: "string" },
              key_quote: { type: "string" },
            },
            required: [
              "targeted_finding", "evidence_items", "verdict_update",
              "confidence_delta", "new_risk_found", "new_risk_description", "key_quote"
            ],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = String(response.choices?.[0]?.message?.content ?? "");

    try {
      const parsed = JSON.parse(rawContent) as SecondPassOutput;
      return {
        success: true,
        raw_response: rawContent,
        parsed_output: parsed,
        llm_calls_used: 1,
      };
    } catch {
      return {
        success: false,
        raw_response: rawContent,
        parsed_output: null,
        llm_calls_used: 1,
        error: "Failed to parse second pass JSON output",
      };
    }
  } catch (err) {
    return {
      success: false,
      raw_response: "",
      parsed_output: null,
      llm_calls_used: 1,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Prompt Builders ───────────────────────────────────────────────────────────

function buildSecondPassSystemPrompt(): string {
  return `You are DanTree's Second Pass Reasoning Engine.

ROLE: You perform targeted, constrained follow-up analysis to strengthen or refute a specific aspect of a previous analysis. You do NOT re-run the full analysis.

RULES:
1. Focus ONLY on the specific question/task provided. Do not regenerate the full analysis.
2. Return structured JSON only — no prose outside the JSON schema.
3. Be honest about evidence strength. If you cannot find strong evidence, say so.
4. "verdict_update" reflects how this second pass changes the ORIGINAL verdict:
   - "confirms": new evidence supports the original verdict
   - "weakens": new evidence reduces confidence in original verdict
   - "refutes": new evidence contradicts the original verdict
   - "neutral": new evidence is inconclusive
5. "confidence_delta" reflects whether overall confidence improved, stayed same, or degraded.
6. Keep "targeted_finding" under 200 characters — it's a headline, not an essay.
7. Provide 2-4 evidence items maximum.`;
}

function buildSecondPassUserMessage(
  followUpTask: FollowUpTask,
  level1a3Output: FinalOutputSchema,
  dataContext: string
): string {
  const originalVerdict = level1a3Output.verdict;
  const originalConfidence = level1a3Output.confidence;
  const originalKeyUncertainty = level1a3Output.discussion.key_uncertainty;

  return `SECOND_PASS_TASK:
${followUpTask.task_description}

FOCUS_AREA: ${followUpTask.focus_area}

CONSTRAINT: ${followUpTask.constraint}

DATA_HINTS_TO_LOOK_FOR:
${followUpTask.data_hints.map((h, i) => `${i + 1}. ${h}`).join("\n")}

ORIGINAL_LEVEL1_CONTEXT:
- Ticker: ${followUpTask.primary_ticker}
- Original Verdict: ${originalVerdict}
- Original Confidence: ${originalConfidence}
- Key Uncertainty: ${originalKeyUncertainty}
- Original Task: ${followUpTask.original_task}

AVAILABLE_DATA_CONTEXT (from Level1 data fetch — do not re-fetch):
${dataContext.slice(0, 3000)}

OUTPUT: Return JSON matching the second_pass_output schema. Focus exclusively on the FOCUS_AREA.`;
}
