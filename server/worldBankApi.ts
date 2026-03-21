/**
 * World Bank API 数据获取模块
 * 使用 World Bank REST API v2 获取全球宏观经济数据
 * 无需 API Key，直接调用公开接口
 */

const WB_BASE = "https://api.worldbank.org/v2";
const TIMEOUT_MS = 12000;

// ─── 类型定义 ────────────────────────────────────────────────────────────────

export interface WBIndicatorValue {
  year: string;
  value: number | null;
}

export interface WBCountryData {
  countryCode: string;
  countryName: string;
  indicator: string;
  indicatorCode: string;
  latest: WBIndicatorValue | null;
  trend: WBIndicatorValue[]; // 最近 5 年
}

export interface WorldBankReport {
  countries: WBCountryData[];
  globalIndicators: WBCountryData[];
  summary: string;
  fetchedAt: string;
}

// ─── 指标映射 ────────────────────────────────────────────────────────────────

/** 投资分析相关的核心指标 */
const CORE_INDICATORS: Record<string, string> = {
  "NY.GDP.MKTP.CD": "GDP（现价美元）",
  "NY.GDP.MKTP.KD.ZG": "GDP 增长率（%）",
  "NY.GDP.PCAP.CD": "人均 GDP（美元）",
  "FP.CPI.TOTL.ZG": "CPI 通胀率（%）",
  "SL.UEM.TOTL.ZS": "失业率（%）",
  "NE.TRD.GNFS.ZS": "贸易额占 GDP（%）",
  "BX.KLT.DINV.WD.GD.ZS": "外商直接投资占 GDP（%）",
  "GC.DOD.TOTL.GD.ZS": "政府债务占 GDP（%）",
  "BN.CAB.XOKA.GD.ZS": "经常账户余额占 GDP（%）",
};

/** 国家名称 → World Bank ISO2 代码映射 */
const COUNTRY_NAME_MAP: Record<string, string> = {
  // 英文
  "united states": "US", "usa": "US", "america": "US", "us": "US",
  "china": "CN", "prc": "CN",
  "japan": "JP",
  "germany": "DE",
  "united kingdom": "GB", "uk": "GB", "britain": "GB",
  "france": "FR",
  "india": "IN",
  "brazil": "BR",
  "canada": "CA",
  "australia": "AU",
  "south korea": "KR", "korea": "KR",
  "russia": "RU",
  "italy": "IT",
  "spain": "ES",
  "mexico": "MX",
  "indonesia": "ID",
  "turkey": "TR",
  "saudi arabia": "SA",
  "netherlands": "NL",
  "switzerland": "CH",
  "taiwan": "TW",
  "singapore": "SG",
  "hong kong": "HK",
  "vietnam": "VN",
  "thailand": "TH",
  "malaysia": "MY",
  // 中文
  "美国": "US", "美利坚": "US",
  "中国": "CN", "中华": "CN",
  "日本": "JP",
  "德国": "DE",
  "英国": "GB",
  "法国": "FR",
  "印度": "IN",
  "巴西": "BR",
  "加拿大": "CA",
  "澳大利亚": "AU", "澳洲": "AU",
  "韩国": "KR", "南韩": "KR",
  "俄罗斯": "RU",
  "意大利": "IT",
  "西班牙": "ES",
  "墨西哥": "MX",
  "印度尼西亚": "ID", "印尼": "ID",
  "土耳其": "TR",
  "沙特": "SA", "沙特阿拉伯": "SA",
  "荷兰": "NL",
  "瑞士": "CH",
  "台湾": "TW",
  "新加坡": "SG",
  "香港": "HK",
  "越南": "VN",
  "泰国": "TH",
  "马来西亚": "MY",
};

/** 全球/地区聚合代码 */
const GLOBAL_CODES: Record<string, string> = {
  "WLD": "全球",
  "EMU": "欧元区",
  "EAP": "东亚及太平洋",
  "ECA": "欧洲及中亚",
  "LAC": "拉丁美洲及加勒比",
  "MNA": "中东及北非",
  "SAS": "南亚",
  "SSA": "撒哈拉以南非洲",
};

// ─── 核心获取函数 ─────────────────────────────────────────────────────────────

async function fetchIndicator(
  countryCode: string,
  indicatorCode: string,
  years = 5
): Promise<WBIndicatorValue[]> {
  const url = `${WB_BASE}/country/${countryCode}/indicator/${indicatorCode}?format=json&mrv=${years}&per_page=${years}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = await res.json();
    const records: Array<{ date: string; value: number | null }> = data[1] || [];
    return records
      .filter((r) => r.value !== null)
      .map((r) => ({ year: r.date, value: r.value }))
      .sort((a, b) => parseInt(b.year) - parseInt(a.year));
  } catch {
    clearTimeout(timer);
    return [];
  }
}

/** 从任务描述中提取国家代码列表 */
export function extractCountryCodes(taskText: string): string[] {
  const lower = taskText.toLowerCase();
  const found = new Set<string>();

  for (const [name, code] of Object.entries(COUNTRY_NAME_MAP)) {
    if (lower.includes(name.toLowerCase())) {
      found.add(code);
    }
  }

  // 如果没有识别到具体国家，默认返回美国（最常见的投资分析场景）
  if (found.size === 0) {
    found.add("US");
  }

  return Array.from(found).slice(0, 5); // 最多 5 个国家（已是 Array.from）
}

/** 根据任务关键词选择相关指标 */
function selectIndicators(taskText: string): string[] {
  const lower = taskText.toLowerCase();
  const selected: string[] = [];

  // 始终包含 GDP 增长率和通胀率
  selected.push("NY.GDP.MKTP.KD.ZG", "FP.CPI.TOTL.ZG");

  if (/gdp|经济|growth|增长/.test(lower)) {
    selected.push("NY.GDP.MKTP.CD", "NY.GDP.PCAP.CD");
  }
  if (/unemploy|就业|labor|劳动/.test(lower)) {
    selected.push("SL.UEM.TOTL.ZS");
  }
  if (/trade|贸易|export|import|进出口/.test(lower)) {
    selected.push("NE.TRD.GNFS.ZS");
  }
  if (/debt|债务|fiscal|财政/.test(lower)) {
    selected.push("GC.DOD.TOTL.GD.ZS");
  }
  if (/fdi|投资|foreign|外资/.test(lower)) {
    selected.push("BX.KLT.DINV.WD.GD.ZS");
  }
  if (/current account|经常账户|贸易顺差|逆差/.test(lower)) {
    selected.push("BN.CAB.XOKA.GD.ZS");
  }

  return Array.from(new Set(selected)).slice(0, 6); // 最多 6 个指标
}

// ─── 主入口 ───────────────────────────────────────────────────────────────────

/**
 * 根据任务描述获取相关国家的 World Bank 宏观数据
 */
export async function fetchWorldBankData(taskText: string): Promise<string> {
  const countryCodes = extractCountryCodes(taskText);
  const indicatorCodes = selectIndicators(taskText);

  // 并发获取所有国家 × 指标组合
  const fetchTasks: Array<Promise<WBCountryData>> = [];

  for (const countryCode of countryCodes) {
    for (const indicatorCode of indicatorCodes) {
      fetchTasks.push(
        (async (): Promise<WBCountryData> => {
          const trend = await fetchIndicator(countryCode, indicatorCode, 5);
          const latest = trend.length > 0 ? trend[0] : null;
          return {
            countryCode,
            countryName: getCountryName(countryCode),
            indicator: CORE_INDICATORS[indicatorCode] || indicatorCode,
            indicatorCode,
            latest,
            trend,
          };
        })()
      );
    }
  }

  // 同时获取全球聚合数据（GDP增长率和通胀率）
  const globalTasks: Array<Promise<WBCountryData>> = [];
  for (const globalCode of ["WLD", "EMU"]) {
    for (const indicatorCode of ["NY.GDP.MKTP.KD.ZG", "FP.CPI.TOTL.ZG"]) {
      globalTasks.push(
        (async (): Promise<WBCountryData> => {
          const trend = await fetchIndicator(globalCode, indicatorCode, 3);
          const latest = trend.length > 0 ? trend[0] : null;
          return {
            countryCode: globalCode,
            countryName: GLOBAL_CODES[globalCode] || globalCode,
            indicator: CORE_INDICATORS[indicatorCode] || indicatorCode,
            indicatorCode,
            latest,
            trend,
          };
        })()
      );
    }
  }

  const [countryResults, globalResults] = await Promise.all([
    Promise.allSettled(fetchTasks),
    Promise.allSettled(globalTasks),
  ]);

  const countries = countryResults
    .filter((r): r is PromiseFulfilledResult<WBCountryData> => r.status === "fulfilled" && r.value.latest !== null)
    .map((r) => r.value);

  const globals = globalResults
    .filter((r): r is PromiseFulfilledResult<WBCountryData> => r.status === "fulfilled" && r.value.latest !== null)
    .map((r) => r.value);

  return formatWorldBankReport(countries, globals);
}

/** 格式化报告为 Markdown 文本 */
function formatWorldBankReport(
  countries: WBCountryData[],
  globals: WBCountryData[]
): string {
  if (countries.length === 0 && globals.length === 0) {
    return "World Bank 数据暂时不可用。";
  }

  const lines: string[] = ["## 📊 World Bank 宏观经济数据\n"];

  // 按国家分组
  const byCountry = new Map<string, WBCountryData[]>();
  for (const d of countries) {
    const key = `${d.countryName}(${d.countryCode})`;
    if (!byCountry.has(key)) byCountry.set(key, []);
    byCountry.get(key)!.push(d);
  }

  for (const [countryLabel, data] of Array.from(byCountry.entries())) {
    lines.push(`### ${countryLabel}`);
    lines.push("| 指标 | 最新值 | 年份 | 5年趋势 |");
    lines.push("|------|--------|------|---------|");
    for (const d of data) {
      if (!d.latest) continue;
      const val = formatValue(d.latest.value, d.indicatorCode);
      const trend = d.trend
        .slice(0, 3)
        .map((t: WBIndicatorValue) => `${t.year}:${formatValue(t.value, d.indicatorCode)}`)
        .join(" → ");
      lines.push(`| ${d.indicator} | **${val}** | ${d.latest.year} | ${trend} |`);
    }
    lines.push("");
  }

  // 全球对比
  if (globals.length > 0) {
    lines.push("### 全球/地区对比");
    lines.push("| 地区 | 指标 | 最新值 | 年份 |");
    lines.push("|------|------|--------|------|");
    for (const d of globals) {
      if (!d.latest) continue;
      const val = formatValue(d.latest.value, d.indicatorCode);
      lines.push(`| ${d.countryName} | ${d.indicator} | ${val} | ${d.latest.year} |`);
    }
    lines.push("");
  }

  lines.push(`*数据来源：World Bank Open Data | 更新时间：${new Date().toISOString().split("T")[0]}*`);

  return lines.join("\n");
}

/** 根据指标类型格式化数值 */
function formatValue(value: number | null, indicatorCode: string): string {
  if (value === null || value === undefined) return "N/A";

  if (indicatorCode === "NY.GDP.MKTP.CD") {
    // GDP 转为万亿美元
    if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
    return `$${value.toLocaleString()}`;
  }

  if (indicatorCode.includes("ZG") || indicatorCode.includes("ZS")) {
    // 百分比指标
    return `${value.toFixed(2)}%`;
  }

  if (indicatorCode === "NY.GDP.PCAP.CD") {
    return `$${Math.round(value).toLocaleString()}`;
  }

  return value.toFixed(2);
}

/** 获取国家名称 */
function getCountryName(code: string): string {
  const nameMap: Record<string, string> = {
    US: "美国", CN: "中国", JP: "日本", DE: "德国", GB: "英国",
    FR: "法国", IN: "印度", BR: "巴西", CA: "加拿大", AU: "澳大利亚",
    KR: "韩国", RU: "俄罗斯", IT: "意大利", ES: "西班牙", MX: "墨西哥",
    ID: "印度尼西亚", TR: "土耳其", SA: "沙特阿拉伯", NL: "荷兰",
    CH: "瑞士", TW: "台湾", SG: "新加坡", HK: "香港", VN: "越南",
    TH: "泰国", MY: "马来西亚",
  };
  return nameMap[code] || code;
}
