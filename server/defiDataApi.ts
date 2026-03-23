/**
 * defiDataApi.ts — goat-sdk/goat 风格的 DeFi 链上数据集成
 *
 * 参考架构：
 *   - goat-sdk/goat: https://github.com/goat-sdk/goat
 *   - "The largest agentic finance toolkit for AI agents"
 *   - 核心理念：AI Agent 可以直接与链上协议交互，获取实时 DeFi 数据
 *
 * 数据来源：
 *   - DeFiLlama API（公开免费）：TVL、协议数据、yield pools
 *   - CoinGecko API（已有密钥）：代币价格、市值、DeFi 统计
 *
 * 核心功能：
 *   1. DeFi 总览：全球 DeFi TVL、链上分布、主要协议排名
 *   2. 协议查询：给定协议名 → TVL、链分布、历史数据
 *   3. Yield 池查询：最高收益率池、稳定币池、特定链的池
 *   4. 代币 DeFi 数据：给定代币 → 相关协议、流动性、收益机会
 *   5. 跨链分析：各链 TVL 对比、资金流向
 */

// Node.js 22 内置 fetch，无需导入

// ── 类型定义 ──────────────────────────────────────────────────────────────────

export interface DeFiProtocol {
  name: string;
  symbol: string;
  category: string;
  chain: string;
  chains: string[];
  tvl: number;
  change1h?: number;
  change1d?: number;
  change7d?: number;
  mcap?: number;
  url?: string;
  description?: string;
}

export interface YieldPool {
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apy: number;
  apyBase?: number;
  apyReward?: number;
  stablecoin: boolean;
  ilRisk?: string;
  poolMeta?: string;
}

export interface ChainTVL {
  name: string;
  tvl: number;
  tokenSymbol?: string;
}

export interface DeFiOverview {
  totalTvl: number;
  totalTvlChange24h?: number;
  topChains: ChainTVL[];
  topProtocols: DeFiProtocol[];
  topYieldPools: YieldPool[];
  defiCategories: Record<string, number>;
  fetchedAt: number;
}

export interface ProtocolDetail extends DeFiProtocol {
  tvlHistory?: { date: number; tvl: number }[];
  currentTvlByChain?: Record<string, number>;
}

// ── API 请求工具 ──────────────────────────────────────────────────────────────

const DEFILLAMA_BASE = "https://api.llama.fi";
const DEFILLAMA_YIELDS = "https://yields.llama.fi";

async function llamaFetch<T>(path: string, timeout = 15000): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const resp = await fetch(`${DEFILLAMA_BASE}${path}`, {
      signal: controller.signal,
      headers: { "Accept": "application/json" },
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    return (await resp.json()) as T;
  } catch {
    return null;
  }
}

async function llamaYieldsFetch<T>(path: string, timeout = 20000): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const resp = await fetch(`${DEFILLAMA_YIELDS}${path}`, {
      signal: controller.signal,
      headers: { "Accept": "application/json" },
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    return (await resp.json()) as T;
  } catch {
    return null;
  }
}

// ── 核心数据获取函数 ──────────────────────────────────────────────────────────

/**
 * 获取 DeFi 全局总览
 */
export async function getDeFiOverview(): Promise<DeFiOverview> {
  const [protocolsData, chainsData, yieldData] = await Promise.all([
    llamaFetch<DeFiProtocol[]>("/protocols"),
    llamaFetch<ChainTVL[]>("/v2/chains"),
    llamaYieldsFetch<{ data: YieldPool[] }>("/pools"),
  ]);

  // 处理协议数据
  const protocols = (protocolsData || []) as Array<{
    name: string; symbol: string; category: string; chain: string; chains: string[];
    tvl: number; change_1h: number; change_1d: number; change_7d: number; mcap: number; url: string; description: string;
  }>;

  const topProtocols: DeFiProtocol[] = protocols
    .filter(p => p.category !== "CEX" && p.tvl > 0)
    .sort((a, b) => b.tvl - a.tvl)
    .slice(0, 20)
    .map(p => ({
      name: p.name,
      symbol: p.symbol || "",
      category: p.category || "DeFi",
      chain: p.chain || "Multi-Chain",
      chains: p.chains || [],
      tvl: p.tvl,
      change1h: p.change_1h,
      change1d: p.change_1d,
      change7d: p.change_7d,
      mcap: p.mcap,
      url: p.url,
      description: p.description,
    }));

  // 计算总 DeFi TVL（排除 CEX）
  const totalTvl = topProtocols.reduce((sum, p) => sum + (p.tvl || 0), 0);

  // 处理链数据
  const topChains: ChainTVL[] = ((chainsData || []) as Array<{ name: string; tvl: number; tokenSymbol?: string }>)
    .sort((a, b) => b.tvl - a.tvl)
    .slice(0, 15)
    .map(c => ({ name: c.name, tvl: c.tvl, tokenSymbol: c.tokenSymbol }));

  // 处理 Yield 池数据
  const pools = (yieldData?.data || []) as YieldPool[];
  const topYieldPools: YieldPool[] = pools
    .filter(p => p.tvlUsd > 1e7 && p.apy > 0 && p.apy < 1000) // 过滤异常值
    .sort((a, b) => b.apy - a.apy)
    .slice(0, 20);

  // 按类别统计 TVL
  const defiCategories: Record<string, number> = {};
  for (const p of protocols.filter(p => p.category !== "CEX")) {
    const cat = p.category || "Other";
    defiCategories[cat] = (defiCategories[cat] || 0) + (p.tvl || 0);
  }

  return {
    totalTvl,
    topChains,
    topProtocols,
    topYieldPools,
    defiCategories,
    fetchedAt: Date.now(),
  };
}

/**
 * 获取特定协议详情
 */
export async function getProtocolDetail(protocolSlug: string): Promise<ProtocolDetail | null> {
  const data = await llamaFetch<{
    name: string; symbol: string; category: string; chain: string; chains: string[];
    tvl: number | Array<{ date: number; totalLiquidityUSD: number }>;
    change_1h: number; change_1d: number; change_7d: number; mcap: number;
    url: string; description: string;
    currentChainTvls: Record<string, number>;
    chainTvls: Record<string, number>;
  }>(`/protocol/${protocolSlug}`);

  if (!data) return null;

  // DeFiLlama protocol detail 的 tvl 字段是历史数组，当前 TVL 需从 currentChainTvls 计算
  const currentChainTvls = data.currentChainTvls || data.chainTvls || {};
  const currentTvl = Object.entries(currentChainTvls)
    .filter(([k]) => !k.toLowerCase().includes("borrowed") && !k.toLowerCase().includes("staking"))
    .reduce((sum, [, v]) => sum + (v || 0), 0);

  // tvl 如果是数字直接用，如果是数组取最后一个元素
  const tvlValue = typeof data.tvl === "number"
    ? data.tvl
    : (Array.isArray(data.tvl) && data.tvl.length > 0
      ? data.tvl[data.tvl.length - 1].totalLiquidityUSD
      : currentTvl);

  const tvl = tvlValue || currentTvl;

  // 历史 TVL
  const tvlHistory = Array.isArray(data.tvl)
    ? data.tvl.slice(-30).map((h) => ({ date: h.date, tvl: h.totalLiquidityUSD }))
    : undefined;

  return {
    name: data.name,
    symbol: data.symbol || "",
    category: data.category || "DeFi",
    chain: data.chain || "Multi-Chain",
    chains: data.chains || [],
    tvl,
    change1h: data.change_1h,
    change1d: data.change_1d,
    change7d: data.change_7d,
    mcap: data.mcap,
    url: data.url,
    description: data.description,
    currentTvlByChain: currentChainTvls,
    tvlHistory,
  };
}

/**
 * 搜索 DeFi 协议（按名称模糊匹配）
 */
export async function searchDeFiProtocols(query: string): Promise<DeFiProtocol[]> {
  const data = await llamaFetch<Array<{
    name: string; symbol: string; category: string; chain: string; chains: string[];
    tvl: number; change_1h: number; change_1d: number; change_7d: number; mcap: number; url: string;
  }>>("/protocols");

  if (!data) return [];

  const lower = query.toLowerCase();
  return data
    .filter(p =>
      p.name?.toLowerCase().includes(lower) ||
      p.symbol?.toLowerCase().includes(lower)
    )
    .sort((a, b) => (b.tvl || 0) - (a.tvl || 0))
    .slice(0, 10)
    .map(p => ({
      name: p.name,
      symbol: p.symbol || "",
      category: p.category || "DeFi",
      chain: p.chain || "Multi-Chain",
      chains: p.chains || [],
      tvl: p.tvl,
      change1h: p.change_1h,
      change1d: p.change_1d,
      change7d: p.change_7d,
      mcap: p.mcap,
      url: p.url,
    }));
}

/**
 * 获取特定链的 Yield 池
 */
export async function getYieldPoolsByChain(
  chain: string,
  minTvl = 1e6,
  limit = 20
): Promise<YieldPool[]> {
  const data = await llamaYieldsFetch<{ data: YieldPool[] }>("/pools");
  if (!data?.data) return [];

  return data.data
    .filter(p =>
      p.chain?.toLowerCase() === chain.toLowerCase() &&
      p.tvlUsd >= minTvl &&
      p.apy > 0 &&
      p.apy < 500
    )
    .sort((a, b) => b.apy - a.apy)
    .slice(0, limit);
}

/**
 * 获取稳定币 Yield 池（低风险收益）
 */
export async function getStablecoinYieldPools(minTvl = 1e7, limit = 15): Promise<YieldPool[]> {
  const data = await llamaYieldsFetch<{ data: YieldPool[] }>("/pools");
  if (!data?.data) return [];

  return data.data
    .filter(p =>
      p.stablecoin === true &&
      p.tvlUsd >= minTvl &&
      p.apy > 0 &&
      p.apy < 100
    )
    .sort((a, b) => b.apy - a.apy)
    .slice(0, limit);
}

// ── 格式化输出 ─────────────────────────────────────────────────────────────────

/**
 * 格式化 DeFi 总览报告
 */
export function formatDeFiOverview(overview: DeFiOverview): string {
  const lines: string[] = [
    `## DeFi 链上数据总览（goat-sdk/goat 架构 · DeFiLlama）`,
    ``,
    `**全球 DeFi TVL：** $${(overview.totalTvl / 1e9).toFixed(2)}B  |  **数据时间：** ${new Date(overview.fetchedAt).toLocaleString("zh-CN")}`,
    ``,
  ];

  // 主链 TVL 分布
  lines.push(`### 主要区块链 TVL 排名`);
  lines.push(`| 链 | TVL | 占比 |`);
  lines.push(`|---|---|---|`);
  const totalChainTvl = overview.topChains.reduce((s, c) => s + c.tvl, 0);
  for (const chain of overview.topChains.slice(0, 10)) {
    const pct = totalChainTvl > 0 ? ((chain.tvl / totalChainTvl) * 100).toFixed(1) : "0";
    lines.push(`| ${chain.name} | $${(chain.tvl / 1e9).toFixed(2)}B | ${pct}% |`);
  }
  lines.push(``);

  // 顶级 DeFi 协议
  lines.push(`### 顶级 DeFi 协议（按 TVL）`);
  lines.push(`| 协议 | 类别 | TVL | 24h变化 | 主链 |`);
  lines.push(`|---|---|---|---|---|`);
  for (const p of overview.topProtocols.slice(0, 15)) {
    const change = p.change1d !== undefined
      ? `${p.change1d >= 0 ? "+" : ""}${p.change1d.toFixed(1)}%`
      : "N/A";
    lines.push(`| **${p.name}** | ${p.category} | $${(p.tvl / 1e9).toFixed(2)}B | ${change} | ${p.chain} |`);
  }
  lines.push(``);

  // 协议类别 TVL 分布
  const sortedCats = Object.entries(overview.defiCategories)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8);
  if (sortedCats.length > 0) {
    lines.push(`### DeFi 类别 TVL 分布`);
    lines.push(`| 类别 | TVL |`);
    lines.push(`|---|---|`);
    for (const [cat, tvl] of sortedCats) {
      lines.push(`| ${cat} | $${(tvl / 1e9).toFixed(2)}B |`);
    }
    lines.push(``);
  }

  // 高收益池
  if (overview.topYieldPools.length > 0) {
    lines.push(`### 高收益 Yield 池（TVL > $10M）`);
    lines.push(`| 池 | 协议 | 链 | APY | TVL | 稳定币 |`);
    lines.push(`|---|---|---|---|---|---|`);
    for (const pool of overview.topYieldPools.slice(0, 10)) {
      const stable = pool.stablecoin ? "✓" : "—";
      lines.push(`| ${pool.symbol} | ${pool.project} | ${pool.chain} | **${pool.apy.toFixed(1)}%** | $${(pool.tvlUsd / 1e6).toFixed(0)}M | ${stable} |`);
    }
    lines.push(``);
  }

  lines.push(`> **数据来源：** DeFiLlama（goat-sdk/goat DeFi 数据架构）`);

  return lines.join("\n");
}

/**
 * 格式化协议详情报告
 */
export function formatProtocolDetail(protocol: ProtocolDetail): string {
  const lines: string[] = [
    `## DeFi 协议详情 — ${protocol.name}`,
    ``,
    `| 字段 | 值 |`,
    `|---|---|`,
    `| 类别 | ${protocol.category} |`,
    `| 主链 | ${protocol.chain} |`,
    `| 所有链 | ${protocol.chains.slice(0, 8).join(", ")} |`,
    `| **当前 TVL** | **$${(protocol.tvl / 1e9).toFixed(3)}B** |`,
    protocol.change1h !== undefined ? `| 1小时变化 | ${protocol.change1h >= 0 ? "+" : ""}${protocol.change1h.toFixed(2)}% |` : "",
    protocol.change1d !== undefined ? `| 24小时变化 | ${protocol.change1d >= 0 ? "+" : ""}${protocol.change1d.toFixed(2)}% |` : "",
    protocol.change7d !== undefined ? `| 7天变化 | ${protocol.change7d >= 0 ? "+" : ""}${protocol.change7d.toFixed(2)}% |` : "",
    protocol.mcap ? `| 市值 | $${(protocol.mcap / 1e9).toFixed(2)}B |` : "",
    protocol.url ? `| 官网 | ${protocol.url} |` : "",
    ``,
  ].filter(l => l !== "");

  // 各链 TVL 分布
  if (protocol.currentTvlByChain && Object.keys(protocol.currentTvlByChain).length > 0) {
    const chainEntries = Object.entries(protocol.currentTvlByChain)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8);
    lines.push(`### 各链 TVL 分布`);
    lines.push(`| 链 | TVL |`);
    lines.push(`|---|---|`);
    for (const [chain, tvl] of chainEntries) {
      lines.push(`| ${chain} | $${(tvl / 1e6).toFixed(0)}M |`);
    }
    lines.push(``);
  }

  if (protocol.description) {
    lines.push(`### 协议简介`);
    lines.push(`> ${protocol.description.slice(0, 300)}${protocol.description.length > 300 ? "..." : ""}`);
    lines.push(``);
  }

  lines.push(`> **数据来源：** DeFiLlama（goat-sdk/goat DeFi 数据架构）`);

  return lines.join("\n");
}

// ── 任务检测 ──────────────────────────────────────────────────────────────────

const DEFI_KEYWORDS = [
  "defi", "dex", "yield", "liquidity", "tvl", "aave", "uniswap", "compound",
  "curve", "lido", "makerdao", "dai", "usdc", "usdt", "wbtc", "eth staking",
  "链上", "去中心化", "流动性", "质押", "收益率", "借贷协议", "稳定币",
  "layer2", "l2", "arbitrum", "optimism", "base", "polygon",
];

/**
 * 检测任务描述是否需要 DeFi 数据
 */
export function needsDeFiData(taskDescription: string): boolean {
  const lower = taskDescription.toLowerCase();
  return DEFI_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * 从任务描述中提取 DeFi 协议名称
 */
export function extractDeFiProtocols(taskDescription: string): string[] {
  const knownProtocols = [
    "aave", "uniswap", "compound", "curve", "lido", "makerdao",
    "balancer", "yearn", "convex", "frax", "rocket pool", "eigenlayer",
    "pendle", "morpho", "spark", "fluid", "sky", "hyperliquid",
  ];
  const lower = taskDescription.toLowerCase();
  return knownProtocols.filter(p => lower.includes(p));
}
