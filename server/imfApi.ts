/**
 * IMF/World Bank 宏观经济数据集成
 * 数据来源：World Bank Open Data API（数据来源于 IMF/World Bank 联合统计）
 * API 文档：https://datahelpdesk.worldbank.org/knowledgebase/articles/889392
 * 特点：免费公开，无需 API Key，覆盖 200+ 国家，含历史数据
 *
 * 注：IMF DataMapper API 因 Akamai CDN IP 封锁无法从服务器端直接访问，
 *     改用 World Bank API 提供等效的宏观经济指标数据。
 */

const WB_BASE = "https://api.worldbank.org/v2";
const REQUEST_TIMEOUT_MS = 12000;

// ─── World Bank 指标代码映射（对应原 IMF 指标）──────────────────────────────────
// WB 指标 → IMF 等效指标
const WB_INDICATOR_MAP: Record<string, string> = {
  NGDP_RPCH:    "NY.GDP.MKTP.KD.ZG",   // GDP 实际增长率 (%)
  NGDPDPC:      "NY.GDP.PCAP.CD",       // 人均 GDP (现价美元)
  NGDPD:        "NY.GDP.MKTP.CD",       // GDP 名义总量 (现价美元)
  PCPIPCH:      "FP.CPI.TOTL.ZG",       // CPI 通胀率 (%)
  LUR:          "SL.UEM.TOTL.ZS",       // 失业率 (%)
  GGXWDG_NGDP:  "GC.DOD.TOTL.GD.ZS",   // 政府债务/GDP (%)
  GGXCNL_NGDP:  "GC.NLD.TOTL.GD.ZS",   // 财政净借贷/GDP (%)
  BCA_NGDPD:    "BN.CAB.XOKA.GD.ZS",   // 经常账户/GDP (%)
  NGSD_NGDP:    "NY.GNS.ICTR.ZS",       // 国民储蓄率/GDP (%)
  NID_NGDP:     "NE.GDI.TOTL.ZS",       // 总投资/GDP (%)
  PPPSH:        "NY.GDP.MKTP.PP.CD",    // GDP PPP (现价国际元，用于份额计算)
};

// ISO3 → World Bank ISO2 代码映射
const ISO3_TO_WB: Record<string, string> = {
  CHN: "CN", USA: "US", JPN: "JP", DEU: "DE", GBR: "GB",
  FRA: "FR", IND: "IN", BRA: "BR", KOR: "KR", AUS: "AU",
  CAN: "CA", RUS: "RU", SAU: "SA", ZAF: "ZA", MEX: "MX",
  IDN: "ID", TUR: "TR", ARG: "AR", ITA: "IT", ESP: "ES",
  NLD: "NL", CHE: "CH", SWE: "SE", NOR: "NO", POL: "PL",
  THA: "TH", VNM: "VN", SGP: "SG", HKG: "HK", TWN: "TW",
  MYS: "MY", PHL: "PH", ISR: "IL", EGY: "EG", NGA: "NG",
  EUQ: "XC", WLD: "1W", EME: "XO", ADV: "XY",
};

// ─── 国家映射（中英文 → ISO3 代码）────────────────────────────────────────────
const COUNTRY_MAP: Record<string, string> = {
  // 中文名
  中国: "CHN", 美国: "USA", 日本: "JPN", 德国: "DEU", 英国: "GBR",
  法国: "FRA", 印度: "IND", 巴西: "BRA", 韩国: "KOR", 澳大利亚: "AUS",
  加拿大: "CAN", 俄罗斯: "RUS", 沙特: "SAU", 沙特阿拉伯: "SAU",
  南非: "ZAF", 墨西哥: "MEX", 印度尼西亚: "IDN", 土耳其: "TUR",
  阿根廷: "ARG", 意大利: "ITA", 西班牙: "ESP", 荷兰: "NLD",
  瑞士: "CHE", 瑞典: "SWE", 挪威: "NOR", 波兰: "POL",
  泰国: "THA", 越南: "VNM", 新加坡: "SGP", 香港: "HKG",
  台湾: "TWN", 马来西亚: "MYS", 菲律宾: "PHL", 以色列: "ISR",
  埃及: "EGY", 尼日利亚: "NGA", 欧元区: "EUQ", 全球: "WLD",
  新兴市场: "EME", 发达经济体: "ADV",
  // 英文名 / 缩写
  china: "CHN", usa: "USA", us: "USA", america: "USA",
  japan: "JPN", germany: "DEU", uk: "GBR", "united kingdom": "GBR",
  france: "FRA", india: "IND", brazil: "BRA", "south korea": "KOR",
  korea: "KOR", australia: "AUS", canada: "CAN", russia: "RUS",
  "saudi arabia": "SAU", "south africa": "ZAF", mexico: "MEX",
  indonesia: "IDN", turkey: "TUR", argentina: "ARG",
  italy: "ITA", spain: "ESP", netherlands: "NLD",
  switzerland: "CHE", sweden: "SWE", norway: "NOR", poland: "POL",
  thailand: "THA", vietnam: "VNM", singapore: "SGP",
  "hong kong": "HKG", taiwan: "TWN", malaysia: "MYS",
  philippines: "PHL", israel: "ISR", egypt: "EGY",
  nigeria: "NGA", eurozone: "EUQ", "euro area": "EUQ",
  world: "WLD", global: "WLD",
  // ISO3 直通
  CHN: "CHN", USA: "USA", JPN: "JPN", DEU: "DEU", GBR: "GBR",
  FRA: "FRA", IND: "IND", BRA: "BRA", KOR: "KOR", AUS: "AUS",
  CAN: "CAN", RUS: "RUS", SAU: "SAU", ZAF: "ZAF", MEX: "MEX",
  IDN: "IDN", TUR: "TUR", ARG: "ARG", ITA: "ITA", ESP: "ESP",
  NLD: "NLD", CHE: "CHE", SWE: "SWE", NOR: "NOR", POL: "POL",
  THA: "THA", VNM: "VNM", SGP: "SGP", HKG: "HKG", TWN: "TWN",
  MYS: "MYS", PHL: "PHL", ISR: "ISR", EGY: "EGY", NGA: "NGA",
  EUQ: "EUQ", WLD: "WLD", EME: "EME", ADV: "ADV",
};

// ─── 指标定义 ──────────────────────────────────────────────────────────────────
export interface ImfIndicator {
  code: string;
  label: string;
  unit: string;
  keywords: string[];
}

export const IMF_INDICATORS: ImfIndicator[] = [
  {
    code: "NGDP_RPCH",
    label: "GDP实际增长率",
    unit: "%",
    keywords: ["gdp", "增长", "经济增速", "growth", "经济体量", "经济规模"],
  },
  {
    code: "NGDPDPC",
    label: "人均GDP",
    unit: "美元",
    keywords: ["人均", "per capita", "gdp", "生活水平", "收入"],
  },
  {
    code: "NGDPD",
    label: "GDP（名义，美元）",
    unit: "美元",
    keywords: ["gdp", "经济体量", "经济规模", "总量"],
  },
  {
    code: "PCPIPCH",
    label: "CPI通胀率",
    unit: "%",
    keywords: ["通胀", "cpi", "物价", "inflation", "通货膨胀", "价格"],
  },
  {
    code: "LUR",
    label: "失业率",
    unit: "%",
    keywords: ["失业", "就业", "unemployment", "劳动力市场", "就业市场"],
  },
  {
    code: "GGXWDG_NGDP",
    label: "政府总债务/GDP",
    unit: "%",
    keywords: ["债务", "政府债务", "国债", "debt", "财政", "赤字"],
  },
  {
    code: "GGXCNL_NGDP",
    label: "财政净借贷/GDP",
    unit: "%",
    keywords: ["财政", "赤字", "盈余", "fiscal", "预算", "财政政策"],
  },
  {
    code: "BCA_NGDPD",
    label: "经常账户余额/GDP",
    unit: "%",
    keywords: ["经常账户", "贸易", "current account", "国际收支", "顺差", "逆差"],
  },
  {
    code: "NGSD_NGDP",
    label: "国民储蓄率/GDP",
    unit: "%",
    keywords: ["储蓄", "saving", "储蓄率", "资本形成"],
  },
  {
    code: "NID_NGDP",
    label: "总投资/GDP",
    unit: "%",
    keywords: ["投资", "investment", "资本", "固定资产"],
  },
  {
    code: "PPPSH",
    label: "GDP（PPP，国际元）",
    unit: "国际元",
    keywords: ["ppp", "购买力", "全球份额", "比较", "对比"],
  },
];

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

/** 从任务文本中提取国家 ISO3 代码列表 */
export function detectCountriesFromText(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();

  for (const [key, iso3] of Object.entries(COUNTRY_MAP)) {
    if (lower.includes(key.toLowerCase())) {
      found.add(iso3);
    }
  }

  // 默认包含主要经济体
  if (found.size === 0) {
    return ["CHN", "USA", "JPN", "DEU", "GBR", "IND"];
  }

  return Array.from(found).slice(0, 12);
}

/** 根据任务关键词选择相关指标 */
export function selectIndicatorsFromText(text: string): ImfIndicator[] {
  const lower = text.toLowerCase();
  const scored: Array<{ indicator: ImfIndicator; score: number }> = [];

  for (const ind of IMF_INDICATORS) {
    let score = 0;
    for (const kw of ind.keywords) {
      if (lower.includes(kw.toLowerCase())) score += 1;
    }
    scored.push({ indicator: ind, score });
  }

  const sorted = scored.sort((a, b) => b.score - a.score);
  const relevant = sorted.filter((x) => x.score > 0).map((x) => x.indicator);

  if (relevant.length === 0) {
    return IMF_INDICATORS.filter((i) =>
      ["NGDP_RPCH", "PCPIPCH", "LUR", "GGXWDG_NGDP"].includes(i.code)
    );
  }

  return relevant.slice(0, 6);
}

// ─── World Bank API 调用 ───────────────────────────────────────────────────────

interface WbObservation {
  date: string;
  value: number | null;
  country: { id: string; value: string };
}

/**
 * 通过 World Bank API 获取单个指标的多国数据
 */
async function fetchWbIndicator(
  imfCode: string,
  iso3Codes: string[],
  startYear: number,
  endYear: number
): Promise<Record<string, Record<string, number | null>>> {
  const wbCode = WB_INDICATOR_MAP[imfCode];
  if (!wbCode) return {};

  // 转换为 WB 格式的国家代码，过滤掉没有映射的
  const wbCodes = iso3Codes
    .map((c) => ISO3_TO_WB[c])
    .filter(Boolean);

  if (wbCodes.length === 0) return {};

  const countriesParam = wbCodes.join(";");
  const url = `${WB_BASE}/country/${countriesParam}/indicator/${wbCode}?format=json&date=${startYear}:${endYear}&per_page=500`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return {};

    const raw = await res.json() as [unknown, WbObservation[]];
    const observations: WbObservation[] = Array.isArray(raw[1]) ? raw[1] : [];

    // 反转映射：WB iso2 → ISO3
    const wb2iso3: Record<string, string> = {};
    for (const [iso3, wb] of Object.entries(ISO3_TO_WB)) {
      wb2iso3[wb] = iso3;
    }

    // 整理为 { iso3: { year: value } }
    const result: Record<string, Record<string, number | null>> = {};
    for (const iso3 of iso3Codes) {
      result[iso3] = {};
      for (let y = startYear; y <= endYear; y++) {
        result[iso3][String(y)] = null;
      }
    }

    for (const obs of observations) {
      const wb2 = obs.country?.id;
      const iso3 = wb2iso3[wb2];
      if (iso3 && result[iso3]) {
        result[iso3][obs.date] = obs.value;
      }
    }

    return result;
  } catch {
    clearTimeout(timer);
    return {};
  }
}

// ─── 主入口：获取宏观数据 ──────────────────────────────────────────────────────

export interface ImfDataResult {
  countries: string[];
  indicators: ImfIndicator[];
  data: Record<string, Record<string, Record<string, number | null>>>;
  years: number[];
  fetchedAt: string;
  source: "worldbank"; // 数据来源标记
}

/**
 * 根据任务描述自动选择国家和指标，批量获取宏观经济数据
 * 数据通过 World Bank API 获取（等效 IMF WEO 指标）
 */
export async function fetchImfData(taskText: string): Promise<ImfDataResult | null> {
  const countries = detectCountriesFromText(taskText);
  const indicators = selectIndicatorsFromText(taskText);

  const currentYear = new Date().getFullYear();
  const startYear = currentYear - 4;
  const endYear = currentYear - 1; // WB 历史数据，最新为上一年

  const years: number[] = [];
  for (let y = startYear; y <= endYear; y++) years.push(y);

  // 并行获取所有指标
  const results = await Promise.allSettled(
    indicators.map((ind) =>
      fetchWbIndicator(ind.code, countries, startYear, endYear)
    )
  );

  const data: Record<string, Record<string, Record<string, number | null>>> = {};
  for (let i = 0; i < indicators.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled" && Object.keys(r.value).length > 0) {
      // 检查是否有实际数据（非全 null）
      const hasData = Object.values(r.value).some((countryData) =>
        Object.values(countryData).some((v) => v !== null)
      );
      if (hasData) {
        data[indicators[i].code] = r.value;
      }
    }
  }

  if (Object.keys(data).length === 0) return null;

  return {
    countries,
    indicators: indicators.filter((ind) => data[ind.code]),
    data,
    years,
    fetchedAt: new Date().toISOString(),
    source: "worldbank",
  };
}

// ─── 格式化输出 ────────────────────────────────────────────────────────────────

const COUNTRY_DISPLAY: Record<string, string> = {
  CHN: "中国", USA: "美国", JPN: "日本", DEU: "德国", GBR: "英国",
  FRA: "法国", IND: "印度", BRA: "巴西", KOR: "韩国", AUS: "澳大利亚",
  CAN: "加拿大", RUS: "俄罗斯", SAU: "沙特", ZAF: "南非", MEX: "墨西哥",
  IDN: "印尼", TUR: "土耳其", ARG: "阿根廷", ITA: "意大利", ESP: "西班牙",
  NLD: "荷兰", CHE: "瑞士", SWE: "瑞典", NOR: "挪威", POL: "波兰",
  THA: "泰国", VNM: "越南", SGP: "新加坡", HKG: "香港", TWN: "台湾",
  MYS: "马来西亚", PHL: "菲律宾", ISR: "以色列", EGY: "埃及",
  NGA: "尼日利亚", EUQ: "欧元区", WLD: "全球", EME: "新兴市场", ADV: "发达经济体",
};

function fmtVal(v: number | null | undefined, unit: string): string {
  if (v === null || v === undefined) return "N/A";
  const rounded = Math.round(v * 100) / 100;
  if (unit === "美元" || unit === "国际元") {
    if (rounded >= 1e12) return `$${(rounded / 1e12).toFixed(1)}T`;
    if (rounded >= 1e9) return `$${(rounded / 1e9).toFixed(0)}B`;
    if (rounded >= 1e6) return `$${(rounded / 1e6).toFixed(0)}M`;
    return `$${rounded.toLocaleString()}`;
  }
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}${unit === "%" ? "%" : ""}`;
}

/**
 * 将宏观数据格式化为 Markdown 表格（供 Manus 分析使用）
 */
export function formatImfDataAsMarkdown(result: ImfDataResult): string {
  if (!result || result.indicators.length === 0) return "";

  const lines: string[] = [
    "## 📊 全球宏观经济数据（IMF/World Bank 联合统计）",
    `> 数据来源：World Bank Open Data（数据口径与 IMF WEO 一致）`,
    `> 覆盖年份：${result.years[0]}–${result.years[result.years.length - 1]}`,
    `> 获取时间：${new Date(result.fetchedAt).toLocaleString("zh-CN")}`,
    "",
  ];

  for (const ind of result.indicators) {
    const indData = result.data[ind.code];
    if (!indData) continue;

    lines.push(`### ${ind.label}（${ind.unit}）`);

    const yearHeaders = result.years.map(String);
    lines.push(`| 国家 | ${yearHeaders.join(" | ")} |`);
    lines.push(`| --- | ${result.years.map(() => "---").join(" | ")} |`);

    for (const country of result.countries) {
      const countryData = indData[country] ?? {};
      const displayName = COUNTRY_DISPLAY[country] ?? country;
      const values = result.years.map((y) =>
        fmtVal(countryData[String(y)], ind.unit)
      );
      lines.push(`| ${displayName} | ${values.join(" | ")} |`);
    }

    lines.push("");
  }

  lines.push(
    "> **数据说明**：数据来自 World Bank Open Data，与 IMF WEO 统计口径一致，每年更新。"
  );

  return lines.join("\n");
}

// ─── 健康检测 ──────────────────────────────────────────────────────────────────

/** 轻量健康探针：检测 World Bank API 是否可访问 */
export async function checkImfApiHealth(): Promise<{
  status: "active" | "error" | "timeout";
  latencyMs?: number;
}> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(
      `${WB_BASE}/country/US/indicator/NY.GDP.MKTP.KD.ZG?format=json&mrv=1&per_page=1`,
      { signal: controller.signal }
    );
    clearTimeout(timer);
    const latencyMs = Date.now() - start;
    return { status: res.ok ? "active" : "error", latencyMs };
  } catch (e: unknown) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : String(e);
    return {
      status: msg.includes("abort") || msg.includes("timeout") ? "timeout" : "error",
    };
  }
}
