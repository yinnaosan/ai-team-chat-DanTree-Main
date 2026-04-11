/**
 * OpenAI API 调用模块
 * 直接通过 OpenAI API 调用 GPT 模型，无需浏览器或 RPA
 *
 * OI-001-B 迁移说明（MANUS_NON_JIN10_PREP_V1）：
 *   - callOpenAI: 内部实现已迁移为委托 modelRouter.generate()
 *     对外接口（函数签名 / 返回类型）保持不变，上层调用方无需修改
 *   - callOpenAIStream: STATUS = DEFERRED
 *     REASON = modelRouter 无稳定 streaming 对应能力；
 *              迁移需改动 routers.ts（READ_ONLY），本轮不做
 *   - testOpenAIConnection: 随 callOpenAI 同步调整（内部调用 callOpenAI，无额外改动）
 */

import { modelRouter, type RouterInput } from "./model_router";

export const DEFAULT_MODEL = "gpt-5.4-mini";  // 升级到 gpt-5.4-mini（2026-03 最新，性价比最佳）

export interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenAICallOptions {
  messages: OpenAIMessage[];
  model?: string;
  apiKey: string;
  maxTokens?: number;
}

/**
 * 调用 OpenAI API（单次请求）
 *
 * OI-001-B：内部实现已迁移为委托 modelRouter.generate()
 * - 对外接口不变（函数签名 / 返回 string / 抛 Error 行为保持一致）
 * - apiKey / model 参数保留（向后兼容），modelRouter 内部自行选择 provider
 * - 开发态 → Claude Sonnet（ANTHROPIC_API_KEY）
 * - 生产态 → GPT-5.4（OPENAI_API_KEY / BUILT_IN_FORGE_API_KEY）
 */
export async function callOpenAI(options: OpenAICallOptions): Promise<string> {
  const { messages, maxTokens = 4096 } = options;

  // 将 OpenAIMessage[] 适配为 RouterInput.messages（LLMMessage[]）
  const routerMessages = messages.map((m) => ({
    role: m.role as "system" | "user" | "assistant",
    content: m.content,
  }));

  const routerInput: RouterInput = {
    messages: routerMessages,
    maxTokens,
  };

  // 委托 modelRouter.generate()，task_type 使用 "default"（通用回退）
  const result = await modelRouter.generate(routerInput, "default");

  // 返回文本内容（与旧实现行为一致）
  return result.output ?? result.content ?? "";
}

/**
 * 流式调用 OpenAI API，返回 AsyncGenerator，逐 token 生成
 *
 * OI-001-B STATUS = DEFERRED
 * REASON:
 *   1. modelRouter.generate() 目前无稳定 streaming 对应能力（返回完整 RouterResponse）
 *   2. 迁移需修改 routers.ts（READ_ONLY），本轮不允许
 * 保持原始实现不变，等待后续 Patch 处理
 */
export async function* callOpenAIStream(
  options: OpenAICallOptions
): AsyncGenerator<string, void, unknown> {
  const { messages, model = DEFAULT_MODEL, apiKey, maxTokens = 4096 } = options;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      stream: true,
    }),
    signal: AbortSignal.timeout(180000), // 180秒超时
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMsg = `OpenAI API 错误 (${response.status})`;
    try {
      const errorJson = JSON.parse(errorText) as { error?: { message?: string } };
      errorMsg = errorJson.error?.message || errorMsg;
    } catch {
      errorMsg = errorText || errorMsg;
    }
    throw new Error(errorMsg);
  }

  if (!response.body) throw new Error("No response body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data) as {
            choices: Array<{ delta: { content?: string }; finish_reason?: string }>;
          };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // 跳过无法解析的行
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * 测试 OpenAI API Key 是否有效
 *
 * OI-001-B：内部调用 callOpenAI，随 callOpenAI 迁移同步生效
 * apiKey 参数保留（向后兼容），modelRouter 内部自行选择 provider
 */
export async function testOpenAIConnection(
  apiKey: string,
  model = DEFAULT_MODEL
): Promise<{ ok: boolean; error?: string; model?: string }> {
  try {
    await callOpenAI({
      apiKey,
      model,
      messages: [{ role: "user", content: "Hi, reply with just 'OK'" }],
      maxTokens: 10,
    });
    return { ok: true, model };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
