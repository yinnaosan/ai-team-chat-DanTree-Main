/**
 * WorkspaceContext — DanTree Workspace v2.1-A1
 *
 * Manages workspace sessions: create, list, activate, pin, favorite, rename.
 * currentSession.focusKey is the authoritative source for the active entity/basket.
 * Falls back to "AAPL" when no session is active.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WorkspaceSessionType = "entity" | "basket" | "theme" | "compare" | "explore";
export type WorkspaceFocusType = "ticker" | "basket" | "theme" | "pair" | "free";

export interface WorkspaceSession {
  id: string;
  userId: number;
  title: string;
  sessionType: WorkspaceSessionType;
  focusKey: string;
  focusType: WorkspaceFocusType;
  pinned: boolean;
  favorite: boolean;
  createdAt: number;
  updatedAt: number;
  lastActiveAt: number;
}

export interface WorkspaceContextValue {
  /** The currently active session (null if none selected yet) */
  currentSession: WorkspaceSession | null;
  /** Full ordered list: pinned first, then by lastActiveAt desc */
  sessionList: WorkspaceSession[];
  /** Loading state */
  isLoading: boolean;
  /** Create a new session and immediately activate it */
  createSession: (params: {
    title: string;
    sessionType?: WorkspaceSessionType;
    focusKey: string;
    focusType?: WorkspaceFocusType;
  }) => Promise<WorkspaceSession | null>;
  /** Switch to an existing session */
  setSession: (session: WorkspaceSession) => void;
  /** Toggle pin state */
  pinSession: (sessionId: string, pinned: boolean) => void;
  /** Toggle favorite state */
  favoriteSession: (sessionId: string, favorite: boolean) => void;
  /** Rename a session */
  renameSession: (sessionId: string, title: string) => void;
  /** Refresh session list from server */
  refetchSessions: () => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const [currentSession, setCurrentSession] = useState<WorkspaceSession | null>(null);

  // Fetch session list (only when logged in)
  const { data: sessionsData, isLoading, refetch: refetchSessions } = trpc.workspace.listSessions.useQuery(
    undefined,
    {
      enabled: !!user,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    }
  );

  const sessionList = (sessionsData?.sessions ?? []) as WorkspaceSession[];

  // On first load: auto-activate the most recently active session
  useEffect(() => {
    if (!currentSession && sessionList.length > 0) {
      // First item is already sorted: pinned first, then by lastActiveAt desc
      setCurrentSession(sessionList[0]);
    }
  }, [sessionList, currentSession]);

  // Mutations
  const createSessionMutation = trpc.workspace.createSession.useMutation({
    onSuccess: () => utils.workspace.listSessions.invalidate(),
  });

  const setActiveMutation = trpc.workspace.setActive.useMutation();

  const togglePinMutation = trpc.workspace.togglePin.useMutation({
    onSuccess: () => utils.workspace.listSessions.invalidate(),
  });

  const toggleFavoriteMutation = trpc.workspace.toggleFavorite.useMutation({
    onSuccess: () => utils.workspace.listSessions.invalidate(),
  });

  const updateTitleMutation = trpc.workspace.updateTitle.useMutation({
    onSuccess: () => utils.workspace.listSessions.invalidate(),
  });

  // ─── Actions ─────────────────────────────────────────────────────────────────

  const createSession = useCallback(async (params: {
    title: string;
    sessionType?: WorkspaceSessionType;
    focusKey: string;
    focusType?: WorkspaceFocusType;
  }): Promise<WorkspaceSession | null> => {
    try {
      const result = await createSessionMutation.mutateAsync({
        title: params.title,
        sessionType: params.sessionType ?? "entity",
        focusKey: params.focusKey,
        focusType: params.focusType ?? "ticker",
      });
      const newSession = result.session as WorkspaceSession;
      setCurrentSession(newSession);
      return newSession;
    } catch {
      return null;
    }
  }, [createSessionMutation]);

  const setSession = useCallback((session: WorkspaceSession) => {
    setCurrentSession(session);
    // Fire-and-forget: update lastActiveAt on server
    setActiveMutation.mutate({ sessionId: session.id });
    // Invalidate all market queries so they re-fetch with new focusKey
    utils.market.invalidate();
  }, [setActiveMutation, utils]);

  const pinSession = useCallback((sessionId: string, pinned: boolean) => {
    togglePinMutation.mutate({ sessionId, pinned });
    // Optimistic update
    setCurrentSession(prev =>
      prev?.id === sessionId ? { ...prev, pinned } : prev
    );
  }, [togglePinMutation]);

  const favoriteSession = useCallback((sessionId: string, favorite: boolean) => {
    toggleFavoriteMutation.mutate({ sessionId, favorite });
    setCurrentSession(prev =>
      prev?.id === sessionId ? { ...prev, favorite } : prev
    );
  }, [toggleFavoriteMutation]);

  const renameSession = useCallback((sessionId: string, title: string) => {
    updateTitleMutation.mutate({ sessionId, title });
    setCurrentSession(prev =>
      prev?.id === sessionId ? { ...prev, title } : prev
    );
  }, [updateTitleMutation]);

  const value: WorkspaceContextValue = {
    currentSession,
    sessionList,
    isLoading,
    createSession,
    setSession,
    pinSession,
    favoriteSession,
    renameSession,
    refetchSessions,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return ctx;
}

/**
 * Returns the active focus key (entity ticker / basket key).
 * Falls back to "AAPL" when no session is active.
 */
export function useActiveFocusKey(): string {
  const ctx = useContext(WorkspaceContext);
  return ctx?.currentSession?.focusKey ?? "AAPL";
}
