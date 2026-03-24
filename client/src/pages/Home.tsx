import { useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  ArrowRight, Loader2, Terminal, Lock,
  TrendingUp, Brain, Database, Shield,
  Zap, BarChart3, Activity, LineChart,
  ChevronRight, Globe, Cpu, FlaskConical,
} from "lucide-react";

const MOCK_TICKERS = [
  { symbol: "SPX", price: "5,234.18", change: "+0.82%", up: true },
  { symbol: "NDX", price: "18,421.31", change: "+1.24%", up: true },
  { symbol: "HSI", price: "17,284.54", change: "-0.43%", up: false },
  { symbol: "000001", price: "3,089.26", change: "+0.31%", up: true },
  { symbol: "AAPL", price: "189.84", change: "+0.67%", up: true },
  { symbol: "TSLA", price: "248.50", change: "-1.23%", up: false },
  { symbol: "BTC", price: "67,234", change: "+2.14%", up: true },
  { symbol: "NVDA", price: "875.39", change: "+3.42%", up: true },
  { symbol: "00700", price: "362.40", change: "-0.55%", up: false },
  { symbol: "600519", price: "1,542.00", change: "+0.28%", up: true },
  { symbol: "DXY", price: "104.23", change: "-0.18%", up: false },
  { symbol: "GOLD", price: "2,312.40", change: "+0.94%", up: true },
  { symbol: "WTI", price: "82.15", change: "+0.61%", up: true },
  { symbol: "EUR/USD", price: "1.0842", change: "-0.12%", up: false },
  { symbol: "VIX", price: "14.82", change: "-3.21%", up: false },
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

const FEATURES = [
  { icon: Brain, title: "双引擎 AI 协作", desc: "Manus + GPT 同时分析，交叉验证，自动生成反驳论点，避免确认偏误", tag: "CORE", accent: "oklch(78% 0.18 75)", bg: "oklch(78% 0.18 75 / 0.08)", border: "oklch(78% 0.18 75 / 0.2)" },
  { icon: Database, title: "30+ 专业数据源", desc: "Finnhub · Twelve Data · FRED · Alpha Vantage · SEC EDGAR 实时接入", tag: "DATA", accent: "oklch(68% 0.18 250)", bg: "oklch(68% 0.18 250 / 0.08)", border: "oklch(68% 0.18 250 / 0.2)" },
  { icon: BarChart3, title: "Bloomberg 四列终端", desc: "侧边栏 · 分析列 · 讨论列 · 洞察列，专业级工作台布局", tag: "LAYOUT", accent: "oklch(65% 0.20 155)", bg: "oklch(65% 0.20 155 / 0.08)", border: "oklch(65% 0.20 155 / 0.2)" },
  { icon: FlaskConical, title: "Alpha 因子回测", desc: "健康评分 · 情绪分析 · 趋势雷达 · 模拟交易，量化研究全套", tag: "QUANT", accent: "oklch(72% 0.18 300)", bg: "oklch(72% 0.18 300 / 0.08)", border: "oklch(72% 0.18 300 / 0.2)" },
  { icon: Shield, title: "风险矩阵分析", desc: "自动识别 5 大风险维度，量化评分，生成对冲建议", tag: "RISK", accent: "oklch(62% 0.22 25)", bg: "oklch(62% 0.22 25 / 0.08)", border: "oklch(62% 0.22 25 / 0.2)" },
  { icon: Activity, title: "实时行情监控", desc: "Pinned Metrics 栏实时显示价格、涨跌幅、PE、PB、ROE", tag: "LIVE", accent: "oklch(65% 0.20 155)", bg: "oklch(65% 0.20 155 / 0.08)", border: "oklch(65% 0.20 155 / 0.2)" },
];

const ENTRY_CHIPS = [
  { label: "深度分析 AAPL", icon: TrendingUp },
  { label: "港股机会扫描", icon: Globe },
  { label: "宏观风险评估", icon: Shield },
  { label: "量化因子回测", icon: Cpu },
  { label: "A 股估值筛选", icon: LineChart },
  { label: "美联储政策分析", icon: Zap },
];

export default function Home() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();
  const { data: accessData } = trpc.access.check.useQuery(undefined, { enabled: isAuthenticated });

  useEffect(() => {
    if (!loading && isAuthenticated && accessData?.hasAccess) navigate("/chat");
    else if (!loading && isAuthenticated && accessData && !accessData.hasAccess) navigate("/access");
  }, [loading, isAuthenticated, accessData, navigate]);

  if (loading || (!loading && isAuthenticated)) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "oklch(4.5% 0.008 240)" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <Loader2 style={{ width: 24, height: 24, color: "oklch(78% 0.18 75)" }} className="animate-spin" />
          <span style={{ fontSize: "10px", fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.12em", color: "oklch(35% 0.006 240)" }}>
            {loading ? "INITIALIZING..." : "LOADING TERMINAL..."}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "oklch(4.5% 0.008 240)", overflowX: "hidden" }}>
      <TickerStrip />

      {/* Nav */}
      <header style={{ position: "relative", zIndex: 20, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 32px", background: "oklch(4.5% 0.008 240 / 0.95)", backdropFilter: "blur(20px)", borderBottom: "1px solid oklch(100% 0 0 / 0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663340309886/Sfk3bwgkEZLNATmH8kTpez/logo-64_4554290f.png" alt="DanTree" style={{ width: 32, height: 32, borderRadius: 8, objectFit: "cover" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em", color: "oklch(90% 0.004 240)", fontFamily: "'Space Grotesk', sans-serif" }}>DanTree</span>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", padding: "2px 6px", borderRadius: 4, background: "oklch(78% 0.18 75 / 0.12)", color: "oklch(78% 0.18 75)", border: "1px solid oklch(78% 0.18 75 / 0.25)", fontFamily: "'IBM Plex Mono', monospace" }}>TERMINAL</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, background: "oklch(100% 0 0 / 0.03)", border: "1px solid oklch(100% 0 0 / 0.07)", color: "oklch(42% 0.006 240)" }}>
            <div className="animate-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: "oklch(68% 0.18 145)" }} />
            <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.08em" }}>MARKET OPEN</span>
          </div>
          <button
            onClick={() => window.location.href = getLoginUrl()}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 20px", borderRadius: 10, fontSize: 13, fontWeight: 700, background: "oklch(78% 0.18 75)", color: "oklch(10% 0.015 240)", border: "none", cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.01em", boxShadow: "0 0 32px oklch(78% 0.18 75 / 0.25), 0 4px 12px oklch(0% 0 0 / 0.4)" }}
          >
            <Terminal style={{ width: 14, height: 14 }} />
            进入终端
            <ArrowRight style={{ width: 14, height: 14 }} />
          </button>
        </div>
      </header>

      {/* Hero */}
      <section style={{ position: "relative", minHeight: "88vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", textAlign: "center" }}>
        {/* Grid lines */}
        <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(oklch(100% 0 0 / 0.028) 1px, transparent 1px), linear-gradient(90deg, oklch(100% 0 0 / 0.028) 1px, transparent 1px)", backgroundSize: "60px 60px", pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(oklch(100% 0 0 / 0.05) 1px, transparent 1px), linear-gradient(90deg, oklch(100% 0 0 / 0.05) 1px, transparent 1px)", backgroundSize: "300px 300px", pointerEvents: "none" }} />
        {/* Radial gold glow */}
        <div style={{ position: "absolute", top: "5%", left: "50%", transform: "translateX(-50%)", width: "1000px", height: "600px", background: "radial-gradient(ellipse at center, oklch(78% 0.18 75 / 0.07) 0%, oklch(78% 0.18 75 / 0.025) 45%, transparent 70%)", pointerEvents: "none" }} />
        {/* Bottom fade */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "200px", background: "linear-gradient(transparent, oklch(4.5% 0.008 240))", pointerEvents: "none" }} />

        {/* Status badge */}
        <div style={{ position: "relative", zIndex: 10, display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 999, marginBottom: 28, background: "oklch(78% 0.18 75 / 0.08)", border: "1px solid oklch(78% 0.18 75 / 0.22)", backdropFilter: "blur(10px)" }}>
          <div className="animate-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: "oklch(78% 0.18 75)" }} />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "oklch(78% 0.18 75)", fontFamily: "'IBM Plex Mono', monospace" }}>AI FINANCIAL TERMINAL v2.1 · PRIVATE BETA</span>
        </div>

        {/* Headline */}
        <h1 style={{ position: "relative", zIndex: 10, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, letterSpacing: "-0.04em", fontSize: "clamp(52px, 7.5vw, 88px)", color: "oklch(91% 0.004 240)", lineHeight: 1.05, marginBottom: 24, maxWidth: 960 }}>
          Bloomberg Terminal
          <br />
          <span style={{ color: "oklch(78% 0.18 75)", textShadow: "0 0 80px oklch(78% 0.18 75 / 0.5)" }}>重新定义</span>
          {" "}的 AI 版本
        </h1>

        {/* Subtitle */}
        <p style={{ position: "relative", zIndex: 10, fontSize: "clamp(14px, 1.6vw, 18px)", color: "oklch(52% 0.007 240)", maxWidth: 560, lineHeight: 1.7, marginBottom: 40, fontFamily: "'Inter', sans-serif" }}>
          多 Agent 协作分析引擎，实时接入 30+ 专业数据源，
          自动生成具有反驳论点的投资研究报告。
          专为 A 股、港股、美股投资者设计。
        </p>

        {/* CTA buttons */}
        <div style={{ position: "relative", zIndex: 10, display: "flex", alignItems: "center", gap: 16, marginBottom: 48 }}>
          <button
            onClick={() => window.location.href = getLoginUrl()}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 28px", borderRadius: 12, fontSize: 15, fontWeight: 800, background: "oklch(78% 0.18 75)", color: "oklch(10% 0.015 240)", border: "none", cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.01em", boxShadow: "0 0 50px oklch(78% 0.18 75 / 0.35), 0 8px 24px oklch(0% 0 0 / 0.5)" }}
          >
            <Terminal style={{ width: 16, height: 16 }} />
            立即进入终端
            <ArrowRight style={{ width: 16, height: 16 }} />
          </button>
          <button
            onClick={() => window.location.href = getLoginUrl()}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 22px", borderRadius: 12, fontSize: 14, fontWeight: 600, background: "oklch(100% 0 0 / 0.04)", border: "1px solid oklch(100% 0 0 / 0.1)", color: "oklch(60% 0.007 240)", cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            了解更多
            <ChevronRight style={{ width: 15, height: 15 }} />
          </button>
        </div>

        {/* Entry chips */}
        <div style={{ position: "relative", zIndex: 10, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 8, maxWidth: 620 }}>
          {ENTRY_CHIPS.map((chip) => {
            const Icon = chip.icon;
            return (
              <button
                key={chip.label}
                onClick={() => window.location.href = getLoginUrl()}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 999, fontSize: 12, fontWeight: 500, background: "oklch(100% 0 0 / 0.04)", border: "1px solid oklch(100% 0 0 / 0.08)", color: "oklch(50% 0.007 240)", cursor: "pointer", backdropFilter: "blur(8px)" }}
              >
                <Icon style={{ width: 12, height: 12 }} />
                {chip.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Features grid */}
      <section style={{ padding: "0 24px 80px", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ display: "inline-block", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", padding: "4px 12px", borderRadius: 6, color: "oklch(42% 0.006 240)", background: "oklch(100% 0 0 / 0.03)", border: "1px solid oklch(100% 0 0 / 0.06)", fontFamily: "'IBM Plex Mono', monospace", marginBottom: 12 }}>CORE FEATURES</div>
          <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 800, letterSpacing: "-0.03em", color: "oklch(86% 0.004 240)", fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>专业级投资研究工具集</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                style={{ padding: 20, borderRadius: 16, background: "oklch(100% 0 0 / 0.025)", border: "1px solid oklch(100% 0 0 / 0.07)", backdropFilter: "blur(12px)", transition: "all 0.25s", cursor: "default" }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = "oklch(100% 0 0 / 0.045)"; el.style.borderColor = f.border; el.style.boxShadow = "0 0 28px " + f.accent + "18"; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = "oklch(100% 0 0 / 0.025)"; el.style.borderColor = "oklch(100% 0 0 / 0.07)"; el.style.boxShadow = "none"; }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: f.bg, border: "1px solid " + f.border }}>
                    <Icon style={{ color: f.accent, width: 18, height: 18 }} />
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", padding: "3px 8px", borderRadius: 5, background: f.bg, color: f.accent, border: "1px solid " + f.border, fontFamily: "'IBM Plex Mono', monospace" }}>{f.tag}</span>
                </div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "oklch(86% 0.004 240)", fontFamily: "'Space Grotesk', sans-serif", marginBottom: 8, letterSpacing: "-0.01em" }}>{f.title}</h3>
                <p style={{ fontSize: 12, lineHeight: 1.65, color: "oklch(44% 0.006 240)", margin: 0 }}>{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Status + CTA */}
      <section style={{ padding: "0 24px 80px", maxWidth: 1100, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ padding: "16px 20px", borderRadius: 14, background: "oklch(100% 0 0 / 0.025)", border: "1px solid oklch(100% 0 0 / 0.07)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "oklch(42% 0.006 240)", fontFamily: "'IBM Plex Mono', monospace" }}>SYSTEM STATUS</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div className="animate-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: "oklch(68% 0.18 145)" }} />
              <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: "oklch(68% 0.18 145)", letterSpacing: "0.06em" }}>ALL SYSTEMS OPERATIONAL</span>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {["数据引擎", "AI 分析", "记忆系统", "新闻 API"].map((label) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "oklch(68% 0.18 145)", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "oklch(60% 0.007 240)" }}>{label}</div>
                  <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: "oklch(68% 0.18 145)" }}>OPERATIONAL</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ position: "relative", overflow: "hidden", padding: "40px 32px", borderRadius: 20, textAlign: "center", background: "oklch(78% 0.18 75 / 0.06)", border: "1px solid oklch(78% 0.18 75 / 0.2)" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 60% 80% at 50% 50%, oklch(78% 0.18 75 / 0.06), transparent)", pointerEvents: "none" }} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <h2 style={{ fontSize: "clamp(20px, 2.5vw, 28px)", fontWeight: 800, letterSpacing: "-0.03em", color: "oklch(88% 0.004 240)", fontFamily: "'Space Grotesk', sans-serif", marginBottom: 10 }}>准备好进入专业级 AI 投资终端了吗？</h2>
            <p style={{ fontSize: 14, color: "oklch(50% 0.007 240)", marginBottom: 24 }}>私有协作平台 · 仅限授权用户 · 数据仅供参考，不构成投资建议</p>
            <button
              onClick={() => window.location.href = getLoginUrl()}
              style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "13px 28px", borderRadius: 12, fontSize: 15, fontWeight: 800, background: "oklch(78% 0.18 75)", color: "oklch(10% 0.015 240)", border: "none", cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif", boxShadow: "0 0 40px oklch(78% 0.18 75 / 0.3)" }}
            >
              <Terminal style={{ width: 16, height: 16 }} />
              申请访问权限
              <ArrowRight style={{ width: 16, height: 16 }} />
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: "14px 32px", borderTop: "1px solid oklch(100% 0 0 / 0.05)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "oklch(28% 0.006 240)" }}>
          <Lock style={{ width: 12, height: 12 }} />
          <span>私有协作平台 · 仅限授权用户 · 数据仅供参考，不构成投资建议</span>
        </div>
        <div style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: "oklch(28% 0.006 240)" }}>v2.1.0</div>
      </footer>
    </div>
  );
}
