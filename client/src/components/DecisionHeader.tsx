/**
 * DecisionHeader.tsx — DanTree Workspace v2.1-B5
 * Decision Canvas 顶部主标题栏
 * 职责：实体标识、核心立场、置信度、市场状态
 */
import React from "react";
import {
  TrendingUp, TrendingDown, Minus,
  Activity, AlertCircle, CheckCircle2, Clock
} from "lucide-react";

/** Compat: section identifiers for scroll-to-block */
export type ScrollToSection = "thesis" | "timing" | "alert" | "history";

export interface DecisionHeaderProps {
  entity?: string;
  stance?: "bullish" | "bearish" | "neutral" | "mixed" | "unavailable";
  confidence?: number | null;
  changeMarker?: "stable" | "strengthening" | "weakening" | "reversal" | "unknown";
  alertCount?: number;
  highestAlertSeverity?: "low" | "medium" | "high" | "critical" | null;
  gateState?: "pass" | "block" | "fallback";
  lastUpdated?: string;
  onEntitySearch?: () => void;
  /** compat: legacy callers pass HeaderViewModel via vm prop; use unknown to accept any shape */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vm?: any;
  /** compat: legacy scroll-to callback */
  onScrollTo?: (section: ScrollToSection) => void;
  /** compat: active section highlight from IntersectionObserver */
  activeSection?: ScrollToSection | null;
}

const STANCE_CONFIG = {
  bullish:     { label: "看多",   color: "#34d399", glow: "#34d39930", icon: TrendingUp },
  bearish:     { label: "看空",   color: "#f87171", glow: "#f8717130", icon: TrendingDown },
  neutral:     { label: "中性",   color: "#94a3b8", glow: "#94a3b815", icon: Minus },
  mixed:       { label: "混合",   color: "#fbbf24", glow: "#fbbf2425", icon: Activity },
  unavailable: { label: "数据不足", color: "#4b5563", glow: "#4b556310", icon: AlertCircle },
};

const MARKER_CONFIG = {
  strengthening: { label: "强化中", color: "#34d399" },
  weakening:     { label: "弱化中", color: "#f87171" },
  reversal:      { label: "逆转",   color: "#f97316" },
  stable:        { label: "稳定",   color: "#60a5fa" },
  unknown:       { label: "未知",   color: "#4b5563" },
};

const GATE_CONFIG = {
  pass:     { label: "通过",   color: "#34d399", bg: "#0d2b1e" },
  block:    { label: "拦截",   color: "#f87171", bg: "#2b0d0d" },
  fallback: { label: "待定",   color: "#fbbf24", bg: "#2b200d" },
};

function ConfidenceArc({ value }: { value: number }) {
  const r = 22;
  const circ = 2 * Math.PI * r;
  const arc = circ * 0.75;
  const fill = arc * (value / 100);
  const color = value >= 70 ? "#34d399" : value >= 40 ? "#fbbf24" : "#f87171";

  return (
    <svg width={56} height={56} className="absolute inset-0" style={{ transform: "rotate(-135deg)" }}>
      <circle cx={28} cy={28} r={r} fill="none" stroke="#1c2028" strokeWidth={3} strokeDasharray={`${arc} ${circ - arc}`} strokeLinecap="round" />
      <circle
        cx={28} cy={28} r={r} fill="none"
        stroke={color}
        strokeWidth={3}
        strokeDasharray={`${fill} ${circ - fill}`}
        strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 4px ${color}80)` }}
      />
    </svg>
  );
}

export function DecisionHeader({
  entity: entityProp = "—",
  stance: stanceProp = "unavailable",
  confidence: confidenceProp = null,
  changeMarker: changeMarkerProp = "unknown",
  alertCount: alertCountProp = 0,
  highestAlertSeverity: highestAlertSeverityProp = null,
  gateState: gateStateProp = "fallback",
  lastUpdated: lastUpdatedProp,
  onEntitySearch,
  vm,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onScrollTo: _onScrollTo,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  activeSection: _activeSection,
}: DecisionHeaderProps) {
  // compat bridge: if vm is passed, extract values from it
  const entity = vm?.entity ?? entityProp;
  const stance = ((vm?.stance as string | undefined) ?? stanceProp) as "bullish" | "bearish" | "neutral" | "mixed" | "unavailable";
  const confidence = vm?.confidence !== undefined ? vm.confidence : confidenceProp;
  const changeMarker = (vm?.changeMarker ?? changeMarkerProp) as "stable" | "strengthening" | "weakening" | "reversal" | "unknown";
  const alertCount = vm?.alertCount ?? alertCountProp;
  const highestAlertSeverity = (vm?.highestAlertSeverity !== undefined ? vm.highestAlertSeverity : highestAlertSeverityProp) as "low" | "medium" | "high" | "critical" | null;
  const gateState = (vm?.gateState ?? gateStateProp) as "pass" | "block" | "fallback";
  const lastUpdated = vm?.lastUpdated ?? lastUpdatedProp;
  const stanceCfg = STANCE_CONFIG[stance] ?? STANCE_CONFIG.unavailable;
  const markerCfg = MARKER_CONFIG[changeMarker] ?? MARKER_CONFIG.unknown;
  const gateCfg = GATE_CONFIG[gateState] ?? GATE_CONFIG.fallback;
  const StanceIcon = stanceCfg.icon;
  const confPct = confidence != null ? Math.round(confidence * 100) : null;

  return (
    <div
      className="flex items-center gap-5 px-6 py-4"
      style={{
        background: "linear-gradient(135deg, #0d1117 0%, #0a0e14 100%)",
        borderBottom: "1px solid #151b23",
        fontFamily: "'SF Pro Display', 'JetBrains Mono', monospace",
      }}
    >
      {/* Entity */}
      <button
        onClick={onEntitySearch}
        className="flex items-center gap-2 group transition-all duration-200"
        style={{ minWidth: 100 }}
      >
        <div
          className="px-3 py-1.5 rounded-lg"
          style={{
            background: entity !== "—"
              ? `linear-gradient(135deg, ${stanceCfg.glow}, #0d1117)`
              : "#0f1520",
            border: `1px solid ${entity !== "—" ? stanceCfg.color + "30" : "#1c2028"}`,
          }}
        >
          <span
            className="font-mono font-black text-lg tracking-wider"
            style={{ color: entity !== "—" ? stanceCfg.color : "#374151", letterSpacing: "0.08em" }}
          >
            {entity}
          </span>
        </div>
      </button>

      {/* Divider */}
      <div className="w-px h-8" style={{ background: "#1c2028" }} />

      {/* Stance */}
      <div className="flex items-center gap-2.5">
        <div
          className="flex items-center justify-center rounded-full"
          style={{
            width: 32, height: 32,
            background: stanceCfg.glow,
            border: `1px solid ${stanceCfg.color}30`,
          }}
        >
          <StanceIcon className="w-4 h-4" style={{ color: stanceCfg.color }} />
        </div>
        <div>
          <div className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: "#4b5563" }}>
            立场
          </div>
          <div className="text-sm font-bold" style={{ color: stanceCfg.color }}>
            {stanceCfg.label}
          </div>
        </div>
      </div>

      {/* Confidence Arc */}
      {confPct !== null && (
        <>
          <div className="w-px h-8" style={{ background: "#1c2028" }} />
          <div className="relative flex items-center justify-center" style={{ width: 56, height: 56 }}>
            <ConfidenceArc value={confPct} />
            <span className="text-sm font-bold font-mono z-10" style={{ color: confPct >= 70 ? "#34d399" : confPct >= 40 ? "#fbbf24" : "#f87171" }}>
              {confPct}%
            </span>
          </div>
          <div>
            <div className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: "#4b5563" }}>
              置信度
            </div>
            <div
              className="text-[11px] font-medium"
              style={{ color: markerCfg.color }}
            >
              {markerCfg.label}
            </div>
          </div>
        </>
      )}

      {/* Gate */}
      <div className="w-px h-8" style={{ background: "#1c2028" }} />
      <div className="flex items-center gap-2">
        <div
          className="px-2.5 py-1 rounded-md text-[11px] font-bold"
          style={{
            background: gateCfg.bg,
            border: `1px solid ${gateCfg.color}30`,
            color: gateCfg.color,
          }}
        >
          {gateCfg.label}
        </div>
        {gateState === "pass" && <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "#34d399" }} />}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Alerts */}
      {alertCount > 0 && (
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md"
          style={{
            background: highestAlertSeverity === "critical" ? "#2b0d0d"
              : highestAlertSeverity === "high" ? "#2b1400"
              : "#1a1600",
            border: `1px solid ${
              highestAlertSeverity === "critical" ? "#f8717130"
              : highestAlertSeverity === "high" ? "#f9731630"
              : "#fbbf2430"
            }`,
          }}
        >
          <AlertCircle
            className="w-3.5 h-3.5"
            style={{
              color: highestAlertSeverity === "critical" ? "#f87171"
                : highestAlertSeverity === "high" ? "#f97316"
                : "#fbbf24"
            }}
          />
          <span
            className="text-[11px] font-bold"
            style={{
              color: highestAlertSeverity === "critical" ? "#f87171"
                : highestAlertSeverity === "high" ? "#f97316"
                : "#fbbf24"
            }}
          >
            {alertCount} 警报
          </span>
        </div>
      )}

      {/* Last updated */}
      {lastUpdated && (
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" style={{ color: "#374151" }} />
          <span className="text-[10px]" style={{ color: "#374151" }}>{lastUpdated}</span>
        </div>
      )}
    </div>
  );
}
