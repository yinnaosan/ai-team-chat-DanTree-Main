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
  Loader2, Send, Sparkles, User, ArrowRight, MoreHorizontal,
  CheckCircle2, Zap, AlertCircle, Calendar, BarChart3, Target,
  ExternalLink, Shield,
} from "lucide-react";
import { SessionRail, type SessionItem } from "@/components/SessionRail";
import { DecisionHeader } from "@/components/DecisionHeader";
import { DecisionSpine } from "@/components/DecisionSpine";
import { MarketAlertManager } from "@/components/MarketStatus";
import { useSessionManager } from "@/hooks/useSessionManager";
import { useDiscussion } from "@/hooks/useDiscussion";


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

function DiscussionPanel({
  entity, messages, isStreaming, input, onInputChange, onSend,
  // Fix B: accept scroll refs from useDiscussion hook instead of managing internally
  scrollContainerRef, bottomRef, onScroll,
}: {
  entity?: string;
  messages: DiscussionMsg[];
  isStreaming: boolean;
  input: string;
  onInputChange: (v: string) => void;
  onSend: () => void;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  bottomRef?: React.RefObject<HTMLDivElement | null>;
  onScroll?: () => void;
}) {
  // Fix B: scroll behavior is now managed by useDiscussion hook via refs

  return (
    <div style={{
      width: 340, flexShrink: 0, height: "100%",
      display: "flex", flexDirection: "column",
      background: "linear-gradient(180deg, #11151b 0%, #0d1016 100%)",
      borderLeft: "1px solid rgba(255,255,255,0.04)",
    }}>

      {/* Header — 克制，只标识功能区 */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 18px 10px",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Sparkles size={12} color="rgba(16,185,129,0.60)" />
          <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.55)", letterSpacing: "0.02em" }}>
            Discussion
          </span>
          {entity && (
            <span style={{
              fontSize: 10, color: "rgba(255,255,255,0.20)",
              fontFamily: "ui-monospace, monospace", marginLeft: 2,
            }}>
              · {entity}
            </span>
          )}
        </div>
        <button style={{ background: "none", border: "none", cursor: "pointer", padding: 3, borderRadius: 4, lineHeight: 1 }}>
          <MoreHorizontal size={14} color="rgba(255,255,255,0.16)" />
        </button>
      </div>

      {/* Message stream */}
      {/* Fix B: bind scrollContainerRef and onScroll for useDiscussion scroll tracking */}
      <div ref={scrollContainerRef} onScroll={onScroll} style={{ flex: 1, overflowY: "auto" }}>
        {messages.length === 0 && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", height: "100%", padding: "24px",
            gap: 10,
          }}>
            <Sparkles size={24} color="rgba(16,185,129,0.15)" />
            <p style={{
              fontSize: 12, color: "rgba(255,255,255,0.18)",
              textAlign: "center", lineHeight: 1.7, margin: 0,
            }}>
              {entity
                ? `开始讨论 ${entity} 的 Thesis、Timing 或 Risk`
                : "输入标的开始分析，或继续已有会话"}
            </p>
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
                  padding: "14px 18px",
                  borderLeft: isLatest
                    ? "2px solid rgba(16,185,129,0.28)"
                    : "2px solid transparent",
                }}
              >
                {/* Role + timestamp */}
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                    background: isUser
                      ? "rgba(255,255,255,0.05)"
                      : "rgba(16,185,129,0.10)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {isUser
                      ? <User size={10} color="rgba(255,255,255,0.35)" />
                      : <Sparkles size={10} color="rgba(16,185,129,0.65)" />}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 500, color: "rgba(255,255,255,0.38)" }}>
                    {isUser ? "你" : "助手"}
                  </span>
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.16)" }}>
                    {m.timestamp}
                  </span>
                </div>

                {/* Body */}
                <div style={{ paddingLeft: 27 }}>
                  <p style={{
                    fontSize: 13, lineHeight: 1.78,
                    color: isUser ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.62)",
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
                          background: "rgba(255,255,255,0.025)",
                          border: "1px solid rgba(255,255,255,0.04)",
                        }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(16,185,129,0.50)", marginTop: 2, flexShrink: 0 }}>
                            {i + 1}.
                          </span>
                          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.50)", lineHeight: 1.65 }}>
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
                      background: "rgba(16,185,129,0.04)",
                      border: "1px solid rgba(16,185,129,0.10)",
                    }}>
                      <ArrowRight size={10} color="rgba(16,185,129,0.45)" style={{ marginTop: 2, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: "rgba(16,185,129,0.55)", lineHeight: 1.6 }}>
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
                <div style={{ width: 20, height: 20, borderRadius: 5, background: "rgba(16,185,129,0.10)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Sparkles size={10} color="rgba(16,185,129,0.65)" />
                </div>
                <Loader2 size={11} color="rgba(255,255,255,0.20)" className="animate-spin" />
              </div>
            </div>
          )}
          {/* Fix B: bottomRef from useDiscussion hook for auto-scroll */}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input — 呼吸感、清晰边界 */}
      <div style={{ padding: "10px 14px 14px", flexShrink: 0 }}>
        <div style={{
          position: "relative", borderRadius: 10,
          background: "rgba(255,255,255,0.025)",
          border: "1px solid rgba(255,255,255,0.07)",
          transition: "border-color 0.15s",
        }}>
          <textarea
            value={input}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
            placeholder="讨论 Thesis、Timing 或 Risk..."
            rows={1}
            style={{
              width: "100%", background: "transparent",
              border: "none", outline: "none",
              padding: "12px 46px 12px 14px",
              fontSize: 13, color: "rgba(255,255,255,0.80)",
              resize: "none", lineHeight: 1.6,
              fontFamily: "inherit", boxSizing: "border-box",
            }}
          />
          <button
            onClick={onSend}
            disabled={!input.trim() || isStreaming}
            style={{
              position: "absolute", right: 10, bottom: 9,
              width: 28, height: 28, borderRadius: 7, border: "none",
              background: input.trim() ? "rgba(16,185,129,0.88)" : "rgba(255,255,255,0.04)",
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
  entryZone?: string;
  support?: number;
  resistance?: number;
  stopLoss?: number;
  targetPrice?: number;
}

function InsightsRail({
  entity, quoteData, nowItems = [], monitorItems = [], relatedTickers = [],
}: {
  entity?: string;
  quoteData?: QuoteData;
  nowItems?: InsightItem[];
  monitorItems?: InsightItem[];
  relatedTickers?: RelatedTicker[];
}) {
  return (
    <aside style={{
      width: 256, flexShrink: 0, display: "flex", flexDirection: "column", height: "100%",
      background: "#0b0e13",
      borderLeft: "1px solid rgba(255,255,255,0.05)",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.50)" }}>
          决策情报
        </span>
        {entity && (
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.22)", fontFamily: "ui-monospace, monospace" }}>
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
          <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <BarChart3 size={10} color="rgba(255,255,255,0.28)" />
              <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Related
              </span>
            </div>
            {relatedTickers.map((t, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "5px 6px", borderRadius: 4, cursor: "pointer",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{
                    width: 3, height: 12, borderRadius: 1.5,
                    background: t.positive ? "rgba(16,185,129,0.55)" : "rgba(239,68,68,0.45)",
                  }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.60)", fontFamily: "ui-monospace, monospace" }}>
                    {t.symbol}
                  </span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: t.positive ? "#10b981" : "#ef4444", fontVariantNumeric: "tabular-nums" }}>
                  {t.change}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── KEY LEVELS ── */}
        {quoteData && (
          <div style={{ padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <Target size={10} color="rgba(255,255,255,0.28)" />
              <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Key Levels
              </span>
            </div>
            <div style={{
              padding: "10px 12px", borderRadius: 8,
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.04)",
              display: "flex", flexDirection: "column", gap: 8,
            }}>
              {[
                { label: "当前价",  value: quoteData.price != null ? `$${quoteData.price.toFixed(0)}` : null, color: "rgba(255,255,255,0.78)" },
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
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{row.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: row.color, fontVariantNumeric: "tabular-nums" }}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state when no data */}
        {nowItems.length === 0 && monitorItems.length === 0 && !quoteData && (
          <div style={{ padding: "28px 14px", textAlign: "center" }}>
            <Shield size={18} color="rgba(255,255,255,0.07)" style={{ margin: "0 auto 8px", display: "block" }} />
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.16)", lineHeight: 1.6, margin: 0 }}>
              分析标的后<br />将显示决策情报
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: "8px 12px", borderTop: "1px solid rgba(255,255,255,0.04)", flexShrink: 0 }}>
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
    <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: dot, flexShrink: 0 }} />
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
  return (
    <div style={{
      display: "flex", gap: 8, padding: "8px 10px",
      borderRadius: 7, background: item.bg,
    }}>
      <item.icon size={12} color={item.iconColor} style={{ marginTop: 2, flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.75)", lineHeight: 1.4 }}>
          {item.text}
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.32)", marginTop: 2 }}>
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

  // ── Session System v1 ──
  const session = useSessionManager(isAuthenticated);
  const activeConvId = session.activeSessionId;

  // ── Discussion Core v1 ──
  const discussion = useDiscussion(activeConvId);
  const { input, setInput, sending, isTyping, visibleMessages, lastAssistantMessage } = discussion;
  const convMessages = discussion.messages;

  const [currentTicker, setCurrentTicker] = useState("");
  const prevTickerRef = useRef("");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/");
  }, [authLoading, isAuthenticated, navigate]);

  const { data: quoteData } = trpc.market.getQuote.useQuery(
    { symbol: currentTicker }, { enabled: !!currentTicker, refetchInterval: 60000 }
  );

  // Auto-select latest session on first load
  // Fix C: add session.autoSelectLatest to dependency array
  useEffect(() => {
    session.autoSelectLatest();
  }, [session.sessions.length, session.autoSelectLatest]);

  useEffect(() => {
    const t = extractTicker(convMessages);
    if (t && t !== prevTickerRef.current) { prevTickerRef.current = t; setCurrentTicker(t); }
  }, [convMessages]);

  // Fix A: route exclusively through discussion.sendMessage()
  // Removed stale paths: setSending / setIsTyping / setConvMessages / submitMutation
  const handleSubmit = useCallback((text?: string) => {
    discussion.sendMessage(text);
  }, [discussion]);

  // lastAssistantMessage provided by useDiscussion hook

  const answerObject = lastAssistantMessage?.metadata?.answerObject;
  const stance = stanceFrom(answerObject?.verdict);

  // Session items — 使用 grouped 排序（支持拖拽后的 displayOrder）
  const toSessionItem = useCallback((c: typeof session.sessions[0]) => {
    // 从 title 中提取股票代码（如 AAPL、BTC、600690.SS）
    const rawTitle = c.title ?? `对话 #${c.id}`;
    // 尝试匹配带后缀的代码（如 600690.SS）或纯大写代码（如 AAPL）
    const tkMatch = rawTitle.match(/\b(\d{5,6}\.[A-Z]{2}|[A-Z]{1,5}(?:\.[A-Z]{1,2})?|BTC|ETH)\b/);
    const tk = tkMatch?.[0];
    // 推断市场标签
    let market: string | undefined;
    if (tk) {
      if (tk.endsWith(".SS")) market = "SH";
      else if (tk.endsWith(".SZ")) market = "SZ";
      else if (tk.endsWith(".HK")) market = "HK";
      else if (tk.endsWith(".T")) market = "JP";
      else if (tk.endsWith(".KS")) market = "KR";
      else if (tk === "BTC" || tk === "ETH") market = "CRYPTO";
      else if (/^[A-Z]{1,5}$/.test(tk)) market = "US";
    }
    // 标题去掉代码部分，只保留公司名（去掉 " · CODE"、" CODE"、"·CODE" 后缀）
    const displayTitle = tk
      ? rawTitle.replace(new RegExp(`\\s*[·•・\\-]?\\s*${tk.replace(/\./g, '\\.')}\\s*$`), "").trim() || rawTitle
      : rawTitle;
    const t = rawTitle.toLowerCase();
    const type: SessionItem["type"] =
      t.includes("risk") || t.includes("风险") ? "risk" :
      t.includes("timing") || t.includes("时机") ? "timing" :
      t.includes("thesis") || t.includes("论点") ? "thesis" : "research";
    const dir = stance === "unavailable" ? "neutral" : stance;
    return {
      id: String(c.id), entity: tk ?? "—",
      title: displayTitle,
      market,
      type, time: timeAgo(new Date(c.lastMessageAt)),
      pinned: c.isPinned, active: c.id === activeConvId,
      direction: dir as "bullish" | "bearish" | "neutral",
    };
  }, [activeConvId, stance]);

  const sessionItems = useMemo<SessionItem[]>(() => {
    const { pinned, recent } = session.grouped;
    return [
      ...pinned.map(toSessionItem),
      ...recent.map(toSessionItem),
    ];
  }, [session.grouped, toSessionItem]);



  // Insights data — NOW items from bull_case, MONITOR from risks
  const nowItems = useMemo<InsightItem[]>(() => {
    if (!answerObject) return [];
    const items: InsightItem[] = [];
    if (answerObject.bull_case?.[0]) items.push({
      icon: CheckCircle2, text: answerObject.bull_case[0],
      sub: "多头证据", bg: "rgba(16,185,129,0.07)", iconColor: "#10b981",
    });
    if (answerObject.reasoning?.[0]) items.push({
      icon: Zap, text: answerObject.reasoning[0],
      sub: "推理依据", bg: "rgba(251,191,36,0.06)", iconColor: "#f59e0b",
    });
    return items;
  }, [answerObject]);

  const monitorItems = useMemo<InsightItem[]>(() =>
    (answerObject?.risks ?? []).slice(0, 2).map(r => ({
      icon: AlertCircle, text: r.description,
      sub: `风险 · ${r.magnitude ?? "medium"}`,
      bg: "rgba(255,255,255,0.02)", iconColor: "rgba(251,191,36,0.60)",
    })), [answerObject]);

  const mappedQuote = useMemo<QuoteData | undefined>(() => {
    if (!quoteData) return undefined;
    return { price: quoteData.price as number | undefined, changePercent: quoteData.changePercent as number | undefined };
  }, [quoteData]);

  // Auth guards
  if (authLoading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#08090d" }}>
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
        overflow: "hidden", background: "#08090d",
        fontFamily: "'SF Pro Display', 'Helvetica Neue', -apple-system, system-ui, sans-serif",
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
          lastUpdated={lastAssistantMessage ? fmtTime(lastAssistantMessage.createdAt) : undefined}
          onEntitySearch={() => {
            const ticker = prompt("输入股票代码（如 AAPL、NVDA）:");
            if (ticker?.trim()) {
              const t = ticker.trim().toUpperCase();
              setCurrentTicker(t);
              handleSubmit(`深度分析 ${t}`);
            }
          }}
        />

        {/* ── 4-column workspace ── */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* Col 1: Session Rail */}
          <SessionRail
            sessions={sessionItems}
            activeSessionId={activeConvId != null ? String(activeConvId) : undefined}
            onSelectSession={(id) => { session.selectSession(Number(id)); setInput(""); }}
            onNewSession={() => session.createSession()}
            activeEntity={currentTicker || undefined}
            onReorder={(orderedIds) => session.reorderSessions(orderedIds.map(Number))}
            actions={{
              onPin: (id, pinned) => session.pinSession(Number(id), pinned),
              onFavorite: (id, favorited) => session.favoriteSession(Number(id), favorited),
              onRename: (id, title) => session.renameSession(Number(id), title),
              onDelete: (id) => session.deleteSession(Number(id)),
            }}
          />

          {/* Col 2: Main Decision Canvas */}
          <main style={{
            flex: 1, minWidth: 0, maxWidth: 680, height: "100%",
            overflowY: "auto", background: "#0c0f14",
          }}>
            <div style={{ padding: "16px 22px 24px" }}>
              <DecisionSpine
                thesis={answerObject ? {
                  coreThesis: answerObject.verdict,
                  criticalDriver: answerObject.bull_case?.[0] ?? answerObject.reasoning?.[0],
                  failureCondition: answerObject.risks?.[0]?.description,
                  confidenceScore: answerObject.confidence === "high" ? 80 : answerObject.confidence === "medium" ? 55 : 30,
                  evidenceState: answerObject.confidence === "high" ? "strong" : answerObject.confidence === "medium" ? "moderate" : "weak",
                } : undefined}
                timing={{
                  actionBias: (() => {
                    const v = answerObject?.verdict?.toLowerCase() ?? "";
                    if (v.match(/buy|bull|增持|看多/)) return "BUY";
                    if (v.match(/sell|bear|减持|看空/)) return "AVOID";
                    if (v.match(/hold|neutral/)) return "HOLD";
                    return answerObject ? "HOLD" : "NONE";
                  })(),
                  readinessState: answerObject ? "ready" : "not_ready",
                  entryQuality: answerObject?.confidence === "high" ? "high" : answerObject?.confidence === "medium" ? "moderate" : "unavailable",
                  timingRisk: "medium",
                  confirmationState: answerObject ? "partial" : "unconfirmed",
                }}
                isLoading={sending || isTyping}
              />
            </div>
          </main>

          {/* Col 3: Discussion — 高级副驾驶推理区 */}
          {/* Fix B: pass scroll refs from useDiscussion hook */}
          <DiscussionPanel
            entity={currentTicker || undefined}
            messages={discussion.visibleMessages.map(m => ({
              id: String(m.id),
              role: m.role as "user" | "assistant",
              content: m.content,
              timestamp: fmtTime(m.createdAt),
              keyPoints: m.metadata?.answerObject?.key_points,
              suggestedNext: m.metadata?.answerObject?.suggested_next,
            }))}
            isStreaming={sending || isTyping}
            input={input}
            onInputChange={setInput}
            onSend={() => handleSubmit()}
            scrollContainerRef={discussion.scrollContainerRef}
            bottomRef={discussion.bottomRef}
            onScroll={discussion.handleScroll}
          />

          {/* Col 4: Insights Rail — NOW/MONITOR/RELATED/KEY LEVELS */}
          <InsightsRail
            entity={currentTicker || undefined}
            quoteData={mappedQuote}
            nowItems={nowItems}
            monitorItems={monitorItems}
          />

        </div>
      </div>
    </>
  );
}
