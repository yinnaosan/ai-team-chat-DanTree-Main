/**
 * DanTree Workspace v2.1 — Unified Design System
 * ui-ux-pro-max: Financial Dashboard palette + Dashboard Data typography
 * Style: Apple/Tesla/NVIDIA — 克制、精密、高密度、长期可读
 */

// ─── Color Tokens ────────────────────────────────────────────────────────────
export const DS = {
  // Surface layers
  bg:        "#020617",   // root background
  surface0:  "#0A0F1E",   // page-level surface
  surface1:  "#0E1223",   // card surface
  surface2:  "#141929",   // elevated card / hover
  surface3:  "#1A2035",   // selected / active

  // Borders
  border0:   "#1E2A3A",   // subtle separator
  border1:   "#2A3A52",   // card border
  border2:   "#334155",   // interactive border

  // Text
  text0:     "#F8FAFC",   // primary text
  text1:     "#CBD5E1",   // secondary text
  text2:     "#94A3B8",   // muted text
  text3:     "#64748B",   // disabled / placeholder

  // Semantic — stance
  bull:      "#22C55E",   // 多 / positive
  bullBg:    "#052E16",
  bullBorder:"#14532D",
  bear:      "#F87171",   // 空 / negative
  bearBg:    "#2D0A0A",
  bearBorder:"#7F1D1D",
  neutral:   "#94A3B8",   // 中性
  neutralBg: "#1A2035",
  neutralBorder: "#334155",

  // Semantic — severity
  critical:  "#F87171",   // CRITICAL
  criticalBg:"#2D0A0A",
  criticalBorder: "#7F1D1D",
  high:      "#FB923C",   // HIGH
  highBg:    "#1C0A00",
  highBorder:"#7C2D12",
  medium:    "#FBBF24",   // MEDIUM
  mediumBg:  "#1C1000",
  mediumBorder: "#78350F",
  low:       "#94A3B8",   // LOW
  lowBg:     "#1A2035",
  lowBorder: "#334155",

  // Semantic — readiness
  ready:     "#22C55E",
  readyBg:   "#052E16",
  readyBorder:"#14532D",
  conditional:"#FBBF24",
  conditionalBg:"#1C1000",
  conditionalBorder:"#78350F",
  notReady:  "#94A3B8",
  notReadyBg:"#1A2035",
  notReadyBorder:"#334155",

  // Semantic — action bias
  buy:       "#22C55E",
  buyBg:     "#052E16",
  buyBorder: "#14532D",
  hold:      "#94A3B8",
  holdBg:    "#1A2035",
  holdBorder:"#334155",
  avoid:     "#F87171",
  avoidBg:   "#2D0A0A",
  avoidBorder:"#7F1D1D",

  // Accent
  accent:    "#3B82F6",   // info / link
  accentBg:  "#0C1A3A",
  accentBorder:"#1D4ED8",

  // Typography
  fontMono:  "'Fira Code', 'JetBrains Mono', monospace",
  fontSans:  "'Fira Sans', 'Inter', sans-serif",

  // Spacing rhythm (8px base)
  sp1: "4px",
  sp2: "8px",
  sp3: "12px",
  sp4: "16px",
  sp5: "20px",
  sp6: "24px",
  sp8: "32px",

  // Border radius
  r1: "3px",   // chip / badge
  r2: "6px",   // card
  r3: "8px",   // panel

  // Shadows
  shadow0: "none",
  shadow1: "0 1px 3px rgba(0,0,0,0.4)",
  shadow2: "0 2px 8px rgba(0,0,0,0.5)",
  shadow3: "0 4px 16px rgba(0,0,0,0.6)",

  // Transitions
  transition: "all 0.15s ease",
} as const;

// ─── Chip / Badge Factory ─────────────────────────────────────────────────────
type ChipVariant = "bull" | "bear" | "neutral" | "critical" | "high" | "medium" | "low" | "ready" | "conditional" | "not-ready" | "buy" | "hold" | "avoid" | "accent" | "muted";

export function chipStyle(variant: ChipVariant): React.CSSProperties {
  const map: Record<ChipVariant, React.CSSProperties> = {
    bull:        { background: DS.bullBg,        color: DS.bull,      border: `1px solid ${DS.bullBorder}` },
    bear:        { background: DS.bearBg,        color: DS.bear,      border: `1px solid ${DS.bearBorder}` },
    neutral:     { background: DS.neutralBg,     color: DS.neutral,   border: `1px solid ${DS.neutralBorder}` },
    critical:    { background: DS.criticalBg,    color: DS.critical,  border: `1px solid ${DS.criticalBorder}` },
    high:        { background: DS.highBg,        color: DS.high,      border: `1px solid ${DS.highBorder}` },
    medium:      { background: DS.mediumBg,      color: DS.medium,    border: `1px solid ${DS.mediumBorder}` },
    low:         { background: DS.lowBg,         color: DS.low,       border: `1px solid ${DS.lowBorder}` },
    ready:       { background: DS.readyBg,       color: DS.ready,     border: `1px solid ${DS.readyBorder}` },
    conditional: { background: DS.conditionalBg, color: DS.conditional, border: `1px solid ${DS.conditionalBorder}` },
    "not-ready": { background: DS.notReadyBg,    color: DS.notReady,  border: `1px solid ${DS.notReadyBorder}` },
    buy:         { background: DS.buyBg,         color: DS.buy,       border: `1px solid ${DS.buyBorder}` },
    hold:        { background: DS.holdBg,        color: DS.hold,      border: `1px solid ${DS.holdBorder}` },
    avoid:       { background: DS.avoidBg,       color: DS.avoid,     border: `1px solid ${DS.avoidBorder}` },
    accent:      { background: DS.accentBg,      color: DS.accent,    border: `1px solid ${DS.accentBorder}` },
    muted:       { background: DS.surface2,      color: DS.text2,     border: `1px solid ${DS.border1}` },
  };
  return {
    ...map[variant],
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "2px 8px",
    borderRadius: DS.r1,
    fontSize: "10px",
    fontFamily: DS.fontMono,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase" as const,
    whiteSpace: "nowrap" as const,
    lineHeight: "16px",
    transition: DS.transition,
  };
}

// ─── Section Header ───────────────────────────────────────────────────────────
export const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: `${DS.sp2} ${DS.sp4}`,
  borderBottom: `1px solid ${DS.border0}`,
  marginBottom: DS.sp3,
};

export const sectionTitleStyle: React.CSSProperties = {
  fontFamily: DS.fontMono,
  fontSize: "10px",
  fontWeight: 600,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: DS.text2,
};

// ─── Card Surface ─────────────────────────────────────────────────────────────
export const cardStyle: React.CSSProperties = {
  background: DS.surface1,
  border: `1px solid ${DS.border1}`,
  borderRadius: DS.r2,
  boxShadow: DS.shadow1,
};

// ─── Row ──────────────────────────────────────────────────────────────────────
export const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: `${DS.sp2} ${DS.sp4}`,
  borderBottom: `1px solid ${DS.border0}`,
  minHeight: "32px",
};

export const rowLabelStyle: React.CSSProperties = {
  fontFamily: DS.fontSans,
  fontSize: "11px",
  color: DS.text2,
  fontWeight: 400,
};

export const rowValueStyle: React.CSSProperties = {
  fontFamily: DS.fontMono,
  fontSize: "11px",
  color: DS.text1,
  fontWeight: 500,
};
