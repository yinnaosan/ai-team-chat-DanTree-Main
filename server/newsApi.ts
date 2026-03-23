/**
 * NewsAPI Integration
 * 全球新闻搜索 / 头条 / 来源过滤
 * 需要 API Key：NEWS_API_KEY
 */

import { ENV } from "./_core/env";

const NEWS_API_BASE = "https://newsapi.org/v2";

// ---- 类型定义 ----

export interface NewsArticle {
  source: { id: string | null; name: string };
  author: string | null;
  title: string;
  description: string | null;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  content: string | null;
}

export interface NewsData {
  query: string;
  totalResults: number;
  articles: NewsArticle[];
  category?: string;
  source: string;
  fetchedAt: number;
}

// ---- 核心函数 ----

async function newsApiFetch(endpoint: string, params: Record<string, string>): Promise<Response> {
  const apiKey = ENV.NEWS_API_KEY;
  if (!apiKey) throw new Error("NEWS_API_KEY not configured");

  const url = new URL(`${NEWS_API_BASE}/${endpoint}`);
  url.searchParams.set("apiKey", apiKey);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { "User-Agent": "InvestmentPlatform/1.0" },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 按关键词搜索新闻（过去 7 天）
 */
export async function searchNews(
  query: string,
  pageSize = 10,
  language = "en"
): Promise<NewsArticle[]> {
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const res = await newsApiFetch("everything", {
    q: query,
    from,
    language,
    sortBy: "relevancy",
    pageSize: String(pageSize),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(`NewsAPI search failed: ${res.status} ${err.message ?? ""}`);
  }
  const data = await res.json() as { articles?: NewsArticle[]; totalResults?: number };
  return data.articles ?? [];
}

/**
 * 获取指定类别头条新闻
 */
export async function getTopHeadlines(
  category: "business" | "technology" | "general" | "science" = "business",
  country = "us",
  pageSize = 10
): Promise<NewsArticle[]> {
  const res = await newsApiFetch("top-headlines", {
    category,
    country,
    pageSize: String(pageSize),
  });
  if (!res.ok) throw new Error(`NewsAPI headlines failed: ${res.status}`);
  const data = await res.json() as { articles?: NewsArticle[] };
  return data.articles ?? [];
}

// ---- 英文 ticker 黑名单（避免缩写误触发）----
const TICKER_BLACKLIST = new Set([
  "GDP", "CPI", "PPI", "PMI", "ETF", "IPO", "CEO", "CFO", "COO", "CTO",
  "USA", "USD", "EUR", "GBP", "JPY", "CNY", "HKD", "AUD", "CAD",
  "AI", "ML", "IT", "HR", "PR", "IR", "VC", "PE", "RE",
  "FED", "ECB", "BOE", "BOJ", "IMF", "WTO", "WHO", "UN",
  "Q1", "Q2", "Q3", "Q4", "YOY", "QOQ", "TTM", "EPS", "ROE", "ROA",
  "EBIT", "EBITDA", "DCF", "NAV", "AUM", "VIX", "REIT",
  "US", "UK", "EU", "HK", "CN", "JP", "DE", "FR",
  "AND", "OR", "NOT", "THE", "FOR", "WITH", "FROM", "INTO",
]);

// ---- A 股 6 位数字 ticker 映射 ----
const A_SHARE_TICKER_MAP: Record<string, string> = {
  // 沪市主板
  "600519": "Kweichow Moutai",
  "601318": "Ping An Insurance",
  "600036": "China Merchants Bank",
  "601166": "Industrial Bank",
  "600276": "Hengrui Medicine",
  "601888": "China International Travel",
  "600887": "Inner Mongolia Yili",
  "601012": "LONGi Green Energy",
  "600900": "Yangtze Power",
  "601728": "China Telecom",
  "600028": "Sinopec",
  "601857": "PetroChina",
  "601398": "ICBC",
  "601939": "CCB",
  "601288": "Agricultural Bank of China",
  "601988": "Bank of China",
  "601328": "Bank of Communications",
  "600016": "Minsheng Bank",
  "601601": "China Pacific Insurance",
  "601628": "China Life Insurance",
  "600030": "CITIC Securities",
  "601688": "Huatai Securities",
  "600048": "Poly Developments",
  "600585": "Conch Cement",
  "600104": "SAIC Motor",
  "600309": "Wanhua Chemical",
  "601111": "Air China",
  "600115": "China Eastern Airlines",
  "600029": "China Southern Airlines",
  "601919": "COSCO Shipping",
  "600018": "Shanghai International Port",
  "601390": "China Railway Group",
  "601186": "China Railway Construction",
  "601800": "China Communications Construction",
  "601668": "China State Construction",
  "600941": "China Mobile",
  "601881": "China Galaxy Securities",
  "600000": "Shanghai Pudong Development Bank",
  "601169": "Bank of Beijing",
  "601229": "Bank of Shanghai",
  // 深市主板
  "000858": "Wuliangye",
  "000333": "Midea Group",
  "000651": "Gree Electric",
  "000001": "Ping An Bank",
  "000002": "Vanke",
  "000568": "Luzhou Laojiao",
  "000596": "Gujing Distillery",
  "000725": "BOE Technology",
  "000776": "GF Securities",
  "000895": "Shuanghui Development",
  "001979": "China Merchants Shekou",
  // 创业板
  "300750": "CATL",
  "300015": "Aier Eye Hospital",
  "300122": "Chengdu Kanghong Pharma",
  "300274": "Sungrow Power",
  "300760": "Mindray Medical",
  "300059": "East Money",
  "300014": "EVE Energy",
  "300033": "Hithink RoyalFlush",
  "300124": "Inovance Technology",
  "300498": "Wens Foodstuff",
  // 科创板
  "688981": "SMIC",
  "688036": "Transsion Holdings",
  "688111": "Kingsoft Office",
  "688599": "Tianqi Lithium",
  "688012": "China Resources Micro",
  "688041": "Haiguang Information",
};

// ---- 港股 ticker 映射（5 位数字）----
const HK_TICKER_MAP: Record<string, string> = {
  "00700": "Tencent",
  "09988": "Alibaba",
  "03690": "Meituan",
  "01810": "Xiaomi",
  "09618": "JD.com",
  "02318": "Ping An Insurance",
  "00941": "China Mobile",
  "01398": "ICBC",
  "00939": "CCB",
  "01288": "Agricultural Bank of China",
  "03988": "Bank of China",
  "02388": "BOC Hong Kong",
  "00005": "HSBC",
  "00011": "Hang Seng Bank",
  "00388": "HKEX",
  "00002": "CLP Holdings",
  "00003": "HK & China Gas",
  "00006": "Power Assets",
  "00016": "Sun Hung Kai Properties",
  "00001": "CK Hutchison",
  "00012": "Henderson Land",
  "00017": "New World Development",
  "00083": "Sino Land",
  "01113": "CK Asset",
  "02007": "Country Garden",
  "03333": "Evergrande",
  "00960": "Longfor Group",
  "01109": "China Resources Land",
  "00688": "China Overseas Land",
  "02020": "ANTA Sports",
  "06862": "Haidilao",
  "09999": "NetEase",
  "01024": "Kuaishou",
  "00268": "Kingdee International",
  "01211": "BYD",
  "02382": "Sunny Optical",
  "00992": "Lenovo",
  "00762": "China Unicom",
  "00728": "China Telecom HK",
  "02628": "China Life Insurance",
  "01339": "PICC",
  "02601": "China Pacific Insurance",
  "06030": "CITIC Securities",
  "03968": "China Merchants Bank",
  "01988": "Minsheng Bank",
  "02359": "WuXi AppTec",
  "06160": "BeiGene",
  "01177": "Sino Biopharmaceutical",
  "02269": "WuXi Biologics",
};

// ---- 中文公司名/话题关键词库（扩展版）----
const CN_KEYWORDS: Array<{ pattern: RegExp; query: string }> = [
  // ── 白酒 ──
  { pattern: /茅台|贵州茅台/, query: "Kweichow Moutai stock" },
  { pattern: /五粮液/, query: "Wuliangye Yibin stock" },
  { pattern: /泸州老窖/, query: "Luzhou Laojiao stock" },
  { pattern: /汾酒|山西汾酒/, query: "Shanxi Fenjiu stock" },
  { pattern: /古井贡酒|古井/, query: "Gujing Distillery stock" },
  { pattern: /洋河股份|洋河/, query: "Yanghe Brewery stock" },
  { pattern: /舍得酒业/, query: "Shede Spirits stock" },

  // ── 科技互联网 ──
  { pattern: /腾讯/, query: "Tencent stock earnings" },
  { pattern: /阿里巴巴|阿里|淘宝|天猫/, query: "Alibaba stock earnings" },
  { pattern: /京东/, query: "JD.com stock earnings" },
  { pattern: /美团/, query: "Meituan stock" },
  { pattern: /拼多多|PDD/, query: "PDD Holdings Pinduoduo stock" },
  { pattern: /字节跳动|抖音|TikTok/, query: "ByteDance TikTok" },
  { pattern: /快手/, query: "Kuaishou stock" },
  { pattern: /百度/, query: "Baidu stock AI" },
  { pattern: /网易/, query: "NetEase stock gaming" },
  { pattern: /小米/, query: "Xiaomi stock" },
  { pattern: /联想/, query: "Lenovo stock" },
  { pattern: /华为/, query: "Huawei technology" },
  { pattern: /中兴/, query: "ZTE stock" },
  { pattern: /OPPO|vivo/, query: "OPPO vivo smartphone China" },
  { pattern: /东方财富/, query: "East Money stock fintech" },
  { pattern: /同花顺/, query: "Hithink RoyalFlush stock" },

  // ── 新能源/汽车 ──
  { pattern: /比亚迪|BYD/, query: "BYD electric vehicle stock" },
  { pattern: /宁德时代|CATL/, query: "CATL battery stock" },
  { pattern: /隆基绿能|隆基/, query: "LONGi Green Energy solar stock" },
  { pattern: /通威股份|通威/, query: "Tongwei solar stock" },
  { pattern: /阳光电源/, query: "Sungrow Power stock" },
  { pattern: /亿纬锂能/, query: "EVE Energy battery stock" },
  { pattern: /赣锋锂业|赣锋/, query: "Ganfeng Lithium stock" },
  { pattern: /天齐锂业|天齐/, query: "Tianqi Lithium stock" },
  { pattern: /蔚来|NIO/, query: "NIO electric vehicle stock" },
  { pattern: /小鹏|XPEV/, query: "Xpeng electric vehicle stock" },
  { pattern: /理想汽车|理想/, query: "Li Auto electric vehicle stock" },
  { pattern: /特斯拉|TSLA/, query: "Tesla stock" },
  { pattern: /上汽集团|上汽/, query: "SAIC Motor stock" },
  { pattern: /广汽集团|广汽/, query: "GAC Group stock" },
  { pattern: /长城汽车|长城/, query: "Great Wall Motor stock" },
  { pattern: /吉利汽车|吉利/, query: "Geely Automobile stock" },
  { pattern: /汇川技术/, query: "Inovance Technology stock" },

  // ── 半导体/芯片 ──
  { pattern: /中芯国际|SMIC/, query: "SMIC semiconductor stock" },
  { pattern: /海光信息/, query: "Haiguang Information chip stock" },
  { pattern: /寒武纪/, query: "Cambricon AI chip stock" },
  { pattern: /兆易创新/, query: "GigaDevice semiconductor stock" },
  { pattern: /韦尔股份/, query: "Will Semiconductor stock" },
  { pattern: /卓胜微/, query: "Maxscend Microelectronics stock" },
  { pattern: /北方华创/, query: "NAURA Technology semiconductor stock" },
  { pattern: /中微公司/, query: "AMEC semiconductor equipment stock" },
  { pattern: /华虹半导体/, query: "Hua Hong Semiconductor stock" },
  { pattern: /英伟达|NVIDIA/, query: "NVIDIA stock AI chip" },
  { pattern: /台积电|TSMC/, query: "TSMC semiconductor stock" },
  { pattern: /英特尔|Intel/, query: "Intel stock semiconductor" },
  { pattern: /AMD/, query: "AMD stock chip" },

  // ── 医药/医疗 ──
  { pattern: /恒瑞医药|恒瑞/, query: "Hengrui Medicine stock pharma" },
  { pattern: /药明康德|WuXi/, query: "WuXi AppTec stock CRO" },
  { pattern: /药明生物/, query: "WuXi Biologics stock" },
  { pattern: /迈瑞医疗|迈瑞/, query: "Mindray Medical stock" },
  { pattern: /爱尔眼科/, query: "Aier Eye Hospital stock" },
  { pattern: /康龙化成/, query: "Pharmaron Beijing CRO stock" },
  { pattern: /百济神州|BeiGene/, query: "BeiGene stock biotech" },
  { pattern: /信达生物/, query: "Innovent Biologics stock" },
  { pattern: /君实生物/, query: "Junshi Biosciences stock" },
  { pattern: /中国生物制药/, query: "Sino Biopharmaceutical stock" },
  { pattern: /复星医药|复星/, query: "Fosun Pharma stock" },
  { pattern: /云南白药/, query: "Yunnan Baiyao stock" },
  { pattern: /片仔癀/, query: "Pien Tze Huang stock" },

  // ── 消费/零售 ──
  { pattern: /海天味业|海天/, query: "Haitian Flavouring stock" },
  { pattern: /伊利股份|伊利/, query: "Yili dairy stock" },
  { pattern: /蒙牛乳业|蒙牛/, query: "Mengniu Dairy stock" },
  { pattern: /海底捞/, query: "Haidilao hotpot stock" },
  { pattern: /农夫山泉/, query: "Nongfu Spring stock" },
  { pattern: /安踏体育|安踏/, query: "ANTA Sports stock" },
  { pattern: /李宁/, query: "Li Ning sportswear stock" },
  { pattern: /双汇发展|双汇/, query: "Shuanghui Development stock" },
  { pattern: /绝味食品/, query: "Juewei Food stock" },
  { pattern: /周大福/, query: "Chow Tai Fook Jewellery stock" },
  { pattern: /中国中免|中免/, query: "China International Travel Service stock" },
  { pattern: /名创优品|MINISO/, query: "MINISO stock retail" },

  // ── 金融/银行/保险/券商 ──
  { pattern: /招商银行|招行/, query: "China Merchants Bank stock" },
  { pattern: /平安银行(?!保险)/, query: "Ping An Bank stock" },
  { pattern: /兴业银行/, query: "Industrial Bank stock" },
  { pattern: /工商银行|工行/, query: "ICBC stock" },
  { pattern: /建设银行|建行/, query: "CCB stock" },
  { pattern: /农业银行|农行/, query: "Agricultural Bank of China stock" },
  { pattern: /中国银行|中行/, query: "Bank of China stock" },
  { pattern: /交通银行/, query: "Bank of Communications stock" },
  { pattern: /民生银行/, query: "Minsheng Bank stock" },
  { pattern: /中国平安/, query: "Ping An Insurance stock" },
  { pattern: /中国人寿/, query: "China Life Insurance stock" },
  { pattern: /中国太保/, query: "China Pacific Insurance stock" },
  { pattern: /中信证券/, query: "CITIC Securities stock" },
  { pattern: /华泰证券/, query: "Huatai Securities stock" },
  { pattern: /国泰君安/, query: "Guotai Junan Securities stock" },
  { pattern: /海通证券/, query: "Haitong Securities stock" },
  { pattern: /广发证券/, query: "GF Securities stock" },
  { pattern: /中国银河/, query: "China Galaxy Securities stock" },

  // ── 地产/建筑 ──
  { pattern: /万科|万科A/, query: "Vanke real estate stock" },
  { pattern: /碧桂园/, query: "Country Garden real estate" },
  { pattern: /恒大|中国恒大/, query: "Evergrande real estate debt" },
  { pattern: /融创/, query: "Sunac China real estate" },
  { pattern: /龙湖集团|龙湖/, query: "Longfor Group real estate stock" },
  { pattern: /华润置地/, query: "China Resources Land stock" },
  { pattern: /中海外|中国海外/, query: "China Overseas Land stock" },
  { pattern: /招商蛇口/, query: "China Merchants Shekou stock" },
  { pattern: /保利发展|保利/, query: "Poly Developments stock" },
  { pattern: /中国建筑|中建/, query: "China State Construction stock" },
  { pattern: /中国铁建/, query: "China Railway Construction stock" },
  { pattern: /中国中铁/, query: "China Railway Group stock" },
  { pattern: /中国交建/, query: "China Communications Construction stock" },
  { pattern: /海螺水泥/, query: "Conch Cement stock" },

  // ── 能源/化工/资源 ──
  { pattern: /中国石化|中石化|Sinopec/, query: "Sinopec oil stock" },
  { pattern: /中国石油|中石油|PetroChina/, query: "PetroChina oil stock" },
  { pattern: /中国海油|CNOOC/, query: "CNOOC oil stock" },
  { pattern: /万华化学/, query: "Wanhua Chemical stock" },
  { pattern: /紫金矿业/, query: "Zijin Mining stock gold" },
  { pattern: /洛阳钼业/, query: "CMOC Group mining stock" },
  { pattern: /中国神华/, query: "China Shenhua Energy coal stock" },
  { pattern: /陕西煤业/, query: "Shaanxi Coal Industry stock" },
  { pattern: /长江电力/, query: "Yangtze Power stock" },
  { pattern: /华能国际/, query: "Huaneng Power stock" },

  // ── 通信/基础设施 ──
  { pattern: /中国移动/, query: "China Mobile stock telecom" },
  { pattern: /中国联通/, query: "China Unicom stock" },
  { pattern: /中国电信/, query: "China Telecom stock" },
  { pattern: /中国铁塔/, query: "China Tower stock" },
  { pattern: /京东方/, query: "BOE Technology display stock" },
  { pattern: /立讯精密/, query: "Luxshare Precision stock Apple supplier" },
  { pattern: /歌尔股份|歌尔/, query: "Goertek stock" },
  { pattern: /蓝思科技/, query: "Lens Technology stock" },

  // ── 港股特有 ──
  { pattern: /汇丰控股|汇丰|HSBC/, query: "HSBC stock banking" },
  { pattern: /恒生银行/, query: "Hang Seng Bank stock" },
  { pattern: /港交所|香港交易所/, query: "HKEX stock exchange" },
  { pattern: /长和|和记黄埔/, query: "CK Hutchison stock" },
  { pattern: /新鸿基地产|新鸿基/, query: "Sun Hung Kai Properties stock" },
  { pattern: /长实集团/, query: "CK Asset Holdings stock" },
  { pattern: /恒基地产|恒基/, query: "Henderson Land stock" },
  { pattern: /新世界发展|新世界/, query: "New World Development stock" },
  { pattern: /信和置业/, query: "Sino Land stock" },
  { pattern: /舜宇光学|舜宇/, query: "Sunny Optical stock" },
  { pattern: /中升控股/, query: "Zhongsheng Group auto dealer stock" },
  { pattern: /美高梅中国|澳门博彩/, query: "Macau gaming stock casino" },
  { pattern: /银河娱乐/, query: "Galaxy Entertainment Macau stock" },
  { pattern: /金沙中国/, query: "Sands China Macau stock" },
  { pattern: /永利澳门/, query: "Wynn Macau stock" },

  // ── 宏观/货币政策 ──
  { pattern: /美联储|联储|Fed/, query: "Federal Reserve interest rate" },
  { pattern: /降准|存款准备金率/, query: "China PBOC reserve requirement ratio" },
  { pattern: /降息|加息|利率/, query: "interest rate monetary policy" },
  { pattern: /人民币|汇率|CNY/, query: "Chinese yuan RMB exchange rate" },
  { pattern: /通胀|通货膨胀|CPI/, query: "inflation CPI China" },
  { pattern: /GDP|经济增长|经济数据/, query: "China GDP economic growth" },
  { pattern: /贸易战|关税|制裁/, query: "China US trade war tariffs" },
  { pattern: /房地产|房市|楼市/, query: "China real estate housing market" },
  { pattern: /政策|政府工作报告|两会/, query: "China government policy economic" },
  { pattern: /财政政策|财政刺激/, query: "China fiscal policy stimulus" },
  { pattern: /货币政策|宽松/, query: "China monetary policy easing" },
  { pattern: /债务|违约|信用风险/, query: "China debt default credit risk" },
  { pattern: /外资|北向资金|南向资金/, query: "China foreign investment capital flow" },
  { pattern: /沪深300|上证|深成/, query: "China A-share CSI 300 index" },
  { pattern: /恒生指数|恒指/, query: "Hang Seng Index Hong Kong" },
  { pattern: /纳斯达克|标普500|道琼斯/, query: "Nasdaq S&P 500 Dow Jones" },

  // ── 行业主题 ──
  { pattern: /新能源|光伏|储能/, query: "China new energy solar storage" },
  { pattern: /锂电池|动力电池/, query: "lithium battery electric vehicle China" },
  { pattern: /芯片|半导体|集成电路/, query: "semiconductor chip China" },
  { pattern: /人工智能|大模型|AI/, query: "artificial intelligence AI China" },
  { pattern: /ChatGPT|大语言模型|LLM/, query: "ChatGPT LLM AI technology" },
  { pattern: /医药|生物医药|创新药/, query: "China pharma biotech drug" },
  { pattern: /消费|消费复苏|内需/, query: "China consumer spending recovery" },
  { pattern: /互联网|平台经济|反垄断/, query: "China internet platform regulation" },
  { pattern: /军工|国防|航空航天/, query: "China defense aerospace military" },
  { pattern: /农业|粮食|化肥/, query: "China agriculture food grain" },
  { pattern: /钢铁|有色金属|铜/, query: "China steel metals copper" },
  { pattern: /煤炭|天然气|能源/, query: "China coal natural gas energy" },
  { pattern: /黄金|贵金属/, query: "gold precious metals price" },
  { pattern: /石油|原油|OPEC/, query: "crude oil OPEC energy price" },
  { pattern: /加密货币|比特币|BTC/, query: "Bitcoin cryptocurrency" },
  { pattern: /以太坊|ETH|Web3/, query: "Ethereum Web3 crypto" },
  { pattern: /元宇宙|NFT/, query: "metaverse NFT blockchain" },
];

/**
 * 从任务描述中提取新闻搜索关键词
 * 优先级：A 股 6 位 ticker > 港股 5 位 ticker > 英文 ticker > 中文公司名/行业词 > 英文关键词
 */
export function extractNewsQuery(taskDescription: string): string | null {
  const text = taskDescription;

  // 1. A 股 6 位数字 ticker（如 600519、300750）
  const aShareMatch = text.match(/\b(6\d{5}|0\d{5}|3\d{5})\b/);
  if (aShareMatch) {
    const ticker = aShareMatch[1];
    const company = A_SHARE_TICKER_MAP[ticker];
    if (company) return `${company} stock China`;
    return `China A-share ${ticker} stock`;
  }

  // 2. 港股 5 位数字 ticker（如 00700、01810）
  const hkMatch = text.match(/\b(0\d{4})\b/);
  if (hkMatch) {
    const ticker = hkMatch[1];
    const company = HK_TICKER_MAP[ticker];
    if (company) return `${company} stock Hong Kong`;
    return `Hong Kong stock ${ticker}`;
  }

  // 3. 英文 ticker（2-5 大写字母，排除黑名单）
  const tickerMatches = text.match(/\b([A-Z]{2,5})\b/g) ?? [];
  for (const t of tickerMatches) {
    if (!TICKER_BLACKLIST.has(t)) {
      return `${t} stock news`;
    }
  }

  // 4. 中文公司名/行业词（按优先级顺序匹配）
  for (const { pattern, query } of CN_KEYWORDS) {
    if (pattern.test(text)) return query;
  }

  // 5. 英文关键词直接提取
  const enKeywords: Array<[string, string]> = [
    ["inflation", "inflation CPI"],
    ["interest rate", "interest rate monetary policy"],
    ["recession", "recession economic slowdown"],
    ["earnings", "earnings stock results"],
    ["ipo", "IPO stock market"],
    ["merger", "merger acquisition M&A"],
    ["acquisition", "merger acquisition M&A"],
    ["bankruptcy", "bankruptcy debt default"],
    ["layoffs", "layoffs tech jobs"],
    ["semiconductor", "semiconductor chip supply chain"],
    ["electric vehicle", "electric vehicle EV market"],
    ["solar", "solar energy renewable"],
    ["lithium", "lithium battery supply"],
    ["oil price", "crude oil OPEC energy"],
    ["gold price", "gold precious metals"],
    ["bitcoin", "Bitcoin cryptocurrency"],
    ["crypto", "cryptocurrency market"],
    ["housing", "housing real estate market"],
    ["federal reserve", "Federal Reserve interest rate"],
    ["tariff", "tariff trade war"],
    ["sanctions", "sanctions geopolitical risk"],
    ["china economy", "China economy GDP growth"],
    ["hong kong", "Hong Kong stock market"],
  ];
  const lowerText = text.toLowerCase();
  for (const [kw, query] of enKeywords) {
    if (lowerText.includes(kw)) return query;
  }

  return null;
}

/**
 * 综合获取新闻数据
 */
export async function fetchNewsData(taskDescription: string): Promise<NewsData | null> {
  const apiKey = ENV.NEWS_API_KEY;
  if (!apiKey) return null;

  const query = extractNewsQuery(taskDescription);
  if (!query) return null;

  try {
    const articles = await searchNews(query, 8);
    return {
      query,
      totalResults: articles.length,
      articles,
      source: "NewsAPI",
      fetchedAt: Date.now(),
    };
  } catch (err) {
    console.warn("[NewsAPI] Fetch failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * 格式化新闻数据为 Markdown
 */
export function formatNewsDataAsMarkdown(data: NewsData): string {
  const lines: string[] = [];
  lines.push(`## NewsAPI 新闻数据 — 查询：「${data.query}」`);
  lines.push(`> 数据来源：NewsAPI.org | 获取时间：${new Date(data.fetchedAt).toLocaleString("zh-CN")}`);
  lines.push("");

  if (data.articles.length === 0) {
    lines.push("*暂无相关新闻*");
    return lines.join("\n");
  }

  lines.push(`### 近期相关新闻（共 ${data.articles.length} 条）`);
  lines.push(`| 标题 | 来源 | 发布时间 |`);
  lines.push(`|------|------|----------|`);

  for (const article of data.articles.slice(0, 8)) {
    const title = (article.title ?? "无标题").slice(0, 65).replace(/\|/g, "｜");
    const source = article.source?.name ?? "未知";
    const date = article.publishedAt
      ? new Date(article.publishedAt).toLocaleDateString("zh-CN")
      : "未知";
    lines.push(`| ${title} | ${source} | ${date} |`);
  }

  lines.push("");

  // 摘要（取前 3 条）
  const withDesc = data.articles.filter(a => a.description && a.description.length > 20).slice(0, 3);
  if (withDesc.length > 0) {
    lines.push("### 重点新闻摘要");
    for (const article of withDesc) {
      lines.push(`**${article.title?.slice(0, 80)}**`);
      lines.push(`> ${article.description?.slice(0, 150)}`);
      lines.push(`来源：${article.source?.name} | ${new Date(article.publishedAt).toLocaleDateString("zh-CN")}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * NewsAPI 健康检测
 */
export async function checkNewsApiHealth(): Promise<boolean> {
  try {
    const apiKey = ENV.NEWS_API_KEY;
    if (!apiKey) return false;
    const res = await newsApiFetch("top-headlines", { country: "us", pageSize: "1" });
    return res.ok;
  } catch {
    return false;
  }
}
