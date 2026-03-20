/**
 * InlineChart — 解析消息内容中的 %%CHART%%...%%END_CHART%% 标记并渲染图表
 *
 * 支持的图表类型：line | bar | pie | area | scatter
 *
 * 标记格式（后端嵌入消息中）：
 * %%CHART%%
 * {
 *   "type": "line",
 *   "title": "苹果股价走势",
 *   "data": [{"name":"2024-01","value":185},{"name":"2024-02","value":190}],
 *   "xKey": "name",
 *   "yKey": "value",
 *   "color": "#6366f1"
 * }
 * %%END_CHART%%
 */

import React, { useState } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  AreaChart, Area, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Download } from "lucide-react";

interface ChartConfig {
  type: "line" | "bar" | "pie" | "area" | "scatter";
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

function ChartRenderer({ config }: { config: ChartConfig }) {
  const {
    type, data, xKey = "name", yKey = "value",
    series, color = "#6366f1", colors = DEFAULT_COLORS, unit = "",
  } = config;

  const axisStyle = { fill: "oklch(0.55 0.01 270)", fontSize: 11 };
  const gridStyle = { stroke: "oklch(0.25 0.007 270)", strokeDasharray: "3 3" };
  const tooltipStyle = {
    contentStyle: { background: "oklch(0.20 0.007 270)", border: "1px solid oklch(0.30 0.008 270)", borderRadius: 8, fontSize: 12 },
    labelStyle: { color: "oklch(0.82 0.005 270)" },
    itemStyle: { color: "oklch(0.72 0.12 250)" },
  };

  const seriesList = series ?? [{ key: yKey, color, name: yKey }];

  if (type === "pie") {
    return (
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie data={data} dataKey={yKey} nameKey={xKey} cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}>
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
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
          <XAxis dataKey={xKey} tick={axisStyle} />
          <YAxis tick={axisStyle} tickFormatter={(v) => `${v}${unit}`} />
          <Tooltip {...tooltipStyle} />
          <Scatter data={data} fill={color} />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      {type === "bar" ? (
        <BarChart data={data}>
          <CartesianGrid {...gridStyle} />
          <XAxis dataKey={xKey} tick={axisStyle} />
          <YAxis tick={axisStyle} tickFormatter={(v: number) => `${v}${unit}`} />
          <Tooltip {...tooltipStyle} formatter={(v: unknown) => [`${v}${unit}`, ""]} />
          {seriesList.length > 1 && <Legend wrapperStyle={{ fontSize: 11, color: "oklch(0.65 0.01 270)" }} />}
          {seriesList.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.name || s.key}
              fill={s.color || colors[i % colors.length]} />
          ))}
        </BarChart>
      ) : type === "area" ? (
        <AreaChart data={data}>
          <CartesianGrid {...gridStyle} />
          <XAxis dataKey={xKey} tick={axisStyle} />
          <YAxis tick={axisStyle} tickFormatter={(v: number) => `${v}${unit}`} />
          <Tooltip {...tooltipStyle} formatter={(v: unknown) => [`${v}${unit}`, ""]} />
          {seriesList.length > 1 && <Legend wrapperStyle={{ fontSize: 11, color: "oklch(0.65 0.01 270)" }} />}
          {seriesList.map((s, i) => (
            <Area key={s.key} type="monotone" dataKey={s.key} name={s.name || s.key}
              stroke={s.color || colors[i % colors.length]}
              fill={s.color || colors[i % colors.length]}
              strokeWidth={2} dot={false} fillOpacity={0.15} />
          ))}
        </AreaChart>
      ) : (
        <LineChart data={data}>
          <CartesianGrid {...gridStyle} />
          <XAxis dataKey={xKey} tick={axisStyle} />
          <YAxis tick={axisStyle} tickFormatter={(v: number) => `${v}${unit}`} />
          <Tooltip {...tooltipStyle} formatter={(v: unknown) => [`${v}${unit}`, ""]} />
          {seriesList.length > 1 && <Legend wrapperStyle={{ fontSize: 11, color: "oklch(0.65 0.01 270)" }} />}
          {seriesList.map((s, i) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.name || s.key}
              stroke={s.color || colors[i % colors.length]}
              strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}

interface InlineChartProps {
  raw: string; // raw JSON string inside %%CHART%% markers
}

export function InlineChart({ raw }: InlineChartProps) {
  const [error, setError] = useState<string | null>(null);

  let config: ChartConfig;
  try {
    config = JSON.parse(raw.trim());
  } catch (e) {
    return (
      <div className="my-3 p-3 rounded-lg text-xs" style={{ background: "oklch(0.18 0.005 270)", color: "oklch(0.55 0.01 270)" }}>
        [图表数据解析失败]
      </div>
    );
  }

  const handleDownload = () => {
    // 使用 SVG → canvas → PNG 方式导出
    const svgEl = document.querySelector(".recharts-wrapper svg") as SVGElement | null;
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const canvas = document.createElement("canvas");
    canvas.width = svgEl.clientWidth * 2;
    canvas.height = svgEl.clientHeight * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const a = document.createElement("a");
      a.download = `${config.title || "chart"}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className="my-4 rounded-xl overflow-hidden" style={{ background: "oklch(0.17 0.005 270)", border: "1px solid oklch(0.25 0.007 270)" }}>
      {config.title && (
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <span className="text-sm font-semibold" style={{ color: "oklch(0.85 0.01 270)" }}>{config.title}</span>
          <button onClick={handleDownload}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs hover:bg-white/8 transition-colors"
            style={{ color: "oklch(0.55 0.01 270)" }}>
            <Download className="w-3 h-3" />PNG
          </button>
        </div>
      )}
      <div className="px-2 pb-3">
        {error ? (
          <div className="p-3 text-xs" style={{ color: "oklch(0.55 0.01 270)" }}>{error}</div>
        ) : (
          <ChartRenderer config={config} />
        )}
      </div>
    </div>
  );
}

/**
 * 解析消息内容，将 %%CHART%%...%%END_CHART%% 替换为图表组件
 * 返回混合内容数组：string（Markdown文本）| ChartConfig（图表）
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
