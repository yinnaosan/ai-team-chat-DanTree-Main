/**
 * financeDatabaseApi.ts — JerBouma/FinanceDatabase 集成
 *
 * 参考架构：
 *   - JerBouma/FinanceDatabase: https://github.com/JerBouma/FinanceDatabase
 *   - 30万+ 全球股票分类数据库（Equities/ETFs/Funds/Indices/Crypto）
 *
 * 核心功能：
 *   1. 股票分类查询：给定 ticker → 返回 sector/industry/country/market_cap
 *   2. 同业公司列表：给定 ticker → 返回同 sector+industry 的可比公司
 *   3. 行业筛选：给定 sector/country → 返回符合条件的股票列表
 *   4. 全球市场覆盖：美股/港股/A股/欧股/日股等 50+ 交易所
 *
 * 实现方式：通过 Python 子进程调用 financedatabase 包（已安装）
 */

import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// ── 类型定义 ──────────────────────────────────────────────────────────────────

export interface EquityClassification {
  symbol: string;
  name: string;
  sector: string;
  industryGroup: string;
  industry: string;
  exchange: string;
  market: string;
  country: string;
  state?: string;
  city?: string;
  currency: string;
  marketCap: string;
  website?: string;
  isin?: string;
  summary?: string;
}

export interface PeerCompany {
  symbol: string;
  name: string;
  marketCap: string;
  exchange: string;
  country: string;
}

export interface FinanceDatabaseResult {
  ticker: string;
  classification?: EquityClassification;
  peers: PeerCompany[];
  sectorPeers: PeerCompany[];    // 同 sector（大范围）
  industryPeers: PeerCompany[];  // 同 industry（精确）
  sectorStats: {
    totalCompanies: number;
    megaCap: number;
    largeCap: number;
    midCap: number;
    smallCap: number;
  };
  error?: string;
}

// ── Python 脚本 ───────────────────────────────────────────────────────────────

const PYTHON_SCRIPT = `
import sys
import json
import warnings
warnings.filterwarnings('ignore')

try:
    import financedatabase as fd
    import pandas as pd
    
    ticker = sys.argv[1]
    
    eq = fd.Equities()
    df = eq.data
    
    result = {
        'ticker': ticker,
        'classification': None,
        'peers': [],
        'sectorPeers': [],
        'industryPeers': [],
        'sectorStats': {'totalCompanies': 0, 'megaCap': 0, 'largeCap': 0, 'midCap': 0, 'smallCap': 0},
        'error': None
    }
    
    # 查找 ticker 分类
    if ticker in df.index:
        row = df.loc[ticker]
        # 处理重复 ticker（取第一个）
        if isinstance(row, pd.DataFrame):
            row = row.iloc[0]
        
        result['classification'] = {
            'symbol': ticker,
            'name': str(row.get('name', '') or ''),
            'sector': str(row.get('sector', '') or ''),
            'industryGroup': str(row.get('industry_group', '') or ''),
            'industry': str(row.get('industry', '') or ''),
            'exchange': str(row.get('exchange', '') or ''),
            'market': str(row.get('market', '') or ''),
            'country': str(row.get('country', '') or ''),
            'state': str(row.get('state', '') or '') if pd.notna(row.get('state')) else None,
            'city': str(row.get('city', '') or '') if pd.notna(row.get('city')) else None,
            'currency': str(row.get('currency', '') or ''),
            'marketCap': str(row.get('market_cap', '') or ''),
            'website': str(row.get('website', '') or '') if pd.notna(row.get('website')) else None,
            'isin': str(row.get('isin', '') or '') if pd.notna(row.get('isin')) else None,
            'summary': str(row.get('summary', '') or '')[:500] if pd.notna(row.get('summary')) else None,
        }
        
        sector = result['classification']['sector']
        industry = result['classification']['industry']
        country = result['classification']['country']
        
        # 同 industry 同业公司（精确，限主要市场）
        industry_mask = (
            (df['industry'] == industry) &
            (df['sector'] == sector) &
            (df['market_cap'].isin(['Mega Cap', 'Large Cap', 'Mid Cap']))
        )
        industry_peers_df = df[industry_mask].copy()
        # 去重（同公司多交易所）
        industry_peers_df = industry_peers_df[~industry_peers_df['name'].duplicated(keep='first')]
        industry_peers_df = industry_peers_df[industry_peers_df.index != ticker]
        industry_peers_df = industry_peers_df.sort_values(
            'market_cap', 
            key=lambda x: x.map({'Mega Cap': 0, 'Large Cap': 1, 'Mid Cap': 2, 'Small Cap': 3, 'Micro Cap': 4}).fillna(5)
        ).head(15)
        
        result['industryPeers'] = [
            {
                'symbol': str(idx),
                'name': str(r.get('name', '')),
                'marketCap': str(r.get('market_cap', '')),
                'exchange': str(r.get('exchange', '')),
                'country': str(r.get('country', ''))
            }
            for idx, r in industry_peers_df.iterrows()
        ]
        
        # 同 sector 同业公司（宽泛，同国家）
        sector_mask = (
            (df['sector'] == sector) &
            (df['country'] == country) &
            (df['market_cap'].isin(['Mega Cap', 'Large Cap']))
        )
        sector_peers_df = df[sector_mask].copy()
        sector_peers_df = sector_peers_df[~sector_peers_df['name'].duplicated(keep='first')]
        sector_peers_df = sector_peers_df[sector_peers_df.index != ticker]
        sector_peers_df = sector_peers_df.sort_values(
            'market_cap',
            key=lambda x: x.map({'Mega Cap': 0, 'Large Cap': 1}).fillna(2)
        ).head(20)
        
        result['sectorPeers'] = [
            {
                'symbol': str(idx),
                'name': str(r.get('name', '')),
                'marketCap': str(r.get('market_cap', '')),
                'exchange': str(r.get('exchange', '')),
                'country': str(r.get('country', ''))
            }
            for idx, r in sector_peers_df.iterrows()
        ]
        
        # 合并 peers（industryPeers 优先）
        result['peers'] = result['industryPeers'][:10] if result['industryPeers'] else result['sectorPeers'][:10]
        
        # Sector 统计
        sector_all = df[df['sector'] == sector]
        cap_counts = sector_all['market_cap'].value_counts()
        result['sectorStats'] = {
            'totalCompanies': int(len(sector_all)),
            'megaCap': int(cap_counts.get('Mega Cap', 0)),
            'largeCap': int(cap_counts.get('Large Cap', 0)),
            'midCap': int(cap_counts.get('Mid Cap', 0)),
            'smallCap': int(cap_counts.get('Small Cap', 0)),
        }
    else:
        result['error'] = f'Ticker {ticker} not found in FinanceDatabase'
    
    print(json.dumps(result))

except Exception as e:
    print(json.dumps({'ticker': sys.argv[1] if len(sys.argv) > 1 else 'unknown', 'error': str(e), 'peers': [], 'sectorPeers': [], 'industryPeers': [], 'sectorStats': {'totalCompanies': 0, 'megaCap': 0, 'largeCap': 0, 'midCap': 0, 'smallCap': 0}}))
`;

// ── 主查询函数 ─────────────────────────────────────────────────────────────────

/**
 * 查询股票的全球分类信息和同业公司
 */
export async function getEquityClassification(ticker: string): Promise<FinanceDatabaseResult> {
  try {
    const { stdout } = await execFileAsync("python3", ["-c", PYTHON_SCRIPT, ticker], {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    const result = JSON.parse(stdout.trim()) as FinanceDatabaseResult;
    return result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ticker,
      peers: [],
      sectorPeers: [],
      industryPeers: [],
      sectorStats: { totalCompanies: 0, megaCap: 0, largeCap: 0, midCap: 0, smallCap: 0 },
      error: `FinanceDatabase query failed: ${msg.slice(0, 200)}`,
    };
  }
}

// ── 格式化输出 ─────────────────────────────────────────────────────────────────

/**
 * 将 FinanceDatabase 结果格式化为 Markdown 报告
 */
export function formatFinanceDatabaseReport(result: FinanceDatabaseResult): string {
  if (result.error && !result.classification) {
    return `## 全球股票分类（FinanceDatabase）\n\n> ${result.error}`;
  }

  const cls = result.classification;
  if (!cls) return "";

  const lines: string[] = [
    `## 全球股票分类 — ${cls.symbol}（JerBouma/FinanceDatabase）`,
    ``,
    `### 分类信息`,
    `| 字段 | 值 |`,
    `|------|-----|`,
    `| 公司名称 | ${cls.name} |`,
    `| GICS 行业 | ${cls.sector} |`,
    `| 行业组 | ${cls.industryGroup} |`,
    `| 细分行业 | ${cls.industry} |`,
    `| 市值级别 | **${cls.marketCap}** |`,
    `| 上市交易所 | ${cls.exchange}（${cls.market}） |`,
    `| 国家/地区 | ${cls.country}${cls.state ? ` · ${cls.state}` : ""}${cls.city ? ` · ${cls.city}` : ""} |`,
    `| 货币 | ${cls.currency} |`,
    cls.isin ? `| ISIN | ${cls.isin} |` : "",
    cls.website ? `| 官网 | ${cls.website} |` : "",
    ``,
  ].filter(l => l !== "");

  // 行业同业公司
  if (result.industryPeers.length > 0) {
    lines.push(`### 同细分行业可比公司（${cls.industry}）`);
    lines.push(`| 代码 | 公司名称 | 市值级别 | 交易所 | 国家 |`);
    lines.push(`|------|---------|---------|------|------|`);
    for (const p of result.industryPeers.slice(0, 10)) {
      lines.push(`| ${p.symbol} | ${p.name} | ${p.marketCap} | ${p.exchange} | ${p.country} |`);
    }
    lines.push(``);
  }

  // Sector 统计
  const stats = result.sectorStats;
  if (stats.totalCompanies > 0) {
    lines.push(`### ${cls.sector} 行业全球分布`);
    lines.push(`| 市值级别 | 公司数量 |`);
    lines.push(`|---------|---------|`);
    lines.push(`| Mega Cap（超大盘） | ${stats.megaCap} |`);
    lines.push(`| Large Cap（大盘） | ${stats.largeCap} |`);
    lines.push(`| Mid Cap（中盘） | ${stats.midCap} |`);
    lines.push(`| Small Cap（小盘） | ${stats.smallCap} |`);
    lines.push(`| **合计** | **${stats.totalCompanies}** |`);
    lines.push(``);
  }

  // 公司简介
  if (cls.summary) {
    lines.push(`### 公司简介`);
    lines.push(`> ${cls.summary}${cls.summary.length >= 500 ? "..." : ""}`);
    lines.push(``);
  }

  lines.push(`> **数据来源：** JerBouma/FinanceDatabase（30万+ 全球股票分类数据库）`);

  return lines.join("\n");
}

// ── 任务检测 ──────────────────────────────────────────────────────────────────

/**
 * 从任务描述中提取股票代码
 */
export function extractTickersForClassification(taskDescription: string): string[] {
  // 匹配常见股票代码格式
  const patterns = [
    /\b([A-Z]{1,5})\b/g,                    // 美股：AAPL, MSFT
    /\b([A-Z]{1,4}\.[A-Z]{1,2})\b/g,        // 港股/ADR：0700.HK
    /\b(\d{4,6})\b/g,                        // A股/港股数字代码
  ];

  const tickers = new Set<string>();
  const stopWords = new Set([
    "AND", "OR", "THE", "FOR", "WITH", "FROM", "INTO", "OVER", "UNDER",
    "USD", "CNY", "HKD", "EUR", "GBP", "JPY", "ETF", "IPO", "CEO", "CFO",
    "GDP", "CPI", "PPI", "EPS", "ROE", "ROA", "FCF", "DCF", "P/E", "P/B",
    "AI", "ML", "IT", "US", "UK", "EU", "HK", "CN",
  ]);

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    const re = new RegExp(pattern.source, pattern.flags);
    while ((match = re.exec(taskDescription)) !== null) {
      const ticker = match[1];
      if (!stopWords.has(ticker) && ticker.length >= 2) {
        tickers.add(ticker);
      }
    }
  }

  return Array.from(tickers).slice(0, 5); // 最多处理 5 个
}

/**
 * 健康检测
 */
export async function pingFinanceDatabase(): Promise<boolean> {
  try {
    const result = await getEquityClassification("AAPL");
    return !!result.classification;
  } catch {
    return false;
  }
}
