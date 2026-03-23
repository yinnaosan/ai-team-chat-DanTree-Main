import { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Bot, Brain, Database, Shield, ArrowRight, Zap,
  TrendingUp, TrendingDown, BarChart3, Globe, Lock, Loader2,
  Activity, Cpu, LineChart, Terminal, Command,
  Layers, FlaskConical, BookOpen, Wallet, CheckCircle2
} from "lucide-react";

// ── Bloomberg 风格背景网格 ──────────────────────────────────────────────────
function GridBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(oklch(45% 0.015 240 / 0.05) 1px, transparent 1px),
            linear-gradient(90deg, oklch(45% 0.015 240 / 0.05) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px"
        }}
      />
      <div className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(oklch(45% 0.015 240 / 0.025) 1px, transparent 1px),
            linear-gradient(90deg, oklch(45% 0.015 240 / 0.025) 1px, transparent 1px)
          `,
          backgroundSize: "200px 200px"
        }}
      />
      <div className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse 70% 40% at 50% -10%, oklch(78% 0.18 75 / 0.04), transparent)" }}
      />
      <div className="absolute bottom-0 left-0 right-0 h-48"
        style={{ background: "linear-gradient(transparent, oklch(8.5% 0.015 240))" }}
      />
    </div>
  );
}

// ── 行情滚动条 ──────────────────────────────────────────────────────────────
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
];

function TickerBar() {
  const doubled = [...MOCK_TICKERS, ...MOCK_TICKERS];
  return (
    <div className="bloomberg-ticker h-8 flex items-center overflow-hidden shrink-0">
      <div className="bloomberg-ticker-track flex items-center">
        {doubled.map((t, i) => (
          <div key={i} className="bloomberg-ticker-item flex items-center gap-2 px-4"
            style={{ borderRight: "1px solid var(--bloomberg-border-dim)" }}>
            <span className="text-xs font-bold tracking-wider"
              style={{ color: "var(--bloomberg-text-primary)", fontFamily: "'IBM Plex Mono', monospace" }}>{t.symbol}</span>
            <span className="text-xs font-mono"
              style={{ color: "var(--bloomberg-text-secondary)" }}>{t.price}</span>
            <span className={`text-xs font-mono font-medium ${t.up ? "bloomberg-ticker-change up" : "bloomberg-ticker-change down"}`}>
              {t.change}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 核心特性数据 ────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: Database,
    title: "多源数据引擎",
    desc: "实时接入 30+ 专业数据源，Polygon、Finnhub、FMP、Alpha Vantage，自动交叉验证。",
    tag: "LIVE",
    tagColor: "green" as const,
  },
  {
    icon: Brain,
    title: "推理引擎 V1.5",
    desc: "五阶段分析管道：任务解析 → 字段规划 → 数据采集 → 多 Agent 协作 → 综合研判。",
    tag: "AI",
    tagColor: "gold" as const,
  },
  {
    icon: Layers,
    title: "多 Agent 协作",
    desc: "估值、商业、风险、市场背景四个 Agent 并行分析，强制生成反驳论点，避免确认偏误。",
    tag: "MULTI",
    tagColor: "blue" as const,
  },
  {
    icon: Activity,
    title: "AI 记忆系统",
    desc: "自动提取分析结论写入长期记忆，按重要性（1-5 星）分级管理，支持语义搜索。",
    tag: "MEMORY",
    tagColor: "gold" as const,
  },
  {
    icon: FlaskConical,
    title: "因子回测引擎",
    desc: "支持 MACD、RSI、布林带、均线交叉等 6 种技术因子，展示净值曲线、夏普比率。",
    tag: "QUANT",
    tagColor: "blue" as const,
  },
  {
    icon: BookOpen,
    title: "投资知识库",
    desc: "整合 hacker-laws 投资定律、量化因子知识库（MACD/RSI/KDJ/RSRS/ROIC/FCF）。",
    tag: "WIKI",
    tagColor: "neutral" as const,
  },
];

const iconColors = {
  green: "var(--bloomberg-green)",
  gold: "var(--bloomberg-gold)",
  blue: "var(--bloomberg-blue)",
  neutral: "var(--bloomberg-text-tertiary)",
};
const iconBg = {
  green: "oklch(65% 0.20 155 / 0.1)",
  gold: "oklch(78% 0.18 75 / 0.1)",
  blue: "oklch(68% 0.18 250 / 0.1)",
  neutral: "oklch(20% 0.022 240)",
};

// ── 主页组件 ────────────────────────────────────────────────────────────────
export default function Home() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();
  const { data: accessData } = trpc.access.check.useQuery(undefined, { enabled: isAuthenticated });

  useEffect(() => {
    if (!loading && isAuthenticated && accessData?.hasAccess) {
      navigate("/chat");
    } else if (!loading && isAuthenticated && accessData && !accessData.hasAccess) {
      navigate("/access");
    }
  }, [loading, isAuthenticated, accessData, navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: "var(--bloomberg-surface-0)" }}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--bloomberg-gold)" }} />
          <span className="text-xs font-mono" style={{ color: "var(--bloomberg-text-tertiary)" }}>INITIALIZING...</span>
        </div>
      </div>
    );
  }

  if (!loading && isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: "var(--bloomberg-surface-0)" }}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--bloomberg-gold)" }} />
          <span className="text-xs font-mono" style={{ color: "var(--bloomberg-text-tertiary)" }}>LOADING TERMINAL...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col overflow-hidden" style={{ background: "var(--bloomberg-surface-0)" }}>
      <GridBackground />

      {/* ── 顶部导航栏 ── */}
      <header className="relative z-10 shrink-0">
        {/* 行情滚动条 */}
        <TickerBar />
        {/* 主导航 */}
        <div className="flex items-center justify-between px-6 py-3"
          style={{ background: "oklch(8.5% 0.015 240 / 0.95)", backdropFilter: "blur(20px)", borderBottom: "1px solid var(--bloomberg-border-dim)" }}>
          <div className="flex items-center gap-3">
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310519663340309886/Sfk3bwgkEZLNATmH8kTpez/logo-64_4554290f.png"
              alt="DanTree"
              className="w-7 h-7 rounded object-cover"
            />
            <div>
              <span className="text-sm font-bold tracking-tight"
                style={{ color: "var(--bloomberg-text-primary)", fontFamily: "'Space Grotesk', sans-serif" }}>
                DanTree
              </span>
              <span className="ml-2 bloomberg-badge gold" style={{ fontSize: "0.625rem" }}>TERMINAL</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded text-xs"
              style={{ background: "var(--bloomberg-surface-2)", border: "1px solid var(--bloomberg-border-dim)", color: "var(--bloomberg-text-tertiary)" }}>
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--bloomberg-green)" }} />
              <span className="font-mono text-[10px]">MARKET OPEN</span>
            </div>
            <button
              onClick={() => window.location.href = getLoginUrl()}
              className="bloomberg-btn-primary">
              <Terminal className="w-3.5 h-3.5" />
              进入终端
            </button>
          </div>
        </div>
      </header>

      {/* ── 主内容区 ── */}
      <main className="relative z-10 flex-1 overflow-y-auto">

        {/* Hero Section */}
        <section className="px-6 py-16 text-center max-w-4xl mx-auto">
          {/* 状态标签 */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6 text-xs"
            style={{ background: "oklch(78% 0.18 75 / 0.08)", border: "1px solid oklch(78% 0.18 75 / 0.2)", color: "var(--bloomberg-gold)" }}>
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--bloomberg-gold)" }} />
            <span className="font-semibold tracking-wider">AI FINANCIAL TERMINAL v2.1</span>
          </div>

          {/* 主标题 */}
          <h1 className="text-4xl font-bold mb-4 leading-tight"
            style={{ color: "var(--bloomberg-text-primary)", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.03em" }}>
            Bloomberg Terminal
            <br />
            <span style={{ color: "var(--bloomberg-gold)" }}>重新定义</span>
            {" "}的 AI 版本
          </h1>

          <p className="text-base mb-8 max-w-2xl mx-auto leading-relaxed"
            style={{ color: "var(--bloomberg-text-secondary)" }}>
            多 Agent 协作分析引擎，实时接入 30+ 专业数据源，自动生成具有反驳论点的投资研究报告。
            专为 A 股、港股、美股投资者设计的专业级 AI 分析平台。
          </p>

          {/* CTA 按钮组 */}
          <div className="flex items-center justify-center gap-3 mb-10">
            <button
              onClick={() => window.location.href = getLoginUrl()}
              className="bloomberg-btn-primary text-sm px-5 py-2.5">
              <Terminal className="w-4 h-4" />
              立即开始分析
            </button>
            <button
              onClick={() => window.location.href = getLoginUrl()}
              className="bloomberg-btn-secondary text-sm px-5 py-2.5">
              <BarChart3 className="w-4 h-4" />
              查看演示
            </button>
          </div>

          {/* 快速分析标签 */}
          <div className="flex flex-wrap justify-center gap-2">
            {["分析 AAPL 基本面", "茅台估值分析", "BTC 技术面", "纳斯达克宏观", "比亚迪 vs 特斯拉", "美联储政策影响"].map((q) => (
              <button key={q}
                onClick={() => window.location.href = getLoginUrl()}
                className="px-3 py-1.5 rounded text-xs transition-all"
                style={{
                  background: "var(--bloomberg-surface-1)",
                  border: "1px solid var(--bloomberg-border-dim)",
                  color: "var(--bloomberg-text-tertiary)",
                  fontFamily: "'IBM Plex Mono', monospace",
                }}>
                {q}
              </button>
            ))}
          </div>
        </section>

        {/* 统计数字 */}
        <section className="px-6 pb-10 max-w-4xl mx-auto">
          <div className="grid grid-cols-3 gap-3">
            {[
              { value: "30+", label: "专业数据源", sub: "实时接入" },
              { value: "5", label: "分析阶段", sub: "推理引擎 V1.5" },
              { value: "4", label: "AI Agent", sub: "并行协作" },
            ].map(({ value, label, sub }) => (
              <div key={label} className="bloomberg-card text-center py-4 px-6">
                <div className="bloomberg-stat-value xl mb-1" style={{ color: "var(--bloomberg-gold)" }}>{value}</div>
                <div className="text-xs font-semibold" style={{ color: "var(--bloomberg-text-secondary)" }}>{label}</div>
                <div className="text-[10px] mt-0.5" style={{ color: "var(--bloomberg-text-dim)" }}>{sub}</div>
              </div>
            ))}
          </div>
        </section>

        {/* 快速入口 */}
        <section className="px-6 pb-10 max-w-4xl mx-auto">
          <div className="bloomberg-section-label mb-3">快速入口</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { icon: Brain, label: "AI 分析对话", desc: "多 Agent 深度股票分析", shortcut: "⌘1" },
              { icon: FlaskConical, label: "因子回测", desc: "技术因子量化回测", shortcut: "⌘2" },
              { icon: Wallet, label: "资产负债表", desc: "个人资产组合管理", shortcut: "⌘3" },
              { icon: BookOpen, label: "投资知识库", desc: "量化因子 + 投资定律", shortcut: "⌘4" },
            ].map(({ icon: Icon, label, desc, shortcut }) => (
              <button key={label}
                onClick={() => window.location.href = getLoginUrl()}
                className="bloomberg-card text-left p-3 group transition-all w-full">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded flex items-center justify-center shrink-0"
                    style={{ background: "var(--bloomberg-surface-2)", border: "1px solid var(--bloomberg-border-dim)" }}>
                    <Icon className="w-4 h-4" style={{ color: "var(--bloomberg-gold)" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold" style={{ color: "var(--bloomberg-text-primary)", fontFamily: "'Space Grotesk', sans-serif" }}>{label}</div>
                    <div className="text-xs" style={{ color: "var(--bloomberg-text-tertiary)" }}>{desc}</div>
                  </div>
                  <span className="bloomberg-command-kbd shrink-0">{shortcut}</span>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: "var(--bloomberg-text-tertiary)" }} />
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* 核心特性 */}
        <section className="px-6 pb-10 max-w-4xl mx-auto">
          <div className="bloomberg-section-label mb-3">核心特性</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="bloomberg-card group transition-all cursor-default">
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-9 h-9 rounded flex items-center justify-center shrink-0"
                        style={{ background: iconBg[f.tagColor], border: `1px solid ${iconColors[f.tagColor]}22` }}>
                        <Icon style={{ color: iconColors[f.tagColor], width: "1.125rem", height: "1.125rem" }} />
                      </div>
                      <span className={`bloomberg-badge ${f.tagColor}`}>{f.tag}</span>
                    </div>
                    <h3 className="text-sm font-semibold mb-1.5"
                      style={{ color: "var(--bloomberg-text-primary)", fontFamily: "'Space Grotesk', sans-serif" }}>
                      {f.title}
                    </h3>
                    <p className="text-xs leading-relaxed" style={{ color: "var(--bloomberg-text-tertiary)" }}>
                      {f.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 系统状态 */}
        <section className="px-6 pb-10 max-w-4xl mx-auto">
          <div className="bloomberg-section-label mb-3">系统状态</div>
          <div className="bloomberg-card p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "数据引擎", status: "OPERATIONAL", ok: true },
                { label: "AI 分析", status: "OPERATIONAL", ok: true },
                { label: "记忆系统", status: "OPERATIONAL", ok: true },
                { label: "新闻 API", status: "OPERATIONAL", ok: true },
              ].map(({ label, status, ok }) => (
                <div key={label} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full"
                    style={{ background: ok ? "var(--bloomberg-green)" : "var(--bloomberg-red)" }} />
                  <div>
                    <div className="text-xs font-medium" style={{ color: "var(--bloomberg-text-secondary)" }}>{label}</div>
                    <div className="text-[10px] font-mono" style={{ color: ok ? "var(--bloomberg-green)" : "var(--bloomberg-red)" }}>{status}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 命令面板提示 */}
        <section className="px-6 pb-10 max-w-4xl mx-auto">
          <div className="bloomberg-card p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded flex items-center justify-center"
                style={{ background: "oklch(78% 0.18 75 / 0.1)", border: "1px solid oklch(78% 0.18 75 / 0.2)" }}>
                <Command className="w-4 h-4" style={{ color: "var(--bloomberg-gold)" }} />
              </div>
              <div>
                <div className="text-sm font-semibold"
                  style={{ color: "var(--bloomberg-text-primary)", fontFamily: "'Space Grotesk', sans-serif" }}>
                  命令面板
                </div>
                <div className="text-xs" style={{ color: "var(--bloomberg-text-tertiary)" }}>
                  登录后按 <span className="bloomberg-command-kbd">⌘K</span> 快速访问所有功能
                </div>
              </div>
            </div>
            <button
              onClick={() => window.location.href = getLoginUrl()}
              className="bloomberg-btn-primary text-xs">
              登录访问
            </button>
          </div>
        </section>
      </main>

      {/* ── 底部 ── */}
      <footer className="relative z-10 px-6 py-4 shrink-0"
        style={{ borderTop: "1px solid var(--bloomberg-border-dim)" }}>
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--bloomberg-text-dim)" }}>
            <Lock className="w-3 h-3" />
            <span>私有协作平台 · 仅限授权用户 · 数据仅供参考，不构成投资建议</span>
          </div>
          <div className="text-xs font-mono" style={{ color: "var(--bloomberg-text-dim)" }}>
            v2.1.0
          </div>
        </div>
      </footer>
    </div>
  );
}
