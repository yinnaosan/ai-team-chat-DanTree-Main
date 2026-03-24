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
    <div style={{ background: "oklch(4.5% 0.008 240)", borderBottom: "1px solid oklch(100% 0 0 / 0.05)", height: "26px", display: "flex", alignItems: "center", overflow: "hidden", flexShrink: 0 }}>
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

  const gold = "oklch(78% 0.18 75)";
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
  night:  "oklch(0.65 0.18 250)",
  "24h":  "oklch(0.72 0.18 142)",
};
const STATUS_LABEL: Record<string, string> = {
  open: "开盘", pre: "盘前", post: "盘后", closed: "休市", night: "夜盘", "24h": "24H",
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
  { icon: Brain,        title: "双引擎 AI 协作",    desc: "Manus + GPT 同时分析，交叉验证，自动生成反驳论点，避免确认偏误",              tag: "CORE",   accent: "oklch(78% 0.18 75)",  bg: "oklch(78% 0.18 75 / 0.08)",  border: "oklch(78% 0.18 75 / 0.2)" },
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

  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);
  const handleInstall = async () => {
    if (!installPrompt) return;
    (installPrompt as any).prompt();
    const { outcome } = await (installPrompt as any).userChoice;
    if (outcome === "accepted") setInstallPrompt(null);
  };

  useEffect(() => {
    if (!loading && isAuthenticated && accessData?.hasAccess) navigate("/research");
    else if (!loading && isAuthenticated && accessData && !accessData.hasAccess) navigate("/access");
  }, [loading, isAuthenticated, accessData, navigate]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "oklch(4.5% 0.008 240)" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <Loader2 style={{ width: 24, height: 24, color: "oklch(78% 0.18 75)" }} className="animate-spin" />
          <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.12em", color: "oklch(35% 0.006 240)" }}>INITIALIZING...</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "oklch(4.5% 0.008 240)", display: "flex", flexDirection: "column", overflow: "hidden auto" }}>
      {/* Ticker strip */}
      <TickerStrip />

      {/* Top nav */}
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 32px", borderBottom: "1px solid oklch(100% 0 0 / 0.05)", flexShrink: 0, background: "oklch(4.5% 0.008 240 / 0.95)", backdropFilter: "blur(20px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "oklch(78% 0.18 75 / 0.15)", border: "1px solid oklch(78% 0.18 75 / 0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Terminal style={{ width: 14, height: 14, color: "oklch(78% 0.18 75)" }} />
          </div>
          <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: "-0.02em", color: "oklch(88% 0.004 240)", fontFamily: "'Space Grotesk', sans-serif" }}>DanTree Terminal</span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", padding: "2px 7px", borderRadius: 4, background: "oklch(78% 0.18 75 / 0.1)", border: "1px solid oklch(78% 0.18 75 / 0.25)", color: "oklch(78% 0.18 75)", fontFamily: "'IBM Plex Mono', monospace" }}>v3.0</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {installPrompt && (
            <button onClick={handleInstall} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "oklch(100% 0 0 / 0.04)", border: "1px solid oklch(100% 0 0 / 0.1)", color: "oklch(60% 0.007 240)", cursor: "pointer" }}>
              <Smartphone style={{ width: 13, height: 13 }} />安装到桌面
            </button>
          )}
          <button onClick={() => window.location.href = getLoginUrl()} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 700, background: "oklch(78% 0.18 75)", color: "oklch(10% 0.015 240)", border: "none", cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif", boxShadow: "0 0 32px oklch(78% 0.18 75 / 0.25)" }}>
            <Terminal style={{ width: 14, height: 14 }} />进入终端<ArrowRight style={{ width: 14, height: 14 }} />
          </button>
        </div>
      </nav>

      {/* Hero section */}
      <section style={{ position: "relative", padding: "60px 32px 40px", maxWidth: 1100, margin: "0 auto", width: "100%", display: "flex", alignItems: "center", gap: 48, overflow: "hidden" }}>
        {/* Background grid */}
        <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(oklch(100% 0 0 / 0.03) 1px, transparent 1px), linear-gradient(90deg, oklch(100% 0 0 / 0.03) 1px, transparent 1px)", backgroundSize: "40px 40px", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: "20%", left: "30%", width: "60%", height: "60%", background: "radial-gradient(ellipse at center, oklch(78% 0.18 75 / 0.06), transparent 70%)", pointerEvents: "none" }} />

        {/* Left: Text */}
        <div style={{ flex: 1, position: "relative", zIndex: 10 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 6, background: "oklch(78% 0.18 75 / 0.08)", border: "1px solid oklch(78% 0.18 75 / 0.2)", marginBottom: 20 }}>
            <div className="animate-pulse" style={{ width: 5, height: 5, borderRadius: "50%", background: "oklch(78% 0.18 75)" }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "oklch(78% 0.18 75)", fontFamily: "'IBM Plex Mono', monospace" }}>AI FINANCIAL TERMINAL v3.0 · PRIVATE BETA</span>
          </div>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, letterSpacing: "-0.04em", fontSize: "clamp(42px, 6vw, 72px)", color: "oklch(91% 0.004 240)", lineHeight: 1.05, marginBottom: 20 }}>
            DanTree Terminal<br />
            <span style={{ color: "oklch(78% 0.18 75)", textShadow: "0 0 60px oklch(78% 0.18 75 / 0.5)" }}>重新定义</span>{" "}的投研终端
          </h1>
          <p style={{ fontSize: "clamp(13px, 1.4vw, 16px)", color: "oklch(50% 0.007 240)", maxWidth: 480, lineHeight: 1.75, marginBottom: 32 }}>
            多 Agent 协作分析引擎，实时接入 <strong style={{ color: "oklch(78% 0.18 75)" }}>40+</strong> 专业数据源，
            自动生成具有反驳论点的投资研究报告。专为 A 股、港股、美股投资者设计。
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
            <button onClick={() => window.location.href = getLoginUrl()} style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 26px", borderRadius: 12, fontSize: 14, fontWeight: 800, background: "oklch(78% 0.18 75)", color: "oklch(10% 0.015 240)", border: "none", cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif", boxShadow: "0 0 50px oklch(78% 0.18 75 / 0.35), 0 8px 24px oklch(0% 0 0 / 0.5)" }}>
              <Terminal style={{ width: 15, height: 15 }} />立即进入终端<ArrowRight style={{ width: 15, height: 15 }} />
            </button>
            <button onClick={() => window.location.href = getLoginUrl()} style={{ display: "flex", alignItems: "center", gap: 8, padding: "13px 20px", borderRadius: 12, fontSize: 13, fontWeight: 600, background: "oklch(100% 0 0 / 0.04)", border: "1px solid oklch(100% 0 0 / 0.1)", color: "oklch(58% 0.007 240)", cursor: "pointer" }}>
              了解更多 <ChevronRight style={{ width: 14, height: 14 }} />
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {ENTRY_CHIPS.map((chip) => {
              const Icon = chip.icon;
              return (
                <button key={chip.label} onClick={() => window.location.href = getLoginUrl()} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 999, fontSize: 11, fontWeight: 500, background: "oklch(100% 0 0 / 0.04)", border: "1px solid oklch(100% 0 0 / 0.08)", color: "oklch(48% 0.007 240)", cursor: "pointer" }}>
                  <Icon style={{ width: 11, height: 11 }} />{chip.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Robot + Market Status */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, flexShrink: 0, position: "relative", zIndex: 10 }}>
          <AIRobot />
          <div style={{ width: 320, padding: "16px", borderRadius: 14, background: "oklch(100% 0 0 / 0.03)", border: "1px solid oklch(100% 0 0 / 0.09)", backdropFilter: "blur(16px)", boxShadow: "0 8px 32px oklch(0% 0 0 / 0.4)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: "oklch(45% 0.006 240)", fontFamily: "'IBM Plex Mono', monospace" }}>GLOBAL MARKETS</span>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div className="animate-pulse" style={{ width: 5, height: 5, borderRadius: "50%", background: "oklch(68% 0.18 145)" }} />
                <span style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", color: "oklch(68% 0.18 145)", fontWeight: 700 }}>LIVE</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {MARKET_LIST.map(m => <MarketStatusRow key={m.type} type={m.type} label={m.label} flag={m.flag} />)}
            </div>
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section style={{ padding: "0 32px 56px", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ display: "inline-block", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", padding: "4px 12px", borderRadius: 6, color: "oklch(42% 0.006 240)", background: "oklch(100% 0 0 / 0.03)", border: "1px solid oklch(100% 0 0 / 0.06)", fontFamily: "'IBM Plex Mono', monospace", marginBottom: 10 }}>CORE FEATURES</div>
          <h2 style={{ fontSize: "clamp(22px, 2.8vw, 32px)", fontWeight: 800, letterSpacing: "-0.03em", color: "oklch(86% 0.004 240)", fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>专业级投资研究工具集</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} style={{ padding: 18, borderRadius: 14, background: "oklch(100% 0 0 / 0.025)", border: "1px solid oklch(100% 0 0 / 0.07)", backdropFilter: "blur(12px)", transition: "all 0.25s", cursor: "default" }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = "oklch(100% 0 0 / 0.045)"; el.style.borderColor = f.border; el.style.boxShadow = `0 0 24px ${f.accent}18`; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = "oklch(100% 0 0 / 0.025)"; el.style.borderColor = "oklch(100% 0 0 / 0.07)"; el.style.boxShadow = "none"; }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: f.bg, border: `1px solid ${f.border}` }}>
                    <Icon style={{ color: f.accent, width: 17, height: 17 }} />
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", padding: "3px 7px", borderRadius: 4, background: f.bg, color: f.accent, border: `1px solid ${f.border}`, fontFamily: "'IBM Plex Mono', monospace" }}>{f.tag}</span>
                </div>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: "oklch(86% 0.004 240)", fontFamily: "'Space Grotesk', sans-serif", marginBottom: 7, letterSpacing: "-0.01em" }}>{f.title}</h3>
                <p style={{ fontSize: 11, lineHeight: 1.65, color: "oklch(44% 0.006 240)", margin: 0 }}>{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Install banner */}
      {installPrompt && (
        <section style={{ padding: "0 32px 20px", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderRadius: 12, background: "oklch(78% 0.18 75 / 0.06)", border: "1px solid oklch(78% 0.18 75 / 0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Smartphone style={{ width: 18, height: 18, color: "oklch(78% 0.18 75)" }} />
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: "oklch(82% 0.004 240)", margin: 0 }}>安装 DanTree Terminal 到桌面</p>
                <p style={{ fontSize: 11, color: "oklch(48% 0.007 240)", margin: 0 }}>离线可用 · 快速启动 · 全屏体验</p>
              </div>
            </div>
            <button onClick={handleInstall} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, background: "oklch(78% 0.18 75)", color: "oklch(10% 0.015 240)", border: "none", cursor: "pointer" }}>
              <Download style={{ width: 13, height: 13 }} />立即安装
            </button>
          </div>
        </section>
      )}

      {/* Status + CTA */}
      <section style={{ padding: "0 32px 56px", maxWidth: 1100, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ padding: "14px 18px", borderRadius: 12, background: "oklch(100% 0 0 / 0.025)", border: "1px solid oklch(100% 0 0 / 0.07)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "oklch(42% 0.006 240)", fontFamily: "'IBM Plex Mono', monospace" }}>SYSTEM STATUS</span>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div className="animate-pulse" style={{ width: 5, height: 5, borderRadius: "50%", background: "oklch(68% 0.18 145)" }} />
              <span style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", color: "oklch(68% 0.18 145)", letterSpacing: "0.06em" }}>ALL SYSTEMS OPERATIONAL</span>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            {["数据引擎", "AI 分析", "记忆系统", "新闻 API"].map((label) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "oklch(68% 0.18 145)", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 500, color: "oklch(58% 0.007 240)" }}>{label}</div>
                  <div style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", color: "oklch(68% 0.18 145)" }}>OPERATIONAL</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ position: "relative", overflow: "hidden", padding: "36px 28px", borderRadius: 18, textAlign: "center", background: "oklch(78% 0.18 75 / 0.06)", border: "1px solid oklch(78% 0.18 75 / 0.2)" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 60% 80% at 50% 50%, oklch(78% 0.18 75 / 0.06), transparent)", pointerEvents: "none" }} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <h2 style={{ fontSize: "clamp(18px, 2.2vw, 26px)", fontWeight: 800, letterSpacing: "-0.03em", color: "oklch(88% 0.004 240)", fontFamily: "'Space Grotesk', sans-serif", marginBottom: 8 }}>准备好进入专业级 AI 投资终端了吗？</h2>
            <p style={{ fontSize: 13, color: "oklch(48% 0.007 240)", marginBottom: 20 }}>私有协作平台 · 仅限授权用户 · 数据仅供参考，不构成投资建议</p>
            <button onClick={() => window.location.href = getLoginUrl()} style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "12px 26px", borderRadius: 12, fontSize: 14, fontWeight: 800, background: "oklch(78% 0.18 75)", color: "oklch(10% 0.015 240)", border: "none", cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif", boxShadow: "0 0 40px oklch(78% 0.18 75 / 0.3)" }}>
              <Terminal style={{ width: 15, height: 15 }} />申请访问权限<ArrowRight style={{ width: 15, height: 15 }} />
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: "12px 32px", borderTop: "1px solid oklch(100% 0 0 / 0.05)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 10, color: "oklch(26% 0.006 240)" }}>
          <Lock style={{ width: 11, height: 11 }} />
          <span>私有协作平台 · 仅限授权用户 · 数据仅供参考，不构成投资建议</span>
        </div>
        <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: "oklch(26% 0.006 240)" }}>v3.0.0</div>
      </footer>
    </div>
  );
}
