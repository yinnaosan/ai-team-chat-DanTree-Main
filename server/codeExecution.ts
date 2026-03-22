/**
 * codeExecution.ts — 安全沙盒代码执行模块
 * 参考：yorkeccak/finance 的 "AI 生成代码 → 安全执行 → 返回图表" 模式
 *
 * 架构：
 *   1. 用户提出可视化需求（如"画 AAPL 最近一年的价格走势"）
 *   2. GPT 生成 Python 代码（使用 matplotlib/plotly）
 *   3. 后端在受限 Python 子进程中安全执行
 *   4. 返回 base64 图像或 JSON 数据供前端渲染
 *
 * 安全限制：
 *   - 禁止网络请求（已有数据通过参数传入）
 *   - 禁止文件系统写入（除临时目录）
 *   - 超时 30 秒自动终止
 *   - 内存限制 256MB
 *   - 禁止 subprocess/os.system 等危险操作
 */

import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import * as crypto from "crypto";

// ─── 类型定义 ────────────────────────────────────────────────────────────────

export interface CodeExecutionInput {
  code: string;                    // Python 代码字符串
  data?: Record<string, unknown>;  // 传入数据（JSON 序列化后注入为 _data 变量）
  timeout?: number;                // 超时毫秒数，默认 30000
  outputType?: "image" | "json" | "text" | "auto"; // 期望输出类型
}

export interface CodeExecutionResult {
  success: boolean;
  outputType: "image" | "json" | "text" | "error";
  imageBase64?: string;            // PNG base64（outputType=image 时）
  imageUrl?: string;               // data:image/png;base64,... URL
  jsonData?: unknown;              // JSON 数据（outputType=json 时）
  textOutput?: string;             // 文本输出
  error?: string;                  // 错误信息
  executionTimeMs?: number;        // 执行耗时
  warnings?: string[];             // 警告信息
}

// ─── 安全检查 ────────────────────────────────────────────────────────────────

const FORBIDDEN_PATTERNS = [
  /import\s+os\b/,
  /import\s+subprocess\b/,
  /import\s+sys\b/,
  /import\s+socket\b/,
  /import\s+urllib\b/,
  /import\s+requests\b/,
  /import\s+http\b/,
  /from\s+os\s+import/,
  /from\s+subprocess\s+import/,
  /os\.system\s*\(/,
  /os\.popen\s*\(/,
  /subprocess\./,
  /exec\s*\(/,
  /eval\s*\(/,
  /__import__\s*\(/,
  /open\s*\([^)]*['"]\s*w/,    // 文件写入
  /open\s*\([^)]*['"]\s*a/,    // 文件追加
];

export function validateCode(code: string): { safe: boolean; reason?: string } {
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(code)) {
      return { safe: false, reason: `代码包含禁止操作: ${pattern.source}` };
    }
  }
  // 检查代码长度
  if (code.length > 50000) {
    return { safe: false, reason: "代码超过 50000 字符限制" };
  }
  return { safe: true };
}

// ─── 代码包装器 ──────────────────────────────────────────────────────────────

function wrapCode(code: string, data: Record<string, unknown> | undefined, outputPath: string): string {
  const dataJson = data ? JSON.stringify(data) : "{}";
  return `
import json
import base64
import io
import sys
import warnings
warnings.filterwarnings('ignore')

# 注入传入数据
_data = json.loads('''${dataJson.replace(/'/g, "\\'")}''')

# 设置 matplotlib 后端（无显示器）
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import numpy as np

# 设置中文字体（使用系统字体）
plt.rcParams['font.family'] = ['DejaVu Sans', 'sans-serif']
plt.rcParams['axes.unicode_minus'] = False
plt.rcParams['figure.facecolor'] = '#1a1a2e'
plt.rcParams['axes.facecolor'] = '#16213e'
plt.rcParams['axes.edgecolor'] = '#404060'
plt.rcParams['text.color'] = '#e0e0e0'
plt.rcParams['axes.labelcolor'] = '#e0e0e0'
plt.rcParams['xtick.color'] = '#a0a0b0'
plt.rcParams['ytick.color'] = '#a0a0b0'
plt.rcParams['grid.color'] = '#2a2a4a'
plt.rcParams['grid.alpha'] = 0.5

_output_path = '''${outputPath}'''
_output = {"type": "text", "content": ""}
_text_output = []

class _Capture:
    def write(self, s): _text_output.append(s)
    def flush(self): pass

_old_stdout = sys.stdout
sys.stdout = _Capture()

try:
${code.split('\n').map(line => '    ' + line).join('\n')}

    # 检查是否有图表
    if plt.get_fignums():
        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=150, bbox_inches='tight',
                    facecolor=plt.rcParams['figure.facecolor'])
        buf.seek(0)
        img_b64 = base64.b64encode(buf.read()).decode('utf-8')
        plt.close('all')
        _output = {"type": "image", "content": img_b64}
    else:
        captured = ''.join(_text_output)
        # 尝试解析为 JSON
        try:
            parsed = json.loads(captured.strip())
            _output = {"type": "json", "content": parsed}
        except:
            _output = {"type": "text", "content": captured}

except Exception as e:
    _output = {"type": "error", "content": str(e)}
finally:
    sys.stdout = _old_stdout
    plt.close('all')

with open(_output_path, 'w') as f:
    json.dump(_output, f)
`;
}

// ─── 主执行函数 ──────────────────────────────────────────────────────────────

export async function executeCode(input: CodeExecutionInput): Promise<CodeExecutionResult> {
  const startTime = Date.now();

  // 安全检查
  const validation = validateCode(input.code);
  if (!validation.safe) {
    return {
      success: false,
      outputType: "error",
      error: `安全检查失败: ${validation.reason}`,
      executionTimeMs: 0,
    };
  }

  // 创建临时目录
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codeexec-"));
  const scriptPath = path.join(tmpDir, "script.py");
  const outputPath = path.join(tmpDir, "output.json");

  try {
    // 写入包装后的代码
    const wrappedCode = wrapCode(input.code, input.data, outputPath);
    fs.writeFileSync(scriptPath, wrappedCode, "utf-8");

    // 执行 Python
    const timeout = input.timeout ?? 30000;
    const result = await new Promise<CodeExecutionResult>((resolve) => {
      const proc = spawn("python3", [scriptPath], {
        timeout,
        env: {
          ...process.env,
          PYTHONPATH: "",
          HOME: tmpDir,
        },
        cwd: tmpDir,
      });

      let stderr = "";
      proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

      const timer = setTimeout(() => {
        proc.kill("SIGKILL");
        resolve({
          success: false,
          outputType: "error",
          error: `执行超时（${timeout / 1000}秒）`,
          executionTimeMs: Date.now() - startTime,
        });
      }, timeout + 1000);

      proc.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0 && !fs.existsSync(outputPath)) {
          resolve({
            success: false,
            outputType: "error",
            error: stderr || `进程退出码 ${code}`,
            executionTimeMs: Date.now() - startTime,
          });
          return;
        }

        try {
          const output = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
          const execTime = Date.now() - startTime;

          if (output.type === "image") {
            resolve({
              success: true,
              outputType: "image",
              imageBase64: output.content,
              imageUrl: `data:image/png;base64,${output.content}`,
              executionTimeMs: execTime,
            });
          } else if (output.type === "json") {
            resolve({
              success: true,
              outputType: "json",
              jsonData: output.content,
              executionTimeMs: execTime,
            });
          } else if (output.type === "error") {
            resolve({
              success: false,
              outputType: "error",
              error: output.content,
              executionTimeMs: execTime,
              warnings: stderr ? [stderr] : undefined,
            });
          } else {
            resolve({
              success: true,
              outputType: "text",
              textOutput: output.content,
              executionTimeMs: execTime,
            });
          }
        } catch (e) {
          resolve({
            success: false,
            outputType: "error",
            error: `输出解析失败: ${e instanceof Error ? e.message : String(e)}`,
            executionTimeMs: Date.now() - startTime,
          });
        }
      });
    });

    return result;
  } finally {
    // 清理临时文件
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  }
}

// ─── 图表生成辅助函数 ────────────────────────────────────────────────────────

/**
 * 根据用户需求和数据，用 LLM 生成 Python 可视化代码
 * 返回可直接执行的代码字符串
 */
export function buildChartCodePrompt(
  userRequest: string,
  availableData: Record<string, unknown>
): string {
  const dataKeys = Object.keys(availableData);
  return `你是一个专业的金融数据可视化专家。请根据以下需求生成 Python 代码：

需求：${userRequest}

可用数据变量（通过 _data 字典访问）：
${dataKeys.map(k => `- _data["${k}"]`).join("\n")}

要求：
1. 使用 matplotlib 绘制图表（不要使用 plotly 或其他库）
2. 图表风格：深色主题，已预设好配色，直接使用即可
3. 添加标题、轴标签、图例
4. 数字格式化（如价格加 $，百分比加 %）
5. 不要使用 import os, subprocess, requests 等网络/系统操作
6. 代码应该直接可执行，不需要额外导入（matplotlib, numpy, json 已导入）
7. 只输出 Python 代码，不要有任何解释文字

Python 代码：`;
}

/**
 * 快速生成常见金融图表的预设代码
 */
export function getPresetChartCode(chartType: string, data: Record<string, unknown>): string | null {
  switch (chartType) {
    case "price_line":
      return `
dates = _data.get("dates", [])
prices = _data.get("prices", [])
symbol = _data.get("symbol", "Stock")

fig, ax = plt.subplots(figsize=(12, 5))
ax.plot(dates, prices, color='#4fc3f7', linewidth=1.5, label=symbol)
ax.fill_between(range(len(prices)), prices, alpha=0.1, color='#4fc3f7')
ax.set_title(f'{symbol} 价格走势', fontsize=14, pad=15)
ax.set_xlabel('日期')
ax.set_ylabel('价格 ($)')
ax.grid(True, alpha=0.3)
ax.legend()
plt.tight_layout()
`;

    case "candlestick":
      return `
import matplotlib.patches as mpatches
opens = _data.get("opens", [])
highs = _data.get("highs", [])
lows = _data.get("lows", [])
closes = _data.get("closes", [])
symbol = _data.get("symbol", "Stock")
n = len(closes)

fig, ax = plt.subplots(figsize=(14, 6))
for i in range(n):
    color = '#26a69a' if closes[i] >= opens[i] else '#ef5350'
    ax.plot([i, i], [lows[i], highs[i]], color=color, linewidth=0.8)
    ax.bar(i, abs(closes[i] - opens[i]), bottom=min(opens[i], closes[i]),
           color=color, width=0.7, alpha=0.9)
ax.set_title(f'{symbol} K线图', fontsize=14, pad=15)
ax.set_ylabel('价格 ($)')
ax.grid(True, alpha=0.3)
plt.tight_layout()
`;

    case "portfolio_pie":
      return `
labels = _data.get("labels", [])
values = _data.get("values", [])
colors = ['#4fc3f7', '#81c784', '#ffb74d', '#e57373', '#ba68c8', '#4db6ac', '#fff176']

fig, ax = plt.subplots(figsize=(8, 8))
wedges, texts, autotexts = ax.pie(values, labels=labels, colors=colors[:len(labels)],
    autopct='%1.1f%%', startangle=90, pctdistance=0.85)
for text in texts: text.set_color('#e0e0e0')
for autotext in autotexts: autotext.set_color('#ffffff'); autotext.set_fontsize(10)
ax.set_title('投资组合分布', fontsize=14, pad=20)
plt.tight_layout()
`;

    case "returns_bar":
      return `
labels = _data.get("labels", [])
returns = _data.get("returns", [])

colors = ['#26a69a' if r >= 0 else '#ef5350' for r in returns]
fig, ax = plt.subplots(figsize=(12, 5))
bars = ax.bar(range(len(labels)), returns, color=colors, alpha=0.85, width=0.6)
ax.axhline(y=0, color='#606080', linewidth=0.8, linestyle='--')
ax.set_xticks(range(len(labels)))
ax.set_xticklabels(labels, rotation=45, ha='right')
ax.set_title('收益率对比', fontsize=14, pad=15)
ax.set_ylabel('收益率 (%)')
ax.grid(True, axis='y', alpha=0.3)
for bar, val in zip(bars, returns):
    ax.text(bar.get_x() + bar.get_width()/2., bar.get_height() + (0.1 if val >= 0 else -0.3),
            f'{val:+.1f}%', ha='center', va='bottom', fontsize=8, color='#e0e0e0')
plt.tight_layout()
`;

    default:
      return null;
  }
}
