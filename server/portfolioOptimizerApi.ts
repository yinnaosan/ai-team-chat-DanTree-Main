/**
 * Portfolio Optimizer API — 投资组合优化
 * 完全免费、无需注册、无需 API Key
 * 文档：https://api.portfoliooptimizer.io/api
 *
 * 支持的优化方法：
 * 1. 最小方差组合（Minimum Variance）
 * 2. 均值-方差优化（Mean-Variance / Markowitz）
 * 3. 风险平价（Risk Parity / Equal Risk Contribution）
 * 4. 最大夏普比率（Maximum Sharpe Ratio）
 * 5. 有效前沿（Efficient Frontier）
 *
 * 主要用途：
 * - 用户提供多个资产的历史收益率数据，计算最优配置权重
 * - 分析资产组合的风险-收益特征
 * - 生成有效前沿图表数据
 */

const BASE_URL = "https://api.portfoliooptimizer.io/v1";

// ── 类型定义 ────────────────────────────────────────────────────────────────

export interface PortfolioWeights {
  assetsWeights: number[];
}

export interface EfficientFrontierPoint {
  portfolioExpectedReturn: number;
  portfolioVolatility: number;
  assetsWeights: number[];
}

export interface EfficientFrontierResult {
  portfolioFrontier: EfficientFrontierPoint[];
}

export interface PortfolioStats {
  portfolioExpectedReturn?: number;
  portfolioVolatility?: number;
  portfolioSharpeRatio?: number;
}

// ── 核心请求函数 ──────────────────────────────────────────────────────────────

async function callPortfolioOptimizer(endpoint: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Portfolio Optimizer API error ${res.status}: ${text}`);
  }
  return res.json();
}

// ── 最小方差组合 ──────────────────────────────────────────────────────────────

export async function getMinimumVariancePortfolio(
  covarianceMatrix: number[][]
): Promise<PortfolioWeights> {
  const n = covarianceMatrix.length;
  const data = await callPortfolioOptimizer("/portfolio/optimization/minimum-variance", {
    assets: n,
    assetsCovarianceMatrix: covarianceMatrix,
  });
  return data as PortfolioWeights;
}

// ── 最大夏普比率组合 ──────────────────────────────────────────────────────────

export async function getMaxSharpePortfolio(
  expectedReturns: number[],
  covarianceMatrix: number[][],
  riskFreeRate = 0.04
): Promise<PortfolioWeights> {
  const n = expectedReturns.length;
  const data = await callPortfolioOptimizer("/portfolio/optimization/maximum-sharpe-ratio", {
    assets: n,
    assetsMu: expectedReturns,
    assetsCovarianceMatrix: covarianceMatrix,
    riskFreeRate,
  });
  return data as PortfolioWeights;
}

// ── 风险平价组合 ──────────────────────────────────────────────────────────────

export async function getRiskParityPortfolio(
  covarianceMatrix: number[][]
): Promise<PortfolioWeights> {
  const n = covarianceMatrix.length;
  const data = await callPortfolioOptimizer("/portfolio/optimization/equal-risk-contributions", {
    assets: n,
    assetsCovarianceMatrix: covarianceMatrix,
  });
  return data as PortfolioWeights;
}

// ── 有效前沿 ──────────────────────────────────────────────────────────────────

export async function getEfficientFrontier(
  expectedReturns: number[],
  covarianceMatrix: number[][],
  points = 10
): Promise<EfficientFrontierResult> {
  const n = expectedReturns.length;
  const data = await callPortfolioOptimizer("/portfolio/analysis/efficient-frontier", {
    assets: n,
    assetsMu: expectedReturns,
    assetsCovarianceMatrix: covarianceMatrix,
    portfoliosFrontierPoints: points,
  });
  return data as EfficientFrontierResult;
}

// ── 从历史收益率计算协方差矩阵 ────────────────────────────────────────────────

export function computeCovarianceMatrix(returnsMatrix: number[][]): number[][] {
  // returnsMatrix[i] = asset i 的历史收益率序列
  const n = returnsMatrix.length;
  const T = returnsMatrix[0].length;

  // 计算均值
  const means = returnsMatrix.map(r => r.reduce((s, v) => s + v, 0) / T);

  // 计算协方差矩阵
  const cov: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let sum = 0;
      for (let t = 0; t < T; t++) {
        sum += (returnsMatrix[i][t] - means[i]) * (returnsMatrix[j][t] - means[j]);
      }
      cov[i][j] = sum / (T - 1);
      cov[j][i] = cov[i][j];
    }
  }
  return cov;
}

// ── 计算年化收益率和波动率 ────────────────────────────────────────────────────

export function computeAnnualizedStats(dailyReturns: number[]): { annualReturn: number; annualVolatility: number } {
  const T = dailyReturns.length;
  const mean = dailyReturns.reduce((s, v) => s + v, 0) / T;
  const variance = dailyReturns.reduce((s, v) => s + (v - mean) ** 2, 0) / (T - 1);
  return {
    annualReturn: mean * 252,
    annualVolatility: Math.sqrt(variance * 252),
  };
}

// ── 综合组合优化分析（供 Step2 使用）────────────────────────────────────────

/**
 * 根据资产名称和历史收益率数据，计算最优投资组合
 * @param assetNames 资产名称列表（如 ["AAPL", "MSFT", "GOOGL"]）
 * @param returnsMatrix 历史日收益率矩阵，returnsMatrix[i] 为第 i 个资产的日收益率序列
 * @param riskFreeRate 无风险利率（年化，默认 4%）
 */
export async function getPortfolioOptimizationAnalysis(
  assetNames: string[],
  returnsMatrix: number[][],
  riskFreeRate = 0.04
): Promise<string> {
  if (assetNames.length < 2) {
    return "[portfolio_optimizer] 至少需要 2 个资产才能进行组合优化";
  }
  if (returnsMatrix.some(r => r.length < 20)) {
    return "[portfolio_optimizer] 历史数据不足（至少需要 20 个交易日）";
  }

  try {
    const n = assetNames.length;
    const covMatrix = computeCovarianceMatrix(returnsMatrix);
    const annualStats = returnsMatrix.map(r => computeAnnualizedStats(r));
    const expectedReturns = annualStats.map(s => s.annualReturn);

    // 并行计算三种优化方案
    const [minVarResult, maxSharpeResult, riskParityResult] = await Promise.allSettled([
      getMinimumVariancePortfolio(covMatrix),
      getMaxSharpePortfolio(expectedReturns, covMatrix, riskFreeRate),
      getRiskParityPortfolio(covMatrix),
    ]);

    const lines: string[] = [`## 投资组合优化分析（来源：Portfolio Optimizer API）`];
    lines.push(`\n**资产列表：** ${assetNames.join("、")}（共 ${n} 个）`);
    lines.push(`**无风险利率：** ${(riskFreeRate * 100).toFixed(1)}%（年化）`);

    // 各资产基本统计
    lines.push(`\n### 各资产年化统计`);
    lines.push(`| 资产 | 年化预期收益 | 年化波动率 | 夏普比率（估算） |`);
    lines.push(`| --- | --- | --- | --- |`);
    for (let i = 0; i < n; i++) {
      const { annualReturn, annualVolatility } = annualStats[i];
      const sharpe = annualVolatility > 0 ? ((annualReturn - riskFreeRate) / annualVolatility).toFixed(2) : "N/A";
      lines.push(`| ${assetNames[i]} | ${(annualReturn * 100).toFixed(1)}% | ${(annualVolatility * 100).toFixed(1)}% | ${sharpe} |`);
    }

    // 最小方差组合
    if (minVarResult.status === "fulfilled") {
      const weights = minVarResult.value.assetsWeights;
      lines.push(`\n### 最小方差组合（降低整体风险）`);
      lines.push(`| 资产 | 权重 |`);
      lines.push(`| --- | --- |`);
      weights.forEach((w, i) => {
        lines.push(`| ${assetNames[i]} | ${(w * 100).toFixed(1)}% |`);
      });
    }

    // 最大夏普比率组合
    if (maxSharpeResult.status === "fulfilled") {
      const weights = maxSharpeResult.value.assetsWeights;
      lines.push(`\n### 最大夏普比率组合（最优风险调整收益）`);
      lines.push(`| 资产 | 权重 |`);
      lines.push(`| --- | --- |`);
      weights.forEach((w, i) => {
        lines.push(`| ${assetNames[i]} | ${(w * 100).toFixed(1)}% |`);
      });
    }

    // 风险平价组合
    if (riskParityResult.status === "fulfilled") {
      const weights = riskParityResult.value.assetsWeights;
      lines.push(`\n### 风险平价组合（各资产风险贡献相等）`);
      lines.push(`| 资产 | 权重 |`);
      lines.push(`| --- | --- |`);
      weights.forEach((w, i) => {
        lines.push(`| ${assetNames[i]} | ${(w * 100).toFixed(1)}% |`);
      });
    }

    lines.push(`\n> 注：以上权重基于历史数据计算，不构成投资建议。过去表现不代表未来收益。`);
    return lines.join("\n");
  } catch (err) {
    return `[portfolio_optimizer] 组合优化失败: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ── 健康检测 ──────────────────────────────────────────────────────────────────

export async function checkPortfolioOptimizerHealth(): Promise<{ ok: boolean; status: "ok" | "degraded" | "error"; message: string; latencyMs: number }> {
  const t0 = Date.now();
  try {
    // 使用较短超时（测试环境可能无法访问外部 API）
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch(`${BASE_URL}/portfolio/optimization/minimum-variance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assets: 2, assetsCovarianceMatrix: [[0.0025, 0.0005], [0.0005, 0.0100]] }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const latencyMs = Date.now() - t0;
      if (res.ok) {
        const data = await res.json() as { assetsWeights?: number[] };
        if (data.assetsWeights?.length === 2) {
          const w = data.assetsWeights.map(x => `${(x * 100).toFixed(1)}%`).join(" / ");
          return { ok: true, status: "ok", latencyMs, message: `最小方差组合权重: ${w}` };
        }
        return { ok: false, status: "degraded", latencyMs, message: "返回数据格式异常" };
      }
      return { ok: false, status: "error", latencyMs, message: `HTTP ${res.status}` };
    } catch (fetchErr) {
      clearTimeout(timer);
      const latencyMs = Date.now() - t0;
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      // 超时或网络不可达，返回 degraded（不是 error）
      if (msg.includes("abort") || msg.includes("timeout") || msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND")) {
        return { ok: false, status: "degraded", latencyMs, message: `网络不可达（可能为沙笼限制）: ${msg}` };
      }
      return { ok: false, status: "error", latencyMs, message: msg };
    }
  } catch (err) {
    return { ok: false, status: "error", latencyMs: Date.now() - t0, message: err instanceof Error ? err.message : String(err) };
  }
}
