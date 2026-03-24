import { useEffect, useRef, useState, useCallback, useMemo } from "react";
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
  type CandlestickData,
  type HistogramData,
} from "lightweight-charts";
import { trpc } from "@/lib/trpc";
import { BarChart2, TrendingUp, Activity, RefreshCw, Maximize2, Minimize2, Settings2 } from "lucide-react";

// ── 时间周期配置 ──────────────────────────────────────────────────────────────
type Interval = "1min" | "5min" | "15min" | "30min" | "1h" | "4h" | "1day" | "1week" | "1month";

const INTERVALS: { label: string; value: Interval; outputsize: number }[] = [
  { label: "5日",  value: "1min",   outputsize: 390 },
  { label: "日K",  value: "1day",   outputsize: 180 },
  { label: "周K",  value: "1week",  outputsize: 104 },
  { label: "月K",  value: "1month", outputsize: 60  },
  { label: "1分",  value: "1min",   outputsize: 120 },
  { label: "5分",  value: "5min",   outputsize: 120 },
  { label: "15分", value: "15min",  outputsize: 120 },
  { label: "30分", value: "30min",  outputsize: 120 },
  { label: "1时",  value: "1h",     outputsize: 120 },
  { label: "4时",  value: "4h",     outputsize: 120 },
];

type ChartType = "candlestick" | "line" | "area";
type IndicatorKey = "MA5" | "MA10" | "MA20" | "MA60" | "BOLL" | "VOL" | "MACD" | "RSI" | "KDJ";

interface IndicatorConfig {
  key: IndicatorKey;
  label: string;
  color: string;
  panel: "main" | "sub";
}

const INDICATORS: IndicatorConfig[] = [
  { key: "MA5",  label: "MA5",  color: "#f59e0b", panel: "main" },
  { key: "MA10", label: "MA10", color: "#60a5fa", panel: "main" },
  { key: "MA20", label: "MA20", color: "#a78bfa", panel: "main" },
  { key: "MA60", label: "MA60", color: "#f97316", panel: "main" },
  { key: "BOLL", label: "BOLL", color: "#22d3ee", panel: "main" },
  { key: "VOL",  label: "成交量", color: "#6b7280", panel: "sub" },
  { key: "MACD", label: "MACD", color: "#10b981", panel: "sub" },
  { key: "RSI",  label: "RSI",  color: "#f59e0b", panel: "sub" },
  { key: "KDJ",  label: "KDJ",  color: "#ec4899", panel: "sub" },
];

// ── 技术指标计算 ──────────────────────────────────────────────────────────────
function calcMA(closes: number[], period: number): (number | null)[] {
  return closes.map((_, i) => {
    if (i < period - 1) return null;
    return closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
  });
}

function calcBOLL(closes: number[], period = 20, mult = 2) {
  const mid = calcMA(closes, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  closes.forEach((_, i) => {
    if (i < period - 1) { upper.push(null); lower.push(null); return; }
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = mid[i]!;
    const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
    upper.push(mean + mult * std);
    lower.push(mean - mult * std);
  });
  return { mid, upper, lower };
}

function calcRSI(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = Array(period).fill(null);
  for (let i = period; i < closes.length; i++) {
    let gains = 0, losses = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = closes[j] - closes[j - 1];
      if (diff > 0) gains += diff; else losses -= diff;
    }
    const rs = losses === 0 ? 100 : gains / losses;
    result.push(100 - 100 / (1 + rs));
  }
  return result;
}

function calcMACD(closes: number[], fast = 12, slow = 26, signal = 9) {
  const ema = (arr: number[], p: number) => {
    const k = 2 / (p + 1);
    const out: number[] = [arr[0]];
    for (let i = 1; i < arr.length; i++) out.push(arr[i] * k + out[i - 1] * (1 - k));
    return out;
  };
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macd = emaFast.map((v, i) => v - emaSlow[i]);
  const sig = ema(macd, signal);
  const hist = macd.map((v, i) => v - sig[i]);
  return { macd, signal: sig, hist };
}

function calcKDJ(highs: number[], lows: number[], closes: number[], period = 9) {
  const k: number[] = [], d: number[] = [], j: number[] = [];
  let prevK = 50, prevD = 50;
  for (let i = 0; i < closes.length; i++) {
    const start = Math.max(0, i - period + 1);
    const hh = Math.max(...highs.slice(start, i + 1));
    const ll = Math.min(...lows.slice(start, i + 1));
    const rsv = hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100;
    const kv = prevK * (2 / 3) + rsv * (1 / 3);
    const dv = prevD * (2 / 3) + kv * (1 / 3);
    k.push(kv); d.push(dv); j.push(3 * kv - 2 * dv);
    prevK = kv; prevD = dv;
  }
  return { k, d, j };
}

function fmtVol(v: number): string {
  if (v >= 1e8) return (v / 1e8).toFixed(2) + "亿";
  if (v >= 1e4) return (v / 1e4).toFixed(2) + "万";
  return v.toFixed(0);
}

interface PriceChartProps {
  symbol: string;
  colorScheme?: "cn" | "us";
  height?: number;
  quoteData?: {
    price?: number | null;
    high?: number | null;
    low?: number | null;
    open?: number | null;
    prevClose?: number | null;
    change?: number | null;
    changePercent?: number | null;
  };
}

export function PriceChart({ symbol, colorScheme = "cn", height = 280, quoteData }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const subContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const subChartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<any> | null>(null);
  const volSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const indicatorSeriesRef = useRef<Map<string, ISeriesApi<any>>>(new Map());
  const subSeriesRef = useRef<Map<string, ISeriesApi<any>>>(new Map());

  const [interval, setInterval] = useState<Interval>("1day");
  const [outputsize, setOutputsize] = useState(180);
  const [chartType, setChartType] = useState<ChartType>("candlestick");
  const [activeIndicators, setActiveIndicators] = useState<Set<IndicatorKey>>(new Set<IndicatorKey>(["MA5", "MA10", "MA20", "VOL"]));
  const [subIndicator, setSubIndicator] = useState<IndicatorKey | null>("VOL");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoverData, setHoverData] = useState<{
    time: string; open: number; high: number; low: number; close: number; volume?: number;
  } | null>(null);

  const upColor    = colorScheme === "cn" ? "#ef4444" : "#22c55e";
  const downColor  = colorScheme === "cn" ? "#22c55e" : "#ef4444";
  const upColorDim    = colorScheme === "cn" ? "rgba(239,68,68,0.2)"  : "rgba(34,197,94,0.2)";
  const downColorDim  = colorScheme === "cn" ? "rgba(34,197,94,0.2)"  : "rgba(239,68,68,0.2)";

  const { data, isLoading, refetch } = trpc.market.getPriceHistory.useQuery(
    { symbol, interval, outputsize },
    { enabled: !!symbol, staleTime: 60_000, retry: 1 }
  );

  const candles = data?.candles ?? [];

  // ── 计算指标数据 ──────────────────────────────────────────────────────────
  const indicatorData = useMemo(() => {
    if (!candles.length) return null;
    const closes = candles.map(c => c.close);
    const highs   = candles.map(c => c.high);
    const lows    = candles.map(c => c.low);
    const times   = candles.map(c => c.time as Time);

    const ma5  = calcMA(closes, 5);
    const ma10 = calcMA(closes, 10);
    const ma20 = calcMA(closes, 20);
    const ma60 = calcMA(closes, 60);
    const boll = calcBOLL(closes);
    const rsi  = calcRSI(closes);
    const macd = calcMACD(closes);
    const kdj  = calcKDJ(highs, lows, closes);

    const toSeries = (vals: (number | null)[]) =>
      vals.map((v, i) => v != null ? { time: times[i], value: v } : null)
          .filter(Boolean) as { time: Time; value: number }[];

    return {
      times,
      ma5:  toSeries(ma5),
      ma10: toSeries(ma10),
      ma20: toSeries(ma20),
      ma60: toSeries(ma60),
      bollMid:   toSeries(boll.mid),
      bollUpper: toSeries(boll.upper),
      bollLower: toSeries(boll.lower),
      rsi: toSeries(rsi),
      macdLine:   times.map((t, i) => ({ time: t, value: macd.macd[i] })),
      macdSignal: times.map((t, i) => ({ time: t, value: macd.signal[i] })),
      macdHist:   times.map((t, i) => ({
        time: t, value: macd.hist[i],
        color: macd.hist[i] >= 0 ? upColor : downColor,
      })),
      kdjK: times.map((t, i) => ({ time: t, value: kdj.k[i] })),
      kdjD: times.map((t, i) => ({ time: t, value: kdj.d[i] })),
      kdjJ: times.map((t, i) => ({ time: t, value: kdj.j[i] })),
    };
  }, [candles, upColor, downColor]);

  const CHART_OPTS = {
    layout: {
      background: { type: ColorType.Solid, color: "transparent" },
      textColor: "rgba(180,180,180,0.7)",
      fontSize: 11,
      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
    },
    grid: {
      vertLines: { color: "rgba(255,255,255,0.04)" },
      horzLines: { color: "rgba(255,255,255,0.04)" },
    },
    crosshair: { mode: CrosshairMode.Normal },
    rightPriceScale: { borderColor: "rgba(255,255,255,0.08)", textColor: "rgba(180,180,180,0.6)" },
    timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: true, secondsVisible: false },
    handleScroll: true,
    handleScale: true,
  };

  // ── 初始化主图表 ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, CHART_OPTS);
    chartRef.current = chart;

    chart.subscribeCrosshairMove(param => {
      if (!param.time || !seriesRef.current) { setHoverData(null); return; }
      const cd = param.seriesData.get(seriesRef.current) as CandlestickData | undefined;
      if (cd && "open" in cd) {
        const volS = volSeriesRef.current;
        const vd = volS ? param.seriesData.get(volS) as HistogramData | undefined : undefined;
        setHoverData({ time: String(param.time), open: cd.open, high: cd.high, low: cd.low, close: cd.close, volume: vd?.value });
      }
    });

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);
    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 重建主系列 ────────────────────────────────────────────────────────────
  const rebuildMainSeries = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (seriesRef.current) { try { chart.removeSeries(seriesRef.current); } catch {} seriesRef.current = null; }
    if (volSeriesRef.current) { try { chart.removeSeries(volSeriesRef.current); } catch {} volSeriesRef.current = null; }
    indicatorSeriesRef.current.forEach(s => { try { chart.removeSeries(s); } catch {} });
    indicatorSeriesRef.current.clear();

    if (chartType === "candlestick") {
      seriesRef.current = chart.addSeries(CandlestickSeries, {
        upColor, downColor, borderUpColor: upColor, borderDownColor: downColor,
        wickUpColor: upColor, wickDownColor: downColor, priceScaleId: "right",
      });
    } else if (chartType === "line") {
      seriesRef.current = chart.addSeries(LineSeries, { color: "#c9a84c", lineWidth: 2, priceScaleId: "right" });
    } else {
      seriesRef.current = chart.addSeries(AreaSeries, {
        topColor: "rgba(201,168,76,0.3)", bottomColor: "rgba(201,168,76,0.02)",
        lineColor: "#c9a84c", lineWidth: 2, priceScaleId: "right",
      });
    }

    if (subIndicator === "VOL") {
      volSeriesRef.current = chart.addSeries(HistogramSeries, { priceScaleId: "volume", priceFormat: { type: "volume" } });
      chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, borderVisible: false });
    }
  }, [chartType, upColor, downColor, subIndicator]);

  useEffect(() => { rebuildMainSeries(); }, [rebuildMainSeries]);

  // ── 填充主图数据 + 指标 ───────────────────────────────────────────────────
  useEffect(() => {
    if (!seriesRef.current || !candles.length || !indicatorData) return;
    const chart = chartRef.current;
    if (!chart) return;

    try {
      if (chartType === "candlestick") {
        seriesRef.current.setData(candles.map(c => ({
          time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close,
        })));
        if (volSeriesRef.current) {
          volSeriesRef.current.setData(candles.map(c => ({
            time: c.time as Time, value: c.volume ?? 0,
            color: c.close >= c.open ? upColorDim : downColorDim,
          })));
        }
      } else {
        seriesRef.current.setData(candles.map(c => ({ time: c.time as Time, value: c.close })));
      }

      // 清除旧指标系列
      indicatorSeriesRef.current.forEach(s => { try { chart.removeSeries(s); } catch {} });
      indicatorSeriesRef.current.clear();

      // MA 线
      const maConfig: Array<[IndicatorKey, typeof indicatorData.ma5, string]> = [
        ["MA5",  indicatorData.ma5,  "#f59e0b"],
        ["MA10", indicatorData.ma10, "#60a5fa"],
        ["MA20", indicatorData.ma20, "#a78bfa"],
        ["MA60", indicatorData.ma60, "#f97316"],
      ];
      maConfig.forEach(([key, d, color]) => {
        if (activeIndicators.has(key)) {
          const s = chart.addSeries(LineSeries, { color, lineWidth: 1, priceScaleId: "right", lastValueVisible: false, priceLineVisible: false });
          s.setData(d);
          indicatorSeriesRef.current.set(key, s);
        }
      });

      // BOLL
      if (activeIndicators.has("BOLL")) {
        const bMid = chart.addSeries(LineSeries, { color: "#22d3ee", lineWidth: 1, priceScaleId: "right", lastValueVisible: false, priceLineVisible: false });
        const bUp  = chart.addSeries(LineSeries, { color: "rgba(34,211,238,0.5)", lineWidth: 1, priceScaleId: "right", lastValueVisible: false, priceLineVisible: false });
        const bLo  = chart.addSeries(LineSeries, { color: "rgba(34,211,238,0.5)", lineWidth: 1, priceScaleId: "right", lastValueVisible: false, priceLineVisible: false });
        bMid.setData(indicatorData.bollMid);
        bUp.setData(indicatorData.bollUpper);
        bLo.setData(indicatorData.bollLower);
        indicatorSeriesRef.current.set("BOLL_MID", bMid);
        indicatorSeriesRef.current.set("BOLL_UP",  bUp);
        indicatorSeriesRef.current.set("BOLL_LO",  bLo);
      }

      chart.timeScale().fitContent();
    } catch {}
  }, [candles, indicatorData, chartType, activeIndicators, upColorDim, downColorDim]);

  // ── 子图表（MACD / RSI / KDJ）─────────────────────────────────────────────
  const hasSubChart = subIndicator && ["MACD", "RSI", "KDJ"].includes(subIndicator);

  useEffect(() => {
    if (!subContainerRef.current) return;
    if (subChartRef.current) { subChartRef.current.remove(); subChartRef.current = null; }
    if (!hasSubChart) return;

    const chart = createChart(subContainerRef.current, {
      ...CHART_OPTS,
      layout: { ...CHART_OPTS.layout, fontSize: 10 },
      rightPriceScale: { ...CHART_OPTS.rightPriceScale, scaleMargins: { top: 0.1, bottom: 0.1 } },
    });
    subChartRef.current = chart;
    subSeriesRef.current.clear();

    const ro = new ResizeObserver(() => {
      if (subContainerRef.current) chart.applyOptions({ width: subContainerRef.current.clientWidth });
    });
    ro.observe(subContainerRef.current);
    return () => { ro.disconnect(); if (subChartRef.current) { subChartRef.current.remove(); subChartRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSubChart]);

  useEffect(() => {
    const chart = subChartRef.current;
    if (!chart || !indicatorData || !candles.length) return;
    subSeriesRef.current.forEach(s => { try { chart.removeSeries(s); } catch {} });
    subSeriesRef.current.clear();

    try {
      if (subIndicator === "MACD") {
        const histS  = chart.addSeries(HistogramSeries, { priceScaleId: "right" });
        const macdS  = chart.addSeries(LineSeries, { color: "#10b981", lineWidth: 1, priceScaleId: "right", lastValueVisible: false, priceLineVisible: false });
        const sigS   = chart.addSeries(LineSeries, { color: "#f59e0b", lineWidth: 1, priceScaleId: "right", lastValueVisible: false, priceLineVisible: false });
        histS.setData(indicatorData.macdHist);
        macdS.setData(indicatorData.macdLine);
        sigS.setData(indicatorData.macdSignal);
        subSeriesRef.current.set("hist", histS);
        subSeriesRef.current.set("macd", macdS);
        subSeriesRef.current.set("signal", sigS);
      } else if (subIndicator === "RSI") {
        const rsiS = chart.addSeries(LineSeries, { color: "#f59e0b", lineWidth: 2 as any, priceScaleId: "right", lastValueVisible: true, priceLineVisible: false });
        rsiS.setData(indicatorData.rsi);
        subSeriesRef.current.set("rsi", rsiS);
      } else if (subIndicator === "KDJ") {
        const kS = chart.addSeries(LineSeries, { color: "#f59e0b", lineWidth: 1, priceScaleId: "right", lastValueVisible: false, priceLineVisible: false });
        const dS = chart.addSeries(LineSeries, { color: "#60a5fa", lineWidth: 1, priceScaleId: "right", lastValueVisible: false, priceLineVisible: false });
        const jS = chart.addSeries(LineSeries, { color: "#ec4899", lineWidth: 1, priceScaleId: "right", lastValueVisible: false, priceLineVisible: false });
        kS.setData(indicatorData.kdjK);
        dS.setData(indicatorData.kdjD);
        jS.setData(indicatorData.kdjJ);
        subSeriesRef.current.set("k", kS);
        subSeriesRef.current.set("d", dS);
        subSeriesRef.current.set("j", jS);
      }
      chart.timeScale().fitContent();
    } catch {}
  }, [indicatorData, subIndicator, candles]);

  const toggleIndicator = (key: IndicatorKey) => {
    const subKeys: IndicatorKey[] = ["VOL", "MACD", "RSI", "KDJ"];
    if (subKeys.includes(key)) {
      setSubIndicator(prev => prev === key ? null : key);
    }
    setActiveIndicators(prev => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  };

  const handleIntervalChange = (iv: Interval, size: number) => { setInterval(iv); setOutputsize(size); };

  // ── 盘口悬停数据 ──────────────────────────────────────────────────────────
  const lastCandle = candles[candles.length - 1];
  const displayData = hoverData ?? (lastCandle ? {
    time: lastCandle.time as string,
    open: lastCandle.open,
    high: lastCandle.high,
    low: lastCandle.low,
    close: lastCandle.close,
    volume: lastCandle.volume,
  } : null);

  const isUp = displayData ? displayData.close >= displayData.open : true;
  const priceColor = isUp ? upColor : downColor;
  const mainHeight = isFullscreen ? Math.max(400, window.innerHeight - 280) : height;

  return (
    <div
      className={`flex flex-col gap-0 w-full ${isFullscreen ? "fixed inset-0 z-50 p-4 overflow-auto" : ""}`}
      style={isFullscreen ? { background: "#0c0c0e" } : {}}
    >
      {/* ── 盘口数据行 ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-1 py-1.5 flex-wrap text-[11px] font-mono"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        {displayData && (
          <>
            <span className="font-bold text-[16px]" style={{ color: priceColor }}>
              {displayData.close.toFixed(2)}
            </span>
            <span style={{ color: "rgba(150,150,150,0.6)" }}>开</span>
            <span style={{ color: "rgba(200,200,200,0.85)" }}>{displayData.open.toFixed(2)}</span>
            <span style={{ color: "rgba(150,150,150,0.6)" }}>高</span>
            <span style={{ color: upColor }}>{displayData.high.toFixed(2)}</span>
            <span style={{ color: "rgba(150,150,150,0.6)" }}>低</span>
            <span style={{ color: downColor }}>{displayData.low.toFixed(2)}</span>
            {displayData.volume != null && (
              <>
                <span style={{ color: "rgba(150,150,150,0.6)" }}>量</span>
                <span style={{ color: "rgba(200,200,200,0.85)" }}>{fmtVol(displayData.volume)}</span>
              </>
            )}
          </>
        )}
        {quoteData?.prevClose != null && (
          <>
            <span style={{ color: "rgba(150,150,150,0.6)" }}>昨收</span>
            <span style={{ color: "rgba(200,200,200,0.85)" }}>{quoteData.prevClose.toFixed(2)}</span>
          </>
        )}
        {quoteData?.changePercent != null && (
          <span className="font-semibold" style={{ color: (quoteData.changePercent ?? 0) >= 0 ? upColor : downColor }}>
            {(quoteData.changePercent ?? 0) >= 0 ? "▲" : "▼"}{Math.abs(quoteData.changePercent ?? 0).toFixed(2)}%
          </span>
        )}
        {displayData?.time && (
          <span className="ml-auto" style={{ color: "rgba(100,100,100,0.6)" }}>{displayData.time}</span>
        )}
      </div>

      {/* ── 工具栏 ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 flex-wrap py-1.5">
        {/* 图表类型 */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }}>
          {([
            { type: "candlestick" as ChartType, icon: <BarChart2 className="w-3 h-3" />, label: "K线" },
            { type: "line"        as ChartType, icon: <TrendingUp className="w-3 h-3" />, label: "折线" },
            { type: "area"        as ChartType, icon: <Activity   className="w-3 h-3" />, label: "面积" },
          ] as const).map(({ type, icon, label }) => (
            <button key={type} onClick={() => setChartType(type)}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all"
              style={{
                background: chartType === type ? "rgba(201,168,76,0.15)" : "transparent",
                color: chartType === type ? "#c9a84c" : "rgba(120,120,120,0.8)",
                border: chartType === type ? "1px solid rgba(201,168,76,0.3)" : "1px solid transparent",
              }}>
              {icon} {label}
            </button>
          ))}
        </div>

        {/* 时间周期 */}
        <div className="flex items-center gap-0.5 flex-wrap">
          {INTERVALS.map(({ label, value, outputsize: size }) => (
            <button key={`${value}-${label}`} onClick={() => handleIntervalChange(value, size)}
              className="px-2 py-0.5 rounded text-[11px] font-mono font-medium transition-all"
              style={{
                background: interval === value && outputsize === size ? "rgba(201,168,76,0.15)" : "transparent",
                color: interval === value && outputsize === size ? "#c9a84c" : "rgba(100,100,100,0.9)",
                border: interval === value && outputsize === size ? "1px solid rgba(201,168,76,0.3)" : "1px solid transparent",
              }}>
              {label}
            </button>
          ))}
          <button onClick={() => refetch()} className="ml-1 p-1 rounded transition-all hover:opacity-80"
            style={{ color: "rgba(100,100,100,0.8)" }} title="刷新">
            <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={() => setIsFullscreen(f => !f)} className="ml-0.5 p-1 rounded transition-all hover:opacity-80"
            style={{ color: "rgba(100,100,100,0.8)" }} title={isFullscreen ? "退出全屏" : "全屏"}>
            {isFullscreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* ── 主图表 ───────────────────────────────────────────────────────────── */}
      <div className="relative w-full rounded-lg overflow-hidden"
        style={{ height: mainHeight, background: "rgba(255,255,255,0.015)" }}>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10"
            style={{ background: "rgba(12,12,14,0.8)" }}>
            <div className="flex flex-col items-center gap-2">
              <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: "#c9a84c", borderTopColor: "transparent" }} />
              <span className="text-[11px]" style={{ color: "rgba(120,120,120,0.8)" }}>加载中...</span>
            </div>
          </div>
        )}
        {!isLoading && !candles.length && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs" style={{ color: "rgba(80,80,80,0.8)" }}>暂无图表数据 · 请检查标的代码</span>
          </div>
        )}
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      </div>

      {/* ── 子图表（MACD / RSI / KDJ）──────────────────────────────────────── */}
      {hasSubChart && (
        <div className="relative w-full overflow-hidden mt-0.5"
          style={{ height: 100, background: "rgba(255,255,255,0.01)", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="absolute top-1 left-2 z-10 text-[10px] font-mono"
            style={{ color: "rgba(150,150,150,0.7)" }}>
            {subIndicator}
            {subIndicator === "MACD" && (
              <span style={{ color: "rgba(100,100,100,0.6)" }}>
                {" "}MACD<span style={{ color: "#10b981" }}>●</span>
                {" "}Signal<span style={{ color: "#f59e0b" }}>●</span>
              </span>
            )}
            {subIndicator === "KDJ" && (
              <span style={{ color: "rgba(100,100,100,0.6)" }}>
                {" "}K<span style={{ color: "#f59e0b" }}>●</span>
                {" "}D<span style={{ color: "#60a5fa" }}>●</span>
                {" "}J<span style={{ color: "#ec4899" }}>●</span>
              </span>
            )}
          </div>
          <div ref={subContainerRef} style={{ width: "100%", height: "100%" }} />
        </div>
      )}

      {/* ── 指标选择工具栏 ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 pt-1.5 flex-wrap">
        <Settings2 className="w-3 h-3 shrink-0" style={{ color: "rgba(100,100,100,0.5)" }} />
        {INDICATORS.map(ind => (
          <button key={ind.key} onClick={() => toggleIndicator(ind.key)}
            className="px-2 py-0.5 rounded text-[10px] font-mono transition-all"
            style={{
              background: activeIndicators.has(ind.key) ? `${ind.color}22` : "transparent",
              color: activeIndicators.has(ind.key) ? ind.color : "rgba(90,90,90,0.9)",
              border: activeIndicators.has(ind.key) ? `1px solid ${ind.color}55` : "1px solid rgba(60,60,60,0.5)",
            }}>
            {ind.label}
          </button>
        ))}
        {/* 图例 */}
        <div className="ml-auto flex items-center gap-1.5 text-[10px] font-mono">
          {activeIndicators.has("MA5")  && <span style={{ color: "#f59e0b" }}>MA5</span>}
          {activeIndicators.has("MA10") && <span style={{ color: "#60a5fa" }}>MA10</span>}
          {activeIndicators.has("MA20") && <span style={{ color: "#a78bfa" }}>MA20</span>}
          {activeIndicators.has("MA60") && <span style={{ color: "#f97316" }}>MA60</span>}
        </div>
      </div>
    </div>
  );
}
