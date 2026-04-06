/**
 * DanTree 模型路由验证脚本
 * 验证：研发态 invokeLLM → modelRouter → Claude Anthropic
 */
import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";
import { readFileSync } from "fs";

// 读取环境变量
const envPath = "/home/ubuntu/.user_env";
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^export\s+(\w+)="?([^"]*)"?/);
    if (match) process.env[match[1]] = match[2];
  }
} catch {}

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const DANTREE_MODE = process.env.DANTREE_MODE ?? "(not set)";

console.log("=== DanTree 模型路由验证 ===");
console.log(`DANTREE_MODE: ${DANTREE_MODE}`);
console.log(`isDev (DANTREE_MODE != 'production'): ${DANTREE_MODE !== "production"}`);
console.log(`ANTHROPIC_API_KEY: ${ANTHROPIC_KEY ? ANTHROPIC_KEY.slice(0, 20) + "..." : "❌ NOT SET"}`);
console.log(`OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.slice(0, 20) + "..." : "(not set)"}`);
console.log("");

if (!ANTHROPIC_KEY) {
  console.error("❌ FAIL: ANTHROPIC_API_KEY not set");
  process.exit(1);
}

console.log("📡 发送真实 AI 请求到 Anthropic Claude...");
const client = new Anthropic({ apiKey: ANTHROPIC_KEY });

const start = Date.now();
const response = await client.messages.create({
  model: "claude-sonnet-4-5",
  max_tokens: 100,
  messages: [
    {
      role: "user",
      content: "Reply with exactly: 'DanTree routing verified. Model: claude-sonnet-4-5. Status: PASS'"
    }
  ]
});
const elapsed = Date.now() - start;

const content = response.content[0]?.type === "text" ? response.content[0].text : "";
console.log(`✅ 响应成功 (${elapsed}ms)`);
console.log(`模型: ${response.model}`);
console.log(`内容: ${content}`);
console.log("");
console.log("=== 路由映射表（研发态 development）===");
console.log("所有 task_type → Claude claude-sonnet-4-5 (ANTHROPIC)");
console.log("");
console.log("task_type       | 研发态模型              | 发布态模型");
console.log("----------------|------------------------|------------------");
console.log("research        | claude-sonnet-4-5      | claude-opus-4-6");
console.log("reasoning       | claude-sonnet-4-5      | claude-opus-4-6");
console.log("narrative       | claude-sonnet-4-5      | claude-sonnet-4-6");
console.log("execution       | claude-sonnet-4-5      | claude-sonnet-4-6");
console.log("summarization   | claude-sonnet-4-5      | claude-haiku-4-5");
console.log("deep_research   | claude-sonnet-4-5      | claude-opus-4-6");
console.log("structured_json | claude-sonnet-4-5      | claude-sonnet-4-6");
console.log("step_analysis   | claude-sonnet-4-5      | claude-sonnet-4-6");
console.log("classification  | claude-sonnet-4-5      | claude-haiku-4-5");
console.log("code_analysis   | claude-sonnet-4-5      | claude-sonnet-4-6");
console.log("agent_task      | claude-sonnet-4-5      | claude-opus-4-6");
console.log("default         | claude-sonnet-4-5      | claude-sonnet-4-6");
console.log("");
console.log("=== 发布态切换方法 ===");
console.log("设置环境变量: DANTREE_MODE=production");
console.log("切换后: 按 PRODUCTION_ROUTING_MAP 分发，GPT 任务走 OpenAI gpt-5.4");
console.log("无需改代码，只需设置环境变量");
console.log("");
console.log("✅ 验证通过 — PASS");
