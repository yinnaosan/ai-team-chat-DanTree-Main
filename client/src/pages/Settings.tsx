import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { getLoginUrl } from "@/const";
import {
  ArrowLeft, Bot, Brain, Database,
  Loader2, Plus, Trash2, CheckCircle2, Save, MessageSquare,
  Key, Zap, AlertTriangle, Eye, EyeOff, Shield, Copy, RefreshCw, UserX, Wifi, WifiOff, Activity, Sparkles,
  BookOpen, Edit3, X, Filter, Search, Download, TrendingUp, Sliders, BarChart2, Clock, CheckCircle,
} from "lucide-react";

type SettingsTab = "api" | "database" | "access" | "logic" | "memory" | "monitoring" | "research_style";
type RulesTab = "investment" | "task" | "data";

// ---- TrustedSource 类型（与后端 db.ts 一致）----
interface TrustedSource {
  id: string;
  name: string;
  url: string;
  category: string;
  routingKeys: string[];
  trustLevel: "primary" | "secondary" | "supplementary";
  enabled: boolean;
}
interface TrustedSourcesPolicy {
  requireCitation: boolean;
  fallbackToTraining: boolean;
  minEvidenceScore: number;
  blockOnHardMissing: boolean;
}
interface TrustedSourcesConfig {
  sources: TrustedSource[];
  routingRules: { id: string; pattern: string; targetSources: string[]; priority: number }[];
  policy: TrustedSourcesPolicy;
}

// ---- 实时数据源状态面板 ----
function DataSourceStatusPanel() {
  const utils = trpc.useUtils();
  // 查询缓存状态（每 60 秒轮询一次，服务端有缓存保护）
  const { data: status, isLoading, isFetching } = trpc.rpa.getDataSourceStatus.useQuery(undefined, {
    refetchInterval: 60000,
    refetchOnWindowFocus: false,
  });
  // 强制刷新 mutation（绕过缓存，实际运行所有 checkHealth）
  const refreshMutation = trpc.rpa.refreshDataSourceStatus.useMutation({
    onSuccess: () => {
      utils.rpa.getDataSourceStatus.invalidate();
    },
  });
  const handleRefresh = () => {
    refreshMutation.mutate();
  };
  const isRefreshing = isFetching || refreshMutation.isPending;

  const statusColor = (s: string) => {
    if (s === "active") return "oklch(0.72 0.18 142)";
    if (s === "degraded") return "oklch(0.72 0.18 80)"; // 黄色：降级运行
    if (s === "exhausted") return "oklch(0.72 0.18 50)";
    if (s === "timeout") return "oklch(0.72 0.18 50)";
    if (s === "warning") return "oklch(0.75 0.16 80)"; // 黄色：环境限制
    if (s === "unknown") return "oklch(42% 0 0)"; // 灰色：未检测
    if (s === "checking") return "oklch(0.65 0.15 240)"; // 蓝色：检测中
    return "oklch(0.65 0.18 20)";
  };
  const statusBg = (s: string) => {
    if (s === "active") return "oklch(0.72 0.18 142 / 0.12)";
    if (s === "degraded") return "oklch(0.72 0.18 80 / 0.10)";
    if (s === "exhausted" || s === "timeout") return "oklch(0.72 0.18 50 / 0.12)";
    if (s === "warning") return "oklch(0.75 0.16 80 / 0.10)"; // 黄色背景
    if (s === "unknown") return "oklch(0.20 0.005 270 / 0.40)"; // 深灰背景
    if (s === "checking") return "oklch(0.65 0.15 240 / 0.08)"; // 淡蓝背景
    return "oklch(0.65 0.18 20 / 0.12)";
  };
  const statusLabel = (s: string) => {
    if (s === "active") return "正常";
    if (s === "degraded") return "降级";
    if (s === "exhausted") return "已耗尽";
    if (s === "timeout") return "超时";
    if (s === "warning") return "本地运行"; // Python 库仅在本地沙笔可用
    if (s === "error") return "连接失败";
    if (s === "unknown") return "未检测";
    if (s === "checking") return "检测中...";
    return "未配置";
  };

  // 单个数据源行组件
  const SourceRow = ({
    dot, label, desc, statusStr, badge,
  }: {
    dot?: boolean;
    label: string;
    desc: string;
    statusStr: string;
    badge?: React.ReactNode;
  }) => (
    <div className="flex items-center justify-between py-1.5 px-2 rounded-lg"
      style={{ background: statusBg(statusStr) }}>
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: statusColor(statusStr), boxShadow: statusStr === "active" ? `0 0 5px ${statusColor(statusStr)}` : "none" }} />
        <div className="min-w-0">
          <span className="text-xs font-medium" style={{ color: "oklch(0.82 0.005 264)" }}>{label}</span>
          <span className="text-xs ml-1.5" style={{ color: "oklch(40% 0 0)" }}>{desc}</span>
        </div>
        {badge}
      </div>
      <span className="text-xs font-medium ml-2 flex-shrink-0 px-1.5 py-0.5 rounded"
        style={{ color: statusColor(statusStr), background: statusBg(statusStr), border: `1px solid ${statusColor(statusStr)}33` }}>
        {statusLabel(statusStr)}
      </span>
    </div>
  );

  return (
    <div className="p-4 rounded-2xl space-y-3"
      style={{ background: "oklch(100% 0 0 / 0.06)", border: "1px solid oklch(0.72 0.18 250 / 0.15)" }}>
      {/* 标题行 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5" style={{ color: "oklch(60% 0.15 250)" }} />
          <span className="text-xs font-semibold" style={{ color: "oklch(0.80 0.005 270)" }}>实时数据源状态</span>
          {status && (
            <span className="text-xs px-1.5 py-0.5 rounded-full"
              style={{ background: "oklch(0.20 0.005 270)", color: "oklch(40% 0 0)" }}>
                 {[
                ["active","warning"].includes(status.yahooStatus) ? 1 : 0,
                ["active","warning"].includes(status.fredStatus) ? 1 : 0,
                ["active","warning"].includes(status.worldBankStatus) ? 1 : 0,
                ["active","warning"].includes(status.imfStatus) ? 1 : 0,
                ["active","warning"].includes(status.finnhubStatus) ? 1 : 0,
                ["active","warning"].includes(status.fmpStatus) ? 1 : 0,
                ["active","warning"].includes(status.polygonStatus) ? 1 : 0,
                ["active","warning"].includes(status.alphaVantageStatus) ? 1 : 0,
                ["active","warning"].includes(status.secEdgarStatus) ? 1 : 0,
                ["active","warning"].includes(status.coinGeckoStatus) ? 1 : 0,
                1, // GDELT 免费公开，始终计入
                ["active","warning"].includes(status.newsApiStatus) ? 1 : 0,
                ["active","warning"].includes(status.marketauxStatus) ? 1 : 0,
                ["active","warning"].includes(status.ecbStatus) ? 1 : 0,
                ["active","warning"].includes(status.hkexStatus) ? 1 : 0,
                ["active","warning"].includes(status.boeStatus) ? 1 : 0,
                ["active","warning"].includes(status.hkmaStatus) ? 1 : 0,
                ["active","warning"].includes(status.simfinStatus) ? 1 : 0,
                ["active","warning"].includes(status.tiingoStatus) ? 1 : 0,
                ["active","warning"].includes(status.congressStatus) ? 1 : 0,
                ["active","warning"].includes(status.gleifStatus) ? 1 : 0,
                1, // FinanceDatabase 免费公开，始终计入
                1, // DeFiLlama 免费公开，始终计入
                1, // 本地技术指标引擎，始终计入
                1, // qlib Alpha 因子库，始终计入
                1, // 财报 PDF 解析器，始终计入
                ["active","warning"].includes(status.alpacaStatus) ? 1 : 0,
                ["active","warning"].includes(status.twelveDataStatus) ? 1 : 0,
                1, // Frankfurter 免费公开，始终计入
                1, // Portfolio Optimizer 免费公开，始终计入
                1, // 中文财经新闻，始终计入
                1, // Hacker Laws 定律库，始终计入
                1, // Qbot 量化因子库，始终计入
              ].reduce((a, b) => a + b, 0)}
              /
              {36}
               正常
            </span>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1 text-xs px-2 py-0.5 rounded transition-opacity hover:opacity-80"
          style={{ color: "oklch(42% 0 0)", background: "oklch(0.20 0.005 270)" }}>
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`} />
          {isRefreshing ? "检测中" : "刷新"}
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-2">
          <Loader2 className="w-3 h-3 animate-spin" style={{ color: "oklch(42% 0 0)" }} />
          <span className="text-xs" style={{ color: "oklch(42% 0 0)" }}>检测中...</span>
        </div>
      ) : (
        <div className="space-y-1.5">
          {/* 分组标题：结构化数据源 */}
          <p className="text-xs px-1 pt-1" style={{ color: "var(--bloomberg-text-dim)" }}>—— 结构化数据源</p>

          {/* Yahoo Finance */}
          <SourceRow
            label="Yahoo Finance"
            desc="股价 / 财务 / 估値"
            statusStr={status?.yahooStatus ?? "active"}
          />

          {/* FRED */}
          <SourceRow
            label="FRED"
            desc="美联储宏观指标"
            statusStr={status?.fredStatus ?? "unknown"}
            badge={
              !status?.fredConfigured ? (
                <span className="text-xs px-1.5 py-0.5 rounded"
                  style={{ background: "oklch(0.65 0.18 20 / 0.15)", color: "oklch(0.65 0.18 20)", border: "1px solid oklch(0.65 0.18 20 / 0.3)" }}>
                  需 API Key
                </span>
              ) : undefined
            }
          />

          {/* World Bank */}
          <SourceRow
            label="World Bank"
            desc="全球 GDP / 通胀 / 贸易"
            statusStr={status?.worldBankStatus ?? "active"}
            badge={
              <span className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: "oklch(0.72 0.18 250 / 0.1)", color: "oklch(0.60 0.12 250)", border: "1px solid oklch(0.63 0.20 258 / 0.15)" }}>
                免费公开
              </span>
            }
          />

          {/* IMF / World Bank 镜像 */}
          <SourceRow
            label="IMF/WB 宏观数据"
            desc="GDP / 通胀 / 债务 / 展望"
            statusStr={status?.imfStatus ?? "active"}
            badge={
              <span className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: "oklch(0.72 0.18 142 / 0.1)", color: "oklch(0.55 0.12 142)", border: "1px solid oklch(0.72 0.18 142 / 0.2)" }}>
                免费公开
              </span>
            }
          />

          {/* 分组标题：股票金融数据源 */}
          <p className="text-xs px-1 pt-2" style={{ color: "var(--bloomberg-text-dim)" }}>—— 股票金融数据源</p>

          {/* Finnhub */}
          <SourceRow
            label="Finnhub"
            desc="实时报价 / 分析师评级 / 内部交易"
            statusStr={status?.finnhubStatus ?? "unknown"}
            badge={
              !status?.finnhubConfigured ? (
                <span className="text-xs px-1.5 py-0.5 rounded"
                  style={{ background: "oklch(0.65 0.18 20 / 0.15)", color: "oklch(0.65 0.18 20)", border: "1px solid oklch(0.65 0.18 20 / 0.3)" }}>
                  需 API Key
                </span>
              ) : undefined
            }
          />

          {/* FMP */}
          <SourceRow
            label="Financial Modeling Prep"
            desc="财务报表 / DCF估值 / 分析师目标价"
            statusStr={status?.fmpStatus ?? "unknown"}
            badge={
              !status?.fmpConfigured ? (
                <span className="text-xs px-1.5 py-0.5 rounded"
                  style={{ background: "oklch(0.65 0.18 20 / 0.15)", color: "oklch(0.65 0.18 20)", border: "1px solid oklch(0.65 0.18 20 / 0.3)" }}>
                  需 API Key
                </span>
              ) : undefined
            }
          />

          {/* Polygon.io */}
          <SourceRow
            label="Polygon.io"
            desc="市场快照 / 近期走势 / 新闻情绪"
            statusStr={status?.polygonStatus ?? "unknown"}
            badge={
              !status?.polygonConfigured ? (
                <span className="text-xs px-1.5 py-0.5 rounded"
                  style={{ background: "oklch(0.65 0.18 20 / 0.15)", color: "oklch(0.65 0.18 20)", border: "1px solid oklch(0.65 0.18 20 / 0.3)" }}>
                  需 API Key
                </span>
              ) : undefined
            }
          />

          {/* Alpha Vantage */}
          <SourceRow
            label="Alpha Vantage"
            desc="宏观指标 / 汇率 / CPI / 利率"
            statusStr={status?.alphaVantageStatus ?? "unknown"}
            badge={
              !status?.alphaVantageConfigured ? (
                <span className="text-xs px-1.5 py-0.5 rounded"
                  style={{ background: "oklch(0.65 0.18 20 / 0.15)", color: "oklch(0.65 0.18 20)", border: "1px solid oklch(0.65 0.18 20 / 0.3)" }}>
                  需 API Key
                </span>
              ) : undefined
            }
          />

          {/* SEC EDGAR */}
          <SourceRow
            label="SEC EDGAR"
            desc="XBRL 财务事实 / 10-K 年报 / 10-Q 季报 / 8-K 公告 / 公司基本信息"
            statusStr={status?.secEdgarStatus ?? "unknown"}
            badge={
              <span className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: "oklch(0.72 0.18 250 / 0.1)", color: "oklch(0.60 0.12 250)", border: "1px solid oklch(0.63 0.20 258 / 0.15)" }}>
                免费公开 | 美股专用
              </span>
            }
          />

          {/* CoinGecko */}
          <SourceRow
            label="CoinGecko"
            desc="加密货币 / 市值 / 趋势"
            statusStr={status?.coinGeckoStatus ?? "unknown"}
            badge={
              !status?.coinGeckoConfigured ? (
                <span className="text-xs px-1.5 py-0.5 rounded"
                  style={{ background: "oklch(0.65 0.18 20 / 0.1)", color: "oklch(0.65 0.18 20)", border: "1px solid oklch(0.65 0.18 20 / 0.2)" }}>
                  需 API Key
                </span>
              ) : (
                <span className="text-xs px-1.5 py-0.5 rounded"
                  style={{ background: "oklch(0.72 0.18 250 / 0.1)", color: "oklch(0.60 0.12 250)", border: "1px solid oklch(0.63 0.20 258 / 0.15)" }}>
                  Demo Key
                </span>
              )
            }
          />



          {/* NewsAPI */}
          <SourceRow
            label="NewsAPI"
            desc="全球新闻搜索 / 头条"
            statusStr={status?.newsApiStatus ?? "unknown"}
            badge={
              !status?.newsApiConfigured ? (
                <span className="text-xs px-1.5 py-0.5 rounded"
                  style={{ background: "oklch(0.65 0.18 20 / 0.1)", color: "oklch(0.65 0.18 20)", border: "1px solid oklch(0.65 0.18 20 / 0.2)" }}>
                  未配置
                </span>
              ) : (
                <span className="text-xs px-1.5 py-0.5 rounded"
                  style={{ background: "oklch(0.72 0.18 140 / 0.1)", color: "oklch(0.55 0.15 140)", border: "1px solid oklch(0.72 0.18 140 / 0.2)" }}>
                  需 API Key
                </span>
              )
            }
          />

          {/* Marketaux */}
          <SourceRow
            label="Marketaux"
            desc="金融新闻 / 情绪评分 / 实体识别"
            statusStr={status?.marketauxStatus ?? "unknown"}
            badge={
              !status?.marketauxConfigured ? (
                <span className="text-xs px-1.5 py-0.5 rounded"
                  style={{ background: "oklch(0.65 0.18 20 / 0.1)", color: "oklch(0.65 0.18 20)", border: "1px solid oklch(0.65 0.18 20 / 0.2)" }}>
                  未配置
                </span>
              ) : (
                <span className="text-xs px-1.5 py-0.5 rounded"
                  style={{ background: "oklch(0.72 0.18 140 / 0.1)", color: "oklch(0.55 0.15 140)", border: "1px solid oklch(0.72 0.18 140 / 0.2)" }}>
                  需 API Key | 情绪评分
                </span>
              )
            }
          />





          {/* ECB */}
          <SourceRow
            label="ECB"
            desc="欧元区利率 / 通胀 / 汇率 / 货币供应量"
            statusStr={status?.ecbStatus ?? "unknown"}
            badge={
              <span className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: "oklch(0.72 0.18 140 / 0.1)", color: "oklch(0.55 0.15 140)", border: "1px solid oklch(0.72 0.18 140 / 0.2)" }}>
                免费公开 | 欧元区宏观
              </span>
            }
          />

          {/* HKEXnews */}
          <SourceRow
            label="HKEXnews"
            desc="港股公告 / 年报 / 监管文件（香港交易所官方披露易）"
            statusStr={status?.hkexStatus ?? "unknown"}
            badge={
              <span className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: "oklch(0.72 0.18 140 / 0.1)", color: "oklch(0.55 0.15 140)", border: "1px solid oklch(0.72 0.18 140 / 0.2)" }}>
                免费公开 | 港股公告
              </span>
            }
          />

          {/* 分组标题：英国宏观 */}
          <p className="text-xs px-1 pt-2" style={{ color: "var(--bloomberg-text-dim)" }}>—— 英国宏观</p>

          <SourceRow
            label="Bank of England"
            desc="英国基准利率 / 国债收益率 / GBP 汇率 / M4 货币供应量"
            statusStr={status?.boeStatus ?? "unknown"}
            badge={
              <span className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: "oklch(0.72 0.18 240 / 0.1)", color: "oklch(0.55 0.15 240)", border: "1px solid oklch(0.72 0.18 240 / 0.2)" }}>
                免费公开 | 英国宏观
              </span>
            }
          />

          {/* 分组标题：香港宏观 */}
          <p className="text-xs px-1 pt-2" style={{ color: "var(--bloomberg-text-dim)" }}>—— 香港宏观</p>

          <SourceRow
            label="HKMA"
            desc="港元利率 / 货币供应量 / 银行间流动性 / 外汇储备（香港金融管理局）"
            statusStr={status?.hkmaStatus ?? "unknown"}
            badge={
              <span className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: "oklch(0.72 0.18 30 / 0.1)", color: "oklch(0.55 0.15 30)", border: "1px solid oklch(0.72 0.18 30 / 0.2)" }}>
                免费公开 | 港元宏观
              </span>
            }
          />

          {/* 分组标题：法律数据 */}
          {/* Congress.gov */}
          <SourceRow
            label="Congress.gov"
            desc="美国立法动态 / 法案进展 / 监管政策"
            statusStr={status?.congressStatus ?? "unknown"}
            badge={
              !status?.congressConfigured ? (
                <span className="text-xs px-1.5 py-0.5 rounded"
                  style={{ background: "oklch(0.65 0.18 20 / 0.15)", color: "oklch(0.65 0.18 20)", border: "1px solid oklch(0.65 0.18 20 / 0.3)" }}>
                  需 API Key
                </span>
              ) : (
                <span className="text-xs px-1.5 py-0.5 rounded"
                  style={{ background: "oklch(0.72 0.18 250 / 0.1)", color: "oklch(0.60 0.12 250)", border: "1px solid oklch(0.63 0.20 258 / 0.15)" }}>
                  美国立法
                </span>
              )
            }
          />



          {/* GLEIF */}
          <SourceRow
            label="GLEIF"
            desc="全球 LEI 法人识别码 / 法人结构 / 母子公司关系"
            statusStr={status?.gleifStatus ?? "unknown"}
            badge={
              <span className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: "oklch(0.72 0.18 250 / 0.1)", color: "oklch(0.60 0.12 250)", border: "1px solid oklch(0.63 0.20 258 / 0.15)" }}>
                免费公开 | 跨国法人
              </span>
            }
          />

          {/* Alpaca Paper Trading */}
          <SourceRow
            label="Alpaca Paper Trading"
            desc="模拟交易账户 / 持仓管理 / 下单 / 市场时钟"
            statusStr={status?.alpacaStatus ?? "unknown"}
            badge={
              !status?.alpacaConfigured ? (
                <span className="text-xs px-1.5 py-0.5 rounded"
                  style={{ background: "oklch(0.65 0.18 20 / 0.15)", color: "oklch(0.65 0.18 20)", border: "1px solid oklch(0.65 0.18 20 / 0.3)" }}>
                  需 API Key
                </span>
              ) : (
                <span className="text-xs px-1.5 py-0.5 rounded"
                  style={{ background: "oklch(0.72 0.18 145 / 0.1)", color: "oklch(0.60 0.12 145)", border: "1px solid oklch(0.72 0.18 145 / 0.2)" }}>
                  模拟交易 | 美股
                </span>
              )
            }
          />

          {/* 分隔线：开源架构数据库 */}
          <p className="text-xs px-1 pt-2" style={{ color: "var(--bloomberg-text-dim)" }}>—— 开源架构数据库</p>
          {/* FinanceDatabase */}
          <SourceRow
            label="FinanceDatabase"
            desc="159,957 行全球股票分类 / 行业 / 交易所 / 同业公司"
            statusStr="active"
            badge={
              <span className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: "oklch(0.72 0.18 142 / 0.1)", color: "oklch(0.55 0.12 142)", border: "1px solid oklch(0.72 0.18 142 / 0.2)" }}>
                免费公开 | JerBouma
              </span>
            }
          />
          {/* DeFiLlama */}
          <SourceRow
            label="DeFiLlama"
            desc="7,213 个 DeFi 协议 / 436 条链 / 18,168 个 Yield 池"
            statusStr="active"
            badge={
              <span className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: "oklch(0.72 0.18 142 / 0.1)", color: "oklch(0.55 0.12 142)", border: "1px solid oklch(0.72 0.18 142 / 0.2)" }}>
                免费公开 | goat-sdk
              </span>
            }
          />
          {/* 本地技术指标引擎 */}
          <SourceRow
            label="本地技术指标引擎"
            desc="RSI / MACD / 布林带 / EMA / 随机指标 / ATR / OBV"
            statusStr="active"
            badge={
              <span className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: "oklch(0.72 0.18 142 / 0.1)", color: "oklch(0.55 0.12 142)", border: "1px solid oklch(0.72 0.18 142 / 0.2)" }}>
                内置 | 无延迟
              </span>
            }
          />
          {/* qlib Alpha 因子库 */}
          <SourceRow
            label="qlib Alpha 因子库"
            desc="18 个 Alpha 因子：Alpha101 + 基本面因子（PE_MOM/EPS_REV/ROE_TREND）"
            statusStr="active"
            badge={
              <span className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: "oklch(0.72 0.18 142 / 0.1)", color: "oklch(0.55 0.12 142)", border: "1px solid oklch(0.72 0.18 142 / 0.2)" }}>
                内置 | microsoft/qlib
              </span>
            }
          />
          {/* Twelve Data */}
          <SourceRow
            label="Twelve Data"
            desc="实时报价 / RSI / MACD / OHLCV（Yahoo Finance 备用源）"
            statusStr={status?.twelveDataStatus ?? "unknown"}
            badge={
              !status?.twelveDataConfigured ? (
                <span className="text-xs px-1.5 py-0.5 rounded"
                  style={{ background: "oklch(0.65 0.18 20 / 0.15)", color: "oklch(0.65 0.18 20)", border: "1px solid oklch(0.65 0.18 20 / 0.3)" }}>
                  需 API Key
                </span>
              ) : (
                <span className="text-xs px-1.5 py-0.5 rounded"
                  style={{ background: "oklch(0.72 0.18 250 / 0.1)", color: "oklch(0.60 0.12 250)", border: "1px solid oklch(0.63 0.20 258 / 0.15)" }}>
                  5000+ 股票
                </span>
              )
            }
          />
          {/* Frankfurter 外汇 */}
          <SourceRow
            label="Frankfurter 外汇"
            desc="33 种货币实时汇率 / 历史 FX（基于欧洲央行）"
            statusStr={status?.exchangeRatesStatus ?? "active"}
            badge={
              <span className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: "oklch(0.72 0.18 142 / 0.1)", color: "oklch(0.55 0.12 142)", border: "1px solid oklch(0.72 0.18 142 / 0.2)" }}>
                免费公开 | ECB 数据
              </span>
            }
          />
          {/* Portfolio Optimizer */}
          <SourceRow
            label="Portfolio Optimizer"
            desc="均値-方差优化 / 风险平价 / 有效前沿"
            statusStr={status?.portfolioOptimizerStatus ?? "active"}
            badge={
              <span className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: "oklch(0.72 0.18 142 / 0.1)", color: "oklch(0.55 0.12 142)", border: "1px solid oklch(0.72 0.18 142 / 0.2)" }}>
                免费公开 | portfoliooptimizer.io
              </span>
            }
          />
          {/* 中文财经新闻 */}
          <SourceRow
            label="中文财经新闻"
            desc="华尔街见闻 + 金十数据 + 格隆汇 + 雪球热股"
            statusStr="active"
            badge={
              <span className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: "oklch(0.72 0.18 142 / 0.1)", color: "oklch(0.55 0.12 142)", border: "1px solid oklch(0.72 0.18 142 / 0.2)" }}>
                免费公开 | A股/港股中文资讯
              </span>
            }
          />
          {/* Hacker Laws 定律库 */}
          <SourceRow
            label="Hacker Laws 定律库"
            desc="25 条投资相关科技/商业定律（帕累托/炒作周期/古德哈特等）"
            statusStr="active"
            badge={
              <span className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: "oklch(0.72 0.18 142 / 0.1)", color: "oklch(0.55 0.12 142)", border: "1px solid oklch(0.72 0.18 142 / 0.2)" }}>
                内置 | dwmkerr/hacker-laws
              </span>
            }
          />
          {/* Qbot 量化因子库 */}
          <SourceRow
            label="Qbot 量化因子库"
            desc="MACD/RSI/KDJ/RSRS/ROIC/FCF 等 10 个核心量化因子"
            statusStr="active"
            badge={
              <span className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: "oklch(0.72 0.18 142 / 0.1)", color: "oklch(0.55 0.12 142)", border: "1px solid oklch(0.72 0.18 142 / 0.2)" }}>
                内置 | UFund-Me/Qbot
              </span>
            }
          />
          {/* 财报 PDF 解析器 */}
          <SourceRow
            label="财报 PDF 解析器"
            desc="财报类型检测 / 关键指标提取 / 同比分析 / 风险因素"
            statusStr="active"
            badge={
              <span className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: "oklch(0.72 0.18 142 / 0.1)", color: "oklch(0.55 0.12 142)", border: "1px solid oklch(0.72 0.18 142 / 0.2)" }}>
                内置 | GallenQiu
              </span>
            }
          />
          {/* 网页搜索已关闭，纯 API 模式 */}
          <p className="text-xs px-1 pt-2" style={{ color: "var(--bloomberg-text-dim)" }}>—— 网页搜索</p>
          <div className="flex items-center justify-between py-1.5 px-2 rounded-lg"
            style={{ background: "oklch(100% 0 0 / 0.05)" }}>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: "oklch(42% 0 0)" }} />
              <span className="text-xs font-medium" style={{ color: "oklch(0.82 0.005 264)" }}>网页搜索</span>
              <span className="text-xs" style={{ color: "oklch(42% 0 0)" }}>已关闭（纯 API 模式）</span>
            </div>
            <span className="text-xs font-medium ml-2 flex-shrink-0 px-1.5 py-0.5 rounded"
              style={{ color: "oklch(42% 0 0)", background: "oklch(0.22 0.005 270)", border: "1px solid oklch(0.28 0.007 270)" }}>
              已禁用
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<SettingsTab>("api");

  // OpenAI API 配置
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [selectedModel, setSelectedModel] = useState("gpt-4o-mini");
  const [manusSystemPrompt, setManusSystemPrompt] = useState("");
  const [userCoreRules, setUserCoreRules] = useState("");
  // 三部分守则独立字段
  const [investmentRules, setInvestmentRules] = useState("");
  const [taskInstruction, setTaskInstruction] = useState("");
  const [dataLibrary, setDataLibrary] = useState("");
  // 结构化投资守则表单
  const [invPhilosophy, setInvPhilosophy] = useState<string[]>([]);
  const [invMarketPriority, setInvMarketPriority] = useState<string[]>([]);
  const [invRiskPolicy, setInvRiskPolicy] = useState({ maxSinglePosition: 20, maxSectorPosition: 35, holdingPeriod: "medium" as "short" | "medium" | "long" });
  const [invFreeText, setInvFreeText] = useState("");
  const [invFormMode, setInvFormMode] = useState<"structured" | "freetext">("structured");
  // 结构化全局任务指令
  const [taskFormMode, setTaskFormMode] = useState<"structured" | "freetext">("structured");
  const [taskSwitches, setTaskSwitches] = useState({
    forceZhOutput: true,
    declareRulesCompliance: false,
    appendFollowupQs: true,
    crossRefHistory: true,
    showEvidenceScore: true,
    citationRequired: true,
  });
  const [taskFreeText, setTaskFreeText] = useState("");
  const [trustedSourcesConfig, setTrustedSourcesConfig] = useState<TrustedSourcesConfig>({
    sources: [],
    routingRules: [],
    policy: { requireCitation: true, fallbackToTraining: false, minEvidenceScore: 0.6, blockOnHardMissing: true },
  });
  const [newSourceForm, setNewSourceForm] = useState({ name: "", url: "", category: "", routingKeys: "", trustLevel: "primary" as TrustedSource["trustLevel"] });
  const [showNewSourceForm, setShowNewSourceForm] = useState(false);
  const [showQuickImport, setShowQuickImport] = useState(false);

  const PRESET_SOURCES: Array<Omit<TrustedSource, "id">> = [
    { name: "AQR Capital", url: "https://www.aqr.com/insights/research", category: "quant", routingKeys: ["AQR", "因子", "量化", "动量", "价值"], trustLevel: "primary", enabled: true },
    { name: "SSRN", url: "https://www.ssrn.com", category: "academic", routingKeys: ["SSRN", "学术", "论文", "研究"], trustLevel: "primary", enabled: true },
    { name: "NBER", url: "https://www.nber.org/papers", category: "macro", routingKeys: ["NBER", "宏观", "经济", "货币政策"], trustLevel: "primary", enabled: true },
    { name: "Wind 资讯", url: "https://www.wind.com.cn", category: "data", routingKeys: ["Wind", "A股", "中国市场", "财务数据"], trustLevel: "primary", enabled: true },
    { name: "Bloomberg", url: "https://www.bloomberg.com/markets", category: "market", routingKeys: ["Bloomberg", "市场", "债券", "外汇"], trustLevel: "primary", enabled: true },
    { name: "Federal Reserve", url: "https://www.federalreserve.gov/releases", category: "macro", routingKeys: ["美联储", "Fed", "利率", "货币政策"], trustLevel: "primary", enabled: true },
    { name: "IMF", url: "https://www.imf.org/en/Publications", category: "macro", routingKeys: ["IMF", "全球经济", "国际货币"], trustLevel: "secondary", enabled: true },
    { name: "BIS", url: "https://www.bis.org/research", category: "macro", routingKeys: ["BIS", "国际清算", "金融稳定"], trustLevel: "secondary", enabled: true },
    { name: "MSCI", url: "https://www.msci.com/research-and-insights", category: "index", routingKeys: ["MSCI", "指数", "ESG", "新兴市场"], trustLevel: "secondary", enabled: true },
    { name: "S&P Global", url: "https://www.spglobal.com/ratings", category: "rating", routingKeys: ["标普", "S&P", "信用评级", "评级"], trustLevel: "secondary", enabled: true },
    { name: "中证指数", url: "https://www.csindex.com.cn", category: "index", routingKeys: ["中证", "沪深", "A股指数"], trustLevel: "secondary", enabled: true },
    { name: "Morningstar", url: "https://www.morningstar.com/research", category: "fundamentals", routingKeys: ["晨星", "Morningstar", "基金", "股票评级"], trustLevel: "secondary", enabled: true },
  ];
  const [activeRulesTab, setActiveRulesTab] = useState<RulesTab>("investment");
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string; model?: string } | null>(null);

  // URL 健康检测
  type UrlCheckResult = { url: string; status: "ok" | "error" | "timeout" | "invalid"; statusCode?: number; latencyMs?: number; error?: string };
  const [urlCheckResults, setUrlCheckResults] = useState<UrlCheckResult[] | null>(null);
  const checkUrlsMutation = trpc.rpa.checkLibraryUrls.useMutation({
    onSuccess: (data) => {
      setUrlCheckResults(data);
      const okCount = data.filter(r => r.status === "ok").length;
      const failCount = data.length - okCount;
      if (failCount === 0) {
        toast.success(`全部 ${okCount} 个链接均可访问`);
      } else {
        toast.warning(`${okCount} 个正常，${failCount} 个无法访问`);
      }
    },
    onError: () => toast.error("检测失败，请稍后重试"),
  });

  // 数据库连接表单
  const [dbForm, setDbForm] = useState({
    name: "",
    dbType: "mysql" as "mysql" | "postgresql" | "sqlite",
    host: "",
    port: "",
    database: "",
    username: "",
    password: "",
    filePath: "",
  });
  // ─── 研究风格状态 ─────────────────────────────────────────────────────────────────────────────
  const [selectedOutputStyle, setSelectedOutputStyle] = useState<string>("decisive");
  const [selectedEmphasis, setSelectedEmphasis] = useState<string[]>(["valuation", "business"]);
  // ─── 数据查询 ─────────────────────────────────────────────────────────────────────────────
  const { data: savedConfig } = trpc.rpa.getConfig.useQuery(undefined, { enabled: isAuthenticated });
  const isUsingOwnerDefaults = (savedConfig as any)?.isUsingOwnerDefaults ?? false;

  useEffect(() => {
    if (savedConfig) {
      setSelectedModel(savedConfig.openaiModel || "gpt-4o-mini");
      setManusSystemPrompt(savedConfig.manusSystemPrompt || "");
      setUserCoreRules(savedConfig.userCoreRules || "");
      setInvestmentRules((savedConfig as any).investmentRules || "");
      setTaskInstruction((savedConfig as any).taskInstruction || "");
      setDataLibrary((savedConfig as any).dataLibrary || "");
      // 解析结构化守则字段
      const structured = (savedConfig as any).structuredInvestmentRules;
      if (structured) {
        setInvPhilosophy(structured.philosophy ?? []);
        setInvMarketPriority(structured.marketPriority ?? []);
        setInvRiskPolicy(structured.riskPolicy ?? { maxSinglePosition: 20, maxSectorPosition: 35, holdingPeriod: "medium" });
        setInvFreeText(structured.freeText ?? "");
        setInvFormMode("structured");
      } else if ((savedConfig as any).investmentRules) {
        // 旧数据展示为自由文本模式
        setInvFreeText((savedConfig as any).investmentRules || "");
        setInvFormMode("freetext");
      }
      // 解析结构化任务指令
      const structuredTask = (savedConfig as any).structuredTaskInstruction;
      if (structuredTask) {
        setTaskSwitches(structuredTask.switches ?? { forceZhOutput: true, declareRulesCompliance: false, appendFollowupQs: true, crossRefHistory: true, showEvidenceScore: true, citationRequired: true });
        setTaskFreeText(structuredTask.freeText ?? "");
        setTaskFormMode("structured");
      } else if ((savedConfig as any).taskInstruction) {
        setTaskFreeText((savedConfig as any).taskInstruction || "");
        setTaskFormMode("freetext");
      }
      const tsc = (savedConfig as any).trustedSourcesConfig;
      if (tsc?.sources) setTrustedSourcesConfig(tsc);
      // 研究风格同步
      const rs = (savedConfig as any).researchStyle;
      if (rs?.outputStyle) setSelectedOutputStyle(rs.outputStyle);
      if (rs?.analysisEmphasis?.length) setSelectedEmphasis(rs.analysisEmphasis);
    }
  }, [savedConfig]);

  const { data: dbConnections = [], refetch: refetchConnections } = trpc.dbConnect.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  // ─── 访问管理 hooks（必须在所有条件 return 之前）────────────────────────────
  const { data: accessCheck, isLoading: accessCheckLoading } = trpc.access.check.useQuery(undefined, { enabled: isAuthenticated });
  const isOwner = accessCheck?.isOwner ?? false;

  // listCodes 是 ownerProcedure，必须等 isOwner 确认后才能调用
  const { data: accessCodes = [], refetch: refetchCodes } = trpc.access.listCodes.useQuery(
    undefined,
    { enabled: isAuthenticated && isOwner }
  );

  const [codeLabel, setCodeLabel] = useState("");
  const [codeMaxUses, setCodeMaxUses] = useState("1");
  const [codeExpireDays, setCodeExpireDays] = useState("");
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);

  const generateCodeMutation = trpc.access.generateCode.useMutation({
    onSuccess: (data) => {
      setGeneratedCode(data.code);
      setCodeLabel("");
      setCodeMaxUses("1");
      setCodeExpireDays("");
      refetchCodes();
      toast.success("访客密码已生成");
    },
    onError: (err) => toast.error("生成失败", { description: err.message }),
  });

  const revokeCodeMutation = trpc.access.revokeCode.useMutation({
    onSuccess: () => { toast.success("密码已撤销"); refetchCodes(); },
    onError: (err) => toast.error("撤销失败", { description: err.message }),
  });

  // ─── Mutations ──────────────────────────────────────────────────────────────
  const saveConfigMutation = trpc.rpa.setConfig.useMutation({
    onSuccess: () => {
      toast.success("配置已保存！每次任务将使用此 API Key 和模型");
      setApiKeyInput("");
    },
    onError: (err) => toast.error("保存失败", { description: err.message }),
  });

  const testConnectionMutation = trpc.rpa.testConnection.useMutation({
    onSuccess: (data) => {
      setTestResult(data);
      if (data.ok) toast.success(`连接成功！${data.model} 已就绪`);
      else toast.error("连接失败", { description: data.error });
    },
    onError: (err) => {
      setTestResult({ ok: false, error: err.message });
      toast.error("连接失败", { description: err.message });
    },
  });

  const saveDbMutation = trpc.dbConnect.save.useMutation({
    onSuccess: () => {
      toast.success("数据库连接已保存");
      setDbForm({ name: "", dbType: "mysql", host: "", port: "", database: "", username: "", password: "", filePath: "" });
      refetchConnections();
    },
    onError: (err) => toast.error("保存失败", { description: err.message }),
  });

  const setActiveMutation = trpc.dbConnect.setActive.useMutation({
    onSuccess: () => { toast.success("已切换活跃数据库连接"); refetchConnections(); },
    onError: (err) => toast.error("切换失败", { description: err.message }),
  });

  const deleteMutation = trpc.dbConnect.delete.useMutation({
    onSuccess: () => { toast.success("连接已删除"); refetchConnections(); },
    onError: (err) => toast.error("删除失败", { description: err.message }),
  });

  // 等待 auth 和 accessCheck 都加载完成，防止 Tab 因 isOwner=false 而闪烁消失
  if (loading || (isAuthenticated && accessCheckLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bloomberg-surface-0)" }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "oklch(60% 0.15 250)" }} />
      </div>
    );
  }

  if (!isAuthenticated) {
    window.location.href = getLoginUrl();
    return null;
  }

  const handleSaveDb = () => {
    if (!dbForm.name) { toast.error("请输入连接名称"); return; }
    saveDbMutation.mutate({
      name: dbForm.name,
      dbType: dbForm.dbType,
      host: dbForm.host || undefined,
      port: dbForm.port ? parseInt(dbForm.port) : undefined,
      database: dbForm.database || undefined,
      username: dbForm.username || undefined,
      password: dbForm.password || undefined,
      filePath: dbForm.filePath || undefined,
    });
  };

  const hasApiKey = savedConfig?.hasApiKey;

  const tabs: { id: SettingsTab; label: string; icon: any; badge?: string; ownerOnly?: boolean }[] = [
    { id: "api", label: "ChatGPT API", icon: Key, badge: hasApiKey ? "已配置" : undefined },
    { id: "database", label: "数据库", icon: Database },
    ...(isOwner ? [{ id: "access" as SettingsTab, label: "访问管理", icon: Shield, ownerOnly: true }] : []),
    { id: "logic", label: "逻辑", icon: Brain },
    { id: "memory", label: "AI 记忆", icon: BookOpen },
    { id: "monitoring", label: "监控", icon: BarChart2 },
    { id: "research_style", label: "研究风格", icon: Sliders },
  ];

  const DEFAULT_INVESTMENT_RULES = `### 投资理念（段永平体系）
- 以企业内在价值为核心，不做短线投机
- 买入前问：如果市场关闭10年，我还愿意持有吗？
- 只投资自己真正理解的企业（能力圈原则）
- 安全边际优先，宁可错过也不冒险
- 长期持有优质企业，让复利发挥作用
- 分散风险但不过度分散（集中在最有把握的机会）
- 买的是公司，不是股票代码

### 估值方法
- 优先使用自由现金流折现（DCF），辅以市盈率（PE）、市净率（PB）横向对比
- 合理估值 = 未来3-5年自由现金流现值之和 / 流通股本
- 安全边际要求：买入价不超过合理估值的70%（即30%折扣）
- 对成长型公司：关注ROE、净利润率趋势，而非短期EPS

### 护城河评估（必须逐项检查）
1. 品牌护城河：用户是否愿意为品牌溢价付费？
2. 网络效应：用户越多，产品价值是否越高？
3. 转换成本：客户切换竞争对手的代价有多高？
4. 成本优势：规模效应或独特资源是否带来持续低成本？
5. 无形资产：专利、许可证、政府特许经营权

### 重点关注市场（按优先级）
1. 美国（纳斯达克、NYSE）— 最高优先级
2. 香港（恒生、港股通）
3. 中国大陆（A股、沪深）
4. 欧盟（DAX、CAC40）
5. 英国（FTSE100）
- 分析时必须考虑市场间关联性、异动传导和跨市场影响
- 必须进行逻辑正推（当前→未来）和倒推（结果→原因）双向验证

### 风险控制规则
- 单只股票仓位不超过总资产的20%
- 同一行业仓位不超过总资产的35%
- 必须评估：流动性风险、监管风险、汇率风险、竞争格局变化
- 遇到无法理解的商业模式，直接排除，不做分析

### 回复格式规范（必须执行）
- 每个章节必须有 ## 二级标题
- 关键数字、结论、风险点必须 **加粗**
- 核心判断和投资建议放在 > 引用块中
- 数据对比必须用 Markdown 表格（不少于3列）
- 整体排版有视觉层次，禁止输出纯文本段落
- 中文输出，专业但不晦涩

### 任务执行规范
- 每次任务执行前、执行中、输出前必须自我复查是否遵守以上规则
- 回复末尾必须提供2-3个具体的后续跟进问题，引导用户深入探讨
- 任务之间有上下文关联，需主动引用历史任务结论进行对比和跟进
- 每次任务开头声明：已遵守投资守则 ✓`;

  const MODELS = [
    { value: "gpt-4o-mini", label: "GPT-4o mini", desc: "推荐 · 投资分析性价比最高", badge: "推荐" },
    { value: "gpt-4o", label: "GPT-4o", desc: "强力模型 · 深度分析", badge: "强力" },
    { value: "gpt-4-turbo", label: "GPT-4 Turbo", desc: "高性能 · 复杂任务", badge: "" },
    { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo", desc: "最经济 · 快速响应", badge: "经济" },
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--bloomberg-surface-0)" }}>
      {/* 顶部导航 — Bloomberg Terminal 风格 */}
      <header className="flex items-center gap-3 px-5 py-3 shrink-0 sticky top-0 z-10"
        style={{ background: "oklch(8.5% 0.015 240 / 0.95)", backdropFilter: "blur(20px)", borderBottom: "1px solid var(--bloomberg-border-dim)" }}>
        <button
          onClick={() => navigate("/research")}
          className="w-7 h-7 rounded flex items-center justify-center transition-all"
          style={{ color: "var(--bloomberg-text-tertiary)", background: "var(--bloomberg-surface-2)", border: "1px solid var(--bloomberg-border-dim)" }}>
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-bold" style={{ color: "var(--bloomberg-text-primary)", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.02em" }}>设置</h1>
          <span className="bloomberg-badge gold">SYSTEM</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
            style={{
              background: hasApiKey ? "oklch(68% 0.18 155 / 0.12)" : "oklch(100% 0 0 / 0.04)",
              border: `1px solid ${hasApiKey ? "oklch(68% 0.18 155 / 0.30)" : "oklch(100% 0 0 / 0.08)"}`,
              color: hasApiKey ? "oklch(68% 0.18 155)" : "oklch(40% 0 0)",
            }}>
            {hasApiKey
              ? <><span className="w-1.5 h-1.5 rounded-full bg-current inline-block mr-1" />API 已配置</>
              : <><Key className="w-3 h-3 mr-1" />API 未配置</>}
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-5 py-8">
        {/* 标签页导航 — Apple 分段控制器风格 */}
        <div className="flex gap-0 mb-6 p-0"
          style={{ borderBottom: "1px solid var(--bloomberg-border-dim)" }}>
          {tabs.map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all"
              style={{
                background: "transparent",
                color: activeTab === id ? "var(--bloomberg-gold)" : "var(--bloomberg-text-tertiary)",
                borderBottom: activeTab === id ? "2px solid var(--bloomberg-gold)" : "2px solid transparent",
                marginBottom: "-1px",
              }}>
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{label}</span>
              {badge && (
                <span className="bloomberg-badge green ml-1">{badge}</span>
              )}
              {(tabs.find(t => t.id === id) as any)?.ownerOnly && (
                <span className="bloomberg-badge gold ml-1">Owner</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab: ChatGPT API 配置 ── */}
        {activeTab === "api" && (
          <div className="space-y-5 animate-fade-in-up">
            {/* 当前状态 — Apple 玻璃卡片 */}
            <div className="p-4 rounded-2xl flex items-center gap-4 glass-card-v2"
              style={{
                borderColor: hasApiKey ? "oklch(68% 0.18 155 / 0.25)" : "oklch(100% 0 0 / 0.08)",
              }}>
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 inner-glow"
                style={{ background: hasApiKey ? "oklch(68% 0.18 155 / 0.15)" : "oklch(100% 0 0 / 0.06)" }}>
                {hasApiKey
                  ? <CheckCircle2 className="w-5 h-5" style={{ color: "oklch(68% 0.18 155)" }} />
                  : <Key className="w-5 h-5" style={{ color: "oklch(42% 0 0)" }} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: "oklch(92% 0 0)" }}>
                  {hasApiKey ? "OpenAI API Key 已配置" : "尚未配置 OpenAI API Key"}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "oklch(42% 0 0)" }}>
                  {hasApiKey
                    ? `当前模型：${savedConfig?.openaiModel || "gpt-4o-mini"} · ${savedConfig?.openaiApiKey}`
                    : "配置后，GPT 将作为主大脑主导每次投资分析任务"}
                </p>
              </div>
            </div>

            {/* API Key 输入 */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4" style={{ color: "oklch(60% 0.15 250)" }} />
                <h2 className="text-sm font-semibold" style={{ color: "oklch(92% 0 0)" }}>OpenAI API Key</h2>
              </div>
              <div className="p-5 rounded-2xl space-y-4 glass-card-v2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium" style={{ color: "oklch(72% 0 0)" }}>
                    API Key <span style={{ color: "oklch(42% 0 0)" }}>（格式：sk-proj-...）</span>
                  </Label>
                  <div className="relative">
                    <Input
                      type={showApiKey ? "text" : "password"}
                      value={apiKeyInput}
                      onChange={(e) => { setApiKeyInput(e.target.value); setTestResult(null); }}
                      placeholder={hasApiKey ? "输入新 Key 以替换现有配置" : "sk-proj-..."}
                      className="pr-10 text-sm font-mono"
                      style={{ background: "oklch(100% 0 0 / 0.06)", borderColor: "oklch(100% 0 0 / 0.1)", color: "var(--bloomberg-text-primary)" }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: "oklch(40% 0 0)" }}>
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs" style={{ color: "var(--bloomberg-text-dim)" }}>
                    前往{" "}
                    <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer"
                      className="underline" style={{ color: "oklch(60% 0.15 250)" }}>
                      platform.openai.com/api-keys
                    </a>{" "}
                    创建 API Key
                  </p>
                </div>

                {/* 模型选择 */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium" style={{ color: "oklch(72% 0 0)" }}>选择模型</Label>
                  <Select value={selectedModel} onValueChange={setSelectedModel}>
                    <SelectTrigger className="text-sm"
                      style={{ background: "oklch(100% 0 0 / 0.06)", borderColor: "oklch(100% 0 0 / 0.1)", color: "var(--bloomberg-text-primary)" }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent style={{ background: "oklch(100% 0 0 / 0.05)", borderColor: "oklch(100% 0 0 / 0.12)" }}>
                      {MODELS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          <div className="flex items-center gap-2">
                            <span>{m.label}</span>
                            {m.badge && (
                              <span className="text-xs px-1.5 py-0.5 rounded-full"
                                style={{ background: "oklch(0.72 0.18 250 / 0.15)", color: "oklch(60% 0.15 250)", fontSize: "10px" }}>
                                {m.badge}
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs" style={{ color: "var(--bloomberg-text-dim)" }}>
                    {MODELS.find(m => m.value === selectedModel)?.desc}
                  </p>
                </div>

                {/* 测试结果 */}
                {testResult && (
                  <div className="px-3 py-2 rounded-lg text-xs flex items-center gap-2"
                    style={{
                      background: testResult.ok ? "oklch(68% 0.18 155 / 0.08)" : "oklch(55% 0.18 25 / 0.08)",
                      border: `1px solid ${testResult.ok ? "oklch(68% 0.18 155 / 0.25)" : "oklch(55% 0.18 25 / 0.25)"}`,
                      color: testResult.ok ? "oklch(68% 0.18 155)" : "oklch(70% 0.18 25)",
                    }}>
                    {testResult.ok
                      ? <><CheckCircle2 className="w-3.5 h-3.5 shrink-0" />连接成功！{testResult.model} 已就绪</>
                      : <><AlertTriangle className="w-3.5 h-3.5 shrink-0" />{testResult.error || "连接失败，请检查 API Key"}</>}
                  </div>
                )}

                {/* 操作按钮 */}
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      const key = apiKeyInput.trim();
                      if (!key) { toast.error("请先输入 API Key"); return; }
                      testConnectionMutation.mutate({ apiKey: key, model: selectedModel });
                    }}
                    disabled={testConnectionMutation.isPending || !apiKeyInput.trim()}
                    variant="outline"
                    className="flex-1 gap-2 text-sm"
                    style={{ borderColor: "oklch(100% 0 0 / 0.12)", color: "oklch(72% 0 0)", background: "oklch(100% 0 0 / 0.05)" }}>
                    {testConnectionMutation.isPending
                      ? <><Loader2 className="w-4 h-4 animate-spin" />测试中...</>
                      : <><Zap className="w-4 h-4" />测试连接</>}
                  </Button>
                  <Button
                    onClick={() => saveConfigMutation.mutate({
                      openaiApiKey: apiKeyInput.trim() || undefined,
                      openaiModel: selectedModel,
                      manusSystemPrompt,
                    })}
                    disabled={saveConfigMutation.isPending}
                    className="flex-1 gap-2 text-sm"
                    style={{ background: "oklch(60% 0.15 250)", color: "var(--bloomberg-surface-0)" }}>
                    {saveConfigMutation.isPending
                      ? <><Loader2 className="w-4 h-4 animate-spin" />保存中...</>
                      : <><Save className="w-4 h-4" />保存配置</>}
                  </Button>
                </div>
              </div>
            </section>

            {/* 投资理念 & 任务守则（三部分独立 Tab） */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4" style={{ color: "oklch(60% 0.15 250)" }} />
                <h2 className="text-sm font-semibold" style={{ color: "oklch(92% 0 0)" }}>投资理念 & 任务守则</h2>
                <span className="ml-auto text-xs px-2 py-0.5 rounded-full"
                  style={{ background: "oklch(0.65 0.18 25 / 0.15)", color: "oklch(70% 0.18 25)", border: "1px solid oklch(65% 0.18 25 / 0.3)" }}>
                  GPT & Manus 最高优先级，强制遵守
                </span>
              </div>

              {/* Owner 默认值提示横幅 */}
              {isUsingOwnerDefaults && (
                <div className="flex items-start gap-2 p-3 rounded-lg text-xs"
                  style={{ background: "oklch(0.72 0.18 250 / 0.08)", border: "1px solid oklch(0.72 0.18 250 / 0.25)" }}>
                  <Zap className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: "oklch(60% 0.15 250)" }} />
                  <div>
                    <span className="font-medium" style={{ color: "oklch(0.80 0.01 270)" }}>当前显示的是平台默认配置</span>
                    <span style={{ color: "oklch(42% 0 0)" }}>，可直接使用。如需自定义，修改后点「保存」即可覆盖为个人配置。</span>
                  </div>
                </div>
              )}

              {/* 三部分内部 Tab 导航 */}
              <div className="flex gap-1 p-1 rounded-lg"
                style={{ background: "oklch(100% 0 0 / 0.06)", border: "1px solid oklch(100% 0 0 / 0.08)" }}>
                {([
                  { id: "investment" as RulesTab, label: "投资守则", color: "oklch(68% 0.18 155)" },
                  { id: "task" as RulesTab, label: "全局任务指令", color: "oklch(70% 0.18 25)" },
                  { id: "data" as RulesTab, label: "资料数据库", color: "oklch(60% 0.15 250)" },
                ] as const).map(({ id, label, color }) => (
                  <button key={id}
                    onClick={() => setActiveRulesTab(id)}
                    className="flex-1 py-1.5 px-2 rounded text-xs font-medium transition-all"
                    style={{
                      background: activeRulesTab === id ? "oklch(100% 0 0 / 0.1)" : "transparent",
                      color: activeRulesTab === id ? color : "oklch(40% 0 0)",
                      boxShadow: activeRulesTab === id ? "0 1px 3px oklch(0 0 0 / 0.3)" : "none",
                    }}>
                    {label}
                  </button>
                ))}
              </div>

              {/* 投资守则 Tab - 结构化表单 */}
              {activeRulesTab === "investment" && (
                <div className="p-4 rounded-2xl space-y-4"
                  style={{ background: "oklch(100% 0 0 / 0.04)", border: "1px solid oklch(0.72 0.18 155 / 0.2)" }}>
                  {/* 模式切换 */}
                  <div className="flex items-center justify-between">
                    <p className="text-xs" style={{ color: "oklch(0.60 0.01 270)" }}>
                      GPT & Manus 每次任务必须遵守以下守则
                    </p>
                    <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: "oklch(100% 0 0 / 0.06)" }}>
                      {(["structured", "freetext"] as const).map(m => (
                        <button key={m} onClick={() => setInvFormMode(m)}
                          className="text-xs px-2.5 py-1 rounded-md transition-all"
                          style={{
                            background: invFormMode === m ? "oklch(100% 0 0 / 0.1)" : "transparent",
                            color: invFormMode === m ? "var(--bloomberg-text-primary)" : "oklch(40% 0 0)",
                          }}>
                          {m === "structured" ? "结构化" : "自由文本"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {invFormMode === "structured" ? (
                    <div className="space-y-4">
                      {/* 投资哲学 */}
                      <div>
                        <p className="text-xs font-semibold mb-2" style={{ color: "oklch(68% 0.18 155)" }}>投资哲学</p>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {[
                            "段永平价值投资体系", "基本面优先", "长期持有", "能力圈原则",
                            "安全边际优先", "不做短线投机", "集中持仓", "分散风险"
                          ].map(tag => (
                            <button key={tag} onClick={() => setInvPhilosophy(p => p.includes(tag) ? p.filter(x => x !== tag) : [...p, tag])}
                              className="text-xs px-2.5 py-1 rounded-full transition-all"
                              style={{
                                background: invPhilosophy.includes(tag) ? "oklch(68% 0.18 155 / 0.15)" : "oklch(100% 0 0 / 0.06)",
                                border: `1px solid ${invPhilosophy.includes(tag) ? "oklch(0.72 0.18 155 / 0.4)" : "oklch(100% 0 0 / 0.12)"}`,
                                color: invPhilosophy.includes(tag) ? "oklch(68% 0.18 155)" : "oklch(42% 0 0)",
                              }}>
                              {tag}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 重点市场 */}
                      <div>
                        <p className="text-xs font-semibold mb-2" style={{ color: "oklch(60% 0.15 250)" }}>重点关注市场</p>
                        <div className="flex flex-wrap gap-2">
                          {["美股", "港股", "A股", "欧股", "英股", "加密货币", "债券", "大宗商品"].map(m => (
                            <button key={m} onClick={() => setInvMarketPriority(p => p.includes(m) ? p.filter(x => x !== m) : [...p, m])}
                              className="text-xs px-2.5 py-1 rounded-full transition-all"
                              style={{
                                background: invMarketPriority.includes(m) ? "oklch(0.72 0.18 250 / 0.15)" : "oklch(100% 0 0 / 0.06)",
                                border: `1px solid ${invMarketPriority.includes(m) ? "oklch(0.72 0.18 250 / 0.4)" : "oklch(100% 0 0 / 0.12)"}`,
                                color: invMarketPriority.includes(m) ? "oklch(60% 0.15 250)" : "oklch(42% 0 0)",
                              }}>
                              {m}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 风险策略 */}
                      <div>
                        <p className="text-xs font-semibold mb-2" style={{ color: "oklch(70% 0.18 25)" }}>风险策略</p>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="text-xs mb-1 block" style={{ color: "oklch(42% 0 0)" }}>单仓上限 %</label>
                            <input type="number" min={5} max={100} step={5}
                              value={invRiskPolicy.maxSinglePosition}
                              onChange={e => setInvRiskPolicy(p => ({ ...p, maxSinglePosition: Number(e.target.value) }))}
                              className="w-full text-xs px-2 py-1.5 rounded-lg"
                              style={{ background: "oklch(100% 0 0 / 0.06)", border: "1px solid oklch(100% 0 0 / 0.12)", color: "var(--bloomberg-text-primary)" }} />
                          </div>
                          <div>
                            <label className="text-xs mb-1 block" style={{ color: "oklch(42% 0 0)" }}>行业上限 %</label>
                            <input type="number" min={10} max={100} step={5}
                              value={invRiskPolicy.maxSectorPosition}
                              onChange={e => setInvRiskPolicy(p => ({ ...p, maxSectorPosition: Number(e.target.value) }))}
                              className="w-full text-xs px-2 py-1.5 rounded-lg"
                              style={{ background: "oklch(100% 0 0 / 0.06)", border: "1px solid oklch(100% 0 0 / 0.12)", color: "var(--bloomberg-text-primary)" }} />
                          </div>
                          <div>
                            <label className="text-xs mb-1 block" style={{ color: "oklch(42% 0 0)" }}>持仓周期</label>
                            <select value={invRiskPolicy.holdingPeriod}
                              onChange={e => setInvRiskPolicy(p => ({ ...p, holdingPeriod: e.target.value as any }))}
                              className="w-full text-xs px-2 py-1.5 rounded-lg"
                              style={{ background: "oklch(100% 0 0 / 0.06)", border: "1px solid oklch(100% 0 0 / 0.12)", color: "var(--bloomberg-text-primary)" }}>
                              <option value="short">短期(＜1年)</option>
                              <option value="medium">中期(1-3年)</option>
                              <option value="long">长期(3年+)</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* 自由补充 */}
                      <div>
                        <p className="text-xs font-semibold mb-2" style={{ color: "oklch(42% 0 0)" }}>补充说明（可选）</p>
                        <Textarea value={invFreeText} onChange={e => setInvFreeText(e.target.value)}
                          placeholder="其他特殊约束、禁止行业、个人情况等..."
                          className="min-h-[80px] text-xs resize-y"
                          style={{ background: "oklch(100% 0 0 / 0.06)", borderColor: "oklch(100% 0 0 / 0.12)", color: "var(--bloomberg-text-primary)" }} />
                      </div>

                      {/* 保存按钮 */}
                      <div className="flex justify-end">
                        <Button size="sm"
                          onClick={() => {
                            const structuredRules = {
                              philosophy: invPhilosophy,
                              marketPriority: invMarketPriority,
                              riskPolicy: invRiskPolicy,
                              freeText: invFreeText,
                            };
                            const rulesText = [
                              invPhilosophy.length > 0 ? `投资哲学：${invPhilosophy.join("、")}` : "",
                              invMarketPriority.length > 0 ? `重点市场：${invMarketPriority.join("、")}` : "",
                              `单仓上限：${invRiskPolicy.maxSinglePosition}%，行业上限：${invRiskPolicy.maxSectorPosition}%，持仓周期：${{ short: "短期", medium: "中期", long: "长期" }[invRiskPolicy.holdingPeriod]}`,
                              invFreeText ? `补充：${invFreeText}` : "",
                            ].filter(Boolean).join("\n");
                            saveConfigMutation.mutate({ investmentRules: rulesText, structuredInvestmentRules: structuredRules } as any);
                          }}
                          disabled={saveConfigMutation.isPending}
                          className="gap-1.5 h-7 text-xs"
                          style={{ background: "oklch(68% 0.18 155)", color: "var(--bloomberg-surface-0)" }}>
                          {saveConfigMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                          保存守则
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <Textarea
                        value={invFreeText || investmentRules}
                        onChange={(e) => { setInvFreeText(e.target.value); setInvestmentRules(e.target.value); }}
                        placeholder={"示例：\n我的投资理念基于段永平价値投资体系。\n我关注美股和港股，尤其是科技和消费行业。\n我的风险承受能力中等，希望长期持有。"}
                        className="min-h-[280px] text-sm font-mono resize-y"
                        style={{ background: "oklch(100% 0 0 / 0.06)", borderColor: "oklch(68% 0.18 155 / 0.3)", color: "var(--bloomberg-text-primary)" }}
                      />
                      <div className="flex justify-between items-center">
                        <button type="button"
                          onClick={() => setInvFreeText(DEFAULT_INVESTMENT_RULES)}
                          className="text-xs px-2 py-1 rounded transition-colors hover:opacity-80"
                          style={{ color: "oklch(68% 0.18 155)", background: "oklch(68% 0.18 155 / 0.1)", border: "1px solid oklch(68% 0.18 155 / 0.25)" }}>
                          填入默认守则
                        </button>
                        <Button size="sm"
                          onClick={() => saveConfigMutation.mutate({ investmentRules: invFreeText || investmentRules } as any)}
                          disabled={saveConfigMutation.isPending}
                          className="gap-1.5 h-7 text-xs"
                          style={{ background: "oklch(68% 0.18 155)", color: "var(--bloomberg-surface-0)" }}>
                          {saveConfigMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                          保存守则
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 全局任务指令 Tab */}
              {activeRulesTab === "task" && (
                <div className="p-4 rounded-2xl space-y-3"
                  style={{ background: "oklch(100% 0 0 / 0.04)", border: "1px solid oklch(65% 0.18 25 / 0.15)" }}>
                  {/* 模式切换 */}
                  <div className="flex items-center justify-between">
                    <p className="text-xs" style={{ color: "oklch(0.60 0.01 270)" }}>
                      每次执行任务时强制遵守的全局指令，优先级高于投资守则。
                    </p>
                    <div className="flex gap-1 p-0.5 rounded-md" style={{ background: "oklch(0.13 0.004 270)" }}>
                      <button onClick={() => setTaskFormMode("structured")}
                        className={`px-2 py-0.5 rounded text-xs transition-colors ${taskFormMode === "structured" ? "font-semibold" : "opacity-60"}`}
                        style={taskFormMode === "structured" ? { background: "oklch(0.65 0.18 25)", color: "var(--bloomberg-surface-0)" } : { color: "oklch(0.70 0.01 270)" }}>
                        策略开关
                      </button>
                      <button onClick={() => setTaskFormMode("freetext")}
                        className={`px-2 py-0.5 rounded text-xs transition-colors ${taskFormMode === "freetext" ? "font-semibold" : "opacity-60"}`}
                        style={taskFormMode === "freetext" ? { background: "oklch(0.65 0.18 25)", color: "var(--bloomberg-surface-0)" } : { color: "oklch(0.70 0.01 270)" }}>
                        自由文本
                      </button>
                    </div>
                  </div>

                  {taskFormMode === "structured" ? (
                    <div className="space-y-2.5">
                      {/* 策略开关列表 */}
                      {([
                        { key: "forceZhOutput" as const, label: "强制中文输出", desc: "所有回复必须以中文输出" },
                        { key: "declareRulesCompliance" as const, label: "声明守则遵守", desc: "每次任务开头声明「已遵守投资守则 ✓」" },
                        { key: "appendFollowupQs" as const, label: "追问建议", desc: "每次回复末尾提供 2-3 个后续跟进问题" },
                        { key: "crossRefHistory" as const, label: "历史交叉引用", desc: "任务之间主动引用历史结论进行对比" },
                        { key: "showEvidenceScore" as const, label: "显示证据评分", desc: "在回复头部展示 evidenceScore 和 outputMode" },
                        { key: "citationRequired" as const, label: "强制引用来源", desc: "所有关键判断必须标注数据来源" },
                      ]).map(item => (
                        <div key={item.key} className="flex items-center justify-between py-1.5 px-2 rounded-lg"
                          style={{ background: "oklch(100% 0 0 / 0.06)" }}>
                          <div>
                            <p className="text-xs font-medium" style={{ color: "oklch(0.85 0.005 264)" }}>{item.label}</p>
                            <p className="text-xs mt-0.5" style={{ color: "oklch(40% 0 0)" }}>{item.desc}</p>
                          </div>
                          <button
                            onClick={() => setTaskSwitches(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                            className="w-9 h-5 rounded-full transition-colors relative flex-shrink-0"
                            style={{ background: taskSwitches[item.key] ? "oklch(0.55 0.15 150)" : "oklch(0.30 0.01 270)" }}>
                            <div className="w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-all"
                              style={{ left: taskSwitches[item.key] ? "18px" : "3px" }} />
                          </button>
                        </div>
                      ))}
                      {/* 补充文本 */}
                      <div className="pt-1">
                        <p className="text-xs mb-1" style={{ color: "oklch(42% 0 0)" }}>补充指令（可选）</p>
                        <Textarea
                          value={taskFreeText}
                          onChange={(e) => setTaskFreeText(e.target.value)}
                          placeholder="在此添加策略开关未覆盖的自定义指令..."
                          className="min-h-[80px] text-xs font-mono resize-y"
                          style={{ background: "oklch(0.13 0.004 270)", borderColor: "oklch(0.65 0.18 25 / 0.3)", color: "var(--bloomberg-text-primary)" }}
                        />
                      </div>
                    </div>
                  ) : (
                    <Textarea
                      value={taskFreeText}
                      onChange={(e) => setTaskFreeText(e.target.value)}
                      placeholder={"示例：\n- 每次回复必须以中文输出\n- 每次任务开头声明：已遵守投资守则 ✓\n- 每次回复末尾提供 2-3 个后续跟进问题\n- 任务之间主动引用历史结论进行对比"}
                      className="min-h-[200px] text-sm font-mono resize-y"
                      style={{ background: "oklch(0.13 0.004 270)", borderColor: "oklch(0.65 0.18 25 / 0.3)", color: "var(--bloomberg-text-primary)" }}
                    />
                  )}

                  <div className="flex justify-end">
                    <Button size="sm"
                      onClick={() => {
                        const structuredTaskInstruction = {
                          switches: taskSwitches,
                          freeText: taskFreeText.trim(),
                        };
                        // 将结构化开关序列化为可读文本，供后端 prompt 注入
                        const switchLines: string[] = [];
                        if (taskSwitches.forceZhOutput) switchLines.push("- 所有回复必须以中文输出");
                        if (taskSwitches.declareRulesCompliance) switchLines.push("- 每次任务开头声明：已遵守投资守则 ✓");
                        if (taskSwitches.appendFollowupQs) switchLines.push("- 每次回复末尾提供 2-3 个后续跟进问题");
                        if (taskSwitches.crossRefHistory) switchLines.push("- 任务之间主动引用历史结论进行对比");
                        if (taskSwitches.showEvidenceScore) switchLines.push("- 在回复头部展示 evidenceScore 和 outputMode");
                        if (taskSwitches.citationRequired) switchLines.push("- 所有关键判断必须标注数据来源");
                        const taskInstructionText = [
                          switchLines.length > 0 ? "[策略开关]\n" + switchLines.join("\n") : "",
                          taskFreeText.trim() ? "[补充指令]\n" + taskFreeText.trim() : "",
                        ].filter(Boolean).join("\n\n");
                        saveConfigMutation.mutate({
                          openaiModel: selectedModel,
                          taskInstruction: taskInstructionText || null,
                          structuredTaskInstruction,
                        } as any);
                      }}
                      disabled={saveConfigMutation.isPending}
                      className="gap-1.5 h-7 text-xs"
                      style={{ background: "oklch(0.65 0.18 25)", color: "var(--bloomberg-surface-0)" }}>
                      {saveConfigMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      保存任务指令
                    </Button>
                  </div>
                </div>
              )}


              {/* 资料数据库 Tab */}
              {activeRulesTab === "data" && (
                <div className="space-y-3">
                  {/* ---- 实时数据源状态面板 ---- */}
                  <DataSourceStatusPanel />

                  {/* ---- 结构化 Trusted Sources ---- */}
                  <div className="p-4 rounded-2xl space-y-3" style={{ background: "oklch(100% 0 0 / 0.04)", border: "1px solid oklch(0.63 0.20 258 / 0.15)" }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold" style={{ color: "var(--bloomberg-text-primary)" }}>可信来源层 (Trusted Sources)</p>
                        <p className="text-xs mt-0.5" style={{ color: "oklch(42% 0 0)" }}>添加权威研究来源，系统优先从这里检索并强制引用来源</p>
                      </div>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs"
                          onClick={() => { setShowQuickImport(v => !v); setShowNewSourceForm(false); }}
                          style={{ borderColor: "oklch(0.55 0.15 150 / 0.5)", color: "oklch(0.72 0.18 150)" }}>
                          <Sparkles className="w-3 h-3" />快速导入
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs"
                          onClick={() => { setShowNewSourceForm(v => !v); setShowQuickImport(false); }}
                          style={{ borderColor: "oklch(0.72 0.18 250 / 0.4)", color: "oklch(60% 0.15 250)" }}>
                          <Plus className="w-3 h-3" />添加来源
                        </Button>
                      </div>
                    </div>

                    {/* 快速导入面板 */}
                    {showQuickImport && (
                      <div className="p-3 rounded-lg space-y-2" style={{ background: "oklch(100% 0 0 / 0.06)", border: "1px solid oklch(0.55 0.15 150 / 0.3)" }}>
                        <p className="text-xs font-medium mb-2" style={{ color: "oklch(0.72 0.18 150)" }}>选择预置来源（已存在的来源会被跳过）</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {PRESET_SOURCES.map((src) => {
                            const exists = trustedSourcesConfig.sources.some(s => s.name === src.name);
                            return (
                              <button key={src.name}
                                disabled={exists}
                                onClick={() => {
                                  if (!exists) {
                                    setTrustedSourcesConfig(prev => ({
                                      ...prev,
                                      sources: [...prev.sources, { ...src, id: `preset-${Date.now()}-${src.name}` }]
                                    }));
                                  }
                                }}
                                className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-left transition-all"
                                style={{
                                  background: exists ? "oklch(100% 0 0 / 0.05)" : "oklch(100% 0 0 / 0.04)",
                                  border: `1px solid ${exists ? "oklch(100% 0 0 / 0.12)" : "oklch(0.35 0.008 270)"}`,
                                  color: exists ? "oklch(0.40 0.008 270)" : "oklch(0.82 0.005 264)",
                                  cursor: exists ? "not-allowed" : "pointer",
                                  opacity: exists ? 0.5 : 1,
                                }}>
                                <span className="truncate font-medium">{src.name}</span>
                                <span className="ml-auto shrink-0 text-xs" style={{ color: "var(--bloomberg-text-dim)" }}>{src.category}</span>
                                {exists && <CheckCircle2 className="w-3 h-3 shrink-0" style={{ color: "oklch(0.55 0.15 150)" }} />}
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex justify-end pt-1">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowQuickImport(false)}
                            style={{ borderColor: "oklch(100% 0 0 / 0.12)", color: "oklch(42% 0 0)" }}>
                            关闭
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* 添加来源表单 */}
                    {showNewSourceForm && (
                      <div className="p-3 rounded-lg space-y-2" style={{ background: "oklch(100% 0 0 / 0.06)", border: "1px solid oklch(0.63 0.20 258 / 0.25)" }}>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs" style={{ color: "var(--bloomberg-text-tertiary)" }}>来源名称</Label>
                            <Input value={newSourceForm.name} onChange={e => setNewSourceForm(f => ({ ...f, name: e.target.value }))}
                              placeholder="AQR Capital" className="h-8 text-xs"
                              style={{ background: "oklch(0.12 0.003 270)", borderColor: "oklch(100% 0 0 / 0.1)" }} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs" style={{ color: "var(--bloomberg-text-tertiary)" }}>分类</Label>
                            <Input value={newSourceForm.category} onChange={e => setNewSourceForm(f => ({ ...f, category: e.target.value }))}
                              placeholder="quant / macro / fundamentals" className="h-8 text-xs"
                              style={{ background: "oklch(0.12 0.003 270)", borderColor: "oklch(100% 0 0 / 0.1)" }} />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs" style={{ color: "var(--bloomberg-text-tertiary)" }}>URL</Label>
                          <Input value={newSourceForm.url} onChange={e => setNewSourceForm(f => ({ ...f, url: e.target.value }))}
                            placeholder="https://www.aqr.com/insights" className="h-8 text-xs font-mono"
                            style={{ background: "oklch(0.12 0.003 270)", borderColor: "oklch(100% 0 0 / 0.1)" }} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs" style={{ color: "var(--bloomberg-text-tertiary)" }}>路由关键词（逗号分隔）</Label>
                            <Input value={newSourceForm.routingKeys} onChange={e => setNewSourceForm(f => ({ ...f, routingKeys: e.target.value }))}
                              placeholder="\u91cf化,因子,小市値" className="h-8 text-xs"
                              style={{ background: "oklch(0.12 0.003 270)", borderColor: "oklch(100% 0 0 / 0.1)" }} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs" style={{ color: "var(--bloomberg-text-tertiary)" }}>信任等级</Label>
                            <Select value={newSourceForm.trustLevel} onValueChange={v => setNewSourceForm(f => ({ ...f, trustLevel: v as TrustedSource["trustLevel"] }))}>
                              <SelectTrigger className="h-8 text-xs" style={{ background: "oklch(0.12 0.003 270)", borderColor: "oklch(100% 0 0 / 0.1)" }}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="primary">主要来源</SelectItem>
                                <SelectItem value="secondary">次要来源</SelectItem>
                                <SelectItem value="supplementary">补充来源</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowNewSourceForm(false)}
                            style={{ borderColor: "oklch(100% 0 0 / 0.12)", color: "oklch(0.60 0.01 270)" }}>取消</Button>
                          <Button size="sm" className="h-7 text-xs gap-1"
                            style={{ background: "oklch(60% 0.15 250)", color: "var(--bloomberg-surface-0)" }}
                            onClick={() => {
                              if (!newSourceForm.name || !newSourceForm.url) { toast.error("请填写名称和 URL"); return; }
                              const newSrc: TrustedSource = {
                                id: newSourceForm.name.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 20) + "_" + Date.now().toString(36),
                                name: newSourceForm.name,
                                url: newSourceForm.url,
                                category: newSourceForm.category || "general",
                                routingKeys: newSourceForm.routingKeys.split(",").map(s => s.trim()).filter(Boolean),
                                trustLevel: newSourceForm.trustLevel,
                                enabled: true,
                              };
                              setTrustedSourcesConfig(c => ({ ...c, sources: [...c.sources, newSrc] }));
                              setNewSourceForm({ name: "", url: "", category: "", routingKeys: "", trustLevel: "primary" });
                              setShowNewSourceForm(false);
                            }}>
                            <Plus className="w-3 h-3" />确认添加
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* 来源列表 */}
                    {trustedSourcesConfig.sources.length > 0 ? (
                      <div className="space-y-1.5">
                        {trustedSourcesConfig.sources.map(src => (
                          <div key={src.id} className="flex items-center gap-2 p-2.5 rounded-lg"
                            style={{ background: "oklch(0.13 0.004 270)", border: `1px solid ${src.enabled ? "oklch(0.72 0.18 250 / 0.25)" : "oklch(100% 0 0 / 0.1)"}` }}>
                            <button onClick={() => setTrustedSourcesConfig(c => ({ ...c, sources: c.sources.map(s => s.id === src.id ? { ...s, enabled: !s.enabled } : s) }))}
                              className="flex-shrink-0">
                              {src.enabled
                                ? <CheckCircle2 className="w-4 h-4" style={{ color: "oklch(0.72 0.18 142)" }} />
                                : <div className="w-4 h-4 rounded-full border-2" style={{ borderColor: "oklch(0.35 0.008 270)" }} />}
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium" style={{ color: "var(--bloomberg-text-primary)" }}>{src.name}</span>
                                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: src.trustLevel === "primary" ? "oklch(0.63 0.20 258 / 0.15)" : "oklch(100% 0 0 / 0.1)", color: src.trustLevel === "primary" ? "oklch(60% 0.15 250)" : "oklch(42% 0 0)" }}>
                                  {src.trustLevel === "primary" ? "主要" : src.trustLevel === "secondary" ? "次要" : "补充"}
                                </span>
                                {src.category && <span className="text-xs" style={{ color: "oklch(40% 0 0)" }}>{src.category}</span>}
                              </div>
                              <p className="text-xs truncate mt-0.5" style={{ color: "var(--bloomberg-text-dim)" }}>{src.url}</p>
                              {src.routingKeys.length > 0 && (
                                <p className="text-xs mt-0.5" style={{ color: "oklch(0.55 0.15 250)" }}>路由: {src.routingKeys.join(" · ")}</p>
                              )}
                            </div>
                            <button onClick={() => setTrustedSourcesConfig(c => ({ ...c, sources: c.sources.filter(s => s.id !== src.id) }))}
                              className="flex-shrink-0 p-1 rounded hover:bg-white/5"
                              style={{ color: "var(--bloomberg-text-dim)" }}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-center py-4" style={{ color: "var(--bloomberg-text-dim)" }}>暂无可信来源，点击「添加来源」进行配置</p>
                    )}

                    {/* Policy 配置 */}
                    <div className="pt-2 border-t" style={{ borderColor: "oklch(100% 0 0 / 0.1)" }}>
                      <p className="text-xs font-medium mb-2" style={{ color: "var(--bloomberg-text-tertiary)" }}>Policy 配置</p>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { key: "requireCitation" as const, label: "强制引用来源" },
                          { key: "blockOnHardMissing" as const, label: "缺失数据时阻断" },
                          { key: "fallbackToTraining" as const, label: "允许训练记忆备用" },
                        ] as const).map(({ key, label }) => (
                          <button key={key}
                            onClick={() => setTrustedSourcesConfig(c => ({ ...c, policy: { ...c.policy, [key]: !c.policy[key] } }))}
                            className="flex items-center gap-2 p-2 rounded-lg text-xs"
                            style={{ background: trustedSourcesConfig.policy[key] ? "oklch(0.72 0.18 250 / 0.15)" : "oklch(100% 0 0 / 0.06)", border: `1px solid ${trustedSourcesConfig.policy[key] ? "oklch(0.72 0.18 250 / 0.4)" : "oklch(100% 0 0 / 0.1)"}`, color: trustedSourcesConfig.policy[key] ? "oklch(60% 0.15 250)" : "oklch(42% 0 0)" }}>
                            {trustedSourcesConfig.policy[key] ? <CheckCircle2 className="w-3 h-3" /> : <div className="w-3 h-3 rounded-full border" style={{ borderColor: "oklch(0.35 0.008 270)" }} />}
                            {label}
                          </button>
                        ))}
                        <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: "oklch(100% 0 0 / 0.06)", border: "1px solid oklch(100% 0 0 / 0.1)" }}>
                          <span className="text-xs" style={{ color: "oklch(42% 0 0)" }}>最低证据分</span>
                          <input type="range" min="0" max="1" step="0.1"
                            value={trustedSourcesConfig.policy.minEvidenceScore}
                            onChange={e => setTrustedSourcesConfig(c => ({ ...c, policy: { ...c.policy, minEvidenceScore: parseFloat(e.target.value) } }))}
                            className="flex-1 h-1 accent-blue-400" />
                          <span className="text-xs font-mono w-6" style={{ color: "oklch(60% 0.15 250)" }}>{trustedSourcesConfig.policy.minEvidenceScore}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button size="sm" className="gap-1.5 h-7 text-xs"
                        style={{ background: "oklch(60% 0.15 250)", color: "var(--bloomberg-surface-0)" }}
                        onClick={() => saveConfigMutation.mutate({ trustedSourcesConfig } as any)}
                        disabled={saveConfigMutation.isPending}>
                        {saveConfigMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        保存可信来源配置
                      </Button>
                    </div>
                  </div>

                  {/* ---- 传统资料库文本输入（兼容旧模式）---- */}
                  <div className="p-4 rounded-2xl space-y-3"
                    style={{ background: "oklch(100% 0 0 / 0.04)", border: "1px solid oklch(0.72 0.18 250 / 0.15)" }}>
                    <p className="text-xs font-medium" style={{ color: "var(--bloomberg-text-tertiary)" }}>传统模式：直接输入 URL 列表</p>
                    <p className="text-xs" style={{ color: "oklch(40% 0 0)" }}>如果上方已配置结构化来源，优先使用结构化配置。</p>
                    <Textarea
                      value={dataLibrary}
                      onChange={(e) => setDataLibrary(e.target.value)}
                      placeholder={"\u793a\u4f8b\uff1a\n## \u6743\u5a01\u6570\u636e\u6e90\n- \u4e2d\u56fd\u8bc1\u76d1\u4f1a\u516c\u544a\uff1ahttps://www.csrc.gov.cn\n- \u7f8e\u8054\u50a8\u5229\u7387\u51b3\u8bae\uff1ahttps://www.federalreserve.gov"}
                      className="min-h-[160px] text-sm font-mono resize-y"
                      style={{ background: "oklch(0.13 0.004 270)", borderColor: "oklch(0.63 0.20 258 / 0.15)", color: "var(--bloomberg-text-primary)" }}
                    />
                    <div className="flex justify-end">
                      <Button size="sm"
                        onClick={() => saveConfigMutation.mutate({ openaiModel: selectedModel, dataLibrary: dataLibrary.trim() || null } as any)}
                        disabled={saveConfigMutation.isPending}
                        className="gap-1.5 h-7 text-xs"
                        style={{ background: "oklch(60% 0.15 250)", color: "var(--bloomberg-surface-0)" }}>
                        {saveConfigMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        保存资料库
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {/* ── Tab: 数据库 ── */}
        {activeTab === "database" && (
          <div className="space-y-6">
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4" style={{ color: "oklch(60% 0.15 250)" }} />
                <h2 className="text-sm font-semibold" style={{ color: "oklch(92% 0 0)" }}>金融数据库连接</h2>
              </div>
              {dbConnections.length > 0 && (
                <div className="space-y-2">
                  {dbConnections.map((conn) => (
                    <div key={conn.id} className="flex items-center justify-between p-3 rounded-2xl"
                      style={{ background: "oklch(100% 0 0 / 0.04)", border: "1px solid oklch(100% 0 0 / 0.1)" }}>
                      <div className="flex items-center gap-3">
                        <button onClick={() => setActiveMutation.mutate({ connId: conn.id })} className="flex-shrink-0">
                          {conn.isActive
                            ? <CheckCircle2 className="w-4 h-4" style={{ color: "oklch(68% 0.18 155)" }} />
                            : <div className="w-4 h-4 rounded-full border-2" style={{ borderColor: "oklch(0.35 0.008 270)" }} />}
                        </button>
                        <div>
                          <p className="text-sm font-medium" style={{ color: "var(--bloomberg-text-primary)" }}>{conn.name}</p>
                          <p className="text-xs" style={{ color: "oklch(40% 0 0)" }}>
                            {conn.dbType}{conn.host ? ` · ${conn.host}` : ""}{conn.database ? ` · ${conn.database}` : ""}
                          </p>
                        </div>
                      </div>
                      <button onClick={() => deleteMutation.mutate({ connId: conn.id })}
                        className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                        style={{ color: "oklch(40% 0 0)" }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="p-4 rounded-2xl space-y-3"
                style={{ background: "oklch(100% 0 0 / 0.04)", border: "1px solid oklch(100% 0 0 / 0.1)" }}>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs" style={{ color: "var(--bloomberg-text-tertiary)" }}>连接名称</Label>
                    <Input placeholder="我的金融数据库" value={dbForm.name}
                      onChange={(e) => setDbForm(f => ({ ...f, name: e.target.value }))}
                      className="h-9 text-sm"
                      style={{ background: "oklch(100% 0 0 / 0.06)", borderColor: "oklch(100% 0 0 / 0.1)" }} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs" style={{ color: "var(--bloomberg-text-tertiary)" }}>数据库类型</Label>
                    <Select value={dbForm.dbType} onValueChange={(v) => setDbForm(f => ({ ...f, dbType: v as any }))}>
                      <SelectTrigger className="h-9 text-sm"
                        style={{ background: "oklch(100% 0 0 / 0.06)", borderColor: "oklch(100% 0 0 / 0.1)" }}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mysql">MySQL</SelectItem>
                        <SelectItem value="postgresql">PostgreSQL</SelectItem>
                        <SelectItem value="sqlite">SQLite</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {dbForm.dbType === "sqlite" ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs" style={{ color: "var(--bloomberg-text-tertiary)" }}>SQLite 文件路径</Label>
                    <Input placeholder="/path/to/finance.db" value={dbForm.filePath}
                      onChange={(e) => setDbForm(f => ({ ...f, filePath: e.target.value }))}
                      className="h-9 text-sm font-mono"
                      style={{ background: "oklch(100% 0 0 / 0.06)", borderColor: "oklch(100% 0 0 / 0.1)" }} />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "主机地址", key: "host", placeholder: "localhost" },
                      { label: "端口", key: "port", placeholder: dbForm.dbType === "mysql" ? "3306" : "5432" },
                      { label: "数据库名", key: "database", placeholder: "finance_db" },
                      { label: "用户名", key: "username", placeholder: "root" },
                    ].map(({ label, key, placeholder }) => (
                      <div key={key} className="space-y-1.5">
                        <Label className="text-xs" style={{ color: "var(--bloomberg-text-tertiary)" }}>{label}</Label>
                        <Input placeholder={placeholder} value={(dbForm as any)[key]}
                          onChange={(e) => setDbForm(f => ({ ...f, [key]: e.target.value }))}
                          className="h-9 text-sm"
                          style={{ background: "oklch(100% 0 0 / 0.06)", borderColor: "oklch(100% 0 0 / 0.1)" }} />
                      </div>
                    ))}
                    <div className="col-span-2 space-y-1.5">
                      <Label className="text-xs" style={{ color: "var(--bloomberg-text-tertiary)" }}>密码</Label>
                      <Input type="password" placeholder="••••••••" value={dbForm.password}
                        onChange={(e) => setDbForm(f => ({ ...f, password: e.target.value }))}
                        className="h-9 text-sm"
                        style={{ background: "oklch(100% 0 0 / 0.06)", borderColor: "oklch(100% 0 0 / 0.1)" }} />
                    </div>
                  </div>
                )}
                <Button onClick={handleSaveDb} disabled={saveDbMutation.isPending}
                  className="w-full gap-2" variant="outline"
                  style={{ borderColor: "oklch(0.30 0.009 270)", color: "oklch(72% 0 0)" }}>
                  {saveDbMutation.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin" />保存中...</>
                    : <><Plus className="w-4 h-4" />保存连接</>}
                </Button>
              </div>
            </section>
          </div>
        )}

        {/* ── Tab: 关于 ── */}
        {activeTab === "access" && isOwner && (
          <div className="space-y-4">
            {/* 生成新密码 */}
            <div className="p-4 rounded-2xl space-y-3"
              style={{ background: "oklch(100% 0 0 / 0.04)", border: "1px solid oklch(100% 0 0 / 0.1)" }}>
              <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: "oklch(92% 0 0)" }}>
                <Plus className="w-4 h-4" style={{ color: "oklch(60% 0.15 250)" }} />
                生成访客密码
              </h2>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-3">
                  <Label className="text-xs mb-1 block" style={{ color: "oklch(0.60 0.01 270)" }}>备注标签（可选）</Label>
                  <Input
                    placeholder="如：朋友A"
                    value={codeLabel}
                    onChange={(e) => setCodeLabel(e.target.value)}
                    className="h-8 text-sm"
                    style={{ background: "var(--bloomberg-surface-0)", border: "1px solid oklch(100% 0 0 / 0.1)", color: "var(--bloomberg-text-primary)" }}
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1 block" style={{ color: "oklch(0.60 0.01 270)" }}>使用次数（-1=无限）</Label>
                  <Input
                    type="number"
                    min="-1"
                    max="2147483647"
                    placeholder="1"
                    value={codeMaxUses}
                    onChange={(e) => setCodeMaxUses(e.target.value)}
                    className="h-8 text-sm"
                    style={{ background: "var(--bloomberg-surface-0)", border: "1px solid oklch(100% 0 0 / 0.1)", color: "var(--bloomberg-text-primary)" }}
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs mb-1 block" style={{ color: "oklch(0.60 0.01 270)" }}>有效天数（留空=永久）</Label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="永久有效"
                    value={codeExpireDays}
                    onChange={(e) => setCodeExpireDays(e.target.value)}
                    className="h-8 text-sm"
                    style={{ background: "var(--bloomberg-surface-0)", border: "1px solid oklch(100% 0 0 / 0.1)", color: "var(--bloomberg-text-primary)" }}
                  />
                </div>
              </div>
              <Button
                className="w-full h-8 text-sm font-medium"
                style={{ background: "oklch(60% 0.15 250)", color: "white" }}
                disabled={generateCodeMutation.isPending}
                onClick={() => generateCodeMutation.mutate({
                  label: codeLabel || undefined,
                  maxUses: parseInt(codeMaxUses) || 1,
                  expiresInDays: codeExpireDays ? parseInt(codeExpireDays) : undefined,
                })}
              >
                {generateCodeMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
                生成密码
              </Button>

              {/* 显示刚生成的密码 */}
              {generatedCode && (
                <div className="p-3 rounded-lg flex items-center justify-between gap-2"
                  style={{ background: "oklch(0.72 0.18 155 / 0.12)", border: "1px solid oklch(0.72 0.18 155 / 0.4)" }}>
                  <div>
                    <div className="text-xs mb-0.5" style={{ color: "oklch(42% 0 0)" }}>新密码（请立即复制）</div>
                    <div className="font-mono text-base font-bold tracking-widest" style={{ color: "oklch(68% 0.18 155)" }}>{generatedCode}</div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="shrink-0"
                    onClick={() => { navigator.clipboard.writeText(generatedCode); toast.success("已复制到剪贴板"); }}
                  >
                    <Copy className="w-4 h-4" style={{ color: "oklch(68% 0.18 155)" }} />
                  </Button>
                </div>
              )}
            </div>

            {/* 密码列表 */}
            <div className="p-4 rounded-2xl space-y-2"
              style={{ background: "oklch(100% 0 0 / 0.04)", border: "1px solid oklch(100% 0 0 / 0.1)" }}>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: "oklch(92% 0 0)" }}>
                  <Shield className="w-4 h-4" style={{ color: "oklch(60% 0.15 250)" }} />
                  已生成密码 ({accessCodes.length})
                </h2>
                <Button size="icon" variant="ghost" onClick={() => refetchCodes()} className="w-6 h-6">
                  <RefreshCw className="w-3 h-3" style={{ color: "oklch(42% 0 0)" }} />
                </Button>
              </div>
              {accessCodes.length === 0 ? (
                <div className="text-xs text-center py-4" style={{ color: "oklch(0.40 0.008 264)" }}>暂无密码，点击上方「生成密码」创建</div>
              ) : (
                <div className="space-y-2">
                  {accessCodes.map((c: any) => (
                    <div key={c.id} className="flex items-center justify-between p-2.5 rounded-lg"
                      style={{ background: "var(--bloomberg-surface-0)", border: "1px solid oklch(0.13 0.006 264)" }}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold" style={{ color: c.isRevoked ? "oklch(0.40 0.01 270)" : "var(--bloomberg-text-primary)" }}>{c.code}</span>
                          {c.isRevoked && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "oklch(0.35 0.12 25 / 0.2)", color: "oklch(0.60 0.12 25)" }}>已撤销</span>}
                          {!c.isRevoked && c.usedCount >= c.maxUses && c.maxUses !== -1 && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "oklch(0.35 0.12 60 / 0.2)", color: "oklch(0.65 0.12 60)" }}>已用完</span>}
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: "var(--bloomberg-text-dim)" }}>
                          {c.label && <span className="mr-2">{c.label}</span>}
                          已用 {c.usedCount}/{c.maxUses === -1 ? "∞" : c.maxUses} 次
                          {c.expiresAt && <span className="ml-2">· 到期 {new Date(c.expiresAt).toLocaleDateString()}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button size="icon" variant="ghost" className="w-7 h-7"
                          onClick={() => { navigator.clipboard.writeText(c.code); toast.success("已复制密码"); }}>
                          <Copy className="w-3.5 h-3.5" style={{ color: "oklch(42% 0 0)" }} />
                        </Button>
                        {!c.isRevoked && (
                          <Button size="icon" variant="ghost" className="w-7 h-7"
                            disabled={revokeCodeMutation.isPending}
                            onClick={() => revokeCodeMutation.mutate({ codeId: c.id })}>
                            <UserX className="w-3.5 h-3.5" style={{ color: "oklch(0.60 0.12 25)" }} />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 说明 */}
            <div className="p-3 rounded-2xl text-xs" style={{ background: "oklch(0.72 0.18 250 / 0.08)", border: "1px solid oklch(0.63 0.20 258 / 0.15)", color: "oklch(0.60 0.01 270)" }}>
              <p className="font-medium mb-1" style={{ color: "oklch(60% 0.15 250)" }}>使用说明</p>
              <p>· 将密码发给访客，访客登录后输入密码即可访问</p>
              <p>· 使用次数为 1 时，密码使用后立即失效（防止分享）</p>
              <p>· 点击撤销可立即禁止该密码的后续使用</p>
            </div>
          </div>
        )}

        {activeTab === "logic" && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl space-y-4"
              style={{ background: "oklch(100% 0 0 / 0.04)", border: "1px solid oklch(100% 0 0 / 0.1)" }}>
              <h2 className="text-sm font-semibold" style={{ color: "oklch(92% 0 0)" }}>三步并行协作架构</h2>
              {[
                {
                  step: "Step 1 · GPT", label: "GPT 主导规划 + 初步分析",
                  desc: "GPT 制定分析框架 + 精准资源规划（指定具体 API + 深度 + 广度），同步开始主观分析（护城河/宏观叙事/风险识别/历史类比），输出 TASK_SPEC 格式给 Manus",
                  color: "oklch(68% 0.18 155)", icon: Brain,
                },
                {
                  step: "Step 2 · Manus", label: "Manus 完善任务 + 数据收集",
                  desc: "Manus 接收 GPT 的 TASK_SPEC 后，先做资源审查（可补漏/去冗余），再并行调动 30+ 个数据源模块收集数据，整理为结构化报告交回 GPT",
                  color: "oklch(60% 0.15 250)", icon: Bot,
                },
                {
                  step: "Step 3 · GPT", label: "GPT 深度整合，输出最终回复",
                  desc: "GPT 深度融合自身 S1 分析与 Manus 数据，展示完整推理链（数据→逻辑→判断），给出明确立场（买入/持有/卖出 | 高估/合理/低估），量化风险，输出最终专业报告",
                  color: "oklch(68% 0.18 155)", icon: Brain,
                },
              ].map(({ step, label, desc, color, icon: Icon }, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold mt-0.5"
                    style={{ background: `${color.replace(")", " / 0.15)")}`, border: `1px solid ${color.replace(")", " / 0.4)")}`, color }}>
                    {i + 1}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Icon className="w-3 h-3" style={{ color }} />
                      <span className="text-xs font-semibold" style={{ color: "var(--bloomberg-text-primary)" }}>{label}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded"
                        style={{ background: "oklch(0.13 0.006 264)", color: "oklch(40% 0 0)" }}>{step}</span>
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: "oklch(42% 0 0)" }}>{desc}</p>
                  </div>
                </div>
              ))}
              <div className="pt-2 mt-2 text-xs text-center"
                style={{ borderTop: "1px solid oklch(100% 0 0 / 0.08)", color: "oklch(0.40 0.008 264)" }}>
                全程静默内部流转，用户只看到最终回复 · 同对话框内新消息默认延续上一任务
              </div>
            </div>
            {/* 成本控制模式 */}
            <div className="p-4 rounded-2xl space-y-4"
              style={{ background: "oklch(100% 0 0 / 0.04)", border: "1px solid oklch(100% 0 0 / 0.1)" }}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold" style={{ color: "oklch(92% 0 0)" }}>默认分析深度</h2>
                  <p className="text-xs mt-0.5" style={{ color: "oklch(42% 0 0)" }}>控制每次分析的 Token 消耗与数据广度，可在对话框中临时切换</p>
                </div>
                <button
                  onClick={() => {
                    const mode = savedConfig?.defaultCostMode ?? "B";
                    saveConfigMutation.mutate({ defaultCostMode: mode as "A" | "B" | "C" });
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                  style={{ background: "oklch(0.72 0.18 75 / 0.15)", color: "var(--bloomberg-gold)", border: "1px solid oklch(0.72 0.18 75 / 0.3)" }}>
                  保存默认
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { mode: "A", label: "Mode A · 精简", desc: "快速扫描，1-2 个数据源，适合简单问答和市场概览", color: "oklch(0.72 0.18 142)", tokens: "~2K tokens", speed: "< 30s" },
                  { mode: "B", label: "Mode B · 标准", desc: "均衡深度，5-8 个数据源，适合常规股票分析和行业研究", color: "oklch(0.72 0.18 250)", tokens: "~8K tokens", speed: "1-2 min" },
                  { mode: "C", label: "Mode C · 深度", desc: "全面覆盖，15+ 数据源，适合深度尽调和投资决策", color: "oklch(0.72 0.18 75)", tokens: "~20K tokens", speed: "3-5 min" },
                ] as const).map(({ mode, label, desc, color, tokens, speed }) => {
                  const isSelected = (savedConfig?.defaultCostMode ?? "B") === mode;
                  return (
                    <button
                      key={mode}
                      onClick={() => saveConfigMutation.mutate({ defaultCostMode: mode })}
                      className="p-3 rounded-xl text-left transition-all"
                      style={{
                        background: isSelected ? `${color.replace(")", " / 0.12)")}` : "oklch(100% 0 0 / 0.02)",
                        border: `1px solid ${isSelected ? color.replace(")", " / 0.5)") : "oklch(100% 0 0 / 0.08)"}`,
                      }}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold" style={{ color: isSelected ? color : "oklch(82% 0 0)" }}>{label}</span>
                        {isSelected && <div className="w-2 h-2 rounded-full" style={{ background: color }} />}
                      </div>
                      <p className="text-[10px] leading-relaxed mb-2" style={{ color: "oklch(42% 0 0)" }}>{desc}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "oklch(0.12 0.006 264)", color: "oklch(40% 0 0)" }}>{tokens}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "oklch(0.12 0.006 264)", color: "oklch(40% 0 0)" }}>{speed}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 图表涨跌颜色方案 */}
            <div className="p-4 rounded-2xl space-y-4"
              style={{ background: "oklch(100% 0 0 / 0.04)", border: "1px solid oklch(100% 0 0 / 0.1)" }}>
              <div>
                <h2 className="text-sm font-semibold" style={{ color: "oklch(92% 0 0)" }}>图表涨跌颜色</h2>
                <p className="text-xs mt-0.5" style={{ color: "oklch(42% 0 0)" }}>设置股价图表中涨跌的颜色风格，默认中国风格（红涨绿跌）</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { scheme: "cn" as const, label: "中国风格", desc: "红色上涨，绿色下跌", upColor: "#ef4444", downColor: "#22c55e" },
                  { scheme: "us" as const, label: "美国风格", desc: "绿色上涨，红色下跌", upColor: "#22c55e", downColor: "#ef4444" },
                ]).map(({ scheme, label, desc, upColor, downColor }) => {
                  const isSelected = (savedConfig?.chartColorScheme ?? "cn") === scheme;
                  return (
                    <button
                      key={scheme}
                      onClick={() => saveConfigMutation.mutate({ chartColorScheme: scheme })}
                      className="p-3 rounded-xl text-left transition-all"
                      style={{
                        background: isSelected ? "oklch(0.72 0.18 75 / 0.12)" : "oklch(100% 0 0 / 0.02)",
                        border: `1px solid ${isSelected ? "oklch(0.72 0.18 75 / 0.5)" : "oklch(100% 0 0 / 0.08)"}`,
                      }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold" style={{ color: isSelected ? "oklch(0.78 0.18 85)" : "oklch(82% 0 0)" }}>{label}</span>
                        {isSelected && <div className="w-2 h-2 rounded-full" style={{ background: "oklch(0.78 0.18 85)" }} />}
                      </div>
                      <p className="text-[10px] mb-2" style={{ color: "oklch(42% 0 0)" }}>{desc}</p>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 rounded-sm" style={{ background: upColor }} />
                          <span className="text-[10px]" style={{ color: "oklch(55% 0 0)" }}>涨</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 rounded-sm" style={{ background: downColor }} />
                          <span className="text-[10px]" style={{ color: "oklch(55% 0 0)" }}>跌</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        {/* ── Tab: AI 记忆管理 ── */}
        {activeTab === "memory" && <MemoryManager />}

        {/* ── Tab: 监控 ── */}
        {activeTab === "monitoring" && (
          <div className="p-6 space-y-6">
            <div>
              <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--bloomberg-text-primary)" }}>Pipeline 执行监控</h3>
              <p className="text-xs mb-4" style={{ color: "oklch(42% 0 0)" }}>9 步推理引擎实时状态、数据源健康、成本消耗监控</p>
            </div>
            {/* Pipeline 步骤状态卡片 */}
            <div className="rounded-2xl p-4 space-y-3" style={{ background: "oklch(100% 0 0 / 0.04)", border: "1px solid var(--bloomberg-border)" }}>
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-3.5 h-3.5" style={{ color: "var(--bloomberg-gold)" }} />
                <span className="text-xs font-semibold" style={{ color: "var(--bloomberg-text-primary)" }}>9步推理引擎 Pipeline</span>
              </div>
              {[
                { step: 1, label: "Intent Parsing", desc: "意图解析与分类", status: "active" },
                { step: 2, label: "Research Planning", desc: "研究计划生成", status: "active" },
                { step: 3, label: "Field Requirements", desc: "字段优先级分层", status: "active" },
                { step: 4, label: "Source Selection", desc: "数据源智能选择", status: "active" },
                { step: 5, label: "Data Fetching", desc: "并行数据检索", status: "active" },
                { step: 6, label: "Evidence Evaluation", desc: "证据质量评分", status: "active" },
                { step: 7, label: "Multi-Agent Analysis", desc: "4个专家 Agent 协作", status: "active" },
                { step: 8, label: "Synthesis Engine", desc: "结构化综合输出", status: "active" },
                { step: 9, label: "Discussion Engine", desc: "深度讨论生成", status: "active" },
              ].map(({ step, label, desc, status }) => (
                <div key={step} className="flex items-center gap-3 py-1.5 px-2 rounded-lg"
                  style={{ background: "oklch(100% 0 0 / 0.03)" }}>
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ background: "var(--bloomberg-gold)", color: "oklch(8% 0.02 264)" }}>{step}</div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium" style={{ color: "oklch(0.82 0.005 264)" }}>{label}</span>
                    <span className="text-xs ml-2" style={{ color: "oklch(40% 0 0)" }}>{desc}</span>
                  </div>
                  <div className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: "oklch(0.72 0.18 142)", boxShadow: "0 0 5px oklch(0.72 0.18 142)" }} />
                </div>
              ))}
            </div>
            {/* 数据源健康卡片 */}
            <div className="rounded-2xl p-4" style={{ background: "oklch(100% 0 0 / 0.04)", border: "1px solid var(--bloomberg-border)" }}>
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-3.5 h-3.5" style={{ color: "oklch(0.60 0.15 250)" }} />
                <span className="text-xs font-semibold" style={{ color: "var(--bloomberg-text-primary)" }}>数据源健康实时监控</span>
              </div>
              <DataSourceStatusPanel />
            </div>
            {/* 成本模式卡片 */}
            <div className="rounded-2xl p-4 space-y-3" style={{ background: "oklch(100% 0 0 / 0.04)", border: "1px solid var(--bloomberg-border)" }}>
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" style={{ color: "var(--bloomberg-gold)" }} />
                <span className="text-xs font-semibold" style={{ color: "var(--bloomberg-text-primary)" }}>成本模式监控</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { mode: "A", label: "精简模式", desc: "Quick", tokens: "~2K", color: "oklch(0.72 0.18 142)" },
                  { mode: "B", label: "标准模式", desc: "Standard", tokens: "~8K", color: "var(--bloomberg-gold)" },
                  { mode: "C", label: "深度模式", desc: "Deep", tokens: "~20K", color: "oklch(0.72 0.18 250)" },
                ].map(({ mode, label, desc, tokens, color }) => (
                  <div key={mode} className="rounded-xl p-3 text-center"
                    style={{ background: "oklch(100% 0 0 / 0.04)", border: `1px solid ${color}33` }}>
                    <div className="text-lg font-bold mb-1" style={{ color }}>{mode}</div>
                    <div className="text-xs font-medium" style={{ color: "oklch(0.82 0.005 264)" }}>{label}</div>
                    <div className="text-xs" style={{ color: "oklch(40% 0 0)" }}>{desc}</div>
                    <div className="text-xs mt-1 font-mono" style={{ color }}>{tokens} tokens</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Tab: 研究风格 ── */}
        {activeTab === "research_style" && (
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--bloomberg-text-primary)" }}>研究风格配置</h3>
                <p className="text-xs" style={{ color: "oklch(42% 0 0)" }}>自定义 AI 研究输出的风格、深度和展示偏好</p>
              </div>
              <Button size="sm" className="text-xs h-7 px-3"
                style={{ background: "var(--bloomberg-gold)", color: "oklch(10% 0 0)" }}
                disabled={saveConfigMutation.isPending}
                onClick={() => saveConfigMutation.mutate({
                  researchStyle: { outputStyle: selectedOutputStyle, analysisEmphasis: selectedEmphasis },
                } as any)}>
                {saveConfigMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                <span className="ml-1">保存</span>
              </Button>
            </div>
            {/* 输出风格选择 */}
            <div className="rounded-2xl p-4 space-y-3" style={{ background: "oklch(100% 0 0 / 0.04)", border: "1px solid var(--bloomberg-border)" }}>
              <div className="flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5" style={{ color: "var(--bloomberg-gold)" }} />
                <span className="text-xs font-semibold" style={{ color: "var(--bloomberg-text-primary)" }}>输出风格</span>
              </div>
              {[
                { id: "decisive", label: "决断性", desc: "直接给出明确结论和行动建议，适合决策场景", icon: "⚡" },
                { id: "directional", label: "方向性", desc: "给出倾向性判断，保留不确定性，适合研究场景", icon: "🧭" },
                { id: "framework_only", label: "框架性", desc: "提供分析框架和多角度视角，适合学习场景", icon: "🗺" },
              ].map(({ id, label, desc, icon }) => (
                <div key={id}
                  onClick={() => setSelectedOutputStyle(id)}
                  className="flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all hover:opacity-90"
                  style={{
                    background: selectedOutputStyle === id ? "oklch(0.72 0.18 75 / 0.1)" : "oklch(100% 0 0 / 0.04)",
                    border: `1px solid ${selectedOutputStyle === id ? "var(--bloomberg-gold)" : "var(--bloomberg-border)"}`,
                  }}>
                  <span className="text-lg">{icon}</span>
                  <div className="flex-1">
                    <div className="text-xs font-semibold" style={{ color: "oklch(0.82 0.005 264)" }}>{label}</div>
                    <div className="text-xs mt-0.5" style={{ color: "oklch(40% 0 0)" }}>{desc}</div>
                  </div>
                  <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5"
                    style={{ color: selectedOutputStyle === id ? "var(--bloomberg-gold)" : "oklch(25% 0 0)" }} />
                </div>
              ))}
            </div>
            {/* 分析重点偏好（多选） */}
            <div className="rounded-2xl p-4 space-y-3" style={{ background: "oklch(100% 0 0 / 0.04)", border: "1px solid var(--bloomberg-border)" }}>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5" style={{ color: "var(--bloomberg-gold)" }} />
                <span className="text-xs font-semibold" style={{ color: "var(--bloomberg-text-primary)" }}>分析重点偏好（可多选）</span>
              </div>
              {[
                { id: "valuation", label: "估値为主", desc: "重点分析 DCF、PE、PB 等估値指标" },
                { id: "business", label: "业务为主", desc: "重点分析商业模式、护城河、竞争格局" },
                { id: "risk", label: "风险为主", desc: "重点识别风险因素和下行场景" },
                { id: "macro", label: "宏观为主", desc: "重点分析宏观环境对企业的影响" },
              ].map(({ id, label, desc }) => {
                const isOn = selectedEmphasis.includes(id);
                return (
                  <div key={id}
                    onClick={() => setSelectedEmphasis(prev =>
                      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
                    )}
                    className="flex items-center justify-between py-2 px-3 rounded-lg cursor-pointer transition-all"
                    style={{ background: isOn ? "oklch(0.72 0.18 75 / 0.07)" : "oklch(100% 0 0 / 0.03)", border: `1px solid ${isOn ? "var(--bloomberg-gold)" : "var(--bloomberg-border)"}` }}>
                    <div>
                      <div className="text-xs font-medium" style={{ color: "oklch(0.82 0.005 264)" }}>{label}</div>
                      <div className="text-xs" style={{ color: "oklch(40% 0 0)" }}>{desc}</div>
                    </div>
                    <div className="w-8 h-4 rounded-full relative transition-all"
                      style={{ background: isOn ? "var(--bloomberg-gold)" : "oklch(25% 0 0)" }}>
                      <div className="w-3 h-3 rounded-full absolute top-0.5 transition-all"
                        style={{ background: "white", left: isOn ? "calc(100% - 14px)" : "2px" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── AI 记忆管理组件 ─────────────────────────────────────────────────────────────
type MemoryType = "preference" | "workflow" | "watchlist" | "analysis" | "all";

interface MemoryItem {
  id: number;
  userId: number;
  taskTitle: string | null;
  summary: string | null;
  memoryType: string | null;
  keywords: string | null;
  importance: number | null;
  conversationId: number | null;
  expiresAt: Date | null;
  createdAt: Date | null;
}

const MEMORY_TYPE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  preference: { label: "偏好", color: "oklch(0.72 0.18 142)", bg: "oklch(0.72 0.18 142 / 0.12)" },
  workflow: { label: "工作流", color: "oklch(0.65 0.15 250)", bg: "oklch(0.65 0.15 250 / 0.12)" },
  watchlist: { label: "关注列表", color: "oklch(0.72 0.18 50)", bg: "oklch(0.72 0.18 50 / 0.12)" },
  analysis: { label: "分析结论", color: "oklch(0.70 0.18 300)", bg: "oklch(0.70 0.18 300 / 0.12)" },
};

function MemoryManager() {
  const [filterType, setFilterType] = useState<MemoryType>("all");
  const [searchText, setSearchText] = useState("");
  const [semanticQuery, setSemanticQuery] = useState(""); // 已提交的语义搜索词
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editSummary, setEditSummary] = useState("");
  const [editKeywords, setEditKeywords] = useState("");
  const [editImportance, setEditImportance] = useState(3);
  const [sortBy, setSortBy] = useState<"time" | "importance">("time"); // 排序方式
  const utils = trpc.useUtils();
  const { data: memories = [], isLoading } = trpc.memory.list.useQuery(
    { limit: 100, memoryType: filterType },
    { refetchOnWindowFocus: false, enabled: !semanticQuery }
  );
  // 语义搜索查询（仅在用户按 Enter 或点击搜索时触发）
  const { data: semanticResults = [], isFetching: isSearching } = trpc.memory.search.useQuery(
    { query: semanticQuery, limit: 30 },
    { refetchOnWindowFocus: false, enabled: !!semanticQuery }
  );
  // 当前展示的记忆列表：语义搜索结果 or 普通列表
  const rawMemories = semanticQuery
    ? (semanticResults as unknown as MemoryItem[])
    : (memories as MemoryItem[]);
  // 按时间或重要性排序
  const displayMemories = [...rawMemories].sort((a, b) => {
    if (sortBy === "importance") {
      const ia = a.importance ?? 3;
      const ib = b.importance ?? 3;
      if (ib !== ia) return ib - ia; // 重要性降序
    }
    // 默认按时间降序
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });
  // 导出功能
  const handleExportJSON = () => {
    const data = displayMemories.map(m => ({
      id: m.id,
      taskTitle: m.taskTitle,
      summary: m.summary,
      keywords: m.keywords,
      memoryType: m.memoryType,
      importance: m.importance,
      createdAt: m.createdAt,
      expiresAt: m.expiresAt,
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-memory-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`已导出 ${data.length} 条记忆（JSON）`);
  };
  const handleExportCSV = () => {
    const headers = ["ID", "任务标题", "摘要", "关键词", "类型", "创建时间", "过期时间"];
    const rows = displayMemories.map(m => [
      m.id,
      `"${(m.taskTitle ?? "").replace(/"/g, '""')}"`,
      `"${(m.summary ?? "").replace(/"/g, '""')}"`,
      `"${(m.keywords ?? "").replace(/"/g, '""')}"`,
      m.memoryType ?? "",
      m.createdAt ? new Date(m.createdAt).toLocaleString("zh-CN") : "",
      m.expiresAt ? new Date(m.expiresAt).toLocaleString("zh-CN") : "",
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-memory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`已导出 ${rows.length} 条记忆（CSV）`);
  };

  const deleteMutation = trpc.memory.delete.useMutation({
    onSuccess: () => {
      utils.memory.list.invalidate();
      toast.success("记忆已删除");
    },
    onError: () => toast.error("删除失败"),
  });

  const deleteBatchMutation = trpc.memory.deleteBatch.useMutation({
    onSuccess: (data) => {
      utils.memory.list.invalidate();
      setSelectedIds(new Set());
      toast.success(`已删除 ${data.deletedCount} 条记忆`);
    },
    onError: () => toast.error("批量删除失败"),
  });

  const updateMutation = trpc.memory.update.useMutation({
    onSuccess: () => {
      utils.memory.list.invalidate();
      setEditingId(null);
      toast.success("记忆已更新");
    },
    onError: () => toast.error("更新失败"),
  });

    const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === displayMemories.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayMemories.map(m => m.id)));
    }
  };
  const handleSemanticSearch = () => {
    const q = searchText.trim();
    if (q) {
      setSemanticQuery(q);
    } else {
      setSemanticQuery("");
    }
  };
  const clearSearch = () => {
    setSearchText("");
    setSemanticQuery("");
  };

  const startEdit = (m: MemoryItem) => {
    setEditingId(m.id);
    setEditSummary(m.summary ?? "");
    setEditKeywords(m.keywords ?? "");
    setEditImportance(m.importance ?? 3);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditSummary("");
    setEditKeywords("");
    setEditImportance(3);
  };

  const saveEdit = (id: number) => {
    updateMutation.mutate({ id, summary: editSummary, keywords: editKeywords, importance: editImportance });
  };

  const typeFilters: { id: MemoryType; label: string }[] = [
    { id: "all", label: "全部" },
    { id: "preference", label: "偏好" },
    { id: "workflow", label: "工作流" },
    { id: "watchlist", label: "关注列表" },
    { id: "analysis", label: "分析结论" },
  ];

  return (
    <div className="space-y-4">
      {/* 标题区 */}
      <div className="p-4 rounded-2xl"
        style={{ background: "oklch(100% 0 0 / 0.04)", border: "1px solid oklch(100% 0 0 / 0.1)" }}>
        <div className="flex items-center gap-2 mb-1">
          <BookOpen className="w-4 h-4" style={{ color: "oklch(0.65 0.15 250)" }} />
          <h2 className="text-sm font-semibold" style={{ color: "oklch(92% 0 0)" }}>AI 记忆管理</h2>
          <span className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: "oklch(0.65 0.15 250 / 0.15)", color: "oklch(0.65 0.15 250)" }}>
            {(memories as MemoryItem[]).length} 条
          </span>
        </div>
        <p className="text-xs" style={{ color: "oklch(42% 0 0)" }}>
          AI 在对话中自动提取并存储的长期记忆，包括你的投资偏好、常用工作流、关注标的和分析结论。你可以在此查看、编辑或删除这些记忆。
        </p>
      </div>

      {/* 过滤栏 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 p-1 rounded-xl"
          style={{ background: "oklch(100% 0 0 / 0.05)", border: "1px solid oklch(100% 0 0 / 0.08)" }}>
          <Filter className="w-3 h-3 ml-1" style={{ color: "oklch(42% 0 0)" }} />
          {typeFilters.map(f => (
            <button key={f.id}
              onClick={() => setFilterType(f.id)}
              className="text-xs px-2.5 py-1 rounded-lg transition-all"
              style={{
                background: filterType === f.id ? "oklch(0.65 0.15 250 / 0.2)" : "transparent",
                color: filterType === f.id ? "oklch(0.75 0.15 250)" : "oklch(42% 0 0)",
                fontWeight: filterType === f.id ? 600 : 400,
              }}>
              {f.label}
            </button>
          ))}
        </div>

        {/* 语义搜索框 */}
        <div className="flex items-center gap-1.5 flex-1 min-w-[160px] px-2.5 py-1.5 rounded-xl"
          style={{
            background: semanticQuery ? "oklch(0.65 0.15 250 / 0.08)" : "oklch(100% 0 0 / 0.05)",
            border: `1px solid ${semanticQuery ? "oklch(0.65 0.15 250 / 0.35)" : "oklch(100% 0 0 / 0.08)"}`,
          }}>
          {isSearching
            ? <Loader2 className="w-3 h-3 flex-shrink-0 animate-spin" style={{ color: "oklch(0.65 0.15 250)" }} />
            : <Search className="w-3 h-3 flex-shrink-0" style={{ color: semanticQuery ? "oklch(0.65 0.15 250)" : "oklch(42% 0 0)" }} />
          }
          <input
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSemanticSearch(); }}
            placeholder="语义搜索（按 Enter 触发）..."
            className="flex-1 bg-transparent text-xs outline-none"
            style={{ color: "oklch(82% 0 0)", minWidth: 0 }}
          />
          {semanticQuery && (
            <span className="text-xs flex-shrink-0 px-1.5 py-0.5 rounded"
              style={{ background: "oklch(0.65 0.15 250 / 0.15)", color: "oklch(0.65 0.15 250)" }}>
              AI 搜索
            </span>
          )}
          {(searchText || semanticQuery) && (
            <button onClick={clearSearch} title="清除搜索">
              <X className="w-3 h-3" style={{ color: "oklch(42% 0 0)" }} />
            </button>
          )}
        </div>
        {/* 排序按鈕 */}
        <div className="flex items-center gap-1 p-1 rounded-xl"
          style={{ background: "oklch(100% 0 0 / 0.05)", border: "1px solid oklch(100% 0 0 / 0.08)" }}>
          <button
            onClick={() => setSortBy("time")}
            className="text-xs px-2.5 py-1 rounded-lg transition-all"
            style={{
              background: sortBy === "time" ? "oklch(0.65 0.15 250 / 0.2)" : "transparent",
              color: sortBy === "time" ? "oklch(0.75 0.15 250)" : "oklch(42% 0 0)",
              fontWeight: sortBy === "time" ? 600 : 400,
            }}>
            最新
          </button>
          <button
            onClick={() => setSortBy("importance")}
            className="text-xs px-2.5 py-1 rounded-lg transition-all"
            style={{
              background: sortBy === "importance" ? "oklch(0.72 0.18 50 / 0.2)" : "transparent",
              color: sortBy === "importance" ? "oklch(0.80 0.18 50)" : "oklch(42% 0 0)",
              fontWeight: sortBy === "importance" ? 600 : 400,
            }}>
            重要性
          </button>
        </div>
        {/* 导出按鈕 */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleExportJSON}
            disabled={displayMemories.length === 0}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-xl transition-all"
            title="导出 JSON"
            style={{ background: "oklch(100% 0 0 / 0.05)", color: "var(--bloomberg-text-tertiary)", border: "1px solid oklch(100% 0 0 / 0.08)" }}>
            <Download className="w-3 h-3" />
            JSON
          </button>
          <button
            onClick={handleExportCSV}
            disabled={displayMemories.length === 0}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-xl transition-all"
            title="导出 CSV"
            style={{ background: "oklch(100% 0 0 / 0.05)", color: "var(--bloomberg-text-tertiary)", border: "1px solid oklch(100% 0 0 / 0.08)" }}>
            <Download className="w-3 h-3" />
            CSV
          </button>
        </div>
        {/* 批量删除 */}
        {selectedIds.size > 0 && (
          <button
            onClick={() => deleteBatchMutation.mutate({ ids: Array.from(selectedIds) })}
            disabled={deleteBatchMutation.isPending}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl transition-all"
            style={{ background: "oklch(0.65 0.18 20 / 0.15)", color: "oklch(0.72 0.18 20)", border: "1px solid oklch(0.65 0.18 20 / 0.3)" }}>
            {deleteBatchMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            删除所选 ({selectedIds.size})
          </button>
        )}
      </div>

      {/* 记忆列表 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 gap-2">
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: "oklch(42% 0 0)" }} />
          <span className="text-xs" style={{ color: "oklch(42% 0 0)" }}>加载记忆中...</span>
        </div>
      ) : displayMemories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <BookOpen className="w-10 h-10" style={{ color: "oklch(28% 0 0)" }} />
          <p className="text-sm" style={{ color: "oklch(42% 0 0)" }}>
            {semanticQuery ? `未找到与「${semanticQuery}」相关的记忆` : "暂无 AI 记忆，开始对话后自动生成"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* 全选行 */}
          <div className="flex items-center gap-2 px-1">
            <input
              type="checkbox"
               checked={selectedIds.size === displayMemories.length && displayMemories.length > 0}
              onChange={toggleSelectAll}
              className="w-3.5 h-3.5 rounded accent-blue-500"
            />
            <span className="text-xs" style={{ color: "oklch(42% 0 0)" }}>
              {selectedIds.size > 0 ? `已选 ${selectedIds.size} 条` : `共 ${displayMemories.length} 条`}
            </span>
          </div>
          {displayMemories.map((m: MemoryItem) => {
            const typeInfo = MEMORY_TYPE_LABELS[m.memoryType ?? ""];
            const isEditing = editingId === m.id;
            const isSelected = selectedIds.has(m.id);
            return (
              <div key={m.id}
                className="p-3 rounded-2xl transition-all"
                style={{
                  background: isSelected ? "oklch(0.65 0.15 250 / 0.08)" : "oklch(100% 0 0 / 0.04)",
                  border: `1px solid ${isSelected ? "oklch(0.65 0.15 250 / 0.3)" : "oklch(100% 0 0 / 0.08)"}`,
                }}>
                <div className="flex items-start gap-2.5">
                  {/* 复选框 */}
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(m.id)}
                    className="w-3.5 h-3.5 rounded mt-0.5 flex-shrink-0 accent-blue-500"
                  />

                  <div className="flex-1 min-w-0">
                    {/* 标题行 */}
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      {typeInfo && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0"
                          style={{ background: typeInfo.bg, color: typeInfo.color }}>
                          {typeInfo.label}
                        </span>
                      )}
                      {/* 重要性星级 */}
                      {m.importance != null && (
                        <span className="flex items-center gap-0.5 flex-shrink-0" title={`重要性 ${m.importance}/5`}>
                          {[1,2,3,4,5].map(i => (
                            <span key={i} className="text-xs"
                              style={{ color: i <= (m.importance ?? 0) ? "oklch(0.80 0.18 50)" : "oklch(25% 0 0)" }}>
                              ★
                            </span>
                          ))}
                        </span>
                      )}
                      <span className="text-xs font-medium truncate" style={{ color: "var(--bloomberg-text-primary)" }}>
                        {m.taskTitle ?? "未命名任务"}
                      </span>
                      <span className="text-xs ml-auto flex-shrink-0" style={{ color: "oklch(35% 0 0)" }}>
                        {m.createdAt ? new Date(m.createdAt).toLocaleDateString("zh-CN") : ""}
                      </span>
                    </div>

                    {/* 摘要 */}
                    {isEditing ? (
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs mb-1 block" style={{ color: "var(--bloomberg-text-tertiary)" }}>摘要</label>
                          <textarea
                            value={editSummary}
                            onChange={e => setEditSummary(e.target.value)}
                            rows={4}
                            className="w-full text-xs p-2 rounded-lg resize-none outline-none"
                            style={{
                              background: "oklch(100% 0 0 / 0.06)",
                              border: "1px solid oklch(0.65 0.15 250 / 0.4)",
                              color: "var(--bloomberg-text-primary)",
                            }}
                          />
                        </div>
                        <div>
                          <label className="text-xs mb-1 block" style={{ color: "var(--bloomberg-text-tertiary)" }}>关键词（逗号分隔）</label>
                          <input
                            value={editKeywords}
                            onChange={e => setEditKeywords(e.target.value)}
                            className="w-full text-xs p-2 rounded-lg outline-none"
                            style={{
                              background: "oklch(100% 0 0 / 0.06)",
                              border: "1px solid oklch(0.65 0.15 250 / 0.4)",
                              color: "var(--bloomberg-text-primary)",
                            }}
                          />
                        </div>
                        <div>
                          <label className="text-xs mb-1 block" style={{ color: "var(--bloomberg-text-tertiary)" }}>重要性（1-5）</label>
                          <div className="flex items-center gap-2">
                            {[1,2,3,4,5].map(i => (
                              <button key={i}
                                type="button"
                                onClick={() => setEditImportance(i)}
                                className="text-base transition-all"
                                style={{ color: i <= editImportance ? "oklch(0.80 0.18 50)" : "oklch(30% 0 0)" }}>
                                ★
                              </button>
                            ))}
                            <span className="text-xs" style={{ color: "oklch(42% 0 0)" }}>
                              {["",'\u4e00般','\u6709用','\u91cd要','\u5f88重要','\u6838心'][editImportance]}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveEdit(m.id)}
                            disabled={updateMutation.isPending}
                            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg"
                            style={{ background: "oklch(0.65 0.15 250 / 0.2)", color: "oklch(0.75 0.15 250)" }}>
                            {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                            保存
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg"
                            style={{ background: "oklch(100% 0 0 / 0.06)", color: "oklch(42% 0 0)" }}>
                            <X className="w-3 h-3" /> 取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-xs leading-relaxed mb-1.5" style={{ color: "oklch(65% 0 0)" }}>
                          {m.summary ?? "无摘要"}
                        </p>
                        {m.keywords && (
                          <div className="flex flex-wrap gap-1 mb-1.5">
                            {m.keywords.split(/[,，]/).filter(Boolean).map((kw, i) => (
                              <span key={i} className="text-xs px-1.5 py-0.5 rounded"
                                style={{ background: "oklch(100% 0 0 / 0.06)", color: "var(--bloomberg-text-tertiary)" }}>
                                {kw.trim()}
                              </span>
                            ))}
                          </div>
                        )}
                        {m.expiresAt && (
                          <p className="text-xs" style={{ color: "var(--bloomberg-text-dim)" }}>
                            过期：{new Date(m.expiresAt).toLocaleDateString("zh-CN")}
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  {/* 操作按钮 */}
                  {!isEditing && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => startEdit(m)}
                        className="p-1.5 rounded-lg transition-opacity hover:opacity-80"
                        title="编辑"
                        style={{ background: "oklch(100% 0 0 / 0.06)" }}>
                        <Edit3 className="w-3.5 h-3.5" style={{ color: "var(--bloomberg-text-tertiary)" }} />
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate({ id: m.id })}
                        disabled={deleteMutation.isPending && deleteMutation.variables?.id === m.id}
                        className="p-1.5 rounded-lg transition-opacity hover:opacity-80"
                        title="删除"
                        style={{ background: "oklch(0.65 0.18 20 / 0.1)" }}>
                        {deleteMutation.isPending && deleteMutation.variables?.id === m.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "oklch(0.65 0.18 20)" }} />
                          : <Trash2 className="w-3.5 h-3.5" style={{ color: "oklch(0.65 0.18 20)" }} />}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
