/**
 * InlineChart — 专业金融图表组件
 *
 * 支持的图表类型：
 *   line | bar | pie | area | scatter
 *   candlestick  — TradingView lightweight-charts K线（含成交量+MA5/MA20/MA60）
 *   heatmap      — 板块涨跌热力图
 *   waterfall    — 瀑布图（财务分析）
 *   gauge        — 仪表盘（评分/指数）
 *   dual_axis    — 双轴图（价格+指标）
 *   combo        — 复合图（柱+折线）
 *
 * 标记格式（后端嵌入消息中）：
 * %%CHART%%
 * { "type": "line", "title": "...", "data": [...], "xKey": "name", "yKey": "value", "unit": "USD" }
 * %%END_CHART%%
 *
 * K线格式：
 * { "type": "candlestick", "title": "...", "data": [{"name":"2025-01","open":100,"high":110,"low":95,"close":105,"volume":1234567}] }
 *
 * 瀑布图格式：
 * { "type": "waterfall", "title": "利润瀑布", "data": [{"name":"营业收入","value":1000,"type":"total"},{"name":"营业成本","value":-600,"type":"negative"},{"name":"毛利润","value":400,"type":"subtotal"}] }
 *
 * 仪表盘格式：
 * { "type": "gauge", "title": "综合评分", "value": 72, "min": 0, "max": 100, "thresholds": [{"value":40,"color":"#ef4444"},{"value":70,"color":"#f59e0b"},{"value":100,"color":"#22c55e"}] }
 *
 * 双轴图格式：
 * { "type": "dual_axis", "title": "...", "data": [...], "xKey": "name", "leftKey": "price", "rightKey": "volume", "leftUnit": "USD", "rightUnit": "万" }
 *
 * 复合图格式：
 * { "type": "combo", "title": "...", "data": [...], "xKey": "name", "bars": [{"key":"revenue","name":"营收","color":"#6366f1"}], "lines": [{"key":"growth","name":"增速","color":"#22c55e","unit":"%"}] }
 */

import React, { useRef, useState, useMemo, useEffect } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  AreaChart, Area, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart, ReferenceLine,
} from "recharts";
import { Download, TrendingUp, TrendingDown, Maximize2, Minimize2 } from "lucide-react";

// ── 颜色系统 ──────────────────────────────────────────────────────────────────
const DEFAULT_COLORS = [
  "#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4",
  "#a855f7", "#ec4899", "#14b8a6", "#f97316", "#84cc16",
];

const CHART_BG = "#141418";
const AXIS_COLOR = "#7c8a9e";
const GRID_COLOR = "#2d3340";
const TOOLTIP_BG = "#1a1c22";
const TOOLTIP_BORDER = "#3d4455";

const axisStyle = { fill: AXIS_COLOR, fontSize: 13, fontFamily: "inherit" };
const gridStyle = { stroke: GRID_COLOR, strokeDasharray: "3 3" };
const tooltipStyle = {
  contentStyle: {
    background: TOOLTIP_BG,
    border: `1px solid ${TOOLTIP_BORDER}`,
    borderRadius: 8,
    fontSize: 12,
    color: "#c8d0dc",
  },
  labelStyle: { color: "#c8d0dc", fontWeight: 600 },
  itemStyle: { color: "#8ba4d0" },
  cursor: { fill: "rgba(50,60,80,0.5)" },
};

// ── 类型定义 ──────────────────────────────────────────────────────────────────
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
  value: number;
  size?: number;
  children?: HeatmapItem[];
}

interface WaterfallItem {
  name: string;
  value: number;
  type?: "total" | "subtotal" | "positive" | "negative" | "auto";
}

interface GaugeThreshold {
  value: number;
  color: string;
  label?: string;
}

interface ChartConfig {
  type: "line" | "bar" | "pie" | "area" | "scatter" | "candlestick" | "heatmap" | "treemap"
    | "waterfall" | "gauge" | "dual_axis" | "combo";
  title?: string;
  subtitle?: string;
  data?: Record<string, unknown>[];
  xKey?: string;
  yKey?: string;
  series?: Array<{ key: string; color?: string; name?: string }>;
  color?: string;
  colors?: string[];
  unit?: string;
  // gauge 专用
  value?: number;
  min?: number;
  max?: number;
  thresholds?: GaugeThreshold[];
  // dual_axis 专用
  leftKey?: string;
  rightKey?: string;
  leftUnit?: string;
  rightUnit?: string;
  // combo 专用
  bars?: Array<{ key: string; name?: string; color?: string }>;
  lines?: Array<{ key: string; name?: string; color?: string; unit?: string }>;
  // 参考线
  referenceLines?: Array<{ value: number; label?: string; color?: string }>;
  // 注释
  annotations?: string;
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────
function calcMA(data: number[], period: number): (number | null)[] {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    return parseFloat((sum / period).toFixed(2));
  });
}

function formatNumber(v: number, unit = ""): string {
  if (Math.abs(v) >= 1e8) return `${(v / 1e8).toFixed(2)}亿${unit}`;
  if (Math.abs(v) >= 1e4) return `${(v / 1e4).toFixed(1)}万${unit}`;
  return `${v.toFixed(2)}${unit}`;
}

// ── 热力图 ────────────────────────────────────────────────────────────────────
function HeatmapChart({ data, unit = "%" }: { data: HeatmapItem[]; unit?: string }) {
  const [hovered, setHovered] = useState<string | null>(null);

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

  const sorted = [...data].sort((a, b) => (b.size ?? 50) - (a.size ?? 50));
  const totalSize = sorted.reduce((s, d) => s + (d.size ?? 50), 0);

  return (
    <div className="px-2 pb-2">
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
            <span className="text-[10px]" style={{ color: "#7c8a9e" }}>{item.label}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {sorted.map((item) => {
          const { bg, text } = getColor(item.value);
          const weight = (item.size ?? 50) / totalSize;
          const w = Math.round(60 + weight * 120 * sorted.length * 0.8);
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
      <div className="flex items-center justify-between mt-3 px-1">
        <div className="flex items-center gap-3 text-xs">
          <span style={{ color: "#22c55e" }}>上涨 {data.filter(d => d.value > 0).length} 个</span>
          <span style={{ color: "#6b7280" }}>平盘 {data.filter(d => d.value === 0).length} 个</span>
          <span style={{ color: "#ef4444" }}>下跌 {data.filter(d => d.value < 0).length} 个</span>
        </div>
        <span className="text-xs" style={{ color: "#5a6475" }}>共 {data.length} 个板块</span>
      </div>
    </div>
  );
}

// ── K线图（lightweight-charts）────────────────────────────────────────────────
function CandlestickChart({ data, unit = "" }: { data: CandleData[]; unit?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<unknown>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;

    let chart: unknown = null;

    import("lightweight-charts").then(({ createChart, CrosshairMode, CandlestickSeries, LineSeries }) => {
      if (!containerRef.current) return;

      const el = containerRef.current;
      chart = createChart(el, {
        width: el.clientWidth,
        height: 300,
        layout: {
          background: { color: "transparent" },
          textColor: AXIS_COLOR,
          fontFamily: "inherit",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: GRID_COLOR },
          horzLines: { color: GRID_COLOR },
        },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: GRID_COLOR },
        timeScale: {
          borderColor: GRID_COLOR,
          timeVisible: true,
          secondsVisible: false,
        },
        handleScroll: true,
        handleScale: true,
      });

      chartRef.current = chart;

      // K线系列 (lightweight-charts v5)
      const candleSeries = (chart as { addSeries: (type: unknown, opts: unknown) => unknown }).addSeries(CandlestickSeries, {
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderUpColor: "#22c55e",
        borderDownColor: "#ef4444",
        wickUpColor: "#22c55e",
        wickDownColor: "#ef4444",
      });

      // 转换数据格式
      const candleData = data.map(d => ({
        time: d.name as unknown as import("lightweight-charts").Time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }));
      (candleSeries as { setData: (d: unknown) => void }).setData(candleData);

      // MA5
      const closes = data.map(d => d.close);
      const ma5 = calcMA(closes, 5);
      const ma5Series = (chart as { addSeries: (type: unknown, opts: unknown) => unknown }).addSeries(LineSeries, {
        color: "#f59e0b",
        lineWidth: 1.5,
        priceLineVisible: false,
        lastValueVisible: false,
        title: "MA5",
      });
      const ma5Data = data
        .map((d, i) => ma5[i] != null ? { time: d.name as unknown as import("lightweight-charts").Time, value: ma5[i]! } : null)
        .filter(Boolean);
      (ma5Series as { setData: (d: unknown) => void }).setData(ma5Data);

      // MA20
      const ma20 = calcMA(closes, 20);
      const ma20Series = (chart as { addSeries: (type: unknown, opts: unknown) => unknown }).addSeries(LineSeries, {
        color: "#a855f7",
        lineWidth: 1.5,
        priceLineVisible: false,
        lastValueVisible: false,
        title: "MA20",
      });
      const ma20Data = data
        .map((d, i) => ma20[i] != null ? { time: d.name as unknown as import("lightweight-charts").Time, value: ma20[i]! } : null)
        .filter(Boolean);
      (ma20Series as { setData: (d: unknown) => void }).setData(ma20Data);

      // MA60（如果数据足够）
      if (data.length >= 60) {
        const ma60 = calcMA(closes, 60);
        const ma60Series = (chart as { addSeries: (type: unknown, opts: unknown) => unknown }).addSeries(LineSeries, {
          color: "#06b6d4",
          lineWidth: 1.5,
          priceLineVisible: false,
          lastValueVisible: false,
          title: "MA60",
        });
        const ma60Data = data
          .map((d, i) => ma60[i] != null ? { time: d.name as unknown as import("lightweight-charts").Time, value: ma60[i]! } : null)
          .filter(Boolean);
        (ma60Series as { setData: (d: unknown) => void }).setData(ma60Data);
      }

      (chart as { timeScale: () => { fitContent: () => void } }).timeScale().fitContent();
      setIsReady(true);

      // 响应式
      const ro = new ResizeObserver(() => {
        if (el && chart) {
          (chart as { applyOptions: (o: unknown) => void }).applyOptions({ width: el.clientWidth });
        }
      });
      ro.observe(el);

      return () => {
        ro.disconnect();
      };
    });

    return () => {
      if (chart) {
        (chart as { remove: () => void }).remove();
        chartRef.current = null;
      }
    };
  }, [data]);

  // 成交量副图（用 Recharts）
  const hasVolume = data.some(d => d.volume != null && d.volume > 0);
  const maxVolume = Math.max(...data.map(d => d.volume ?? 0));
  const closes = data.map(d => d.close);
  const volumeData = data.map((d, i) => ({
    name: d.name,
    volume: d.volume ?? 0,
    isUp: d.close >= d.open,
  }));

  const VolumeBar = (props: { x?: number; y?: number; width?: number; height?: number; payload?: typeof volumeData[0] }) => {
    const { x = 0, y = 0, width = 0, height: barH = 0, payload } = props;
    if (!payload) return null;
    return <rect x={x} y={y} width={width} height={barH} fill={payload.isUp ? "rgba(34,197,94,0.45)" : "rgba(239,68,68,0.45)"} rx={1} />;
  };

  return (
    <div>
      {/* MA 图例 */}
      <div className="flex items-center gap-3 px-4 pb-1">
        <div className="flex items-center gap-1"><div className="w-4 h-0.5 rounded" style={{ background: "#f59e0b" }} /><span className="text-[10px]" style={{ color: "#f59e0b" }}>MA5</span></div>
        <div className="flex items-center gap-1"><div className="w-4 h-0.5 rounded" style={{ background: "#a855f7" }} /><span className="text-[10px]" style={{ color: "#a855f7" }}>MA20</span></div>
        {data.length >= 60 && <div className="flex items-center gap-1"><div className="w-4 h-0.5 rounded" style={{ background: "#06b6d4" }} /><span className="text-[10px]" style={{ color: "#06b6d4" }}>MA60</span></div>}
        <span className="text-[10px] ml-auto" style={{ color: "#5a6475" }}>可拖拽 · 滚轮缩放</span>
      </div>
      {/* lightweight-charts 容器 */}
      <div ref={containerRef} style={{ width: "100%", height: 300 }} />
      {/* 成交量副图 */}
      {hasVolume && (
        <div style={{ borderTop: "1px solid #1e2028", marginTop: 2 }}>
          <div className="flex items-center gap-1.5 px-3 pt-1.5 pb-0.5">
            <span className="text-[10px] font-medium" style={{ color: "#6e7d90" }}>成交量</span>
          </div>
          <ResponsiveContainer width="100%" height={60}>
            <BarChart data={volumeData} barCategoryGap="20%">
              <XAxis dataKey="name" tick={false} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fill: AXIS_COLOR, fontSize: 12 }}
                tickFormatter={(v: number) => v >= 1e8 ? `${(v / 1e8).toFixed(0)}亿` : `${(v / 1e4).toFixed(0)}万`}
                width={38}
                domain={[0, maxVolume * 1.2]}
              />
              <Tooltip
                contentStyle={{ background: TOOLTIP_BG, border: `1px solid ${TOOLTIP_BORDER}`, borderRadius: 6, fontSize: 11 }}
                formatter={(v: unknown) => [`${((v as number) / 1e4).toFixed(0)}万`, "成交量"]}
                labelStyle={{ color: "#c8d0dc", fontWeight: 600 }}
              />
              <Bar dataKey="volume" shape={<VolumeBar />} minPointSize={1}>
                {volumeData.map((entry, index) => (
                  <Cell key={index} fill={entry.isUp ? "rgba(34,197,94,0.45)" : "rgba(239,68,68,0.45)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── 瀑布图 ────────────────────────────────────────────────────────────────────
function WaterfallChart({ data, unit = "" }: { data: WaterfallItem[]; unit?: string }) {
  // 计算每个柱子的起始位置
  const processed = useMemo(() => {
    let running = 0;
    return data.map((item) => {
      const itemType = item.type ?? (item.value >= 0 ? "positive" : "negative");
      let base = 0;
      let barValue = 0;
      let displayValue = item.value;

      if (itemType === "total" || itemType === "subtotal") {
        base = 0;
        barValue = item.value;
        running = item.value;
      } else if (item.value >= 0) {
        base = running;
        barValue = item.value;
        running += item.value;
      } else {
        base = running + item.value;
        barValue = Math.abs(item.value);
        running += item.value;
      }

      const isPositive = item.value >= 0;
      const isTotal = itemType === "total" || itemType === "subtotal";
      return {
        name: item.name,
        base,
        barValue,
        displayValue,
        isPositive,
        isTotal,
        color: isTotal ? "#6366f1" : isPositive ? "#22c55e" : "#ef4444",
      };
    });
  }, [data]);

  const allValues = processed.flatMap(d => [d.base, d.base + d.barValue]);
  const minVal = Math.min(0, ...allValues);
  const maxVal = Math.max(...allValues);
  const padding = (maxVal - minVal) * 0.1;

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ payload: typeof processed[0] }>; label?: string }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div style={{ background: TOOLTIP_BG, border: `1px solid ${TOOLTIP_BORDER}`, borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
        <div style={{ color: "#c8d0dc", fontWeight: 600, marginBottom: 4 }}>{label}</div>
        <div style={{ color: d.isPositive ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
          {d.displayValue > 0 ? "+" : ""}{formatNumber(d.displayValue, unit)}
        </div>
      </div>
    );
  };

  const WaterfallBar = (props: { x?: number; y?: number; width?: number; height?: number; payload?: typeof processed[0] }) => {
    const { x = 0, y = 0, width = 0, height: h = 0, payload } = props;
    if (!payload) return null;
    const { color, isTotal } = payload;
    return (
      <g>
        <rect x={x + 2} y={y} width={width - 4} height={Math.max(h, 1)} fill={color} rx={3}
          opacity={isTotal ? 1 : 0.85}
          stroke={isTotal ? "rgba(255,255,255,0.2)" : "none"}
          strokeWidth={1}
        />
        {/* 连接线 */}
        <line x1={x + width - 2} x2={x + width + 4} y1={y} y2={y}
          stroke="#5a6880" strokeWidth={1} strokeDasharray="2 2" />
      </g>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={processed} barCategoryGap="25%">
        <CartesianGrid {...gridStyle} />
        <XAxis dataKey="name" tick={axisStyle} />
        <YAxis
          domain={[minVal - padding, maxVal + padding]}
          tick={axisStyle}
          tickFormatter={(v: number) => formatNumber(v, unit)}
          width={60}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={0} stroke="#5a6880" strokeWidth={1} />
        {/* 透明底部（占位到 base） */}
        <Bar dataKey="base" stackId="waterfall" fill="transparent" legendType="none" />
        {/* 实际柱子 */}
        <Bar dataKey="barValue" stackId="waterfall" shape={<WaterfallBar />} legendType="none">
          {processed.map((entry, index) => (
            <Cell key={index} fill={entry.color} />
          ))}
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── 仪表盘 ────────────────────────────────────────────────────────────────────
function GaugeChart({ value, min = 0, max = 100, thresholds, unit = "", title }: {
  value: number; min?: number; max?: number;
  thresholds?: GaugeThreshold[]; unit?: string; title?: string;
}) {
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const angle = -150 + pct * 300; // -150° to +150°

  // 确定颜色
  const defaultThresholds: GaugeThreshold[] = thresholds ?? [
    { value: max * 0.4, color: "#ef4444", label: "偏低" },
    { value: max * 0.7, color: "#f59e0b", label: "中性" },
    { value: max, color: "#22c55e", label: "偏高" },
  ];

  let activeColor = defaultThresholds[defaultThresholds.length - 1]?.color ?? "#22c55e";
  let activeLabel = defaultThresholds[defaultThresholds.length - 1]?.label ?? "";
  for (const t of defaultThresholds) {
    if (value <= t.value) {
      activeColor = t.color;
      activeLabel = t.label ?? "";
      break;
    }
  }

  // SVG 弧线路径
  const cx = 100, cy = 90, r = 70;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const arcPath = (startDeg: number, endDeg: number, radius: number) => {
    const s = { x: cx + radius * Math.cos(toRad(startDeg)), y: cy + radius * Math.sin(toRad(startDeg)) };
    const e = { x: cx + radius * Math.cos(toRad(endDeg)), y: cy + radius * Math.sin(toRad(endDeg)) };
    const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${largeArc} 1 ${e.x} ${e.y}`;
  };

  // 指针
  const needleRad = toRad(angle);
  const needleX = cx + (r - 10) * Math.cos(needleRad);
  const needleY = cy + (r - 10) * Math.sin(needleRad);

  return (
    <div className="flex flex-col items-center py-4">
      <svg width="200" height="130" viewBox="0 0 200 130">
        {/* 背景弧 */}
        <path d={arcPath(-150, 150, r)} fill="none" stroke="#22252e" strokeWidth={14} strokeLinecap="round" />
        {/* 颜色分段 */}
        {defaultThresholds.map((t, i) => {
          const prevVal = i === 0 ? min : defaultThresholds[i - 1].value;
          const startPct = (prevVal - min) / (max - min);
          const endPct = (t.value - min) / (max - min);
          const startDeg = -150 + startPct * 300;
          const endDeg = -150 + endPct * 300;
          return (
            <path key={i} d={arcPath(startDeg, endDeg, r)} fill="none"
              stroke={t.color} strokeWidth={14} strokeLinecap="butt" opacity={0.3} />
          );
        })}
        {/* 已完成弧 */}
        <path d={arcPath(-150, angle, r)} fill="none" stroke={activeColor} strokeWidth={14} strokeLinecap="round" />
        {/* 指针 */}
        <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke="#d8e0ec" strokeWidth={2.5} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={5} fill="#d8e0ec" />
        {/* 数值 */}
        <text x={cx} y={cy + 28} textAnchor="middle" fontSize={22} fontWeight={700} fill={activeColor}>
          {value}{unit}
        </text>
        <text x={cx} y={cy + 44} textAnchor="middle" fontSize={13} fill="#8a96a8">
          {activeLabel}
        </text>
        {/* 最小/最大标签 */}
        <text x={cx - r - 4} y={cy + 20} textAnchor="middle" fontSize={12} fill={AXIS_COLOR}>{min}</text>
        <text x={cx + r + 4} y={cy + 20} textAnchor="middle" fontSize={12} fill={AXIS_COLOR}>{max}</text>
      </svg>
      {/* 图例 */}
      <div className="flex items-center gap-4 mt-1">
        {defaultThresholds.map((t, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} />
            <span className="text-[10px]" style={{ color: "#7c8a9e" }}>{t.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 双轴图 ────────────────────────────────────────────────────────────────────
function DualAxisChart({ config }: { config: ChartConfig }) {
  const { data = [], xKey = "name", leftKey = "value", rightKey = "volume",
    leftUnit = "", rightUnit = "", colors = DEFAULT_COLORS } = config;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data}>
        <CartesianGrid {...gridStyle} />
        <XAxis dataKey={xKey} tick={axisStyle} />
        <YAxis
          yAxisId="left"
          tick={axisStyle}
          tickFormatter={(v: number) => `${v}${leftUnit}`}
          width={55}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={axisStyle}
          tickFormatter={(v: number) => `${v}${rightUnit}`}
          width={50}
        />
        <Tooltip
          contentStyle={{ background: TOOLTIP_BG, border: `1px solid ${TOOLTIP_BORDER}`, borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "#c8d0dc", fontWeight: 600 }}
        />
        <Legend wrapperStyle={{ fontSize: 13, color: "#96a0b2" }} />
        <Bar yAxisId="right" dataKey={rightKey} fill={colors[1] ?? "#22c55e"} opacity={0.6} radius={[2, 2, 0, 0]} name={rightKey} />
        <Line yAxisId="left" type="monotone" dataKey={leftKey} stroke={colors[0] ?? "#6366f1"} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} name={leftKey} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── 复合图（柱+折线）─────────────────────────────────────────────────────────
function ComboChart({ config }: { config: ChartConfig }) {
  const { data = [], xKey = "name", bars = [], lines = [], colors = DEFAULT_COLORS } = config;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data}>
        <CartesianGrid {...gridStyle} />
        <XAxis dataKey={xKey} tick={axisStyle} />
        <YAxis yAxisId="left" tick={axisStyle} width={55} />
        {lines.length > 0 && <YAxis yAxisId="right" orientation="right" tick={axisStyle} width={45} />}
        <Tooltip
          contentStyle={{ background: TOOLTIP_BG, border: `1px solid ${TOOLTIP_BORDER}`, borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "#c8d0dc", fontWeight: 600 }}
        />
        <Legend wrapperStyle={{ fontSize: 13, color: "#96a0b2" }} />
        {bars.map((b, i) => (
          <Bar key={b.key} yAxisId="left" dataKey={b.key} name={b.name ?? b.key}
            fill={b.color ?? colors[i % colors.length]} radius={[3, 3, 0, 0]} opacity={0.85} />
        ))}
        {lines.map((l, i) => (
          <Line key={l.key} yAxisId="right" type="monotone" dataKey={l.key} name={l.name ?? l.key}
            stroke={l.color ?? colors[(bars.length + i) % colors.length]} strokeWidth={2.5}
            dot={false} activeDot={{ r: 4 }} />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── 主图表渲染器 ───────────────────────────────────────────────────────────────
function ChartRenderer({ config }: { config: ChartConfig }) {
  const {
    type, data = [], xKey = "name", yKey = "value",
    series, color = "#6366f1", colors = DEFAULT_COLORS, unit = "",
    referenceLines = [],
  } = config;

  const seriesList = series ?? [{ key: yKey, color, name: yKey }];

  if (type === "candlestick") {
    return <CandlestickChart data={data as unknown as CandleData[]} unit={unit} />;
  }
  if (type === "heatmap" || type === "treemap") {
    return <HeatmapChart data={data as unknown as HeatmapItem[]} unit={unit || "%"} />;
  }
  if (type === "waterfall") {
    return <WaterfallChart data={data as unknown as WaterfallItem[]} unit={unit} />;
  }
  if (type === "gauge") {
    return <GaugeChart value={config.value ?? 0} min={config.min} max={config.max}
      thresholds={config.thresholds} unit={unit} title={config.title} />;
  }
  if (type === "dual_axis") {
    return <DualAxisChart config={config} />;
  }
  if (type === "combo") {
    return <ComboChart config={config} />;
  }

  if (type === "pie") {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie data={data} dataKey={yKey} nameKey={xKey} cx="50%" cy="50%"
            outerRadius={110} innerRadius={45} paddingAngle={2}
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
            labelLine={{ stroke: "#5a6880", strokeWidth: 1 }}
          >
            {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} stroke="transparent" />)}
          </Pie>
          <Tooltip {...tooltipStyle} formatter={(v) => [`${v}${unit}`, ""]} />
          <Legend wrapperStyle={{ fontSize: 13, color: "#96a0b2" }} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (type === "scatter") {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart>
          <CartesianGrid {...gridStyle} />
          <XAxis dataKey={xKey} tick={axisStyle} name={xKey} />
          <YAxis tick={axisStyle} tickFormatter={(v: number) => `${v}${unit}`} name={yKey} />
          <Tooltip {...tooltipStyle} cursor={{ strokeDasharray: "3 3", stroke: GRID_COLOR }} formatter={(v: unknown) => [`${v}${unit}`, ""]} />
          {seriesList.map((s, i) => (
            <Scatter key={s.key} name={s.name || s.key} data={data} fill={s.color || colors[i % colors.length]} opacity={0.85} />
          ))}
          {seriesList.length > 1 && <Legend wrapperStyle={{ fontSize: 13, color: "#96a0b2" }} />}
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  // line / bar / area
  return (
    <ResponsiveContainer width="100%" height={300}>
      {type === "bar" ? (
        <BarChart data={data} barCategoryGap="25%">
          <CartesianGrid {...gridStyle} />
          <XAxis dataKey={xKey} tick={axisStyle} />
          <YAxis tick={axisStyle} tickFormatter={(v: number) => `${v}${unit}`} width={55} />
          <Tooltip {...tooltipStyle} formatter={(v: unknown) => [`${v}${unit}`, ""]} />
          {seriesList.length > 1 && <Legend wrapperStyle={{ fontSize: 13, color: "#96a0b2" }} />}
          {referenceLines.map((rl, i) => <ReferenceLine key={i} y={rl.value} stroke={rl.color ?? "#6366f1"} strokeDasharray="4 2" label={{ value: rl.label, fill: "#96a0b2", fontSize: 12 }} />)}
          {seriesList.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.name || s.key}
              fill={s.color || colors[i % colors.length]} radius={[3, 3, 0, 0]} />
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
          <YAxis tick={axisStyle} tickFormatter={(v: number) => `${v}${unit}`} width={55} />
          <Tooltip {...tooltipStyle} formatter={(v: unknown) => [`${v}${unit}`, ""]} />
          {seriesList.length > 1 && <Legend wrapperStyle={{ fontSize: 13, color: "#96a0b2" }} />}
          {referenceLines.map((rl, i) => <ReferenceLine key={i} y={rl.value} stroke={rl.color ?? "#6366f1"} strokeDasharray="4 2" label={{ value: rl.label, fill: "#96a0b2", fontSize: 12 }} />)}
          {seriesList.map((s, i) => {
            const c = s.color || colors[i % colors.length];
            return (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.name || s.key}
                stroke={c} strokeWidth={2.5} fill={`url(#grad-${s.key})`}
                dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
            );
          })}
        </AreaChart>
      ) : (
        <LineChart data={data}>
          <CartesianGrid {...gridStyle} />
          <XAxis dataKey={xKey} tick={axisStyle} />
          <YAxis tick={axisStyle} tickFormatter={(v: number) => `${v}${unit}`} width={55} />
          <Tooltip {...tooltipStyle} formatter={(v: unknown) => [`${v}${unit}`, ""]} />
          {seriesList.length > 1 && <Legend wrapperStyle={{ fontSize: 13, color: "#96a0b2" }} />}
          {referenceLines.map((rl, i) => <ReferenceLine key={i} y={rl.value} stroke={rl.color ?? "#6366f1"} strokeDasharray="4 2" label={{ value: rl.label, fill: "#96a0b2", fontSize: 12 }} />)}
          {seriesList.map((s, i) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.name || s.key}
              stroke={s.color || colors[i % colors.length]} strokeWidth={2.5}
              dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
          ))}
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}

// ── 图表容器 ───────────────────────────────────────────────────────────────────
interface InlineChartProps {
  raw: string;
}

export function InlineChart({ raw }: InlineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);

  let config: ChartConfig;
  try {
    config = JSON.parse(raw.trim());
  } catch {
    return (
      <div className="my-3 p-3 rounded-lg text-xs" style={{ background: "#16181e", color: "#7c8a9e" }}>
        [图表数据解析失败]
      </div>
    );
  }

  const handleDownload = () => {
    if (config.type === "gauge") {
      const svgEl = containerRef.current?.querySelector("svg") as SVGElement | null;
      if (!svgEl) return;
      const svgData = new XMLSerializer().serializeToString(svgEl);
      const canvas = document.createElement("canvas");
      canvas.width = 400; canvas.height = 260;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const img = new Image();
      img.onload = () => {
        ctx.fillStyle = "#161620";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const a = document.createElement("a");
        a.download = `${config.title || "gauge"}.png`;
        a.href = canvas.toDataURL("image/png");
        a.click();
      };
      img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
      return;
    }
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

  const getTrend = () => {
    if (!["line", "area"].includes(config.type) || (config.data?.length ?? 0) < 2) return null;
    const yKey = config.yKey || "value";
    const d = config.data!;
    const first = Number(d[0][yKey]);
    const last = Number(d[d.length - 1][yKey]);
    if (isNaN(first) || isNaN(last) || first === 0) return null;
    const pct = ((last - first) / Math.abs(first)) * 100;
    return { up: pct >= 0, pct: Math.abs(pct).toFixed(1) };
  };

  const trend = getTrend();

  const typeLabels: Record<string, string> = {
    line: "折线图", area: "面积图", bar: "柱状图",
    pie: "饼图", scatter: "散点图", candlestick: "K线图",
    heatmap: "热力图", treemap: "板块热力图",
    waterfall: "瀑布图", gauge: "仪表盘",
    dual_axis: "双轴图", combo: "复合图",
  };

  const noDownload = ["heatmap", "treemap", "gauge"].includes(config.type);

  return (
    <div
      ref={containerRef}
      className="my-4 rounded-xl overflow-hidden transition-all"
      style={{
        background: CHART_BG,
        border: "1px solid #22252e",
        ...(expanded ? { position: "fixed", inset: "5%", zIndex: 9999, margin: 0, borderRadius: 16 } : {}),
      }}
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs px-1.5 py-0.5 rounded font-medium shrink-0"
            style={{ background: "#282c3a", color: "#7090d0", fontSize: 12 }}>
            {typeLabels[config.type] || config.type}
          </span>
          {config.title && (
            <span className="text-sm font-semibold truncate" style={{ color: "#d8e0ec" }}>
              {config.title}
            </span>
          )}
          {config.subtitle && (
            <span className="text-xs shrink-0" style={{ color: "#7c8a9e" }}>
              {config.subtitle}
            </span>
          )}
          {trend && (
            <span className="flex items-center gap-0.5 text-xs shrink-0"
              style={{ color: trend.up ? "#22c55e" : "#ef4444" }}>
              {trend.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {trend.pct}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!noDownload && (
            <button onClick={handleDownload}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors hover:bg-white/8"
              style={{ color: "#7c8a9e" }} title="下载 PNG">
              <Download className="w-3 h-3" /><span>PNG</span>
            </button>
          )}
          <button onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors hover:bg-white/8"
            style={{ color: "#7c8a9e" }} title={expanded ? "收起" : "全屏"}>
            {expanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* 图表区域 */}
      <div className="px-2 pb-3">
        <ChartRenderer config={config} />
      </div>

      {/* 注释 */}
      {config.annotations && (
        <div className="px-4 pb-3 text-xs" style={{ color: "#6e7d90", borderTop: "1px solid #1e2028", paddingTop: 8 }}>
          {config.annotations}
        </div>
      )}

      {/* 全屏遮罩 */}
      {expanded && (
        <div
          className="fixed inset-0 bg-black/60 -z-10"
          onClick={() => setExpanded(false)}
          style={{ zIndex: 9998 }}
        />
      )}
    </div>
  );
}

/**
 * matplotlib 图像组件（渲染 base64 PNG）
 * 支持全屏展开和下载
 */
export function PyImageChart({ base64 }: { base64: string }) {
  const [expanded, setExpanded] = useState(false);
  const imgSrc = base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`;

  const handleDownload = () => {
    const a = document.createElement("a");
    a.download = "chart.png";
    a.href = imgSrc;
    a.click();
  };

  return (
    <div
      className="my-4 rounded-xl overflow-hidden transition-all"
      style={{
        background: CHART_BG,
        border: "1px solid #22252e",
        ...(expanded ? { position: "fixed", inset: "5%", zIndex: 9999, margin: 0, borderRadius: 16, display: "flex", flexDirection: "column" } : {}),
      }}
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs px-1.5 py-0.5 rounded font-medium"
            style={{ background: "#242e28", color: "#70c090", fontSize: 12 }}>
            技术图表
          </span>
          <span className="text-sm font-semibold" style={{ color: "#d8e0ec" }}>
            K线图 + 技术指标
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleDownload}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors hover:bg-white/8"
            style={{ color: "#7c8a9e" }} title="下载 PNG">
            <Download className="w-3 h-3" /><span>PNG</span>
          </button>
          <button onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors hover:bg-white/8"
            style={{ color: "#7c8a9e" }} title={expanded ? "收起" : "全屏"}>
            {expanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
        </div>
      </div>
      {/* 图像区域 */}
      <div className={expanded ? "flex-1 overflow-auto p-2" : "px-2 pb-3"}>
        <img
          src={imgSrc}
          alt="技术分析图表"
          className="w-full rounded-lg"
          style={{ maxHeight: expanded ? "100%" : 500, objectFit: "contain" }}
        />
      </div>
      {/* 全屏遮罩 */}
      {expanded && (
        <div
          className="fixed inset-0 bg-black/60"
          onClick={() => setExpanded(false)}
          style={{ zIndex: 9998 }}
        />
      )}
    </div>
  );
}

/**
 * 解析消息内容，将 %%CHART%%...%%END_CHART%% 和 %%PYIMAGE%%...%%END_PYIMAGE%% 替换为图表组件
 */
export function parseChartBlocks(
  content: string
): Array<{ type: "text"; text: string } | { type: "chart"; raw: string } | { type: "pyimage"; base64: string }> {
  const parts: Array<{ type: "text"; text: string } | { type: "chart"; raw: string } | { type: "pyimage"; base64: string }> = [];
  // 合并匹配两种标记
  const regex = /%%CHART%%([\s\S]*?)%%END_CHART%%|%%PYIMAGE%%([\s\S]*?)%%END_PYIMAGE%%/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", text: content.slice(lastIndex, match.index) });
    }
    if (match[1] !== undefined) {
      // %%CHART%% 格式
      parts.push({ type: "chart", raw: match[1] });
    } else if (match[2] !== undefined) {
      // %%PYIMAGE%% 格式（matplotlib base64 图像）
      parts.push({ type: "pyimage", base64: match[2].trim() });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({ type: "text", text: content.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: "text", text: content }];
}
