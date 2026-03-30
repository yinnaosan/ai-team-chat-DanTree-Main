/**
 * gpt_provider.ts — DanTree GPT Provider
 *
 * OpenAI GPT API 调用层（OpenAI SDK）。
 * 所有 GPT 调用必须通过此文件，不得在业务逻辑中直接 import OpenAI。
 *
 * 当前状态（开发阶段）：
 *   - Manus 沙箱环境：OpenAI 直连受网络隔离限制，通过 Forge 代理路由
 *   - 独立服务器环境：BUILT_IN_FORGE_API_URL 不存在时自动直连 api.openai.com
 *
 * 使用方式：通过 model_router.ts 调用，不要直接 import 此文件到业务逻辑。
 */

import OpenAI from "openai";
import type { LLMMessage, LLMResponse, ModelMeta } from "./llmProviders";

// ─────────────────────────────────────────────────────────────────────────────
// GPT Provider Options
// ─────────────────────────────────────────────────────────────────────────────

export interface GPTProviderOptions {
  model: string;
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
  /** 结构化输出 JSON schema（仅 GPT-4o 及以上支持） */
  responseFormat?: { type: "json_object" } | { type: "json_schema"; json_schema: object };
  meta?: ModelMeta;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Invoke Function
// ─────────────────────────────────────────────────────────────────────────────

export async function invokeGPT(opts: GPTProviderOptions): Promise<LLMResponse> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.BUILT_IN_FORGE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "[gpt_provider] OPENAI_API_KEY is not set. " +
      "Please add it via webdev_request_secrets."
    );
  }

  // Manus 沙箱：通过 Forge 代理网关（OpenAI 兼容），避免直连被拦截
  // 独立服务器：BUILT_IN_FORGE_API_URL 不存在，自动直连 OpenAI
  const forgeUrl = process.env.BUILT_IN_FORGE_API_URL;
  const baseURL = forgeUrl
    ? `${forgeUrl.replace(/\/$/, "")}/v1`
    : "https://api.openai.com/v1";

  const client = new OpenAI({ apiKey, baseURL });

  const messages = opts.messages.map((m) => ({
    role: m.role,
    content: m.content,
  })) as OpenAI.ChatCompletionMessageParam[];

  const requestParams: OpenAI.ChatCompletionCreateParamsNonStreaming = {
    model: opts.model,
    messages,
    ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    ...(opts.responseFormat ? { response_format: opts.responseFormat as any } : {}),
  };

  const response = await client.chat.completions.create(requestParams);

  const content = response.choices[0]?.message?.content ?? "";
  const inputTokens = response.usage?.prompt_tokens ?? 0;
  const outputTokens = response.usage?.completion_tokens ?? 0;
  const meta = opts.meta;
  const costUsd = meta
    ? (inputTokens / 1_000_000) * meta.inputPricePerMTok +
      (outputTokens / 1_000_000) * meta.outputPricePerMTok
    : 0;

  return {
    content,
    model: opts.model,
    provider: "openai",
    usage: { input_tokens: inputTokens, output_tokens: outputTokens, estimated_cost_usd: costUsd },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Health Check
// ─────────────────────────────────────────────────────────────────────────────

export async function checkGPTHealth(): Promise<{ ok: boolean; latency_ms: number; error?: string }> {
  const start = Date.now();
  try {
    await invokeGPT({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "ping" }],
      maxTokens: 10,
    });
    return { ok: true, latency_ms: Date.now() - start };
  } catch (e) {
    return { ok: false, latency_ms: Date.now() - start, error: String(e) };
  }
}
