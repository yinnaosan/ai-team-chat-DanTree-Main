/**
 * OpenAI API 调用模块
 * 直接通过 OpenAI API 调用 GPT 模型，无需浏览器或 RPA
 */

export const DEFAULT_MODEL = "gpt-4.5-mini";

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
 */
export async function callOpenAI(options: OpenAICallOptions): Promise<string> {
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
    }),
    signal: AbortSignal.timeout(120000), // 120秒超时
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

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}

/**
 * 测试 OpenAI API Key 是否有效
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
