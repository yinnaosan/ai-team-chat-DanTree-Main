/**
 * PriceChart — 券商平台标准 K 线图
 * 参照富途牛牛 / 东方财富 / 同花顺布局规范
 *
 * 时间轴规则（与 lightweight-charts tickMarkFormatter 对齐）：
 *   - 月K / 周K：YYYY/MM
 *   - 日K：MM/DD（跨年时 YYYY/MM/DD）
 *   - 分钟K：HH:MM（日期变化时显示 MM/DD）
 *
 * 休盘处理：后端返回 Unix 时间戳（秒），前端直接交给 lightweight-charts
 * 的 `tickMarkFormatter`；非交易时段的 gap 由 lightweight-charts 自动跳过
 * （因为数据本身就没有那些时间点）。
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  AreaSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  TickMarkType,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type CandlestickData,
  type HistogramData,
} from "lightweight-charts";
import { trpc } from "@/lib/trpc";
import {
  BarChart2,
  TrendingUp,
  Activity,
  RefreshCw,
  Maximize2,
  Minimize2,
  Settings2,
  Radio,
  GitCompare,
  X,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// 类型 & 常量
// ─────────────────────────────────────────────────────────────────────────────
type Interval =
  | "1min" | "5min" | "15min" | "30min"
  | "1h"   | "4h"
  | "1day" | "1week" | "1month";

const INTERVALS: { label: string; value: Interval; outputsize: number }[] = [
  { label: "5日",  value: "1min",   outputsize: 390  },
  { label: "日K",  value: "1day",   outputsize: 240  },
  { label: "周K",  value: "1week",  outputsize: 104  },
  { label: "月K",  value: "1month", outputsize: 60   },
  { label: "1分",  value: "1min",   outputsize: 120  },
  { label: "5分",  value: "5min",   outputsize: 120  },
  { label: "15分", value: "15min",  outputsize: 120  },
  { label: "30分", value: "30min",  outputsize: 120  },
  { label: "1时",  value: "1h",     outputsize: 120  },
  { label: "4时",  value: "4h",     outputsize: 120  },
];

type ChartType = "candlestick" | "line" | "area";
type IndicatorKey = "MA5" | "MA10" | "MA20" | "MA60" | "BOLL" | "VOL" | "MACD" | "RSI" | "KDJ";

const INDICATORS: { key: IndicatorKey; label: string; color: string; panel: "main" | "sub" }[] = [
  { key: "MA5",  label: "MA5",   color: "#f59e0b", panel: "main" },
  { key: "MA10", label: "MA10",  color: "#60a5fa", panel: "main" },
  { key: "MA20", label: "MA20",  color: "#a78bfa", panel: "main" },
  { key: "MA60", label: "MA60",  color: "#f97316", panel: "main" },
  { key: "BOLL", label: "BOLL",  color: "#22d3ee", panel: "main" },
  { key: "VOL",  label: "成交量", color: "#6b7280", panel: "sub"  },
  { key: "MACD", label: "MACD",  color: "#10b981", panel: "sub"  },
  { key: "RSI",  label: "RSI",   color: "#f59e0b", panel: "sub"  },
  { key: "KDJ",  label: "KDJ",   color: "#ec4899", panel: "sub"  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 技术指标计算
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 时间轴格式化（券商平台标准）
// ─────────────────────────────────────────────────────────────────────────────
/**
 * 将 lightweight-charts 的 Time（Unix 秒 或 "YYYY-MM-DD" 字符串）转为 Date
 */
function timeToDate(t: Time): Date {
  if (typeof t === "number") return new Date(t * 1000);
  if (typeof t === "string") return new Date(t + "T00:00:00Z");
  // BusinessDay { year, month, day }
  return new Date(Date.UTC(t.year, t.month - 1, t.day));
}

/**
 * tickMarkFormatter — 按 TickMarkType 返回对应格式
 * TickMarkType: Year=0, Month=1, DayOfMonth=2, Time=3, TimeWithSeconds=4
 */
function makeTickMarkFormatter(interval: Interval) {
  return (time: Time, tickType: TickMarkType): string => {
    const d = timeToDate(time);
    const yy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mi = String(d.getUTCMinutes()).padStart(2, "0");

    const isIntraday = ["1min", "5min", "15min", "30min", "1h", "4h"].includes(interval);

    if (isIntraday) {
      // 日内：时间变化显示 HH:MM，日期变化显示 MM/DD
      if (tickType === TickMarkType.DayOfMonth || tickType === TickMarkType.Month || tickType === TickMarkType.Year) {
        return `${mm}/${dd}`;
      }
      return `${hh}:${mi}`;
    }

    if (interval === "1month" || interval === "1week") {
      if (tickType === TickMarkType.Year) return `${yy}`;
      return `${yy}/${mm}`;
    }

    // 日K
    if (tickType === TickMarkType.Year) return `${yy}`;
    if (tickType === TickMarkType.Month) return `${yy}/${mm}`;
    return `${mm}/${dd}`;
  };
}

/**
 * 十字线时间格式化
 */
function makeTimeFormatter(interval: Interval) {
  return (t: Date): string => {
    const yy = t.getUTCFullYear();
    const mm = String(t.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(t.getUTCDate()).padStart(2, "0");
    const hh = String(t.getUTCHours()).padStart(2, "0");
    const mi = String(t.getUTCMinutes()).padStart(2, "0");
    const isIntraday = ["1min", "5min", "15min", "30min", "1h", "4h"].includes(interval);
    if (isIntraday) return `${yy}/${mm}/${dd} ${hh}:${mi}`;
    if (interval === "1month") return `${yy}/${mm}`;
    if (interval === "1week") return `${yy}/${mm}/${dd}`;
    return `${yy}/${mm}/${dd}`;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 辅助
// ─────────────────────────────────────────────────────────────────────────────
function fmtVol(v: number): string {
  if (v >= 1e8) return (v / 1e8).toFixed(2) + "亿";
  if (v >= 1e4) return (v / 1e4).toFixed(2) + "万";
  return v.toFixed(0);
}

function fmtPrice(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "--";
  return v.toFixed(2);
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 主组件
// ─────────────────────────────────────────────────────────────────────────────
export function PriceChart({ symbol, colorScheme = "cn", height = 300, quoteData }: PriceChartProps) {
  const containerRef    = useRef<HTMLDivElement>(null);
  const subContainerRef = useRef<HTMLDivElement>(null);
  const chartRef        = useRef<IChartApi | null>(null);
  const subChartRef     = useRef<IChartApi | null>(null);
  const seriesRef       = useRef<ISeriesApi<any> | null>(null);
  const volSeriesRef    = useRef<ISeriesApi<"Histogram"> | null>(null);
  const indicatorSeriesRef = useRef<Map<string, ISeriesApi<any>>>(new Map());
  const subSeriesRef       = useRef<Map<string, ISeriesApi<any>>>(new Map());

  const [interval, setIntervalState]   = useState<Interval>("1day");
  const [outputsize, setOutputsize]    = useState(240);
  const [chartType, setChartType]      = useState<ChartType>("candlestick");
  const [activeIndicators, setActiveIndicators] = useState<Set<IndicatorKey>>(
    new Set<IndicatorKey>(["MA5", "MA10", "MA20", "VOL"])
  );
  const [subIndicator, setSubIndicator] = useState<IndicatorKey | null>("VOL");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [liveStatus, setLiveStatus] = useState<"connecting" | "live" | "offline">("offline");
  const [lastTickPrice, setLastTickPrice] = useState<number | null>(null);
  const [liveSession, setLiveSession] = useState<string | null>(null);   // trading/lunch/pre_market/post_market/closed
  const [liveIntervalMs, setLiveIntervalMs] = useState<number | null>(null); // 当前轮询间隔
  const sseRef = useRef<EventSource | null>(null);
  // 对比模式
  const [compareSymbol, setCompareSymbol] = useState<string | null>(null);
  const [compareInput, setCompareInput] = useState("");
  const [showCompareInput, setShowCompareInput] = useState(false);
  const compareSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const [hoverData, setHoverData] = useState<{
    time: string; open: number; high: number; low: number; close: number; volume?: number;
  } | null>(null);
  const [compareHover, setCompareHover] = useState<{
    time: string; mainPct: number | null; comparePct: number | null;
  } | null>(null);  // ── 日内周期判断 ─────────────────────────────────────────────────────────────
  const isIntraday = ["1min", "5min", "15min", "30min", "1h", "4h"].includes(interval);
  const isCompareMode = !!compareSymbol;

  // ── 标的市场判断 ─────────────────────────────────────────────────────────────
  /** 判断是否为A股代码 */
  const isAShare = (sym: string) => {
    const s = sym.toUpperCase();
    return /^(SH|SZ|BJ)\./i.test(s) || /^\d{6}\.(SS|SZ|BJ)$/i.test(s) || /^\d{6}$/.test(s);
  };
  /** 判断是否为港股代码 */
  const isHKShare = (sym: string) => {
    const s = sym.toUpperCase();
    return /^\d{1,5}\.HK$/.test(s) || /^\d{4,5}$/.test(s);
  };
  /** 获取实时Tick的SSE端点路径 */
  const getTickerStreamUrl = (sym: string) => {
    if (isAShare(sym)) return `/api/ticker-stream-cn/${encodeURIComponent(sym)}`;
    if (isHKShare(sym)) return `/api/ticker-stream-hk/${encodeURIComponent(sym)}`;
    return `/api/ticker-stream/${encodeURIComponent(sym)}`; // 美股（Finnhub）
  };
  // ── 实时 Tick SSE（日内周期时自动连接）────────────────────────────────────
  useEffect(() => {
    if (!isIntraday || !symbol) {
      // 非日内周期：断开 SSE
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      setLiveStatus("offline");
      setLastTickPrice(null);
      return;
    }

    setLiveStatus("connecting");
    // 自动识别市场：A股 / 港股 / 美股，选择对应的 SSE 端点
    const sseUrl = getTickerStreamUrl(symbol);
    const sse = new EventSource(sseUrl, { withCredentials: true });
    sseRef.current = sse;

    sse.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data) as {
          type?: string; symbol?: string; price?: number; timestamp?: number; volume?: number;
          session?: string; interval_ms?: number;
        };
        if (payload.type === "connected") {
          setLiveStatus("live");
          if (payload.session) setLiveSession(payload.session);
          if (payload.interval_ms) setLiveIntervalMs(payload.interval_ms);
          return;
        }
        // 实时 trade 事件：更新最后一根 K 线
        if (payload.price && seriesRef.current) {
          const price = payload.price;
          setLastTickPrice(price);
          // 更新时段和轮询间隔
          if (payload.session) setLiveSession(payload.session);
          if (payload.interval_ms) setLiveIntervalMs(payload.interval_ms);
          const ts = payload.timestamp ?? Date.now();
          // 计算当前 bar 的时间（向下取整到当前 interval）
          const intervalSecs: Record<string, number> = {
            "1min": 60, "5min": 300, "15min": 900,
            "30min": 1800, "1h": 3600, "4h": 14400,
          };
          const barSecs = intervalSecs[interval] ?? 60;
          const barTime = Math.floor(ts / 1000 / barSecs) * barSecs as Time;

          try {
            // 用 update 更新最后一根 bar（lightweight-charts 会自动合并到已有 bar）
            if (chartType === "candlestick") {
              const lastCandle = candles[candles.length - 1];
              if (lastCandle) {
                const isCurrentBar = (lastCandle.time as number) === barTime;
                if (isCurrentBar) {
                  seriesRef.current.update({
                    time: barTime,
                    open:  lastCandle.open,
                    high:  Math.max(lastCandle.high, price),
                    low:   Math.min(lastCandle.low, price),
                    close: price,
                  });
                } else {
                  // 新 bar
                  seriesRef.current.update({
                    time: barTime,
                    open: price, high: price, low: price, close: price,
                  });
                }
              }
            } else {
              seriesRef.current.update({ time: barTime, value: price });
            }
            // 更新成交量柱（竞价/撮合时段用黄色区分）
            if (volSeriesRef.current && payload.volume != null) {
              const sess = payload.session ?? "";
              const isAuction = sess === "pre_auction" || sess === "post_auction";
              const volColor = isAuction
                ? "rgba(245,158,11,0.6)"   // 黄色：竞价/撮合成交量
                : (price >= (candles[candles.length - 1]?.open ?? price)
                    ? "rgba(34,197,94,0.4)"  // 绿色：上涨
                    : "rgba(239,68,68,0.4)"); // 红色：下跌
              try {
                volSeriesRef.current.update({
                  time: barTime,
                  value: payload.volume,
                  color: volColor,
                });
              } catch { /* ignore */ }
            }
          } catch { /* ignore stale update */ }
        }
      } catch { /* ignore parse errors */ }
    };

    sse.onerror = () => {
      setLiveStatus("offline");
    };

    return () => {
      sse.close();
      sseRef.current = null;
      setLiveStatus("offline");
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isIntraday, symbol, interval]);

  // A股红涨绿跌，美股绿涨红跌
  const upColor       = colorScheme === "cn" ? "#ef4444" : "#22c55e";
  const downColor     = colorScheme === "cn" ? "#22c55e" : "#ef4444";
  const upColorDim    = colorScheme === "cn" ? "rgba(239,68,68,0.25)"  : "rgba(34,197,94,0.25)";
  const downColorDim  = colorScheme === "cn" ? "rgba(34,197,94,0.25)"  : "rgba(239,68,68,0.25)";

   // ── 对比标的数据获取 ───────────────────────────────────────────────────────
  const { data: compareData } = trpc.market.getPriceHistory.useQuery(
    { symbol: compareSymbol ?? "", interval, outputsize },
    { enabled: !!compareSymbol, staleTime: 60_000, retry: 1 }
  );

  const compareCandles = useMemo(() => {
    if (!compareSymbol) return [];
    const raw = compareData?.candles ?? [];
    return raw.filter((c: { open: number; close: number; high: number; low: number }) => c.open > 0 && c.close > 0);
  }, [compareData, compareSymbol]);

  // ── 数据获取 ──────────────────────────────────────────────────────────
  const { data, isLoading, refetch } = trpc.market.getPriceHistory.useQuery(
    { symbol, interval, outputsize },
    {
      enabled: !!symbol,
      staleTime: interval === "1day" ? 5 * 60_000 : 60_000,
      retry: 1,
      refetchInterval: interval === "1day" ? false : 60_000, // 日内每分钟刷新
    }
  );

  const candles = useMemo(() => {
    const raw = data?.candles ?? [];
    // 过滤掉 OHLC 全为 0 的无效 bar（休盘填充数据）
    return raw.filter(c => c.open > 0 && c.close > 0 && c.high > 0 && c.low > 0);
  }, [data]);

  // ── 技术指标计算 ──────────────────────────────────────────────────────────
  const indicatorData = useMemo(() => {
    if (!candles.length) return null;
    const closes = candles.map(c => c.close);
    const highs   = candles.map(c => c.high);
    const lows    = candles.map(c => c.low);
    const times   = candles.map(c => c.time as Time);

    const toSeries = (vals: (number | null)[]) =>
      vals.map((v, i) => v != null ? { time: times[i], value: v } : null)
          .filter(Boolean) as { time: Time; value: number }[];

    const ma5  = calcMA(closes, 5);
    const ma10 = calcMA(closes, 10);
    const ma20 = calcMA(closes, 20);
    const ma60 = calcMA(closes, 60);
    const boll = calcBOLL(closes);
    const rsi  = calcRSI(closes);
    const macd = calcMACD(closes);
    const kdj  = calcKDJ(highs, lows, closes);

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

  // ── 对比图归一化数据计算（先对齐时间轴，再归一化）──────────────────────────────────────────────────────────
  /**
   * 对齐两个标的的时间轴：取交集（共同交易时段），裁剪后分别归一化为百分比变化
   * 处理美股 vs A股等交易时段不同的情况
   */
  const { normalizedMain, normalizedCompare } = useMemo(() => {
    if (!candles.length) return { normalizedMain: [], normalizedCompare: [] };

    // 如果没有对比数据，只归一化主图
    if (!compareCandles.length) {
      const base = candles[0].close;
      if (!base) return { normalizedMain: [], normalizedCompare: [] };
      return {
        normalizedMain: candles.map(c => ({ time: c.time as Time, value: ((c.close - base) / base) * 100 })),
        normalizedCompare: [],
      };
    }

    // 构建对比标的时间戳 Set（用于快速查找）
    const compareTimeSet = new Set(compareCandles.map(c => c.time));
    const mainTimeSet    = new Set(candles.map(c => c.time));

    // 取交集：两个标的都有数据的时间戳
    const alignedMain    = candles.filter(c => compareTimeSet.has(c.time));
    const alignedCompare = compareCandles.filter(c => mainTimeSet.has(c.time));

    // 如果交集为空（完全不重叠，如美股 vs A股），回退到各自归一化
    if (!alignedMain.length || !alignedCompare.length) {
      const mainBase = candles[0].close;
      const cmpBase  = compareCandles[0].close;
      return {
        normalizedMain:    mainBase ? candles.map(c => ({ time: c.time as Time, value: ((c.close - mainBase) / mainBase) * 100 })) : [],
        normalizedCompare: cmpBase  ? compareCandles.map(c => ({ time: c.time as Time, value: ((c.close - cmpBase) / cmpBase) * 100 })) : [],
      };
    }

    // 对齐后归一化（以对齐后第一根 K 线为基准）
    const mainBase = alignedMain[0].close;
    const cmpBase  = alignedCompare[0].close;
    return {
      normalizedMain:    mainBase ? alignedMain.map(c => ({ time: c.time as Time, value: ((c.close - mainBase) / mainBase) * 100 })) : [],
      normalizedCompare: cmpBase  ? alignedCompare.map(c => ({ time: c.time as Time, value: ((c.close - cmpBase) / cmpBase) * 100 })) : [],
    };
  }, [candles, compareCandles]);

  // 对比模式下主标的当前涨跌幅
  const mainPct    = normalizedMain.length    ? normalizedMain[normalizedMain.length - 1].value    : null;
  const comparePct = normalizedCompare.length ? normalizedCompare[normalizedCompare.length - 1].value : null;

  // ── 图表配置（依赖 interval 变化）──────────────────────────────────────────────────────────
  const chartOpts = useMemo(() => ({
    layout: {
      background: { type: ColorType.Solid, color: "transparent" },
      textColor: "rgba(160,160,160,0.85)",
      fontSize: 11,
      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
    },
    grid: {
      vertLines: { color: "rgba(255,255,255,0.04)" },
      horzLines: { color: "rgba(255,255,255,0.04)" },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: "rgba(201,168,76,0.5)", labelBackgroundColor: "#c9a84c" },
      horzLine: { color: "rgba(201,168,76,0.5)", labelBackgroundColor: "#c9a84c" },
    },
    rightPriceScale: {
      borderColor: "rgba(255,255,255,0.06)",
      textColor: "rgba(150,150,150,0.7)",
      scaleMargins: { top: 0.08, bottom: 0.08 },
    },
    timeScale: {
      borderColor: "rgba(255,255,255,0.06)",
      timeVisible: true,
      secondsVisible: false,
      tickMarkFormatter: makeTickMarkFormatter(interval),
      rightOffset: 5,
      barSpacing: 8,
      minBarSpacing: 2,
      fixLeftEdge: false,
      fixRightEdge: false,
    },
    localization: {
      timeFormatter: makeTimeFormatter(interval),
    },
    handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true },
    handleScale:  { axisPressedMouseMove: true, mouseWheel: false, pinch: true },
  }), [interval]);

  // ── 初始化主图表 ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, chartOpts);
    chartRef.current = chart;

    chart.subscribeCrosshairMove(param => {
      if (!param.time || !seriesRef.current) { setHoverData(null); setCompareHover(null); return; }
      const fmt = makeTimeFormatter(interval);
      const d = timeToDate(param.time as Time);
      const timeStr = fmt(d);

      // 对比模式：读取主图归一化折线数据
      if (compareSeriesRef.current) {
        const mainLineData = param.seriesData.get(seriesRef.current) as { value?: number } | undefined;
        const cmpLineData  = param.seriesData.get(compareSeriesRef.current) as { value?: number } | undefined;
        if (mainLineData?.value != null || cmpLineData?.value != null) {
          setCompareHover({
            time: timeStr,
            mainPct:    mainLineData?.value  ?? null,
            comparePct: cmpLineData?.value   ?? null,
          });
          setHoverData(null);
          return;
        }
        setCompareHover(null);
      }

      // 普通模式：读取 K 线数据
      const cd = param.seriesData.get(seriesRef.current) as CandlestickData | undefined;
      if (cd && "open" in cd) {
        const volS = volSeriesRef.current;
        const vd = volS ? param.seriesData.get(volS) as HistogramData | undefined : undefined;
        setHoverData({
          time: timeStr,
          open: cd.open, high: cd.high, low: cd.low, close: cd.close,
          volume: vd?.value,
        });
      } else {
        // 折线/面积图模式
        const ld = param.seriesData.get(seriesRef.current) as { value?: number } | undefined;
        if (ld?.value != null && param.time) {
          setHoverData({
            time: timeStr,
            open: ld.value, high: ld.value, low: ld.value, close: ld.value,
          });
        } else {
          setHoverData(null);
        }
      }
    });

    let disposed = false;
    const ro = new ResizeObserver(() => {
      if (!disposed && containerRef.current) {
        try { chart.applyOptions({ width: containerRef.current.clientWidth }); } catch {}
      }
    });
    ro.observe(containerRef.current);

    // ── Mac trackpad 手势支持 ─────────────────────────────────────────────
    // ctrlKey=true 表示 Mac trackpad 捏合手势（pinch-to-zoom）
    // ctrlKey=false 表示普通双指滑动（pan）
    const wheelEl = containerRef.current;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (disposed) return;
      const ts = chart.timeScale();
      const range = ts.getVisibleLogicalRange();
      if (!range) return;

      const span = range.to - range.from;

      if (e.ctrlKey) {
        // 捏合缩放：deltaY > 0 缩小（zoom out），deltaY < 0 放大（zoom in）
        // 通过缩放可见逻辑范围实现缩放
        const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9; // >1 缩小，<1 放大
        const newSpan = span * zoomFactor;
        const center = (range.from + range.to) / 2;
        try {
          ts.setVisibleLogicalRange({
            from: center - newSpan / 2,
            to:   center + newSpan / 2,
          });
        } catch {}
      } else {
        // 双指水平滑动：deltaX 控制时间轴左右平移
        // 正值向右（向未来），负值向左（向过去）
        const scrollDelta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
        const shift = scrollDelta * span * 0.003;
        try {
          ts.setVisibleLogicalRange({
            from: range.from + shift,
            to:   range.to   + shift,
          });
        } catch {}
      }
    };
    wheelEl?.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      disposed = true;
      ro.disconnect();
      wheelEl?.removeEventListener("wheel", handleWheel);
      try { chart.remove(); } catch {}
      chartRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // interval 变化时更新时间轴格式
  useEffect(() => {
    if (!chartRef.current) return;
    try {
      chartRef.current.applyOptions({
        timeScale: { tickMarkFormatter: makeTickMarkFormatter(interval) },
        localization: { timeFormatter: makeTimeFormatter(interval) },
      });
    } catch {}
  }, [interval]);

  // ── 重建主系列 ────────────────────────────────────────────────────────────
  const rebuildMainSeries = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (seriesRef.current)    { try { chart.removeSeries(seriesRef.current); }    catch {} seriesRef.current = null; }
    if (volSeriesRef.current) { try { chart.removeSeries(volSeriesRef.current); } catch {} volSeriesRef.current = null; }
    indicatorSeriesRef.current.forEach(s => { try { chart.removeSeries(s); } catch {} });
    indicatorSeriesRef.current.clear();

    if (chartType === "candlestick") {
      seriesRef.current = chart.addSeries(CandlestickSeries, {
        upColor, downColor,
        borderUpColor: upColor, borderDownColor: downColor,
        wickUpColor: upColor, wickDownColor: downColor,
        priceScaleId: "right",
      });
    } else if (chartType === "line") {
      seriesRef.current = chart.addSeries(LineSeries, {
        color: "#c9a84c", lineWidth: 2, priceScaleId: "right",
      });
    } else {
      seriesRef.current = chart.addSeries(AreaSeries, {
        topColor: "rgba(201,168,76,0.3)", bottomColor: "rgba(201,168,76,0.02)",
        lineColor: "#c9a84c", lineWidth: 2, priceScaleId: "right",
      });
    }

    if (subIndicator === "VOL") {
      volSeriesRef.current = chart.addSeries(HistogramSeries, {
        priceScaleId: "volume",
        priceFormat: { type: "volume" },
      });
      chart.priceScale("volume").applyOptions({
        scaleMargins: { top: 0.80, bottom: 0 },
        borderVisible: false,
      });
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
          time: c.time as Time,
          open: c.open, high: c.high, low: c.low, close: c.close,
        })));
        if (volSeriesRef.current) {
          volSeriesRef.current.setData(candles.map(c => ({
            time: c.time as Time,
            value: c.volume ?? 0,
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
          const s = chart.addSeries(LineSeries, {
            color, lineWidth: 1, priceScaleId: "right",
            lastValueVisible: false, priceLineVisible: false,
          });
          s.setData(d);
          indicatorSeriesRef.current.set(key, s);
        }
      });

      // BOLL
      if (activeIndicators.has("BOLL")) {
        const bMid = chart.addSeries(LineSeries, { color: "#22d3ee",             lineWidth: 1, priceScaleId: "right", lastValueVisible: false, priceLineVisible: false });
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

  // ── 对比图渲染（归一化双色折线叠加）──────────────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // 清除旧对比系列
    if (compareSeriesRef.current) {
      try { chart.removeSeries(compareSeriesRef.current); } catch {}
      compareSeriesRef.current = null;
    }

    if (!isCompareMode || !normalizedMain.length) {
      // 非对比模式：正常显示原始数据
      if (seriesRef.current && candles.length) {
        try {
          if (chartType === "candlestick") {
            seriesRef.current.setData(candles.map(c => ({
              time: c.time as Time,
              open: c.open, high: c.high, low: c.low, close: c.close,
            })));
          } else {
            seriesRef.current.setData(candles.map(c => ({ time: c.time as Time, value: c.close })));
          }
        } catch {}
      }
      return;
    }

    // 对比模式：主图改为归一化折线
    try {
      if (seriesRef.current) {
        // 将主图改为折线模式并设置归一化数据
        seriesRef.current.setData(normalizedMain);
      }
      // 添加对比标的系列
      if (normalizedCompare.length) {
        const cmpSeries = chart.addSeries(LineSeries, {
          color: "#60a5fa",
          lineWidth: 2,
          priceScaleId: "right",
          lastValueVisible: true,
          priceLineVisible: false,
          title: compareSymbol ?? "",
        });
        cmpSeries.setData(normalizedCompare);
        compareSeriesRef.current = cmpSeries;
      }
      chart.timeScale().fitContent();
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCompareMode, normalizedMain, normalizedCompare, compareSymbol]);

  // ── 子图表（MACD / RSI / KDJ）─────────────────────────────────────────────────────────────────
  const hasSubChart = subIndicator && ["MACD", "RSI", "KDJ"].includes(subIndicator);

  useEffect(() => {
    if (!subContainerRef.current) return;
    if (subChartRef.current) { try { subChartRef.current.remove(); } catch {} subChartRef.current = null; }
    if (!hasSubChart) return;

    const subOpts = {
      ...chartOpts,
      layout: { ...chartOpts.layout, fontSize: 10 },
      rightPriceScale: { ...chartOpts.rightPriceScale, scaleMargins: { top: 0.1, bottom: 0.1 } },
    };
    const chart = createChart(subContainerRef.current, subOpts);
    subChartRef.current = chart;
    subSeriesRef.current.clear();

    let subDisposed = false;
    const ro = new ResizeObserver(() => {
      if (!subDisposed && subContainerRef.current) {
        try { chart.applyOptions({ width: subContainerRef.current.clientWidth }); } catch {}
      }
    });
    ro.observe(subContainerRef.current);
    // 子图表也支持 Mac trackpad 手势，并与主图表时间轴同步
    const subWheelEl = subContainerRef.current;
    const handleSubWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (subDisposed) return;
      const mainChart = chartRef.current;
      const mainTs = mainChart?.timeScale();
      const subTs = chart.timeScale();
      const range = mainTs?.getVisibleLogicalRange() ?? subTs.getVisibleLogicalRange();
      if (!range) return;
      const span = range.to - range.from;
      if (e.ctrlKey) {
        const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
        const newSpan = span * zoomFactor;
        const center = (range.from + range.to) / 2;
        const newRange = { from: center - newSpan / 2, to: center + newSpan / 2 };
        try { mainTs?.setVisibleLogicalRange(newRange); } catch {}
        try { subTs.setVisibleLogicalRange(newRange); } catch {}
      } else {
        const scrollDelta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
        const shift = scrollDelta * span * 0.003;
        const newRange = { from: range.from + shift, to: range.to + shift };
        try { mainTs?.setVisibleLogicalRange(newRange); } catch {}
        try { subTs.setVisibleLogicalRange(newRange); } catch {}
      }
    };
    subWheelEl?.addEventListener("wheel", handleSubWheel, { passive: false });

    return () => {
      subDisposed = true;
      ro.disconnect();
      subWheelEl?.removeEventListener("wheel", handleSubWheel);
      try { subChartRef.current?.remove(); } catch {}
      subChartRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSubChart]);

  useEffect(() => {
    const chart = subChartRef.current;
    if (!chart || !indicatorData || !candles.length) return;
    subSeriesRef.current.forEach(s => { try { chart.removeSeries(s); } catch {} });
    subSeriesRef.current.clear();

    try {
      if (subIndicator === "MACD") {
        const histS = chart.addSeries(HistogramSeries, { priceScaleId: "right" });
        const macdS = chart.addSeries(LineSeries, { color: "#10b981", lineWidth: 1, priceScaleId: "right", lastValueVisible: false, priceLineVisible: false });
        const sigS  = chart.addSeries(LineSeries, { color: "#f59e0b", lineWidth: 1, priceScaleId: "right", lastValueVisible: false, priceLineVisible: false });
        histS.setData(indicatorData.macdHist);
        macdS.setData(indicatorData.macdLine);
        sigS.setData(indicatorData.macdSignal);
        subSeriesRef.current.set("hist", histS);
        subSeriesRef.current.set("macd", macdS);
        subSeriesRef.current.set("signal", sigS);
      } else if (subIndicator === "RSI") {
        const rsiS = chart.addSeries(LineSeries, { color: "#f59e0b", lineWidth: 1, priceScaleId: "right", lastValueVisible: true, priceLineVisible: false });
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

  // ── 指标切换 ──────────────────────────────────────────────────────────────
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

  const handleIntervalChange = (iv: Interval, size: number) => {
    setIntervalState(iv);
    setOutputsize(size);
  };

  // ── 盘口悬停数据 ──────────────────────────────────────────────────────────
  const lastCandle = candles[candles.length - 1];
  const displayData = hoverData ?? (lastCandle ? {
    time: (() => {
      const fmt = makeTimeFormatter(interval);
      return fmt(timeToDate(lastCandle.time as Time));
    })(),
    open: lastCandle.open, high: lastCandle.high,
    low: lastCandle.low,   close: lastCandle.close,
    volume: lastCandle.volume,
  } : null);

  const isUp = displayData ? displayData.close >= displayData.open : true;
  const priceColor = isUp ? upColor : downColor;
  const mainHeight = isFullscreen ? Math.max(400, window.innerHeight - 280) : height;

  // ─────────────────────────────────────────────────────────────────────────
  // 渲染
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      className={`flex flex-col gap-0 w-full select-none ${isFullscreen ? "fixed inset-0 z-50 p-4 overflow-auto" : ""}`}
      style={isFullscreen ? { background: "#0c0c0e" } : {}}
    >
      {/* ── 工具栏（时间周期 + 图表类型）─────────────────────────────────── */}
      <div className="flex items-center justify-between gap-1 py-1 flex-wrap"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>

        {/* 时间周期 */}
        <div className="flex items-center gap-0.5 flex-wrap">
          {INTERVALS.map(({ label, value, outputsize: size }) => {
            const active = interval === value && outputsize === size;
            return (
              <button key={`${value}-${label}`}
                onClick={() => handleIntervalChange(value, size)}
                className="px-2 py-0.5 rounded text-[11px] font-mono font-medium transition-all"
                style={{
                  background: active ? "rgba(201,168,76,0.15)" : "transparent",
                  color:      active ? "#c9a84c" : "rgba(110,110,110,0.9)",
                  border:     active ? "1px solid rgba(201,168,76,0.3)" : "1px solid transparent",
                }}>
                {label}
              </button>
            );
          })}
        </div>

        {/* 图表类型 + 操作按钮 */}
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-0.5 p-0.5 rounded" style={{ background: "rgba(255,255,255,0.04)" }}>
            {([
              { type: "candlestick" as ChartType, icon: <BarChart2 className="w-3 h-3" /> },
              { type: "line"        as ChartType, icon: <TrendingUp className="w-3 h-3" /> },
              { type: "area"        as ChartType, icon: <Activity   className="w-3 h-3" /> },
            ] as const).map(({ type, icon }) => (
              <button key={type} onClick={() => setChartType(type)}
                className="p-1 rounded transition-all"
                style={{
                  background: chartType === type ? "rgba(201,168,76,0.2)" : "transparent",
                  color:      chartType === type ? "#c9a84c" : "rgba(100,100,100,0.8)",
                }}>
                {icon}
              </button>
            ))}
          </div>
          {/* 实时状态指示器 */}
          {isIntraday && (() => {
            // 时段标签映射（包含港股竞价/撮合状态）
            const sessionLabel: Record<string, string> = {
              trading: "交易中",
              lunch: "午休",
              pre_market: "盘前",
              post_market: "盘后",
              pre_auction: "竞价中",   // 港股盘前竞价 09:00-09:30
              post_auction: "撮合中",  // 港股盘后撮合 16:00-16:10
              closed: "休市",
            };
            // 时段颜色：交易中绿色，竞价/撮合黄色，其他灰色
            const sessionColor = (() => {
              if (liveStatus !== "live") return undefined;
              if (liveSession === "trading") return "#22c55e";
              if (liveSession === "pre_auction" || liveSession === "post_auction") return "#f59e0b";
              if (liveSession === "pre_market" || liveSession === "post_market") return "#60a5fa";
              return undefined;
            })();
            // 轮询频率标签：仅A股/港股有 interval_ms，美股不推送此字段
            const freqLabel = liveIntervalMs != null
              ? `${liveIntervalMs >= 1000 ? liveIntervalMs / 1000 + "s" : liveIntervalMs + "ms"}`
              : null;
            // 根据时段调整指示器整体颜色
            const indicatorColor = sessionColor ??
              (liveStatus === "live" ? "#22c55e" : liveStatus === "connecting" ? "#c9a84c" : "rgba(80,80,80,0.7)");
            const indicatorBg = sessionColor
              ? `rgba(${sessionColor === "#22c55e" ? "34,197,94" : sessionColor === "#f59e0b" ? "245,158,11" : "96,165,250"},0.1)`
              : (liveStatus === "live" ? "rgba(34,197,94,0.1)" : liveStatus === "connecting" ? "rgba(201,168,76,0.1)" : "rgba(80,80,80,0.08)");
            const indicatorBorder = sessionColor
              ? `1px solid rgba(${sessionColor === "#22c55e" ? "34,197,94" : sessionColor === "#f59e0b" ? "245,158,11" : "96,165,250"},0.3)`
              : `1px solid ${liveStatus === "live" ? "rgba(34,197,94,0.3)" : liveStatus === "connecting" ? "rgba(201,168,76,0.3)" : "rgba(80,80,80,0.2)"}`;
            return (
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[10px]" style={{
                background: indicatorBg,
                border: indicatorBorder,
                color: indicatorColor,
              }}>
                <Radio className={`w-2.5 h-2.5 ${liveStatus === "live" ? "animate-pulse" : ""}`} />
                <span>{liveStatus === "live" ? "LIVE" : liveStatus === "connecting" ? "..." : "OFF"}</span>
                {/* 时段标签（A股/港股显示） */}
                {liveStatus === "live" && liveSession && sessionLabel[liveSession] && (
                  <span className="opacity-80" style={{ color: indicatorColor }}>{sessionLabel[liveSession]}</span>
                )}
                {/* 轮询频率 */}
                {liveStatus === "live" && freqLabel && (
                  <span className="opacity-60">{freqLabel}</span>
                )}
                {/* 实时价格 */}
                {liveStatus === "live" && lastTickPrice != null && (
                  <span className="font-bold tabular-nums ml-0.5">{lastTickPrice.toFixed(2)}</span>
                )}
              </div>
            );
          })()}
          {/* 对比按鈕 */}
          {showCompareInput ? (
            <div className="flex items-center gap-0.5">
              <input
                autoFocus
                value={compareInput}
                onChange={e => setCompareInput(e.target.value.toUpperCase())}
                onKeyDown={e => {
                  if (e.key === "Enter" && compareInput.trim()) {
                    setCompareSymbol(compareInput.trim());
                    setShowCompareInput(false);
                  } else if (e.key === "Escape") {
                    setShowCompareInput(false);
                    setCompareInput("");
                  }
                }}
                placeholder="输入标的代码"
                className="w-20 px-1.5 py-0.5 rounded text-[11px] font-mono outline-none"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(201,168,76,0.4)",
                  color: "rgba(200,200,200,0.9)",
                }}
              />
              <button onClick={() => { setShowCompareInput(false); setCompareInput(""); }}
                className="p-0.5 rounded" style={{ color: "rgba(100,100,100,0.7)" }}>
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                if (isCompareMode) {
                  setCompareSymbol(null);
                  setCompareInput("");
                } else {
                  setShowCompareInput(true);
                }
              }}
              title={isCompareMode ? `取消对比 ${compareSymbol}` : "对比"}
              className="p-1 rounded transition-all hover:opacity-80"
              style={{
                color: isCompareMode ? "#60a5fa" : "rgba(100,100,100,0.7)",
                background: isCompareMode ? "rgba(96,165,250,0.1)" : "transparent",
              }}>
              <GitCompare className="w-3 h-3" />
            </button>
          )}
          <button onClick={() => refetch()} title="刷新"
            className="p-1 rounded transition-all hover:opacity-80"
            style={{ color: "rgba(100,100,100,0.7)" }}>
            <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={() => setIsFullscreen(f => !f)}
            title={isFullscreen ? "退出全屏" : "全屏"}
            className="p-1 rounded transition-all hover:opacity-80"
            style={{ color: "rgba(100,100,100,0.7)" }}>
            {isFullscreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* ── 对比模式十字准线联动浮层 ──────────────────────────────────── */}
      {isCompareMode && compareHover && (
        <div className="flex items-center gap-3 px-0.5 py-1 text-[11px] font-mono"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <span style={{ color: "rgba(80,80,80,0.6)" }}>{compareHover.time}</span>
          <span className="flex items-center gap-1">
            <span style={{ color: "#c9a84c", fontSize: 9 }}>●</span>
            <span style={{ color: "rgba(160,160,160,0.8)" }}>{symbol}</span>
            {compareHover.mainPct != null && (
              <span className="tabular-nums font-semibold" style={{
                color: compareHover.mainPct >= 0 ? upColor : downColor
              }}>
                {compareHover.mainPct >= 0 ? "+" : ""}{compareHover.mainPct.toFixed(2)}%
              </span>
            )}
          </span>
          <span className="flex items-center gap-1">
            <span style={{ color: "#60a5fa", fontSize: 9 }}>●</span>
            <span style={{ color: "rgba(160,160,160,0.8)" }}>{compareSymbol}</span>
            {compareHover.comparePct != null && (
              <span className="tabular-nums font-semibold" style={{
                color: compareHover.comparePct >= 0 ? upColor : downColor
              }}>
                {compareHover.comparePct >= 0 ? "+" : ""}{compareHover.comparePct.toFixed(2)}%
              </span>
            )}
          </span>
        </div>
      )}

      {/* ── 盘口数据行（OHLCV + 涨跌幅）──────────────────────────────────── */}
      {!isCompareMode && (
      <div className="flex items-center gap-2 px-0.5 py-1 flex-wrap text-[11px] font-mono"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        {displayData ? (
          <>
            <span className="font-bold text-[15px] tabular-nums" style={{ color: priceColor }}>
              {fmtPrice(displayData.close)}
            </span>
            {quoteData?.changePercent != null && (
              <span className="font-semibold tabular-nums" style={{ color: (quoteData.changePercent ?? 0) >= 0 ? upColor : downColor }}>
                {(quoteData.changePercent ?? 0) >= 0 ? "▲" : "▼"}{Math.abs(quoteData.changePercent ?? 0).toFixed(2)}%
              </span>
            )}
            <span style={{ color: "rgba(100,100,100,0.6)" }}>开</span>
            <span className="tabular-nums" style={{ color: "rgba(190,190,190,0.85)" }}>{fmtPrice(displayData.open)}</span>
            <span style={{ color: "rgba(100,100,100,0.6)" }}>高</span>
            <span className="tabular-nums" style={{ color: upColor }}>{fmtPrice(displayData.high)}</span>
            <span style={{ color: "rgba(100,100,100,0.6)" }}>低</span>
            <span className="tabular-nums" style={{ color: downColor }}>{fmtPrice(displayData.low)}</span>
            {quoteData?.prevClose != null && (
              <>
                <span style={{ color: "rgba(100,100,100,0.6)" }}>昨收</span>
                <span className="tabular-nums" style={{ color: "rgba(190,190,190,0.85)" }}>{fmtPrice(quoteData.prevClose)}</span>
              </>
            )}
            {displayData.volume != null && (
              <>
                <span style={{ color: "rgba(100,100,100,0.6)" }}>量</span>
                <span className="tabular-nums" style={{ color: "rgba(190,190,190,0.85)" }}>{fmtVol(displayData.volume)}</span>
              </>
            )}
            <span className="ml-auto tabular-nums" style={{ color: "rgba(80,80,80,0.7)", fontSize: 10 }}>
              {displayData.time}
            </span>
          </>
        ) : (
          <span style={{ color: "rgba(80,80,80,0.6)" }}>--</span>
        )}
      </div>
      )}

      {/* ── 主图表 ─────────────────────────────────────────────────────────────────────────────── */}
      <div className="relative w-full rounded overflow-hidden"
        style={{ height: mainHeight, background: "rgba(255,255,255,0.01)" }}>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10"
            style={{ background: "rgba(12,12,14,0.85)" }}>
            <div className="flex flex-col items-center gap-2">
              <div className="w-5 h-5 border-2 rounded-full animate-spin"
                style={{ borderColor: "rgba(201,168,76,0.3)", borderTopColor: "#c9a84c" }} />
              <span className="text-[11px]" style={{ color: "rgba(100,100,100,0.8)" }}>加载中...</span>
            </div>
          </div>
        )}
        {!isLoading && !candles.length && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
            <span className="text-xs" style={{ color: "rgba(80,80,80,0.8)" }}>暂无图表数据</span>
            <span className="text-[10px]" style={{ color: "rgba(60,60,60,0.7)" }}>请检查标的代码或稍后重试</span>
          </div>
        )}
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      </div>

      {/* ── 子图表（MACD / RSI / KDJ）──────────────────────────────────────── */}
      {hasSubChart && (
        <div className="relative w-full overflow-hidden"
          style={{ height: 90, background: "rgba(255,255,255,0.008)", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="absolute top-1 left-2 z-10 text-[10px] font-mono flex items-center gap-2"
            style={{ color: "rgba(140,140,140,0.7)" }}>
            <span>{subIndicator}</span>
            {subIndicator === "MACD" && (
              <span style={{ color: "rgba(90,90,90,0.7)" }}>
                DIF<span style={{ color: "#10b981" }}>●</span>{" "}
                DEA<span style={{ color: "#f59e0b" }}>●</span>
              </span>
            )}
            {subIndicator === "KDJ" && (
              <span style={{ color: "rgba(90,90,90,0.7)" }}>
                K<span style={{ color: "#f59e0b" }}>●</span>{" "}
                D<span style={{ color: "#60a5fa" }}>●</span>{" "}
                J<span style={{ color: "#ec4899" }}>●</span>
              </span>
            )}
          </div>
          <div ref={subContainerRef} style={{ width: "100%", height: "100%" }} />
        </div>
      )}

      {/* ── 指标选择工具栏 ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 pt-1 flex-wrap"
        style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <Settings2 className="w-3 h-3 shrink-0" style={{ color: "rgba(80,80,80,0.5)" }} />
        {INDICATORS.map(ind => (
          <button key={ind.key} onClick={() => toggleIndicator(ind.key)}
            className="px-2 py-0.5 rounded text-[10px] font-mono transition-all"
            style={{
              background: activeIndicators.has(ind.key) ? `${ind.color}1a` : "transparent",
              color:      activeIndicators.has(ind.key) ? ind.color : "rgba(80,80,80,0.9)",
              border:     activeIndicators.has(ind.key) ? `1px solid ${ind.color}44` : "1px solid rgba(50,50,50,0.5)",
            }}>
            {ind.label}
          </button>
        ))}
        {/* MA 图例 / 对比图例 */}
        <div className="ml-auto flex items-center gap-2 text-[10px] font-mono">
          {isCompareMode ? (
            <>
              <span className="flex items-center gap-1">
                <span style={{ color: "#c9a84c" }}>●</span>
                <span style={{ color: "rgba(180,180,180,0.9)" }}>{symbol}</span>
                {mainPct != null && (
                  <span style={{ color: mainPct >= 0 ? upColor : downColor, fontWeight: 600 }}>
                    {mainPct >= 0 ? "+" : ""}{mainPct.toFixed(2)}%
                  </span>
                )}
              </span>
              <span className="flex items-center gap-1">
                <span style={{ color: "#60a5fa" }}>●</span>
                <span style={{ color: "rgba(180,180,180,0.9)" }}>{compareSymbol}</span>
                {comparePct != null && (
                  <span style={{ color: comparePct >= 0 ? upColor : downColor, fontWeight: 600 }}>
                    {comparePct >= 0 ? "+" : ""}{comparePct.toFixed(2)}%
                  </span>
                )}
              </span>
            </>
          ) : (
            <>
              {activeIndicators.has("MA5")  && <span style={{ color: "#f59e0b" }}>MA5</span>}
              {activeIndicators.has("MA10") && <span style={{ color: "#60a5fa" }}>MA10</span>}
              {activeIndicators.has("MA20") && <span style={{ color: "#a78bfa" }}>MA20</span>}
              {activeIndicators.has("MA60") && <span style={{ color: "#f97316" }}>MA60</span>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default PriceChart;
