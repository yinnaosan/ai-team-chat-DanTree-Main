import { useEffect, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Bot, Brain, Database, Shield, ArrowRight, Zap,
  TrendingUp, TrendingDown, BarChart3, Globe, Lock, Loader2,
  ChevronRight, Activity, Cpu, LineChart
} from "lucide-react";

// ── Animated background grid ────────────────────────────────────────────────
function GridBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Grid lines */}
      <div className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `
            linear-gradient(oklch(0.63 0.20 258) 1px, transparent 1px),
            linear-gradient(90deg, oklch(0.63 0.20 258) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px"
        }}
      />
      {/* Radial gradient overlay */}
      <div className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 80% 50% at 50% -20%, oklch(0.63 0.20 258 / 0.08), transparent)"
        }}
      />
      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-64"
        style={{ background: "linear-gradient(transparent, oklch(0.06 0.004 264))" }}
      />
    </div>
  );
}

// ── Market ticker card ───────────────────────────────────────────────────────
function MarketCard({ symbol, name, price, change, changePercent, positive }: {
  symbol: string; name: string; price: string;
  change: string; changePercent: string; positive: boolean;
}) {
  const color = positive ? "oklch(0.72 0.18 155)" : "oklch(0.72 0.18 25)";
  const bg = positive ? "oklch(0.72 0.18 155 / 0.08)" : "oklch(0.72 0.18 25 / 0.08)";
  return (
    <div className="px-4 py-3 rounded-xl transition-all hover:scale-[1.02] cursor-default"
      style={{ background: "oklch(0.10 0.005 264)", border: "1px solid oklch(0.16 0.007 264)" }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-bold tracking-wider" style={{ color: "oklch(0.52 0.008 264)" }}>{symbol}</span>
        {positive
          ? <TrendingUp className="w-3.5 h-3.5" style={{ color }} />
          : <TrendingDown className="w-3.5 h-3.5" style={{ color }} />
        }
      </div>
      <div className="text-base font-bold" style={{ color: "oklch(0.93 0.005 264)", fontFamily: "'JetBrains Mono', monospace" }}>{price}</div>
      <div className="flex items-center gap-1.5 mt-1">
        <span className="text-xs font-medium px-1.5 py-0.5 rounded"
          style={{ background: bg, color }}>{changePercent}</span>
        <span className="text-xs" style={{ color: "oklch(0.43 0.008 264)" }}>{change}</span>
      </div>
      <div className="text-[10px] mt-1 truncate" style={{ color: "oklch(0.38 0.007 264)" }}>{name}</div>
    </div>
  );
}

// ── Feature card ─────────────────────────────────────────────────────────────
function FeatureCard({ icon: Icon, title, desc, accent }: {
  icon: React.ElementType; title: string; desc: string; accent: string;
}) {
  return (
    <div className="p-5 rounded-2xl group transition-all hover:scale-[1.02] cursor-default"
      style={{ background: "oklch(0.09 0.004 264)", border: "1px solid oklch(0.15 0.007 264)" }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-all group-hover:scale-110"
        style={{ background: `${accent} / 0.12)`.replace("/ 0.12)", "/ 0.12)").replace(/oklch\((.+?)\)/, (m, p) => `oklch(${p} / 0.12)`), border: `1px solid ${accent.replace(")", " / 0.25)")}` }}>
        <Icon className="w-5 h-5" style={{ color: accent }} />
      </div>
      <h3 className="text-sm font-semibold mb-2" style={{ color: "oklch(0.88 0.005 264)" }}>{title}</h3>
      <p className="text-xs leading-relaxed" style={{ color: "oklch(0.48 0.008 264)" }}>{desc}</p>
    </div>
  );
}

export default function Home() {
  const { loading: authLoading, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const heroRef = useRef<HTMLDivElement>(null);

  const { data: accessData, isLoading: accessLoading } = trpc.access.check.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    if (accessLoading) return;
    if (accessData?.hasAccess) {
      navigate("/chat");
    } else if (accessData && !accessData.hasAccess) {
      navigate("/access");
    }
  }, [authLoading, isAuthenticated, accessLoading, accessData, navigate]);

  // Mouse parallax effect on hero
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!heroRef.current) return;
      const { clientX, clientY } = e;
      const { innerWidth, innerHeight } = window;
      const x = (clientX / innerWidth - 0.5) * 20;
      const y = (clientY / innerHeight - 0.5) * 20;
      heroRef.current.style.transform = `translate(${x * 0.3}px, ${y * 0.3}px)`;
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  if (!authLoading && isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "oklch(0.06 0.004 264)" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "oklch(0.63 0.20 258 / 0.15)", border: "1px solid oklch(0.63 0.20 258 / 0.3)" }}>
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: "oklch(0.63 0.20 258)" }} />
          </div>
          <p className="text-sm" style={{ color: "oklch(0.48 0.008 264)" }}>正在加载...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden" style={{ background: "oklch(0.06 0.004 264)" }}>
      <GridBackground />

      {/* ── Header ── */}
      <header className="relative z-10 flex items-center justify-between px-8 py-5"
        style={{ borderBottom: "1px solid oklch(0.12 0.006 264)" }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, oklch(0.63 0.20 258 / 0.3), oklch(0.63 0.20 258 / 0.08))", border: "1px solid oklch(0.63 0.20 258 / 0.4)" }}>
            <Bot className="w-5 h-5" style={{ color: "oklch(0.70 0.18 258)" }} />
          </div>
          <div>
            <span className="text-sm font-bold tracking-wide" style={{ color: "oklch(0.93 0.005 264)", letterSpacing: "0.04em" }}>DanTree</span>
            <div className="text-[9px] font-medium tracking-widest uppercase" style={{ color: "oklch(0.63 0.20 258)", letterSpacing: "0.12em" }}>AI Finance</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs"
            style={{ background: "oklch(0.72 0.18 155 / 0.08)", border: "1px solid oklch(0.72 0.18 155 / 0.2)", color: "oklch(0.72 0.18 155)" }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "oklch(0.72 0.18 155)" }} />
            25+ 数据源在线
          </div>
          {!authLoading && (
            <button
              onClick={() => window.location.href = getLoginUrl()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: "oklch(0.63 0.20 258)", color: "white" }}>
              登录
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* ── Market Ticker ── */}
      <div className="relative z-10 px-8 py-4" style={{ borderBottom: "1px solid oklch(0.10 0.005 264)" }}>
        <div className="max-w-5xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MarketCard symbol="SPY" name="S&P 500 ETF" price="$563.40" change="+8.20" changePercent="+1.48%" positive={true} />
          <MarketCard symbol="QQQ" name="Nasdaq 100 ETF" price="$474.85" change="-3.15" changePercent="-0.66%" positive={false} />
          <MarketCard symbol="BTC" name="Bitcoin" price="$84,200" change="+1,240" changePercent="+1.49%" positive={true} />
          <MarketCard symbol="000300" name="沪深300" price="3,892.41" change="-12.30" changePercent="-0.31%" positive={false} />
        </div>
      </div>

      {/* ── Hero ── */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-8 py-16">
        <div className="max-w-3xl mx-auto text-center space-y-8">

          {/* Animated badge */}
          <div ref={heroRef} className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition-transform duration-300"
            style={{ background: "oklch(0.63 0.20 258 / 0.10)", border: "1px solid oklch(0.63 0.20 258 / 0.25)", color: "oklch(0.70 0.18 258)" }}>
            <Zap className="w-3.5 h-3.5" />
            AI 驱动 · 数据优先 · 价值投资
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "oklch(0.63 0.20 258)" }} />
          </div>

          {/* Title */}
          <div className="space-y-4">
            <h1 className="text-5xl font-black leading-tight tracking-tight" style={{ color: "oklch(0.95 0.005 264)", fontFamily: "'Inter', sans-serif" }}>
              专业级
              <span style={{
                background: "linear-gradient(135deg, oklch(0.70 0.18 258), oklch(0.72 0.18 220))",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text"
              }}> AI 投资</span>
              <br />研究平台
            </h1>
            <p className="text-lg leading-relaxed max-w-xl mx-auto" style={{ color: "oklch(0.52 0.008 264)" }}>
              多 Agent 协作 · 25+ 专业数据源 · 证据驱动分析
              <br />严格遵循段永平价值投资体系
            </p>
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => window.location.href = getLoginUrl()}
              className="flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: "linear-gradient(135deg, oklch(0.63 0.20 258), oklch(0.55 0.22 240))",
                color: "white",
                boxShadow: "0 4px 24px oklch(0.63 0.20 258 / 0.3)"
              }}>
              <Bot className="w-4 h-4" />
              开始 AI 分析
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              className="flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: "oklch(0.10 0.005 264)", border: "1px solid oklch(0.18 0.007 264)", color: "oklch(0.65 0.008 264)" }}
              onClick={() => window.location.href = getLoginUrl()}>
              <BarChart3 className="w-4 h-4" />
              查看演示
            </button>
          </div>

          {/* Quick analysis chips */}
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            {["分析 AAPL 基本面", "茅台估值分析", "BTC 技术面", "纳斯达克宏观", "比亚迪 vs 特斯拉"].map((q) => (
              <button key={q}
                onClick={() => window.location.href = getLoginUrl()}
                className="px-3 py-1.5 rounded-full text-xs transition-all hover:scale-[1.02] hover:bg-white/5"
                style={{ background: "oklch(0.10 0.005 264)", border: "1px solid oklch(0.16 0.007 264)", color: "oklch(0.52 0.008 264)" }}>
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* ── Feature Cards ── */}
        <div className="max-w-4xl mx-auto w-full mt-20 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl"
            style={{ background: "oklch(0.09 0.004 264)", border: "1px solid oklch(0.15 0.007 264)" }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
              style={{ background: "oklch(0.63 0.20 258 / 0.12)", border: "1px solid oklch(0.63 0.20 258 / 0.25)" }}>
              <Database className="w-5 h-5" style={{ color: "oklch(0.63 0.20 258)" }} />
            </div>
            <h3 className="text-sm font-semibold mb-2" style={{ color: "oklch(0.88 0.005 264)" }}>数据引擎</h3>
            <p className="text-xs leading-relaxed" style={{ color: "oklch(0.43 0.008 264)" }}>25+ 专业数据源，自动采集、交叉验证、结构化整理关键财务与市场数据。</p>
          </div>

          <div className="p-5 rounded-2xl"
            style={{ background: "oklch(0.09 0.004 264)", border: "1px solid oklch(0.15 0.007 264)" }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
              style={{ background: "oklch(0.72 0.18 155 / 0.12)", border: "1px solid oklch(0.72 0.18 155 / 0.25)" }}>
              <Brain className="w-5 h-5" style={{ color: "oklch(0.72 0.18 155)" }} />
            </div>
            <h3 className="text-sm font-semibold mb-2" style={{ color: "oklch(0.88 0.005 264)" }}>分析引擎</h3>
            <p className="text-xs leading-relaxed" style={{ color: "oklch(0.43 0.008 264)" }}>基于证据验证形成研究结论，根据数据强度自动调节置信度，拒绝无据强判断。</p>
          </div>

          <div className="p-5 rounded-2xl"
            style={{ background: "oklch(0.09 0.004 264)", border: "1px solid oklch(0.15 0.007 264)" }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
              style={{ background: "oklch(0.78 0.18 55 / 0.12)", border: "1px solid oklch(0.78 0.18 55 / 0.25)" }}>
              <Activity className="w-5 h-5" style={{ color: "oklch(0.78 0.18 55)" }} />
            </div>
            <h3 className="text-sm font-semibold mb-2" style={{ color: "oklch(0.88 0.005 264)" }}>多 Agent 协作</h3>
            <p className="text-xs leading-relaxed" style={{ color: "oklch(0.43 0.008 264)" }}>宏观、技术、基本面、情绪四个 Agent 并行分析，多维度交叉验证投资逻辑。</p>
          </div>

          <div className="p-5 rounded-2xl"
            style={{ background: "oklch(0.09 0.004 264)", border: "1px solid oklch(0.15 0.007 264)" }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
              style={{ background: "oklch(0.72 0.18 300 / 0.12)", border: "1px solid oklch(0.72 0.18 300 / 0.25)" }}>
              <LineChart className="w-5 h-5" style={{ color: "oklch(0.72 0.18 300)" }} />
            </div>
            <h3 className="text-sm font-semibold mb-2" style={{ color: "oklch(0.88 0.005 264)" }}>价值投资体系</h3>
            <p className="text-xs leading-relaxed" style={{ color: "oklch(0.43 0.008 264)" }}>严格遵循段永平投资原则：安全边际、护城河、五大市场，专注长期价值。</p>
          </div>
        </div>

        {/* ── Stats row ── */}
        <div className="max-w-4xl mx-auto w-full mt-12 grid grid-cols-3 gap-4">
          {[
            { value: "25+", label: "专业数据源", icon: Globe },
            { value: "3", label: "分析阶段", icon: Cpu },
            { value: "99%", label: "数据准确率", icon: Shield },
          ].map(({ value, label, icon: Icon }) => (
            <div key={label} className="text-center py-5 rounded-2xl"
              style={{ background: "oklch(0.085 0.004 264)", border: "1px solid oklch(0.13 0.006 264)" }}>
              <div className="text-2xl font-black mb-1" style={{ color: "oklch(0.93 0.005 264)", fontFamily: "'Inter', sans-serif" }}>{value}</div>
              <div className="text-xs" style={{ color: "oklch(0.43 0.008 264)" }}>{label}</div>
            </div>
          ))}
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="relative z-10 px-8 py-5 text-center" style={{ borderTop: "1px solid oklch(0.10 0.005 264)" }}>
        <p className="text-xs flex items-center justify-center gap-2" style={{ color: "oklch(0.35 0.007 264)" }}>
          <Lock className="w-3 h-3" />
          私有协作平台 · 仅限授权用户访问 · 数据仅供参考，不构成投资建议
        </p>
      </footer>
    </div>
  );
}
