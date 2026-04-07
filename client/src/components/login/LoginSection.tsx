import { useState, useEffect, useRef } from "react"
import { Sparkles, TrendingUp, Shield, Zap, BarChart3 } from "lucide-react"
import { getLoginUrl } from "@/const"

const dataSources = [
  { name: "Filings", type: "Primary Sources", delay: 0 },
  { name: "Research", type: "External Views", delay: 100 },
  { name: "Market Data", type: "Price Context", delay: 200 },
  { name: "Discussion", type: "Ongoing Work", delay: 300 },
  { name: "Risk", type: "Thesis Review", delay: 400 },
  { name: "Tracking", type: "Change Log", delay: 500 },
]

interface LoginSectionProps {
  isLoggedIn?: boolean;
  onEnterTerminal?: () => void;
}

export function LoginSection({ isLoggedIn = false, onEnterTerminal }: LoginSectionProps = {}) {
  const [isVisible, setIsVisible] = useState(false)
  const [hoveredSource, setHoveredSource] = useState<number | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const sectionRef = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Intersection observer for entrance animation
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true) },
      { threshold: 0.2 }
    )
    if (sectionRef.current) observer.observe(sectionRef.current)
    return () => observer.disconnect()
  }, [])

  // Subtle background animation
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener("resize", resize)

    const particles: { x: number; y: number; vx: number; vy: number; size: number; opacity: number }[] = []
    for (let i = 0; i < 30; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: 2 + Math.random() * 3,
        opacity: 0.1 + Math.random() * 0.2,
      })
    }

    let animationId: number
    const animate = () => {
      ctx.fillStyle = "#09090b"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      particles.forEach((p) => {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(34, 197, 94, ${p.opacity})`
        ctx.fill()
      })
      particles.forEach((a, i) => {
        particles.slice(i + 1).forEach((b) => {
          const dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
          if (dist < 200) {
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.strokeStyle = `rgba(34, 197, 94, ${0.05 * (1 - dist / 200)})`
            ctx.lineWidth = 1
            ctx.stroke()
          }
        })
      })
      animationId = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      window.removeEventListener("resize", resize)
      cancelAnimationFrame(animationId)
    }
  }, [])

  const handleLogin = () => {
    window.location.href = getLoginUrl()
  }

  return (
    <section
      ref={sectionRef}
      className="scroll-section relative min-h-screen bg-[#09090b] overflow-hidden"
      onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
    >
      {/* Animated background */}
      <canvas ref={canvasRef} className="absolute inset-0 opacity-60" />

      {/* Background elements */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 grid-bg opacity-20" />
        <div
          className="absolute h-[800px] w-[800px] rounded-full bg-[#22c55e]/8 blur-[200px] transition-all duration-1000 ease-out"
          style={{ left: mousePos.x - 400, top: mousePos.y - 400 }}
        />
        <div className="absolute -left-40 top-1/4 h-[600px] w-[600px] rounded-full bg-[#22c55e]/5 blur-[150px]" />
        <div className="absolute -right-40 bottom-1/4 h-[500px] w-[500px] rounded-full bg-[#22c55e]/3 blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl items-center px-6 py-20 lg:px-12">
        <div className="grid w-full gap-16 lg:grid-cols-5 lg:gap-20">
          {/* Left: Content - 3 columns */}
          <div className={`lg:col-span-3 flex flex-col justify-center transition-all duration-1000 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            {/* Header */}
            <div className="mb-12">
              {/* Logo */}
              <div className="mb-8 flex items-center gap-4 group cursor-pointer">
                <div className="relative h-14 w-14 overflow-hidden rounded-2xl border border-[#27272a] bg-[#18181b] transition-all duration-300 group-hover:border-[#22c55e]/50 group-hover:shadow-lg group-hover:shadow-[#22c55e]/20">
                  <img
                    src="https://d2xsxph8kpxj0f.cloudfront.net/310519663340309886/Sfk3bwgkEZLNATmH8kTpez/dantree-logo_160bec03.png"
                    alt="DanTree Logo"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div>
                  <h2 className="text-2xl font-semibold text-white tracking-tight">DanTree</h2>
                  <p className="text-[13px] text-[#71717a]">AI-Native Investment Decision Workspace</p>
                </div>
              </div>

              <h1 className={`mb-6 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl transition-all duration-1000 delay-200 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
                Track the company,
                <br />
                <span className="bg-gradient-to-r from-[#22c55e] via-[#4ade80] to-[#22c55e] bg-clip-text text-transparent bg-[length:200%_auto] animate-gradient">
                  update the thesis
                </span>
              </h1>

              <p className={`max-w-lg text-base leading-relaxed text-[#a1a1aa] transition-all duration-1000 delay-300 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
                Bring filings, research, market data, and ongoing discussion into one continuous workspace. Understand the business, follow change over time, and make higher-quality decisions.
              </p>
            </div>

            {/* Feature pills */}
            <div className={`mb-10 flex flex-wrap gap-3 transition-all duration-1000 delay-400 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
              {[
                { icon: TrendingUp, text: "Thesis Tracking" },
                { icon: Shield, text: "Risk-Aware Workflow" },
                { icon: Zap, text: "Structured Discussion" },
                { icon: BarChart3, text: "Deep Research" },
              ].map((feature, i) => (
                <div key={i} className="group flex items-center gap-2 rounded-full border border-[#27272a] bg-[#18181b]/60 px-4 py-2 backdrop-blur-sm transition-all duration-300 hover:border-[#22c55e]/50 hover:bg-[#22c55e]/10 cursor-pointer">
                  <feature.icon className="h-4 w-4 text-[#22c55e] transition-transform duration-300 group-hover:scale-110" />
                  <span className="text-[13px] font-medium text-[#a1a1aa] group-hover:text-white transition-colors">{feature.text}</span>
                </div>
              ))}
            </div>

            {/* Data Sources Grid */}
            <div className={`mb-10 transition-all duration-1000 delay-500 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
              <div className="mb-4 text-[11px] font-medium uppercase tracking-wider text-[#52525b]">Connected Research Inputs</div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {dataSources.map((source, i) => (
                  <div
                    key={i}
                    onMouseEnter={() => setHoveredSource(i)}
                    onMouseLeave={() => setHoveredSource(null)}
                    className={`group relative rounded-xl border border-[#1c1c21] bg-[#0f0f12]/80 p-4 transition-all duration-300 cursor-pointer overflow-hidden ${
                      hoveredSource === i ? "border-[#22c55e]/50 bg-[#18181b] scale-[1.02] shadow-xl shadow-[#22c55e]/10" : "hover:border-[#27272a]"
                    }`}
                    style={{ transitionDelay: `${source.delay}ms` }}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full transition-transform duration-700 ${hoveredSource === i ? "translate-x-full" : ""}`} />
                    <div className={`absolute right-3 top-3 h-2 w-2 rounded-full transition-all duration-300 ${hoveredSource === i ? "bg-[#22c55e] shadow-lg shadow-[#22c55e]/50" : "bg-[#27272a]"}`} />
                    <div className="relative">
                      <div className="mb-1 text-[14px] font-medium text-white">{source.name}</div>
                      <div className="text-[11px] text-[#52525b] group-hover:text-[#71717a] transition-colors">{source.type}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Stats Row */}
            <div className={`flex flex-wrap gap-10 lg:gap-14 transition-all duration-1000 delay-600 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
              {[
                { value: "Continuous", label: "Coverage", suffix: "" },
                { value: "Structured", label: "Reasoning", suffix: "" },
                { value: "Research", label: "Workflow", suffix: "" },
              ].map((stat, i) => (
                <div key={i} className="group cursor-pointer">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-white lg:text-4xl transition-all duration-300 group-hover:text-[#22c55e]">{stat.value}</span>
                    <span className="text-xl text-[#22c55e]">{stat.suffix}</span>
                  </div>
                  <div className="text-[12px] text-[#52525b] group-hover:text-[#71717a] transition-colors">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Security badges */}
            <div className={`mt-10 flex flex-wrap items-center gap-3 border-t border-[#1c1c21] pt-8 transition-all duration-1000 delay-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
              {[
                { icon: "ISO", label: "ISO 27001" },
                { icon: "SOC", label: "SOC 2 Type II" },
                { icon: "SSL", label: "256-bit SSL" },
                { icon: "GDPR", label: "GDPR Ready" },
              ].map((badge, i) => (
                <div key={i} className="group flex items-center gap-2 rounded-lg border border-[#1c1c21] bg-[#0f0f12] px-3 py-2 transition-all duration-300 hover:border-[#27272a] hover:bg-[#18181b] cursor-pointer">
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-[#18181b] text-[9px] font-bold text-[#52525b] transition-colors group-hover:bg-[#22c55e]/20 group-hover:text-[#22c55e]">{badge.icon}</div>
                  <span className="text-[11px] text-[#52525b] group-hover:text-[#71717a] transition-colors">{badge.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Login Card - 2 columns */}
          <div className={`lg:col-span-2 flex items-center justify-center transition-all duration-1000 delay-300 ${isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-10"}`}>
            <div className="w-full max-w-md">
              {/* Form Card */}
              <div className="relative rounded-3xl border border-[#1c1c21] bg-[#0f0f12]/90 p-8 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-[#22c55e]/20 via-transparent to-[#22c55e]/20 opacity-0 transition-opacity duration-500 hover:opacity-100" style={{ padding: "1px" }}>
                  <div className="h-full w-full rounded-3xl bg-[#0f0f12]" />
                </div>

                <div className="relative">
                  {/* Card Header */}
                  <div className="mb-8 flex items-center justify-between">
                    <div>
                      <h3 className="text-2xl font-semibold text-white">Welcome to DanTree</h3>
                      <p className="mt-1 text-[13px] text-[#71717a]">Sign in to continue your research workspace</p>
                    </div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#22c55e]/20 bg-[#22c55e]/10 transition-all duration-300 hover:bg-[#22c55e]/20 hover:scale-105">
                      <Sparkles className="h-6 w-6 text-[#22c55e]" />
                    </div>
                  </div>

                  {/* Primary CTA Button */}
                  {isLoggedIn ? (
                    <button
                      onClick={onEnterTerminal}
                      className="group relative w-full overflow-hidden rounded-xl bg-[#22c55e] py-4 text-[15px] font-semibold text-[#09090b] transition-all duration-300 hover:bg-[#16a34a] hover:shadow-xl hover:shadow-[#22c55e]/30 mb-4"
                    >
                      <span className="relative z-10 flex items-center justify-center gap-3">
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M4 12h16M12 4l8 8-8 8"/>
                        </svg>
                        Enter Workspace
                      </span>
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                    </button>
                  ) : (
                    <button
                      onClick={handleLogin}
                      className="group relative w-full overflow-hidden rounded-xl bg-[#22c55e] py-4 text-[15px] font-semibold text-[#09090b] transition-all duration-300 hover:bg-[#16a34a] hover:shadow-xl hover:shadow-[#22c55e]/30 mb-4"
                    >
                      <span className="relative z-10 flex items-center justify-center gap-3">
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                        </svg>
                        Start Research
                      </span>
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                    </button>
                  )}

                  {/* Divider */}
                  <div className="my-6 flex items-center gap-4">
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#27272a] to-transparent" />
                    <span className="text-[11px] text-[#52525b]">secure workspace access</span>
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#27272a] to-transparent" />
                  </div>

                  {/* Info block */}
                  <div className="rounded-xl border border-[#1c1c21] bg-[#18181b]/50 p-4 space-y-3">
                    {[
                      { icon: "🔒", text: "Secure sign-in for your research workspace" },
                      { icon: "⚡", text: "Continue tracking companies, files, and thesis in one place" },
                      { icon: "🛡️", text: "Built for disciplined research and decision support" },
                    ].map((item, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <span className="text-base leading-none mt-0.5">{item.icon}</span>
                        <span className="text-[12px] text-[#71717a] leading-relaxed">{item.text}</span>
                      </div>
                    ))}
                  </div>

                  {/* Request access */}
                  <p className="mt-6 text-center text-[13px] text-[#52525b]">
                    {"New to DanTree? "}
                    <button
                      onClick={handleLogin}
                      className="font-medium text-white transition-all duration-300 hover:text-[#22c55e]"
                    >
                      Request access
                    </button>
                  </p>
                </div>
              </div>

              {/* Terms */}
              <p className="mt-6 text-center text-[11px] text-[#3f3f46]">
                By continuing, you agree to our{" "}
                <a href="#" className="text-[#52525b] underline-offset-2 hover:underline hover:text-[#71717a] transition-colors">Terms of Service</a>
                {" "}and{" "}
                <a href="#" className="text-[#52525b] underline-offset-2 hover:underline hover:text-[#71717a] transition-colors">Privacy Policy</a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
