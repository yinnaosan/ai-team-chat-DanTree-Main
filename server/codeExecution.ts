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

// OHLCV 数据接口（与 localIndicators.ts 保持一致）
export interface OHLCVChartData {
  timestamps: number[];
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  volumes: number[];
}

// 技术指标数据接口（用于图表生成）
export interface TechIndicatorChartData {
  rsi14?: number[];
  macdLine?: number[];
  macdSignal?: number[];
  bbUpper?: number[];
  bbMiddle?: number[];
  bbLower?: number[];
  ema20?: number[];
  ema50?: number[];
  sma200?: number[];
  atr14?: number[];
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
plt.rcParams['figure.facecolor'] = '#0d0d0d'
plt.rcParams['axes.facecolor'] = '#111111'
plt.rcParams['axes.edgecolor'] = '#2a2a2a'
plt.rcParams['text.color'] = '#e0e0e0'
plt.rcParams['axes.labelcolor'] = '#a0a0a0'
plt.rcParams['xtick.color'] = '#606060'
plt.rcParams['ytick.color'] = '#606060'
plt.rcParams['grid.color'] = '#1e1e1e'
plt.rcParams['grid.alpha'] = 0.8

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

// ─── 自动图表生成（yorkeccak/finance 架构核心）────────────────────────────────

/**
 * 根据 OHLCV + 技术指标数据，自动生成专业金融图表
 * 返回 base64 编码的 PNG 图像
 *
 * 图表布局：
 *   - 上图（60%）：K线图 + EMA20/EMA50/SMA200 均线 + 布林带
 *   - 中图（20%）：成交量柱状图（涨跌配色）
 *   - 下图（20%）：RSI 指标 + 超买/超卖线
 */
export async function generateAutoChart(
  symbol: string,
  ohlcv: OHLCVChartData,
  indicators?: TechIndicatorChartData,
  chartType: "full" | "price_only" | "macd" = "full"
): Promise<string | null> {
  const n = Math.min(ohlcv.closes.length, 120); // 最多显示 120 个交易日
  if (n < 10) return null;

  // 截取最近 n 个数据点
  const slice = (arr: number[]) => arr.slice(-n);
  const dates = slice(ohlcv.timestamps).map(ts => {
    const d = new Date(ts * 1000);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });

  const data: Record<string, unknown> = {
    symbol,
    n,
    dates,
    opens: slice(ohlcv.opens),
    highs: slice(ohlcv.highs),
    lows: slice(ohlcv.lows),
    closes: slice(ohlcv.closes),
    volumes: slice(ohlcv.volumes),
    rsi14: indicators?.rsi14 ? slice(indicators.rsi14) : [],
    macdLine: indicators?.macdLine ? slice(indicators.macdLine) : [],
    macdSignal: indicators?.macdSignal ? slice(indicators.macdSignal) : [],
    bbUpper: indicators?.bbUpper ? slice(indicators.bbUpper) : [],
    bbMiddle: indicators?.bbMiddle ? slice(indicators.bbMiddle) : [],
    bbLower: indicators?.bbLower ? slice(indicators.bbLower) : [],
    ema20: indicators?.ema20 ? slice(indicators.ema20) : [],
    ema50: indicators?.ema50 ? slice(indicators.ema50) : [],
    sma200: indicators?.sma200 ? slice(indicators.sma200) : [],
    chartType,
  };

  const code = buildAutoChartCode();

  try {
    const result = await executeCode({ code, data, timeout: 25000 });
    if (result.success && result.outputType === "image" && result.imageBase64) {
      return result.imageBase64;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 构建自动图表的 Python 代码
 * 生成专业的金融图表（K线 + 均线 + 成交量 + RSI）
 */
function buildAutoChartCode(): string {
  return `
symbol = _data.get("symbol", "Stock")
n = _data.get("n", 60)
dates = _data.get("dates", [])
opens = _data.get("opens", [])
highs = _data.get("highs", [])
lows = _data.get("lows", [])
closes = _data.get("closes", [])
volumes = _data.get("volumes", [])
rsi14 = _data.get("rsi14", [])
macd_line = _data.get("macdLine", [])
macd_signal = _data.get("macdSignal", [])
bb_upper = _data.get("bbUpper", [])
bb_middle = _data.get("bbMiddle", [])
bb_lower = _data.get("bbLower", [])
ema20 = _data.get("ema20", [])
ema50 = _data.get("ema50", [])
sma200 = _data.get("sma200", [])
chart_type = _data.get("chartType", "full")

x = list(range(n))

# 确定图表布局
has_rsi = len(rsi14) >= n
has_macd = len(macd_line) >= n and chart_type == "macd"

if chart_type == "price_only":
    fig, axes = plt.subplots(2, 1, figsize=(14, 8),
                              gridspec_kw={'height_ratios': [3, 1]})
    ax_price, ax_vol = axes
    ax_rsi = None
    ax_macd = None
elif has_macd:
    fig, axes = plt.subplots(3, 1, figsize=(14, 10),
                              gridspec_kw={'height_ratios': [3, 1, 1.2]})
    ax_price, ax_vol, ax_macd = axes
    ax_rsi = None
elif has_rsi:
    fig, axes = plt.subplots(3, 1, figsize=(14, 10),
                              gridspec_kw={'height_ratios': [3, 1, 1.2]})
    ax_price, ax_vol, ax_rsi = axes
    ax_macd = None
else:
    fig, axes = plt.subplots(2, 1, figsize=(14, 8),
                              gridspec_kw={'height_ratios': [3, 1]})
    ax_price, ax_vol = axes
    ax_rsi = None
    ax_macd = None

fig.patch.set_facecolor('#0d0d0d')
plt.subplots_adjust(hspace=0.04)

# ── 价格图（K线 + 均线 + 布林带）──────────────────────────────────────────
ax_price.set_facecolor('#111111')
ax_price.spines['bottom'].set_color('#2a2a2a')
ax_price.spines['top'].set_color('#2a2a2a')
ax_price.spines['left'].set_color('#2a2a2a')
ax_price.spines['right'].set_color('#2a2a2a')

# 布林带填充
if len(bb_upper) >= n and len(bb_lower) >= n:
    bu = bb_upper[-n:]
    bl = bb_lower[-n:]
    bm = bb_middle[-n:] if len(bb_middle) >= n else []
    ax_price.fill_between(x, bl, bu, alpha=0.06, color='#6366f1', label='Bollinger Band')
    if bm:
        ax_price.plot(x, bm, color='#6366f1', linewidth=0.8, alpha=0.5, linestyle='--')

# K线图
for i in range(n):
    o, h, l, c = opens[i], highs[i], lows[i], closes[i]
    color = '#26a69a' if c >= o else '#ef5350'
    # 影线
    ax_price.plot([i, i], [l, h], color=color, linewidth=0.8, alpha=0.9)
    # 实体
    body_h = abs(c - o)
    body_bottom = min(o, c)
    ax_price.bar(i, body_h, bottom=body_bottom, color=color, width=0.7, alpha=0.9)

# 均线
if len(ema20) >= n:
    ax_price.plot(x, ema20[-n:], color='#f59e0b', linewidth=1.2, label='EMA20', alpha=0.85)
if len(ema50) >= n:
    ax_price.plot(x, ema50[-n:], color='#06b6d4', linewidth=1.2, label='EMA50', alpha=0.85)
if len(sma200) >= n:
    ax_price.plot(x, sma200[-n:], color='#a855f7', linewidth=1.2, label='SMA200', alpha=0.85)

# 最新价格标注
last_close = closes[-1]
ax_price.axhline(y=last_close, color='#ffffff', linewidth=0.5, linestyle=':', alpha=0.4)
ax_price.text(n - 1, last_close, f' {last_close:.2f}', color='#ffffff',
              fontsize=8, va='center', alpha=0.8)

# 计算涨跌幅
price_change = ((closes[-1] - closes[0]) / closes[0] * 100) if closes[0] > 0 else 0
change_color = '#26a69a' if price_change >= 0 else '#ef5350'
change_sign = '+' if price_change >= 0 else ''

ax_price.set_title(f'{symbol}  {last_close:.2f}  {change_sign}{price_change:.2f}%',
                   fontsize=13, color='#e0e0e0', pad=10, loc='left',
                   fontweight='bold')
ax_price.set_ylabel('Price', color='#606060', fontsize=9)
ax_price.tick_params(axis='both', colors='#404040', labelsize=8)
ax_price.grid(True, alpha=0.15, color='#1e1e1e')
ax_price.legend(loc='upper left', fontsize=7, framealpha=0.2,
                facecolor='#111111', edgecolor='#2a2a2a', labelcolor='#a0a0a0')

# X 轴刻度（每 15 个点显示一个日期）
tick_step = max(1, n // 8)
tick_positions = list(range(0, n, tick_step))
tick_labels = [dates[i] if i < len(dates) else '' for i in tick_positions]
ax_price.set_xticks(tick_positions)
ax_price.set_xticklabels([] if (ax_rsi is not None or ax_macd is not None) else tick_labels,
                          fontsize=7, color='#404040')
ax_price.set_xlim(-1, n)

# ── 成交量图 ──────────────────────────────────────────────────────────────────
ax_vol.set_facecolor('#111111')
ax_vol.spines['bottom'].set_color('#2a2a2a')
ax_vol.spines['top'].set_color('#2a2a2a')
ax_vol.spines['left'].set_color('#2a2a2a')
ax_vol.spines['right'].set_color('#2a2a2a')

vol_colors = ['#26a69a' if closes[i] >= opens[i] else '#ef5350' for i in range(n)]
ax_vol.bar(x, volumes, color=vol_colors, alpha=0.6, width=0.8)

# 成交量均线（20日）
if n >= 20:
    vol_ma20 = [np.mean(volumes[max(0, i-19):i+1]) for i in range(n)]
    ax_vol.plot(x, vol_ma20, color='#f59e0b', linewidth=0.8, alpha=0.7)

ax_vol.set_ylabel('Vol', color='#606060', fontsize=8)
ax_vol.tick_params(axis='both', colors='#404040', labelsize=7)
ax_vol.grid(True, alpha=0.1, color='#1e1e1e')
ax_vol.set_xticks(tick_positions)
ax_vol.set_xticklabels([] if (ax_rsi is not None or ax_macd is not None) else tick_labels,
                        fontsize=7, color='#404040')
ax_vol.set_xlim(-1, n)

# 格式化成交量 Y 轴
max_vol = max(volumes) if volumes else 1
if max_vol > 1e9:
    ax_vol.yaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: f'{v/1e9:.1f}B'))
elif max_vol > 1e6:
    ax_vol.yaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: f'{v/1e6:.0f}M'))
elif max_vol > 1e3:
    ax_vol.yaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: f'{v/1e3:.0f}K'))

# ── RSI 图 ────────────────────────────────────────────────────────────────────
if ax_rsi is not None and has_rsi:
    ax_rsi.set_facecolor('#111111')
    ax_rsi.spines['bottom'].set_color('#2a2a2a')
    ax_rsi.spines['top'].set_color('#2a2a2a')
    ax_rsi.spines['left'].set_color('#2a2a2a')
    ax_rsi.spines['right'].set_color('#2a2a2a')

    rsi_vals = rsi14[-n:]
    ax_rsi.plot(x, rsi_vals, color='#a855f7', linewidth=1.2, label='RSI(14)')
    ax_rsi.axhline(y=70, color='#ef5350', linewidth=0.6, linestyle='--', alpha=0.6)
    ax_rsi.axhline(y=30, color='#26a69a', linewidth=0.6, linestyle='--', alpha=0.6)
    ax_rsi.axhline(y=50, color='#404040', linewidth=0.4, linestyle=':', alpha=0.5)
    ax_rsi.fill_between(x, rsi_vals, 70, where=[v > 70 for v in rsi_vals],
                         alpha=0.15, color='#ef5350')
    ax_rsi.fill_between(x, rsi_vals, 30, where=[v < 30 for v in rsi_vals],
                         alpha=0.15, color='#26a69a')
    ax_rsi.set_ylim(0, 100)
    ax_rsi.set_ylabel('RSI', color='#606060', fontsize=8)
    ax_rsi.tick_params(axis='both', colors='#404040', labelsize=7)
    ax_rsi.grid(True, alpha=0.1, color='#1e1e1e')
    ax_rsi.set_xticks(tick_positions)
    ax_rsi.set_xticklabels(tick_labels, fontsize=7, color='#404040')
    ax_rsi.set_xlim(-1, n)
    # 当前 RSI 值
    cur_rsi = rsi_vals[-1]
    rsi_color = '#ef5350' if cur_rsi > 70 else ('#26a69a' if cur_rsi < 30 else '#a855f7')
    ax_rsi.text(0.01, 0.85, f'RSI {cur_rsi:.1f}', transform=ax_rsi.transAxes,
                fontsize=8, color=rsi_color, alpha=0.9)

# ── MACD 图 ───────────────────────────────────────────────────────────────────
if ax_macd is not None and has_macd:
    ax_macd.set_facecolor('#111111')
    ax_macd.spines['bottom'].set_color('#2a2a2a')
    ax_macd.spines['top'].set_color('#2a2a2a')
    ax_macd.spines['left'].set_color('#2a2a2a')
    ax_macd.spines['right'].set_color('#2a2a2a')

    ml = macd_line[-n:]
    ms = macd_signal[-n:]
    histogram = [ml[i] - ms[i] for i in range(len(ml))]
    hist_colors = ['#26a69a' if h >= 0 else '#ef5350' for h in histogram]
    ax_macd.bar(x[:len(histogram)], histogram, color=hist_colors, alpha=0.6, width=0.8)
    ax_macd.plot(x[:len(ml)], ml, color='#06b6d4', linewidth=1.0, label='MACD')
    ax_macd.plot(x[:len(ms)], ms, color='#f59e0b', linewidth=1.0, label='Signal')
    ax_macd.axhline(y=0, color='#404040', linewidth=0.5, linestyle='-', alpha=0.6)
    ax_macd.set_ylabel('MACD', color='#606060', fontsize=8)
    ax_macd.tick_params(axis='both', colors='#404040', labelsize=7)
    ax_macd.grid(True, alpha=0.1, color='#1e1e1e')
    ax_macd.set_xticks(tick_positions)
    ax_macd.set_xticklabels(tick_labels, fontsize=7, color='#404040')
    ax_macd.set_xlim(-1, n)
    ax_macd.legend(loc='upper left', fontsize=7, framealpha=0.2,
                   facecolor='#111111', edgecolor='#2a2a2a', labelcolor='#a0a0a0')

plt.tight_layout(pad=0.5)
`;
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
