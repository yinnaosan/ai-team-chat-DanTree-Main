/**
 * useSessionManager.ts — DanTree Discussion System v1
 *
 * Session 管理 hook：
 * - Session 列表（pinned 优先排序）
 * - CRUD：create / delete / pin / favorite / rename
 * - currentSession 同步（绑定 activeConvId）
 * - 与 trpc 路由对齐，不引入新 schema
 */
import { useState, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SessionData {
  id: number;
  title: string | null;
  isPinned: boolean;
  isFavorited: boolean;
  lastMessageAt: Date;
  createdAt: Date;
  groupId?: number | null;
  /** Extracted ticker from title, populated client-side */
  ticker?: string;
}

export interface SessionGroup {
  pinned: SessionData[];
  favorited: SessionData[];
  recent: SessionData[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useSessionManager(enabled: boolean) {
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: rawSessions, refetch } = trpc.chat.listConversations.useQuery(
    undefined,
    { enabled, refetchInterval: 30000 }
  );

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMutation = trpc.chat.createConversation.useMutation({
    onSuccess: (conv) => {
      setActiveSessionId(conv.id);
      refetch();
    },
    onError: () => toast.error("创建会话失败"),
  });

  const pinMutation = trpc.conversation.pin.useMutation({
    onSuccess: () => refetch(),
    onError: () => toast.error("操作失败"),
  });

  const favoriteMutation = trpc.conversation.favorite.useMutation({
    onSuccess: () => refetch(),
    onError: () => toast.error("操作失败"),
  });

  const deleteMutation = trpc.conversation.delete.useMutation({
    onSuccess: (_, variables) => {
      refetch();
      // If deleted the active session, clear it
      if (variables.conversationId === activeSessionId) {
        setActiveSessionId(null);
      }
    },
    onError: () => toast.error("删除失败"),
  });

  // ── Derived: sorted + grouped ──────────────────────────────────────────────
  const sessions: SessionData[] = useMemo(() => {
    if (!rawSessions) return [];
    return (rawSessions as any[]).map(s => ({
      id: s.id,
      title: s.title,
      isPinned: s.isPinned,
      isFavorited: s.isFavorited,
      lastMessageAt: new Date(s.lastMessageAt),
      createdAt: new Date(s.createdAt),
      groupId: s.groupId ?? null,
      ticker: s.title?.match(/\b([A-Z]{1,5}|BTC|ETH)\b/)?.[1],
    }));
  }, [rawSessions]);

  // Pinned first, then favorited, then recent by lastMessageAt
  const grouped: SessionGroup = useMemo(() => {
    const sorted = [...sessions].sort((a, b) =>
      b.lastMessageAt.getTime() - a.lastMessageAt.getTime()
    );
    return {
      pinned:    sorted.filter(s => s.isPinned),
      favorited: sorted.filter(s => !s.isPinned && s.isFavorited),
      recent:    sorted.filter(s => !s.isPinned && !s.isFavorited),
    };
  }, [sessions]);

  const currentSession = useMemo(
    () => sessions.find(s => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId]
  );

  // ── Actions ───────────────────────────────────────────────────────────────
  const createSession = useCallback((title?: string) => {
    createMutation.mutate({ title: title ?? "新会话" });
  }, [createMutation]);

  const selectSession = useCallback((id: number) => {
    setActiveSessionId(id);
  }, []);

  const pinSession = useCallback((id: number, pinned: boolean) => {
    pinMutation.mutate({ conversationId: id, pinned });
  }, [pinMutation]);

  const favoriteSession = useCallback((id: number, favorited: boolean) => {
    favoriteMutation.mutate({ conversationId: id, favorited });
  }, [favoriteMutation]);

  const deleteSession = useCallback((id: number) => {
    deleteMutation.mutate({ conversationId: id });
  }, [deleteMutation]);

  const autoSelectLatest = useCallback(() => {
    if (activeSessionId == null && sessions.length > 0) {
      const latest = [...sessions].sort((a, b) =>
        b.lastMessageAt.getTime() - a.lastMessageAt.getTime()
      )[0];
      setActiveSessionId(latest.id);
    }
  }, [activeSessionId, sessions]);

  return {
    // State
    sessions,
    grouped,
    activeSessionId,
    currentSession,
    // Actions
    createSession,
    selectSession,
    pinSession,
    favoriteSession,
    deleteSession,
    autoSelectLatest,
    refetch,
    // Loading state
    isCreating: createMutation.isPending,
  };
}
