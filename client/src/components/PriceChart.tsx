import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  AreaSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import { trpc } from "@/lib/trpc";
import { BarChart2, TrendingUp, Activity, RefreshCw } from "lucide-react";

// ── 时间周期配置 ──────────────────────────────────────────────────────────────
type Interval = "1min" | "5min" | "15min" | "30min" | "1h" | "4h" | "1day" | "1week" | "1month";

const INTERVALS: { label: string; value: Interval; outputsize: number }[] = [
  { label: "1分", value: "1min",   outputsize: 120 },
  { label: "5分", value: "5min",   outputsize: 120 },
  { label: "15分", value: "15min", outputsize: 120 },
  { label: "30分", value: "30min", outputsize: 120 },
  { label: "1时", value: "1h",     outputsize: 120 },
  { label: "4时", value: "4h",     outputsize: 120 },
  { label: "日",  value: "1day",   outputsize: 180 },
  { label: "周",  value: "1week",  outputsize: 104 },
  { label: "月",  value: "1month", outputsize: 60  },
];

type ChartType = "candlestick" | "line" | "area";

interface PriceChartProps {
  symbol: string;
  /** 红涨绿跌（中式）or 绿涨红跌（西式）*/
  colorScheme?: "cn" | "us";
  height?: number;
}

export function PriceChart({ symbol, colorScheme = "cn", height = 280 }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<any> | null>(null);
  const volSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  const [interval, setInterval] = useState<Interval>("1day");
  const [outputsize, setOutputsize] = useState(180);
  const [chartType, setChartType] = useState<ChartType>("candlestick");

  // 中式：红涨绿跌；西式：绿涨红跌
  const upColor   = colorScheme === "cn" ? "#ef4444" : "#22c55e";
  const downColor = colorScheme === "cn" ? "#22c55e" : "#ef4444";
  const upColorDim   = colorScheme === "cn" ? "rgba(239,68,68,0.25)"  : "rgba(34,197,94,0.25)";
  const downColorDim = colorScheme === "cn" ? "rgba(34,197,94,0.25)"  : "rgba(239,68,68,0.25)";

  const { data, isLoading, refetch } = trpc.market.getPriceHistory.useQuery(
    { symbol, interval, outputsize },
    { enabled: !!symbol, staleTime: 60_000, retry: 1 }
  );

  // ── 初始化图表 ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgba(200,200,200,0.7)",
        fontSize: 11,
        fontFamily: "'IBM Plex Mono', monospace",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.08)",
        textColor: "rgba(200,200,200,0.6)",
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: true,
      handleScale: true,
    });

    chartRef.current = chart;

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  // ── 更新系列（图表类型或配色变化时）────────────────────────────────────────
  const rebuildSeries = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // 移除旧系列
    if (seriesRef.current) { try { chart.removeSeries(seriesRef.current); } catch {} seriesRef.current = null; }
    if (volSeriesRef.current) { try { chart.removeSeries(volSeriesRef.current); } catch {} volSeriesRef.current = null; }

    if (chartType === "candlestick") {
      seriesRef.current = chart.addSeries(CandlestickSeries, {
        upColor,
        downColor,
        borderUpColor: upColor,
        borderDownColor: downColor,
        wickUpColor: upColor,
        wickDownColor: downColor,
        priceScaleId: "right",
      });
    } else if (chartType === "line") {
      seriesRef.current = chart.addSeries(LineSeries, {
        color: "oklch(0.78 0.18 85)",
        lineWidth: 2,
        priceScaleId: "right",
      });
    } else {
      seriesRef.current = chart.addSeries(AreaSeries, {
        topColor: "oklch(0.78 0.18 85 / 0.35)",
        bottomColor: "oklch(0.78 0.18 85 / 0.02)",
        lineColor: "oklch(0.78 0.18 85)",
        lineWidth: 2,
        priceScaleId: "right",
      });
    }

    // 成交量柱（仅 K 线图）
    if (chartType === "candlestick") {
      volSeriesRef.current = chart.addSeries(HistogramSeries, {
        priceScaleId: "volume",
        priceFormat: { type: "volume" },
      });
      chart.priceScale("volume").applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
        borderVisible: false,
      });
    }
  }, [chartType, upColor, downColor]);

  useEffect(() => { rebuildSeries(); }, [rebuildSeries]);

  // ── 填充数据 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!seriesRef.current || !data?.candles?.length) return;
    const candles = data.candles;

    try {
      if (chartType === "candlestick") {
        seriesRef.current.setData(
          candles.map(c => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close }))
        );
        if (volSeriesRef.current) {
          volSeriesRef.current.setData(
            candles.map(c => ({
              time: c.time as Time,
              value: c.volume ?? 0,
              color: c.close >= c.open ? upColorDim : downColorDim,
            }))
          );
        }
      } else {
        seriesRef.current.setData(
          candles.map(c => ({ time: c.time as Time, value: c.close }))
        );
      }
      chartRef.current?.timeScale().fitContent();
    } catch {}
  }, [data, chartType, upColorDim, downColorDim]);

  // ── 切换时间周期 ──────────────────────────────────────────────────────────
  const handleIntervalChange = (iv: Interval, size: number) => {
    setInterval(iv);
    setOutputsize(size);
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {/* Chart type switcher */}
        <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: "oklch(0.14 0 0)" }}>
          {([
            { type: "candlestick" as ChartType, icon: <BarChart2 className="w-3.5 h-3.5" />, label: "K线" },
            { type: "line"        as ChartType, icon: <TrendingUp className="w-3.5 h-3.5" />, label: "折线" },
            { type: "area"        as ChartType, icon: <Activity   className="w-3.5 h-3.5" />, label: "面积" },
          ] as const).map(({ type, icon, label }) => (
            <button
              key={type}
              onClick={() => setChartType(type)}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all"
              style={{
                background: chartType === type ? "oklch(0.78 0.18 85 / 0.15)" : "transparent",
                color: chartType === type ? "oklch(0.78 0.18 85)" : "oklch(0.5 0 0)",
                border: chartType === type ? "1px solid oklch(0.78 0.18 85 / 0.3)" : "1px solid transparent",
              }}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Interval pills */}
        <div className="flex items-center gap-0.5 flex-wrap">
          {INTERVALS.map(({ label, value, outputsize: size }) => (
            <button
              key={value}
              onClick={() => handleIntervalChange(value, size)}
              className="px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-all"
              style={{
                background: interval === value ? "oklch(0.78 0.18 85 / 0.15)" : "transparent",
                color: interval === value ? "oklch(0.78 0.18 85)" : "oklch(0.45 0 0)",
                border: interval === value ? "1px solid oklch(0.78 0.18 85 / 0.3)" : "1px solid transparent",
              }}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => refetch()}
            className="ml-1 p-1 rounded transition-all hover:opacity-80"
            style={{ color: "oklch(0.45 0 0)" }}
            title="刷新"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Chart container */}
      <div className="relative w-full rounded-lg overflow-hidden" style={{ height, background: "oklch(0.1 0 0 / 0.4)" }}>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10"
            style={{ background: "oklch(0.1 0 0 / 0.7)" }}>
            <div className="flex flex-col items-center gap-2">
              <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: "oklch(0.78 0.18 85)", borderTopColor: "transparent" }} />
              <span className="text-[10px]" style={{ color: "oklch(0.45 0 0)" }}>加载中...</span>
            </div>
          </div>
        )}
        {!isLoading && (!data?.candles?.length) && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs" style={{ color: "oklch(0.4 0 0)" }}>暂无图表数据 · 请检查标的代码</span>
          </div>
        )}
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      </div>
    </div>
  );
}
