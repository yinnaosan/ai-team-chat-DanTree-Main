/**
 * InvestmentLibrary.tsx
 * 投资知识库页面 — 整合以下开源资源：
 * - n0shake/Public-APIs（金融类 API 目录）
 * - mr-karan/awesome-investing（量化投资工具链）
 * - ayush-that/FinVeda（金融教育内容）
 */
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { BookOpen, ExternalLink, Search, Star, Code2, TrendingUp, Brain, Database, Globe, Shield, Cpu, BarChart3, Rss, RefreshCw, Clock, Newspaper } from "lucide-react";
import { cn } from "@/lib/utils";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";

// ── 资源数据（整合三个仓库的精华内容）──────────────────────────────────────────
interface LibraryResource {
  id: string;
  name: string;
  description: string;
  url: string;
  category: string;
  tags: string[];
  source: "public-apis" | "awesome-investing" | "finveda" | "platform";
  stars?: number;
  isBuiltIn?: boolean;
}

const LIBRARY_RESOURCES: LibraryResource[] = [
  // ── Public-APIs 金融类（n0shake/Public-APIs）──────────────────────────────
  {
    id: "polygon-api",
    name: "Polygon.io",
    description: "实时和历史股票、期权、外汇、加密货币数据。支持 WebSocket 流式行情，覆盖美股全市场。",
    url: "https://polygon.io/docs",
    category: "市场数据 API",
    tags: ["实时行情", "期权链", "历史数据", "WebSocket"],
    source: "public-apis",
    stars: 4200,
    isBuiltIn: true,
  },
  {
    id: "finnhub-api",
    name: "Finnhub",
    description: "免费实时股票 API，包含分析师评级、内部交易、盈利日历、新闻情绪评分。",
    url: "https://finnhub.io/docs/api",
    category: "市场数据 API",
    tags: ["分析师评级", "内部交易", "盈利日历", "免费"],
    source: "public-apis",
    isBuiltIn: true,
  },
  {
    id: "fmp-api",
    name: "Financial Modeling Prep",
    description: "财务报表、DCF 估值、分析师目标价、公司档案。支持全球 25000+ 股票。",
    url: "https://financialmodelingprep.com/developer/docs",
    category: "基本面数据 API",
    tags: ["财务报表", "DCF", "估值", "全球股票"],
    source: "public-apis",
    isBuiltIn: true,
  },
  {
    id: "fred-api",
    name: "FRED（圣路易斯联储）",
    description: "美联储经济数据库，包含利率、CPI、GDP、失业率等 800,000+ 宏观经济时间序列。",
    url: "https://fred.stlouisfed.org/docs/api/fred/",
    category: "宏观经济 API",
    tags: ["利率", "CPI", "GDP", "美联储", "免费"],
    source: "public-apis",
    isBuiltIn: true,
  },
  {
    id: "coingecko-api",
    name: "CoinGecko",
    description: "加密货币价格、市值、交易量、DeFi 协议数据。覆盖 10000+ 代币，支持历史数据。",
    url: "https://www.coingecko.com/en/api/documentation",
    category: "加密货币 API",
    tags: ["加密货币", "DeFi", "NFT", "市值"],
    source: "public-apis",
    isBuiltIn: true,
  },
  {
    id: "alpha-vantage-api",
    name: "Alpha Vantage",
    description: "股票、外汇、加密货币、技术指标 API。提供 SMA/EMA/RSI/MACD 等 50+ 技术指标。",
    url: "https://www.alphavantage.co/documentation/",
    category: "技术分析 API",
    tags: ["技术指标", "外汇", "加密货币", "免费额度"],
    source: "public-apis",
    isBuiltIn: true,
  },
  {
    id: "sec-edgar-api",
    name: "SEC EDGAR",
    description: "美国证监会官方 XBRL 财务数据 API。免费获取所有上市公司年报、季报、8-K 公告。",
    url: "https://efts.sec.gov/LATEST/search-index?q=%22form+type%22&dateRange=custom",
    category: "监管文件 API",
    tags: ["SEC", "年报", "季报", "免费", "XBRL"],
    source: "public-apis",
    isBuiltIn: true,
  },
  {
    id: "world-bank-api",
    name: "World Bank Open Data",
    description: "世界银行开放数据 API，包含 GDP、通胀、贸易、人口等 16000+ 全球发展指标。",
    url: "https://datahelpdesk.worldbank.org/knowledgebase/articles/889392",
    category: "宏观经济 API",
    tags: ["GDP", "通胀", "全球数据", "免费"],
    source: "public-apis",
    isBuiltIn: true,
  },
  // ── awesome-investing 量化工具链（mr-karan/awesome-investing）────────────────
  {
    id: "alphalens",
    name: "Alphalens（Quantopian）",
    description: "Alpha 因子性能分析库。计算 IC 信息系数、因子收益、换手率，评估因子有效性。已集成到平台 AlphaFactorCard。",
    url: "https://github.com/quantopian/alphalens",
    category: "量化分析工具",
    tags: ["Alpha 因子", "IC 分析", "因子评估", "Python"],
    source: "awesome-investing",
    stars: 4200,
    isBuiltIn: true,
  },
  {
    id: "zipline",
    name: "Zipline（Quantopian）",
    description: "Python 量化回测框架。事件驱动架构，支持分钟级数据回测，与 Alphalens 无缝集成。",
    url: "https://github.com/quantopian/zipline",
    category: "量化回测框架",
    tags: ["回测", "事件驱动", "Python", "Quantopian"],
    source: "awesome-investing",
    stars: 17200,
  },
  {
    id: "pyfolio",
    name: "Pyfolio（Quantopian）",
    description: "投资组合绩效分析库。生成夏普比率、最大回撤、滚动 Beta、持仓分析等完整绩效报告。",
    url: "https://github.com/quantopian/pyfolio",
    category: "组合绩效分析",
    tags: ["夏普比率", "最大回撤", "绩效报告", "Python"],
    source: "awesome-investing",
    stars: 5400,
  },
  {
    id: "backtrader",
    name: "Backtrader",
    description: "功能完整的 Python 量化回测框架。支持多数据源、多策略、实盘交易接口，社区活跃。",
    url: "https://github.com/mementum/backtrader",
    category: "量化回测框架",
    tags: ["回测", "实盘", "多策略", "Python"],
    source: "awesome-investing",
    stars: 13500,
  },
  {
    id: "ta-lib",
    name: "TA-Lib",
    description: "技术分析函数库，包含 200+ 技术指标。C 语言核心，Python/Java/C# 绑定，行业标准。",
    url: "https://ta-lib.org",
    category: "技术分析工具",
    tags: ["技术指标", "RSI", "MACD", "布林带", "C/Python"],
    source: "awesome-investing",
  },
  {
    id: "vectorbt",
    name: "VectorBT",
    description: "基于 NumPy/Pandas 的高性能向量化回测框架。比传统事件驱动回测快 100x，支持参数优化。",
    url: "https://github.com/polakowo/vectorbt",
    category: "量化回测框架",
    tags: ["向量化", "高性能", "参数优化", "Python"],
    source: "awesome-investing",
    stars: 3800,
  },
  {
    id: "finplot",
    name: "Finplot（highfestiva）",
    description: "专为金融数据设计的高性能 Python 绘图库。基于 PyQtGraph，支持 K 线图、成交量、指标叠加。",
    url: "https://github.com/highfestiva/finplot",
    category: "金融可视化",
    tags: ["K 线图", "可视化", "高性能", "Python"],
    source: "awesome-investing",
    stars: 1900,
  },
  {
    id: "finance-python",
    name: "Finance-Python（alpha-miner）",
    description: "量化金融 Python 工具集，包含因子计算、组合优化、风险管理模块，适合 A 股量化研究。",
    url: "https://github.com/alpha-miner/Finance-Python",
    category: "量化分析工具",
    tags: ["因子计算", "组合优化", "A 股", "Python"],
    source: "awesome-investing",
    stars: 1200,
  },
  {
    id: "dawp",
    name: "DAWP（yhilpisch）",
    description: "《Python 金融衍生品分析》配套代码。包含 Black-Scholes、Heston、蒙特卡洛期权定价完整实现。已集成到平台 OptionPricingCard。",
    url: "https://github.com/yhilpisch/dawp",
    category: "衍生品定价",
    tags: ["期权定价", "Heston", "蒙特卡洛", "Python"],
    source: "awesome-investing",
    stars: 633,
    isBuiltIn: true,
  },
  {
    id: "bidask",
    name: "Bidask（eguidotti）",
    description: "买卖价差估算 R/Python 库。基于 Roll、Corwin-Schultz 等模型，从 OHLC 数据估算隐含买卖价差。已集成到平台流动性因子。",
    url: "https://github.com/eguidotti/bidask",
    category: "流动性分析",
    tags: ["买卖价差", "流动性", "Roll 模型", "Python/R"],
    source: "awesome-investing",
    stars: 124,
    isBuiltIn: true,
  },
  {
    id: "finagg",
    name: "Finagg（theOGognf）",
    description: "金融数据聚合框架。统一 SEC/FRED/Yahoo Finance 数据接口，标准化处理，支持本地缓存。数据质量评分已集成到平台。",
    url: "https://github.com/theOGognf/finagg",
    category: "数据聚合框架",
    tags: ["数据聚合", "SEC", "FRED", "标准化", "Python"],
    source: "awesome-investing",
    stars: 525,
    isBuiltIn: true,
  },
  {
    id: "curvesim",
    name: "CurveSim（curveresearch）",
    description: "Curve Finance AMM 模拟框架。模拟 DeFi 流动性池行为，分析无常损失、滑点、LP 收益。",
    url: "https://github.com/curveresearch/curvesim",
    category: "DeFi 分析",
    tags: ["DeFi", "AMM", "无常损失", "Curve", "Python"],
    source: "awesome-investing",
    stars: 280,
  },
  // ── FinVeda 金融教育内容（ayush-that/FinVeda）────────────────────────────────
  {
    id: "finveda-basics",
    name: "股票投资基础",
    description: "FinVeda 金融教育模块：P/E 比率、市值、EPS、股息收益率等基础概念，适合初学者。",
    url: "https://github.com/ayush-that/FinVeda",
    category: "投资教育",
    tags: ["基础概念", "P/E", "EPS", "股息", "入门"],
    source: "finveda",
  },
  {
    id: "finveda-options",
    name: "期权交易基础",
    description: "FinVeda 期权教育模块：Call/Put、行权价、到期日、Greeks（Delta/Gamma/Theta/Vega）基础解释。",
    url: "https://github.com/ayush-that/FinVeda",
    category: "投资教育",
    tags: ["期权", "Greeks", "Call/Put", "入门"],
    source: "finveda",
  },
  {
    id: "finveda-quant",
    name: "量化投资入门",
    description: "FinVeda 量化模块：Alpha/Beta 概念、夏普比率、最大回撤、因子投资基础。",
    url: "https://github.com/ayush-that/FinVeda",
    category: "投资教育",
    tags: ["量化", "Alpha", "Beta", "夏普比率", "因子"],
    source: "finveda",
  },
  // ── 平台内置工具 ──────────────────────────────────────────────────────────────
  {
    id: "platform-alpha",
    name: "Alpha 因子分析（平台内置）",
    description: "基于 alphalens + bidask 的 11 维 Alpha 因子评分系统，包含 IC 分析、相关性矩阵、流动性因子、权重调节。",
    url: "/chat",
    category: "平台功能",
    tags: ["Alpha 因子", "IC 分析", "流动性", "平台内置"],
    source: "platform",
    isBuiltIn: true,
  },
  {
    id: "platform-options",
    name: "期权定价分析（平台内置）",
    description: "Black-Scholes + Heston 双模型期权定价，包含 Greeks 热力图、Payoff Diagram、IV Smile 曲线、期权链表格。",
    url: "/chat",
    category: "平台功能",
    tags: ["期权定价", "Heston", "Greeks", "IV Smile", "平台内置"],
    source: "platform",
    isBuiltIn: true,
  },
  {
    id: "platform-sentiment",
    name: "NLP 情绪分析（平台内置）",
    description: "基于 PrimoGPT 架构的金融新闻情绪分析管道，包含极性评分、时间序列趋势、看多/看空信号提取。",
    url: "/chat",
    category: "平台功能",
    tags: ["情绪分析", "NLP", "PrimoGPT", "时间序列", "平台内置"],
    source: "platform",
    isBuiltIn: true,
  },
];

// ── 分类配置 ──────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: "all", label: "全部", icon: <Globe className="w-3.5 h-3.5" /> },
  { id: "市场数据 API", label: "市场数据", icon: <TrendingUp className="w-3.5 h-3.5" /> },
  { id: "基本面数据 API", label: "基本面", icon: <Database className="w-3.5 h-3.5" /> },
  { id: "宏观经济 API", label: "宏观经济", icon: <BarChart3 className="w-3.5 h-3.5" /> },
  { id: "量化分析工具", label: "量化工具", icon: <Cpu className="w-3.5 h-3.5" /> },
  { id: "量化回测框架", label: "回测框架", icon: <Code2 className="w-3.5 h-3.5" /> },
  { id: "衍生品定价", label: "衍生品", icon: <Brain className="w-3.5 h-3.5" /> },
  { id: "投资教育", label: "教育资源", icon: <BookOpen className="w-3.5 h-3.5" /> },
  { id: "平台功能", label: "平台内置", icon: <Star className="w-3.5 h-3.5" /> },
];

const SOURCE_COLORS: Record<string, string> = {
  "public-apis": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "awesome-investing": "bg-violet-500/20 text-violet-300 border-violet-500/30",
  "finveda": "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "platform": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
};

const SOURCE_LABELS: Record<string, string> = {
  "public-apis": "Public-APIs",
  "awesome-investing": "awesome-investing",
  "finveda": "FinVeda",
  "platform": "平台内置",
};

// ── 主组件 ────────────────────────────────────────────────────────────────────
// ── NewsNow 风格的实时新闻聚合组件（灵感来自 ourongxing/newsnow）────────────────
const NEWS_SOURCES = [
  { id: "general", label: "综合", query: "stock market investing" },
  { id: "macro", label: "宏观", query: "federal reserve inflation GDP" },
  { id: "tech", label: "科技股", query: "tech stocks NASDAQ AI semiconductor" },
  { id: "crypto", label: "加密", query: "bitcoin ethereum crypto" },
  { id: "china", label: "中国", query: "China economy A-shares" },
];

function NewsNowPanel() {
  const [activeNewsSource, setActiveNewsSource] = useState("general");
  const currentSource = NEWS_SOURCES.find(s => s.id === activeNewsSource) ?? NEWS_SOURCES[0];
  const { data, isLoading, refetch, isFetching } = trpc.chat.getNewsFeed.useQuery(
    { ticker: currentSource.query, maxArticles: 12 },
    { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false }
  );
  const articles = (data as { articles?: Array<{ title: string; description?: string; source?: string; url?: string; publishedAt?: string; sentiment?: string }> } | null)?.articles ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Rss className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold">NewsNow 实时聚合</span>
          <span className="text-xs text-muted-foreground/50">灵感来自 ourongxing/newsnow</span>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-foreground transition-colors"
        >
          <RefreshCw className={cn("w-3 h-3", isFetching && "animate-spin")} />
          刷新
        </button>
      </div>
      {/* 来源选择器 */}
      <div className="flex flex-wrap gap-1.5">
        {NEWS_SOURCES.map(src => (
          <button
            key={src.id}
            onClick={() => setActiveNewsSource(src.id)}
            className={cn(
              "text-xs px-3 py-1 rounded-full border transition-colors",
              activeNewsSource === src.id
                ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                : "bg-white/5 text-muted-foreground/60 border-white/10 hover:bg-white/8"
            )}
          >
            {src.label}
          </button>
        ))}
      </div>
      {/* 新闻列表 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground/40">
          <RefreshCw className="w-4 h-4 animate-spin mr-2" />
          <span className="text-sm">加载中...</span>
        </div>
      ) : articles.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground/40">
          <Newspaper className="w-6 h-6 mx-auto mb-2 opacity-30" />
          <p className="text-sm">暂无新闻</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {articles.map((article, i) => (
            <a
              key={i}
              href={article.url ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="group flex gap-3 p-3 rounded-lg bg-white/3 border border-white/6 hover:bg-white/6 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground/90 group-hover:text-foreground line-clamp-2 leading-snug">
                  {article.title}
                </p>
                {article.description && (
                  <p className="text-xs text-muted-foreground/50 mt-1 line-clamp-1">{article.description}</p>
                )}
                <div className="flex items-center gap-2 mt-1.5">
                  {article.source && (
                    <span className="text-[10px] text-muted-foreground/40">{article.source}</span>
                  )}
                  {article.publishedAt && (
                    <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/30">
                      <Clock className="w-2.5 h-2.5" />
                      {new Date(article.publishedAt).toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}
                    </span>
                  )}
                  {article.sentiment && (
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded border",
                      article.sentiment === "positive" ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" :
                      article.sentiment === "negative" ? "text-red-400 border-red-500/30 bg-red-500/10" :
                      "text-amber-400 border-amber-500/30 bg-amber-500/10"
                    )}>
                      {article.sentiment === "positive" ? "利多" : article.sentiment === "negative" ? "利空" : "中性"}
                    </span>
                  )}
                </div>
              </div>
              <ExternalLink className="w-3 h-3 text-muted-foreground/20 group-hover:text-muted-foreground/50 shrink-0 mt-1 transition-colors" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default function InvestmentLibrary() {
  const [activeTab, setActiveTab] = useState<"library" | "newsnow">("library");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeSource, setActiveSource] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return LIBRARY_RESOURCES.filter(r => {
      const matchSearch = !search || [r.name, r.description, ...r.tags]
        .some(t => t.toLowerCase().includes(search.toLowerCase()));
      const matchCategory = activeCategory === "all" || r.category === activeCategory;
      const matchSource = !activeSource || r.source === activeSource;
      return matchSearch && matchCategory && matchSource;
    });
  }, [search, activeCategory, activeSource]);

  const builtInCount = LIBRARY_RESOURCES.filter(r => r.isBuiltIn).length;

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* 页面标题 */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-violet-400" />
              投资知识库
            </h1>
            <p className="text-sm text-muted-foreground/60 mt-1">
              整合 <span className="text-blue-400">n0shake/Public-APIs</span>、
              <span className="text-violet-400">mr-karan/awesome-investing</span>、
              <span className="text-amber-400">ayush-that/FinVeda</span> 精华资源
              · {builtInCount} 项已集成到平台
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
            <span>{LIBRARY_RESOURCES.length} 个资源</span>
          </div>
        </div>

        {/* Tab 切换 */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("library")}
            className={cn(
              "flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg border transition-colors",
              activeTab === "library"
                ? "bg-violet-500/20 text-violet-300 border-violet-500/30"
                : "bg-white/5 text-muted-foreground/60 border-white/10 hover:bg-white/10"
            )}
          >
            <BookOpen className="w-3.5 h-3.5" />
            资源库
          </button>
          <button
            onClick={() => setActiveTab("newsnow")}
            className={cn(
              "flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg border transition-colors",
              activeTab === "newsnow"
                ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                : "bg-white/5 text-muted-foreground/60 border-white/10 hover:bg-white/10"
            )}
          >
            <Rss className="w-3.5 h-3.5" />
            NewsNow 实时
          </button>
        </div>

        {/* NewsNow 面板 */}
        {activeTab === "newsnow" && (
          <Card className="bg-white/3 border-white/8">
            <CardContent className="p-4">
              <NewsNowPanel />
            </CardContent>
          </Card>
        )}

        {/* 搜索和筛选（仅在资源库 Tab 显示）*/}
        {activeTab === "library" && <>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
            <Input
              placeholder="搜索资源名称、描述或标签..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 bg-white/5 border-white/10 text-sm"
            />
          </div>

          {/* 分类筛选 */}
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors",
                  activeCategory === cat.id
                    ? "bg-violet-500/20 text-violet-300 border-violet-500/30"
                    : "bg-white/5 text-muted-foreground/60 border-white/10 hover:bg-white/10"
                )}
              >
                {cat.icon}
                {cat.label}
              </button>
            ))}
          </div>

          {/* 来源筛选 */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(SOURCE_LABELS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveSource(activeSource === key ? null : key)}
                className={cn(
                  "text-xs px-2.5 py-1 rounded border transition-colors",
                  activeSource === key
                    ? SOURCE_COLORS[key]
                    : "bg-white/5 text-muted-foreground/50 border-white/10 hover:bg-white/10"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 资源列表 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(resource => (
            <Card
              key={resource.id}
              className={cn(
                "border transition-colors hover:border-white/20 group",
                resource.isBuiltIn
                  ? "border-emerald-500/20 bg-emerald-500/5"
                  : "border-white/10 bg-white/3"
              )}
            >
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm font-semibold text-foreground/90 leading-tight">
                    {resource.name}
                  </CardTitle>
                  <div className="flex items-center gap-1 shrink-0">
                    {resource.isBuiltIn && (
                      <Badge className="text-xs px-1.5 py-0 bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                        已集成
                      </Badge>
                    )}
                    {resource.stars && (
                      <span className="text-xs text-muted-foreground/40 flex items-center gap-0.5">
                        <Star className="w-2.5 h-2.5" />
                        {resource.stars >= 1000 ? `${(resource.stars / 1000).toFixed(1)}k` : resource.stars}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <Badge variant="outline" className={cn("text-xs px-1.5 py-0 border", SOURCE_COLORS[resource.source])}>
                    {SOURCE_LABELS[resource.source]}
                  </Badge>
                  <span className="text-xs text-muted-foreground/40">{resource.category}</span>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <p className="text-xs text-foreground/60 leading-relaxed mb-3">
                  {resource.description}
                </p>
                <div className="flex flex-wrap gap-1 mb-3">
                  {resource.tags.slice(0, 4).map(tag => (
                    <span
                      key={tag}
                      className="text-xs px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground/50 border border-white/8"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <a
                  href={resource.url}
                  target={resource.url.startsWith("/") ? "_self" : "_blank"}
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-violet-400/70 hover:text-violet-400 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  {resource.url.startsWith("/") ? "前往平台功能" : "查看文档"}
                </a>
              </CardContent>
            </Card>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground/40 text-sm">
            <BookOpen className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p>未找到匹配的资源</p>
            <p className="text-xs mt-1">尝试修改搜索词或筛选条件</p>
          </div>
        )}
        </>}
      </div>
    </DashboardLayout>
  );
}
