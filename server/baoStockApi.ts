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

// ─── A 股代码名称库（200+ 条目，覆盖沪深 300 主要成分股）─────────────────────

/**
 * A 股公司名称 → Baostock 代码映射
 * 格式：sh.XXXXXX（沪市）或 sz.XXXXXX（深市）
 * 注意：腾讯/阿里等港股/美股不在此列，由 Yahoo Finance 处理
 */
export const A_STOCK_NAME_MAP: Record<string, string> = {
  // ── 白酒 ──────────────────────────────────────────────────────────────────
  "贵州茅台": "sh.600519", "茅台": "sh.600519",
  "五粮液": "sz.000858",
  "泸州老窖": "sz.000568",
  "山西汾酒": "sh.600809",
  "洋河股份": "sz.002304",
  "古井贡酒": "sz.000596",
  "今世缘": "sh.603369",
  "舍得酒业": "sh.600702",
  "酒鬼酒": "sz.000799",
  "水井坊": "sh.600779",

  // ── 银行 ──────────────────────────────────────────────────────────────────
  "工商银行": "sh.601398", "工行": "sh.601398",
  "建设银行": "sh.601939", "建行": "sh.601939",
  "农业银行": "sh.601288", "农行": "sh.601288",
  "中国银行": "sh.601988", "中行": "sh.601988",
  "交通银行": "sh.601328", "交行": "sh.601328",
  "招商银行": "sh.600036", "招行": "sh.600036",
  "浦发银行": "sh.600000", "浦发": "sh.600000",
  "中信银行": "sh.601998",
  "光大银行": "sh.601818",
  "华夏银行": "sh.600015",
  "民生银行": "sh.600016",
  "兴业银行": "sh.601166",
  "平安银行": "sz.000001",
  "北京银行": "sh.601169",
  "上海银行": "sh.601229",
  "江苏银行": "sh.600919",
  "宁波银行": "sz.002142",
  "南京银行": "sh.601009",
  "邮储银行": "sh.601658",

  // ── 保险 ──────────────────────────────────────────────────────────────────
  "中国平安": "sh.601318", "平安": "sh.601318",
  "中国人寿": "sh.601628",
  "中国太保": "sh.601601",
  "新华保险": "sh.601336",
  "中国人保": "sh.601319",
  "中国再保险": "sh.601601",

  // ── 证券 ──────────────────────────────────────────────────────────────────
  "中信证券": "sh.600030",
  "华泰证券": "sh.601688",
  "国泰君安": "sh.601211",
  "海通证券": "sh.600837",
  "广发证券": "sz.000776",
  "招商证券": "sh.600999",
  "东方证券": "sh.600958",
  "中国银河": "sh.601881",
  "申万宏源": "sh.000166",
  "东方财富": "sh.300059",
  "同花顺": "sh.300033",

  // ── 能源/石化 ──────────────────────────────────────────────────────────────
  "中国石油": "sh.601857", "中石油": "sh.601857",
  "中国石化": "sh.600028", "中石化": "sh.600028",
  "中国海油": "sh.600938",
  "中国神华": "sh.601088",
  "陕西煤业": "sh.601225",
  "中煤能源": "sh.601898",
  "兖矿能源": "sh.600188",
  "华能国际": "sh.600011",
  "大唐发电": "sh.601991",
  "国电电力": "sh.600795",

  // ── 电力/新能源 ────────────────────────────────────────────────────────────
  "宁德时代": "sh.300750", "宁德": "sh.300750",
  "比亚迪": "sz.002594", "BYD": "sz.002594",
  "隆基绿能": "sh.601012", "隆基": "sh.601012",
  "通威股份": "sh.600438",
  "阳光电源": "sz.300274",
  "晶澳科技": "sh.002459",
  "天合光能": "sh.688599",
  "亿纬锂能": "sz.300014",
  "赣锋锂业": "sz.002460",
  "天齐锂业": "sz.002466",
  "国轩高科": "sz.002074",
  "欣旺达": "sz.300207",
  "华友钴业": "sh.603799",
  "中伟股份": "sh.300919",
  "恩捷股份": "sh.002812",

  // ── 汽车 ──────────────────────────────────────────────────────────────────
  "上汽集团": "sh.600104",
  "广汽集团": "sh.601238",
  "长安汽车": "sz.000625",
  "长城汽车": "sh.601633",
  "东风汽车": "sh.600006",
  "北汽蓝谷": "sh.600733",
  "赛力斯": "sh.601127",
  "潍柴动力": "sz.000338",
  "均胜电子": "sh.600699",
  "福耀玻璃": "sh.600660",
  "华域汽车": "sh.600741",

  // ── 科技/半导体 ────────────────────────────────────────────────────────────
  "中芯国际": "sh.688981",
  "北方华创": "sh.002371",
  "中微公司": "sh.688012",
  "澜起科技": "sh.688008",
  "韦尔股份": "sh.603501",
  "卓胜微": "sh.300782",
  "圣邦股份": "sh.300661",
  "汇顶科技": "sh.603160",
  "兆易创新": "sh.603986",
  "海光信息": "sh.688041",
  "寒武纪": "sh.688256",
  "龙芯中科": "sh.688047",
  "中兴通讯": "sz.000063",
  "烽火通信": "sh.600498",
  "紫光股份": "sh.000938",

  // ── 消费电子/家电 ──────────────────────────────────────────────────────────
  "格力电器": "sz.000651", "格力": "sz.000651",
  "美的集团": "sz.000333", "美的": "sz.000333",
  "海尔智家": "sh.600690", "海尔": "sh.600690",
  "海信家电": "sz.000921",
  "TCL科技": "sz.000100",
  "创维数字": "sz.000810",
  "京东方A": "sz.000725", "京东方": "sz.000725",
  "立讯精密": "sz.002475",
  "歌尔股份": "sz.002241",
  "蓝思科技": "sz.300433",
  "工业富联": "sh.601138",

  // ── 医药/医疗 ──────────────────────────────────────────────────────────────
  "恒瑞医药": "sh.600276",
  "药明康德": "sh.603259",
  "迈瑞医疗": "sz.300760",
  "片仔癀": "sh.600436",
  "云南白药": "sz.000538",
  "东阿阿胶": "sz.000423",
  "白云山": "sh.600332",
  "华东医药": "sz.000963",
  "科伦药业": "sz.002422",
  "复星医药": "sh.600196",
  "上海医药": "sh.601607",
  "国药股份": "sh.600511",
  "通策医疗": "sh.600763",
  "爱尔眼科": "sz.300015",
  "健帆生物": "sz.300529",
  "泰格医药": "sz.300347",

  // ── 消费/零售 ──────────────────────────────────────────────────────────────
  "中国国旅": "sh.601888", "中免": "sh.601888", "中国中免": "sh.601888",
  "海天味业": "sh.603288",
  "涪陵榨菜": "sz.002507",
  "绝味食品": "sh.603517",
  "安井食品": "sh.603345",
  "伊利股份": "sh.600887",
  "蒙牛乳业": "sh.600887",
  "光明乳业": "sh.600597",
  "中炬高新": "sh.600872",
  "天味食品": "sh.603317",

  // ── 地产/建筑 ──────────────────────────────────────────────────────────────
  "万科A": "sz.000002", "万科": "sz.000002",
  "保利发展": "sh.600048", "保利": "sh.600048",
  "招商蛇口": "sz.001979",
  "金地集团": "sh.600383",
  "华润置地": "sh.600048",
  "中国建筑": "sh.601668",
  "中国铁建": "sh.601186",
  "中国中铁": "sh.601390",
  "中国交建": "sh.601800",
  "中国中冶": "sh.601618",
  "海螺水泥": "sh.600585",
  "华新水泥": "sh.600801",
  "东方雨虹": "sz.002271",

  // ── 物流/交通 ──────────────────────────────────────────────────────────────
  "顺丰控股": "sz.002352",
  "中通快递": "sh.002352",
  "韵达股份": "sz.002120",
  "申通快递": "sz.002468",
  "圆通速递": "sh.600233",
  "中远海控": "sh.601919",
  "招商轮船": "sh.601872",
  "中国国航": "sh.601111",
  "南方航空": "sh.600029",
  "东方航空": "sh.600115",

  // ── 机械/工业 ──────────────────────────────────────────────────────────────
  "三一重工": "sh.600031",
  "中联重科": "sz.000157",
  "徐工机械": "sz.000425",
  "柳工": "sz.000528",
  "恒立液压": "sh.601100",
  "汇川技术": "sz.300124",
  "先导智能": "sz.300450",
  "杰克股份": "sh.603337",
  "海天精工": "sh.601882",

  // ── 通信/互联网（A 股部分）────────────────────────────────────────────────
  "中国移动": "sh.600941",
  "中国联通": "sh.600050",
  "中国电信": "sh.601728",
  "中国铁塔": "sh.601138",

  // ── 指数 ──────────────────────────────────────────────────────────────────
  "上证指数": "sh.000001", "上证": "sh.000001", "上证综指": "sh.000001",
  "深证成指": "sz.399001", "深证": "sz.399001",
  "创业板指": "sz.399006", "创业板": "sz.399006",
  "科创50": "sh.000688", "科创板": "sh.000688",
  "沪深300": "sh.000300", "沪深300指数": "sh.000300",
  "中证500": "sh.000905",
  "中证1000": "sh.000852",
  "中证800": "sh.000906",
};

/**
 * Yahoo Finance A 股代码格式（.SS/.SZ）→ Baostock 格式（sh./sz.）映射
 * 用于去重检测：如果 Yahoo Finance 已处理该 A 股，Baostock 不重复触发
 */
export function yahooToBoastockCode(yahooCode: string): string | null {
  // 600519.SS → sh.600519
  const ssMatch = yahooCode.match(/^(\d{6})\.SS$/i);
  if (ssMatch) return `sh.${ssMatch[1]}`;
  // 000001.SZ → sz.000001
  const szMatch = yahooCode.match(/^(\d{6})\.SZ$/i);
  if (szMatch) return `sz.${szMatch[1]}`;
  return null;
}

/**
 * Baostock 格式 → Yahoo Finance 格式
 * sh.600519 → 600519.SS
 */
export function baostockToYahooCode(bsCode: string): string | null {
  const shMatch = bsCode.match(/^sh\.(\d{6})$/i);
  if (shMatch) return `${shMatch[1]}.SS`;
  const szMatch = bsCode.match(/^sz\.(\d{6})$/i);
  if (szMatch) return `${szMatch[1]}.SZ`;
  return null;
}

/**
 * 判断 Yahoo Finance 检测到的代码是否为 A 股（应由 Baostock 处理）
 * 用于避免 Yahoo Finance 和 Baostock 重复拉取同一支 A 股
 */
export function isAStockYahooCode(yahooCode: string): boolean {
  return /^\d{6}\.(SS|SZ)$/i.test(yahooCode);
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

/**
 * 从任务描述中识别 A 股代码（Baostock 格式）
 * 支持：sh./sz. 格式、纯 6 位数字、公司名称
 */
export function extractAStockCodes(text: string): string[] {
  const found = new Set<string>();

  // 1. 直接匹配 sh./sz. 格式
  const directMatches = text.match(/[sS][hHzZ]\.\d{6}/g) || [];
  directMatches.forEach(m => found.add(m.toLowerCase()));

  // 2. 匹配 Yahoo Finance 格式的 A 股代码（600519.SS / 000001.SZ）并转换
  const yahooAMatches = text.match(/\b\d{6}\.(SS|SZ)\b/gi) || [];
  yahooAMatches.forEach(code => {
    const bsCode = yahooToBoastockCode(code);
    if (bsCode) found.add(bsCode);
  });

  // 3. 匹配纯 6 位数字（A 股代码）
  const numMatches = text.match(/\b(6\d{5}|0\d{5}|3\d{5})\b/g) || [];
  numMatches.forEach(code => {
    if (code.startsWith("6")) found.add(`sh.${code}`);
    else found.add(`sz.${code}`);
  });

  // 4. 匹配公司名称（从名称库中查找）
  for (const [name, code] of Object.entries(A_STOCK_NAME_MAP)) {
    if (code && text.includes(name)) {
      found.add(code);
    }
  }

  // 过滤空值，最多返回 5 个
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
    ".SS", ".SZ",
  ];
  return aStockKeywords.some(kw => text.includes(kw));
}

/**
 * 获取公司名称（优先从名称库反查，其次用代码本身）
 */
export function getAStockName(code: string): string {
  // 优先取最短的名称（避免「贵州茅台」和「茅台」都匹配时取全称）
  const entries = Object.entries(A_STOCK_NAME_MAP)
    .filter(([, c]) => c === code)
    .sort((a, b) => a[0].length - b[0].length);
  // 返回最长的名称（更完整）
  const fullName = entries.sort((a, b) => b[0].length - a[0].length)[0];
  return fullName ? fullName[0] : code;
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
  // 动态计算最近已发布的完整季度（当前季度-1，确保数据已发布）
  const now = new Date();
  const curQ = Math.floor(now.getMonth() / 3) + 1; // 1-4
  const profitYear = curQ === 1 ? now.getFullYear() - 1 : now.getFullYear();
  const profitQuarter = curQ === 1 ? 4 : curQ - 1;
  const script = `
import baostock as bs, json
bs.login()
rs = bs.query_profit_data(code='${code}', year=${profitYear}, quarter=${profitQuarter})
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
  // 动态计算最近已发布的完整季度
  const now = new Date();
  const curQ = Math.floor(now.getMonth() / 3) + 1;
  const growthYear = curQ === 1 ? now.getFullYear() - 1 : now.getFullYear();
  const growthQuarter = curQ === 1 ? 4 : curQ - 1;
  const script = `
import baostock as bs, json
bs.login()
rs = bs.query_growth_data(code='${code}', year=${growthYear}, quarter=${growthQuarter})
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
  const name = getAStockName(code);

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
