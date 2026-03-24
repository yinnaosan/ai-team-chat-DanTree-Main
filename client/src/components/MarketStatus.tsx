/**
 * MarketStatus — 市场状态组件
 *
 * 功能：
 * 1. 根据当前时间自动判断市场状态（OPEN/CLOSED/PRE/POST/24H/NIGHT）
 * 2. 显示距开盘/收盘的倒计时
 * 3. 临近开收盘时（30min/15min）弹出 toast 提醒
 * 4. 支持美股、A股、港股、加密货币
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { Clock } from "lucide-react";

// ─── 市场定义 ──────────────────────────────────────────────────────────────────
export type MarketType = "us" | "cn" | "hk" | "crypto" | "uk" | "eu";

interface MarketSession {
  /** 开盘时间（UTC 分钟，即 hour*60+min） */
  openUtcMin: number;
  /** 收盘时间（UTC 分钟） */
  closeUtcMin: number;
  /** 盘前开始（UTC 分钟，可选） */
  preOpenUtcMin?: number;
  /** 盘后结束（UTC 分钟，可选） */
  postCloseUtcMin?: number;
  /** 交易日（0=周日, 1=周一, ..., 6=周六） */
  tradingDays: number[];
  /** 市场名称 */
  name: string;
  /** 货币符号 */
  currency: string;
}

// 美东时间 = UTC-5（冬令）或 UTC-4（夏令）
// 简化处理：使用固定 UTC-5 偏移（与实际相差最多1小时，对状态判断影响不大）
// 更精确的做法是检测夏令时，这里用简化版
function getESTOffsetMin(): number {
  // 粗略判断夏令时：3月第2个周日到11月第1个周日
  const now = new Date();
  const year = now.getUTCFullYear();
  // 3月第2个周日
  const marchSecondSunday = new Date(Date.UTC(year, 2, 1));
  marchSecondSunday.setUTCDate(1 + (7 - marchSecondSunday.getUTCDay()) % 7 + 7);
  // 11月第1个周日
  const novFirstSunday = new Date(Date.UTC(year, 10, 1));
  novFirstSunday.setUTCDate(1 + (7 - novFirstSunday.getUTCDay()) % 7);
  const isDST = now >= marchSecondSunday && now < novFirstSunday;
  return isDST ? -4 * 60 : -5 * 60; // EDT = UTC-4, EST = UTC-5
}

const MARKETS: Record<MarketType, MarketSession> = {
  us: {
    name: "美股 NYSE",
    currency: "USD",
    openUtcMin: 9 * 60 + 30 - getESTOffsetMin(), // 9:30 EST → UTC
    closeUtcMin: 16 * 60 - getESTOffsetMin(),      // 16:00 EST → UTC
    preOpenUtcMin: 4 * 60 - getESTOffsetMin(),      // 4:00 EST
    postCloseUtcMin: 20 * 60 - getESTOffsetMin(),   // 20:00 EST
    tradingDays: [1, 2, 3, 4, 5],
  },
  cn: {
    name: "A股 SSE",
    currency: "CNY",
    openUtcMin: 9 * 60 + 30 - 8 * 60, // 9:30 CST → UTC (CST = UTC+8)
    closeUtcMin: 15 * 60 - 8 * 60,     // 15:00 CST → UTC
    tradingDays: [1, 2, 3, 4, 5],
  },
  hk: {
    name: "港股 HKEX",
    currency: "HKD",
    openUtcMin: 9 * 60 + 30 - 8 * 60, // 9:30 HKT → UTC
    closeUtcMin: 16 * 60 - 8 * 60,     // 16:00 HKT → UTC
    tradingDays: [1, 2, 3, 4, 5],
  },
  uk: {
    name: "英股 LSE",
    currency: "GBP",
    openUtcMin: 8 * 60,  // 8:00 UTC (GMT)
    closeUtcMin: 16 * 60 + 30, // 16:30 UTC
    tradingDays: [1, 2, 3, 4, 5],
  },
  eu: {
    name: "欧股 XETRA",
    currency: "EUR",
    openUtcMin: 8 * 60,  // 8:00 UTC (CET-1)
    closeUtcMin: 16 * 60 + 30, // 16:30 UTC
    tradingDays: [1, 2, 3, 4, 5],
  },
  crypto: {
    name: "加密货币",
    currency: "USD",
    openUtcMin: 0,
    closeUtcMin: 24 * 60,
    tradingDays: [0, 1, 2, 3, 4, 5, 6],
  },
};

export type MarketStatusType = "open" | "closed" | "pre" | "post" | "24h" | "night";

export interface MarketStatusInfo {
  status: MarketStatusType;
  /** 距下一个状态变化的秒数 */
  secondsToNext: number;
  /** 下一个状态变化的描述 */
  nextEvent: string;
  market: MarketSession;
  marketType: MarketType;
}

/** 根据当前 UTC 时间判断市场状态 */
export function getMarketStatus(marketType: MarketType): MarketStatusInfo {
  const market = MARKETS[marketType];
  const now = new Date();
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const dayOfWeek = now.getUTCDay();

  // 加密货币永远开放
  if (marketType === "crypto") {
    return {
      status: "24h",
      secondsToNext: 0,
      nextEvent: "24/7 交易",
      market,
      marketType,
    };
  }

  const isWeekday = market.tradingDays.includes(dayOfWeek);

  if (!isWeekday) {
    // 周末，计算到下周一开盘的时间
    const daysToMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    const secondsToOpen = daysToMonday * 24 * 3600 - (utcMin * 60 + now.getUTCSeconds());
    return {
      status: "closed",
      secondsToNext: Math.max(0, secondsToOpen),
      nextEvent: "周一开盘",
      market,
      marketType,
    };
  }

  const open = market.openUtcMin;
  const close = market.closeUtcMin;
  const preOpen = market.preOpenUtcMin;
  const postClose = market.postCloseUtcMin;

  // 正常交易时段
  if (utcMin >= open && utcMin < close) {
    const secsToClose = (close - utcMin) * 60 - now.getUTCSeconds();
    return {
      status: "open",
      secondsToNext: Math.max(0, secsToClose),
      nextEvent: "收盘",
      market,
      marketType,
    };
  }

  // 盘前
  if (preOpen !== undefined && utcMin >= preOpen && utcMin < open) {
    const secsToOpen = (open - utcMin) * 60 - now.getUTCSeconds();
    return {
      status: "pre",
      secondsToNext: Math.max(0, secsToOpen),
      nextEvent: "开盘",
      market,
      marketType,
    };
  }

  // 盘后
  if (postClose !== undefined && utcMin >= close && utcMin < postClose) {
    const secsToPostClose = (postClose - utcMin) * 60 - now.getUTCSeconds();
    return {
      status: "post",
      secondsToNext: Math.max(0, secsToPostClose),
      nextEvent: "盘后结束",
      market,
      marketType,
    };
  }

  // 夜盘（收盘后到第二天盘前/开盘）
  const nextOpenMin = preOpen ?? open;
  const secsToNextOpen = (nextOpenMin - utcMin + 24 * 60) % (24 * 60) * 60 - now.getUTCSeconds();
  return {
    status: "night",
    secondsToNext: Math.max(0, secsToNextOpen),
    nextEvent: preOpen !== undefined ? "盘前" : "开盘",
    market,
    marketType,
  };
}

/** 根据标的物代码推断市场类型 */
export function detectMarketType(symbol: string): MarketType {
  if (!symbol) return "us";
  const s = symbol.toUpperCase().trim();
  // 加密货币
  if (/^(BTC|ETH|BNB|SOL|ADA|XRP|DOGE|MATIC|DOT|AVAX|LINK|UNI|ATOM|LTC|BCH|ALGO|VET|FIL|TRX|EOS)(-USD|-USDT|-BTC)?$/.test(s)) return "crypto";
  // A股（6位数字，或带sh./sz.前缀）
  if (/^(SH\.|SZ\.)?[0-9]{6}$/.test(s) || /^(600|601|603|605|000|001|002|003|300|688)[0-9]{3}$/.test(s)) return "cn";
  // 港股（4-5位数字，或带.HK后缀）
  if (/^\d{4,5}(\.HK)?$/.test(s) || s.endsWith(".HK")) return "hk";
  // 英股（带.L后缀）
  if (s.endsWith(".L") || s.endsWith(".LON")) return "uk";
  // 欧股（带.DE/.FR/.IT/.ES后缀）
  if (s.endsWith(".DE") || s.endsWith(".FR") || s.endsWith(".IT") || s.endsWith(".ES")) return "eu";
  // 默认美股
  return "us";
}

/** 格式化倒计时 */
function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ─── 状态样式配置 ──────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<MarketStatusType, {
  label: string;
  color: string;
  bg: string;
  border: string;
  pulse: boolean;
}> = {
  open: {
    label: "OPEN",
    color: "oklch(0.72 0.18 142)",
    bg: "oklch(0.72 0.18 142 / 0.12)",
    border: "oklch(0.72 0.18 142 / 0.35)",
    pulse: true,
  },
  pre: {
    label: "PRE",
    color: "oklch(0.78 0.18 85)",
    bg: "oklch(0.78 0.18 85 / 0.12)",
    border: "oklch(0.78 0.18 85 / 0.35)",
    pulse: false,
  },
  post: {
    label: "POST",
    color: "oklch(0.78 0.18 85)",
    bg: "oklch(0.78 0.18 85 / 0.12)",
    border: "oklch(0.78 0.18 85 / 0.35)",
    pulse: false,
  },
  closed: {
    label: "CLOSED",
    color: "oklch(0.62 0.22 25)",
    bg: "oklch(0.62 0.22 25 / 0.12)",
    border: "oklch(0.62 0.22 25 / 0.35)",
    pulse: false,
  },
  night: {
    label: "NIGHT",
    color: "oklch(0.65 0.18 250)",
    bg: "oklch(0.65 0.18 250 / 0.12)",
    border: "oklch(0.65 0.18 250 / 0.35)",
    pulse: false,
  },
  "24h": {
    label: "24H",
    color: "oklch(0.65 0.18 250)",
    bg: "oklch(0.65 0.18 250 / 0.12)",
    border: "oklch(0.65 0.18 250 / 0.35)",
    pulse: true,
  },
};

// ─── MarketStatusBadge 组件 ────────────────────────────────────────────────────

interface MarketStatusBadgeProps {
  /** 标的物代码，用于自动推断市场类型 */
  symbol?: string;
  /** 直接指定市场类型（优先级高于 symbol） */
  marketType?: MarketType;
  /** 是否显示倒计时 */
  showCountdown?: boolean;
  /** 是否启用开收盘提醒 */
  enableAlerts?: boolean;
  /** 尺寸 */
  size?: "sm" | "md";
  className?: string;
}

export function MarketStatusBadge({
  symbol,
  marketType: forcedMarketType,
  showCountdown = true,
  enableAlerts = false,
  size = "sm",
  className = "",
}: MarketStatusBadgeProps) {
  const marketType = forcedMarketType ?? detectMarketType(symbol ?? "");
  const [info, setInfo] = useState<MarketStatusInfo>(() => getMarketStatus(marketType));
  const alertedRef = useRef<Set<string>>(new Set());

  const update = useCallback(() => {
    const newInfo = getMarketStatus(marketType);
    setInfo(newInfo);

    // 开收盘提醒
    if (enableAlerts && newInfo.status !== "24h") {
      const secs = newInfo.secondsToNext;
      const key30 = `${marketType}-30-${newInfo.nextEvent}`;
      const key15 = `${marketType}-15-${newInfo.nextEvent}`;

      if (secs <= 30 * 60 && secs > 29 * 60 && !alertedRef.current.has(key30)) {
        alertedRef.current.add(key30);
        toast(`⏰ ${newInfo.market.name} 距${newInfo.nextEvent}还有 30 分钟`, {
          description: `${new Date().toLocaleTimeString()} · 请做好准备`,
          duration: 8000,
        });
      }
      if (secs <= 15 * 60 && secs > 14 * 60 && !alertedRef.current.has(key15)) {
        alertedRef.current.add(key15);
        toast(`🔔 ${newInfo.market.name} 距${newInfo.nextEvent}还有 15 分钟`, {
          description: `${new Date().toLocaleTimeString()} · 即将${newInfo.nextEvent}`,
          duration: 10000,
        });
      }
    }
  }, [marketType, enableAlerts]);

  useEffect(() => {
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [update]);

  const cfg = STATUS_CONFIG[info.status];
  const isSmall = size === "sm";

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-md font-mono ${isSmall ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs"} ${className}`}
      style={{
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        color: cfg.color,
      }}
      title={`${info.market.name} · ${cfg.label} · 距${info.nextEvent}: ${formatCountdown(info.secondsToNext)}`}
    >
      {/* 状态指示点 */}
      <span
        className={`inline-block rounded-full ${isSmall ? "w-1 h-1" : "w-1.5 h-1.5"} ${cfg.pulse ? "animate-pulse" : ""}`}
        style={{ background: cfg.color, flexShrink: 0 }}
      />
      {/* 状态标签 */}
      <span className="font-bold tracking-wider">{cfg.label}</span>
      {/* 倒计时 */}
      {showCountdown && info.status !== "24h" && info.secondsToNext > 0 && info.secondsToNext < 4 * 3600 && (
        <span className="opacity-70 ml-0.5">{formatCountdown(info.secondsToNext)}</span>
      )}
    </div>
  );
}

// ─── MarketAlertManager 组件（全局提醒，挂载一次即可） ────────────────────────

interface MarketAlertManagerProps {
  /** 要监控的市场列表 */
  markets?: MarketType[];
}

export function MarketAlertManager({ markets = ["us", "cn", "hk"] }: MarketAlertManagerProps) {
  const alertedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const check = () => {
      for (const mt of markets) {
        const info = getMarketStatus(mt);
        if (info.status === "24h") continue;
        const secs = info.secondsToNext;
        const key30 = `${mt}-30-${info.nextEvent}-${new Date().toDateString()}`;
        const key15 = `${mt}-15-${info.nextEvent}-${new Date().toDateString()}`;

        if (secs <= 30 * 60 && secs > 29 * 60 && !alertedRef.current.has(key30)) {
          alertedRef.current.add(key30);
          toast(`⏰ ${info.market.name} 距${info.nextEvent}还有 30 分钟`, {
            description: `当前时间 ${new Date().toLocaleTimeString()}`,
            duration: 8000,
          });
        }
        if (secs <= 15 * 60 && secs > 14 * 60 && !alertedRef.current.has(key15)) {
          alertedRef.current.add(key15);
          toast(`🔔 ${info.market.name} 距${info.nextEvent}还有 15 分钟！`, {
            description: `当前时间 ${new Date().toLocaleTimeString()} · 即将${info.nextEvent}`,
            duration: 10000,
          });
        }
        // 开盘/收盘瞬间提醒
        const keyNow = `${mt}-now-${info.nextEvent}-${new Date().toDateString()}-${new Date().getHours()}`;
        if (secs <= 60 && secs > 0 && !alertedRef.current.has(keyNow)) {
          alertedRef.current.add(keyNow);
          toast(`🚨 ${info.market.name} 即将${info.nextEvent}！`, {
            description: `倒计时 ${secs} 秒`,
            duration: 12000,
          });
        }
      }
    };

    check();
    const timer = setInterval(check, 30000); // 每30秒检查一次
    return () => clearInterval(timer);
  }, [markets]);

  return null; // 纯逻辑组件，不渲染任何 UI
}

// ─── TickerMarketStatus 组件（标的物代码旁边显示） ────────────────────────────

interface TickerMarketStatusProps {
  symbol: string;
  showCountdown?: boolean;
  className?: string;
}

export function TickerMarketStatus({ symbol, showCountdown = true, className = "" }: TickerMarketStatusProps) {
  const marketType = detectMarketType(symbol);
  return (
    <MarketStatusBadge
      marketType={marketType}
      showCountdown={showCountdown}
      enableAlerts={true}
      size="sm"
      className={className}
    />
  );
}

export default MarketStatusBadge;
