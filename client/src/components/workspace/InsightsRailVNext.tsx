/**
 * InsightsRailVNext.tsx
 * 映射来源: components/workspace/insights-panel.tsx
 *
 * Insights Rail — Supporting Intelligence
 * 壳层状态: props-first，四区段结构
 * Manus 接线入口:
 *   nowItems      — NOW: 正向信号（CheckCircle/Zap等）
 *   monitorItems  — MONITOR: 监控风险项（AlertCircle/Calendar等）
 *   relatedTickers — RELATED: 相关标的涨跌
 *   keyLevels     — KEY LEVELS: 价格关键位
 *   entity        — 当前标的代码
 */
import React from "react";
import { CheckCircle2, Zap, AlertCircle, Calendar, BarChart3, Target, TrendingUp, TrendingDown, ExternalLink, Shield } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type InsightItemType = "positive" | "warning" | "neutral" | "calendar";

export interface InsightItem {
  type: InsightItemType;
  title: string;
  detail: string;
}

export interface RelatedTicker {
  symbol: string;
  changePercent?: number;
  note?: string;
}

export interface KeyLevel {
  label: string;
  value: string;
  type: "entry" | "support" | "resistance" | "stop" | "target" | "current";
}

export interface QuickFact {
  label: string;
  value: string;
  sub?: string;
}

export interface NewsItem {
  headline: string;
  source?: string;
  sentiment?: "positive" | "negative" | "neutral";
}

export interface LiveQuote {
  price: number;
  changePercent?: number;
}

export interface InsightsRailVNextProps {
  entity?: string;
  /** NOW section — 当前正向/负向信号 */
  nowItems?: InsightItem[];
  /** MONITOR section — 需持续观察的风险点 */
  monitorItems?: InsightItem[];
  /** RELATED section — 相关标的 */
  relatedTickers?: RelatedTicker[];
  /** KEY LEVELS section — 价格关键位 */
  keyLevels?: KeyLevel[];
  /** QUICK FACTS — 关键数字 (WorkspaceOutputRefactor v1) */
  quickFacts?: QuickFact[];
  /** NEWS — 近期新闻标题 (WorkspaceOutputRefactor v1, graceful empty state) */
  news?: NewsItem[];
  /** Live quote — 实时价格 (WorkspaceOutputRefactor v1) */
  liveQuote?: LiveQuote | null;
  /** 底部完整情报按钮回调 */
  onViewFullIntelligence?: () => void;
}

// ── Config ────────────────────────────────────────────────────────────────────

const ITEM_TYPE_CFG: Record<InsightItemType, { Icon: React.FC<any>; iconColor: string; bg: string }> = {
  positive: { Icon: CheckCircle2, iconColor: "#10b981", bg: "rgba(16,185,129,0.07)" },
  warning:  { Icon: Zap,          iconColor: "#f59e0b", bg: "rgba(251,191,36,0.06)" },
  neutral:  { Icon: AlertCircle,  iconColor: "rgba(251,191,36,0.65)", bg: "rgba(255,255,255,0.02)" },
  calendar: { Icon: Calendar,     iconColor: "rgba(255,255,255,0.35)", bg: "rgba(255,255,255,0.02)" },
};

const KEY_LEVEL_COLOR: Record<KeyLevel["type"], string> = {
  entry:      "#10b981",
  support:    "rgba(255,255,255,0.72)",
  resistance: "rgba(255,255,255,0.72)",
  stop:       "#ef4444",
  target:     "#10b981",
  current:    "rgba(255,255,255,0.78)",
};

// ── Component ─────────────────────────────────────────────────────────────────

export function InsightsRailVNext({
  entity,
  nowItems = [],
  monitorItems = [],
  relatedTickers = [],
  keyLevels = [],
  quickFacts = [],
  news = [],
  liveQuote = null,
  onViewFullIntelligence,
}: InsightsRailVNextProps) {

  const isEmpty = nowItems.length === 0 && monitorItems.length === 0
    && relatedTickers.length === 0 && keyLevels.length === 0
    && quickFacts.length === 0 && news.length === 0 && !liveQuote;

  return (
    <aside style={{
      width: 300, flexShrink: 0, display: "flex", flexDirection: "column", height: "100%",
      background: "#0b0e13",
      borderLeft: "1px solid rgba(255,255,255,0.05)",
    }}>

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.04)", flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.50)" }}>决策情报</span>
        {entity && (
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.22)", fontFamily: "ui-monospace, monospace" }}>
            {entity}
          </span>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>

        {/* Empty state */}
        {isEmpty && (
          <div style={{ padding: "28px 14px", textAlign: "center" }}>
            <Shield size={18} color="rgba(255,255,255,0.07)" style={{ display: "block", margin: "0 auto 8px" }} />
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.18)", lineHeight: 1.6, margin: 0 }}>
              分析标的后<br />将显示决策情报
            </p>
          </div>
        )}

        {/* NOW */}
        {nowItems.length > 0 && (
          <InsightSection dot="#10b981" label="NOW" labelColor="rgba(16,185,129,0.72)">
            {nowItems.map((item, i) => <InsightCard key={i} item={item} />)}
          </InsightSection>
        )}

        {/* MONITOR */}
        {monitorItems.length > 0 && (
          <InsightSection dot="rgba(251,191,36,0.70)" label="MONITOR" labelColor="rgba(251,191,36,0.62)">
            {monitorItems.map((item, i) => <InsightCard key={i} item={item} />)}
          </InsightSection>
        )}

        {/* RELATED */}
        {relatedTickers.length > 0 && (
          <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <BarChart3 size={10} color="rgba(255,255,255,0.28)" />
              <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Related
              </span>
            </div>
            {relatedTickers.map((t, i) => {
              const isPositive = t.changePercent != null ? t.changePercent >= 0 : true;
              const changeStr = t.changePercent != null
                ? `${t.changePercent >= 0 ? "+" : ""}${t.changePercent.toFixed(1)}%`
                : t.note ?? "";
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "5px 6px", borderRadius: 4, cursor: "pointer",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{
                      width: 3, height: 12, borderRadius: 1.5,
                      background: isPositive ? "rgba(16,185,129,0.55)" : "rgba(239,68,68,0.45)",
                    }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.62)", fontFamily: "ui-monospace, monospace" }}>
                      {t.symbol}
                    </span>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 600, fontVariantNumeric: "tabular-nums",
                    color: isPositive ? "#10b981" : "#ef4444",
                  }}>
                    {changeStr}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* KEY LEVELS */}
        {keyLevels.length > 0 && (
          <div style={{ padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <Target size={10} color="rgba(255,255,255,0.28)" />
              <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Key Levels
              </span>
            </div>
            <div style={{
              padding: "10px 12px", borderRadius: 7,
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.04)",
              display: "flex", flexDirection: "column", gap: 8,
            }}>
              {keyLevels.map((level, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  ...(i === keyLevels.length - 1 && keyLevels.length > 3
                    ? { paddingTop: 7, borderTop: "1px solid rgba(255,255,255,0.04)" }
                    : {}),
                }}>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.38)" }}>{level.label}</span>
                  <span style={{
                    fontSize: 12, fontWeight: 700,
                    color: KEY_LEVEL_COLOR[level.type] ?? "rgba(255,255,255,0.70)",
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    {level.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* LIVE PRICE — always first if available */}
      {liveQuote && (
        <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.30)" }}>最新价</span>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.80)", fontVariantNumeric: "tabular-nums" }}>
              ${liveQuote.price.toFixed(2)}
            </span>
            {liveQuote.changePercent != null && (
              <span style={{ fontSize: 11, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: liveQuote.changePercent >= 0 ? "#10b981" : "#ef4444" }}>
                {liveQuote.changePercent >= 0 ? "+" : ""}{liveQuote.changePercent.toFixed(2)}%
              </span>
            )}
          </div>
        </div>
      )}

      {/* QUICK FACTS */}
      {quickFacts.length > 0 && (
        <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.28)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 7 }}>
            Quick Facts
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {quickFacts.map((fact, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 5 }}>
                <div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.30)", marginBottom: 1 }}>{fact.label}</div>
                  {fact.sub && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.20)" }}>{fact.sub}</div>}
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.70)", fontVariantNumeric: "tabular-nums" }}>{fact.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* NEWS — graceful empty state if no data */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.28)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 7 }}>
          News
        </div>
        {news.length === 0 ? (
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.16)", textAlign: "center", padding: "8px 0", fontStyle: "italic" }}>
            暂无相关新闻
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {news.map((item, i) => (
              <div key={i} title={item.headline} style={{ padding: "7px 9px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 5, cursor: "default" }}>
                <div style={{
                  fontSize: 11, color: "rgba(255,255,255,0.85)", lineHeight: 1.5,
                  borderLeft: `2px solid ${item.sentiment === "positive" ? "rgba(16,185,129,0.60)" : item.sentiment === "negative" ? "rgba(239,68,68,0.55)" : "rgba(255,255,255,0.20)"}`,
                  paddingLeft: 7,
                  display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
                }}>
                  {item.headline}
                </div>
                {item.source && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", marginTop: 3, paddingLeft: 9 }}>{item.source}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

            {/* Footer */}
      <div style={{ padding: "8px 12px", borderTop: "1px solid rgba(255,255,255,0.04)", flexShrink: 0 }}>
        <button
          onClick={onViewFullIntelligence}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            padding: "8px", borderRadius: 6,
            background: "none", border: "1px solid rgba(255,255,255,0.05)",
            cursor: "pointer", color: "rgba(255,255,255,0.30)", fontSize: 11,
          }}
        >
          完整情报 <ExternalLink size={10} />
        </button>
      </div>
    </aside>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function InsightSection({ dot, label, labelColor, children }: {
  dot: string; label: string; labelColor: string; children: React.ReactNode;
}) {
  return (
    <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: dot }} />
        <span style={{ fontSize: 9, fontWeight: 700, color: labelColor, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {label}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {children}
      </div>
    </div>
  );
}

function InsightCard({ item }: { item: InsightItem }) {
  const cfg = ITEM_TYPE_CFG[item.type] ?? ITEM_TYPE_CFG.neutral;
  const { Icon } = cfg;
  const fullText = [item.title, item.detail].filter(Boolean).join(" — ");
  const [expanded, setExpanded] = React.useState(false);
  return (
    <div
      title={expanded ? undefined : fullText}
      onClick={() => setExpanded(e => !e)}
      style={{
        display: "flex", gap: 8, padding: "8px 10px", borderRadius: 7,
        background: cfg.bg, cursor: "pointer",
        transition: "background 0.15s",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
      onMouseLeave={e => (e.currentTarget.style.background = cfg.bg)}
    >
      <Icon size={12} color={cfg.iconColor} style={{ marginTop: 2, flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.90)", lineHeight: 1.5,
          ...(expanded ? {} : {
            display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
          }),
        }}>
          {item.title}
        </div>
        {item.detail && (
          <div style={{
            fontSize: 10, color: "rgba(255,255,255,0.68)", marginTop: 3, lineHeight: 1.55,
            ...(expanded ? {} : {
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
            }),
          }}>
            {item.detail}
          </div>
        )}
        {!expanded && (item.title?.length ?? 0) > 60 && (
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.28)", marginTop: 2 }}>点击展开</div>
        )}
      </div>
    </div>
  );
}
