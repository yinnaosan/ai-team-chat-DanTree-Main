/**
 * FactorBacktest.tsx
 * 因子回测页面：选择技术因子 + 输入股票代码 + 运行回测 + 展示净值曲线/指标卡片
 */
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Target,
  BarChart2,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  FlaskConical,
  Info,
  ChevronLeft,
} from "lucide-react";

// ─── 类型 ──────────────────────────────────────────────────────────────────

interface BacktestMetrics {
  totalReturn: number;
  benchmarkReturn: number;
  annualizedReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  winRate: number;
  totalTrades: number;
  profitableTrades: number;
  avgHoldingDays: number;
  calmarRatio: number;
  volatility: number;
  alpha: number;
}

interface BacktestDailyResult {
  date: string;
  timestamp: number;
  close: number;
  factorValue: number;
  signal: 1 | -1 | 0;
  portfolioValue: number;
  benchmarkValue: number;
  position: number;
}

interface BacktestTrade {
  date: string;
  type: "buy" | "sell";
  price: number;
  shares: number;
  value: number;
  pnl?: number;
}

interface BacktestResult {
  ticker: string;
  factorId: string;
  factorName: string;
  period: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  finalCapital: number;
  metrics: BacktestMetrics;
  dailyResults: BacktestDailyResult[];
  trades: BacktestTrade[];
  dataSource: "polygon" | "yahoo";
  barsCount: number;
}

// ─── 辅助函数 ──────────────────────────────────────────────────────────────

function formatPct(v: number, decimals = 2) {
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(decimals)}%`;
}

function formatMoney(v: number) {
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ─── 指标卡片 ──────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  positive,
  icon: Icon,
  tooltip,
}: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
  icon?: React.ElementType;
  tooltip?: string;
}) {
  const color =
    positive === undefined
      ? "text-foreground"
      : positive
      ? "text-emerald-500"
      : "text-red-500";
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          {Icon && (
            <div className={`shrink-0 p-2 rounded-lg bg-muted/50`}>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── 净值曲线图 ──────────────────────────────────────────────────────────────

function EquityCurveChart({ dailyResults }: { dailyResults: BacktestDailyResult[] }) {
  const initialValue = dailyResults[0]?.portfolioValue ?? 1_000_000;

  const chartData = useMemo(
    () =>
      dailyResults
        .filter((_, i) => i % Math.max(1, Math.floor(dailyResults.length / 200)) === 0)
        .map((d) => ({
          date: formatDate(d.date),
          fullDate: d.date,
          strategy: parseFloat(((d.portfolioValue / initialValue - 1) * 100).toFixed(2)),
          benchmark: parseFloat(((d.benchmarkValue / initialValue - 1) * 100).toFixed(2)),
          signal: d.signal,
        })),
    [dailyResults, initialValue]
  );

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border rounded-lg p-3 shadow-lg text-xs">
        <p className="font-medium mb-1">{payload[0]?.payload?.fullDate || label}</p>
        {payload.map((p: any) => (
          <p key={p.dataKey} style={{ color: p.color }}>
            {p.name}: {formatPct(p.value)}
          </p>
        ))}
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--bloomberg-border-dim)" opacity={0.5} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "var(--bloomberg-text-dim)" }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--bloomberg-text-dim)" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          formatter={(value) =>
            value === "strategy" ? "因子策略" : "基准（买入持有）"
          }
          wrapperStyle={{ fontSize: 12 }}
        />
        <ReferenceLine y={0} stroke="var(--bloomberg-border-dim)" strokeDasharray="4 4" />
        <Line
          type="monotone"
          dataKey="strategy"
          stroke="oklch(78% 0.18 75)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
          name="strategy"
        />
        <Line
          type="monotone"
          dataKey="benchmark"
          stroke="var(--bloomberg-text-tertiary)"
          strokeWidth={1.5}
          strokeDasharray="5 3"
          dot={false}
          name="benchmark"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── 交易记录表 ──────────────────────────────────────────────────────────────

function TradeTable({ trades }: { trades: BacktestTrade[] }) {
  if (trades.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
        <Activity className="h-8 w-8 opacity-40" />
        <p className="text-sm">回测期间未产生交易信号</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 px-3 text-muted-foreground font-medium">日期</th>
            <th className="text-left py-2 px-3 text-muted-foreground font-medium">操作</th>
            <th className="text-right py-2 px-3 text-muted-foreground font-medium">价格</th>
            <th className="text-right py-2 px-3 text-muted-foreground font-medium">股数</th>
            <th className="text-right py-2 px-3 text-muted-foreground font-medium">金额</th>
            <th className="text-right py-2 px-3 text-muted-foreground font-medium">盈亏</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t, i) => (
            <tr key={i} className="border-b hover:bg-muted/30 transition-colors">
              <td className="py-2 px-3 text-muted-foreground">{t.date}</td>
              <td className="py-2 px-3">
                <Badge
                  variant={t.type === "buy" ? "default" : "secondary"}
                  className={
                    t.type === "buy"
                      ? "bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/20"
                      : "bg-red-500/15 text-red-600 hover:bg-red-500/20"
                  }
                >
                  {t.type === "buy" ? "买入" : "卖出"}
                </Badge>
              </td>
              <td className="py-2 px-3 text-right font-mono">{t.price.toFixed(2)}</td>
              <td className="py-2 px-3 text-right font-mono">{t.shares.toLocaleString()}</td>
              <td className="py-2 px-3 text-right font-mono">{formatMoney(t.value)}</td>
              <td className="py-2 px-3 text-right font-mono">
                {t.pnl !== undefined ? (
                  <span className={t.pnl >= 0 ? "text-emerald-500" : "text-red-500"}>
                    {formatPct((t.pnl / (t.value - t.pnl)) * 100)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── 因子说明卡片 ──────────────────────────────────────────────────────────────

const FACTOR_DESCRIPTIONS: Record<string, { logic: string; bestFor: string; risk: string }> = {
  macd: {
    logic: "计算 12/26 日 EMA 差值（MACD 线）与 9 日信号线。金叉（MACD 上穿信号线）买入，死叉卖出。",
    bestFor: "趋势明显的牛市行情，适合中长期趋势跟踪",
    risk: "震荡行情中频繁假信号，可能导致连续小额亏损",
  },
  rsi: {
    logic: "计算 14 日相对强弱指数。RSI 从超卖区（<30）回升买入，从超买区（>70）回落卖出。",
    bestFor: "震荡行情中的均值回归策略，适合区间震荡标的",
    risk: "强趋势行情中 RSI 长期超买/超卖，可能错过主升浪",
  },
  bollinger: {
    logic: "20 日均线 ±2 倍标准差构建通道。价格从下轨反弹买入，从上轨回落卖出。",
    bestFor: "波动率适中的标的，适合识别极端偏离后的均值回归",
    risk: "趋势突破时价格可能沿轨道持续运行，产生较大亏损",
  },
  ma_cross: {
    logic: "5 日与 20 日简单移动均线交叉。5 日线上穿 20 日线（金叉）买入，下穿（死叉）卖出。",
    bestFor: "趋势跟踪的经典策略，参数简单，适合初学者理解",
    risk: "滞后性较强，入场和出场均有延迟，震荡行情损耗大",
  },
  momentum: {
    logic: "计算 20 日价格动量（当前价/20 日前价 - 1）。动量从负转正买入，从正转负卖出。",
    bestFor: "强趋势延续行情，适合捕捉板块轮动和动量效应",
    risk: "动量反转时损失较大，不适合高波动或均值回归标的",
  },
  kdj: {
    logic: "9 日随机指标 KDJ。低位（K<50）金叉买入，高位（K>50）死叉卖出。",
    bestFor: "短中期波段操作，适合识别超买超卖区域的转折点",
    risk: "在强趋势中 K 值长期维持高位，可能过早卖出",
  },
};

// ─── 主页面 ──────────────────────────────────────────────────────────────────

const POPULAR_TICKERS = [
  { ticker: "AAPL", name: "苹果" },
  { ticker: "NVDA", name: "英伟达" },
  { ticker: "TSLA", name: "特斯拉" },
  { ticker: "SPY", name: "标普500 ETF" },
  { ticker: "000300.SS", name: "沪深300" },
  { ticker: "^HSI", name: "恒生指数" },
];

export default function FactorBacktest() {
  const [, navigate] = useLocation();
  const [ticker, setTicker] = useState("AAPL");
  const [factorId, setFactorId] = useState<"macd" | "rsi" | "bollinger" | "ma_cross" | "momentum" | "kdj">("macd");
  const [period, setPeriod] = useState<"6mo" | "1y" | "2y">("1y");
  const [result, setResult] = useState<BacktestResult | null>(null);

  // 获取因子列表
  const { data: factors = [] } = trpc.backtest.getFactors.useQuery();

  // 回测 mutation
  const backtestMutation = trpc.backtest.factorRun.useMutation({
    onSuccess: (data) => {
      setResult(data as unknown as BacktestResult);
      toast.success(`回测完成：${data.ticker} × ${data.factorName}，共 ${data.barsCount} 个交易日`);
    },
    onError: (err) => {
      toast.error(`回测失败：${err.message}`);
    },
  });

  const handleRun = () => {
    if (!ticker.trim()) {
      toast.error("请输入股票代码");
      return;
    }
    backtestMutation.mutate({ ticker: ticker.trim().toUpperCase(), factorId, period });
  };

  const selectedFactor = factors.find((f) => f.id === factorId);
  const factorDesc = FACTOR_DESCRIPTIONS[factorId as string];
  const m = result?.metrics;

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-8">
      {/* 返回按钮 */}
      <button
        onClick={() => navigate('/research')}
        className="flex items-center gap-1.5 text-sm transition-all hover:opacity-80 group"
        style={{ color: 'oklch(0.78 0.18 85)' }}
      >
        <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
        返回研究工作台
      </button>
      {/* 页面标题 */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <FlaskConical className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">因子回测</h1>
          <p className="text-sm text-muted-foreground">
            基于技术因子的历史策略回测，数据来源 Polygon.io / Yahoo Finance
          </p>
        </div>
      </div>

      {/* 参数配置区 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">配置回测参数</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 股票代码 */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">股票/指数代码</label>
              <Input
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="如 AAPL, 000300.SS"
                className="font-mono"
                onKeyDown={(e) => e.key === "Enter" && handleRun()}
              />
              <div className="flex flex-wrap gap-1 mt-1">
                {POPULAR_TICKERS.map((t) => (
                  <button
                    key={t.ticker}
                    onClick={() => setTicker(t.ticker)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                      ticker === t.ticker
                        ? "bg-primary text-primary-foreground border-primary"
                        : "hover:bg-muted border-border"
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>

            {/* 因子选择 */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">技术因子</label>
              <Select value={factorId} onValueChange={(v) => setFactorId(v as "macd" | "rsi" | "bollinger" | "ma_cross" | "momentum" | "kdj")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {factors.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      <span className="font-mono text-xs mr-2 text-muted-foreground">
                        [{f.shortName}]
                      </span>
                      {f.name.split("（")[0]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedFactor && (
                <p className="text-xs text-muted-foreground">{selectedFactor.description}</p>
              )}
            </div>

            {/* 回测周期 */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">回测周期</label>
              <Select value={period} onValueChange={(v) => setPeriod(v as "6mo" | "1y" | "2y")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="6mo">近 6 个月</SelectItem>
                  <SelectItem value="1y">近 1 年</SelectItem>
                  <SelectItem value="2y">近 2 年</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 运行按钮 */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium opacity-0 select-none">运行</label>
              <Button
                onClick={handleRun}
                disabled={backtestMutation.isPending}
                className="w-full"
                size="default"
              >
                {backtestMutation.isPending ? (
                  <>
                    <span className="animate-spin mr-2">⟳</span>
                    回测中...
                  </>
                ) : (
                  <>
                    <FlaskConical className="h-4 w-4 mr-2" />
                    运行回测
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* 因子说明 */}
          {factorDesc && (
            <div className="mt-4 p-3 rounded-lg bg-muted/40 border border-border/50 text-xs space-y-1.5">
              <div className="flex items-start gap-2">
                <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p><span className="font-medium">策略逻辑：</span>{factorDesc.logic}</p>
                  <p><span className="font-medium text-emerald-600">适用场景：</span>{factorDesc.bestFor}</p>
                  <p><span className="font-medium text-amber-600">主要风险：</span>{factorDesc.risk}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 回测结果 */}
      {result && m && (
        <>
          {/* 结果摘要标题 */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">
                {result.ticker} × {result.factorName}
              </h2>
              <p className="text-xs text-muted-foreground">
                {result.startDate} → {result.endDate} · {result.barsCount} 个交易日 ·
                数据来源：{result.dataSource === "polygon" ? "Polygon.io" : "Yahoo Finance"}
              </p>
            </div>
            <Badge
              variant="outline"
              className={
                m.totalReturn >= m.benchmarkReturn
                  ? "border-emerald-500/50 text-emerald-600"
                  : "border-red-500/50 text-red-600"
              }
            >
              {m.totalReturn >= m.benchmarkReturn ? (
                <ArrowUpRight className="h-3 w-3 mr-1" />
              ) : (
                <ArrowDownRight className="h-3 w-3 mr-1" />
              )}
              Alpha {formatPct(m.alpha)}
            </Badge>
          </div>

          {/* 核心指标卡片 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard
              label="策略总收益"
              value={formatPct(m.totalReturn)}
              sub={`基准 ${formatPct(m.benchmarkReturn)}`}
              positive={m.totalReturn >= 0}
              icon={m.totalReturn >= 0 ? TrendingUp : TrendingDown}
            />
            <MetricCard
              label="年化收益"
              value={formatPct(m.annualizedReturn)}
              positive={m.annualizedReturn >= 0}
              icon={Activity}
            />
            <MetricCard
              label="最大回撤"
              value={`-${m.maxDrawdown.toFixed(1)}%`}
              positive={m.maxDrawdown < 15}
              icon={AlertTriangle}
            />
            <MetricCard
              label="夏普比率"
              value={m.sharpeRatio.toFixed(2)}
              sub="无风险利率 3%"
              positive={m.sharpeRatio >= 1}
              icon={Target}
            />
            <MetricCard
              label="胜率"
              value={`${m.winRate.toFixed(0)}%`}
              sub={`${m.profitableTrades}/${m.totalTrades / 2 | 0} 笔盈利`}
              positive={m.winRate >= 50}
              icon={BarChart2}
            />
            <MetricCard
              label="年化波动率"
              value={`${m.volatility.toFixed(1)}%`}
              positive={m.volatility < 25}
              icon={Activity}
            />
          </div>

          {/* 次要指标 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard
              label="卡玛比率"
              value={m.calmarRatio.toFixed(2)}
              sub="年化收益/最大回撤"
              positive={m.calmarRatio >= 0.5}
            />
            <MetricCard
              label="超额收益 (Alpha)"
              value={formatPct(m.alpha)}
              positive={m.alpha >= 0}
            />
            <MetricCard
              label="平均持仓天数"
              value={`${m.avgHoldingDays.toFixed(0)} 天`}
              sub={`共 ${m.totalTrades} 笔交易`}
            />
            <MetricCard
              label="最终资产"
              value={`¥${formatMoney(result.finalCapital)}`}
              sub={`初始 ¥${formatMoney(result.initialCapital)}`}
              positive={result.finalCapital >= result.initialCapital}
            />
          </div>

          {/* 详细图表 */}
          <Tabs defaultValue="curve">
            <TabsList>
              <TabsTrigger value="curve">净值曲线</TabsTrigger>
              <TabsTrigger value="trades">交易记录</TabsTrigger>
              <TabsTrigger value="drawdown">回撤分析</TabsTrigger>
            </TabsList>

            <TabsContent value="curve" className="mt-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">策略净值 vs 基准（买入持有）</CardTitle>
                  <CardDescription className="text-xs">
                    初始资金 ¥1,000,000，收益率基准为 0%
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <EquityCurveChart dailyResults={result.dailyResults} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="trades" className="mt-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    交易记录（共 {result.trades.length} 笔）
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <TradeTable trades={result.trades} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="drawdown" className="mt-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">每日回撤幅度</CardTitle>
                </CardHeader>
                <CardContent>
                  <DrawdownChart dailyResults={result.dailyResults} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* 风险提示 */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
            <p>
              回测结果仅供参考，历史表现不代表未来收益。本回测采用简化假设（无手续费、无滑点、全仓操作），
              实际交易中需考虑交易成本、流动性风险和仓位管理。技术因子策略不构成投资建议。
            </p>
          </div>
        </>
      )}

      {/* 空状态 */}
      {!result && !backtestMutation.isPending && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <div className="p-4 rounded-full bg-muted/50">
              <FlaskConical className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">选择因子和股票，开始回测</p>
              <p className="text-sm text-muted-foreground mt-1">
                支持美股（AAPL、NVDA）、A 股（000300.SS）、港股（^HSI）等全球主要市场
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {POPULAR_TICKERS.map((t) => (
                <Button
                  key={t.ticker}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTicker(t.ticker);
                  }}
                  className="text-xs"
                >
                  {t.name} ({t.ticker})
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── 回撤图 ──────────────────────────────────────────────────────────────────

function DrawdownChart({ dailyResults }: { dailyResults: BacktestDailyResult[] }) {
  const data = useMemo(() => {
    let peak = dailyResults[0]?.portfolioValue ?? 1;
    return dailyResults
      .filter((_, i) => i % Math.max(1, Math.floor(dailyResults.length / 200)) === 0)
      .map((d) => {
        if (d.portfolioValue > peak) peak = d.portfolioValue;
        const dd = ((peak - d.portfolioValue) / peak) * 100;
        return {
          date: formatDate(d.date),
          drawdown: -parseFloat(dd.toFixed(2)),
        };
      });
  }, [dailyResults]);

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--bloomberg-border-dim)" opacity={0.5} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "var(--bloomberg-text-dim)" }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--bloomberg-text-dim)" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          formatter={(v: number) => [`${v.toFixed(2)}%`, "回撤"]}
          contentStyle={{
            background: "var(--bloomberg-surface-2)",
            border: "1px solid var(--bloomberg-border)",
            borderRadius: "8px",
            fontSize: "12px",
          }}
        />
        <Bar dataKey="drawdown" name="回撤">
          {data.map((entry, index) => (
            <Cell
              key={index}
              fill={entry.drawdown < -10 ? "oklch(62% 0.22 25)" : "oklch(65% 0.20 155)"}
              opacity={0.7}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
