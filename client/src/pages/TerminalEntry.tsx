/**
 * TerminalEntry — DanTree Terminal Entry Page
 * Route: /terminal-entry
 * Purpose: System entry point. User feels terminal is ALREADY RUNNING.
 * NOT a landing page. NOT a marketing page. A terminal door.
 */
import React, { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { useActiveFocusKey } from "@/contexts/WorkspaceContext";
import { SessionRail } from "@/components/SessionRail";
import { useWorkspaceViewModel } from "@/hooks/useWorkspaceViewModel";
import { DecisionHeader } from "@/components/DecisionHeader";
import { DecisionSpine } from "@/components/DecisionSpine";

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
function SystemStatusPanel({ sourceRouterStatus }: { sourceRouterStatus: string }) {
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
        {/* Source Router — Level 13.1B live wiring — OI-L13-001 */}
        <div className="te-status-row">
          <span className="te-status-name">Source Router</span>
          <span className="te-status-val text-emerald-400">{sourceRouterStatus}</span>
        </div>
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
  // [Level13.4B] Active entity from persisted user config — OI-L13-004
  const { data: rpaConfig } = trpc.rpa.getConfig.useQuery(undefined, {
    staleTime: 30_000,
    enabled: !!user,
  });
  // [WORKSPACE_V2.1_A1] Active entity driven by WorkspaceContext.currentSession.focusKey
  // Falls back to rpaConfig.lastTicker → "AAPL" when no session is active.
  const workspaceFocusKey = useActiveFocusKey();
  const rpcLastTicker: string = (rpaConfig as any)?.lastTicker ?? "AAPL";
  const activeEntity: string = workspaceFocusKey !== "AAPL" ? workspaceFocusKey : rpcLastTicker;
  // [B1a] All entity-level analytical data now comes from useWorkspaceViewModel (single adapter).
  // Removed 7 duplicate market queries: getSourceSelectionStats / getOutputGateStats /
  // getSemanticStats / evaluateEntityAlerts / getEntityThesisState / getExecutionTiming /
  // getSessionHistory — all consumed via vm.raw.* or vm.*ViewModel below.
  // Retained: analyzeBasket / compareEntities / evaluateBasketAlerts (basket-specific, not in adapter).
  const vm = useWorkspaceViewModel();
  const { raw } = vm;
  const sourceStats = raw.sourceStats as any;
  const gateStats = raw.gateStats as any;
  const semanticStats = raw.semanticStats as any;
  const entityAlerts = raw.entityAlerts as any;
  const timingData = raw.timingData as any;
  const thesisData = raw.thesisData as any;
  const sessionData = raw.sessionData as any;
  const sourceRouterStatus = vm.headerViewModel.sourceRouterStatus;
  // [Level15.1A] Comparison Panel state — OI-L15-002
  // [Level16.1A] Basket Analysis state — OI-L16-002
  const BASKET_SLOTS = 5;
  const [basketInputs, setBasketInputs] = useState<string[]>(["AAPL", "MSFT", "NVDA", "", ""]);
  const [basketEntities, setBasketEntities] = useState<string[]>(["AAPL", "MSFT", "NVDA"]);
  const basketInitialized = React.useRef(false);
  useEffect(() => {
    if (!basketInitialized.current && activeEntity && activeEntity !== "AAPL") {
      setBasketInputs(prev => { const next = [...prev]; next[0] = activeEntity; return next; });
      setBasketEntities(prev => { const next = [...prev]; next[0] = activeEntity; return next; });
      basketInitialized.current = true;
    } else if (!basketInitialized.current && activeEntity) {
      basketInitialized.current = true;
    }
  }, [activeEntity]);
  const cleanedBasket = useMemo(
    () => basketEntities.map(e => e.trim().toUpperCase()).filter(e => e.length > 0).slice(0, 8),
    [basketEntities]
  );
  const { data: basketData, isFetching: basketFetching } = trpc.market.analyzeBasket.useQuery(
    { entities: cleanedBasket, taskType: "portfolio_review", region: "US" },
    { enabled: cleanedBasket.length >= 2, staleTime: 30_000 }
  );
  const handleBasketRun = () => {
    const cleaned = basketInputs.map(e => e.trim().toUpperCase()).filter(e => e.length > 0);
    if (cleaned.length >= 2) setBasketEntities(cleaned);
  };

  // [Level15.2] entityA prefilled from activeEntity — OI-L15-004
  const [compA, setCompA] = useState<string>("AAPL");
  const [compB, setCompB] = useState<string>("MSFT");
  const [compInputA, setCompInputA] = useState<string>("AAPL");
  const [compInputB, setCompInputB] = useState<string>("MSFT");
  // Sync entityA to activeEntity on first load (do not override user edits)
  const compInitialized = React.useRef(false);
  useEffect(() => {
    if (!compInitialized.current && activeEntity && activeEntity !== "AAPL") {
      setCompA(activeEntity);
      setCompInputA(activeEntity);
      compInitialized.current = true;
    } else if (!compInitialized.current && activeEntity) {
      compInitialized.current = true;
    }
  }, [activeEntity]);
  const { data: compData, isFetching: compFetching } = trpc.market.compareEntities.useQuery(
    { entityA: compA, entityB: compB },
    { staleTime: 30_000, enabled: compA.length > 0 && compB.length > 0 }
  );
  const handleCompare = () => {
    const a = compInputA.trim().toUpperCase();
    const b = compInputB.trim().toUpperCase();
    if (a && b) { setCompA(a); setCompB(b); }
  };
  // [B1a] Protocol Layer + Alert Engine data now from vm.raw (no duplicate queries).
  const { data: basketAlerts } = trpc.market.evaluateBasketAlerts.useQuery(
    { portfolioResult: basketData?.available ? basketData : null },
    { enabled: !!basketData?.available, staleTime: 60_000 }
  );

  // [B1a] Timing / Thesis / Session History data now from vm.raw (no duplicate queries).

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

      {/* Main body — with SessionRail on the left (WORKSPACE_V2.1_A1) */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
        {/* Session Rail — left column, 200px */}
        <SessionRail width={200} />

        {/* Main content */}
        <div className={`te-body ${bootDone ? "visible" : ""}`} style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
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
          <SystemStatusPanel sourceRouterStatus={sourceRouterStatus} />

          {/* Mini stats panel */}
          <div className="te-panel">
            <div className="te-panel-header">
              <span className="te-panel-label">ENGINE STATS</span>
              {/* [Level13.5A] Active entity label — OI-L13-005 */}
              {activeEntity && activeEntity !== "AAPL" ? (
                <span className="te-status-text" style={{ fontSize: "10px", opacity: 0.7, marginLeft: "6px" }}>· {activeEntity}</span>
              ) : (
                <span className="te-status-text" style={{ fontSize: "10px", opacity: 0.45, marginLeft: "6px" }}>· AAPL</span>
              )}
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
              {/* Output Gate — Level 13.3A output gating stats */}
              <div className="te-status-row" style={{ borderTop: "1px solid rgba(255,255,255,0.07)", marginTop: "5px", paddingTop: "5px" }}>
                <span className="te-status-name" style={{ color: "#4b5563", fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>Output Gate</span>
              </div>
              <div className="te-status-row">
                <span className="te-status-name">Gate Status</span>
                <span className="te-status-val" style={{ color: gateStats?.gate_passed ? "#34d399" : "#f87171" }}>
                  {gateStats == null ? "—" : gateStats.gate_passed ? "PASS" : "BLOCK"}
                </span>
              </div>
              <div className="te-status-row">
                <span className="te-status-name">Evidence</span>
                <span className="te-status-val text-cyan-400">
                  {gateStats?.evidence_score != null ? gateStats.evidence_score + "/100" : "—"}
                </span>
              </div>
              <div className="te-status-row">
                <span className="te-status-name">Mode</span>
                <span className="te-status-val text-cyan-400">
                  {gateStats?.output_mode ?? "—"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* G: Comparison Panel — Level 15.1A — OI-L15-002 */}
        <div className="te-panel" style={{ marginTop: "12px" }}>
          <div className="te-panel-header">
            <span className="te-panel-label">ENTITY COMPARISON</span>
            <span className="te-status-text" style={{ fontSize: "10px", opacity: 0.5, marginLeft: "6px" }}>advisory only</span>
          </div>
          <div className="te-panel-body" style={{ padding: "10px 14px" }}>
            {/* Ticker inputs */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "10px", alignItems: "center" }}>
              <input
                value={compInputA}
                onChange={e => setCompInputA(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && handleCompare()}
                maxLength={10}
                placeholder="Entity A"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "4px", color: "#e2e8f0", fontSize: "11px", padding: "4px 8px", width: "80px", fontFamily: "monospace", textTransform: "uppercase" }}
              />
              <span style={{ color: "#64748b", fontSize: "11px" }}>vs</span>
              <input
                value={compInputB}
                onChange={e => setCompInputB(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && handleCompare()}
                maxLength={10}
                placeholder="Entity B"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "4px", color: "#e2e8f0", fontSize: "11px", padding: "4px 8px", width: "80px", fontFamily: "monospace", textTransform: "uppercase" }}
              />
              <button
                onClick={handleCompare}
                disabled={compFetching}
                style={{ background: "rgba(6,182,212,0.15)", border: "1px solid rgba(6,182,212,0.3)", borderRadius: "4px", color: "#22d3ee", fontSize: "10px", padding: "4px 10px", cursor: "pointer", fontFamily: "monospace", letterSpacing: "0.05em" }}
              >
                {compFetching ? "..." : "RUN"}
              </button>
            </div>
            {/* 5-dimension table */}
            {compData?.available ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 60px 60px", gap: "2px", marginBottom: "6px" }}>
                  <span style={{ fontSize: "9px", color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em" }}>Dimension</span>
                  <span style={{ fontSize: "9px", color: "#475569", textAlign: "center" }}>{compData.left_entity}</span>
                  <span style={{ fontSize: "9px", color: "#475569", textAlign: "center" }}>{compData.right_entity}</span>
                  <span style={{ fontSize: "9px", color: "#475569", textAlign: "center" }}>Winner</span>
                </div>
                {[
                  { label: "Semantic Dir", lv: (compData as any).semantic_comparison?.left_direction ?? "—", rv: (compData as any).semantic_comparison?.right_direction ?? "—", w: (compData as any).semantic_comparison?.winner },
                  { label: "Evidence", lv: (compData as any).evidence_comparison?.left_score != null ? String((compData as any).evidence_comparison.left_score) : "—", rv: (compData as any).evidence_comparison?.right_score != null ? String((compData as any).evidence_comparison.right_score) : "—", w: (compData as any).evidence_comparison?.winner },
                  { label: "Gate", lv: (compData as any).gate_comparison?.left_gate ?? "—", rv: (compData as any).gate_comparison?.right_gate ?? "—", w: (compData as any).gate_comparison?.winner },
                  { label: "Sources", lv: (compData as any).source_comparison?.left_count != null ? String((compData as any).source_comparison.left_count) : "—", rv: (compData as any).source_comparison?.right_count != null ? String((compData as any).source_comparison.right_count) : "—", w: (compData as any).source_comparison?.winner },
                  { label: "Fragility", lv: (compData as any).fragility_comparison?.left_fragility ?? "—", rv: (compData as any).fragility_comparison?.right_fragility ?? "—", w: (compData as any).fragility_comparison?.winner },
                ].map(row => (
                  <div key={row.label} style={{ display: "grid", gridTemplateColumns: "1fr 60px 60px 60px", gap: "2px", padding: "3px 0", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{ fontSize: "10px", color: "#94a3b8", fontFamily: "monospace" }}>{row.label}</span>
                    <span style={{ fontSize: "10px", color: "#e2e8f0", textAlign: "center", fontFamily: "monospace" }}>{row.lv}</span>
                    <span style={{ fontSize: "10px", color: "#e2e8f0", textAlign: "center", fontFamily: "monospace" }}>{row.rv}</span>
                    <span style={{ fontSize: "10px", textAlign: "center", fontFamily: "monospace", color: row.w === "left" ? "#34d399" : row.w === "right" ? "#f87171" : "#64748b" }}>
                      {row.w === "left" ? compData.left_entity : row.w === "right" ? compData.right_entity : row.w === "tie" ? "TIE" : "—"}
                    </span>
                  </div>
                ))}
                {/* Summary */}
                <div style={{ marginTop: "8px", padding: "6px 8px", background: "rgba(255,255,255,0.03)", borderRadius: "4px", borderLeft: "2px solid rgba(6,182,212,0.3)" }}>
                  <span style={{ fontSize: "10px", color: "#64748b", fontFamily: "monospace", lineHeight: 1.5 }}>{compData.comparison_summary}</span>
                </div>
              </>
            ) : (
              <div style={{ fontSize: "10px", color: "#475569", fontFamily: "monospace", padding: "4px 0" }}>
                {compFetching ? "Comparing..." : "Enter two tickers and press RUN"}
              </div>
            )}
          </div>
        </div>
        {/* H: Basket Analysis Panel — Level 16.1A — OI-L16-002 */}
        <div className="te-panel" style={{ marginTop: "12px" }}>
          <div className="te-panel-header">
            <span className="te-panel-label">BASKET ANALYSIS</span>
            <span className="te-status-text" style={{ fontSize: "10px", opacity: 0.5, marginLeft: "6px" }}>advisory only · phase 1</span>
          </div>
          <div className="te-panel-body" style={{ padding: "10px 14px" }}>
            {/* Ticker slot inputs */}
            <div style={{ display: "flex", gap: "6px", marginBottom: "10px", alignItems: "center", flexWrap: "wrap" }}>
              {Array.from({ length: BASKET_SLOTS }).map((_, i) => (
                <input
                  key={i}
                  value={basketInputs[i] ?? ""}
                  onChange={e => setBasketInputs(prev => { const next = [...prev]; next[i] = e.target.value.toUpperCase(); return next; })}
                  onKeyDown={e => e.key === "Enter" && handleBasketRun()}
                  maxLength={10}
                  placeholder={i === 0 ? "Slot 1" : i === 1 ? "Slot 2" : i === 2 ? "Slot 3" : `Slot ${i + 1}`}
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "4px", color: "#e2e8f0", fontSize: "11px", padding: "4px 7px", width: "64px", fontFamily: "monospace", textTransform: "uppercase" }}
                />
              ))}
              <button
                onClick={handleBasketRun}
                disabled={basketFetching}
                style={{ background: "rgba(6,182,212,0.15)", border: "1px solid rgba(6,182,212,0.3)", borderRadius: "4px", color: "#22d3ee", fontSize: "10px", padding: "4px 10px", cursor: "pointer", fontFamily: "monospace", letterSpacing: "0.05em" }}
              >
                {basketFetching ? "..." : "ANALYZE"}
              </button>
            </div>

            {/* Results */}
            {basketData?.available ? (
              <>
                {/* Per-entity gate badges */}
                <div style={{ display: "flex", gap: "5px", marginBottom: "8px", flexWrap: "wrap" }}>
                  {(basketData as any).entity_snapshots?.map((snap: any) => (
                    <span key={snap.entity} style={{
                      fontSize: "9px", fontFamily: "monospace", padding: "2px 6px", borderRadius: "3px",
                      background: snap.gate_decision === "PASS" ? "rgba(52,211,153,0.12)" : snap.gate_decision === "BLOCK" ? "rgba(248,113,113,0.12)" : "rgba(100,116,139,0.12)",
                      border: `1px solid ${snap.gate_decision === "PASS" ? "rgba(52,211,153,0.3)" : snap.gate_decision === "BLOCK" ? "rgba(248,113,113,0.3)" : "rgba(100,116,139,0.2)"}`,
                      color: snap.gate_decision === "PASS" ? "#34d399" : snap.gate_decision === "BLOCK" ? "#f87171" : "#64748b",
                    }}>
                      {snap.entity} · {snap.gate_decision}
                    </span>
                  ))}
                </div>

                {/* 5-dimension table */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 120px", gap: "2px", marginBottom: "4px" }}>
                  <span style={{ fontSize: "9px", color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em" }}>Dimension</span>
                  <span style={{ fontSize: "9px", color: "#475569" }}>Value</span>
                  <span style={{ fontSize: "9px", color: "#475569" }}>Detail</span>
                </div>
                {[
                  {
                    label: "Thesis Overlap",
                    val: (basketData as any).thesis_overlap?.value?.overlap_ratio != null
                      ? ((basketData as any).thesis_overlap.value.overlap_ratio * 100).toFixed(0) + "%"
                      : "—",
                    detail: (basketData as any).thesis_overlap?.value?.dominant_direction ?? "—",
                  },
                  {
                    label: "Concentration",
                    val: (basketData as any).concentration_risk?.value?.level ?? "—",
                    detail: `HHI ${(basketData as any).concentration_risk?.value?.hhi_score ?? "—"}`,
                  },
                  {
                    label: "Shared Fragility",
                    val: (basketData as any).shared_fragility?.value?.fragility_flag ? "ELEVATED" : "OK",
                    detail: `avg ${(basketData as any).shared_fragility?.value?.avg_fragility ?? "—"}`,
                  },
                  {
                    label: "Evidence Disp.",
                    val: (basketData as any).evidence_dispersion?.value?.std_dev != null
                      ? `σ ${(basketData as any).evidence_dispersion.value.std_dev}`
                      : "—",
                    detail: `mean ${(basketData as any).evidence_dispersion?.value?.mean_score ?? "—"}`,
                  },
                  {
                    label: "Gate Dist.",
                    val: (basketData as any).gate_distribution?.value?.basket_investable ? "INVESTABLE" : "BLOCKED",
                    detail: `${(basketData as any).gate_distribution?.value?.pass_count ?? 0}P / ${(basketData as any).gate_distribution?.value?.block_count ?? 0}B / ${(basketData as any).gate_distribution?.value?.unavailable_count ?? 0}U`,
                  },
                ].map(row => (
                  <div key={row.label} style={{ display: "grid", gridTemplateColumns: "1fr 80px 120px", gap: "2px", padding: "3px 0", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{ fontSize: "10px", color: "#94a3b8", fontFamily: "monospace" }}>{row.label}</span>
                    <span style={{ fontSize: "10px", color: "#e2e8f0", fontFamily: "monospace" }}>{row.val}</span>
                    <span style={{ fontSize: "10px", color: "#64748b", fontFamily: "monospace" }}>{row.detail}</span>
                  </div>
                ))}

                {/* Basket summary */}
                <div style={{ marginTop: "8px", padding: "6px 8px", background: "rgba(255,255,255,0.03)", borderRadius: "4px", borderLeft: "2px solid rgba(6,182,212,0.3)" }}>
                  <span style={{ fontSize: "10px", color: "#64748b", fontFamily: "monospace", lineHeight: 1.5 }}>
                    {(basketData as any).basket_summary ?? "—"}
                  </span>
                </div>
              </>
            ) : (
              <div style={{ fontSize: "10px", color: "#475569", fontFamily: "monospace", padding: "4px 0" }}>
                {basketFetching ? "Analyzing basket..." : cleanedBasket.length < 2 ? "Enter at least 2 tickers and press ANALYZE" : "Basket analysis unavailable"}
              </div>
            )}
          </div>
        </div>

        {/* [B1b] Basket Alerts — 保留：basket 专用，不在 entity adapter 范围内 */}
        {(basketAlerts && basketAlerts.alert_count > 0) && (
          <div className="te-panel" style={{ marginTop: "12px", borderLeft: "2px solid rgba(251,146,60,0.3)" }}>
            <div className="te-panel-header">
              <span className="te-panel-label">BASKET ALERTS</span>
              <span style={{ fontSize: "9px", color: "#475569", fontFamily: "monospace", marginLeft: "6px" }}>{basketAlerts.alert_count} 条</span>
            </div>
            <div className="te-panel-body" style={{ padding: "10px 14px" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "5px" }}>
                {basketAlerts.alerts?.map((a: any, i: number) => (
                  <span key={i} style={{
                    fontSize: "8px", fontFamily: "monospace", padding: "1px 5px", borderRadius: "2px",
                    background: "#0f172a", border: "1px solid #1e293b",
                    color: a.severity === "critical" ? "#fca5a5" : a.severity === "high" ? "#fb923c" : a.severity === "medium" ? "#fbbf24" : "#64748b",
                  }}>{a.alert_type?.replace(/_/g, " ")}</span>
                ))}
              </div>
              <div style={{ fontSize: "9px", color: "#475569", fontFamily: "monospace", lineHeight: 1.6 }}>{basketAlerts.summary_text}</div>
            </div>
          </div>
        )}
        {/* F: Command Strip */}
        <CommandStrip />
        </div>{/* end te-body */}
      </div>{/* end flex wrapper */}
    </div>
  );
}
