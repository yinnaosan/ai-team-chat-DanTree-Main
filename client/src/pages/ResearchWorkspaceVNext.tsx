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
  Loader2, Send, X,
} from "lucide-react";
import { SessionRail, type SessionItem } from "@/components/SessionRail";
import { DecisionHeader, type EntityCandidate } from "@/components/DecisionHeader";
import { DecisionSpine } from "@/components/DecisionSpine";
import { MarketAlertManager } from "@/components/MarketStatus";
import { useWorkspaceViewModel } from "@/hooks/useWorkspaceViewModel";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { ManusOrb } from "@/components/ManusOrb";
// [REMOVED] InlineChart/Streamdown — now used inside DiscussionPanelVNext/WorkspaceDiscussionRender
import { useDiscussion } from "@/hooks/useDiscussion";
import { useWorkspaceOutput } from "@/hooks/useWorkspaceOutput";
import { DiscussionPanelVNext } from "@/components/workspace/DiscussionPanelVNext";
import { InsightsRailVNext } from "@/components/workspace/InsightsRailVNext";

// [REMOVED] parseFollowupsVNext — replaced by workspaceOutputAdapter.parseFollowups
import type { AlertItem } from "@/components/AlertBlock";
import type { HistoryEntry } from "@/components/HistoryBlock";
import type { SnapshotEntry } from "@/hooks/useWorkspaceViewModel";
import { detectMarketType } from "@/lib/marketUtils";

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

/** Guard: only pass UUID-format session IDs to workspace mutations */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isWorkspaceSessionId(id: string): boolean { return UUID_RE.test(id); }

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


// ─────────────────────────────────────────────────────────────────────────────
// Col 4 — Insights Rail (supporting intelligence)
// 对齐母版：NOW / MONITOR / RELATED / KEY LEVELS
// ─────────────────────────────────────────────────────────────────────────────

// [REMOVED] InsightItem — replaced by workspaceOutput adapter types

interface RelatedTicker {
  symbol: string;
  change?: string;
  positive?: boolean;
}

interface QuoteData {
  price?: number;
  change?: number;
  changePercent?: number;
  high?: number;
  low?: number;
  volume?: number;
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

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ResearchWorkspacePage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  // ── Workspace Context (真实 session 管理) ──────────────────────────────────
  const { sessionList, currentSession, createSession, setSession } = useWorkspace();

  const [activeConvId, setActiveConvId] = useState<number | null>(null);

  // ── Discussion System v1 ───────────────────────────────────────────────────
  const discussion = useDiscussion(activeConvId, currentSession?.id ?? null);
  const { input, setInput, sending, isTyping, visibleMessages, lastAssistantMessage,
    scrollContainerRef: discussionScrollRef, bottomRef: discussionBottomRef,
    handleScroll: discussionHandleScroll, sendMessage: discussionSendMessage,
    attachFile: discussionAttachFile, pendingFileContext, isUploading: discussionUploading,
    clearFile: discussionClearFile } = discussion;

  // currentTicker 优先从 WorkspaceContext 取，fallback 到消息推导
  const wsEntity = currentSession?.focusKey ?? "";
  const [manualTicker, setManualTicker] = useState("");
  const [highlightSessionId, setHighlightSessionId] = useState<string | null>(null);

  // 从 focusKey 推断市场
  const inferMarketFromKey = (focusKey: string): string => {
    if (!focusKey) return "";
    if (focusKey.endsWith(".HK") || /^\d{4,5}\.HK$/.test(focusKey)) return "HK";
    if (focusKey.endsWith(".SS") || focusKey.endsWith(".SH")) return "SH";
    if (focusKey.endsWith(".SZ")) return "SZ";
    if (focusKey.endsWith(".T")) return "JP";
    if (focusKey.endsWith(".KS")) return "KR";
    if (["BTC","ETH","SOL","BNB","XRP","ADA","DOGE","AVAX"].includes(focusKey.toUpperCase())) return "CRYPTO";
    return "US"; // 默认美股
  };
  const currentTicker = wsEntity || manualTicker;
  // ── 顶部胶囊公司名：从当前 session title 解析，与 Session 卡片保持一致 ──
  const currentCnName = useMemo(() => {
    if (!currentSession?.title) return undefined;
    const KNOWN_MARKETS = new Set(["US", "HK", "SH", "SZ", "CN", "JP", "UK", "EU", "SG", "KR", "AU", "TW"]);
    const parts = currentSession.title.split(" · ");
    if (parts.length >= 3 && KNOWN_MARKETS.has(parts[parts.length - 1].trim())) {
      return parts.slice(0, parts.length - 2).join(" · ").trim() || undefined;
    }
    return undefined;
  }, [currentSession?.title]);

  const prevConvIdRef = useRef<number | null>(null);
  const prevTickerRef = useRef("");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/");
  }, [authLoading, isAuthenticated, navigate]);

  const { data: allConversations, refetch: refetchConvs } =
    trpc.chat.listConversations.useQuery(undefined, { enabled: isAuthenticated, refetchInterval: 30000 });

  // Removed: old convMessages/sending/isTyping state — now managed by useDiscussion

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

  const utils = trpc.useUtils();

  // Session 操作 mutations
  const pinMutation = trpc.workspace.togglePin.useMutation({
    onSuccess: () => utils.workspace.listSessions.invalidate(),
  });
  const favoriteMutation = trpc.workspace.toggleFavorite.useMutation({
    onSuccess: () => utils.workspace.listSessions.invalidate(),
  });
  const renameMutation = trpc.workspace.updateTitle.useMutation({
    onSuccess: () => utils.workspace.listSessions.invalidate(),
  });
  const legacyDeleteMutation = trpc.conversation.delete.useMutation({
    onSuccess: () => {
      utils.chat.listConversations.invalidate();
      utils.workspace.listSessions.invalidate();
    },
  });
  const deleteMutation = trpc.workspace.deleteSession.useMutation({
    onSuccess: (_, variables) => {
      utils.workspace.listSessions.invalidate();
      // 如果删除的是当前 session，切换到第一个可用 session
      if (currentSession?.id === variables.sessionId) {
        const remaining = sessionList.filter(s => s.id !== variables.sessionId);
        if (remaining.length > 0) {
          setSession(remaining[0]);
          setActiveConvId(remaining[0].conversationId ?? null);
        } else {
          // 无剩余 session，仅清空 activeConvId
          setActiveConvId(null);
        }
      }
    },
  });

  // Batch mutations
  const batchDeleteMutation = trpc.conversation.batchDelete.useMutation({
    onSuccess: () => {
      utils.workspace.listSessions.invalidate();
      // 如果当前 session 被批量删除，切换到第一个可用 session
      const remaining = sessionList.filter(s => s.id !== currentSession?.id);
      if (currentSession && !remaining.find(s => s.id === currentSession.id)) {
        if (remaining.length > 0) {
          setSession(remaining[0]);
          setActiveConvId(remaining[0].conversationId ?? null);
        } else {
          setActiveConvId(null);
        }
      }
    },
  });
  const batchPinMutation = trpc.conversation.batchPin.useMutation({
    onSuccess: () => utils.workspace.listSessions.invalidate(),
  });
  const batchFavoriteMutation = trpc.conversation.batchFavorite.useMutation({
    onSuccess: () => utils.workspace.listSessions.invalidate(),
  });

  const sessionActions = {
    onPin: (id: string, pinned: boolean) => { if (isWorkspaceSessionId(id)) pinMutation.mutate({ sessionId: id, pinned }); },
    onFavorite: (id: string, favorite: boolean) => { if (isWorkspaceSessionId(id)) favoriteMutation.mutate({ sessionId: id, favorite }); },
    onRename: (id: string, newTitle: string) => { if (isWorkspaceSessionId(id)) renameMutation.mutate({ sessionId: id, title: newTitle }); },
    onDelete: (id: string) => {
      if (isWorkspaceSessionId(id)) {
        deleteMutation.mutate({ sessionId: id });
      } else {
        // 旧格式 session（数字 id）走 conversation.delete 路径
        const numId = Number(id);
        if (!isNaN(numId) && numId > 0) legacyDeleteMutation.mutate({ conversationId: numId });
      }
    },
  };

  const batchActions = {
    onBatchDelete: async (ids: string[]) => {
      // workspace sessions 的 id 是 string UUID，但 batch procedures 需要 conversationId (number)
      // 先尝试从 sessionList 找到对应的 conversationId
      const numericIds = ids.map(id => {
        const ws = sessionList.find(s => s.id === id);
        return ws?.conversationId ?? Number(id);
      }).filter(id => !isNaN(id));
      if (numericIds.length > 0) {
        await batchDeleteMutation.mutateAsync({ conversationIds: numericIds });
      }
      // 同时删除 workspace sessions（只处理 UUID 格式的 session id）
      for (const id of ids) {
        if (!isWorkspaceSessionId(id)) continue;
        try { await deleteMutation.mutateAsync({ sessionId: id }); } catch {}
      }
    },
    onBatchPin: async (ids: string[], pinned: boolean) => {
      for (const id of ids) {
        if (!isWorkspaceSessionId(id)) continue;
        try { await pinMutation.mutateAsync({ sessionId: id, pinned }); } catch {}
      }
      utils.workspace.listSessions.invalidate();
    },
    onBatchFavorite: async (ids: string[], favorited: boolean) => {
      for (const id of ids) {
        if (!isWorkspaceSessionId(id)) continue;
        try { await favoriteMutation.mutateAsync({ sessionId: id, favorite: favorited }); } catch {}
      }
      utils.workspace.listSessions.invalidate();
    },
  };

  const linkConvMutation = trpc.workspace.linkConversation.useMutation({
    onSuccess: async (_, variables) => {
      // BUG-004 fix: invalidate listSessions so currentSession.conversationId is updated
      await utils.workspace.listSessions.invalidate();
      // Also immediately set activeConvId so Discussion switches without waiting for refetch
      setActiveConvId(variables.conversationId);
    },
  });

  const createConvMutation = trpc.chat.createConversation.useMutation({
    onSuccess: (conv) => {
      setActiveConvId(conv.id);
      refetchConvs();
      // 使用 currentSessionRef.current 确保获取最新 session（避免 closure 捕获旧值）
      // 场景：onNewEntity 先 createSession 更新了 currentSession，再触发 createConvMutation
      const latestSession = currentSessionRef.current;
      if (latestSession?.id) {
        linkConvMutation.mutate({ sessionId: latestSession.id, conversationId: conv.id });
      }
    },
  });

  // Note: rawConvMsgs, submitMutation, convMessages, setSending, setIsTyping
  // are now managed internally by useDiscussion — removed from VNext state

  useEffect(() => {
    // 修复：只有当前 session 明确有绑定的 conversationId 时才允许 fallback
    // 如果当前 session 没有 conversationId（新 session），不得把其他 session 的旧对话塑进来
    if (!activeConvId && allConversations?.length && currentSession?.conversationId) {
      // 只允许加载当前 session 绑定的对话
      const sessionConv = allConversations.find(c => c.id === currentSession.conversationId);
      if (sessionConv) {
        setActiveConvId(sessionConv.id);
      }
    }
  }, [allConversations, activeConvId, currentSession?.conversationId]);

  // BUG-004 fix: Session 切换时同步 activeConvId + 清空 input
  // currentSession 变化时，必须将 activeConvId 同步为该 session 的 conversationId
  // 这是 Discussion 切换的唯一可靠来源，不能依赖 onSelectSession 回调中的手动调用
  const prevSessionIdRef = useRef<string | null>(null);
  // currentSessionRef: 始终持有最新 currentSession，供 mutation onSuccess 等 closure 使用
  const currentSessionRef = useRef(currentSession);
  useEffect(() => { currentSessionRef.current = currentSession; }, [currentSession]);
  useEffect(() => {
    const sid = currentSession?.id ?? null;
    if (sid !== prevSessionIdRef.current) {
      prevSessionIdRef.current = sid;
      setInput(""); // 切换 session 时清空输入框
      // 关键修复：同步 activeConvId
      if (currentSession?.conversationId) {
        setActiveConvId(currentSession.conversationId);
      } else {
        // 新 session 无对话，置 null 让 Discussion 立即清空
        setActiveConvId(null);
      }
    }
  }, [currentSession?.id, currentSession?.conversationId]);

  // 从消息推导 ticker（仅在 workspace 无 entity 时生效）
  useEffect(() => {
    if (wsEntity) return; // workspace entity 优先
    const t = extractTicker(visibleMessages);
    if (t && t !== prevTickerRef.current) { prevTickerRef.current = t; setManualTicker(t); }
  }, [visibleMessages, wsEntity]);

  // ── ensureConversation: 若当前 session 无 conversation，先创建再发送 ──────────
  // 这是修复所有 4 条触发链的核心：
  // A. 手动输入发送链  B. 快捷问题按钮链  C. entity 自动首发链  D. 提交绑定链
  // 根因：sendMessage 在 conversationId 为 null 时 early return，但系统从未自动创建 conversation
  const pendingSubmitRef = useRef<string | null>(null);

  // 监听 activeConvId 变化：若有 pending 消息等待发送，立即发出
  useEffect(() => {
    if (activeConvId && pendingSubmitRef.current !== null) {
      const pending = pendingSubmitRef.current;
      pendingSubmitRef.current = null;
      // 延迟一帧确保 useDiscussion 已接收到新的 conversationId
      setTimeout(() => discussionSendMessage(pending), 50);
    }
  }, [activeConvId, discussionSendMessage]);

  // ── pendingEntityPromptRef: 修复 entity 切换后首次分析发到旧 session 的 bug ──
  // 问题根因：createSession().then(() => { setSession(newSession); handleSubmit(...) })
  // 此时 currentSessionRef.current 还是旧 session（React 状态批处理未完成），
  // handleSubmit 拿到的是旧 conversationId，消息被发到旧 session。
  // 修复：将 prompt 存入 pendingEntityPromptRef，在 currentSession?.id 变化的
  // useEffect 中（新 session 已激活）再触发 handleSubmit，确保发到正确的 session。
  const pendingEntityPromptRef = useRef<string | null>(null);
  // 监听 currentSession.id 变化：若有 entity prompt 等待发送，在新 session 激活后触发
  // BUG-A 修复：新 session 刚建立时 conversationId=null，但 currentSessionRef.current 可能还持旧 session 的 conversationId
  // 修复方案：强制走“无 conversation”路径（先建立 conversation 再发送），不依赖 currentSessionRef.current.conversationId
  useEffect(() => {
    if (pendingEntityPromptRef.current !== null) {
      const prompt = pendingEntityPromptRef.current;
      pendingEntityPromptRef.current = null;
      // 延迟确保 session 切换的 useEffect 已运行（activeConvId 已置 null）
      setTimeout(() => {
        // 强制走“创建 conversation”路径：新 session 必然没有 conversation
        // 不能依赖 currentSessionRef.current.conversationId（可能是旧 session 的已绑定对话）
        const latestSession = currentSessionRef.current;
        if (!latestSession) return;
        // 如果新 session 已经有 conversationId（极少情况），直接发送
        if (latestSession.conversationId) {
          discussionSendMessage(prompt);
          return;
        }
        // 常规情况：新 session 无 conversation，先建立再发送
        pendingSubmitRef.current = prompt;
        const title = latestSession.focusKey
          ? `${latestSession.focusKey} 研究`
          : prompt.slice(0, 40);
        createConvMutation.mutate({ title });
      }, 150);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSession?.id]);

  const handleSubmit = useCallback((text?: string) => {
    const raw = (text ?? input).trim();
    if (!raw) return;

    // 使用 currentSessionRef.current 而非 activeConvId 状态判断：
    // 原因：onNewEntity 中 createSession 完成后同步调用 handleSubmit，
    // 此时 React 状态批处理可能尚未将 activeConvId 更新为 null，
    // 导致错误地走入旧 session 的 conversation 发送路径。
    // 正确做法：直接查询最新 session 的 conversationId，不依赖异步状态。
    const latestConvId = currentSessionRef.current?.conversationId ?? activeConvId;

    if (latestConvId) {
      // 已有 conversation，直接发送
      discussionSendMessage(text);
    } else {
      // 无 conversation：先创建，成功后通过 pendingSubmitRef 触发发送
      // createConvMutation.onSuccess 会 setActiveConvId，上方 useEffect 监听后发送
      pendingSubmitRef.current = raw;
      const latestSession = currentSessionRef.current;
      const title = latestSession?.focusKey
        ? `${latestSession.focusKey} 研究`
        : raw.slice(0, 40);
      createConvMutation.mutate({ title });
    }
  }, [activeConvId, input, discussionSendMessage, createConvMutation]);

  const lastAssistant = lastAssistantMessage;
  const answerObject = lastAssistant?.metadata?.answerObject;

  // ── WorkspaceOutput Refactor v1 — Layer 1 hook ────────────────────────────
  const workspaceOutput = useWorkspaceOutput({
    latestAssistantContent: lastAssistant?.content ?? null,
    answerObject: answerObject ?? null,
    entity: currentTicker || undefined,
  });

  // ── useWorkspaceViewModel: 真实市场决策数据层 ─────────────────────────────
  const vm = useWorkspaceViewModel();
  const { headerViewModel: hvm, thesisViewModel: tvm, timingViewModel: tivm, alertViewModel: avm, historyViewModel: hivm, isLoading: vmLoading } = vm;

  // stance: 优先用 vm 真实数据，fallback 到 answerObject 推导
  const stance = (hvm.stance as "bullish" | "bearish" | "neutral" | "unavailable" | null) ?? stanceFrom(answerObject?.verdict);

  // ── Session items: 优先用 WorkspaceContext sessionList，fallback 到 allConversations ──
  // ── 统一 title 解析："公司名 · 代码 · 市场" → { displayTitle, entity, market } ──
  const parseSessionTitle = useCallback((rawTitle: string, fallbackKey?: string) => {
    const KNOWN_MARKETS = new Set(["US", "HK", "SH", "SZ", "CN", "JP", "UK", "EU", "SG", "KR", "AU", "TW"]);
    const parts = rawTitle.split(" · ");
    if (parts.length >= 3 && KNOWN_MARKETS.has(parts[parts.length - 1].trim())) {
      const market = parts[parts.length - 1].trim();
      const entity = parts[parts.length - 2].trim();
      const displayTitle = parts.slice(0, parts.length - 2).join(" · ").trim();
      return { displayTitle: displayTitle || rawTitle, entity, market };
    }
    // fallback：旧格式，直接用原始 title + focusKey
    return { displayTitle: rawTitle, entity: fallbackKey ?? "—", market: inferMarketFromKey(fallbackKey ?? "") };
  }, []);

  const sessionItems = useMemo<SessionItem[]>(() => {
    // 优先：WorkspaceContext workspace sessions（真实研究会话）
    if (sessionList.length > 0) {
      return sessionList.map(s => {
        const type: SessionItem["type"] =
          s.sessionType === "entity" ? "thesis" :
          s.sessionType === "basket" ? "research" : "research";
        const dir = (hvm.stance as "bullish" | "bearish" | "neutral" | null) ?? "neutral";
        const { displayTitle, entity: parsedEntity, market: parsedMarket } = parseSessionTitle(s.title ?? "", s.focusKey);
        return {
          id: s.id,
          entity: parsedEntity,
          title: displayTitle,
          market: parsedMarket,
          type,
          time: timeAgo(new Date(s.lastActiveAt)),
          pinned: s.pinned,
          favorite: s.favorite,
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
      const rawTitle = c.title ?? `对话 #${c.id}`;
      const { displayTitle, entity: parsedEntity, market: parsedMarket } = parseSessionTitle(rawTitle);
      const t = rawTitle.toLowerCase();
      const type: SessionItem["type"] =
        t.includes("risk") || t.includes("风险") ? "risk" :
        t.includes("timing") || t.includes("时机") ? "timing" :
        t.includes("thesis") || t.includes("论点") ? "thesis" : "research";
      const dir = stance === "unavailable" ? "neutral" : (stance ?? "neutral");
      return {
        id: String(c.id),
        entity: parsedEntity,
        title: displayTitle,
        market: parsedMarket,
        type, time: timeAgo(new Date(c.lastMessageAt)),
        pinned: c.isPinned, active: c.id === activeConvId,
        direction: dir as "bullish" | "bearish" | "neutral",
      };
    });
  }, [sessionList, allConversations, activeConvId, stance, currentSession?.id, hvm.stance, avm.alertCount, parseSessionTitle]);

  // Discussion messages — driven by useDiscussion.visibleMessages
  // STRICT: assistant content is ONLY used by adapter, never rendered raw
  const discussionMsgs = useMemo<import("@/components/workspace/DiscussionPanelVNext").DiscussionMessage[]>(() =>
    visibleMessages.slice(-40).map(m => ({
      id: String(m.id),
      role: m.role as "user" | "assistant",
      // User messages: keep raw content for display
      // Assistant messages: content passed to adapter only, never rendered directly
      content: m.content,
      timestamp: fmtTime(m.createdAt),
      answerObject: m.metadata?.answerObject ?? undefined,
    })), [visibleMessages]);

  // 当新 session 刚创建、entity 已选、消息为空、正在 sending/streaming 时，显示骨架屏初始化状态
  const isInitializing = useMemo(() => {
    return !!(currentTicker && discussionMsgs.length === 0 && (sending || isTyping));
  }, [currentTicker, discussionMsgs.length, sending, isTyping]);

  // ── WorkspaceOutput insights mapping (v1 adapter → InsightsRailVNext props) ──
  const woNowItems = workspaceOutput.insights.now.map(item => ({
    type: (item.sentiment === "positive" ? "positive" : item.sentiment === "warning" ? "warning" : "neutral") as "positive" | "warning" | "neutral" | "calendar",
    title: item.text,
    detail: item.sub ?? "",
  }));
  const woMonitorItems = workspaceOutput.insights.monitor.map(item => ({
    type: (item.urgency === "high" ? "warning" : "neutral") as "positive" | "warning" | "neutral" | "calendar",
    title: item.trigger,
    detail: item.context ?? "",
  }));
  const woQuickFacts = workspaceOutput.insights.quickFacts.map(f => ({ label: f.label, value: f.value, sub: f.sub }));
  const woNews = workspaceOutput.insights.news.map(n => ({ headline: n.headline, source: n.source, sentiment: n.sentiment }));
  const woKeyLevels = workspaceOutput.insights.keyLevels.map(l => ({
    label: l.label,
    value: l.value,
    type: (l.color === "green" ? "target" : l.color === "red" ? "stop" : "support") as "entry" | "support" | "resistance" | "stop" | "target" | "current",
  }));

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

  // ── QuoteData: 扩充真实行情字段（price/change/changePercent/high/low/volume/pe/pb） ──
  const mappedQuote = useMemo<QuoteData | undefined>(() => {
    if (!quoteData) return undefined;
    return {
      price: quoteData.price as number | undefined,
      change: (quoteData as any).change as number | undefined,
      changePercent: quoteData.changePercent as number | undefined,
      high: (quoteData as any).high as number | undefined,
      low: (quoteData as any).low as number | undefined,
      volume: (quoteData as any).volume as number | undefined,
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
          cnName={currentCnName}
          stance={stance}
          confidence={
            // 优先用 hvm.confidenceAvg（真实语义置信度），fallback 到 answerObject 推导
            hvm.confidenceAvg != null ? Math.round(hvm.confidenceAvg * 100) :
            answerObject?.confidence === "high" ? 80 :
            answerObject?.confidence === "medium" ? 55 :
            answerObject?.confidence === "low" ? 30 : null
          }
          gateState={
            // 优先用 tvm.gateState（真实 gate 评估结果），fallback 到 answerObject 推导
            tvm.gateState === "pass" ? "pass" :
            tvm.gateState === "block" ? "block" :
            tvm.gateState != null ? "fallback" :
            answerObject ? "pass" : "fallback"
          }
          changeMarker={
            // 优先用 hvm.changeMarker（真实状态变化标记），fallback 到 stable
            (hvm.changeMarker as "stable" | "strengthening" | "weakening" | "reversal" | "unknown" | null) ?? "stable"
          }
          alertCount={avm.alertCount ?? 0}
          highestAlertSeverity={(avm.highestSeverity as "low" | "medium" | "high" | "critical" | null) ?? null}
          lastUpdated={
            // 优先用 hvm.lastSnapshotAt（真实快照时间），fallback 到 lastAssistant 消息时间
            hvm.lastSnapshotAt != null
              ? new Date(hvm.lastSnapshotAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
              : lastAssistant ? fmtTime(lastAssistant.createdAt) : undefined
          }
          entityCandidates={sessionList.map((s): EntityCandidate => {
            // 本地 session 候选：用 detectMarketType 统一推断 market，避免把 CRYPTO 误判为 US
            const tk = s.focusKey || "";
            let market: string | undefined;
            if (tk) {
              const mt = detectMarketType(tk);
              switch (mt) {
                case "crypto": market = "CRYPTO"; break;
                case "cn":     market = "CN"; break;
                case "hk":     market = "HK"; break;
                case "uk":     market = "UK"; break;
                case "eu":     market = "EU"; break;
                case "us":     market = "US"; break;
              }
            }
            return {
              id: s.id,
              ticker: tk || "—",
              title: s.title,
              market,
              sessionType: s.sessionType,
            };
          })}
          onSelectEntity={(candidate) => {
            // 问题1：先按 id 查找已有 session
            const sessionById = sessionList.find(s => s.id === candidate.id);
            if (sessionById) {
              setSession(sessionById);
              return;
            }
            // 问题3：再按 focusKey 查找重复标的（同一代码已存在 session）
            const ticker = candidate.ticker;
            const existingByTicker = sessionList.find(
              s => s.focusKey && s.focusKey.toUpperCase() === ticker.toUpperCase()
            );
            if (existingByTicker) {
              // 直接定位到已有 session，不新建
              setSession(existingByTicker);
              // 闪烁高亮对应卡片
              setHighlightSessionId(existingByTicker.id);
              setTimeout(() => setHighlightSessionId(null), 1000);
              return;
            }
            // 新标的：新建 entity session，标题格式 = "公司名 · 代码 · 市场"
            const displayName = candidate.cnName || candidate.title || ticker;
            const marketSuffix = candidate.market ? ` · ${candidate.market}` : "";
            const sessionTitle = displayName !== ticker
              ? `${displayName} · ${ticker}${marketSuffix}`
              : `${ticker}${marketSuffix}`;
            // 修复竞争条件：先存入 pendingEntityPromptRef，再创建 session
            // createSession 内部已调用 setCurrentSession(newSession)，不需要再调用 setSession
            // 调用 setSession 会再次触发 currentSession?.id 变化 useEffect，导致重复处理
            pendingEntityPromptRef.current = `深度分析 ${ticker}`;
            createSession({
              title: sessionTitle,
              focusKey: ticker,
              sessionType: 'entity',
            }).then(newSession => {
              if (newSession) {
                // 不再调用 setSession：createSession 内部已设好 currentSession
                // setSession 会触发二次 currentSession?.id 变化，导致 pendingEntityPromptRef 被清空后再次触发（null）
                // 但为了触发 utils.market.invalidate()，使用 fire-and-forget 方式
                utils.market.invalidate();
              } else {
                // 创建失败，清除 pending prompt
                pendingEntityPromptRef.current = null;
              }
            });
          }}
          onNewEntity={async (ticker) => {
            // 问题3：先检查是否已有相同 focusKey 的 session
            const existingForNew = sessionList.find(
              s => s.focusKey && s.focusKey.toUpperCase() === ticker.toUpperCase()
            );
            if (existingForNew) {
              setSession(existingForNew);
              return;
            }
            // 新标的：构建标题（从 sessionList 反查同一 focusKey 的历史信息）
            // onNewEntity 没有 cnName/market 信息，直接用 ticker 作标题
            const displayName = ticker;
            const marketSuffix = "";
            const sessionTitle = displayName !== ticker
              ? `${displayName} · ${ticker}${marketSuffix}`
              : `${ticker}${marketSuffix}`;
            // 修复竞争条件：先存入 pendingEntityPromptRef，再创建 session
            // createSession 内部已调用 setCurrentSession(newSession)，不需要再调用 setSession
            pendingEntityPromptRef.current = `深度分析 ${ticker}`;
            const newSession = await createSession({
              title: sessionTitle,
              focusKey: ticker,
              sessionType: "entity",
            });
            if (newSession) {
              // 不再调用 setSession：createSession 内部已设好 currentSession
              // 只需触发 market 数据重载
              utils.market.invalidate();
            } else {
              setManualTicker(ticker);
              pendingEntityPromptRef.current = null; // 创建失败，清除 pending
            }
          }}
        />

        {/* ── 4-column workspace ── */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden", minWidth: 1200 }}>

          {/* Col 1: Session Rail — 接入 WorkspaceContext 真实会话 */}
          <SessionRail
            sessions={sessionItems}
            highlightId={highlightSessionId}
            activeSessionId={
              currentSession?.id ??
              (activeConvId != null ? String(activeConvId) : undefined)
            }
            onSelectSession={(id) => {
              // 优先切换 workspace session
              const wsSession = sessionList.find(s => s.id === id);
              if (wsSession) {
                setSession(wsSession);
                // BUG-002 fix: 切换 WorkspaceSession 时同步 activeConvId
                if (wsSession.conversationId) {
                  setActiveConvId(wsSession.conversationId);
                } else {
                  // BUG-003 fix: 切换无 conversationId 的 session 时置 null
                  // Discussion 会立即清空，不再显示上一个 session 的消息
                  setActiveConvId(null);
                }
              } else {
                setActiveConvId(Number(id));
                // visibleMessages 由 useDiscussion(activeConvId) 自动重置
              }
            }}
            onNewGeneralSession={() => {
              // 绿色加号：创建空白 general session（无 focusKey，无标的绑定）
              createSession({ title: "新研究", focusKey: null, sessionType: "general" });
            }}
            activeEntity={currentTicker || undefined}
            actions={sessionActions}
            batchActions={batchActions}
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
                thesis={(() => {
                  // FIX 2: answerObject 优先策略
                  // 当 answerObject 存在且非 degraded 时，优先使用 answerObject 的真实结论
                  // TVM 的 stateSummaryText 是机器状态字符串（含 Stance: unavailable / Thesis: unknown），不适合作为主结论
                  const isDegradedAO = !!(answerObject as { degraded?: boolean } | null)?.degraded;
                  const hasRealAO = !!(answerObject && !isDegradedAO && answerObject.verdict);

                  // 判断 TVM 是否有真实的核心论点（不是机器状态字符串）
                  const tvmStateSummary = tvm?.stateSummaryText?.trim() ?? "";
                  const hasRealTVMThesis = !!(tvmStateSummary &&
                    !tvmStateSummary.includes("Thesis: unknown") &&
                    !tvmStateSummary.includes("Stance: unavailable") &&
                    !tvmStateSummary.includes("Stance:"));

                  // 主结论：优先 answerObject.verdict（真实 AI 结论），其次 TVM 真实论点，最后 changeMarker
                  const coreThesis = hasRealAO
                    ? answerObject!.verdict
                    : hasRealTVMThesis
                      ? tvmStateSummary
                      : (tvm?.changeMarker ?? undefined);

                  // 核心驱动：优先 answerObject.bull_case[0]，其次 TVM evidenceState
                  const criticalDriver = hasRealAO
                    ? (answerObject!.bull_case?.[0] ?? answerObject!.reasoning?.[0] ?? undefined)
                    : (tvm?.evidenceState ?? undefined);

                  const failureCondition = answerObject?.risks?.[0]?.description ?? tvm?.fragility ?? undefined;

                  // 置信度：优先 answerObject.confidence，其次 TVM fragilityScore
                  const confidenceScore = hasRealAO
                    ? (answerObject!.confidence === "high" ? 80 : answerObject!.confidence === "medium" ? 55 : 30)
                    : (tvm.fragilityScore != null ? Math.round((1 - tvm.fragilityScore) * 100) : null);

                  // 证据状态：优先 answerObject.confidence，其次 TVM evidenceState
                  // evidenceScore=0 时只作为 warning，不覆盖 answerObject 的真实置信度
                  const evidenceState = hasRealAO
                    ? (answerObject!.confidence === "high" ? "strong" : answerObject!.confidence === "medium" ? "moderate" : "weak") as "strong" | "moderate" | "weak" | "insufficient"
                    : ((tvm.evidenceState as "strong" | "moderate" | "weak" | "insufficient" | null) ?? "insufficient");

                  const fragilityLevel = tvm.fragilityScore != null
                    ? (tvm.fragilityScore >= 0.7 ? "high" as const : tvm.fragilityScore >= 0.4 ? "medium" as const : "low" as const)
                    : (answerObject?.confidence === "low" ? "high" as const : answerObject?.confidence === "medium" ? "medium" as const : "low" as const);

                  if (!coreThesis && !criticalDriver && !failureCondition) return undefined;
                  return { coreThesis, criticalDriver, failureCondition, confidenceScore, evidenceState, fragilityLevel };
                })()}
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
                })() : (() => {
                  // Fallback: avm not available → use answerObject.risks directly
                  const aoRisks = answerObject?.risks;
                  if (!aoRisks?.length) return undefined;
                  const ACTION_MAP: Record<string, string> = {
                    high: "设置止损单", critical: "立即减仓或退出", medium: "继续监控", low: "继续监控",
                  };
                  const fuzzyMagnitude = (raw: string | undefined): "low" | "medium" | "high" | "critical" => {
                    const s = (raw ?? "").toLowerCase();
                    if (/critical|severe|extreme|致命|严重/.test(s)) return "critical";
                    if (/high|major|significant|高|重大/.test(s)) return "high";
                    if (/medium|moderate|中/.test(s)) return "medium";
                    if (/low|minor|低|轻微/.test(s)) return "low";
                    return "medium";
                  };
                  const fallbackAlerts: AlertItem[] = aoRisks.slice(0, 4).map((r) => {
                    const sev = fuzzyMagnitude(r.magnitude);
                    return {
                      alertType: "fundamental",
                      severity: sev,
                      message: r.description,
                      reason: r.description,
                      action: ACTION_MAP[sev] ?? "继续监控",
                    } satisfies AlertItem;
                  });
                  const highestFallbackSev = fallbackAlerts.reduce<"low" | "medium" | "high" | "critical">((acc, a) => {
                    const order: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };
                    return (order[a.severity] ?? 0) > (order[acc] ?? 0) ? a.severity : acc;
                  }, "low");
                  return {
                    alerts: fallbackAlerts,
                    alertCount: fallbackAlerts.length,
                    highestSeverity: highestFallbackSev,
                    summaryText: `AI 分析识别到 ${fallbackAlerts.length} 项风险因素`,
                  };
                })()}
                history={(() => {
                  // P1-2: 优先使用 entitySnapshots 最近 5 条（真实时间线）
                  const snapshotEntries: HistoryEntry[] = hivm.snapshots.length > 0
                    ? hivm.snapshots.map((s: SnapshotEntry) => ({
                        time: s.snapshotTime
                          ? new Date(s.snapshotTime).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
                          : "—",
                        changeMarker: (s.changeMarker as HistoryEntry["changeMarker"]) ?? "unknown",
                        stance: s.thesisStance ?? "—",
                        actionBias: s.timingBias ?? "—",
                        alertSeverity: s.alertSeverity ?? null,
                        deltaSummary: s.stateSummaryText ?? undefined,
                      }))
                    // fallback: 若 snapshots 为空但 hivm.available，使用单条 deltaSummary
                    : (hivm.available && hivm.deltaSummary ? [{
                        time: hivm.lastSnapshotAt ? new Date(hivm.lastSnapshotAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "—",
                        changeMarker: (hivm.changeMarker as HistoryEntry["changeMarker"]) ?? "unknown",
                        stance: hvm.stance ?? "—",
                        actionBias: hvm.actionBias ?? "—",
                        alertSeverity: hvm.highestSeverity ?? null,
                        deltaSummary: hivm.deltaSummary,
                      } satisfies HistoryEntry] : []);

                  return snapshotEntries.length > 0
                    ? { entity: currentTicker || undefined, entries: snapshotEntries }
                    : undefined;
                })()}
                isLoading={vmLoading || sending || isTyping}
              />
            </div>
          </main>

          {/* Col 3: Discussion — WorkspaceOutputRefactor v1 接入 DiscussionPanelVNext */}
          <DiscussionPanelVNext
            entity={currentTicker || undefined}
            messages={discussionMsgs}
            isStreaming={sending || isTyping}
            isInitializing={isInitializing}
            onSendMessage={(text) => handleSubmit(text)}
            latestAssistantViewModel={workspaceOutput.discussion}
            onFollowup={(text) => handleSubmit(text)}
          />

          {/* Col 4: Insights Rail — WorkspaceOutputRefactor v1 接入 InsightsRailVNext */}
          {/* Col 4: Insights Rail — STRICT: all data from workspaceOutput, no legacy fallback */}
          <InsightsRailVNext
            entity={currentTicker || undefined}
            nowItems={woNowItems}
            monitorItems={woMonitorItems}
            relatedTickers={relatedTickers.map(t => ({ symbol: t.symbol, changePercent: t.positive ? Math.abs(parseFloat(t.change?.replace(/[^\d.-]/g,"") ?? "0")) : -Math.abs(parseFloat(t.change?.replace(/[^\d.-]/g,"") ?? "0")), note: t.change }))}
            keyLevels={woKeyLevels}
            liveQuote={mappedQuote?.price != null ? { price: mappedQuote.price, changePercent: mappedQuote.changePercent ?? undefined } : null}
            quickFacts={woQuickFacts}
            news={woNews}
          />

        </div>
      </div>
    </>
  );
}
