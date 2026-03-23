/**
 * alphalensApi.ts
 * 封装 alphalens-reloaded 和 bidask 的 Python 子进程调用
 * - computeAlphaIC: 计算 Alpha 因子信息系数（IC/IR）
 * - estimateLiquidity: 从 OHLC 数据估算买卖价差（流动性因子）
 */
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { fileURLToPath } from "url";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

export interface FactorHistoryPoint {
  date: string;
  value: number;
  forward_return: number;
}

export interface FactorICInput {
  name: string;
  history: FactorHistoryPoint[];
}

export interface FactorICResult {
  name: string;
  ic_mean: number | null;
  ic_std: number | null;
  ir: number | null;
  ic_positive_pct: number | null;
  ic_series: Array<{ date: string; ic: number }>;
  note?: string;
}

export interface AlphaICOutput {
  factors: FactorICResult[];
}

export interface OHLCPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface LiquidityResult {
  ticker: string;
  spread_pct: number | null;
  spread_bps: number | null;
  liquidity_score: number | null;
  liquidity_label: string;
  method: string;
  data_points: number;
  error?: string;
}

// ─── 核心函数 ─────────────────────────────────────────────────────────────────

/**
 * 调用 alphalens_ic.py 计算因子 IC 统计
 */
export async function computeAlphaIC(factors: FactorICInput[]): Promise<AlphaICOutput> {
  const scriptPath = path.join(__dirname, "alphalens_ic.py");
  const inputJson = JSON.stringify({ factors });

  try {
    const { stdout } = await execFileAsync(
      "python3",
      ["-c", `
import sys, json, subprocess
result = subprocess.run(
    ["python3", "${scriptPath.replace(/\\/g, "/")}"],
    input=${JSON.stringify(inputJson)},
    capture_output=True, text=True, timeout=30
)
print(result.stdout)
if result.stderr:
    import sys; print(result.stderr, file=sys.stderr)
`],
      { timeout: 35000 }
    );
    return JSON.parse(stdout.toString().trim()) as AlphaICOutput;
  } catch (err) {
    // 降级：直接运行脚本文件
    try {
      const { stdout } = await execFileAsync(
        "python3",
        [scriptPath],
        {
          timeout: 35000,
          input: inputJson,
          maxBuffer: 1024 * 1024,
        } as Parameters<typeof execFileAsync>[2] & { input: string }
      );
      return JSON.parse(stdout.toString().trim()) as AlphaICOutput;
    } catch {
      return { factors: factors.map(f => ({
        name: f.name,
        ic_mean: null,
        ic_std: null,
        ir: null,
        ic_positive_pct: null,
        ic_series: [],
        note: "Python 子进程调用失败"
      })) };
    }
  }
}

/**
 * 调用 bidask_spread.py 估算买卖价差（流动性因子）
 */
export async function estimateLiquidity(ticker: string, ohlc: OHLCPoint[]): Promise<LiquidityResult> {
  const scriptPath = path.join(__dirname, "bidask_spread.py");
  const inputJson = JSON.stringify({ ticker, ohlc });

  try {
    const { stdout } = await execFileAsync(
      "python3",
      [scriptPath],
      {
        timeout: 30000,
        input: inputJson,
        maxBuffer: 512 * 1024,
      } as Parameters<typeof execFileAsync>[2] & { input: string }
    );
    return JSON.parse(stdout.toString().trim()) as LiquidityResult;
  } catch {
    // 降级：使用简单的 HL 代理估算
    if (ohlc.length >= 5) {
      const hlRatios = ohlc.map(d => (d.high - d.low) / d.close);
      const avgHL = hlRatios.reduce((a, b) => a + b, 0) / hlRatios.length;
      const spreadPct = avgHL * 0.3;
      const spreadBps = spreadPct * 10000;
      return {
        ticker,
        spread_pct: Math.round(spreadPct * 1000000) / 1000000,
        spread_bps: Math.round(spreadBps * 100) / 100,
        liquidity_score: Math.max(5, Math.min(95, 80 - spreadBps * 2)),
        liquidity_label: spreadBps < 15 ? "高流动性" : spreadBps < 50 ? "中等流动性" : "低流动性",
        method: "HL_Proxy_Fallback",
        data_points: ohlc.length,
      };
    }
    return {
      ticker,
      spread_pct: null,
      spread_bps: null,
      liquidity_score: null,
      liquidity_label: "数据不足",
      method: "N/A",
      data_points: ohlc.length,
      error: "数据不足或计算失败",
    };
  }
}

/**
 * 将 alphalens IC 结果格式化为 AlphaFactorCard 可用的摘要
 */
export function formatICForCard(icOutput: AlphaICOutput): {
  overallIR: number | null;
  topFactors: Array<{ name: string; ir: number; icMean: number; quality: string }>;
  weakFactors: Array<{ name: string; ir: number; icMean: number }>;
} {
  const validFactors = icOutput.factors.filter(f => f.ir !== null && f.ic_mean !== null);

  const topFactors = validFactors
    .filter(f => Math.abs(f.ir!) > 0.3)
    .sort((a, b) => Math.abs(b.ir!) - Math.abs(a.ir!))
    .slice(0, 5)
    .map(f => ({
      name: f.name,
      ir: f.ir!,
      icMean: f.ic_mean!,
      quality: Math.abs(f.ir!) > 1.0 ? "优秀" : Math.abs(f.ir!) > 0.5 ? "良好" : "一般",
    }));

  const weakFactors = validFactors
    .filter(f => Math.abs(f.ir!) <= 0.3)
    .map(f => ({ name: f.name, ir: f.ir!, icMean: f.ic_mean! }));

  const irs = validFactors.map(f => f.ir!).filter(v => !isNaN(v));
  const overallIR = irs.length > 0 ? irs.reduce((a, b) => a + b, 0) / irs.length : null;

  return { overallIR, topFactors, weakFactors };
}
