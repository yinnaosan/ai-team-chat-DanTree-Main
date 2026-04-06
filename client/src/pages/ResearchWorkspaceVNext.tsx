/**
 * ResearchWorkspace.tsx — DanTree Workspace 最终视觉母版 v1
 *
 * 四列布局（decision-first）：
 *   Col 1 (208px)  SessionRail        — Research session control
 *   Col 2 (≤680px) Decision Canvas    — Thesis / Timing / Risk / History（主区）
 *   Col 3 (340px)  Discussion         — 高级副驾驶推理区
 *   Col 4 (256px)  Insights Rail      — NOW / MONITOR / RELATED / KEY LEVELS
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import {
  Loader2, Send, Sparkles, User, Users, ArrowRight, MoreHorizontal,
  CheckCircle2, Zap, AlertCircle, Calendar, BarChart3, Target,
  ExternalLink, Shield,
} from "lucide-react";
import { SessionRail, type SessionItem } from "@/components/SessionRail";
import { DecisionHeader } from "@/components/DecisionHeader";
import { DecisionSpine } from "@/components/DecisionSpine";
import { MarketAlertManager } from "@/components/MarketStatus";
import { useWorkspaceViewModel } from "@/hooks/useWorkspaceViewModel";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import type { AlertItem } from "@/components/AlertBlock";
import type { HistoryEntry } from "@/components/HistoryBlock";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Msg {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: Date;
  metadata?: {
    answerObject?: {
      verdict: string;
      confidence: "high" | "medium" | "low";
      bull_case?: string[];
      reasoning?: string[];
      risks?: Array<{ description: string; magnitude?: string }>;
      key_points?: string[];
      suggested_next?: string;
    };
    evidenceScore?: number;
  } | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function timeAgo(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}d`;
}

function fmtTime(date: Date): string {
  const d = new Date(date);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function extractTicker(msgs: Msg[]): string {
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "user") {
      const m = msgs[i].content.match(/\b([A-Z]{1,5}|BTC|ETH)\b/);
      if (m) return m[1];
    }
  }
  return "";
}

function stanceFrom(verdict?: string): "bullish" | "bearish" | "neutral" | "unavailable" {
  const v = verdict?.toLowerCase() ?? "";
  if (v.match(/buy|bull|增持|看多/)) return "bullish";
  if (v.match(/sell|bear|减持|看空/)) return "bearish";
  if (v.match(/hold|neutral|中性/)) return "neutral";
  return "unavailable";
}

// ─────────────────────────────────────────────────────────────────────────────
// Col 3 — Discussion (高级副驾驶推理区)
// 对齐母版：有呼吸感、reasoning flow、不挤不空不廉价
// ─────────────────────────────────────────────────────────────────────────────

interface DiscussionMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  keyPoints?: string[];
  suggestedNext?: string;
}

// ── Dynamic quick prompts generator ──────────────────────────────────────────
function buildQuickPrompts(opts: {
  entity?: string;
  stance?: string | null;
  readinessState?: string | null;
  alertCount?: number;
  sessionTitle?: string;
}): string[] {
  const { entity, stance, readinessState, alertCount } = opts;
  const base = entity ? entity : "当前标的";

  // Tier 1: context-aware (entity + stance + readiness)
  if (entity && stance && stance !== "unavailable") {
    const stanceLabel = stance === "bullish" ? "看多" : stance === "bearish" ? "看空" : "中性";
    const prompts: string[] = [
      `为什么 ${base} 现在是${stanceLabel}？`,
      `${base} 最大的尾部风险是什么？`,
      readinessState === "ready" || readinessState === "conditional"
        ? `${base} 现在进场的关键确认条件是什么？`
        : `${base} 什么时候才算真正就绪？`,
      `哪个变化会推翻 ${base} 当前 Thesis？`,
      alertCount && alertCount > 0
        ? `${base} 当前告警意味着什么？该怎么应对？`
        : `${base} 下一步最该监控什么信号？`,
      `${base} 的 Timing 和 Thesis 之间有没有矛盾？`,
    ];
    return prompts;
  }

  // Tier 2: entity only
  if (entity) {
    return [
      `深度分析 ${base} 的核心 Thesis`,
      `${base} 现在的主要风险是什么？`,
      `${base} 的进场时机如何判断？`,
      `${base} 的关键监控指标有哪些？`,
      `${base} 与同行相比竞争优势如何？`,
      `${base} 当前估值是否合理？`,
    ];
  }

  // Tier 3: generic fallback
  return [
    "当前 Thesis 的核心逻辑是什么？",
    "最大的下行风险是什么？",
    "现在该不该动？",
    "Timing 的关键确认条件是什么？",
    "哪个变化会推翻当前判断？",
    "下一步最该监控什么？",
  ];
}

function DiscussionPanel({
  entity, sessionTitle, stance, readinessState, alertCount,
  messages, isStreaming, input, onInputChange, onSend, onQuickPrompt,
}: {
  entity?: string;
  sessionTitle?: string;
  stance?: string | null;
  readinessState?: string | null;
  alertCount?: number;
  messages: DiscussionMsg[];
  isStreaming: boolean;
  input: string;
  onInputChange: (v: string) => void;
  onSend: () => void;
  onQuickPrompt: (text: string) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [inputFocused, setInputFocused] = useState(false);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  // Dynamic quick prompts — memoized
  const quickPrompts = useMemo(() => buildQuickPrompts({ entity, stance, readinessState, alertCount, sessionTitle }),
    [entity, stance, readinessState, alertCount, sessionTitle]);

  // Stance label + color
  const stanceColor = stance === "bullish" ? "rgba(52,211,153,0.85)" : stance === "bearish" ? "rgba(248,113,113,0.85)" : "rgba(255,255,255,0.28)";
  const stanceLabel = stance === "bullish" ? "BULL" : stance === "bearish" ? "BEAR" : stance === "neutral" ? "NEUTRAL" : null;

  // Dynamic placeholder
  const placeholder = entity
    ? `讨论 ${entity} 的 Thesis、Timing 或 Risk...`
    : "输入标的开始分析，或继续已有会话";

  return (
    <div style={{
      flex: 1, minWidth: 0, height: "100%",
      display: "flex", flexDirection: "column",
      background: "rgba(5,7,12,0.99)",
      backdropFilter: "blur(24px)",
      WebkitBackdropFilter: "blur(24px)",
      borderLeft: "1px solid rgba(255,255,255,0.12)",
    }}>

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px 11px",
        borderBottom: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.025)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Sparkles size={11} color="rgba(52,211,153,0.55)" />
          <span style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.92)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            推理讨论
          </span>
          {entity && (
            <span style={{
              fontSize: 10, color: "rgba(255,255,255,0.42)",
              fontFamily: "'IBM Plex Mono', ui-monospace, monospace", marginLeft: 2,
              letterSpacing: "0.03em",
            }}>
              · {entity}
            </span>
          )}
          {stanceLabel && (
            <span style={{
              fontSize: 9, fontWeight: 700, color: stanceColor,
              fontFamily: "ui-monospace, monospace",
              background: stance === "bullish" ? "rgba(52,211,153,0.10)" : stance === "bearish" ? "rgba(248,113,113,0.10)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${stanceColor}`,
              borderRadius: 3, padding: "1px 5px", marginLeft: 4,
              letterSpacing: "0.04em",
            }}>
              {stanceLabel}
            </span>
          )}
        </div>
        <button style={{ background: "none", border: "none", cursor: "pointer", padding: 3, borderRadius: 4, lineHeight: 1 }}>
          <MoreHorizontal size={14} color="rgba(255,255,255,0.16)" />
        </button>
      </div>

      {/* Message stream */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {messages.length === 0 && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", height: "100%", padding: "24px",
            gap: 10,
          }}>
            <Sparkles size={24} color="rgba(52,211,153,0.32)" />
            <p style={{
              fontSize: 12, color: "rgba(255,255,255,0.40)",
              textAlign: "center", lineHeight: 1.7, margin: 0,
            }}>
              {entity
                ? `开始讨论 ${entity} 的 Thesis、Timing 或 Risk`
                : "输入标的开始分析，或继续已有会话"}
            </p>
            {/* Quick prompts — empty state */}
            <div style={{ marginTop: 16, width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {quickPrompts.map((p, i) => (
                <button
                  key={i}
                  onClick={() => onQuickPrompt(p)}
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 8, padding: "9px 11px",
                    cursor: "pointer", textAlign: "left",
                    fontSize: 11, color: "rgba(255,255,255,0.58)",
                    lineHeight: 1.55, transition: "all 0.15s",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(52,211,153,0.09)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(52,211,153,0.22)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(237,237,239,0.85)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.08)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.58)"; }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ padding: "8px 0 4px", display: "flex", flexDirection: "column" }}>
          {messages.map((m, idx) => {
            const isLatest = idx === messages.length - 1 && m.role === "assistant";
            const isUser = m.role === "user";

            return (
              <div
                key={m.id}
                style={{
                  padding: "11px 15px",
                  margin: "5px 10px",
                  borderRadius: 10,
                  background: isUser
                    ? "rgba(255,255,255,0.065)"
                    : "rgba(52,211,153,0.065)",
                  border: isUser
                    ? "1px solid rgba(255,255,255,0.12)"
                    : isLatest
                      ? "1px solid rgba(52,211,153,0.28)"
                      : "1px solid rgba(52,211,153,0.15)",
                  borderLeft: isLatest
                    ? "3px solid rgba(52,211,153,0.75)"
                    : isUser ? "3px solid rgba(255,255,255,0.18)" : "3px solid rgba(52,211,153,0.35)",
                  boxShadow: isLatest ? "0 2px 16px rgba(52,211,153,0.10)" : isUser ? "none" : "0 1px 8px rgba(52,211,153,0.04)",
                }}
              >
                {/* Role + timestamp */}
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                    background: isUser
                      ? "rgba(255,255,255,0.06)"
                      : "rgba(52,211,153,0.12)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {isUser
                      ? <User size={10} color="rgba(255,255,255,0.50)" />
                      : <Sparkles size={10} color="rgba(52,211,153,0.80)" />}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, color: isUser ? "rgba(255,255,255,0.55)" : "rgba(52,211,153,0.70)" }}>
                    {isUser ? "你" : "助手"}
                  </span>
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.22)" }}>
                    {m.timestamp}
                  </span>
                </div>

                {/* Body */}
                <div style={{ paddingLeft: 27 }}>
                  <p style={{
                    fontSize: 13, lineHeight: 1.80,
                    color: isUser ? "rgba(237,237,239,0.88)" : "rgba(237,237,239,0.78)",
                    margin: 0,
                  }}>
                    {m.content}
                  </p>

                  {/* Key points — reasoning evidence cards */}
                  {m.keyPoints && m.keyPoints.length > 0 && (
                    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                      {m.keyPoints.map((pt, i) => (
                        <div key={i} style={{
                          display: "flex", alignItems: "flex-start", gap: 9,
                          padding: "8px 10px", borderRadius: 6,
                          background: "rgba(255,255,255,0.035)",
                          border: "1px solid rgba(255,255,255,0.07)",
                        }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(52,211,153,0.65)", marginTop: 2, flexShrink: 0 }}>
                            {i + 1}.
                          </span>
                          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.62)", lineHeight: 1.65 }}>
                            {pt}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Suggested next */}
                  {m.suggestedNext && (
                    <div style={{
                      marginTop: 10,
                      display: "flex", alignItems: "flex-start", gap: 8,
                      padding: "8px 10px", borderRadius: 6,
                      background: "rgba(52,211,153,0.05)",
                      border: "1px solid rgba(52,211,153,0.14)",
                    }}>
                      <ArrowRight size={10} color="rgba(52,211,153,0.55)" style={{ marginTop: 2, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: "rgba(52,211,153,0.70)", lineHeight: 1.6 }}>
                        {m.suggestedNext}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {isStreaming && (
            <div style={{ padding: "14px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                <div style={{ width: 20, height: 20, borderRadius: 5, background: "rgba(52,211,153,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Sparkles size={10} color="rgba(52,211,153,0.80)" />
                </div>
                <Loader2 size={11} color="rgba(255,255,255,0.20)" className="animate-spin" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input — 执行稿精确参数：紧凑、清晰、无廉价感 */}
      <div style={{ padding: "6px 12px 8px", flexShrink: 0 }}>
        <div style={{
          position: "relative", borderRadius: 10,
          background: "rgba(255,255,255,0.04)",
          border: inputFocused ? "1px solid rgba(52,211,153,0.45)" : "1px solid rgba(255,255,255,0.10)",
          boxShadow: inputFocused ? "0 0 0 3px rgba(52,211,153,0.08), 0 0 12px rgba(52,211,153,0.12)" : "0 1px 4px rgba(0,0,0,0.30)",
          transition: "border-color 0.18s, box-shadow 0.18s",
        }}>
          <textarea
            value={input}
            onChange={e => onInputChange(e.target.value)}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
            placeholder={placeholder}
            rows={1}
            style={{
              width: "100%", background: "transparent",
              border: "none", outline: "none",
              padding: "10px 44px 10px 14px",
              fontSize: 13, color: "rgba(237,237,239,0.90)",
              resize: "none", lineHeight: 1.55,
              fontFamily: "'Inter', system-ui, sans-serif", boxSizing: "border-box",
            }}
          />
          <button
            onClick={onSend}
            disabled={!input.trim() || isStreaming}
            style={{
              position: "absolute", right: 9, bottom: 8,
              width: 28, height: 28, borderRadius: 8, border: "none",
              background: input.trim() ? "rgba(52,211,153,0.92)" : "rgba(255,255,255,0.06)",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.15s",
            }}
          >
            <Send size={12} color={input.trim() ? "#ffffff" : "rgba(255,255,255,0.15)"} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Col 4 — Insights Rail (supporting intelligence)
// 对齐母版：NOW / MONITOR / RELATED / KEY LEVELS
// ─────────────────────────────────────────────────────────────────────────────

interface InsightItem {
  icon: React.FC<any>;
  text: string;
  sub: string;
  bg: string;
  iconColor: string;
}

interface RelatedTicker {
  symbol: string;
  change?: string;
  positive?: boolean;
}

interface QuoteData {
  price?: number;
  changePercent?: number;
  high?: number;
  low?: number;
  pe?: number;
  pb?: number;
  entryZone?: string;
  support?: number;
  resistance?: number;
  stopLoss?: number;
  targetPrice?: number;
}
// ── Analyst data from real Finnhub recommendations ──────────────────────────────────────────
interface AnalystData {
  buy: number;
  hold: number;
  sell: number;
  total: number;
  period: string; // most recent period
  trend: "improving" | "deteriorating" | "stable"; // vs previous period
}

function InsightsRail({
  entity, quoteData, analystData, nowItems = [], monitorItems = [], relatedTickers = [],
}: {
  entity?: string;
  quoteData?: QuoteData;
  analystData?: AnalystData;
  nowItems?: InsightItem[];
  monitorItems?: InsightItem[];
  relatedTickers?: RelatedTicker[];
}) {
  return (
    <aside style={{
      width: 320, flexShrink: 0, display: "flex", flexDirection: "column", height: "100%",
      background: "rgba(3,4,8,1.00)",
      backdropFilter: "blur(24px)",
      WebkitBackdropFilter: "blur(24px)",
      borderLeft: "1px solid rgba(255,255,255,0.12)",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px 11px",
        borderBottom: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.025)",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.92)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          情报洞察
        </span>
        {entity && (
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", letterSpacing: "0.03em" }}>
            {entity}
          </span>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>

        {/* ── NOW section ── */}
        <Section
          dot="#10b981"
          label="NOW"
          labelColor="rgba(16,185,129,0.72)"
          show={nowItems.length > 0}
        >
          {nowItems.map((item, i) => (
            <InsightCard key={i} item={item} />
          ))}
        </Section>

        {/* ── MONITOR section ── */}
        <Section
          dot="rgba(251,191,36,0.70)"
          label="MONITOR"
          labelColor="rgba(251,191,36,0.62)"
          show={monitorItems.length > 0}
        >
          {monitorItems.map((item, i) => (
            <InsightCard key={i} item={item} />
          ))}
        </Section>

        {/* ── RELATED tickers ── */}
        {relatedTickers.length > 0 && (
          <div style={{ padding: "10px 14px 10px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <BarChart3 size={10} color="rgba(255,255,255,0.40)" />
            <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.60)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              相关标的
            </span>
            </div>
            {relatedTickers.map((t, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "5px 6px", borderRadius: 5, cursor: "pointer",
                transition: "background 0.12s",
              }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.03)"}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{
                    width: 3, height: 12, borderRadius: 1.5,
                    background: t.positive ? "rgba(52,211,153,0.75)" : "rgba(248,113,113,0.65)",
                    boxShadow: t.positive ? "0 0 5px rgba(52,211,153,0.35)" : "0 0 5px rgba(248,113,113,0.25)",
                  }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(237,237,239,0.88)", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", letterSpacing: "0.02em" }}>
                    {t.symbol}
                  </span>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: t.positive ? "#34d399" : "#f87171", fontVariantNumeric: "tabular-nums", fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}>
                  {t.change}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── ANALYST RATINGS — 真实市场数据 ── */}
        {analystData && analystData.total > 0 && (
          <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Users size={10} color="rgba(255,255,255,0.38)" />
                <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.60)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  分析师评级
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.28)", fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}>
                  {analystData.period}
                </span>
                {analystData.trend === "improving" && (
                  <span style={{ fontSize: 9, color: "#10b981", fontWeight: 700 }}>▲</span>
                )}
                {analystData.trend === "deteriorating" && (
                  <span style={{ fontSize: 9, color: "#ef4444", fontWeight: 700 }}>▼</span>
                )}
              </div>
            </div>
            {/* Distribution bar */}
            <div style={{ display: "flex", height: 5, borderRadius: 3, overflow: "hidden", marginBottom: 8, gap: 1 }}>
              {analystData.buy > 0 && (
                <div style={{ flex: analystData.buy, background: "rgba(16,185,129,0.70)", borderRadius: "3px 0 0 3px" }} />
              )}
              {analystData.hold > 0 && (
                <div style={{ flex: analystData.hold, background: "rgba(251,191,36,0.50)" }} />
              )}
              {analystData.sell > 0 && (
                <div style={{ flex: analystData.sell, background: "rgba(239,68,68,0.60)", borderRadius: "0 3px 3px 0" }} />
              )}
            </div>
            {/* Labels */}
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: 1, background: "rgba(16,185,129,0.70)" }} />
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.52)" }}>
                  Buy <span style={{ color: "#34d399", fontWeight: 700, fontVariantNumeric: "tabular-nums", fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}>{analystData.buy}</span>
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: 1, background: "rgba(251,191,36,0.50)" }} />
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.52)" }}>
                  Hold <span style={{ color: "#fbbf24", fontWeight: 700, fontVariantNumeric: "tabular-nums", fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}>{analystData.hold}</span>
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: 1, background: "rgba(239,68,68,0.60)" }} />
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.52)" }}>
                  Sell <span style={{ color: "#f87171", fontWeight: 700, fontVariantNumeric: "tabular-nums", fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}>{analystData.sell}</span>
                </span>
              </div>
            </div>
            {/* Consensus label */}
            <div style={{ marginTop: 8, padding: "6px 9px", borderRadius: 6, background: "rgba(255,255,255,0.045)", border: "1px solid rgba(255,255,255,0.09)" }}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.42)" }}>共识：</span>
              <span style={{
                fontSize: 10, fontWeight: 700,
                color: analystData.buy / analystData.total > 0.6 ? "#34d399" : analystData.sell / analystData.total > 0.4 ? "#f87171" : "rgba(251,191,36,0.90)",
              }}>
                {analystData.buy / analystData.total > 0.6 ? "Strong Buy" :
                  analystData.buy / analystData.total > 0.45 ? "Moderate Buy" :
                  analystData.sell / analystData.total > 0.4 ? "Sell" :
                  "Hold"}
              </span>
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.28)", marginLeft: 4, fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}>
                ({analystData.total} analysts)
              </span>
            </div>
          </div>
        )}
        {/* ── KEY LEVELS ── */}
        {quoteData && (
          <div style={{ padding: "12px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <Target size={10} color="rgba(255,255,255,0.42)" />
              <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.60)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                关键价位
              </span>
            </div>
            <div style={{
              padding: "10px 12px", borderRadius: 8,
              background: "rgba(255,255,255,0.035)",
              border: "1px solid rgba(255,255,255,0.10)",
              display: "flex", flexDirection: "column", gap: 8,
            }}>
              {[
                { label: "当前价",  value: quoteData.price != null ? `$${quoteData.price.toFixed(2)}` : null, color: "rgba(255,255,255,0.78)" },
                { label: "52W 高",  value: quoteData.high != null ? `$${quoteData.high.toFixed(2)}` : null, color: "rgba(255,255,255,0.50)" },
                { label: "52W 低",  value: quoteData.low != null ? `$${quoteData.low.toFixed(2)}` : null, color: "rgba(255,255,255,0.50)" },
                { label: "PE",       value: quoteData.pe != null ? quoteData.pe.toFixed(1) : null, color: "rgba(255,255,255,0.55)" },
                { label: "PB",       value: quoteData.pb != null ? quoteData.pb.toFixed(2) : null, color: "rgba(255,255,255,0.55)" },
                { label: "介入区",  value: quoteData.entryZone, color: "#10b981" },
                { label: "支撑",    value: quoteData.support != null ? `$${quoteData.support}` : null, color: "rgba(255,255,255,0.65)" },
                { label: "阻力",    value: quoteData.resistance != null ? `$${quoteData.resistance}` : null, color: "rgba(255,255,255,0.65)" },
                { label: "止损",    value: quoteData.stopLoss != null ? `$${quoteData.stopLoss}` : null, color: "#ef4444" },
                { label: "目标",    value: quoteData.targetPrice != null ? `$${quoteData.targetPrice}` : null, color: "#10b981" },
              ].filter(r => r.value).map((row, i, arr) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  ...(i === arr.length - 1 && arr.length > 4 ? { paddingTop: 7, borderTop: "1px solid rgba(255,255,255,0.04)" } : {}),
                }}>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.42)" }}>{row.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: row.color, fontVariantNumeric: "tabular-nums", fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state when no data */}
        {nowItems.length === 0 && monitorItems.length === 0 && !quoteData && (
          <div style={{ padding: "28px 14px", textAlign: "center" }}>
            <Shield size={18} color="rgba(255,255,255,0.10)" style={{ margin: "0 auto 8px", display: "block" }} />
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.22)", lineHeight: 1.6, margin: 0 }}>
              分析标的后<br />将显示决策情报
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: "8px 14px", borderTop: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
        <button style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
          padding: "8px", borderRadius: 6,
          background: "none", border: "1px solid rgba(255,255,255,0.05)",
          cursor: "pointer", color: "rgba(255,255,255,0.30)", fontSize: 11,
        }}>
          完整情报 <ExternalLink size={10} />
        </button>
      </div>
    </aside>
  );
}

function Section({ dot, label, labelColor, show, children }: {
  dot: string; label: string; labelColor: string; show: boolean; children: React.ReactNode;
}) {
  if (!show) return null;
  return (
    <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <div style={{ width: 5, height: 5, borderRadius: "50%", background: dot, flexShrink: 0, boxShadow: `0 0 8px ${dot}, 0 0 3px ${dot}` }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: labelColor, textTransform: "uppercase", letterSpacing: "0.10em" }}>
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
  return (
       <div style={{ display: "flex", gap: 8, padding: "8px 10px",
      borderRadius: 8, background: item.bg,
      border: "1px solid rgba(255,255,255,0.10)",
    }}>
      <item.icon size={12} color={item.iconColor} style={{ marginTop: 2, flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: "rgba(237,237,239,0.88)", lineHeight: 1.50 }}>
          {item.text}
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
          {item.sub}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ResearchWorkspacePage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  // ── Workspace Context (真实 session 管理) ──────────────────────────────────
  const { sessionList, currentSession, createSession, setSession } = useWorkspace();

  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [convMessages, setConvMessages] = useState<Msg[]>([]);

  // currentTicker 优先从 WorkspaceContext 取，fallback 到消息推导
  const wsEntity = currentSession?.focusKey ?? "";
  const [manualTicker, setManualTicker] = useState("");
  const currentTicker = wsEntity || manualTicker;

  const prevConvIdRef = useRef<number | null>(null);
  const prevTickerRef = useRef("");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/");
  }, [authLoading, isAuthenticated, navigate]);

  const { data: allConversations, refetch: refetchConvs } =
    trpc.chat.listConversations.useQuery(undefined, { enabled: isAuthenticated, refetchInterval: 30000 });

  const { data: quoteData } = trpc.market.getQuote.useQuery(
    { symbol: currentTicker }, { enabled: !!currentTicker, refetchInterval: 60000 }
  );
  // S3-B: 真实分析师评级数据（Finnhub recommendations）
  const { data: analystRecs } = trpc.market.getAnalystRecommendations.useQuery(
    { symbol: currentTicker },
    { enabled: !!currentTicker, refetchInterval: 300000, staleTime: 240000 } // 5分钟轮询
  );
  // S5-D: 真实 peer tickers（Finnhub /stock/peers）
  const { data: peerSymbols } = trpc.market.getPeers.useQuery(
    { symbol: currentTicker },
    { enabled: !!currentTicker, refetchInterval: 600000, staleTime: 540000 } // 10分钟轮询
  );
  // S5-D: 对 peer tickers 批量拿行情（最多 5 个）
  const peerSymbolsInput = useMemo(
    () => (peerSymbols && peerSymbols.length > 0 ? peerSymbols.slice(0, 5) : []),
    [peerSymbols]
  );
  const { data: peerQuotes } = trpc.market.getBatchQuotes.useQuery(
    { symbols: peerSymbolsInput },
    { enabled: peerSymbolsInput.length > 0, refetchInterval: 60000 }
  );

  const { data: rawConvMsgs } = trpc.chat.getConversationMessages.useQuery(
    { conversationId: activeConvId! }, { enabled: !!activeConvId }
  );

  const createConvMutation = trpc.chat.createConversation.useMutation({
    onSuccess: (conv) => { setActiveConvId(conv.id); refetchConvs(); },
  });

  const submitMutation = trpc.chat.submitTask.useMutation({
    onSuccess: (result) => {
      setSending(false); setIsTyping(false);
      if (result) {
        setConvMessages(prev => [...prev, {
          id: Date.now() + 1, role: "assistant" as const,
          content: typeof result === "string" ? result : (result as any).content ?? "",
          createdAt: new Date(), metadata: (result as any).metadata ?? null,
        }]);
        refetchConvs();
      }
    },
    onError: (err) => { setSending(false); setIsTyping(false); toast.error(`分析失败：${err.message}`); },
  });

  useEffect(() => {
    if (!rawConvMsgs) return;
    if (activeConvId === prevConvIdRef.current && rawConvMsgs.length === convMessages.length) return;
    prevConvIdRef.current = activeConvId;
    setConvMessages((rawConvMsgs as any[]).map(m => ({
      id: m.id, role: m.role as Msg["role"], content: m.content,
      createdAt: new Date(m.createdAt), metadata: m.metadata ?? null,
    })));
  }, [rawConvMsgs, activeConvId]);

  useEffect(() => {
    if (!activeConvId && allConversations?.length) {
      const sorted = [...allConversations].sort((a, b) =>
        new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
      );
      setActiveConvId(sorted[0].id);
    }
  }, [allConversations, activeConvId]);

  // Session 切换时同步 Discussion 上下文：清空 input
  const prevSessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    const sid = currentSession?.id ?? null;
    if (sid !== prevSessionIdRef.current) {
      prevSessionIdRef.current = sid;
      setInput(""); // 切换 session 时清空输入框，避免上一个 session 的未发送内容残留
    }
  }, [currentSession?.id]);

  // 从消息推导 ticker（仅在 workspace 无 entity 时生效）
  useEffect(() => {
    if (wsEntity) return; // workspace entity 优先
    const t = extractTicker(convMessages);
    if (t && t !== prevTickerRef.current) { prevTickerRef.current = t; setManualTicker(t); }
  }, [convMessages, wsEntity]);

  const handleSubmit = useCallback((text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;
    if (!text) setInput("");
    setSending(true); setIsTyping(true);
    setConvMessages(prev => [...prev, { id: Date.now(), role: "user" as const, content: msg, createdAt: new Date() }]);
    submitMutation.mutate({ title: msg, conversationId: activeConvId ?? undefined });
  }, [input, sending, activeConvId, submitMutation]);

  const lastAssistant = useMemo(() => {
    for (let i = convMessages.length - 1; i >= 0; i--)
      if (convMessages[i].role === "assistant") return convMessages[i];
    return null;
  }, [convMessages]);

  const answerObject = lastAssistant?.metadata?.answerObject;

  // ── useWorkspaceViewModel: 真实市场决策数据层 ─────────────────────────────
  const vm = useWorkspaceViewModel();
  const { headerViewModel: hvm, thesisViewModel: tvm, timingViewModel: tivm, alertViewModel: avm, historyViewModel: hivm, isLoading: vmLoading } = vm;

  // stance: 优先用 vm 真实数据，fallback 到 answerObject 推导
  const stance = (hvm.stance as "bullish" | "bearish" | "neutral" | "unavailable" | null) ?? stanceFrom(answerObject?.verdict);

  // ── Session items: 优先用 WorkspaceContext sessionList，fallback 到 allConversations ──
  const sessionItems = useMemo<SessionItem[]>(() => {
    // 优先：WorkspaceContext workspace sessions（真实研究会话）
    if (sessionList.length > 0) {
      return sessionList.map(s => {
        const type: SessionItem["type"] =
          s.sessionType === "entity" ? "thesis" :
          s.sessionType === "basket" ? "research" : "research";
        const dir = (hvm.stance as "bullish" | "bearish" | "neutral" | null) ?? "neutral";
        return {
          id: s.id,
          entity: s.focusKey,
          title: s.title,
          type,
          time: timeAgo(new Date(s.lastActiveAt)),
          pinned: s.pinned,
          active: s.id === currentSession?.id,
          direction: dir as "bullish" | "bearish" | "neutral",
          hasAlert: avm.alertCount > 0,
        };
      });
    }
    // Fallback：chat conversations（兼容旧数据）
    return [...(allConversations ?? [])].sort((a, b) =>
      new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    ).map(c => {
      const tk = c.title?.match(/\b([A-Z]{1,5}|BTC|ETH)\b/)?.[0];
      const t = (c.title ?? "").toLowerCase();
      const type: SessionItem["type"] =
        t.includes("risk") || t.includes("风险") ? "risk" :
        t.includes("timing") || t.includes("时机") ? "timing" :
        t.includes("thesis") || t.includes("论点") ? "thesis" : "research";
      const dir = stance === "unavailable" ? "neutral" : (stance ?? "neutral");
      return {
        id: String(c.id), entity: tk ?? "—",
        title: c.title ?? `对话 #${c.id}`,
        type, time: timeAgo(new Date(c.lastMessageAt)),
        pinned: c.isPinned, active: c.id === activeConvId,
        direction: dir as "bullish" | "bearish" | "neutral",
      };
    });
  }, [sessionList, allConversations, activeConvId, stance, currentSession?.id, hvm.stance, avm.alertCount]);

  // Discussion messages
  const discussionMsgs = useMemo<DiscussionMsg[]>(() =>
    convMessages.filter(m => m.role !== "system").slice(-40).map(m => ({
      id: String(m.id),
      role: m.role as "user" | "assistant",
      content: m.content,
      timestamp: fmtTime(m.createdAt),
      keyPoints: m.metadata?.answerObject?.key_points
        ?? (m.role === "assistant" ? m.metadata?.answerObject?.bull_case?.slice(0, 3) : undefined),
      suggestedNext: m.metadata?.answerObject?.suggested_next,
    })), [convMessages]);

  // S3-B: Insights 真实数据接入
  // ── AnalystData: 优先真实 Finnhub 数据，fallback undefined 静默降级 ──
  const analystData = useMemo<AnalystData | undefined>(() => {
    if (!analystRecs || analystRecs.length === 0) return undefined;
    // 最新一期数据
    const latest = analystRecs[analystRecs.length - 1];
    const prev = analystRecs.length >= 2 ? analystRecs[analystRecs.length - 2] : null;
    const total = (latest.buy ?? 0) + (latest.hold ?? 0) + (latest.sell ?? 0);
    if (total === 0) return undefined;
    // 趋势对比：与上期相比 buy 比例变化
    let trend: AnalystData["trend"] = "stable";
    if (prev) {
      const prevTotal = (prev.buy ?? 0) + (prev.hold ?? 0) + (prev.sell ?? 0);
      if (prevTotal > 0) {
        const buyRatioNow = (latest.buy ?? 0) / total;
        const buyRatioPrev = (prev.buy ?? 0) / prevTotal;
        if (buyRatioNow - buyRatioPrev > 0.05) trend = "improving";
        else if (buyRatioPrev - buyRatioNow > 0.05) trend = "deteriorating";
      }
    }
    return {
      buy: latest.buy ?? 0,
      hold: latest.hold ?? 0,
      sell: latest.sell ?? 0,
      total,
      period: latest.period ?? "",
      trend,
    };
  }, [analystRecs]);

  // ── NOW items: 优先真实 analyst 共识，fallback answerObject bull_case ──
  const nowItems = useMemo<InsightItem[]>(() => {
    const items: InsightItem[] = [];
    // 真实数据： analyst 共识强烈多头时展示
    if (analystData && analystData.total > 0) {
      const buyPct = Math.round((analystData.buy / analystData.total) * 100);
      if (buyPct >= 55) {
        items.push({
          icon: CheckCircle2,
          text: `${buyPct}% 分析师评级为 Buy，共识强烈多头`,
          sub: `共 ${analystData.total} 位分析师 · ${analystData.period}`,
          bg: "rgba(16,185,129,0.07)", iconColor: "#10b981",
        });
      }
    }
    // fallback: answerObject bull_case
    if (items.length === 0 && answerObject?.bull_case?.[0]) {
      items.push({
        icon: CheckCircle2, text: answerObject.bull_case[0],
        sub: "多头证据（AI推导）", bg: "rgba(16,185,129,0.07)", iconColor: "#10b981",
      });
    }
    if (answerObject?.reasoning?.[0]) {
      items.push({
        icon: Zap, text: answerObject.reasoning[0],
        sub: "推理依据", bg: "rgba(251,191,36,0.06)", iconColor: "#f59e0b",
      });
    }
    return items;
  }, [analystData, answerObject]);

  // ── MONITOR items: 优先真实 analyst 恶化趋势，fallback answerObject risks ──
  const monitorItems = useMemo<InsightItem[]>(() => {
    const items: InsightItem[] = [];
    // 真实数据： analyst 评级在恶化时展示警示
    if (analystData && analystData.trend === "deteriorating") {
      const sellPct = Math.round((analystData.sell / analystData.total) * 100);
      items.push({
        icon: AlertCircle,
        text: `分析师评级在恶化，Sell 占比 ${sellPct}%`,
        sub: `与上期相比多头比例下降`,
        bg: "rgba(239,68,68,0.05)", iconColor: "rgba(239,68,68,0.65)",
      });
    }
    // fallback: answerObject risks
    const riskItems = (answerObject?.risks ?? []).slice(0, items.length >= 1 ? 1 : 2).map(r => ({
      icon: AlertCircle, text: r.description,
      sub: `风险 · ${r.magnitude ?? "medium"}（AI推导）`,
      bg: "rgba(255,255,255,0.02)", iconColor: "rgba(251,191,36,0.60)",
    }));
    return [...items, ...riskItems];
  }, [analystData, answerObject]);

  // S5-D: RELATED tickers 展示数据（从 Finnhub peers + batchQuotes 推导）
  const relatedTickers = useMemo<RelatedTicker[]>(() => {
    if (!peerQuotes || peerQuotes.length === 0) return [];
    return peerQuotes
      .filter(q => q.price != null) // 只展示有有效行情的 peer
      .map(q => {
        const pct = q.changePercent ?? 0;
        const sign = pct >= 0 ? "+" : "";
        return {
          symbol: q.symbol,
          change: `${sign}${pct.toFixed(2)}%`,
          positive: pct >= 0,
        };
      });
  }, [peerQuotes]);

  // ── QuoteData: 扩充真实行情字段（high/low/pe/pb） ──
  const mappedQuote = useMemo<QuoteData | undefined>(() => {
    if (!quoteData) return undefined;
    return {
      price: quoteData.price as number | undefined,
      changePercent: quoteData.changePercent as number | undefined,
      high: (quoteData as any).high as number | undefined,
      low: (quoteData as any).low as number | undefined,
      pe: (quoteData as any).pe as number | undefined,
      pb: (quoteData as any).pb as number | undefined,
    };
  }, [quoteData]);

  // Auth guards
  if (authLoading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#070a0e" }}>
      <Loader2 className="animate-spin" style={{ width: 22, height: 22, color: "#10b981" }} />
    </div>
  );
  if (!isAuthenticated) return null;

  return (
    <>
      <MarketAlertManager markets={["us", "cn", "hk"]} />
      <div style={{
        height: "100vh", width: "100%",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
        background: "#040608",
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
      }}>
        {/* ── Global Top Bar / Decision Control Strip ── */}
        <DecisionHeader
          entity={currentTicker || undefined}
          stance={stance}
          confidence={
            answerObject?.confidence === "high" ? 80 :
            answerObject?.confidence === "medium" ? 55 :
            answerObject?.confidence === "low" ? 30 : null
          }
          gateState={answerObject ? "pass" : "fallback"}
          changeMarker="stable"
          lastUpdated={lastAssistant ? fmtTime(lastAssistant.createdAt) : undefined}
          onEntitySearch={() => {
            const ticker = prompt("输入股票代码（如 AAPL、NVDA）:");
            if (ticker?.trim()) {
              const t = ticker.trim().toUpperCase();
              setManualTicker(t);
              handleSubmit(`深度分析 ${t}`);
            }
          }}
        />

        {/* ── 4-column workspace ── */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden", minWidth: 1200 }}>

          {/* Col 1: Session Rail — 接入 WorkspaceContext 真实会话 */}
          <SessionRail
            sessions={sessionItems}
            activeSessionId={
              currentSession?.id ??
              (activeConvId != null ? String(activeConvId) : undefined)
            }
            onSelectSession={(id) => {
              // 优先切换 workspace session
              const wsSession = sessionList.find(s => s.id === id);
              if (wsSession) {
                setSession(wsSession);
              } else {
                setActiveConvId(Number(id));
                setConvMessages([]);
              }
            }}
            onNewSession={() => {
              // 创建新 workspace session（以当前 ticker 为 focusKey）
              const ticker = currentTicker || "AAPL";
              createSession({ title: `${ticker} 研究`, focusKey: ticker, sessionType: "entity" });
            }}
            activeEntity={currentTicker || undefined}
          />

          {/* Col 2: Main Decision Canvas */}
          <main style={{
            width: 560, flexShrink: 0, minWidth: 0, height: "100%",
            overflowY: "auto",
            background: "rgba(7,9,15,0.98)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            borderLeft: "1px solid rgba(255,255,255,0.12)",
            display: "flex", flexDirection: "column",
          }}>
            {/* Column Header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 18px 11px",
              borderBottom: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.025)",
              flexShrink: 0,
            }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.92)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                决策展板
              </span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.30)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                DECISION CANVAS
              </span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px 24px" }}>
              {/* DecisionSpine: 接入 useWorkspaceViewModel 真实数据 */}
              <DecisionSpine
                thesis={tvm.available ? {
                  coreThesis: tvm.stateSummaryText ?? tvm.stance ?? undefined,
                  criticalDriver: tvm.evidenceState ?? undefined,
                  failureCondition: tvm.fragility ?? undefined,
                  confidenceScore: tvm.fragilityScore != null ? Math.round((1 - tvm.fragilityScore) * 100) : null,
                  evidenceState: (tvm.evidenceState as "strong" | "moderate" | "weak" | "insufficient" | null) ?? "insufficient",
                  // V2 新字段：fragilityLevel 从 fragilityScore 推导
                  fragilityLevel: tvm.fragilityScore != null
                    ? (tvm.fragilityScore >= 0.7 ? "high" as const : tvm.fragilityScore >= 0.4 ? "medium" as const : "low" as const)
                    : undefined,
                } : (answerObject ? {
                  // fallback: answerObject 推导（首次分析前 vm 尚未就绪）
                  coreThesis: answerObject.verdict,
                  criticalDriver: answerObject.bull_case?.[0] ?? answerObject.reasoning?.[0],
                  failureCondition: answerObject.risks?.[0]?.description,
                  confidenceScore: answerObject.confidence === "high" ? 80 : answerObject.confidence === "medium" ? 55 : 30,
                  evidenceState: answerObject.confidence === "high" ? "strong" : answerObject.confidence === "medium" ? "moderate" : "weak",
                  fragilityLevel: answerObject.confidence === "low" ? "high" as const : answerObject.confidence === "medium" ? "medium" as const : "low" as const,
                } : undefined)}
                timing={tivm.available ? {
                  actionBias: (tivm.actionBias as "BUY" | "HOLD" | "WAIT" | "AVOID" | "NONE" | null) ?? "NONE",
                  readinessState: (tivm.readinessState as "ready" | "conditional" | "not_ready" | "blocked" | null) ?? "not_ready",
                  entryQuality: (tivm.confirmationState === "confirmed" ? "high" : tivm.confirmationState === "partial" ? "moderate" : "unavailable"),
                  timingRisk: (tivm.timingRisk as "low" | "medium" | "high" | "critical" | null) ?? "medium",
                  confirmationState: (tivm.confirmationState as "confirmed" | "partial" | "unconfirmed" | "conflicted" | null) ?? "unconfirmed",
                  timingSummary: tivm.timingSummary ?? undefined,
                  // S5-A: confirmationItems — 从 tivm 现有字段推导执行前确认清单
                  confirmationItems: (() => {
                    const items: Array<{ label: string; met: boolean }> = [];
                    const cs = tivm.confirmationState;
                    const rs = tivm.readinessState;
                    const tr = tivm.timingRisk;
                    const ab = tivm.actionBias;
                    items.push({ label: "就绪信号确认", met: rs === "ready" });
                    items.push({ label: "方向已确认", met: cs === "confirmed" || cs === "partial" });
                    items.push({ label: "时机风险可接受", met: tr === "low" || tr === "medium" });
                    if (ab === "WAIT" || ab === "AVOID") items.push({ label: "触发条件已满足", met: false });
                    return items.length > 0 ? items : undefined;
                  })(),
                  // S5-C: entryZone — 从 quoteData.price / low 推导参考观察带
                  entryZone: (() => {
                    const p = mappedQuote?.price;
                    const l = mappedQuote?.low;
                    if (p == null || l == null || l <= 0 || p <= 0) return undefined;
                    const lower = Math.min(p, l);
                    const upper = Math.max(p, l);
                    if (upper - lower < 0.01) return undefined;
                    return `参考带 $${lower.toFixed(2)}–$${upper.toFixed(2)}`;
                  })(),
                  // S5-A: nextCatalyst — 从 answerObject.suggested_next 提取
                  nextCatalyst: answerObject?.suggested_next ?? undefined,
                  // S5-A: catalystDays — 无可信日期来源，安全 fallback undefined
                  catalystDays: undefined,
                } : {
                  // fallback: answerObject 推导
                  actionBias: (() => {
                    const v = answerObject?.verdict?.toLowerCase() ?? "";
                    if (v.match(/buy|bull|增持|看多/)) return "BUY" as const;
                    if (v.match(/sell|bear|减持|看空/)) return "AVOID" as const;
                    if (v.match(/hold|neutral/)) return "HOLD" as const;
                    return "NONE" as const;
                  })(),
                  readinessState: answerObject ? "ready" as const : "not_ready" as const,
                  entryQuality: answerObject?.confidence === "high" ? "high" as const : answerObject?.confidence === "medium" ? "moderate" as const : "unavailable" as const,
                  timingRisk: "medium" as const,
                  confirmationState: answerObject ? "partial" as const : "unconfirmed" as const,
                  // S5-A fallback: confirmationItems — 从 answerObject 推导
                  confirmationItems: answerObject ? [
                    { label: "就绪信号确认", met: answerObject.confidence !== "low" },
                    { label: "方向已确认", met: answerObject.confidence === "high" },
                    { label: "风险已纳入考量", met: (answerObject.risks?.length ?? 0) > 0 },
                  ] : undefined,
                  // S5-C fallback: entryZone — 同样从 quoteData 推导
                  entryZone: (() => {
                    const p = mappedQuote?.price;
                    const l = mappedQuote?.low;
                    if (p == null || l == null || l <= 0 || p <= 0) return undefined;
                    const lower = Math.min(p, l);
                    const upper = Math.max(p, l);
                    if (upper - lower < 0.01) return undefined;
                    return `参考带 $${lower.toFixed(2)}–$${upper.toFixed(2)}`;
                  })(),
                  nextCatalyst: answerObject?.suggested_next ?? undefined,
                  catalystDays: undefined,
                }}
                alerts={avm.available ? (() => {
                  // ── S5-B: disciplineItems 推导 ────────────────────────────
                  // 从 keyAlerts 的 type + severity 组合生成行动约束
                  // 原则：行动约束，不是风险复述；无可信来源则 undefined
                  const DISCIPLINE_MAP: Record<string, Record<string, string>> = {
                    volatility:  { critical: "立即评估仓位规模，不得追高", high: "设置止损，避免追高", medium: "减少仓位至计划上限以内", low: "保持现有仓位，观察波动收敛" },
                    liquidity:   { critical: "暂停建仓，等待流动性恢复", high: "分批执行，避免大单冲击", medium: "控制单次交易规模", low: "正常执行，关注成交量" },
                    fundamental: { critical: "暂停操作，重新评估论点", high: "等待基本面确认信号", medium: "降低仓位权重", low: "继续监控基本面变化" },
                    sentiment:   { critical: "避免逆势操作，等待情绪稳定", high: "减少暴露，等待情绪反转确认", medium: "关注情绪指标变化", low: "正常持仓，监控情绪拐点" },
                    technical:   { critical: "关键支撑已破，考虑止损出场", high: "设置技术止损位", medium: "等待技术信号确认", low: "监控关键技术位" },
                    macro:       { critical: "宏观风险上升，降低总体暴露", high: "对冲宏观风险，减少方向性仓位", medium: "关注宏观数据发布节点", low: "维持现有配置，关注宏观变化" },
                  };
                  const SEVERITY_FALLBACK: Record<string, string> = {
                    critical: "立即评估仓位规模，准备止损预案",
                    high:     "设置明确止损位，控制仓位不超过计划上限",
                    medium:   "保持仓位纪律，等待更多确认信号",
                    low:      "继续监控，维持现有执行计划",
                  };
                  const keyAlerts = avm.keyAlerts ?? [];
                  const disciplineSet = new Set<string>();
                  const rawDisciplineItems: Array<{ label: string; checked: boolean; detail?: string }> = [];
                  // 主路径：从 keyAlerts type+severity 推导
                  for (const alert of keyAlerts) {
                    const typeKey = alert.type?.toLowerCase() ?? "";
                    const sevKey = alert.severity ?? "low";
                    const matched = DISCIPLINE_MAP[typeKey]?.[sevKey] ?? DISCIPLINE_MAP[typeKey]?.["medium"] ?? SEVERITY_FALLBACK[sevKey];
                    if (matched && !disciplineSet.has(matched)) {
                      disciplineSet.add(matched);
                      rawDisciplineItems.push({
                        label: matched,
                        checked: sevKey === "low" || sevKey === "medium",
                        detail: alert.message ?? undefined,
                      });
                    }
                  }
                  // 补充路径：highestSeverity 追加通用纪律项（避免重复）
                  if (rawDisciplineItems.length < 3 && avm.highestSeverity) {
                    const generalItems: Record<string, string[]> = {
                      critical: ["不得在当前风险状态下加仓", "准备好退出预案"],
                      high:     ["仓位不超过组合的 5%", "等待风险信号降级后再操作"],
                      medium:   ["保持耐心，不要因短期波动改变计划"],
                      low:      [],
                    };
                    for (const item of (generalItems[avm.highestSeverity] ?? [])) {
                      if (!disciplineSet.has(item) && rawDisciplineItems.length < 5) {
                        disciplineSet.add(item);
                        rawDisciplineItems.push({ label: item, checked: true });
                      }
                    }
                  }
                  const disciplineItems = rawDisciplineItems.length > 0 ? rawDisciplineItems : undefined;

                  // ── S5-B: probability 推导（粗粒度等级映射，非精确值）────
                  const SEVERITY_PROB: Record<string, number> = { critical: 82, high: 62, medium: 37, low: 17 };
                  const topSeverity = keyAlerts[0]?.severity ?? avm.highestSeverity ?? null;
                  const probability = topSeverity ? SEVERITY_PROB[topSeverity] : undefined;

                  // ── S5-B: overallRiskScore 保守聚合（上限 100）────────────
                  const SEVERITY_WEIGHT: Record<string, number> = { critical: 25, high: 15, medium: 8, low: 3 };
                  let overallRiskScore: number | undefined = undefined;
                  if (avm.alertCount > 0 && avm.highestSeverity) {
                    const baseScore = (SEVERITY_WEIGHT[avm.highestSeverity] ?? 5) * Math.min(avm.alertCount, 3);
                    overallRiskScore = Math.min(Math.round(baseScore), 100);
                  }

                  return {
                    alerts: keyAlerts.map(a => ({
                      alertType: a.type,
                      severity: (a.severity as "low" | "medium" | "high" | "critical"),
                      message: a.message,
                      reason: a.message,
                      action: a.severity === "critical" ? "立即减仓或退出" : a.severity === "high" ? "设置止损单" : "继续监控",
                      probability: topSeverity === a.severity ? probability : undefined,
                    } satisfies AlertItem)),
                    alertCount: avm.alertCount,
                    highestSeverity: (avm.highestSeverity as "low" | "medium" | "high" | "critical" | null) ?? null,
                    summaryText: avm.summaryText ?? undefined,
                    disciplineItems,
                    overallRiskScore,
                  };
                })() : undefined}
                history={hivm.available ? {
                  entity: currentTicker || undefined,
                  entries: [
                    ...(hivm.deltaSummary ? [{
                      time: hivm.lastSnapshotAt ? new Date(hivm.lastSnapshotAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "—",
                      changeMarker: (hivm.changeMarker as HistoryEntry["changeMarker"]) ?? "unknown",
                      stance: hvm.stance ?? "—",
                      actionBias: hvm.actionBias ?? "—",
                      alertSeverity: hvm.highestSeverity ?? null,
                      deltaSummary: hivm.deltaSummary,
                    } satisfies HistoryEntry] : []),
                  ],
                } : undefined}
                isLoading={vmLoading || sending || isTyping}
              />
            </div>
          </main>

          {/* Col 3: Discussion — 高级副驾驶推理区，接入 WorkspaceContext 上下文 */}
          <DiscussionPanel
            entity={currentTicker || undefined}
            sessionTitle={currentSession?.title ?? undefined}
            stance={hvm.stance ?? stance ?? null}
            readinessState={tivm.readinessState ?? null}
            alertCount={avm.alertCount ?? 0}
            messages={discussionMsgs}
            isStreaming={sending || isTyping}
            input={input}
            onInputChange={setInput}
            onSend={() => handleSubmit()}
            onQuickPrompt={(text) => {
              // 同步 session 上下文后发送
              setInput("");
              handleSubmit(text);
            }}
          />

          {/* Col 4: Insights Rail — NOW/MONITOR/RELATED/KEY LEVELS */}
          <InsightsRail
            entity={currentTicker || undefined}
            quoteData={mappedQuote}
            analystData={analystData}
            nowItems={nowItems}
            monitorItems={monitorItems}
            relatedTickers={relatedTickers}
          />

        </div>
      </div>
    </>
  );
}
