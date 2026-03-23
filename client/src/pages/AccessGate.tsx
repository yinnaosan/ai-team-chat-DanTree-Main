import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { getLoginUrl } from "@/const";

// ── Robot SVG with mouse-tracking eyes ──────────────────────────────────────
function RobotHead({ mouseX, mouseY }: { mouseX: number; mouseY: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  const [eyeOffset, setEyeOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = mouseX - cx;
    const dy = mouseY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxDist = Math.max(window.innerWidth, window.innerHeight) / 2;
    const norm = Math.min(dist / maxDist, 1);
    // Tilt: max ±15deg
    const rx = -(dy / (window.innerHeight / 2)) * 15;
    const ry = (dx / (window.innerWidth / 2)) * 15;
    setTilt({ rx, ry });
    // Eye pupil offset: max ±4px
    setEyeOffset({ x: (dx / maxDist) * 4 * norm, y: (dy / maxDist) * 4 * norm });
  }, [mouseX, mouseY]);

  return (
    <div
      ref={containerRef}
      className="relative select-none"
      style={{
        transform: `perspective(800px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
        transition: "transform 0.12s ease-out",
        transformStyle: "preserve-3d",
      }}
    >
      <svg
        viewBox="0 0 280 320"
        width="280"
        height="320"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* ── Glow backdrop ── */}
        <defs>
          <radialGradient id="bodyGrad" cx="50%" cy="40%" r="55%">
            <stop offset="0%" stopColor="#1a1a2e" />
            <stop offset="100%" stopColor="#0a0a0f" />
          </radialGradient>
          <radialGradient id="headGrad" cx="50%" cy="35%" r="60%">
            <stop offset="0%" stopColor="#1e2040" />
            <stop offset="100%" stopColor="#0d0d18" />
          </radialGradient>
          <radialGradient id="eyeGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#4f8ef7" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#2563eb" stopOpacity="0.4" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="softGlow">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="metalSheen" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.08" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0.02" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.06" />
          </linearGradient>
          <linearGradient id="neckGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0f0f1a" />
            <stop offset="50%" stopColor="#1a1a2e" />
            <stop offset="100%" stopColor="#0f0f1a" />
          </linearGradient>
        </defs>

        {/* ── Ambient glow behind robot ── */}
        <ellipse cx="140" cy="280" rx="90" ry="20" fill="#4f8ef7" opacity="0.06" />
        <ellipse cx="140" cy="160" rx="120" ry="120" fill="#4f8ef7" opacity="0.03" />

        {/* ── Neck ── */}
        <rect x="115" y="218" width="50" height="28" rx="4" fill="url(#neckGrad)" />
        <rect x="120" y="220" width="40" height="2" rx="1" fill="#ffffff" opacity="0.05" />
        {/* Neck segments */}
        {[224, 230, 236].map(y => (
          <rect key={y} x="118" y={y} width="44" height="1" rx="0.5" fill="#4f8ef7" opacity="0.15" />
        ))}

        {/* ── Shoulders / collar ── */}
        <path d="M60 246 Q80 240 115 240 L165 240 Q200 240 220 246 L230 270 Q140 278 50 270 Z"
          fill="url(#bodyGrad)" stroke="#1e2040" strokeWidth="1" />
        <path d="M60 246 Q80 240 115 240 L165 240 Q200 240 220 246"
          stroke="#4f8ef7" strokeWidth="0.5" opacity="0.3" fill="none" />

        {/* ── Head main shape ── */}
        <rect x="52" y="80" width="176" height="148" rx="28" fill="url(#headGrad)" />
        {/* Head border */}
        <rect x="52" y="80" width="176" height="148" rx="28"
          fill="none" stroke="#1e2a5e" strokeWidth="1.5" />
        {/* Metal sheen overlay */}
        <rect x="52" y="80" width="176" height="148" rx="28" fill="url(#metalSheen)" />
        {/* Top highlight */}
        <path d="M80 82 Q140 76 200 82" stroke="#ffffff" strokeWidth="0.8" opacity="0.12" fill="none" />

        {/* ── Forehead panel ── */}
        <rect x="90" y="92" width="100" height="18" rx="6"
          fill="#0d1020" stroke="#1e2a5e" strokeWidth="1" />
        {/* LED dots in forehead */}
        {[105, 118, 131, 144, 157, 170].map((x, i) => (
          <circle key={x} cx={x} cy="101" r="2.5"
            fill="#4f8ef7" opacity={i % 2 === 0 ? 0.8 : 0.3}
            filter="url(#glow)" />
        ))}

        {/* ── Antenna ── */}
        <rect x="136" y="56" width="8" height="28" rx="4" fill="#0f1020" stroke="#1e2a5e" strokeWidth="1" />
        <circle cx="140" cy="52" r="8" fill="#0d1020" stroke="#4f8ef7" strokeWidth="1.5" />
        <circle cx="140" cy="52" r="4" fill="#4f8ef7" opacity="0.9" filter="url(#glow)" />
        <circle cx="140" cy="52" r="2" fill="#ffffff" opacity="0.8" />

        {/* ── Eye sockets ── */}
        <rect x="72" y="120" width="56" height="42" rx="12"
          fill="#060810" stroke="#1e2a5e" strokeWidth="1.5" />
        <rect x="152" y="120" width="56" height="42" rx="12"
          fill="#060810" stroke="#1e2a5e" strokeWidth="1.5" />

        {/* ── Eyes (iris + pupil with mouse tracking) ── */}
        {/* Left eye */}
        <circle cx={100 + eyeOffset.x} cy={141 + eyeOffset.y} r="14"
          fill="url(#eyeGlow)" filter="url(#softGlow)" />
        <circle cx={100 + eyeOffset.x} cy={141 + eyeOffset.y} r="10"
          fill="#1a3a8f" />
        <circle cx={100 + eyeOffset.x} cy={141 + eyeOffset.y} r="6"
          fill="#4f8ef7" filter="url(#glow)" />
        <circle cx={100 + eyeOffset.x} cy={141 + eyeOffset.y} r="3"
          fill="#0a0f2e" />
        {/* Left eye specular */}
        <circle cx={103 + eyeOffset.x * 0.5} cy={138 + eyeOffset.y * 0.5} r="2"
          fill="#ffffff" opacity="0.6" />

        {/* Right eye */}
        <circle cx={180 + eyeOffset.x} cy={141 + eyeOffset.y} r="14"
          fill="url(#eyeGlow)" filter="url(#softGlow)" />
        <circle cx={180 + eyeOffset.x} cy={141 + eyeOffset.y} r="10"
          fill="#1a3a8f" />
        <circle cx={180 + eyeOffset.x} cy={141 + eyeOffset.y} r="6"
          fill="#4f8ef7" filter="url(#glow)" />
        <circle cx={180 + eyeOffset.x} cy={141 + eyeOffset.y} r="3"
          fill="#0a0f2e" />
        {/* Right eye specular */}
        <circle cx={183 + eyeOffset.x * 0.5} cy={138 + eyeOffset.y * 0.5} r="2"
          fill="#ffffff" opacity="0.6" />

        {/* ── Nose sensor ── */}
        <rect x="127" y="168" width="26" height="8" rx="4"
          fill="#0d1020" stroke="#1e2a5e" strokeWidth="1" />
        <circle cx="140" cy="172" r="2.5" fill="#4f8ef7" opacity="0.5" />

        {/* ── Mouth / speaker grille ── */}
        <rect x="88" y="186" width="104" height="26" rx="8"
          fill="#060810" stroke="#1e2a5e" strokeWidth="1" />
        {/* Speaker lines */}
        {[96, 104, 112, 120, 128, 136, 144, 152, 160, 168, 176].map(x => (
          <rect key={x} x={x} y="192" width="2" height="14" rx="1"
            fill="#4f8ef7" opacity="0.25" />
        ))}
        {/* Active speaker glow */}
        {[104, 120, 136, 152, 168].map(x => (
          <rect key={x} x={x} y="192" width="2" height="14" rx="1"
            fill="#4f8ef7" opacity="0.55" filter="url(#glow)" />
        ))}

        {/* ── Side panels ── */}
        <rect x="36" y="110" width="18" height="60" rx="6"
          fill="#0d1020" stroke="#1e2a5e" strokeWidth="1" />
        <rect x="226" y="110" width="18" height="60" rx="6"
          fill="#0d1020" stroke="#1e2a5e" strokeWidth="1" />
        {/* Side LED strips */}
        {[120, 132, 144, 158].map(y => (
          <rect key={y} x="40" y={y} width="10" height="2" rx="1"
            fill="#4f8ef7" opacity="0.4" />
        ))}
        {[120, 132, 144, 158].map(y => (
          <rect key={y} x="230" y={y} width="10" height="2" rx="1"
            fill="#4f8ef7" opacity="0.4" />
        ))}

        {/* ── Status indicator (bottom of head) ── */}
        <rect x="110" y="224" width="60" height="4" rx="2"
          fill="#0d1020" stroke="#1e2a5e" strokeWidth="0.5" />
        <rect x="112" y="225" width="20" height="2" rx="1"
          fill="#4f8ef7" opacity="0.8" />
      </svg>
    </div>
  );
}

// ── Animated background grid ─────────────────────────────────────────────────
function BackgroundGrid() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Grid lines */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#4f8ef7" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Floating particles */}
      {[...Array(12)].map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            width: `${2 + (i % 3)}px`,
            height: `${2 + (i % 3)}px`,
            background: `oklch(0.63 0.20 258 / ${0.2 + (i % 4) * 0.1})`,
            left: `${8 + i * 7.5}%`,
            top: `${10 + (i * 13) % 80}%`,
            animation: `float-slow ${5 + (i % 4)}s ease-in-out infinite`,
            animationDelay: `${i * 0.6}s`,
          }}
        />
      ))}

      {/* Scan line */}
      <div
        className="absolute left-0 right-0 h-px"
        style={{
          background: "linear-gradient(90deg, transparent, oklch(0.63 0.20 258 / 0.3), transparent)",
          animation: "scanline 8s linear infinite",
        }}
      />

      {/* Corner accents */}
      <div className="absolute top-8 left-8 w-16 h-16 border-l border-t"
        style={{ borderColor: "oklch(0.63 0.20 258 / 0.20)" }} />
      <div className="absolute top-8 right-8 w-16 h-16 border-r border-t"
        style={{ borderColor: "oklch(0.63 0.20 258 / 0.20)" }} />
      <div className="absolute bottom-8 left-8 w-16 h-16 border-l border-b"
        style={{ borderColor: "oklch(0.63 0.20 258 / 0.20)" }} />
      <div className="absolute bottom-8 right-8 w-16 h-16 border-r border-b"
        style={{ borderColor: "oklch(0.63 0.20 258 / 0.20)" }} />
    </div>
  );
}

// ── Main AccessGate component ─────────────────────────────────────────────────
export default function AccessGate() {
  const [, navigate] = useLocation();
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Track mouse position globally
  const handleMouseMove = useCallback((e: MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [handleMouseMove]);

  const { data: accessData, isLoading: accessLoading } = trpc.access.check.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (!authLoading && !accessLoading && accessData?.hasAccess) {
      navigate("/chat");
    }
  }, [authLoading, accessLoading, accessData, navigate]);

  const verifyMutation = trpc.access.verify.useMutation({
    onSuccess: () => {
      toast.success("验证成功！欢迎进入 AI 协作平台");
      navigate("/chat");
    },
    onError: (err) => {
      toast.error(err.message || "密码无效，请重试");
      setCode("");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setSubmitting(true);
    verifyMutation.mutate({ code: code.trim() }, {
      onSettled: () => setSubmitting(false),
    });
  };

  // Loading state
  if (authLoading || accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: "oklch(0.075 0.003 264)" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full border-2 border-transparent animate-spin"
              style={{ borderTopColor: "oklch(0.63 0.20 258)" }} />
            <div className="absolute inset-0 rounded-full"
              style={{ boxShadow: "0 0 16px oklch(0.63 0.20 258 / 0.3)" }} />
          </div>
          <p className="text-sm" style={{ color: "oklch(0.45 0.008 264)" }}>正在验证身份...</p>
        </div>
      </div>
    );
  }

  if (accessData?.hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: "oklch(0.075 0.003 264)" }}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: "oklch(0.63 0.20 258)" }} />
          <p className="text-sm" style={{ color: "oklch(0.45 0.008 264)" }}>正在进入平台...</p>
        </div>
      </div>
    );
  }

  // ── Main layout: left robot + right panel ──────────────────────────────────
  return (
    <div
      className="min-h-screen flex overflow-hidden relative"
      style={{ background: "oklch(0.075 0.003 264)" }}
    >
      <BackgroundGrid />

      {/* ── Left: Robot visual area ── */}
      <div className="hidden lg:flex flex-1 flex-col items-center justify-center relative px-12">
        {/* Brand */}
        <div className="absolute top-8 left-10 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "oklch(0.63 0.20 258 / 0.12)", border: "1px solid oklch(0.63 0.20 258 / 0.25)" }}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="oklch(0.63 0.20 258)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-sm font-semibold tracking-tight"
            style={{ color: "oklch(0.88 0.005 264)", fontFamily: "'Inter', sans-serif" }}>
            DanTree
          </span>
          <span className="text-xs px-1.5 py-0.5 rounded font-medium"
            style={{ background: "oklch(0.63 0.20 258 / 0.12)", color: "oklch(0.63 0.20 258)", border: "1px solid oklch(0.63 0.20 258 / 0.20)" }}>
            Pro
          </span>
        </div>

        {/* Robot */}
        <div className="flex flex-col items-center gap-8">
          {/* Pulse rings behind robot */}
          <div className="relative flex items-center justify-center">
            <div className="absolute w-64 h-64 rounded-full"
              style={{ border: "1px solid oklch(0.63 0.20 258 / 0.08)", animation: "pulse-ring 3s ease-out infinite" }} />
            <div className="absolute w-80 h-80 rounded-full"
              style={{ border: "1px solid oklch(0.63 0.20 258 / 0.05)", animation: "pulse-ring 3s ease-out infinite", animationDelay: "1s" }} />
            <div className="absolute w-48 h-48 rounded-full"
              style={{ background: "radial-gradient(circle, oklch(0.63 0.20 258 / 0.06) 0%, transparent 70%)" }} />

            {/* Robot with float animation */}
            <div className="animate-float-slow">
              <RobotHead mouseX={mousePos.x} mouseY={mousePos.y} />
            </div>
          </div>

          {/* Tagline */}
          <div className="text-center space-y-2 max-w-xs">
            <h2 className="text-xl font-semibold tracking-tight"
              style={{ color: "oklch(0.90 0.005 264)", fontFamily: "'Inter', sans-serif", letterSpacing: "-0.02em" }}>
              智能金融洞察
            </h2>
            <p className="text-sm leading-relaxed"
              style={{ color: "oklch(0.45 0.008 264)" }}>
              生成包含财务分析、估值模型和风险评估的专业股票研究报告
            </p>
          </div>

          {/* Feature badges */}
          <div className="flex flex-wrap gap-2 justify-center max-w-xs">
            {["实时数据", "多源验证", "AI 分析", "风险评估"].map(label => (
              <span key={label} className="text-xs px-2.5 py-1 rounded-full"
                style={{
                  background: "oklch(0.63 0.20 258 / 0.07)",
                  border: "1px solid oklch(0.63 0.20 258 / 0.15)",
                  color: "oklch(0.65 0.15 258)",
                }}>
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* Bottom data stream */}
        <div className="absolute bottom-8 left-10 right-10">
          <div className="flex items-center gap-2 text-xs" style={{ color: "oklch(0.32 0.007 264)" }}>
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: "oklch(0.65 0.17 155)", boxShadow: "0 0 6px oklch(0.65 0.17 155 / 0.6)" }} />
            <span>人工智能驱动的股票研究平台</span>
          </div>
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="hidden lg:block w-px self-stretch my-12"
        style={{ background: "linear-gradient(to bottom, transparent, oklch(0.20 0.008 264), transparent)" }} />

      {/* ── Right: Login panel ── */}
      <div className="w-full lg:w-[420px] xl:w-[460px] flex flex-col items-center justify-center px-8 py-12 relative shrink-0">

        {/* Mobile brand */}
        <div className="lg:hidden flex items-center gap-2 mb-10">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "oklch(0.63 0.20 258 / 0.12)", border: "1px solid oklch(0.63 0.20 258 / 0.25)" }}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="oklch(0.63 0.20 258)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-sm font-semibold" style={{ color: "oklch(0.88 0.005 264)" }}>DanTree</span>
        </div>

        <div className="w-full max-w-sm">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold mb-2 tracking-tight"
              style={{ color: "oklch(0.95 0.005 264)", fontFamily: "'Inter', sans-serif", letterSpacing: "-0.025em" }}>
              {!isAuthenticated ? "欢迎回来" : "访问验证"}
            </h1>
            <p className="text-sm" style={{ color: "oklch(0.48 0.008 264)" }}>
              {!isAuthenticated
                ? "登录以访问您的研究仪表板"
                : user
                  ? `已登录：${user.name || user.email || "用户"}，请输入访问密码`
                  : "此平台为私有系统，请输入访问密码继续"}
            </p>
          </div>

          {/* Panel */}
          <div className="rounded-2xl p-6 space-y-4"
            style={{
              background: "oklch(0.10 0.005 264)",
              border: "1px solid oklch(0.18 0.008 264)",
              boxShadow: "0 0 40px oklch(0.63 0.20 258 / 0.04), inset 0 1px 0 oklch(100% 0 0 / 0.04)",
            }}>

            {!isAuthenticated ? (
              /* ── Not logged in: show Manus login button ── */
              <>
                <button
                  onClick={() => window.location.href = getLoginUrl()}
                  className="w-full h-11 rounded-xl flex items-center justify-center gap-2.5 text-sm font-medium transition-all hover:scale-[1.01] active:scale-[0.99]"
                  style={{
                    background: "oklch(0.63 0.20 258)",
                    color: "oklch(0.98 0.002 264)",
                    boxShadow: "0 0 20px oklch(0.63 0.20 258 / 0.25)",
                  }}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  使用 Manus 账号登录
                </button>
                <p className="text-center text-xs" style={{ color: "oklch(0.38 0.007 264)" }}>
                  登录后将自动返回此页面完成验证
                </p>
              </>
            ) : (
              /* ── Logged in: show access code input ── */
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium tracking-wide uppercase"
                    style={{ color: "oklch(0.50 0.008 264)", letterSpacing: "0.06em" }}>
                    访问密码
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="请输入访问密码..."
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      autoFocus
                      disabled={submitting}
                      className="w-full h-11 rounded-xl px-4 text-sm outline-none transition-all font-mono tracking-widest"
                      style={{
                        background: "oklch(0.075 0.003 264)",
                        border: "1px solid oklch(0.20 0.008 264)",
                        color: "oklch(0.90 0.005 264)",
                        caretColor: "oklch(0.63 0.20 258)",
                      }}
                      onFocus={e => {
                        e.currentTarget.style.borderColor = "oklch(0.63 0.20 258 / 0.55)";
                        e.currentTarget.style.boxShadow = "0 0 0 3px oklch(0.63 0.20 258 / 0.07)";
                      }}
                      onBlur={e => {
                        e.currentTarget.style.borderColor = "oklch(0.20 0.008 264)";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting || !code.trim()}
                  className="w-full h-11 rounded-xl flex items-center justify-center gap-2 text-sm font-medium transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100"
                  style={{
                    background: "oklch(0.63 0.20 258)",
                    color: "oklch(0.98 0.002 264)",
                    boxShadow: submitting || !code.trim() ? "none" : "0 0 20px oklch(0.63 0.20 258 / 0.25)",
                  }}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      验证中...
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none">
                        <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="2" />
                      </svg>
                      进入平台
                    </>
                  )}
                </button>

                <p className="text-center text-xs" style={{ color: "oklch(0.38 0.007 264)" }}>
                  没有密码？请联系平台管理员获取访问权限
                </p>
              </form>
            )}
          </div>

          {/* Footer */}
          <div className="mt-6 flex items-center justify-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full"
                style={{ background: "oklch(0.65 0.17 155)", boxShadow: "0 0 6px oklch(0.65 0.17 155 / 0.6)" }} />
              <span className="text-xs" style={{ color: "oklch(0.38 0.007 264)" }}>系统就绪</span>
            </div>
            <span className="text-xs" style={{ color: "oklch(0.28 0.007 264)" }}>·</span>
            <span className="text-xs" style={{ color: "oklch(0.38 0.007 264)" }}>DanTree Pro</span>
          </div>
        </div>
      </div>
    </div>
  );
}
