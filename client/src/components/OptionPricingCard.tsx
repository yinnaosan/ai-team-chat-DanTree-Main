/**
 * OptionPricingCard.tsx
 * 期权定价可视化卡片：Greeks 热力图 + 期权链表格 + 策略参考 + 敏感度/Payoff 曲线 + IV Smile
 * 解析 %%OPTION_PRICING%%{JSON}%%END_OPTION_PRICING%% 标记
 * 基于 domokane/FinancePy Black-Scholes 定价模型
 */

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChevronDown, ChevronUp, TrendingUp, TrendingDown,
  Activity, BarChart2, LineChart as LineChartIcon, Smile,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, CartesianGrid, Legend,
  LineChart, Line, ReferenceLine, ComposedChart, Area,
} from "recharts";

// ── 类型定义 ──────────────────────────────────────────────────────────────────
export interface OptionChainItem {
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

export interface IVSmilePoint {
  strike: number;
  moneyness: number;   // strike / spot
  actualIV: number;    // 从 Polygon 实际价格反推（%）
  bsIV: number;        // Black-Scholes 理论 IV（%）
  type: "call" | "put";
  expiry?: string;
}

export interface OptionPricingPayload {
  ticker: string;
  spotPrice: number;
  sigma: number;        // 年化波动率 %
  riskFreeRate: number; // 无风险利率 %
  daysToExpiry: number;
  optionChain: OptionChainItem[];
  strategies: StrategyItem[];
  ivSmile?: IVSmilePoint[];  // 可选：IV Smile 数据（后端 Polygon 提供）
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
    if (value > 0.7) return "#10b981";
    if (value > 0.3) return "#34d399";
    if (value > 0) return "#6ee7b7";
    if (value > -0.3) return "#fca5a5";
    if (value > -0.7) return "#f87171";
    return "#ef4444";
  }
  if (greek === "gamma") {
    const abs = Math.abs(value);
    if (abs > 0.01) return "#f59e0b";
    if (abs > 0.005) return "#fbbf24";
    return "#fde68a";
  }
  if (greek === "vega") {
    if (value > 0.1) return "#8b5cf6";
    if (value > 0.05) return "#a78bfa";
    return "#c4b5fd";
  }
  if (greek === "theta") {
    if (value < -0.1) return "#ef4444";
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

// ── 纯前端 Black-Scholes 计算（用于生成敏感度曲线）────────────────────────────
function normCDF(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const t = 1 / (1 + p * Math.abs(x));
  const poly = t * (a1 + t * (a2 + t * (a3 + t * (a4 + t * a5))));
  return 0.5 * (1 + sign * (1 - poly * Math.exp(-x * x / 2)));
}

function normPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

interface BSResult {
  price: number;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
}

function bsCalc(S: number, K: number, T: number, r: number, sigma: number, type: "call" | "put"): BSResult {
  if (T <= 0 || sigma <= 0) {
    const intrinsic = type === "call" ? Math.max(S - K, 0) : Math.max(K - S, 0);
    return { price: intrinsic, delta: type === "call" ? (S > K ? 1 : 0) : (S < K ? -1 : 0), gamma: 0, vega: 0, theta: 0 };
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const Nd1 = normCDF(d1), Nd2 = normCDF(d2);
  const Nnd1 = normCDF(-d1), Nnd2 = normCDF(-d2);
  const discK = K * Math.exp(-r * T);

  let price: number, delta: number;
  if (type === "call") {
    price = S * Nd1 - discK * Nd2;
    delta = Nd1;
  } else {
    price = discK * Nnd2 - S * Nnd1;
    delta = Nd1 - 1;
  }
  const gamma = normPDF(d1) / (S * sigma * sqrtT);
  const vega = S * normPDF(d1) * sqrtT / 100; // per 1% vol
  const theta = (-(S * normPDF(d1) * sigma) / (2 * sqrtT) - r * discK * (type === "call" ? Nd2 : Nnd2)) / 365;

  return { price, delta, gamma, vega, theta };
}

// ── Greeks 热力图（柱状图）────────────────────────────────────────────────────
interface GreeksHeatmapProps {
  calls: OptionChainItem[];
  puts: OptionChainItem[];
  spotPrice: number;
}

function GreeksHeatmap({ calls, puts }: GreeksHeatmapProps) {
  const [activeGreek, setActiveGreek] = useState<"delta" | "gamma" | "vega" | "theta">("delta");

  const greekOptions = [
    { key: "delta" as const, label: "Delta", desc: "方向敏感度" },
    { key: "gamma" as const, label: "Gamma", desc: "Delta 变化率" },
    { key: "vega" as const, label: "Vega", desc: "波动率敏感度" },
    { key: "theta" as const, label: "Theta", desc: "时间价值损耗" },
  ];

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
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={barData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="strike" tick={{ fontSize: 10, fill: "rgba(148,163,184,0.7)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "rgba(148,163,184,0.7)" }} axisLine={false} tickLine={false} width={40} />
            <Tooltip
              contentStyle={{ background: "rgba(10,10,20,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: "11px" }}
              formatter={(value: number, name: string) => [value.toFixed(4), name === "callValue" ? `Call ${activeGreek}` : `Put ${activeGreek}`]}
            />
            <Legend formatter={(v) => v === "callValue" ? "Call" : "Put"} wrapperStyle={{ fontSize: "11px", color: "rgba(148,163,184,0.8)" }} />
            <Bar dataKey="callValue" fill={callColor} opacity={0.85} radius={[2, 2, 0, 0]} />
            <Bar dataKey="putValue" fill={putColor} opacity={0.85} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
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
            <tr key={i} className={cn("border-b border-white/5 hover:bg-white/5 transition-colors", item.moneyness === "ATM" && "bg-amber-500/5")}>
              <td className="py-1.5 px-2">
                <span className={cn("font-medium", getMoneynessColor(item.moneyness))}>{item.moneyness}</span>
              </td>
              <td className="text-right py-1.5 px-2 font-mono text-foreground/80">${item.strike.toLocaleString()}</td>
              <td className="text-right py-1.5 px-2 font-mono text-foreground/90 font-medium">${item.price.toFixed(2)}</td>
              <td className="text-right py-1.5 px-2 font-mono text-muted-foreground/70">${item.intrinsicValue.toFixed(2)}</td>
              <td className="text-right py-1.5 px-2 font-mono text-muted-foreground/70">${item.timeValue.toFixed(2)}</td>
              <td className="text-right py-1.5 px-2 font-mono" style={{ color: getGreekColor(item.delta, "delta") }}>{item.delta.toFixed(3)}</td>
              <td className="text-right py-1.5 px-2 font-mono" style={{ color: getGreekColor(item.gamma, "gamma") }}>{item.gamma.toFixed(5)}</td>
              <td className="text-right py-1.5 px-2 font-mono" style={{ color: getGreekColor(item.vega, "vega") }}>{item.vega.toFixed(3)}</td>
              <td className="text-right py-1.5 px-2 font-mono" style={{ color: getGreekColor(item.theta, "theta") }}>{item.theta.toFixed(3)}</td>
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
          <div><span className="text-muted-foreground/50">最大亏损</span><span className="ml-1 font-mono text-red-400">${strategy.maxLoss}</span></div>
        )}
        {strategy.maxProfit !== null && strategy.maxProfit !== undefined && (
          <div><span className="text-muted-foreground/50">最大收益</span><span className="ml-1 font-mono text-emerald-400">${strategy.maxProfit}</span></div>
        )}
        {strategy.breakEven.length > 0 && (
          <div>
            <span className="text-muted-foreground/50">盈亏平衡</span>
            <span className="ml-1 font-mono text-foreground/70">{strategy.breakEven.map(b => `$${b}`).join(" / ")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Greeks 敏感度曲线 + Payoff Diagram ────────────────────────────────────────
interface SensitivityChartProps {
  payload: OptionPricingPayload;
}

type SensMode = "payoff" | "delta" | "gamma" | "vega" | "theta";

function SensitivityChart({ payload }: SensitivityChartProps) {
  const [mode, setMode] = useState<SensMode>("payoff");
  const [selectedOption, setSelectedOption] = useState<"atm_call" | "atm_put" | "otm_call" | "otm_put">("atm_call");

  const S = payload.spotPrice;
  const sigma = payload.sigma / 100;
  const r = payload.riskFreeRate / 100;
  const T = payload.daysToExpiry / 365;

  // 根据选择找到对应期权的行权价
  const optionMap: Record<typeof selectedOption, { K: number; type: "call" | "put"; label: string }> = {
    atm_call: { K: Math.round(S), type: "call", label: "ATM Call" },
    atm_put: { K: Math.round(S), type: "put", label: "ATM Put" },
    otm_call: { K: Math.round(S * 1.05), type: "call", label: "OTM Call (+5%)" },
    otm_put: { K: Math.round(S * 0.95), type: "put", label: "OTM Put (-5%)" },
  };
  const opt = optionMap[selectedOption];

  // 生成价格范围：±25% 的标的价格，50 个点
  const curveData = useMemo(() => {
    const points = 60;
    const minS = S * 0.75;
    const maxS = S * 1.25;
    const step = (maxS - minS) / points;
    const premium = bsCalc(S, opt.K, T, r, sigma, opt.type).price;

    return Array.from({ length: points + 1 }, (_, i) => {
      const spotPrice = minS + i * step;
      const bs = bsCalc(spotPrice, opt.K, T, r, sigma, opt.type);
      const payoffAtExpiry = opt.type === "call"
        ? Math.max(spotPrice - opt.K, 0) - premium
        : Math.max(opt.K - spotPrice, 0) - premium;

      return {
        spot: parseFloat(spotPrice.toFixed(2)),
        payoff: parseFloat(payoffAtExpiry.toFixed(4)),
        currentPnL: parseFloat((bs.price - premium).toFixed(4)),
        delta: parseFloat(bs.delta.toFixed(4)),
        gamma: parseFloat(bs.gamma.toFixed(6)),
        vega: parseFloat(bs.vega.toFixed(4)),
        theta: parseFloat(bs.theta.toFixed(4)),
      };
    });
  }, [S, opt.K, opt.type, T, r, sigma]);

  const modeConfig: Record<SensMode, { label: string; color: string; dataKey: string; yLabel: string }> = {
    payoff: { label: "到期盈亏", color: "#f59e0b", dataKey: "payoff", yLabel: "P&L ($)" },
    delta: { label: "Delta", color: "#10b981", dataKey: "delta", yLabel: "Delta" },
    gamma: { label: "Gamma", color: "#f59e0b", dataKey: "gamma", yLabel: "Gamma" },
    vega: { label: "Vega", color: "#8b5cf6", dataKey: "vega", yLabel: "Vega/1%" },
    theta: { label: "Theta", color: "#ef4444", dataKey: "theta", yLabel: "Theta/day" },
  };

  const mc = modeConfig[mode];

  return (
    <div className="space-y-3">
      {/* 期权选择 */}
      <div className="flex flex-wrap gap-2">
        <div className="flex gap-1">
          {(["atm_call", "atm_put", "otm_call", "otm_put"] as const).map(key => (
            <button
              key={key}
              onClick={() => setSelectedOption(key)}
              className={cn(
                "px-2 py-1 rounded text-xs font-medium transition-all border",
                selectedOption === key
                  ? key.includes("call") ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300" : "bg-red-500/20 border-red-500/40 text-red-300"
                  : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
              )}
            >
              {optionMap[key].label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 ml-auto">
          {(["payoff", "delta", "gamma", "vega", "theta"] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "px-2 py-1 rounded text-xs font-medium transition-all border",
                mode === m
                  ? "bg-violet-500/20 border-violet-500/40 text-violet-300"
                  : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
              )}
            >
              {modeConfig[m].label}
            </button>
          ))}
        </div>
      </div>

      {/* 曲线图 */}
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={curveData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="spot"
              tick={{ fontSize: 9, fill: "rgba(148,163,184,0.7)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${v.toFixed(0)}`}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 9, fill: "rgba(148,163,184,0.7)" }}
              axisLine={false}
              tickLine={false}
              width={44}
              tickFormatter={(v) => v.toFixed(mode === "gamma" ? 5 : 3)}
            />
            <Tooltip
              contentStyle={{ background: "rgba(10,10,20,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: "11px" }}
              formatter={(value: number, name: string) => [
                value.toFixed(mode === "gamma" ? 6 : 4),
                name === "payoff" ? "到期盈亏" : name === "currentPnL" ? "当前盈亏" : name,
              ]}
              labelFormatter={(label) => `标的价格: $${Number(label).toFixed(2)}`}
            />
            {/* 零线 */}
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" />
            {/* 当前价格竖线 */}
            <ReferenceLine x={S} stroke="rgba(251,191,36,0.5)" strokeDasharray="4 4" label={{ value: "现价", position: "top", fontSize: 9, fill: "rgba(251,191,36,0.7)" }} />

            {mode === "payoff" ? (
              <>
                {/* 到期盈亏（实线）+ 当前盈亏（虚线） */}
                <Area
                  type="monotone"
                  dataKey="payoff"
                  stroke="#f59e0b"
                  fill="rgba(245,158,11,0.1)"
                  strokeWidth={2}
                  dot={false}
                  name="payoff"
                />
                <Line
                  type="monotone"
                  dataKey="currentPnL"
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  name="currentPnL"
                />
              </>
            ) : (
              <Line
                type="monotone"
                dataKey={mc.dataKey}
                stroke={mc.color}
                strokeWidth={2}
                dot={false}
                name={mc.dataKey}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 说明 */}
      <div className="text-xs text-muted-foreground/50 px-1">
        {mode === "payoff" && `${opt.label} 到期盈亏曲线（黄色实线）vs 当前持仓盈亏（灰色虚线）。行权价 $${opt.K}，期权费 $${bsCalc(S, opt.K, T, r, sigma, opt.type).price.toFixed(2)}`}
        {mode === "delta" && `Delta 随标的价格变化曲线。ATM 时 Delta≈0.5（Call）/ -0.5（Put），深度 ITM 趋近 ±1`}
        {mode === "gamma" && `Gamma 随标的价格变化曲线。ATM 附近 Gamma 最大，到期日临近时急剧增大（Gamma Risk）`}
        {mode === "vega" && `Vega 随标的价格变化曲线（每 1% 波动率变化对期权价格的影响）。ATM 期权 Vega 最大`}
        {mode === "theta" && `Theta 每日时间价值损耗曲线（负值）。ATM 期权 Theta 损耗最快，到期日临近时加速`}
      </div>
    </div>
  );
}

// ── IV Smile 曲线 ─────────────────────────────────────────────────────────────
function IVSmileChart({ payload }: { payload: OptionPricingPayload }) {
  const [showType, setShowType] = useState<"all" | "call" | "put">("all");

  // 如果后端提供了 IV Smile 数据，使用真实数据
  const hasRealData = payload.ivSmile && payload.ivSmile.length > 0;

  // 否则基于 BS 理论生成平坦 IV 基准线（展示理论 vs 市场的差异概念）
  const smileData = useMemo(() => {
    if (hasRealData) {
      return payload.ivSmile!
        .filter(p => showType === "all" || p.type === showType)
        .map(p => ({
          moneyness: parseFloat(p.moneyness.toFixed(3)),
          actualIV: parseFloat(p.actualIV.toFixed(2)),
          bsIV: parseFloat(p.bsIV.toFixed(2)),
          type: p.type,
          strike: p.strike,
        }))
        .sort((a, b) => a.moneyness - b.moneyness);
    }

    // 生成理论基准（BS 假设 IV 恒定，实际市场存在微笑/偏斜）
    const S = payload.spotPrice;
    const sigma = payload.sigma / 100;
    const r = payload.riskFreeRate / 100;
    const T = payload.daysToExpiry / 365;

    return Array.from({ length: 13 }, (_, i) => {
      const moneyness = 0.80 + i * 0.033; // 0.80 到 1.22
      const K = S * moneyness;
      // 模拟市场 IV 微笑：OTM Put 和 OTM Call 的 IV 通常高于 ATM
      const smileEffect = 0.15 * Math.pow(moneyness - 1, 2) + 0.05 * Math.max(1 - moneyness, 0);
      const marketIV = sigma + smileEffect;
      return {
        moneyness: parseFloat(moneyness.toFixed(3)),
        actualIV: parseFloat((marketIV * 100).toFixed(2)),
        bsIV: parseFloat((sigma * 100).toFixed(2)),
        type: moneyness < 1 ? "put" : "call",
        strike: parseFloat(K.toFixed(2)),
      };
    });
  }, [payload, hasRealData, showType]);

  return (
    <div className="space-y-3">
      {/* 数据来源标注 */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(["all", "call", "put"] as const).map(t => (
            <button
              key={t}
              onClick={() => setShowType(t)}
              className={cn(
                "px-2 py-1 rounded text-xs font-medium transition-all border",
                showType === t
                  ? "bg-violet-500/20 border-violet-500/40 text-violet-300"
                  : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
              )}
            >
              {t === "all" ? "全部" : t === "call" ? "Call" : "Put"}
            </button>
          ))}
        </div>
        <Badge variant="outline" className={cn("text-xs px-1.5 py-0", hasRealData ? "text-emerald-400 border-emerald-500/30" : "text-amber-400 border-amber-500/30")}>
          {hasRealData ? "Polygon 实际数据" : "BS 理论模拟"}
        </Badge>
      </div>

      {/* IV Smile 曲线 */}
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={smileData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="moneyness"
              tick={{ fontSize: 9, fill: "rgba(148,163,184,0.7)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
              label={{ value: "行权价/现价 (%)", position: "insideBottom", offset: -2, fontSize: 9, fill: "rgba(148,163,184,0.5)" }}
            />
            <YAxis
              tick={{ fontSize: 9, fill: "rgba(148,163,184,0.7)" }}
              axisLine={false}
              tickLine={false}
              width={36}
              tickFormatter={(v) => `${v}%`}
              label={{ value: "隐含波动率", angle: -90, position: "insideLeft", fontSize: 9, fill: "rgba(148,163,184,0.5)" }}
            />
            <Tooltip
              contentStyle={{ background: "rgba(10,10,20,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: "11px" }}
              formatter={(value: number, name: string) => [
                `${value.toFixed(2)}%`,
                name === "actualIV" ? (hasRealData ? "市场 IV" : "模拟市场 IV") : "BS 理论 IV",
              ]}
              labelFormatter={(label) => `行权价/现价: ${(Number(label) * 100).toFixed(1)}%`}
            />
            {/* ATM 竖线 */}
            <ReferenceLine x={1} stroke="rgba(251,191,36,0.4)" strokeDasharray="4 4" label={{ value: "ATM", position: "top", fontSize: 9, fill: "rgba(251,191,36,0.6)" }} />
            {/* 市场 IV（微笑曲线）*/}
            <Line
              type="monotone"
              dataKey="actualIV"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={{ fill: "#8b5cf6", r: 3 }}
              name="actualIV"
            />
            {/* BS 理论 IV（平坦基准线）*/}
            <Line
              type="monotone"
              dataKey="bsIV"
              stroke="#94a3b8"
              strokeWidth={1.5}
              strokeDasharray="5 5"
              dot={false}
              name="bsIV"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 说明 */}
      <div className="text-xs text-muted-foreground/50 px-1">
        {hasRealData
          ? `紫色实线为 Polygon 期权链实际成交价反推的隐含波动率，灰色虚线为 BS 理论平坦 IV（σ=${payload.sigma}%）。IV 微笑/偏斜反映市场对尾部风险的定价`
          : `当前为 BS 理论模拟（灰色虚线为 σ=${payload.sigma}%）。紫色曲线模拟市场典型 IV 微笑形态：OTM Put 溢价（左侧偏斜）+ OTM Call 溢价（右侧上翘）。实际 IV Smile 需要 Polygon 期权链实时成交数据`
        }
      </div>
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────────────
type TabType = "heatmap" | "chain" | "strategy" | "sensitivity" | "ivsmile";

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
    { key: "sensitivity", label: "敏感度/盈亏", icon: <LineChartIcon className="w-3 h-3" /> },
    { key: "ivsmile", label: "IV Smile", icon: <Smile className="w-3 h-3" /> },
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
            <div className="flex gap-1 mb-3 border-b border-white/10 pb-2 flex-wrap">
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
            {activeTab === "sensitivity" && (
              <SensitivityChart payload={payload} />
            )}
            {activeTab === "ivsmile" && (
              <IVSmileChart payload={payload} />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
