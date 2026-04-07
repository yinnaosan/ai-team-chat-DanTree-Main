/**
 * useSessionManager.ts — DanTree Discussion System v1
 *
 * Session 管理 hook：
 * - Session 列表（pinned 优先排序）
 * - CRUD：create / delete / pin / favorite / rename
 * - 拖拽排序：reorderSessions（非置顶区域）
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
  displayOrder: number;
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
  // 本地乐观排序状态（拖拽时立即更新 UI，不等服务器响应）
  const [localOrder, setLocalOrder] = useState<number[] | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: rawSessions, refetch } = trpc.chat.listConversations.useQuery(
    undefined,
    { enabled, refetchInterval: 30000 }
  );

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMutation = trpc.chat.createConversation.useMutation({
    onSuccess: (conv) => {
      setActiveSessionId(conv.id);
      setLocalOrder(null); // 新建后重置本地排序
      refetch();
    },
    onError: () => toast.error("创建会话失败"),
  });

  const pinMutation = trpc.conversation.pin.useMutation({
    onSuccess: () => { setLocalOrder(null); refetch(); },
    onError: () => toast.error("操作失败"),
  });

  const favoriteMutation = trpc.conversation.favorite.useMutation({
    onSuccess: () => refetch(),
    onError: () => toast.error("操作失败"),
  });

  const deleteMutation = trpc.conversation.delete.useMutation({
    onSuccess: (_, variables) => {
      setLocalOrder(prev => prev ? prev.filter(id => id !== variables.conversationId) : null);
      refetch();
      if (variables.conversationId === activeSessionId) {
        setActiveSessionId(null);
      }
    },
    onError: () => toast.error("删除失败"),
  });

  const renameMutation = trpc.conversation.rename.useMutation({
    onSuccess: () => refetch(),
    onError: () => toast.error("改名失败"),
  });

  const reorderMutation = trpc.conversation.reorder.useMutation({
    onError: () => {
      toast.error("排序保存失败");
      setLocalOrder(null); // 失败时回退到服务器顺序
      refetch();
    },
  });

  // ── Derived: sorted + grouped ──────────────────────────────────────────────
  const sessions: SessionData[] = useMemo(() => {
    if (!rawSessions) return [];
    return (rawSessions as any[]).map(s => ({
      id: s.id,
      title: s.title,
      isPinned: s.isPinned,
      isFavorited: s.isFavorited,
      displayOrder: s.displayOrder ?? 0,
      lastMessageAt: new Date(s.lastMessageAt),
      createdAt: new Date(s.createdAt),
      groupId: s.groupId ?? null,
      ticker: s.title?.match(/\b([A-Z]{1,5}|BTC|ETH)\b/)?.[1],
    }));
  }, [rawSessions]);

  // Pinned first, then non-pinned sorted by displayOrder (if custom) else lastMessageAt
  const grouped: SessionGroup = useMemo(() => {
    const pinned = sessions.filter(s => s.isPinned)
      .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());

    let nonPinned = sessions.filter(s => !s.isPinned);

    if (localOrder) {
      // 乐观排序：按 localOrder 数组顺序排列
      const orderMap = new Map(localOrder.map((id, i) => [id, i]));
      nonPinned = [...nonPinned].sort((a, b) => {
        const ai = orderMap.has(a.id) ? orderMap.get(a.id)! : 9999;
        const bi = orderMap.has(b.id) ? orderMap.get(b.id)! : 9999;
        return ai - bi;
      });
    } else {
      // 服务器排序：有 displayOrder 时按 displayOrder，否则按 lastMessageAt
      const hasCustomOrder = nonPinned.some(s => s.displayOrder !== 0);
      nonPinned = hasCustomOrder
        ? [...nonPinned].sort((a, b) => a.displayOrder - b.displayOrder)
        : [...nonPinned].sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
    }

    return {
      pinned,
      favorited: nonPinned.filter(s => s.isFavorited),
      recent:    nonPinned.filter(s => !s.isFavorited),
    };
  }, [sessions, localOrder]);

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

  const renameSession = useCallback((id: number, title: string) => {
    renameMutation.mutate({ conversationId: id, title });
  }, [renameMutation]);

  /**
   * 拖拽排序：传入非置顶区域的有序 id 数组
   * 立即更新本地状态（乐观更新），同时持久化到服务器
   */
  const reorderSessions = useCallback((orderedIds: number[]) => {
    setLocalOrder(orderedIds);
    reorderMutation.mutate({ orderedIds });
  }, [reorderMutation]);

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
    renameSession,
    reorderSessions,
    autoSelectLatest,
    refetch,
    // Loading state
    isCreating: createMutation.isPending,
  };
}
