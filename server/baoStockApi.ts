/**
 * Baostock A股历史数据集成
 * 通过 Python 子进程调用 baostock 库获取 A 股历史行情、财务指标、指数成分等
 * 免费，无需 API Key，数据来源：上交所/深交所官方
 * 文档：http://baostock.com/baostock/index.php
 */

import { spawn } from "child_process";

const TIMEOUT_MS = 20000; // baostock 需要网络连接，超时设长一些

// ─── 类型定义 ──────────────────────────────────────────────────────────────

export interface AStockKData {
  date: string;
  code: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  amount: string;
  turn?: string;         // 换手率
  peTTM?: string;        // 市盈率 TTM
  pbMRQ?: string;        // 市净率 MRQ
}

export interface AStockProfitData {
  statDate: string;
  code: string;
  roeAvg: string;        // 净资产收益率 ROE
  npMargin: string;      // 净利润率
  gpMargin: string;      // 毛利率
  netProfit: string;     // 净利润
  epsTTM: string;        // 每股收益 TTM
  MBRevenue: string;     // 主营业务收入
  totalShare: string;    // 总股本
  liqaShare: string;     // 流通股本
}

export interface AStockGrowthData {
  statDate: string;
  code: string;
  YOYEquity: string;     // 净资产同比增长率
  YOYAsset: string;      // 总资产同比增长率
  YOYNI: string;         // 净利润同比增长率
  YOYEPSBasic: string;   // 基本每股收益同比增长率
  YOYPNI: string;        // 归母净利润同比增长率
}

export interface BaoStockData {
  symbol: string;
  name: string;
  recentKData: AStockKData[];
  profitData: AStockProfitData[];
  growthData: AStockGrowthData[];
  source: string;
  fetchedAt: string;
}

// ─── 辅助函数 ──────────────────────────────────────────────────────────────

/**
 * 执行 Python 脚本并返回 JSON 结果
 */
async function runPython(script: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      py.kill();
      reject(new Error("Baostock Python timeout"));
    }, TIMEOUT_MS);

    const py = spawn("python3", ["-c", script]);
    let stdout = "";
    let stderr = "";

    py.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    py.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    py.on("close", (code: number) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Python exit ${code}: ${stderr.slice(0, 200)}`));
        return;
      }
      try {
        // 只取最后一行 JSON（baostock 会打印 login/logout 信息）
        const lines = stdout.trim().split("\n");
        const jsonLine = lines.reverse().find(l => l.startsWith("{") || l.startsWith("["));
        if (!jsonLine) reject(new Error("No JSON output from Python"));
        else resolve(JSON.parse(jsonLine));
      } catch (e) {
        reject(new Error(`JSON parse error: ${String(e)}\nOutput: ${stdout.slice(0, 200)}`));
      }
    });
  });
}

// ─── A 股代码识别 ──────────────────────────────────────────────────────────

// 常见 A 股代码和公司名称映射（用于从任务描述中识别）
const A_STOCK_NAME_MAP: Record<string, string> = {
  // 沪市主板
  "贵州茅台": "sh.600519", "茅台": "sh.600519",
  "中国平安": "sh.601318", "平安": "sh.601318",
  "招商银行": "sh.600036", "招行": "sh.600036",
  "工商银行": "sh.601398", "工行": "sh.601398",
  "建设银行": "sh.601939", "建行": "sh.601939",
  "农业银行": "sh.601288", "农行": "sh.601288",
  "中国银行": "sh.601988",
  "交通银行": "sh.601328",
  "浦发银行": "sh.600000",
  "中国石油": "sh.601857", "中石油": "sh.601857",
  "中国石化": "sh.600028", "中石化": "sh.600028",
  "中国移动": "sh.600941",
  "中国联通": "sh.600050",
  "中国电信": "sh.601728",
  "宁德时代": "sh.300750",
  "比亚迪": "sh.002594",
  "中国中车": "sh.601766",
  "上汽集团": "sh.600104",
  "海螺水泥": "sh.600585",
  "万科A": "sh.000002", "万科": "sh.000002",
  "保利发展": "sh.600048",
  "中国建筑": "sh.601668",
  "中国铁建": "sh.601186",
  "中国中铁": "sh.601390",
  "格力电器": "sh.000651", "格力": "sh.000651",
  "美的集团": "sh.000333", "美的": "sh.000333",
  "海尔智家": "sh.600690", "海尔": "sh.600690",
  "隆基绿能": "sh.601012", "隆基": "sh.601012",
  "通威股份": "sh.600438",
  "阳光电源": "sh.300274",
  "迈瑞医疗": "sh.300760",
  "恒瑞医药": "sh.600276",
  "药明康德": "sh.603259",
  "三一重工": "sh.600031",
  "中联重科": "sh.000157",
  "五粮液": "sh.000858",
  "泸州老窖": "sh.000568",
  "山西汾酒": "sh.600809",
  "洋河股份": "sh.002304",
  "中国国旅": "sh.601888", "中免": "sh.601888",
  "东方财富": "sh.300059",
  "同花顺": "sh.300033",
  "中信证券": "sh.600030",
  "华泰证券": "sh.601688",
  "国泰君安": "sh.601211",
  "海通证券": "sh.600837",
  "中国人寿": "sh.601628",
  "中国太保": "sh.601601",
  "新华保险": "sh.601336",
  "中国人保": "sh.601319",
  // 深市
  "腾讯控股": "sz.000700", // 港股，备注
  "平安银行": "sz.000001",
  "深发展": "sz.000001",
  "万科B": "sz.200002",
  "中兴通讯": "sz.000063",
  "TCL科技": "sz.000100",
  "长城汽车": "sz.002333",
  "吉利汽车": "sz.175",
  "东风汽车": "sz.600006",
  "潍柴动力": "sz.000338",
  "顺丰控股": "sz.002352",
  "京东方A": "sz.000725",
  "立讯精密": "sz.002475",
  "歌尔股份": "sz.002241",
  "汇川技术": "sz.300124",
  "先导智能": "sz.300450",
  "亿纬锂能": "sz.300014",
  "天齐锂业": "sz.002466",
  "赣锋锂业": "sz.002460",
  "中芯国际": "sh.688981",
  "华为": "", // 未上市
  "小米": "",
  // 指数
  "上证指数": "sh.000001", "上证": "sh.000001",
  "深证成指": "sz.399001", "深证": "sz.399001",
  "创业板指": "sz.399006", "创业板": "sz.399006",
  "沪深300": "sh.000300", "300": "sh.000300",
  "中证500": "sh.000905", "500": "sh.000905",
  "中证1000": "sh.000852",
};

/**
 * 从任务描述中识别 A 股代码
 */
export function extractAStockCodes(text: string): string[] {
  const found = new Set<string>();

  // 直接匹配 sh./sz. 格式
  const directMatches = text.match(/[sS][hHzZ]\.\d{6}/g) || [];
  directMatches.forEach(m => found.add(m.toLowerCase()));

  // 匹配纯 6 位数字（A 股代码）
  const numMatches = text.match(/\b(6\d{5}|0\d{5}|3\d{5})\b/g) || [];
  numMatches.forEach(code => {
    if (code.startsWith("6")) found.add(`sh.${code}`);
    else found.add(`sz.${code}`);
  });

  // 匹配公司名称
  for (const [name, code] of Object.entries(A_STOCK_NAME_MAP)) {
    if (code && text.includes(name)) {
      found.add(code);
    }
  }

  return Array.from(found).filter(c => c.length > 0).slice(0, 5);
}

/**
 * 判断任务是否涉及 A 股
 */
export function isAStockTask(text: string): boolean {
  const aStockKeywords = [
    "A股", "a股", "沪深", "上证", "深证", "创业板", "科创板",
    "sh.", "sz.", "沪市", "深市", "港股通",
    "茅台", "平安", "招行", "宁德", "比亚迪", "格力", "美的",
    "A股市场", "中国股市", "国内股市", "内地股市",
  ];
  return aStockKeywords.some(kw => text.includes(kw));
}

// ─── 核心数据获取函数 ──────────────────────────────────────────────────────

/**
 * 获取 A 股近期 K 线数据（最近 30 个交易日）
 */
export async function getAStockKData(code: string, days = 30): Promise<AStockKData[]> {
  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - days * 1.5 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const script = `
import baostock as bs, json, sys
bs.login()
rs = bs.query_history_k_data_plus(
    '${code}',
    'date,code,open,high,low,close,volume,amount,turn,peTTM,pbMRQ',
    start_date='${startDate}',
    end_date='${endDate}',
    frequency='d',
    adjustflag='3'
)
rows = []
while rs.error_code == '0' and rs.next():
    r = rs.get_row_data()
    rows.append({'date':r[0],'code':r[1],'open':r[2],'high':r[3],'low':r[4],'close':r[5],'volume':r[6],'amount':r[7],'turn':r[8],'peTTM':r[9],'pbMRQ':r[10]})
bs.logout()
print(json.dumps(rows[-${days}:] if len(rows) > ${days} else rows))
`;

  const result = await runPython(script) as AStockKData[];
  return result;
}

/**
 * 获取 A 股盈利能力数据（最近 4 季）
 */
export async function getAStockProfit(code: string): Promise<AStockProfitData[]> {
  const script = `
import baostock as bs, json
bs.login()
rs = bs.query_profit_data(code='${code}', year=2024, quarter=4)
rows = []
while rs.error_code == '0' and rs.next():
    r = rs.get_row_data()
    rows.append({'statDate':r[0],'code':r[1],'roeAvg':r[2],'npMargin':r[3],'gpMargin':r[4],'netProfit':r[5],'epsTTM':r[6],'MBRevenue':r[7],'totalShare':r[8],'liqaShare':r[9]})
bs.logout()
print(json.dumps(rows))
`;
  try {
    return await runPython(script) as AStockProfitData[];
  } catch {
    return [];
  }
}

/**
 * 获取 A 股成长能力数据
 */
export async function getAStockGrowth(code: string): Promise<AStockGrowthData[]> {
  const script = `
import baostock as bs, json
bs.login()
rs = bs.query_growth_data(code='${code}', year=2024, quarter=4)
rows = []
while rs.error_code == '0' and rs.next():
    r = rs.get_row_data()
    rows.append({'statDate':r[0],'code':r[1],'YOYEquity':r[2],'YOYAsset':r[3],'YOYNI':r[4],'YOYEPSBasic':r[5],'YOYPNI':r[6]})
bs.logout()
print(json.dumps(rows))
`;
  try {
    return await runPython(script) as AStockGrowthData[];
  } catch {
    return [];
  }
}

/**
 * 综合获取 A 股数据（用于 Step2 数据引擎）
 */
export async function getAStockData(code: string): Promise<BaoStockData> {
  // 获取公司名称
  const nameEntry = Object.entries(A_STOCK_NAME_MAP).find(([, c]) => c === code);
  const name = nameEntry ? nameEntry[0] : code;

  const [kDataResult, profitResult, growthResult] = await Promise.allSettled([
    getAStockKData(code, 30),
    getAStockProfit(code),
    getAStockGrowth(code),
  ]);

  return {
    symbol: code,
    name,
    recentKData: kDataResult.status === "fulfilled" ? kDataResult.value : [],
    profitData: profitResult.status === "fulfilled" ? profitResult.value : [],
    growthData: growthResult.status === "fulfilled" ? growthResult.value : [],
    source: "Baostock（上交所/深交所）",
    fetchedAt: new Date().toISOString(),
  };
}

// ─── 格式化输出 ────────────────────────────────────────────────────────────

/**
 * 将 Baostock 数据格式化为 Markdown 报告
 */
export function formatAStockData(data: BaoStockData): string {
  const lines: string[] = [];
  lines.push(`## Baostock A股数据 — ${data.name} (${data.symbol})`);
  lines.push(`*数据来源：Baostock（上交所/深交所官方数据）| 获取时间：${new Date(data.fetchedAt).toLocaleString("zh-CN")}*\n`);

  // 近期 K 线（最近 10 个交易日）
  if (data.recentKData.length > 0) {
    const recent = data.recentKData.slice(-10);
    const latest = recent[recent.length - 1];
    const prev = recent[recent.length - 2];

    if (latest && prev) {
      const closeNum = parseFloat(latest.close);
      const prevClose = parseFloat(prev.close);
      const change = closeNum - prevClose;
      const changePct = (change / prevClose * 100);
      const changeSign = change >= 0 ? "+" : "";
      const vol = parseFloat(latest.volume);
      const amt = parseFloat(latest.amount);

      lines.push(`### 最新行情（${latest.date}）`);
      lines.push(`| 收盘价 | 涨跌额 | 涨跌幅 | 成交量 | 成交额 | PE(TTM) | PB(MRQ) |`);
      lines.push(`|--------|--------|--------|--------|--------|---------|---------|`);
      lines.push(`| ¥${closeNum.toFixed(2)} | ${changeSign}${change.toFixed(2)} | ${changeSign}${changePct.toFixed(2)}% | ${(vol / 1e4).toFixed(0)}万手 | ¥${(amt / 1e8).toFixed(2)}亿 | ${latest.peTTM || "N/A"} | ${latest.pbMRQ || "N/A"} |`);
    }

    lines.push(`\n### 近期行情（最近 ${recent.length} 个交易日）`);
    lines.push(`| 日期 | 开盘 | 最高 | 最低 | 收盘 | 成交额(亿) | 换手率 |`);
    lines.push(`|------|------|------|------|------|-----------|--------|`);
    for (const k of recent) {
      const amt = parseFloat(k.amount || "0");
      lines.push(`| ${k.date} | ¥${parseFloat(k.open).toFixed(2)} | ¥${parseFloat(k.high).toFixed(2)} | ¥${parseFloat(k.low).toFixed(2)} | ¥${parseFloat(k.close).toFixed(2)} | ${(amt / 1e8).toFixed(2)} | ${k.turn || "N/A"}% |`);
    }
  }

  // 盈利能力
  if (data.profitData.length > 0) {
    const p = data.profitData[0];
    lines.push(`\n### 盈利能力指标（${p.statDate}）`);
    lines.push(`| ROE | 净利润率 | 毛利率 | 净利润(亿) | 主营收入(亿) | EPS(TTM) |`);
    lines.push(`|-----|---------|--------|-----------|------------|---------|`);
    const np = parseFloat(p.netProfit || "0");
    const rev = parseFloat(p.MBRevenue || "0");
    lines.push(`| ${parseFloat(p.roeAvg || "0").toFixed(2)}% | ${parseFloat(p.npMargin || "0").toFixed(2)}% | ${parseFloat(p.gpMargin || "0").toFixed(2)}% | ${(np / 1e8).toFixed(2)} | ${(rev / 1e8).toFixed(2)} | ${p.epsTTM || "N/A"} |`);
  }

  // 成长能力
  if (data.growthData.length > 0) {
    const g = data.growthData[0];
    lines.push(`\n### 成长能力指标（${g.statDate}）`);
    lines.push(`| 净资产增长率 | 总资产增长率 | 净利润增长率 | 归母净利润增长率 |`);
    lines.push(`|------------|------------|------------|----------------|`);
    lines.push(`| ${parseFloat(g.YOYEquity || "0").toFixed(2)}% | ${parseFloat(g.YOYAsset || "0").toFixed(2)}% | ${parseFloat(g.YOYNI || "0").toFixed(2)}% | ${parseFloat(g.YOYPNI || "0").toFixed(2)}% |`);
  }

  return lines.join("\n");
}

/**
 * 健康检测（轻量探针，测试 baostock 连接）
 */
export async function pingBaostock(): Promise<boolean> {
  try {
    const script = `
import baostock as bs, json
lg = bs.login()
ok = lg.error_code == '0'
bs.logout()
print(json.dumps({'ok': ok}))
`;
    const result = await runPython(script) as { ok: boolean };
    return result.ok === true;
  } catch {
    return false;
  }
}
