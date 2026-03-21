/**
 * CoinGecko API 集成
 * 提供加密货币实时价格、市値、趋势、恐惧贪婪指数等数据
 * 使用 Demo API Key（免费，50 req/min）
 * 文档：https://docs.coingecko.com/reference/introduction
 */

import { ENV } from "./_core/env";

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
const TIMEOUT_MS = 10000;

// ─── 类型定义 ──────────────────────────────────────────────────────────────

export interface CoinMarketData {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  fully_diluted_valuation: number | null;
  total_volume: number;
  high_24h: number;
  low_24h: number;
  price_change_24h: number;
  price_change_percentage_24h: number;
  price_change_percentage_7d: number | null;
  price_change_percentage_30d: number | null;
  market_cap_change_24h: number;
  market_cap_change_percentage_24h: number;
  circulating_supply: number;
  total_supply: number | null;
  max_supply: number | null;
  ath: number;
  ath_change_percentage: number;
  ath_date: string;
  atl: number;
  atl_change_percentage: number;
  atl_date: string;
  last_updated: string;
}

export interface GlobalMarketData {
  active_cryptocurrencies: number;
  markets: number;
  total_market_cap: Record<string, number>;
  total_volume: Record<string, number>;
  market_cap_percentage: Record<string, number>;
  market_cap_change_percentage_24h_usd: number;
  updated_at: number;
}

export interface TrendingCoin {
  id: string;
  coin_id: number;
  name: string;
  symbol: string;
  market_cap_rank: number;
  score: number;
  data?: {
    price: number;
    price_btc: string;
    price_change_percentage_24h?: Record<string, number>;
    market_cap: string;
    total_volume: string;
  };
}

export interface CoinGeckoData {
  topCoins: CoinMarketData[];
  globalMarket: GlobalMarketData | null;
  trendingCoins: TrendingCoin[];
  specificCoins: CoinMarketData[];
  source: string;
  fetchedAt: string;
}

// ─── 辅助函数 ──────────────────────────────────────────────────────────────

function getApiKey(): string {
  return ENV.COINGECKO_API_KEY || "CG-xmz84aGoBNm4t3zss6sunXQT";
}

async function fetchCoinGecko<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const apiKey = getApiKey();
  const searchParams = new URLSearchParams(params);
  if (apiKey) searchParams.set("x_cg_demo_api_key", apiKey);

  const url = `${COINGECKO_BASE}${endpoint}?${searchParams.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0" },
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}: ${res.statusText}`);
    return res.json() as Promise<T>;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ─── 加密货币 ID 映射 ──────────────────────────────────────────────────────

const COIN_ID_MAP: Record<string, string> = {
  // 英文符号
  "btc": "bitcoin", "bitcoin": "bitcoin",
  "eth": "ethereum", "ethereum": "ethereum",
  "bnb": "binancecoin", "binance": "binancecoin",
  "sol": "solana", "solana": "solana",
  "xrp": "ripple", "ripple": "ripple",
  "ada": "cardano", "cardano": "cardano",
  "avax": "avalanche-2", "avalanche": "avalanche-2",
  "doge": "dogecoin", "dogecoin": "dogecoin",
  "dot": "polkadot", "polkadot": "polkadot",
  "matic": "matic-network", "polygon": "matic-network",
  "link": "chainlink", "chainlink": "chainlink",
  "uni": "uniswap", "uniswap": "uniswap",
  "ltc": "litecoin", "litecoin": "litecoin",
  "atom": "cosmos", "cosmos": "cosmos",
  "etc": "ethereum-classic",
  "xlm": "stellar", "stellar": "stellar",
  "algo": "algorand", "algorand": "algorand",
  "near": "near", "icp": "internet-computer",
  "apt": "aptos", "arb": "arbitrum",
  "op": "optimism", "sui": "sui",
  "ton": "the-open-network",
  // 中文名称
  "比特币": "bitcoin", "以太坊": "ethereum", "以太币": "ethereum",
  "币安币": "binancecoin", "索拉纳": "solana", "瑞波币": "ripple",
  "卡尔达诺": "cardano", "雪崩": "avalanche-2", "狗狗币": "dogecoin",
  "波卡": "polkadot", "马蒂克": "matic-network", "莱特币": "litecoin",
  "恒星币": "stellar", "波场": "tron",
  // USDT/稳定币
  "usdt": "tether", "usdc": "usd-coin", "busd": "binance-usd",
  "dai": "dai", "frax": "frax",
};

/**
 * 从任务描述中识别加密货币 ID 列表
 */
export function extractCryptoIds(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();

  for (const [keyword, coinId] of Object.entries(COIN_ID_MAP)) {
    if (lower.includes(keyword.toLowerCase())) {
      found.add(coinId);
    }
  }

  return Array.from(found).slice(0, 10); // 最多 10 个
}

/**
 * 判断任务是否涉及加密货币
 */
export function isCryptoTask(text: string): boolean {
  const cryptoKeywords = [
    "crypto", "cryptocurrency", "加密货币", "数字货币", "虚拟货币",
    "bitcoin", "btc", "比特币", "ethereum", "eth", "以太坊",
    "blockchain", "区块链", "defi", "nft", "web3",
    "altcoin", "山寨币", "coinbase", "binance", "币安",
    "solana", "sol", "xrp", "ripple", "dogecoin", "doge",
    "stablecoin", "稳定币", "usdt", "usdc",
    "市值", "牛市", "熊市", "减半", "halving",
  ];
  const lower = text.toLowerCase();
  return cryptoKeywords.some(kw => lower.includes(kw));
}

// ─── 核心数据获取函数 ──────────────────────────────────────────────────────

/**
 * 获取 Top N 加密货币市场数据
 */
export async function getTopCoins(limit = 20): Promise<CoinMarketData[]> {
  return fetchCoinGecko<CoinMarketData[]>("/coins/markets", {
    vs_currency: "usd",
    order: "market_cap_desc",
    per_page: String(limit),
    page: "1",
    price_change_percentage: "7d,30d",
  });
}

/**
 * 获取全球加密货币市场概览
 */
export async function getGlobalMarket(): Promise<GlobalMarketData | null> {
  try {
    const data = await fetchCoinGecko<{ data: GlobalMarketData }>("/global");
    return data.data;
  } catch {
    return null;
  }
}

/**
 * 获取趋势加密货币（24h 搜索量最高）
 */
export async function getTrendingCoins(): Promise<TrendingCoin[]> {
  try {
    const data = await fetchCoinGecko<{ coins: Array<{ item: TrendingCoin }> }>("/search/trending");
    return data.coins.map(c => c.item).slice(0, 7);
  } catch {
    return [];
  }
}

/**
 * 获取指定加密货币的市场数据
 */
export async function getSpecificCoins(coinIds: string[]): Promise<CoinMarketData[]> {
  if (coinIds.length === 0) return [];
  return fetchCoinGecko<CoinMarketData[]>("/coins/markets", {
    vs_currency: "usd",
    ids: coinIds.join(","),
    order: "market_cap_desc",
    per_page: "50",
    page: "1",
    price_change_percentage: "7d,30d",
  });
}

/**
 * 综合获取加密货币数据（用于 Step2 数据引擎）
 */
export async function getCryptoData(taskDescription: string): Promise<CoinGeckoData> {
  const specificIds = extractCryptoIds(taskDescription);

  const [topCoinsResult, globalResult, trendingResult, specificResult] = await Promise.allSettled([
    getTopCoins(15),
    getGlobalMarket(),
    getTrendingCoins(),
    specificIds.length > 0 ? getSpecificCoins(specificIds) : Promise.resolve([]),
  ]);

  return {
    topCoins: topCoinsResult.status === "fulfilled" ? topCoinsResult.value : [],
    globalMarket: globalResult.status === "fulfilled" ? globalResult.value : null,
    trendingCoins: trendingResult.status === "fulfilled" ? trendingResult.value : [],
    specificCoins: specificResult.status === "fulfilled" ? specificResult.value : [],
    source: "CoinGecko",
    fetchedAt: new Date().toISOString(),
  };
}

// ─── 格式化输出 ────────────────────────────────────────────────────────────

function formatMarketCap(cap: number): string {
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)}T`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(1)}B`;
  if (cap >= 1e6) return `$${(cap / 1e6).toFixed(1)}M`;
  return `$${cap.toLocaleString()}`;
}

function formatPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toFixed(4)}`;
  if (price >= 0.01) return `$${price.toFixed(6)}`;
  return `$${price.toFixed(8)}`;
}

function changeStr(pct: number | null | undefined): string {
  if (pct == null) return "N/A";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

/**
 * 将 CoinGecko 数据格式化为 Markdown 报告
 */
export function formatCryptoData(data: CoinGeckoData): string {
  const lines: string[] = [];
  lines.push(`## CoinGecko 加密货币市场数据`);
  lines.push(`*数据来源：CoinGecko | 获取时间：${new Date(data.fetchedAt).toLocaleString("zh-CN")}*\n`);

  // 全球市场概览
  if (data.globalMarket) {
    const g = data.globalMarket;
    const totalMcap = g.total_market_cap?.usd ?? 0;
    const totalVol = g.total_volume?.usd ?? 0;
    const btcDom = g.market_cap_percentage?.btc ?? 0;
    const ethDom = g.market_cap_percentage?.eth ?? 0;
    const mcChange = g.market_cap_change_percentage_24h_usd ?? 0;
    const mcChangeSign = mcChange >= 0 ? "+" : "";

    lines.push(`### 全球加密货币市场概览`);
    lines.push(`| 总市值 | 24h 总交易量 | BTC 占比 | ETH 占比 | 24h 市值变化 | 活跃币种数 |`);
    lines.push(`|--------|-------------|---------|---------|-------------|-----------|`);
    lines.push(`| ${formatMarketCap(totalMcap)} | ${formatMarketCap(totalVol)} | ${btcDom.toFixed(1)}% | ${ethDom.toFixed(1)}% | ${mcChangeSign}${mcChange.toFixed(2)}% | ${g.active_cryptocurrencies?.toLocaleString() ?? "N/A"} |`);
  }

  // 指定币种数据（优先显示）
  if (data.specificCoins.length > 0) {
    lines.push(`\n### 指定币种实时数据`);
    lines.push(`| 排名 | 名称 | 价格 | 24h 涨跌 | 7d 涨跌 | 市值 | 24h 成交量 |`);
    lines.push(`|------|------|------|---------|---------|------|-----------|`);
    for (const c of data.specificCoins) {
      lines.push(`| #${c.market_cap_rank ?? "?"} | ${c.name} (${c.symbol.toUpperCase()}) | ${formatPrice(c.current_price)} | ${changeStr(c.price_change_percentage_24h)} | ${changeStr(c.price_change_percentage_7d)} | ${formatMarketCap(c.market_cap)} | ${formatMarketCap(c.total_volume)} |`);
    }
  }

  // Top 15 市值排行
  if (data.topCoins.length > 0) {
    lines.push(`\n### 市值 Top ${data.topCoins.length} 加密货币`);
    lines.push(`| 排名 | 名称 | 价格 | 24h 涨跌 | 7d 涨跌 | 市值 |`);
    lines.push(`|------|------|------|---------|---------|------|`);
    for (const c of data.topCoins) {
      lines.push(`| #${c.market_cap_rank} | ${c.name} (${c.symbol.toUpperCase()}) | ${formatPrice(c.current_price)} | ${changeStr(c.price_change_percentage_24h)} | ${changeStr(c.price_change_percentage_7d)} | ${formatMarketCap(c.market_cap)} |`);
    }
  }

  // 趋势币种
  if (data.trendingCoins.length > 0) {
    lines.push(`\n### 24h 搜索热度 Top ${data.trendingCoins.length}（趋势币种）`);
    lines.push(`| 排名 | 名称 | 符号 | 市值排名 |`);
    lines.push(`|------|------|------|---------|`);
    for (let i = 0; i < data.trendingCoins.length; i++) {
      const c = data.trendingCoins[i];
      const mcRank = c.market_cap_rank ? `#${c.market_cap_rank}` : "N/A";
      lines.push(`| ${i + 1} | ${c.name} | ${c.symbol.toUpperCase()} | ${mcRank} |`);
    }
  }

  return lines.join("\n");
}

/**
 * 健康检测（轻量探针）
 */
export async function pingCoinGecko(): Promise<boolean> {
  try {
    const apiKey = getApiKey();
    const url = `${COINGECKO_BASE}/ping${apiKey ? `?x_cg_demo_api_key=${apiKey}` : ""}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}
