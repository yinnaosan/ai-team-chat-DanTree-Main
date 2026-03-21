/**
 * IMF DataMapper API Integration
 * 数据来源：IMF World Economic Outlook (WEO) 数据库
 * API 文档：https://www.imf.org/external/datamapper/api/help
 * 特点：免费公开，无需 API Key，含 2025-2026 年预测值，133 个指标，241 个国家
 */

const IMF_BASE = "https://www.imf.org/external/datamapper/api/v1";
const REQUEST_TIMEOUT_MS = 10000;

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
    label: "GDP（名义，十亿美元）",
    unit: "十亿美元",
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
    label: "GDP占全球PPP份额",
    unit: "%",
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

  // 去重并排序
  return Array.from(found).slice(0, 12); // 最多 12 个国家
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

  // 按分数排序，取前 6 个；若全部 0 分则返回核心 4 个
  const sorted = scored.sort((a, b) => b.score - a.score);
  const relevant = sorted.filter((x) => x.score > 0).map((x) => x.indicator);

  if (relevant.length === 0) {
    // 默认返回最常用的 4 个指标
    return IMF_INDICATORS.filter((i) =>
      ["NGDP_RPCH", "PCPIPCH", "LUR", "GGXWDG_NGDP"].includes(i.code)
    );
  }

  return relevant.slice(0, 6);
}

// ─── 核心 API 调用 ─────────────────────────────────────────────────────────────

interface ImfRawResponse {
  values: Record<string, Record<string, Record<string, number>>>;
}

/** 获取单个指标的多国数据（含历史 + 预测） */
async function fetchIndicator(
  indicatorCode: string,
  countryCodes: string[],
  years: number[]
): Promise<Record<string, Record<string, number | null>>> {
  const periodsParam = years.join(",");
  const countriesParam = countryCodes.join("/");
  const url = `${IMF_BASE}/${indicatorCode}/${countriesParam}?periods=${periodsParam}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) return {};

    const data: ImfRawResponse = await res.json();
    const vals = data?.values?.[indicatorCode] ?? {};

    // 转换为 { countryCode: { year: value } } 格式
    const result: Record<string, Record<string, number | null>> = {};
    for (const country of countryCodes) {
      result[country] = {};
      for (const year of years) {
        const v = vals[country]?.[String(year)];
        result[country][String(year)] = v !== undefined ? v : null;
      }
    }
    return result;
  } catch {
    clearTimeout(timer);
    return {};
  }
}

// ─── 主入口：获取 IMF 宏观数据 ────────────────────────────────────────────────

export interface ImfDataResult {
  countries: string[];
  indicators: ImfIndicator[];
  data: Record<string, Record<string, Record<string, number | null>>>;
  // { indicatorCode: { countryCode: { year: value } } }
  years: number[];
  fetchedAt: string;
}

/**
 * 根据任务描述自动选择国家和指标，批量获取 IMF WEO 数据
 */
export async function fetchImfData(taskText: string): Promise<ImfDataResult | null> {
  const countries = detectCountriesFromText(taskText);
  const indicators = selectIndicatorsFromText(taskText);

  // 获取近 4 年历史 + 未来 2 年预测
  const currentYear = new Date().getFullYear();
  const years = [
    currentYear - 3,
    currentYear - 2,
    currentYear - 1,
    currentYear,
    currentYear + 1,
    currentYear + 2,
  ];

  // 并行获取所有指标
  const results = await Promise.allSettled(
    indicators.map((ind) => fetchIndicator(ind.code, countries, years))
  );

  const data: Record<string, Record<string, Record<string, number | null>>> = {};
  for (let i = 0; i < indicators.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled" && Object.keys(r.value).length > 0) {
      data[indicators[i].code] = r.value;
    }
  }

  if (Object.keys(data).length === 0) return null;

  return {
    countries,
    indicators: indicators.filter((ind) => data[ind.code]),
    data,
    years,
    fetchedAt: new Date().toISOString(),
  };
}

// ─── 格式化输出 ────────────────────────────────────────────────────────────────

/** 国家 ISO3 → 显示名称 */
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
  if (unit === "美元" || unit === "十亿美元") {
    return rounded >= 1000
      ? `${(rounded / 1000).toFixed(1)}T`
      : rounded >= 1
      ? rounded.toLocaleString()
      : rounded.toFixed(2);
  }
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}${unit === "%" ? "%" : ""}`;
}

/**
 * 将 IMF 数据格式化为 Markdown 表格（供 Manus 分析使用）
 */
export function formatImfDataAsMarkdown(result: ImfDataResult): string {
  if (!result || result.indicators.length === 0) return "";

  const lines: string[] = [
    "## 📊 IMF WEO 宏观经济展望数据",
    `> 数据来源：IMF World Economic Outlook（含 ${result.years[result.years.length - 1]} 年预测）`,
    `> 获取时间：${new Date(result.fetchedAt).toLocaleString("zh-CN")}`,
    "",
  ];

  const currentYear = new Date().getFullYear();

  for (const ind of result.indicators) {
    const indData = result.data[ind.code];
    if (!indData) continue;

    lines.push(`### ${ind.label}（${ind.unit}）`);

    // 选择要显示的年份（近 3 年历史 + 当年 + 2 年预测）
    const displayYears = result.years.slice(-5);

    // 表头
    const yearHeaders = displayYears.map((y) =>
      y > currentYear ? `${y}E` : String(y)
    );
    lines.push(`| 国家 | ${yearHeaders.join(" | ")} |`);
    lines.push(`| --- | ${displayYears.map(() => "---").join(" | ")} |`);

    // 数据行
    for (const country of result.countries) {
      const countryData = indData[country] ?? {};
      const displayName = COUNTRY_DISPLAY[country] ?? country;
      const values = displayYears.map((y) =>
        fmtVal(countryData[String(y)], ind.unit)
      );
      lines.push(`| ${displayName} | ${values.join(" | ")} |`);
    }

    lines.push("");
  }

  // 添加数据说明
  lines.push(
    "> **注**：E = IMF 预测值；数据来自 IMF World Economic Outlook Database，每年 4 月和 10 月更新。"
  );

  return lines.join("\n");
}

// ─── 健康检测 ──────────────────────────────────────────────────────────────────

/** 轻量健康探针：检测 IMF API 是否可访问 */
export async function checkImfApiHealth(): Promise<{
  status: "active" | "error" | "timeout";
  latencyMs?: number;
}> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(
      `${IMF_BASE}/NGDP_RPCH/USA?periods=${new Date().getFullYear()}`,
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
