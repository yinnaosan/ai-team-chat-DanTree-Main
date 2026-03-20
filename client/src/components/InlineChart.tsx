/**
 * InlineChart — 解析消息内容中的 %%CHART%%...%%END_CHART%% 标记并渲染图表
 *
 * 支持的图表类型：line | bar | pie | area | scatter | candlestick | heatmap | treemap
 *
 * 标记格式（后端嵌入消息中）：
 * %%CHART%%
 * {
 *   "type": "line",
 *   "title": "苹果股价走势",
 *   "data": [{"name":"2024-01","value":185},{"name":"2024-02","value":190}],
 *   "xKey": "name",
 *   "yKey": "value",
 *   "color": "#6366f1",
 *   "unit": "USD"
 * }
 * %%END_CHART%%
 *
 * K线图格式（支持成交量 + MA5/MA20）：
 * %%CHART%%
 * {
 *   "type": "candlestick",
 *   "title": "股价K线",
 *   "data": [{"name":"2024-01","open":100,"high":110,"low":95,"close":105,"volume":1234567}],
 *   "xKey": "name"
 * }
 * %%END_CHART%%
 *
 * 热力图格式（板块涨跌）：
 * %%CHART%%
 * {
 *   "type": "heatmap",
 *   "title": "板块涨跌热力图",
 *   "data": [
 *     {"name":"科技","value":3.2,"size":120},
 *     {"name":"金融","value":-1.5,"size":90}
 *   ]
 * }
 * %%END_CHART%%
 */

import React, { useRef, useState, useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  AreaChart, Area, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart, ReferenceLine,
} from "recharts";
import { Download, TrendingUp, TrendingDown } from "lucide-react";

interface CandleData {
  name: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface HeatmapItem {
  name: string;
  value: number;   // 涨跌幅 %
  size?: number;   // 市值权重（可选）
  children?: HeatmapItem[];
}

interface ChartConfig {
  type: "line" | "bar" | "pie" | "area" | "scatter" | "candlestick" | "heatmap" | "treemap";
  title?: string;
  data: Record<string, unknown>[];
  xKey?: string;
  yKey?: string;
  /** 多系列时使用 series 字段 */
  series?: Array<{ key: string; color?: string; name?: string }>;
  color?: string;
  colors?: string[];
  unit?: string;
}

const DEFAULT_COLORS = [
  "#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4",
  "#a855f7", "#ec4899", "#14b8a6", "#f97316", "#84cc16",
];

const CHART_BG = "oklch(0.17 0.005 270)";
const AXIS_COLOR = "oklch(0.52 0.01 270)";
const GRID_COLOR = "oklch(0.24 0.007 270)";
const TOOLTIP_BG = "oklch(0.20 0.007 270)";
const TOOLTIP_BORDER = "oklch(0.30 0.008 270)";

const axisStyle = { fill: AXIS_COLOR, fontSize: 11, fontFamily: "inherit" };
const gridStyle = { stroke: GRID_COLOR, strokeDasharray: "3 3" };
const tooltipStyle = {
  contentStyle: {
    background: TOOLTIP_BG,
    border: `1px solid ${TOOLTIP_BORDER}`,
    borderRadius: 8,
    fontSize: 12,
    color: "oklch(0.82 0.005 270)",
  },
  labelStyle: { color: "oklch(0.82 0.005 270)", fontWeight: 600 },
  itemStyle: { color: "oklch(0.72 0.12 250)" },
  cursor: { fill: "oklch(0.25 0.007 270 / 0.5)" },
};

// ── 计算移动平均线 ─────────────────────────────────────────────────────────────
function calcMA(data: number[], period: number): (number | null)[] {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    return parseFloat((sum / period).toFixed(2));
  });
}

// ── 热力图（板块涨跌）─────────────────────────────────────────────────────────
function HeatmapChart({ data, unit = "%" }: { data: HeatmapItem[]; unit?: string }) {
  const [hovered, setHovered] = useState<string | null>(null);

  // 根据涨跌幅获取颜色
  const getColor = (value: number) => {
    const abs = Math.abs(value);
    if (value > 0) {
      if (abs >= 5) return { bg: "#16a34a", text: "#fff" };
      if (abs >= 3) return { bg: "#22c55e", text: "#fff" };
      if (abs >= 1) return { bg: "#4ade80", text: "#14532d" };
      return { bg: "#86efac", text: "#14532d" };
    } else if (value < 0) {
      if (abs >= 5) return { bg: "#dc2626", text: "#fff" };
      if (abs >= 3) return { bg: "#ef4444", text: "#fff" };
      if (abs >= 1) return { bg: "#f87171", text: "#7f1d1d" };
      return { bg: "#fca5a5", text: "#7f1d1d" };
    }
    return { bg: "#6b7280", text: "#fff" };
  };

  // 按权重排序，计算总权重
  const sorted = [...data].sort((a, b) => (b.size ?? 50) - (a.size ?? 50));
  const totalSize = sorted.reduce((s, d) => s + (d.size ?? 50), 0);

  return (
    <div className="px-2 pb-2">
      {/* 图例 */}
      <div className="flex items-center justify-center gap-3 mb-3 flex-wrap">
        {[
          { label: "≥+5%", bg: "#16a34a", text: "#fff" },
          { label: "+3~5%", bg: "#22c55e", text: "#fff" },
          { label: "+1~3%", bg: "#4ade80", text: "#14532d" },
          { label: "0~1%", bg: "#86efac", text: "#14532d" },
          { label: "0~-1%", bg: "#fca5a5", text: "#7f1d1d" },
          { label: "-1~-3%", bg: "#f87171", text: "#7f1d1d" },
          { label: "-3~-5%", bg: "#ef4444", text: "#fff" },
          { label: "≤-5%", bg: "#dc2626", text: "#fff" },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm" style={{ background: item.bg }} />
            <span className="text-[10px]" style={{ color: "oklch(0.55 0.01 270)" }}>{item.label}</span>
          </div>
        ))}
      </div>
      {/* 热力格子 */}
      <div className="flex flex-wrap gap-1.5">
        {sorted.map((item) => {
          const { bg, text } = getColor(item.value);
          const weight = (item.size ?? 50) / totalSize;
          // 根据权重决定格子大小（最小60px，最大180px）
          const minW = 60, maxW = 180;
          const w = Math.round(minW + weight * (maxW - minW) * sorted.length * 0.8);
          const isHovered = hovered === item.name;
          return (
            <div
              key={item.name}
              onMouseEnter={() => setHovered(item.name)}
              onMouseLeave={() => setHovered(null)}
              className="flex flex-col items-center justify-center rounded-lg cursor-pointer transition-all"
              style={{
                background: bg,
                width: `${Math.min(w, 160)}px`,
                height: `${Math.max(50, Math.min(w * 0.5, 80))}px`,
                transform: isHovered ? "scale(1.05)" : "scale(1)",
                boxShadow: isHovered ? "0 4px 12px rgba(0,0,0,0.4)" : "none",
                border: isHovered ? "2px solid rgba(255,255,255,0.4)" : "2px solid transparent",
              }}
            >
              <span className="text-xs font-semibold" style={{ color: text }}>{item.name}</span>
              <span className="text-sm font-bold" style={{ color: text }}>
                {item.value > 0 ? "+" : ""}{item.value.toFixed(2)}{unit}
              </span>
            </div>
          );
        })}
      </div>
      {/* 统计摘要 */}
      <div className="flex items-center justify-between mt-3 px-1">
        <div className="flex items-center gap-3 text-xs">
          <span style={{ color: "#22c55e" }}>
            上涨 {data.filter(d => d.value > 0).length} 个
          </span>
          <span style={{ color: "#6b7280" }}>
            平盘 {data.filter(d => d.value === 0).length} 个
          </span>
          <span style={{ color: "#ef4444" }}>
            下跌 {data.filter(d => d.value < 0).length} 个
          </span>
        </div>
        <span className="text-xs" style={{ color: "oklch(0.45 0.01 270)" }}>
          共 {data.length} 个板块
        </span>
      </div>
    </div>
  );
}

// ── K线图（含成交量 + MA5/MA20）─────────────────────────────────────────────
function CandlestickChart({ data, unit = "" }: { data: CandleData[]; unit?: string }) {
  const hasVolume = data.some(d => d.volume != null && d.volume > 0);

  const processed = useMemo(() => {
    const closes = data.map(d => d.close);
    const ma5 = calcMA(closes, 5);
    const ma20 = calcMA(closes, 20);

    return data.map((d, i) => {
      const isUp = d.close >= d.open;
      const bodyLow = Math.min(d.open, d.close);
      const bodyHigh = Math.max(d.open, d.close);
      return {
        name: d.name,
        bodyBase: bodyLow,
        bodySize: bodyHigh - bodyLow || 0.5,
        high: d.high,
        low: d.low,
        open: d.open,
        close: d.close,
        volume: d.volume ?? 0,
        isUp,
        color: isUp ? "#22c55e" : "#ef4444",
        upperWick: d.high - bodyHigh,
        lowerWick: bodyLow - d.low,
        ma5: ma5[i],
        ma20: ma20[i],
      };
    });
  }, [data]);

  const allValues = data.flatMap((d) => [d.high, d.low]);
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const padding = (maxVal - minVal) * 0.05;

  const maxVolume = Math.max(...data.map(d => d.volume ?? 0));

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ payload: typeof processed[0] }>; label?: string }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div style={{ background: TOOLTIP_BG, border: `1px solid ${TOOLTIP_BORDER}`, borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
        <div style={{ color: "oklch(0.82 0.005 270)", fontWeight: 600, marginBottom: 4 }}>{label}</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          <span style={{ color: "oklch(0.65 0.01 270)" }}>开盘</span>
          <span style={{ color: "oklch(0.82 0.005 270)" }}>{d.open}{unit}</span>
          <span style={{ color: "oklch(0.65 0.01 270)" }}>收盘</span>
          <span style={{ color: d.isUp ? "#22c55e" : "#ef4444", fontWeight: 600 }}>{d.close}{unit}</span>
          <span style={{ color: "oklch(0.65 0.01 270)" }}>最高</span>
          <span style={{ color: "#22c55e" }}>{d.high}{unit}</span>
          <span style={{ color: "oklch(0.65 0.01 270)" }}>最低</span>
          <span style={{ color: "#ef4444" }}>{d.low}{unit}</span>
          {d.volume > 0 && <>
            <span style={{ color: "oklch(0.65 0.01 270)" }}>成交量</span>
            <span style={{ color: "oklch(0.72 0.12 250)" }}>{(d.volume / 1e4).toFixed(0)}万</span>
          </>}
          {d.ma5 != null && <>
            <span style={{ color: "oklch(0.65 0.01 270)" }}>MA5</span>
            <span style={{ color: "#f59e0b" }}>{d.ma5}{unit}</span>
          </>}
          {d.ma20 != null && <>
            <span style={{ color: "oklch(0.65 0.01 270)" }}>MA20</span>
            <span style={{ color: "#a855f7" }}>{d.ma20}{unit}</span>
          </>}
        </div>
        <div style={{ color: d.isUp ? "#22c55e" : "#ef4444", marginTop: 4, fontWeight: 600 }}>
          {d.isUp ? "▲" : "▼"} {Math.abs(d.close - d.open).toFixed(2)}{unit} ({((Math.abs(d.close - d.open) / d.open) * 100).toFixed(2)}%)
        </div>
      </div>
    );
  };

  // 自定义蜡烛体形状（含上下影线）
  const CandleShape = (props: { x?: number; y?: number; width?: number; height?: number; payload?: typeof processed[0]; yAxis?: { scale?: (v: number) => number } }) => {
    const { x = 0, y = 0, width = 0, height: barHeight = 0, payload, yAxis } = props;
    if (!payload || barHeight === 0) return null;
    const { isUp, high, low, open, close } = payload;
    const color = isUp ? "#22c55e" : "#ef4444";
    const xCenter = x + width / 2;
    const bodyTop = y;
    const bodyBottom = y + Math.max(barHeight, 1);

    // 计算影线位置（需要用yAxis.scale转换价格到像素）
    let wickTopY = bodyTop;
    let wickBottomY = bodyBottom;
    if (yAxis?.scale) {
      const bodyHighPrice = Math.max(open, close);
      const bodyLowPrice = Math.min(open, close);
      wickTopY = yAxis.scale(high);
      wickBottomY = yAxis.scale(low);
      const bodyTopPx = yAxis.scale(bodyHighPrice);
      const bodyBottomPx = yAxis.scale(bodyLowPrice);
      return (
        <g>
          {/* 上影线 */}
          <line x1={xCenter} x2={xCenter} y1={wickTopY} y2={bodyTopPx} stroke={color} strokeWidth={1.5} />
          {/* 蜡烛体 */}
          <rect x={x + width * 0.15} y={bodyTopPx} width={width * 0.7} height={Math.max(bodyBottomPx - bodyTopPx, 1)} fill={color} rx={1} />
          {/* 下影线 */}
          <line x1={xCenter} x2={xCenter} y1={bodyBottomPx} y2={wickBottomY} stroke={color} strokeWidth={1.5} />
        </g>
      );
    }

    return (
      <g>
        <rect x={x + width * 0.15} y={bodyTop} width={width * 0.7} height={Math.max(barHeight, 1)} fill={color} rx={1} />
        <line x1={xCenter} x2={xCenter} y1={bodyTop} y2={wickTopY} stroke={color} strokeWidth={1.5} />
        <line x1={xCenter} x2={xCenter} y1={bodyBottom} y2={wickBottomY} stroke={color} strokeWidth={1.5} />
      </g>
    );
  };

  // 成交量柱颜色
  const VolumeBar = (props: { x?: number; y?: number; width?: number; height?: number; payload?: typeof processed[0] }) => {
    const { x = 0, y = 0, width = 0, height: barH = 0, payload } = props;
    if (!payload) return null;
    const color = payload.isUp ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)";
    return <rect x={x} y={y} width={width} height={barH} fill={color} rx={1} />;
  };

  return (
    <div>
      {/* K线主图 */}
      <ResponsiveContainer width="100%" height={hasVolume ? 240 : 300}>
        <ComposedChart data={processed} barCategoryGap="20%">
          <CartesianGrid {...gridStyle} />
          <XAxis dataKey="name" tick={axisStyle} />
          <YAxis
            domain={[minVal - padding, maxVal + padding]}
            tick={axisStyle}
            tickFormatter={(v: number) => `${v.toFixed(0)}${unit}`}
            width={55}
          />
          <Tooltip content={<CustomTooltip />} />
          {/* 透明底部（占位到 bodyBase） */}
          <Bar dataKey="bodyBase" stackId="candle" fill="transparent" legendType="none" />
          {/* 蜡烛体 */}
          <Bar dataKey="bodySize" stackId="candle" shape={<CandleShape />} minPointSize={1} legendType="none">
            {processed.map((entry, index) => (
              <Cell key={index} fill={entry.isUp ? "#22c55e" : "#ef4444"} />
            ))}
          </Bar>
          {/* MA5 均线 */}
          {processed.some(d => d.ma5 != null) && (
            <Line
              type="monotone"
              dataKey="ma5"
              stroke="#f59e0b"
              strokeWidth={1.5}
              dot={false}
              name="MA5"
              connectNulls={false}
            />
          )}
          {/* MA20 均线 */}
          {processed.some(d => d.ma20 != null) && (
            <Line
              type="monotone"
              dataKey="ma20"
              stroke="#a855f7"
              strokeWidth={1.5}
              dot={false}
              name="MA20"
              connectNulls={false}
            />
          )}
          {(processed.some(d => d.ma5 != null) || processed.some(d => d.ma20 != null)) && (
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
              formatter={(value) => <span style={{ color: value === "MA5" ? "#f59e0b" : "#a855f7", fontSize: 11 }}>{value}</span>}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* 成交量副图 */}
      {hasVolume && (
        <div style={{ borderTop: "1px solid oklch(0.22 0.007 270)", marginTop: 2 }}>
          <div className="flex items-center gap-1.5 px-3 pt-1.5 pb-0.5">
            <span className="text-[10px] font-medium" style={{ color: "oklch(0.50 0.01 270)" }}>成交量</span>
          </div>
          <ResponsiveContainer width="100%" height={70}>
            <BarChart data={processed} barCategoryGap="20%">
              <XAxis dataKey="name" tick={false} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fill: AXIS_COLOR, fontSize: 9 }}
                tickFormatter={(v: number) => v >= 1e8 ? `${(v / 1e8).toFixed(0)}亿` : `${(v / 1e4).toFixed(0)}万`}
                width={40}
                domain={[0, maxVolume * 1.2]}
              />
              <Tooltip
                contentStyle={{ background: TOOLTIP_BG, border: `1px solid ${TOOLTIP_BORDER}`, borderRadius: 6, fontSize: 11 }}
                formatter={(v: unknown) => [`${((v as number) / 1e4).toFixed(0)}万`, "成交量"]}
                labelStyle={{ color: "oklch(0.82 0.005 270)", fontWeight: 600 }}
              />
              <Bar dataKey="volume" shape={<VolumeBar />} minPointSize={1}>
                {processed.map((entry, index) => (
                  <Cell key={index} fill={entry.isUp ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── 主图表渲染器 ────────────────────────────────────────────────────────────────
function ChartRenderer({ config }: { config: ChartConfig }) {
  const {
    type, data, xKey = "name", yKey = "value",
    series, color = "#6366f1", colors = DEFAULT_COLORS, unit = "",
  } = config;

  const seriesList = series ?? [{ key: yKey, color, name: yKey }];

  if (type === "candlestick") {
    return <CandlestickChart data={data as unknown as CandleData[]} unit={unit} />;
  }

  if (type === "heatmap" || type === "treemap") {
    return <HeatmapChart data={data as unknown as HeatmapItem[]} unit={unit || "%"} />;
  }

  if (type === "pie") {
    return (
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={data}
            dataKey={yKey}
            nameKey={xKey}
            cx="50%"
            cy="50%"
            outerRadius={105}
            innerRadius={40}
            paddingAngle={2}
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
            labelLine={{ stroke: "oklch(0.40 0.01 270)", strokeWidth: 1 }}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} stroke="transparent" />
            ))}
          </Pie>
          <Tooltip {...tooltipStyle} formatter={(v) => [`${v}${unit}`, ""]} />
          <Legend wrapperStyle={{ fontSize: 11, color: "oklch(0.65 0.01 270)" }} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (type === "scatter") {
    return (
      <ResponsiveContainer width="100%" height={280}>
        <ScatterChart>
          <CartesianGrid {...gridStyle} />
          <XAxis dataKey={xKey} tick={axisStyle} name={xKey} />
          <YAxis tick={axisStyle} tickFormatter={(v: number) => `${v}${unit}`} name={yKey} />
          <Tooltip
            {...tooltipStyle}
            cursor={{ strokeDasharray: "3 3", stroke: GRID_COLOR }}
            formatter={(v: unknown) => [`${v}${unit}`, ""]}
          />
          {seriesList.map((s, i) => (
            <Scatter
              key={s.key}
              name={s.name || s.key}
              data={data}
              fill={s.color || colors[i % colors.length]}
              opacity={0.85}
            />
          ))}
          {seriesList.length > 1 && <Legend wrapperStyle={{ fontSize: 11, color: "oklch(0.65 0.01 270)" }} />}
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      {type === "bar" ? (
        <BarChart data={data} barCategoryGap="25%">
          <CartesianGrid {...gridStyle} />
          <XAxis dataKey={xKey} tick={axisStyle} />
          <YAxis tick={axisStyle} tickFormatter={(v: number) => `${v}${unit}`} />
          <Tooltip {...tooltipStyle} formatter={(v: unknown) => [`${v}${unit}`, ""]} />
          {seriesList.length > 1 && <Legend wrapperStyle={{ fontSize: 11, color: "oklch(0.65 0.01 270)" }} />}
          {seriesList.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.name || s.key}
              fill={s.color || colors[i % colors.length]}
              radius={[3, 3, 0, 0]}
            />
          ))}
        </BarChart>
      ) : type === "area" ? (
        <AreaChart data={data}>
          <defs>
            {seriesList.map((s, i) => {
              const c = s.color || colors[i % colors.length];
              return (
                <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={c} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={c} stopOpacity={0.02} />
                </linearGradient>
              );
            })}
          </defs>
          <CartesianGrid {...gridStyle} />
          <XAxis dataKey={xKey} tick={axisStyle} />
          <YAxis tick={axisStyle} tickFormatter={(v: number) => `${v}${unit}`} />
          <Tooltip {...tooltipStyle} formatter={(v: unknown) => [`${v}${unit}`, ""]} />
          {seriesList.length > 1 && <Legend wrapperStyle={{ fontSize: 11, color: "oklch(0.65 0.01 270)" }} />}
          {seriesList.map((s, i) => {
            const c = s.color || colors[i % colors.length];
            return (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.name || s.key}
                stroke={c} strokeWidth={2}
                fill={`url(#grad-${s.key})`}
                dot={false} activeDot={{ r: 4, strokeWidth: 0 }}
              />
            );
          })}
        </AreaChart>
      ) : (
        // line
        <LineChart data={data}>
          <CartesianGrid {...gridStyle} />
          <XAxis dataKey={xKey} tick={axisStyle} />
          <YAxis tick={axisStyle} tickFormatter={(v: number) => `${v}${unit}`} />
          <Tooltip {...tooltipStyle} formatter={(v: unknown) => [`${v}${unit}`, ""]} />
          {seriesList.length > 1 && <Legend wrapperStyle={{ fontSize: 11, color: "oklch(0.65 0.01 270)" }} />}
          {seriesList.map((s, i) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.name || s.key}
              stroke={s.color || colors[i % colors.length]}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          ))}
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}

// ── 图表容器组件 ────────────────────────────────────────────────────────────────
interface InlineChartProps {
  raw: string;
}

export function InlineChart({ raw }: InlineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  let config: ChartConfig;
  try {
    config = JSON.parse(raw.trim());
  } catch {
    return (
      <div className="my-3 p-3 rounded-lg text-xs" style={{ background: "oklch(0.18 0.005 270)", color: "oklch(0.55 0.01 270)" }}>
        [图表数据解析失败]
      </div>
    );
  }

  const handleDownload = () => {
    const svgEl = containerRef.current?.querySelector("svg") as SVGElement | null;
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const canvas = document.createElement("canvas");
    const scale = 2;
    canvas.width = svgEl.clientWidth * scale;
    canvas.height = svgEl.clientHeight * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = "#161620";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const a = document.createElement("a");
      a.download = `${config.title || "chart"}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  // 计算趋势（折线/面积图）
  const getTrend = () => {
    if (!["line", "area"].includes(config.type) || config.data.length < 2) return null;
    const yKey = config.yKey || "value";
    const first = Number(config.data[0][yKey]);
    const last = Number(config.data[config.data.length - 1][yKey]);
    if (isNaN(first) || isNaN(last)) return null;
    const pct = ((last - first) / Math.abs(first)) * 100;
    return { up: pct >= 0, pct: Math.abs(pct).toFixed(1) };
  };

  const trend = getTrend();

  const typeLabels: Record<string, string> = {
    line: "折线图", area: "面积图", bar: "柱状图",
    pie: "饼图", scatter: "散点图", candlestick: "K线图",
    heatmap: "热力图", treemap: "板块热力图",
  };

  return (
    <div
      ref={containerRef}
      className="my-4 rounded-xl overflow-hidden"
      style={{ background: CHART_BG, border: "1px solid oklch(0.25 0.007 270)" }}
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs px-1.5 py-0.5 rounded font-medium shrink-0"
            style={{ background: "oklch(0.22 0.015 250)", color: "oklch(0.65 0.12 250)", fontSize: 10 }}>
            {typeLabels[config.type] || config.type}
          </span>
          {config.title && (
            <span className="text-sm font-semibold truncate" style={{ color: "oklch(0.88 0.008 270)" }}>
              {config.title}
            </span>
          )}
          {trend && (
            <span className="flex items-center gap-0.5 text-xs shrink-0"
              style={{ color: trend.up ? "#22c55e" : "#ef4444" }}>
              {trend.up
                ? <TrendingUp className="w-3 h-3" />
                : <TrendingDown className="w-3 h-3" />}
              {trend.pct}%
            </span>
          )}
        </div>
        {config.type !== "heatmap" && config.type !== "treemap" && (
          <button
            onClick={handleDownload}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors hover:bg-white/8 shrink-0"
            style={{ color: "oklch(0.52 0.01 270)" }}
            title="下载图表 PNG"
          >
            <Download className="w-3 h-3" />
            <span>PNG</span>
          </button>
        )}
      </div>

      {/* 图表区域 */}
      <div className="px-2 pb-3">
        <ChartRenderer config={config} />
      </div>
    </div>
  );
}

/**
 * 解析消息内容，将 %%CHART%%...%%END_CHART%% 替换为图表组件
 * 返回混合内容数组：text（Markdown文本）| chart（图表）
 */
export function parseChartBlocks(content: string): Array<{ type: "text"; text: string } | { type: "chart"; raw: string }> {
  const parts: Array<{ type: "text"; text: string } | { type: "chart"; raw: string }> = [];
  const regex = /%%CHART%%([\s\S]*?)%%END_CHART%%/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", text: content.slice(lastIndex, match.index) });
    }
    parts.push({ type: "chart", raw: match[1] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({ type: "text", text: content.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: "text", text: content }];
}
