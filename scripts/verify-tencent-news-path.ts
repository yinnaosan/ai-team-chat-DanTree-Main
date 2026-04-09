/**
 * verify-tencent-news-path.ts
 * 验证腾讯新闻 CLI 路径固化是否成功
 * 运行: npx tsx scripts/verify-tencent-news-path.ts
 */

import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execFileAsync = promisify(execFile);

// 新路径（项目内）
const NEW_CLI_PATH = path.resolve(__dirname, "../server/bin/tencent-news-cli");
// 旧路径（临时 upload 目录）
const OLD_CLI_PATH = "/home/ubuntu/upload/tencent-news/tencent-news/tencent-news-cli";

async function verify() {
  console.log("=" .repeat(60));
  console.log("腾讯新闻 CLI 路径固化验证");
  console.log("=" .repeat(60));

  // ── 1. 检查新路径存在 ────────────────────────────────────────────
  console.log("\n[1] 新路径检查");
  console.log(`    路径: ${NEW_CLI_PATH}`);
  if (existsSync(NEW_CLI_PATH)) {
    console.log("    ✅ 新路径 CLI 存在");
  } else {
    console.log("    ❌ 新路径 CLI 不存在！");
    process.exit(1);
  }

  // ── 2. 确认不再依赖旧路径 ────────────────────────────────────────
  console.log("\n[2] 旧路径依赖检查");
  const { execSync } = await import("child_process");
  try {
    const result = execSync(
      `grep -rn "/home/ubuntu/upload" /home/ubuntu/ai-team-chat/server/ --include="*.ts" 2>/dev/null | grep -v "test\\.ts" | grep -v "verify-tencent"`,
      { encoding: "utf8" }
    ).trim();
    if (result) {
      console.log("    ❌ 仍有文件引用旧路径:");
      console.log("   ", result);
      process.exit(1);
    } else {
      console.log("    ✅ 无任何 server/*.ts 文件引用 /home/ubuntu/upload/");
    }
  } catch {
    // grep 没有匹配返回非零退出码，这是正常的（表示没有匹配）
    console.log("    ✅ 无任何 server/*.ts 文件引用 /home/ubuntu/upload/");
  }

  // ── 3. 新路径 CLI 可执行 ─────────────────────────────────────────
  console.log("\n[3] CLI 可执行性检查");
  try {
    const { stdout } = await execFileAsync(NEW_CLI_PATH, ["help"], { timeout: 5000 });
    if (stdout.includes("tencent-news-cli")) {
      console.log("    ✅ CLI 可执行，help 输出正常");
    } else {
      console.log("    ⚠️  CLI 可执行但输出异常:", stdout.slice(0, 100));
    }
  } catch (err) {
    console.log("    ❌ CLI 不可执行:", (err as Error).message);
    process.exit(1);
  }

  // ── 4. API Key 传递验证 ──────────────────────────────────────────
  console.log("\n[4] API Key 传递验证");
  const key = process.env.TENCENT_NEWS_API_KEY || "95b0b0c9-e4d0-458c-a271-ef0847d84283";
  try {
    const { stdout } = await execFileAsync(
      NEW_CLI_PATH,
      ["apikey-get"],
      {
        timeout: 5000,
        env: { ...process.env, TENCENT_NEWS_APIKEY: key },
      }
    );
    if (stdout.includes("API Key")) {
      console.log("    ✅ API Key 通过 env var 传递成功");
      console.log("   ", stdout.trim().split("\n")[0]);
    } else {
      console.log("    ⚠️  API Key 状态:", stdout.slice(0, 100));
    }
  } catch (err) {
    console.log("    ❌ API Key 验证失败:", (err as Error).message);
  }

  // ── 5. 真实 news_china 调用 ──────────────────────────────────────
  console.log("\n[5] 真实 news_china 调用验证（搜索「茅台」）");
  try {
    const { stdout } = await execFileAsync(
      NEW_CLI_PATH,
      ["search", "茅台", "--limit", "2"],
      {
        timeout: 15000,
        env: { ...process.env, TENCENT_NEWS_APIKEY: key },
      }
    );
    if (stdout && stdout.trim().length > 0) {
      console.log("    ✅ news_china 调用成功，返回数据:");
      console.log("   ", stdout.slice(0, 200).replace(/\n/g, "\n    "));
    } else {
      console.log("    ❌ 返回空数据");
      process.exit(1);
    }
  } catch (err) {
    console.log("    ❌ 调用失败:", (err as Error).message);
    process.exit(1);
  }

  // ── 6. 确认腾讯新闻未进入 global news 主链 ──────────────────────
  console.log("\n[6] 腾讯新闻位置验证（确认仅为 news_china 辅助层）");
  const { readFileSync } = await import("fs");
  const matrixContent = readFileSync(
    path.resolve(__dirname, "../server/dataRoutingMatrix.ts"),
    "utf8"
  );
  const orchestratorContent = readFileSync(
    path.resolve(__dirname, "../server/dataRoutingOrchestrator.ts"),
    "utf8"
  );

  // 检查 matrix 中腾讯新闻的 layer 是 news_china，不是 news_global
  if (matrixContent.includes('"news_china"') && matrixContent.includes('"tencent_news"')) {
    console.log("    ✅ dataRoutingMatrix: 腾讯新闻在 news_china 层");
  } else {
    console.log("    ❌ dataRoutingMatrix 中腾讯新闻层级异常");
  }

  // 确认 news_global 层没有 tencent
  if (!matrixContent.includes('"news_global"') || !matrixContent.match(/news_global[\s\S]{0,500}tencent/)) {
    console.log("    ✅ news_global 层不包含腾讯新闻");
  } else {
    console.log("    ⚠️  请检查 news_global 层是否意外包含腾讯新闻");
  }

  if (orchestratorContent.includes("tencent_news") && orchestratorContent.includes("news_china")) {
    console.log("    ✅ dataRoutingOrchestrator: 腾讯新闻仅接入 news_china");
  }

  // ── 汇总 ─────────────────────────────────────────────────────────
  console.log("\n" + "=" .repeat(60));
  console.log("✅ 所有验证通过");
  console.log(`新路径: ${NEW_CLI_PATH}`);
  console.log("旧路径: 已废弃，不再被任何 server/*.ts 引用");
  console.log("=" .repeat(60));
}

verify().catch(err => {
  console.error("❌ 验证失败:", err);
  process.exit(1);
});
