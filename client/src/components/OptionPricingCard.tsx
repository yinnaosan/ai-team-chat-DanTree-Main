/**
 * OptionPricingCard.tsx
 * 期权定价可视化卡片：Greeks 热力图 + 期权链表格
 * 解析 %%OPTION_PRICING%%{JSON}%%END_OPTION_PRICING%% 标记
 * 基于 domokane/FinancePy Black-Scholes 定价模型
 */

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Activity, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  BarChart,
  Bar,
  CartesianGrid,
  Legend,
} from "recharts";

// ── 类型定义 ──────────────────────────────────────────────────────────────────
interface OptionChainItem {
  label: string;
  type: "call" | "put";
  strike: number;
  moneyness: "ITM" | "ATM" | "OTM" | "Deep OTM";
  price: number;
  intrinsicValue: number;
  timeValue: number;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
}

interface StrategyItem {
  name: string;
  netPremium: number;
  maxProfit?: number | null;
  maxLoss?: number | null;
  breakEven: number[];
  outlook: string;
}

interface OptionPricingPayload {
  ticker: string;
  spotPrice: number;
  sigma: number;        // 年化波动率 %
  riskFreeRate: number; // 无风险利率 %
  daysToExpiry: number;
  optionChain: OptionChainItem[];
  strategies: StrategyItem[];
  generatedAt: number;
}

// ── 解析工具 ──────────────────────────────────────────────────────────────────
export function parseOptionPricing(text: string): { payload: OptionPricingPayload; rest: string } | null {
  const match = text.match(/%%OPTION_PRICING%%([\s\S]*?)%%END_OPTION_PRICING%%/);
  if (!match) return null;
  try {
    const payload = JSON.parse(match[1]) as OptionPricingPayload;
    const rest = text.replace(/%%OPTION_PRICING%%[\s\S]*?%%END_OPTION_PRICING%%\n?\n?/, "").trim();
    return { payload, rest };
  } catch {
    return null;
  }
}

// ── 颜色工具 ──────────────────────────────────────────────────────────────────
function getGreekColor(value: number, greek: string): string {
  if (greek === "delta") {
    if (value > 0.7) return "#10b981"; // 强正 Delta → 绿
    if (value > 0.3) return "#34d399";
    if (value > 0) return "#6ee7b7";
    if (value > -0.3) return "#fca5a5";
    if (value > -0.7) return "#f87171";
    return "#ef4444"; // 强负 Delta → 红
  }
  if (greek === "gamma") {
    const abs = Math.abs(value);
    if (abs > 0.01) return "#f59e0b"; // 高 Gamma → 橙
    if (abs > 0.005) return "#fbbf24";
    return "#fde68a";
  }
  if (greek === "vega") {
    if (value > 0.1) return "#8b5cf6"; // 高 Vega → 紫
    if (value > 0.05) return "#a78bfa";
    return "#c4b5fd";
  }
  if (greek === "theta") {
    if (value < -0.1) return "#ef4444"; // 高时间损耗 → 红
    if (value < -0.05) return "#f87171";
    return "#fca5a5";
  }
  return "#94a3b8";
}

function getMoneynessColor(moneyness: string): string {
  switch (moneyness) {
    case "ITM": return "text-emerald-400";
    case "ATM": return "text-amber-400";
    case "OTM": return "text-orange-400";
    case "Deep OTM": return "text-red-400/70";
    default: return "text-slate-400";
  }
}

// ── Greeks 热力图（散点图模拟热力图）────────────────────────────────────────
interface GreeksHeatmapProps {
  calls: OptionChainItem[];
  puts: OptionChainItem[];
  spotPrice: number;
}

function GreeksHeatmap({ calls, puts, spotPrice }: GreeksHeatmapProps) {
  const [activeGreek, setActiveGreek] = useState<"delta" | "gamma" | "vega" | "theta">("delta");

  const greekOptions = [
    { key: "delta" as const, label: "Delta", desc: "方向敏感度" },
    { key: "gamma" as const, label: "Gamma", desc: "Delta 变化率" },
    { key: "vega" as const, label: "Vega", desc: "波动率敏感度" },
    { key: "theta" as const, label: "Theta", desc: "时间价值损耗" },
  ];

  // 构建热力图数据：x=行权价, y=类型(call/put), z=Greek值
  const heatData = [
    ...calls.map(c => ({
      strike: c.strike,
      type: "Call",
      value: c[activeGreek],
      label: c.label,
      price: c.price,
      moneyness: c.moneyness,
    })),
    ...puts.map(p => ({
      strike: p.strike,
      type: "Put",
      value: p[activeGreek],
      label: p.label,
      price: p.price,
      moneyness: p.moneyness,
    })),
  ];

  // 构建柱状图数据：按行权价对比 Call vs Put Greeks
  const barData = calls.map((c, i) => ({
    strike: `$${c.strike}`,
    callValue: c[activeGreek],
    putValue: puts[i]?.strike === c.strike ? puts[i][activeGreek] : undefined,
    moneyness: c.moneyness,
  })).filter(d => d.putValue !== undefined);

  const callColor = activeGreek === "delta" ? "#10b981" :
    activeGreek === "gamma" ? "#f59e0b" :
    activeGreek === "vega" ? "#8b5cf6" : "#ef4444";
  const putColor = activeGreek === "delta" ? "#ef4444" :
    activeGreek === "gamma" ? "#fbbf24" :
    activeGreek === "vega" ? "#a78bfa" : "#f87171";

  return (
    <div className="space-y-3">
      {/* Greek 选择器 */}
      <div className="flex gap-1.5 flex-wrap">
        {greekOptions.map(g => (
          <button
            key={g.key}
            onClick={() => setActiveGreek(g.key)}
            className={cn(
              "px-2.5 py-1 rounded text-xs font-medium transition-all border",
              activeGreek === g.key
                ? "bg-white/15 border-white/30 text-foreground"
                : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
            )}
          >
            <span className="font-mono">{g.label}</span>
            <span className="ml-1 text-muted-foreground/60">{g.desc}</span>
          </button>
        ))}
      </div>

      {/* 柱状图：Call vs Put Greeks 对比 */}
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={barData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="strike"
              tick={{ fontSize: 10, fill: "rgba(148,163,184,0.7)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "rgba(148,163,184,0.7)" }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={{
                background: "rgba(10,10,20,0.95)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px",
                fontSize: "11px",
              }}
              formatter={(value: number, name: string) => [
                value.toFixed(4),
                name === "callValue" ? `Call ${activeGreek.charAt(0).toUpperCase() + activeGreek.slice(1)}` : `Put ${activeGreek.charAt(0).toUpperCase() + activeGreek.slice(1)}`,
              ]}
            />
            <Legend
              formatter={(value) => value === "callValue" ? "Call" : "Put"}
              wrapperStyle={{ fontSize: "11px", color: "rgba(148,163,184,0.8)" }}
            />
            <Bar dataKey="callValue" fill={callColor} opacity={0.85} radius={[2, 2, 0, 0]} />
            <Bar dataKey="putValue" fill={putColor} opacity={0.85} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 当前 Greek 说明 */}
      <div className="text-xs text-muted-foreground/50 px-1">
        {activeGreek === "delta" && "Delta：期权价格对标的资产价格变动的敏感度。Call Delta ∈ [0,1]，Put Delta ∈ [-1,0]"}
        {activeGreek === "gamma" && "Gamma：Delta 对标的资产价格变动的变化率。ATM 期权 Gamma 最大，到期日临近时急剧增大"}
        {activeGreek === "vega" && "Vega：期权价格对隐含波动率变动的敏感度（每 1% 波动率变化）。ATM 期权 Vega 最大"}
        {activeGreek === "theta" && "Theta：每日时间价值损耗（负值）。到期日临近时，ATM 期权 Theta 损耗加速"}
      </div>
    </div>
  );
}

// ── 期权链表格 ────────────────────────────────────────────────────────────────
function OptionChainTable({ items, type }: { items: OptionChainItem[]; type: "call" | "put" }) {
  const isCall = type === "call";
  const headerColor = isCall ? "text-emerald-400" : "text-red-400";

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/10">
            <th className={cn("text-left py-1.5 px-2 font-medium", headerColor)}>
              {isCall ? "看涨期权 (Call)" : "看跌期权 (Put)"}
            </th>
            <th className="text-right py-1.5 px-2 font-medium text-muted-foreground/70">行权价</th>
            <th className="text-right py-1.5 px-2 font-medium text-muted-foreground/70">BS 价格</th>
            <th className="text-right py-1.5 px-2 font-medium text-muted-foreground/70">内在价值</th>
            <th className="text-right py-1.5 px-2 font-medium text-muted-foreground/70">时间价值</th>
            <th className="text-right py-1.5 px-2 font-medium text-muted-foreground/70">Delta</th>
            <th className="text-right py-1.5 px-2 font-medium text-muted-foreground/70">Gamma</th>
            <th className="text-right py-1.5 px-2 font-medium text-muted-foreground/70">Vega</th>
            <th className="text-right py-1.5 px-2 font-medium text-muted-foreground/70">Theta</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr
              key={i}
              className={cn(
                "border-b border-white/5 hover:bg-white/5 transition-colors",
                item.moneyness === "ATM" && "bg-amber-500/5"
              )}
            >
              <td className="py-1.5 px-2">
                <span className={cn("font-medium", getMoneynessColor(item.moneyness))}>
                  {item.moneyness}
                </span>
              </td>
              <td className="text-right py-1.5 px-2 font-mono text-foreground/80">
                ${item.strike.toLocaleString()}
              </td>
              <td className="text-right py-1.5 px-2 font-mono text-foreground/90 font-medium">
                ${item.price.toFixed(2)}
              </td>
              <td className="text-right py-1.5 px-2 font-mono text-muted-foreground/70">
                ${item.intrinsicValue.toFixed(2)}
              </td>
              <td className="text-right py-1.5 px-2 font-mono text-muted-foreground/70">
                ${item.timeValue.toFixed(2)}
              </td>
              <td className="text-right py-1.5 px-2 font-mono" style={{ color: getGreekColor(item.delta, "delta") }}>
                {item.delta.toFixed(3)}
              </td>
              <td className="text-right py-1.5 px-2 font-mono" style={{ color: getGreekColor(item.gamma, "gamma") }}>
                {item.gamma.toFixed(5)}
              </td>
              <td className="text-right py-1.5 px-2 font-mono" style={{ color: getGreekColor(item.vega, "vega") }}>
                {item.vega.toFixed(3)}
              </td>
              <td className="text-right py-1.5 px-2 font-mono" style={{ color: getGreekColor(item.theta, "theta") }}>
                {item.theta.toFixed(3)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── 策略卡片 ──────────────────────────────────────────────────────────────────
function StrategyCard({ strategy }: { strategy: StrategyItem }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground/90">{strategy.name}</p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">{strategy.outlook}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs text-muted-foreground/60">净成本</p>
          <p className="text-sm font-mono font-bold text-amber-400">${strategy.netPremium}</p>
        </div>
      </div>
      <div className="flex gap-4 mt-2 text-xs">
        {strategy.maxLoss !== null && strategy.maxLoss !== undefined && (
          <div>
            <span className="text-muted-foreground/50">最大亏损</span>
            <span className="ml-1 font-mono text-red-400">${strategy.maxLoss}</span>
          </div>
        )}
        {strategy.maxProfit !== null && strategy.maxProfit !== undefined && (
          <div>
            <span className="text-muted-foreground/50">最大收益</span>
            <span className="ml-1 font-mono text-emerald-400">${strategy.maxProfit}</span>
          </div>
        )}
        {strategy.breakEven.length > 0 && (
          <div>
            <span className="text-muted-foreground/50">盈亏平衡</span>
            <span className="ml-1 font-mono text-foreground/70">
              {strategy.breakEven.map(b => `$${b}`).join(" / ")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────────────
type TabType = "heatmap" | "chain" | "strategy";

export default function OptionPricingCard({ payload }: { payload: OptionPricingPayload }) {
  const [activeTab, setActiveTab] = useState<TabType>("heatmap");
  const [expanded, setExpanded] = useState(true);

  const calls = payload.optionChain.filter(o => o.type === "call");
  const puts = payload.optionChain.filter(o => o.type === "put");

  const atmCall = calls.find(c => c.moneyness === "ATM");
  const atmPut = puts.find(p => p.moneyness === "ATM");

  const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: "heatmap", label: "Greeks 热力图", icon: <Activity className="w-3 h-3" /> },
    { key: "chain", label: "期权链", icon: <BarChart2 className="w-3 h-3" /> },
    { key: "strategy", label: "策略参考", icon: <TrendingUp className="w-3 h-3" /> },
  ];

  return (
    <Card className="my-3 border border-violet-500/20 bg-violet-500/5 overflow-hidden">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-violet-400" />
            <CardTitle className="text-sm font-semibold text-foreground/90">
              期权定价分析 — {payload.ticker}
            </CardTitle>
            <Badge variant="outline" className="text-xs px-1.5 py-0 text-violet-400 border-violet-500/30">
              FinancePy Black-Scholes
            </Badge>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-3">
        {/* 关键参数摘要 */}
        <div className="flex flex-wrap gap-3 mb-3">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground/60">现价</span>
            <span className="font-mono font-bold text-foreground/90">${payload.spotPrice.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground/60">波动率</span>
            <span className="font-mono font-bold text-amber-400">{payload.sigma}%</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground/60">到期</span>
            <span className="font-mono text-foreground/70">{payload.daysToExpiry}天</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground/60">无风险利率</span>
            <span className="font-mono text-foreground/70">{payload.riskFreeRate}%</span>
          </div>
          {atmCall && (
            <div className="flex items-center gap-1.5 text-xs">
              <TrendingUp className="w-3 h-3 text-emerald-400" />
              <span className="text-muted-foreground/60">ATM Call</span>
              <span className="font-mono text-emerald-400">${atmCall.price.toFixed(2)}</span>
              <span className="text-muted-foreground/40">Δ={atmCall.delta.toFixed(3)}</span>
            </div>
          )}
          {atmPut && (
            <div className="flex items-center gap-1.5 text-xs">
              <TrendingDown className="w-3 h-3 text-red-400" />
              <span className="text-muted-foreground/60">ATM Put</span>
              <span className="font-mono text-red-400">${atmPut.price.toFixed(2)}</span>
              <span className="text-muted-foreground/40">Δ={atmPut.delta.toFixed(3)}</span>
            </div>
          )}
        </div>

        {expanded && (
          <>
            {/* Tab 导航 */}
            <div className="flex gap-1 mb-3 border-b border-white/10 pb-2">
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                    activeTab === tab.key
                      ? "bg-violet-500/20 text-violet-300 border border-violet-500/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                  )}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab 内容 */}
            {activeTab === "heatmap" && (
              <GreeksHeatmap calls={calls} puts={puts} spotPrice={payload.spotPrice} />
            )}

            {activeTab === "chain" && (
              <div className="space-y-4">
                <OptionChainTable items={calls} type="call" />
                <div className="border-t border-white/10 pt-3">
                  <OptionChainTable items={puts} type="put" />
                </div>
              </div>
            )}

            {activeTab === "strategy" && (
              <div className="space-y-2">
                {payload.strategies.map((s, i) => (
                  <StrategyCard key={i} strategy={s} />
                ))}
                <p className="text-xs text-muted-foreground/40 px-1 pt-1 border-t border-white/5 mt-2">
                  基于 Black-Scholes 欧式期权定价模型（FinancePy），仅供参考，不构成投资建议
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
