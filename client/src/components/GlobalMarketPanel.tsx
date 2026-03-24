/**
 * GlobalMarketPanel — 全球主要市场状态面板
 *
 * 功能：
 * 1. 显示全球主要市场（美股、A股、港股、欧股、英股、加密货币）的实时状态
 * 2. 每个市场显示：名称、状态标签、倒计时
 * 3. 可展开/收起的下拉面板，集成在顶部导航栏
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Globe, ChevronDown, ChevronUp } from "lucide-react";
import { getMarketStatus, type MarketType, type MarketStatusType } from "./MarketStatus";

// ─── 全球市场列表 ──────────────────────────────────────────────────────────────
const GLOBAL_MARKETS: { type: MarketType; label: string; flag: string; tz: string }[] = [
  { type: "us",     label: "美股 NYSE/NASDAQ", flag: "🇺🇸", tz: "New York" },
  { type: "cn",     label: "A股 上交所/深交所", flag: "🇨🇳", tz: "Shanghai" },
  { type: "hk",     label: "港股 HKEX",         flag: "🇭🇰", tz: "Hong Kong" },
  { type: "uk",     label: "英股 LSE",           flag: "🇬🇧", tz: "London" },
  { type: "eu",     label: "欧股 XETRA/Euronext",flag: "🇩🇪", tz: "Frankfurt" },
  { type: "crypto", label: "加密货币",            flag: "₿",  tz: "24/7" },
];

// ─── 状态颜色配置 ──────────────────────────────────────────────────────────────
const STATUS_STYLE: Record<MarketStatusType, { dot: string; text: string; label: string }> = {
  open:   { dot: "oklch(0.72 0.18 142)", text: "oklch(0.72 0.18 142)", label: "开盘" },
  pre:    { dot: "oklch(0.78 0.18 85)",  text: "oklch(0.78 0.18 85)",  label: "盘前" },
  post:   { dot: "oklch(0.78 0.18 85)",  text: "oklch(0.78 0.18 85)",  label: "盘后" },
  closed: { dot: "oklch(0.62 0.22 25)",  text: "oklch(0.55 0.02 240)", label: "休市" },
  "24h":  { dot: "oklch(0.72 0.18 142)", text: "oklch(0.72 0.18 142)", label: "24H" },
  lunch:  { dot: "oklch(0.72 0.15 200)", text: "oklch(0.72 0.15 200)", label: "午休" },
};

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

// ─── 单个市场行 ────────────────────────────────────────────────────────────────
function MarketRow({ type, label, flag }: { type: MarketType; label: string; flag: string }) {
  const [info, setInfo] = useState(() => getMarketStatus(type));

  useEffect(() => {
    const timer = setInterval(() => setInfo(getMarketStatus(type)), 1000);
    return () => clearInterval(timer);
  }, [type]);

  const style = STATUS_STYLE[info.status];
  const countdown = info.status !== "24h" && info.secondsToNext > 0 && info.secondsToNext < 12 * 3600
    ? formatCountdown(info.secondsToNext)
    : "";

  return (
    <div className="flex items-center gap-2 px-3 py-2 hover:bg-white/4 transition-colors rounded-md">
      {/* Flag */}
      <span className="text-base w-5 text-center shrink-0">{flag}</span>
      {/* Market name */}
      <span className="flex-1 text-sm font-semibold whitespace-nowrap" style={{ color: "oklch(0.80 0 0)" }}>
        {label}
      </span>
      {/* Status */}
      <div className="flex items-center gap-1.5 shrink-0 ml-2">
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${info.status === "open" || info.status === "24h" ? "animate-pulse" : ""}`}
          style={{ background: style.dot }}
        />
        <span className="text-xs font-mono font-bold tracking-wider" style={{ color: style.text }}>
          {info.holidayName ? "节假日" : style.label}
        </span>
        {info.holidayName ? (
          <span className="text-xs font-mono opacity-60 max-w-[80px] truncate" style={{ color: style.text }}
            title={info.holidayName}>
            {info.holidayName}
          </span>
        ) : countdown ? (
          <span className="text-xs font-mono" style={{ color: style.text, opacity: 0.75 }}>
            <span className="opacity-60">距{info.nextEvent}</span>
            {" "}
            <span className="font-bold">{countdown}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ─── GlobalMarketPanel 主组件 ──────────────────────────────────────────────────
interface GlobalMarketPanelProps {
  className?: string;
}

export function GlobalMarketPanel({ className = "" }: GlobalMarketPanelProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // 计算开放市场数量
  const [openCount, setOpenCount] = useState(0);
  useEffect(() => {
    const calc = () => {
      const count = GLOBAL_MARKETS.filter(m => {
        const info = getMarketStatus(m.type);
        return info.status === "open" || info.status === "24h";
      }).length;
      setOpenCount(count);
    };
    calc();
    const timer = setInterval(calc, 30000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div ref={panelRef} className={`relative ${className}`}>
      {/* 触发按钮 */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm transition-all hover:bg-white/8"
        style={{
          background: open ? "oklch(0.18 0 0)" : "oklch(0.14 0 0)",
          border: `1px solid ${open ? "oklch(0.30 0 0)" : "oklch(0.22 0 0)"}`,
          color: "oklch(0.65 0 0)",
        }}
        title="全球市场状态"
      >
        <Globe className="w-3.5 h-3.5" />
        <span className="hidden sm:inline font-mono">
          <span style={{ color: "oklch(0.72 0.18 142)" }}>{openCount}</span>
          <span className="opacity-50">/{GLOBAL_MARKETS.length}</span>
        </span>
        {open ? <ChevronUp className="w-3 h-3 opacity-50" /> : <ChevronDown className="w-3 h-3 opacity-50" />}
      </button>

      {/* 下拉面板 */}
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 rounded-xl overflow-hidden shadow-2xl"
          style={{
            background: "oklch(0.12 0 0)",
            border: "1px solid oklch(0.22 0 0)",
            minWidth: "340px",
            maxWidth: "min(400px, calc(100vw - 16px))",
            width: "340px",
            backdropFilter: "blur(12px)",
          }}
        >
          {/* 面板标题 */}
          <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: "oklch(0.20 0 0)" }}>
            <span className="text-xs font-semibold tracking-wider uppercase" style={{ color: "oklch(0.65 0 0)" }}>
              全球市场状态
            </span>
            <span className="text-xs font-mono" style={{ color: "oklch(0.55 0 0)" }}>
              {new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          </div>
          {/* 市场列表 */}
          <div className="p-1">
            {GLOBAL_MARKETS.map(m => (
              <MarketRow key={m.type} type={m.type} label={m.label} flag={m.flag} />
            ))}
          </div>
          {/* 底部说明 */}
          <div className="px-3 py-2 border-t" style={{ borderColor: "oklch(0.18 0 0)" }}>
            <p className="text-[11px] font-mono" style={{ color: "oklch(0.45 0 0)" }}>
              时间基于 UTC · 夏令时自动调整 · 已集成节假日日历
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default GlobalMarketPanel;
