/**
 * claude_provider.ts — DanTree Claude Provider
 *
 * Claude API 调用层（Anthropic SDK）。
 * 所有 Claude 调用必须通过此文件，不得在业务逻辑中直接 import Anthropic。
 *
 * 使用方式：通过 model_router.ts 调用，不要直接 import 此文件到业务逻辑。
 */

import Anthropic from "@anthropic-ai/sdk";
import type { LLMMessage, LLMResponse, ModelMeta } from "./llmProviders";

// ─────────────────────────────────────────────────────────────────────────────
// Claude Provider Options
// ─────────────────────────────────────────────────────────────────────────────

export interface ClaudeProviderOptions {
  model: string;
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
  /** 启用 extended thinking（仅 Opus/Sonnet 4.x 支持） */
  extendedThinking?: boolean;
  meta?: ModelMeta;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Invoke Function
// ─────────────────────────────────────────────────────────────────────────────

export async function invokeClaude(opts: ClaudeProviderOptions): Promise<LLMResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "[claude_provider] ANTHROPIC_API_KEY is not set. " +
      "Please add it via webdev_request_secrets."
    );
  }

  const client = new Anthropic({ apiKey });

  // 分离 system message 和 user/assistant messages
  const systemMsg = opts.messages.find((m) => m.role === "system")?.content;
  const chatMessages = opts.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const maxTokens = opts.maxTokens ?? 4096;

  const requestParams: Anthropic.MessageCreateParamsNonStreaming = {
    model: opts.model,
    max_tokens: maxTokens,
    messages: chatMessages,
    ...(systemMsg ? { system: systemMsg } : {}),
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
  };

  // Extended thinking（仅 Opus/Sonnet 4.x 支持）
  if (opts.extendedThinking) {
    (requestParams as any).thinking = {
      type: "enabled",
      budget_tokens: Math.min(maxTokens, 10000),
    };
  }

  const response = await client.messages.create(requestParams);

  // 提取文本内容（跳过 thinking blocks）
  const textContent = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const meta = opts.meta;
  const costUsd = meta
    ? (inputTokens / 1_000_000) * meta.inputPricePerMTok +
      (outputTokens / 1_000_000) * meta.outputPricePerMTok
    : 0;

  return {
    content: textContent,
    model: opts.model,
    provider: "anthropic",
    usage: { input_tokens: inputTokens, output_tokens: outputTokens, estimated_cost_usd: costUsd },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Health Check
// ─────────────────────────────────────────────────────────────────────────────

export async function checkClaudeHealth(): Promise<{ ok: boolean; latency_ms: number; error?: string }> {
  const start = Date.now();
  try {
    await invokeClaude({
      model: "claude-haiku-4-5",
      messages: [{ role: "user", content: "ping" }],
      maxTokens: 10,
    });
    return { ok: true, latency_ms: Date.now() - start };
  } catch (e) {
    return { ok: false, latency_ms: Date.now() - start, error: String(e) };
  }
}
