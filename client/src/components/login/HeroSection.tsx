import { useEffect, useRef, useState } from "react"
import { ChevronRight } from "lucide-react"
import { trpc } from "@/lib/trpc"

// Fallback ticker data（实时 API 加载前或失败时显示）
const FALLBACK_TICKERS = [
  { symbol: "AAPL", price: "178.42", change: "+1.23", up: true },
  { symbol: "GOOGL", price: "141.80", change: "+0.87", up: true },
  { symbol: "MSFT", price: "378.91", change: "+1.56", up: true },
  { symbol: "TSLA", price: "248.50", change: "-0.34", up: false },
  { symbol: "NVDA", price: "721.33", change: "+4.21", up: true },
  { symbol: "AMZN", price: "178.25", change: "+0.92", up: true },
  { symbol: "META", price: "505.12", change: "+1.18", up: true },
  { symbol: "JPM",  price: "198.45", change: "-0.21", up: false },
  { symbol: "BRK.B", price: "362.10", change: "+0.45", up: true },
  { symbol: "GS",   price: "489.30", change: "+1.02", up: true },
]

const analysisTabs = ["Thesis", "Risk", "Tracking", "Discussion"]

const dataMatrix = [
  { ticker: "NVDA",  signal: "Bullish",      confidence: "94.2%", risk: "Medium", momentum: "+12.4%", status: "bullish" },
  { ticker: "AAPL",  signal: "Stable",       confidence: "78.5%", risk: "Low",    momentum: "+3.2%",  status: "neutral" },
  { ticker: "TSLA",  signal: "Fragile",      confidence: "82.1%", risk: "High",   momentum: "-5.8%",  status: "bearish" },
  { ticker: "MSFT",  signal: "Constructive", confidence: "89.3%", risk: "Low",    momentum: "+7.1%",  status: "bullish" },
  { ticker: "GOOGL", signal: "Positive",     confidence: "85.7%", risk: "Medium", momentum: "+4.5%",  status: "bullish" },
]

export function HeroSection({ onScrollDown }: { onScrollDown: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [activeTab, setActiveTab] = useState(0)
  const mousePosRef = useRef({ x: 0, y: 0 })
  const smoothMouseRef = useRef({ x: 0, y: 0 })

  // 实时行情（公开接口，无需登录）
  // retry: false + throwOnError: false 确保失败时只用 fallback，不触发全局错误处理器
  const { data: liveTickers } = trpc.market.getPublicTickers.useQuery(undefined, {
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: false,
    throwOnError: false,
  })
  const tickers = (liveTickers && liveTickers.length > 0) ? liveTickers : FALLBACK_TICKERS

  // Neural network background
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

    const nodes: { x: number; y: number; vx: number; vy: number; size: number; energy: number }[] = []
    for (let i = 0; i < 40; i++) {
      nodes.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        size: 3 + Math.random() * 3,
        energy: Math.random(),
      })
    }

    const pulses: {
      x: number; y: number; targetX: number; targetY: number;
      progress: number; trail: { x: number; y: number }[]
    }[] = []

    let animationId: number
    const animate = () => {
      smoothMouseRef.current.x += (mousePosRef.current.x - smoothMouseRef.current.x) * 0.03
      smoothMouseRef.current.y += (mousePosRef.current.y - smoothMouseRef.current.y) * 0.03
      const sm = smoothMouseRef.current

      ctx.fillStyle = "rgba(9, 9, 11, 0.15)"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      nodes.forEach((node) => {
        node.x += node.vx
        node.y += node.vy
        if (node.x < 0 || node.x > canvas.width) node.vx *= -1
        if (node.y < 0 || node.y > canvas.height) node.vy *= -1
        const dx = sm.x - node.x
        const dy = sm.y - node.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 200 && dist > 0) {
          node.x += (dx / dist) * 0.5
          node.y += (dy / dist) * 0.5
          node.energy = Math.min(1, node.energy + 0.02)
        } else {
          node.energy = Math.max(0.2, node.energy - 0.005)
        }
      })

      nodes.forEach((a, i) => {
        nodes.slice(i + 1).forEach((b) => {
          const dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
          if (dist < 250) {
            const opacity = 0.2 * (1 - dist / 250) * ((a.energy + b.energy) / 2)
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.strokeStyle = `rgba(34, 197, 94, ${opacity})`
            ctx.lineWidth = 1.5
            ctx.stroke()
          }
        })
      })

      if (Math.random() < 0.015 && pulses.length < 6) {
        const startIdx = Math.floor(Math.random() * nodes.length)
        const endIdx = Math.floor(Math.random() * nodes.length)
        const start = nodes[startIdx]
        const end = nodes[endIdx]
        pulses.push({ x: start.x, y: start.y, targetX: end.x, targetY: end.y, progress: 0, trail: [] })
      }

      pulses.forEach((pulse, idx) => {
        const currentX = pulse.x + (pulse.targetX - pulse.x) * pulse.progress
        const currentY = pulse.y + (pulse.targetY - pulse.y) * pulse.progress
        pulse.trail.push({ x: currentX, y: currentY })
        if (pulse.trail.length > 12) pulse.trail.shift()
        pulse.trail.forEach((point, ti) => {
          const trailOpacity = (ti / pulse.trail.length) * 0.5
          const trailSize = (ti / pulse.trail.length) * 12
          const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, trailSize)
          gradient.addColorStop(0, `rgba(34, 197, 94, ${trailOpacity})`)
          gradient.addColorStop(1, "transparent")
          ctx.fillStyle = gradient
          ctx.beginPath()
          ctx.arc(point.x, point.y, trailSize, 0, Math.PI * 2)
          ctx.fill()
        })
        const gradient = ctx.createRadialGradient(currentX, currentY, 0, currentX, currentY, 20)
        gradient.addColorStop(0, "rgba(74, 222, 128, 1)")
        gradient.addColorStop(0.3, "rgba(34, 197, 94, 0.7)")
        gradient.addColorStop(1, "transparent")
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(currentX, currentY, 20, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(currentX, currentY, 4, 0, Math.PI * 2)
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)"
        ctx.fill()
        pulse.progress += 0.006
        if (pulse.progress >= 1) pulses.splice(idx, 1)
      })

      nodes.forEach((node) => {
        const glowGradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, node.size * 5)
        glowGradient.addColorStop(0, `rgba(34, 197, 94, ${0.25 * node.energy})`)
        glowGradient.addColorStop(1, "transparent")
        ctx.fillStyle = glowGradient
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.size * 5, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(34, 197, 94, ${0.6 + 0.4 * node.energy})`
        ctx.fill()
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.size * 0.5, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255, 255, 255, ${0.4 * node.energy})`
        ctx.fill()
      })

      animationId = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      window.removeEventListener("resize", resize)
      cancelAnimationFrame(animationId)
    }
  }, [])

  // Tab rotation
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveTab((prev) => (prev + 1) % analysisTabs.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  return (
    <section
      className="scroll-section relative flex flex-col bg-[#09090b]"
      onMouseMove={(e) => { mousePosRef.current = { x: e.clientX, y: e.clientY } }}
    >
      {/* Neural network canvas */}
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* Gradient overlays */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#09090b]/60 via-transparent to-[#09090b]/70" />
      <div className="pointer-events-none absolute left-0 top-0 h-full w-1/4 bg-gradient-to-r from-[#09090b]/50 to-transparent" />
      <div className="pointer-events-none absolute right-0 top-0 h-full w-1/4 bg-gradient-to-l from-[#09090b]/50 to-transparent" />

      {/* ── Ticker Bar（单条，实时数据）── */}
      <div className="relative z-10 border-b border-[#1c1c21] bg-[#0c0c0f]/90 backdrop-blur-md overflow-hidden">
        <div className="animate-ticker flex py-2.5" style={{ width: "max-content" }}>
          {/* 复制一份实现无缝循环（视觉上是一条连续滚动的 ticker，不是两条） */}
          {[...tickers, ...tickers].map((t, i) => (
            <div key={i} className="mx-6 flex items-center gap-3 text-[13px] flex-shrink-0">
              <span className="font-medium text-white/80">{t.symbol}</span>
              <span className="font-mono text-white/50">${t.price}</span>
              <span className={`font-mono ${t.up ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
                {t.up ? "↑" : "↓"} {t.change}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex flex-1 items-center">
        <div className="mx-auto w-full max-w-7xl px-6 py-12 lg:px-12">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">
            {/* Left: Text Content */}
            <div className="space-y-8">
              <div className="animate-fadeInUp inline-flex items-center gap-2 rounded-full border border-[#22c55e]/20 bg-[#22c55e]/10 px-4 py-1.5 text-[13px] text-[#22c55e] opacity-0">
                <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e] animate-pulse" />
                AI-Native Decision Workspace
              </div>

              <h1 className="animate-fadeInUp delay-100 text-4xl font-bold tracking-tight text-white opacity-0 sm:text-5xl lg:text-6xl">
                See the business,
                <br />
                <span className="bg-gradient-to-r from-[#22c55e] via-[#4ade80] to-[#86efac] bg-clip-text text-transparent">
                  not just the price
                </span>
              </h1>

              <p className="animate-fadeInUp delay-200 max-w-lg text-lg leading-relaxed text-[#a1a1aa] opacity-0">
                DanTree helps investors follow companies over time, understand what changed, and update the thesis with clarity. Turn filings, research, market data, and ongoing discussion into a stronger decision process.
              </p>

              <div className="animate-fadeInUp delay-300 flex gap-10 opacity-0">
                {[
                  { value: "Ongoing",      label: "Coverage" },
                  { value: "Thesis",       label: "Tracking" },
                  { value: "Multi-Source", label: "Research" },
                ].map((stat, i) => (
                  <div key={i}>
                    <div className="text-2xl font-bold text-white">{stat.value}</div>
                    <div className="text-[13px] text-[#71717a]">{stat.label}</div>
                  </div>
                ))}
              </div>

              <div className="animate-fadeInUp delay-400 flex items-center gap-4 opacity-0">
                <button
                  onClick={onScrollDown}
                  className="group flex items-center gap-2 rounded-lg bg-[#22c55e] px-6 py-3 text-[15px] font-semibold text-[#09090b] transition-all hover:bg-[#16a34a] hover:shadow-lg hover:shadow-[#22c55e]/20"
                >
                  Get Started
                  <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>

              <div className="animate-fadeInUp delay-500 flex items-center gap-6 pt-4 opacity-0">
                {["SOC 2 Type II", "256-bit SSL", "GDPR"].map((badge, i) => (
                  <div key={i} className="flex items-center gap-2 text-[12px] text-[#52525b]">
                    <div className="h-4 w-4 rounded border border-[#27272a] bg-[#18181b] flex items-center justify-center">
                      <svg className="h-2.5 w-2.5 text-[#22c55e]" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    {badge}
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Analysis Interface Preview */}
            <div className="animate-slideInRight delay-300 opacity-0">
              <div className="rounded-2xl border border-[#1c1c21] bg-[#0f0f12]/90 backdrop-blur-xl shadow-2xl shadow-black/50 overflow-hidden">
                {/* Interface Header */}
                <div className="flex items-center justify-between border-b border-[#1c1c21] px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1.5">
                      <div className="h-3 w-3 rounded-full bg-[#ef4444]/80" />
                      <div className="h-3 w-3 rounded-full bg-[#f59e0b]/80" />
                      <div className="h-3 w-3 rounded-full bg-[#22c55e]/80" />
                    </div>
                    <span className="text-[13px] font-medium text-white/70">DanTree Workspace</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-[#22c55e] animate-pulse" />
                    <span className="text-[11px] text-[#22c55e]">Active</span>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 border-b border-[#1c1c21] px-4 py-2">
                  {analysisTabs.map((tab, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveTab(i)}
                      className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition-all ${
                        activeTab === i ? "bg-[#22c55e]/10 text-[#22c55e]" : "text-[#71717a] hover:text-white"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                {/* Data Matrix */}
                <div className="p-4">
                  <div className="mb-2 grid grid-cols-5 gap-3 text-[10px] font-medium uppercase tracking-wider text-[#52525b]">
                    <div>Ticker</div><div>Stance</div><div>Confidence</div><div>Risk</div><div>Change</div>
                  </div>
                  <div className="space-y-1.5">
                    {dataMatrix.map((row, i) => (
                      <div key={i} className="grid grid-cols-5 gap-3 rounded-lg bg-[#18181b]/50 px-3 py-2.5 text-[13px] transition-colors hover:bg-[#1c1c21]">
                        <div className="font-mono font-medium text-white">{row.ticker}</div>
                        <div className={row.status === "bullish" ? "text-[#22c55e]" : row.status === "bearish" ? "text-[#ef4444]" : "text-[#f59e0b]"}>
                          {row.signal}
                        </div>
                        <div className="text-white/70">{row.confidence}</div>
                        <div className={row.risk === "Low" ? "text-[#22c55e]" : row.risk === "High" ? "text-[#ef4444]" : "text-[#f59e0b]"}>
                          {row.risk}
                        </div>
                        <div className={row.momentum.startsWith("+") ? "text-[#22c55e]" : "text-[#ef4444]"}>
                          {row.momentum}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Insight Card */}
                  <div className="mt-4 rounded-lg border border-[#22c55e]/20 bg-[#22c55e]/5 p-3">
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5 h-4 w-4 rounded bg-[#22c55e]/20 flex items-center justify-center">
                        <svg className="h-2.5 w-2.5 text-[#22c55e]" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-[12px] font-medium text-[#22c55e]">Research Insight</div>
                        <div className="text-[12px] text-[#a1a1aa]">
                          DanTree keeps the research live: what changed, why it matters, and whether the thesis is strengthening, weakening, or still intact.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
        <div className="h-10 w-[1px] bg-gradient-to-b from-transparent via-[#27272a] to-transparent" />
        <button
          onClick={onScrollDown}
          className="flex h-10 w-6 items-center justify-center rounded-full border border-[#27272a] transition-colors hover:border-[#3f3f46]"
        >
          <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#22c55e]" />
        </button>
      </div>
    </section>
  )
}
