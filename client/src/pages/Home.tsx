/**
 * DanTree Terminal — 品牌重定义落地页 v3.0
 *
 * 特性：
 * 1. 交互式 AI 机器人（鼠标跟随眼睛动画，参考 FinRobot）
 * 2. 全球市场实时状态展示区（6大市场）
 * 3. 动态网格背景
 * 4. 功能特性卡片网格
 * 5. 安装引导提示
 */
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  ArrowRight, Loader2, Terminal, Lock,
  TrendingUp, Brain, Database, Shield,
  Zap, BarChart3, Activity, LineChart,
  ChevronRight, Globe, Cpu, FlaskConical,
  Smartphone, Download,
} from "lucide-react";
import { getMarketStatus, type MarketType } from "@/components/MarketStatus";
import { HeroSection } from "@/components/login/HeroSection";
import { LoginSection } from "@/components/login/LoginSection";

// ─── Ticker Strip ─────────────────────────────────────────────────────────────
const MOCK_TICKERS = [
  { symbol: "SPX",    price: "5,234.18",  change: "+0.82%", up: true },
  { symbol: "NDX",    price: "18,421.31", change: "+1.24%", up: true },
  { symbol: "HSI",    price: "17,284.54", change: "-0.43%", up: false },
  { symbol: "000001", price: "3,089.26",  change: "+0.31%", up: true },
  { symbol: "AAPL",   price: "189.84",    change: "+0.67%", up: true },
  { symbol: "TSLA",   price: "248.50",    change: "-1.23%", up: false },
  { symbol: "BTC",    price: "67,234",    change: "+2.14%", up: true },
  { symbol: "NVDA",   price: "875.39",    change: "+3.42%", up: true },
  { symbol: "00700",  price: "362.40",    change: "-0.55%", up: false },
  { symbol: "600519", price: "1,542.00",  change: "+0.28%", up: true },
  { symbol: "DXY",    price: "104.23",    change: "-0.18%", up: false },
  { symbol: "GOLD",   price: "2,312.40",  change: "+0.94%", up: true },
  { symbol: "WTI",    price: "82.15",     change: "+0.61%", up: true },
  { symbol: "EUR/USD",price: "1.0842",    change: "-0.12%", up: false },
  { symbol: "VIX",    price: "14.82",     change: "-3.21%", up: false },
];

function TickerStrip() {
  const doubled = [...MOCK_TICKERS, ...MOCK_TICKERS];
  return (
    <div style={{ background: "oklch(8.5% 0.008 240)", borderBottom: "1px solid oklch(100% 0 0 / 0.05)", height: "26px", display: "flex", alignItems: "center", overflow: "hidden", flexShrink: 0 }}>
      <div className="bloomberg-ticker-track" style={{ display: "inline-flex", alignItems: "center" }}>
        {doubled.map((t, i) => (
          <div key={i} style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "0 16px", borderRight: "1px solid oklch(100% 0 0 / 0.05)", height: "26px", flexShrink: 0 }}>
            <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", color: "oklch(80% 0.005 240)", fontFamily: "'IBM Plex Mono', monospace" }}>{t.symbol}</span>
            <span style={{ fontSize: "10px", fontFamily: "'IBM Plex Mono', monospace", color: "oklch(48% 0.006 240)" }}>{t.price}</span>
            <span style={{ fontSize: "10px", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: t.up ? "oklch(68% 0.18 145)" : "oklch(65% 0.20 25)" }}>{t.change}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── AI Robot 交互组件 ────────────────────────────────────────────────────────
function AIRobot() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [eyePos, setEyePos] = useState({ x: 0, y: 0 });
  const [blinking, setBlinking] = useState(false);
  const [mood, setMood] = useState<"neutral" | "happy" | "thinking">("neutral");

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const maxDist = 6;
      const norm = Math.min(dist, 200) / 200;
      setEyePos({ x: (dx / dist) * maxDist * norm, y: (dy / dist) * maxDist * norm });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useEffect(() => {
    const blink = () => { setBlinking(true); setTimeout(() => setBlinking(false), 150); };
    const interval = setInterval(blink, 2500 + Math.random() * 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const moods: Array<"neutral" | "happy" | "thinking"> = ["neutral", "happy", "thinking"];
    const interval = setInterval(() => setMood(moods[Math.floor(Math.random() * moods.length)]), 4000);
    return () => clearInterval(interval);
  }, []);

  const gold = "oklch(65% 0.18 255)";
  const bg = "oklch(10% 0.012 240)";

  return (
    <div ref={containerRef} style={{ position: "relative", width: 160, height: 180, flexShrink: 0 }}>
      <div style={{ position: "absolute", inset: -20, background: `radial-gradient(ellipse 80% 80% at 50% 50%, oklch(78% 0.18 75 / 0.08), transparent)`, pointerEvents: "none" }} />
      <svg viewBox="0 0 160 180" width="160" height="180" style={{ position: "relative", zIndex: 1 }}>
        {/* Antenna */}
        <line x1="80" y1="18" x2="80" y2="36" stroke={gold} strokeWidth="2" strokeLinecap="round" />
        <circle cx="80" cy="14" r="4" fill={gold} className="animate-pulse" />
        {/* Head */}
        <rect x="24" y="36" width="112" height="84" rx="18" fill={bg} stroke={gold} strokeWidth="1.5" />
        {/* Face screen */}
        <rect x="36" y="48" width="88" height="60" rx="10" fill="oklch(8% 0.01 240)" stroke="oklch(78% 0.18 75 / 0.2)" strokeWidth="1" />
        {/* Left eye */}
        <circle cx="62" cy="76" r="13" fill="oklch(12% 0.015 240)" stroke={gold} strokeWidth="1" />
        <circle cx={62 + eyePos.x} cy={blinking ? 76 : 76 + eyePos.y} r={blinking ? 1 : 7} fill={gold} style={{ transition: "r 0.08s ease" }} />
        <circle cx={62 + eyePos.x + 2} cy={blinking ? 76 : 76 + eyePos.y - 2} r={blinking ? 0 : 2} fill="oklch(95% 0 0 / 0.6)" />
        {/* Right eye */}
        <circle cx="98" cy="76" r="13" fill="oklch(12% 0.015 240)" stroke={gold} strokeWidth="1" />
        <circle cx={98 + eyePos.x} cy={blinking ? 76 : 76 + eyePos.y} r={blinking ? 1 : 7} fill={gold} style={{ transition: "r 0.08s ease" }} />
        <circle cx={98 + eyePos.x + 2} cy={blinking ? 76 : 76 + eyePos.y - 2} r={blinking ? 0 : 2} fill="oklch(95% 0 0 / 0.6)" />
        {/* Mouth */}
        {mood === "happy" && <path d="M 64 98 Q 80 108 96 98" stroke={gold} strokeWidth="2" fill="none" strokeLinecap="round" />}
        {mood === "neutral" && <line x1="66" y1="100" x2="94" y2="100" stroke={gold} strokeWidth="2" strokeLinecap="round" />}
        {mood === "thinking" && <path d="M 64 102 Q 72 96 80 100 Q 88 104 96 98" stroke={gold} strokeWidth="2" fill="none" strokeLinecap="round" />}
        {/* Neck */}
        <rect x="70" y="120" width="20" height="10" rx="3" fill={bg} stroke={gold} strokeWidth="1" />
        {/* Body */}
        <rect x="18" y="130" width="124" height="46" rx="14" fill={bg} stroke={gold} strokeWidth="1.5" />
        {/* Chest panel */}
        <rect x="30" y="140" width="100" height="28" rx="7" fill="oklch(8% 0.01 240)" stroke="oklch(78% 0.18 75 / 0.2)" strokeWidth="1" />
        {/* Chest indicators */}
        {[0, 1, 2].map(i => (
          <circle key={i} cx={50 + i * 20} cy={154} r={4} fill="oklch(78% 0.18 75 / 0.15)" stroke={gold} strokeWidth="1" className="animate-pulse" style={{ animationDelay: `${i * 0.3}s` }} />
        ))}
        {/* Data bars */}
        {[0, 1, 2, 3].map(i => (
          <rect key={i} x={102 + i * 7} y={146 + i * 2} width={4} height={16 - i * 2} rx={2} fill={gold} opacity={0.3 + i * 0.15} />
        ))}
      </svg>
    </div>
  );
}

// ─── 全球市场状态展示 ─────────────────────────────────────────────────────────
const MARKET_LIST: { type: MarketType; label: string; flag: string }[] = [
  { type: "us",     label: "美股 NYSE",  flag: "🇺🇸" },
  { type: "cn",     label: "A股 SSE",   flag: "🇨🇳" },
  { type: "hk",     label: "港股 HKEX", flag: "🇭🇰" },
  { type: "uk",     label: "英股 LSE",  flag: "🇬🇧" },
  { type: "eu",     label: "欧股",       flag: "🇩🇪" },
  { type: "crypto", label: "加密货币",   flag: "₿" },
];

const STATUS_COLOR: Record<string, string> = {
  open:   "oklch(0.72 0.18 142)",
  pre:    "oklch(0.78 0.18 85)",
  post:   "oklch(0.78 0.18 85)",
  closed: "oklch(0.62 0.22 25)",
  "24h":  "oklch(0.72 0.18 142)",
  lunch:  "oklch(0.72 0.15 200)",
};
const STATUS_LABEL: Record<string, string> = {
  open: "开盘", pre: "盘前", post: "盘后", closed: "休市", "24h": "24H", lunch: "午休",
};

function formatSecs(s: number) {
  if (s <= 0) return "";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}m`;
  return `${m}m${String(s % 60).padStart(2, "0")}s`;
}

function MarketStatusRow({ type, label, flag }: { type: MarketType; label: string; flag: string }) {
  const [info, setInfo] = useState(() => getMarketStatus(type));
  useEffect(() => {
    const t = setInterval(() => setInfo(getMarketStatus(type)), 1000);
    return () => clearInterval(t);
  }, [type]);
  const color = STATUS_COLOR[info.status];
  const hasCountdown = info.status !== "24h" && info.secondsToNext > 0 && info.secondsToNext < 12 * 3600;
  const countdown = hasCountdown ? formatSecs(info.secondsToNext) : "";
  const nextLabel = info.nextEvent ?? (info.status === "open" || info.status === "pre" ? "收盘" : "开盘");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8, background: "oklch(100% 0 0 / 0.025)", border: "1px solid oklch(100% 0 0 / 0.06)" }}>
      <span style={{ fontSize: 16, width: 20, textAlign: "center", flexShrink: 0 }}>{flag}</span>
      <span style={{ flex: 1, fontSize: 11, fontWeight: 500, color: "oklch(62% 0.007 240)" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} className={info.status === "open" || info.status === "24h" ? "animate-pulse" : ""} />
        <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color, letterSpacing: "0.06em" }}>{STATUS_LABEL[info.status]}</span>
        {hasCountdown && (
          <>
            <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color, opacity: 0.55 }}>距{nextLabel}</span>
            <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color, fontWeight: 700 }}>{countdown}</span>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Features ─────────────────────────────────────────────────────────────────
const FEATURES = [
  { icon: Brain,        title: "双引擎 AI 协作",    desc: "Manus + GPT 同时分析，交叉验证，自动生成反驳论点，避免确认偏误",              tag: "CORE",   accent: "oklch(65% 0.18 255)",  bg: "oklch(78% 0.18 75 / 0.08)",  border: "oklch(78% 0.18 75 / 0.2)" },
  { icon: Database,     title: "40+ 专业数据源",     desc: "Finnhub · TwelveData · FRED · AlphaVantage · Polygon · SEC EDGAR 实时接入", tag: "DATA",   accent: "oklch(68% 0.18 250)", bg: "oklch(68% 0.18 250 / 0.08)", border: "oklch(68% 0.18 250 / 0.2)" },
  { icon: BarChart3,    title: "DanTree 四列终端",   desc: "侧边栏 · 分析列 · 讨论列 · 洞察列，专业级工作台布局",                       tag: "LAYOUT", accent: "oklch(65% 0.20 155)", bg: "oklch(65% 0.20 155 / 0.08)", border: "oklch(65% 0.20 155 / 0.2)" },
  { icon: FlaskConical, title: "Alpha 因子回测",     desc: "健康评分 · 情绪分析 · 趋势雷达 · 模拟交易，量化研究全套",                   tag: "QUANT",  accent: "oklch(72% 0.18 300)", bg: "oklch(72% 0.18 300 / 0.08)", border: "oklch(72% 0.18 300 / 0.2)" },
  { icon: Shield,       title: "风险矩阵分析",       desc: "自动识别 5 大风险维度，量化评分，生成对冲建议",                             tag: "RISK",   accent: "oklch(62% 0.22 25)",  bg: "oklch(62% 0.22 25 / 0.08)",  border: "oklch(62% 0.22 25 / 0.2)" },
  { icon: Activity,     title: "全球市场状态监控",   desc: "6 大市场实时开收盘状态，倒计时提醒，临近开收盘弹窗通知",                   tag: "LIVE",   accent: "oklch(65% 0.20 155)", bg: "oklch(65% 0.20 155 / 0.08)", border: "oklch(65% 0.20 155 / 0.2)" },
];

const ENTRY_CHIPS = [
  { label: "深度分析 AAPL", icon: TrendingUp },
  { label: "港股机会扫描",  icon: Globe },
  { label: "宏观风险评估",  icon: Shield },
  { label: "量化因子回测",  icon: Cpu },
  { label: "A 股估值筛选",  icon: LineChart },
  { label: "美联储政策分析",icon: Zap },
];

// ─── 主组件 ───────────────────────────────────────────────────────────────────
export default function Home() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();
  const { data: accessData } = trpc.access.check.useQuery(undefined, { enabled: isAuthenticated });
  const loginSectionRef = useRef<HTMLDivElement>(null);

  const scrollToLogin = () => {
    loginSectionRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (!loading && isAuthenticated && accessData?.hasAccess) navigate("/research");
    else if (!loading && isAuthenticated && accessData && !accessData.hasAccess) navigate("/access");
  }, [loading, isAuthenticated, accessData, navigate]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "oklch(8.5% 0.008 240)" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <Loader2 style={{ width: 24, height: 24, color: "oklch(65% 0.18 255)" }} className="animate-spin" />
          <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.12em", color: "oklch(35% 0.006 240)" }}>INITIALIZING...</span>
        </div>
      </div>
    );
  }
  return (
    <div style={{ background: "#09090b", overflowY: "auto", height: "100vh" }}>
      {/* Section 1: Hero */}
      <HeroSection onScrollDown={scrollToLogin} />
      {/* Section 2: Login */}
      <div ref={loginSectionRef}>
        <LoginSection />
      </div>
    </div>
  );
}
