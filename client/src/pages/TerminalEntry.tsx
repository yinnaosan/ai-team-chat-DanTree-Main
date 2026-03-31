/**
 * TerminalEntry — DanTree Terminal Entry Page
 * Route: /terminal-entry
 * Purpose: System entry point. User feels terminal is ALREADY RUNNING.
 * NOT a landing page. NOT a marketing page. A terminal door.
 */
import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";

// ─── Static Data ──────────────────────────────────────────────────────────────

const TICKER_ITEMS = [
  { symbol: "BTC/USD", value: "84,312.40", change: "+2.14%", up: true },
  { symbol: "NVDA", value: "875.22", change: "+3.42%", up: true },
  { symbol: "0700.HK", value: "382.60", change: "-0.55%", up: false },
  { symbol: "600519.SS", value: "1,542.00", change: "+0.28%", up: true },
  { symbol: "DXY", value: "104.18", change: "-0.18%", up: false },
  { symbol: "GOLD", value: "3,024.50", change: "+0.94%", up: true },
  { symbol: "WTI", value: "71.38", change: "+0.61%", up: true },
  { symbol: "EUR/USD", value: "1.0842", change: "-0.12%", up: false },
  { symbol: "VIX", value: "14.2", change: "-1.38%", up: false },
  { symbol: "SPY", value: "512.44", change: "+0.87%", up: true },
  { symbol: "QQQ", value: "438.91", change: "+1.23%", up: true },
  { symbol: "AAPL", value: "189.30", change: "+0.44%", up: true },
  { symbol: "TSLA", value: "248.50", change: "-1.82%", up: false },
  { symbol: "ETH/USD", value: "3,218.70", change: "+1.67%", up: true },
  { symbol: "10Y UST", value: "4.312%", change: "+0.03", up: false },
];

const AI_STREAM_LINES = [
  "→ Syncing macro data feed...",
  "→ Pulling SEC filings for NVDA...",
  "→ Updating risk model parameters...",
  "→ Cross-checking valuation assumptions...",
  "→ New market signal detected: momentum shift",
  "→ Loading earnings consensus data...",
  "→ Analyzing credit spread movements...",
  "→ Scanning insider transaction filings...",
  "→ Updating factor exposure matrix...",
  "→ Detecting regime change signal...",
  "→ Reconciling analyst price targets...",
  "→ Running Monte Carlo simulation...",
  "→ Checking options flow for SPY...",
  "→ Memory system: loading prior analysis...",
  "→ Hypothesis engine: 3 candidates active",
  "→ Evidence score: 0.74 — threshold passed",
  "→ Convergence loop: iteration 2 of 3",
  "→ Streaming news sentiment: NEUTRAL → BULLISH",
  "→ Cross-validating FMP vs Finnhub data...",
  "→ Source reliability check: PASSED",
];

const SYSTEM_STATUS = [
  { label: "Data Engine", status: "ONLINE", color: "text-emerald-400" },
  { label: "AI Engine", status: "RUNNING", color: "text-emerald-400" },
  { label: "Memory System", status: "ACTIVE", color: "text-emerald-400" },
  { label: "News Feed", status: "STREAMING", color: "text-emerald-400" },
  { label: "Risk Model", status: "UPDATED", color: "text-emerald-400" },
  { label: "Source Router", status: "ONLINE", color: "text-emerald-400" },
];

const COMMANDS = [
  "> Analyze AAPL",
  "> Run Macro Scan",
  "> Check Risk Dashboard",
  "> Load NVDA Earnings",
  "> Compare GOOGL vs META",
  "> Scan Insider Activity",
];

// ─── Market Status Helpers ────────────────────────────────────────────────────

/**
 * Compute live market status for each exchange based on UTC time.
 * Returns { name, status, color } for each market.
 */
function computeMarketStatus(now: Date) {
  const utcH = now.getUTCHours();
  const utcM = now.getUTCMinutes();
  const utcDay = now.getUTCDay(); // 0=Sun, 6=Sat
  const utcMins = utcH * 60 + utcM;
  const isWeekday = utcDay >= 1 && utcDay <= 5;

  function statusColor(status: string) {
    if (status === "OPEN") return "text-emerald-400";
    if (status === "PRE-MARKET" || status === "AFTER-HRS") return "text-yellow-400";
    if (status === "24H ACTIVE") return "text-emerald-400";
    return "text-red-500";
  }

  // NYSE/NASDAQ: 13:30–20:00 UTC (Mon-Fri), pre-market 09:00–13:30
  const nyseStatus = isWeekday
    ? utcMins >= 810 && utcMins < 1200 ? "OPEN"
    : utcMins >= 540 && utcMins < 810 ? "PRE-MARKET"
    : utcMins >= 1200 && utcMins < 1320 ? "AFTER-HRS"
    : "CLOSED"
    : "CLOSED";

  // SSE/SZSE: 01:30–07:00 UTC (Mon-Fri), lunch 03:30–05:00
  const sseStatus = isWeekday
    ? (utcMins >= 90 && utcMins < 210) || (utcMins >= 300 && utcMins < 420) ? "OPEN"
    : "CLOSED"
    : "CLOSED";

  // HKEX: 01:30–08:00 UTC (Mon-Fri)
  const hkexStatus = isWeekday
    ? utcMins >= 90 && utcMins < 480 ? "OPEN"
    : "CLOSED"
    : "CLOSED";

  // LSE: 08:00–16:30 UTC (Mon-Fri)
  const lseStatus = isWeekday
    ? utcMins >= 480 && utcMins < 990 ? "OPEN"
    : "CLOSED"
    : "CLOSED";

  // TSE (Tokyo): 00:00–06:00 UTC (Mon-Fri)
  const tseStatus = isWeekday
    ? (utcMins >= 0 && utcMins < 150) || (utcMins >= 210 && utcMins < 360) ? "OPEN"
    : "CLOSED"
    : "CLOSED";

  const markets = [
    { name: "NYSE", status: nyseStatus },
    { name: "NASDAQ", status: nyseStatus },
    { name: "SSE", status: sseStatus },
    { name: "HKEX", status: hkexStatus },
    { name: "LSE", status: lseStatus },
    { name: "TSE", status: tseStatus },
    { name: "CRYPTO", status: "24H ACTIVE" },
    { name: "FOREX", status: "24H ACTIVE" },
  ];

  return markets.map(m => ({ ...m, color: statusColor(m.status) }));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** A: Top Market Ticker Bar — infinite scroll */
function TopTickerBar() {
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS]; // duplicate for seamless loop

  return (
    <div className="terminal-ticker-bar">
      <div className="terminal-ticker-track">
        {items.map((item, i) => (
          <span key={i} className="terminal-ticker-item">
            <span className="terminal-ticker-symbol">{item.symbol}</span>
            <span className="terminal-ticker-value">{item.value}</span>
            <span className={`terminal-ticker-change ${item.up ? "up" : "down"}`}>
              {item.change}
            </span>
            <span className="terminal-ticker-sep">·</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** C: AI Engine Stream — typing animation, auto-scroll, never empty */
function AIEngineStream() {
  const [lines, setLines] = useState<string[]>([]);
  const [currentLine, setCurrentLine] = useState("");
  const [lineIdx, setLineIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = AI_STREAM_LINES[lineIdx % AI_STREAM_LINES.length];
    if (charIdx < target.length) {
      const t = setTimeout(() => {
        setCurrentLine(prev => prev + target[charIdx]);
        setCharIdx(c => c + 1);
      }, 28);
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(() => {
        setLines(prev => {
          const next = [...prev, target];
          return next.slice(-12); // keep last 12 lines
        });
        setCurrentLine("");
        setCharIdx(0);
        setLineIdx(i => i + 1);
      }, 600);
      return () => clearTimeout(t);
    }
  }, [charIdx, lineIdx]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines, currentLine]);

  return (
    <div className="te-panel">
      <div className="te-panel-header">
        <span className="te-panel-label">AI ENGINE STREAM</span>
        <span className="te-status-dot pulse" />
        <span className="te-status-text">LIVE</span>
      </div>
      <div ref={containerRef} className="te-stream-body">
        {lines.map((line, i) => (
          <div key={i} className="te-stream-line done">{line}</div>
        ))}
        {currentLine && (
          <div className="te-stream-line active">
            {currentLine}
            <span className="te-cursor">▌</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** D: Global Market Status Panel — live clock + dynamic market status */
function GlobalMarketStatusPanel() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const utcTime = now.toUTCString().slice(17, 25);
  const markets = computeMarketStatus(now);

  return (
    <div className="te-panel">
      <div className="te-panel-header">
        <span className="te-panel-label">MARKET STATUS</span>
        <span className="te-panel-time">{utcTime} UTC</span>
      </div>
      <div className="te-status-list">
        {markets.map((m) => (
          <div key={m.name} className="te-status-row">
            <span className="te-status-name">{m.name}</span>
            <span className={`te-status-val ${m.color}`}>{m.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** E: System Status Panel */
function SystemStatusPanel() {
  return (
    <div className="te-panel">
      <div className="te-panel-header">
        <span className="te-panel-label">SYSTEM STATUS</span>
        <span className="te-status-dot pulse green" />
      </div>
      <div className="te-status-list">
        {SYSTEM_STATUS.map((s) => (
          <div key={s.label} className="te-status-row">
            <span className="te-status-name">{s.label}</span>
            <span className={`te-status-val ${s.color}`}>{s.status}</span>
          </div>
        ))}
        <div className="te-status-all-ok">All Systems Operational</div>
      </div>
    </div>
  );
}

/** F: Bottom Command Strip */
function CommandStrip() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setActive(i => (i + 1) % COMMANDS.length);
    }, 2200);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="te-command-strip">
      <span className="te-command-label">QUICK ACCESS</span>
      <div className="te-command-list">
        {COMMANDS.map((cmd, i) => (
          <span
            key={i}
            className={`te-command-chip ${i === active ? "active" : ""}`}
          >
            {cmd}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TerminalEntry() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  // [Level12.10] Protocol Layer live data — OI-L12-010
  const { data: semanticStats } = trpc.market.getSemanticStats.useQuery(
    { entity: "AAPL", timeframe: "mid" },
    { refetchInterval: 60_000, staleTime: 30_000 }
  );
  const [bootDone, setBootDone] = useState(false);

  // Boot sequence — 1.2s then show full page
  useEffect(() => {
    const t = setTimeout(() => setBootDone(true), 1200);
    return () => clearTimeout(t);
  }, []);

  const handleEnter = () => {
    if (user) {
      navigate("/research");
    } else {
      window.location.href = getLoginUrl();
    }
  };

  const handleViewSystem = () => {
    navigate("/settings");
  };

  return (
    <div className="te-root">
      {/* A: Ticker Bar */}
      <TopTickerBar />

      {/* Boot overlay */}
      {!bootDone && (
        <div className="te-boot-overlay">
          <div className="te-boot-text">
            <span className="te-boot-logo">DANTREE</span>
            <span className="te-boot-sub">Initializing terminal...</span>
            <div className="te-boot-bar">
              <div className="te-boot-progress" />
            </div>
          </div>
        </div>
      )}

      {/* Main body */}
      <div className={`te-body ${bootDone ? "visible" : ""}`}>
        {/* B: Hero Zone — left */}
        <div className="te-hero-zone">
          <div className="te-hero-left">
            <div className="te-hero-eyebrow">
              <span className="te-status-dot pulse green" />
              <span>TERMINAL ACTIVE</span>
            </div>
            <h1 className="te-hero-title">DanTree Terminal</h1>
            <p className="te-hero-subtitle">Institutional AI Research System</p>
            <div className="te-hero-desc">
              <p>Multi-agent research engine active.</p>
              <p>40+ professional data sources connected.</p>
              <p>Market, risk, valuation, and discussion in one terminal.</p>
            </div>
            <div className="te-hero-actions">
              <button className="te-btn-primary" onClick={handleEnter}>
                {loading ? "Connecting..." : user ? "Enter Terminal" : "Access Terminal"}
              </button>
              <button className="te-btn-ghost" onClick={handleViewSystem}>
                View System
              </button>
            </div>
            <div className="te-hero-meta">
              <span>v3.1.0</span>
              <span className="te-sep">·</span>
              <span>LEVEL3B Active</span>
              <span className="te-sep">·</span>
              <span>Memory: ONLINE</span>
            </div>
          </div>

          {/* C: AI Engine Stream — center-right of hero */}
          <div className="te-hero-stream">
            <AIEngineStream />
          </div>
        </div>

        {/* D + E: Right panels row */}
        <div className="te-panels-row">
          <GlobalMarketStatusPanel />
          <SystemStatusPanel />

          {/* Mini stats panel */}
          <div className="te-panel">
            <div className="te-panel-header">
              <span className="te-panel-label">ENGINE STATS</span>
            </div>
            <div className="te-status-list">
              <div className="te-status-row">
                <span className="te-status-name">Data Sources</span>
                <span className="te-status-val text-blue-400">40+</span>
              </div>
              <div className="te-status-row">
                <span className="te-status-name">Hypotheses Active</span>
                <span className="te-status-val text-blue-400">3</span>
              </div>
              <div className="te-status-row">
                <span className="te-status-name">Memory Records</span>
                <span className="te-status-val text-blue-400">—</span>
              </div>
              <div className="te-status-row">
                <span className="te-status-name">Loop Iterations</span>
                <span className="te-status-val text-blue-400">—</span>
              </div>
              <div className="te-status-row">
                <span className="te-status-name">Evidence Score</span>
                <span className="te-status-val text-emerald-400">0.74</span>
              </div>
              <div className="te-status-row">
                <span className="te-status-name">Confidence Avg</span>
                <span className="te-status-val text-emerald-400">72%</span>
              </div>
              {/* Protocol Layer — Level 12.8 semantic engine stats */}
              <div className="te-status-row" style={{ borderTop: "1px solid rgba(255,255,255,0.07)", marginTop: "5px", paddingTop: "5px" }}>
                <span className="te-status-name" style={{ color: "#4b5563", fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>Protocol Layer</span>
              </div>
              <div className="te-status-row">
                <span className="te-status-name">Direction</span>
                <span className="te-status-val text-cyan-400">{semanticStats?.dominant_direction ?? "—"}</span>
              </div>
              <div className="te-status-row">
                <span className="te-status-name">Confidence</span>
                <span className="te-status-val text-cyan-400">{semanticStats?.confidence_score != null ? (semanticStats.confidence_score * 100).toFixed(0) + "%" : "—"}</span>
              </div>
              <div className="te-status-row">
                <span className="te-status-name">Conflicts</span>
                <span className="te-status-val text-cyan-400">{semanticStats?.conflict_count ?? 0}</span>
              </div>
            </div>
          </div>
        </div>

        {/* F: Command Strip */}
        <CommandStrip />
      </div>
    </div>
  );
}
