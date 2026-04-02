/**
 * useWorkspaceViewModel — DanTree Workspace v2.1-A1
 *
 * Workspace Adapter: aggregates all analytical layer queries for the active
 * focusKey and produces a unified view model consumed by the workspace canvas.
 *
 * Layer dependency order (explicit):
 *   Layer 1: sourceStats, gateStats, semanticStats (independent)
 *   Layer 2: entityAlerts (depends on gateStats + semanticStats)
 *   Layer 3: thesisData (depends on semanticStats + gateStats + entityAlerts)
 *   Layer 4: timingData (depends on thesisData + entityAlerts + gateStats + semanticStats)
 *   Layer 5: sessionHistory (depends on thesisData + entityAlerts + timingData) — mutation
 */
import { useState, useEffect, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useActiveFocusKey } from "@/contexts/WorkspaceContext";

// ─── View Model Types ─────────────────────────────────────────────────────────

export interface HeaderViewModel {
  entity: string;
  sourceRouterStatus: string;
  evidenceScore: number | null;
  confidenceAvg: number | null;
  protocolDirection: string;
}

export interface ThesisViewModel {
  available: boolean;
  stance: string | null;
  fragility: string | null;
  changeMarker: string | null;
  advisoryOnly: boolean;
}

export interface TimingViewModel {
  available: boolean;
  readinessState: string | null;
  actionBias: string | null;
  timingRisk: string | null;
  advisoryOnly: boolean;
}

export interface AlertViewModel {
  available: boolean;
  alertCount: number;
  highestSeverity: string | null;
  summaryText: string | null;
  advisoryOnly: boolean;
}

export interface HistoryViewModel {
  available: boolean;
  changeMarker: string | null;
  deltaSummary: string | null;
  stateSummaryText: string | null;
}

export interface WorkspaceViewModel {
  entity: string;
  isLoading: boolean;
  headerViewModel: HeaderViewModel;
  thesisViewModel: ThesisViewModel;
  timingViewModel: TimingViewModel;
  alertViewModel: AlertViewModel;
  historyViewModel: HistoryViewModel;
  /** Raw data for panels that need more detail */
  raw: {
    semanticStats: unknown;
    gateStats: unknown;
    entityAlerts: unknown;
    thesisData: unknown;
    timingData: unknown;
    sessionData: unknown;
    sourceStats: unknown;
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWorkspaceViewModel(): WorkspaceViewModel {
  const entity = useActiveFocusKey();

  // ── Layer 1: Independent queries ──────────────────────────────────────────
  const { data: sourceStats } = trpc.market.getSourceSelectionStats.useQuery(
    { entity },
    { refetchInterval: 60_000, staleTime: 30_000 }
  );

  const { data: gateStats } = trpc.market.getOutputGateStats.useQuery(
    undefined,
    { refetchInterval: 60_000, staleTime: 30_000 }
  );

  const { data: semanticStats } = trpc.market.getSemanticStats.useQuery(
    { entity, timeframe: "mid" },
    { refetchInterval: 60_000, staleTime: 30_000 }
  );

  // ── Layer 2: Alert (depends on gate + semantic) ───────────────────────────
  const alertGateInput = gateStats ? {
    entity,
    gate_passed: (gateStats as any).gate_passed ?? true,
    is_synthetic_fallback: false,
    evidence_score: (gateStats as any).evidence_score ?? null,
    semantic_fragility: (semanticStats as any)?.fragility_score ?? null,
  } : null;

  const { data: entityAlerts } = trpc.market.evaluateEntityAlerts.useQuery(
    { entity, gateResult: alertGateInput, sourceResult: null },
    { staleTime: 60_000 }
  );

  // ── Layer 3: Thesis (depends on semantic + gate + alerts) ─────────────────
  const { data: thesisData } = trpc.market.getEntityThesisState.useQuery(
    {
      input: {
        entity,
        semantic_stats: semanticStats ?? null,
        gate_result: alertGateInput,
        source_result: null,
        alert_summary: entityAlerts ?? null,
      }
    },
    { staleTime: 60_000 }
  );

  // ── Layer 4: Timing (depends on thesis + alerts + gate + semantic) ────────
  const { data: timingData } = trpc.market.getExecutionTiming.useQuery(
    {
      input: {
        entity,
        thesisState: thesisData ?? null,
        alertSummary: entityAlerts ?? null,
        gateResult: alertGateInput,
        semanticStats: semanticStats ?? null,
        experienceOutput: null,
      }
    },
    { staleTime: 60_000 }
  );

  // ── Layer 5: Session History (mutation to avoid 414) ─────────────────────
  const sessionHistoryMutation = trpc.market.getSessionHistory.useMutation();
  const [sessionData, setSessionData] = useState<unknown>(undefined);
  const sessionKey = `${entity}|${(thesisData as any)?.entity ?? ""}|${(entityAlerts as any)?.alert_count ?? 0}|${(timingData as any)?.readiness_state ?? ""}`;
  const lastSessionKeyRef = useRef("");
  useEffect(() => {
    if (sessionKey !== lastSessionKeyRef.current) {
      lastSessionKeyRef.current = sessionKey;
      sessionHistoryMutation.mutate(
        {
          current: {
            thesisState: thesisData ?? null,
            alertSummary: entityAlerts ?? null,
            timingResult: timingData ?? null,
          },
          previous: null,
        },
        { onSuccess: (data) => setSessionData(data) }
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  // ── View Model Assembly ───────────────────────────────────────────────────
  const isLoading = !gateStats && !semanticStats;

  const headerViewModel = useMemo<HeaderViewModel>(() => ({
    entity,
    sourceRouterStatus: (sourceStats as any)?.selection_available
      ? ((sourceStats as any)?.top_source ?? "ONLINE")
      : "ONLINE",
    evidenceScore: (gateStats as any)?.evidence_score ?? null,
    confidenceAvg: (semanticStats as any)?.confidence_score ?? null,
    protocolDirection: (semanticStats as any)?.dominant_direction ?? "unavailable",
  }), [entity, sourceStats, gateStats, semanticStats]);

  const thesisViewModel = useMemo<ThesisViewModel>(() => ({
    available: !!(thesisData as any)?.available,
    stance: (thesisData as any)?.stance ?? null,
    fragility: (thesisData as any)?.fragility ?? null,
    changeMarker: (thesisData as any)?.change_marker ?? null,
    advisoryOnly: (thesisData as any)?.advisory_only ?? true,
  }), [thesisData]);

  const timingViewModel = useMemo<TimingViewModel>(() => ({
    available: !!(timingData as any)?.available,
    readinessState: (timingData as any)?.readiness_state ?? null,
    actionBias: (timingData as any)?.action_bias ?? null,
    timingRisk: (timingData as any)?.timing_risk ?? null,
    advisoryOnly: (timingData as any)?.advisory_only ?? true,
  }), [timingData]);

  const alertViewModel = useMemo<AlertViewModel>(() => ({
    available: !!(entityAlerts as any)?.alert_count !== undefined,
    alertCount: (entityAlerts as any)?.alert_count ?? 0,
    highestSeverity: (entityAlerts as any)?.highest_severity ?? null,
    summaryText: (entityAlerts as any)?.summary_text ?? null,
    advisoryOnly: (entityAlerts as any)?.advisory_only ?? true,
  }), [entityAlerts]);

  const historyViewModel = useMemo<HistoryViewModel>(() => ({
    available: !!(sessionData as any)?.available,
    changeMarker: (sessionData as any)?.change_marker ?? null,
    deltaSummary: (sessionData as any)?.delta_summary ?? null,
    stateSummaryText: (sessionData as any)?.current_snapshot?.state_summary_text ?? null,
  }), [sessionData]);

  return {
    entity,
    isLoading,
    headerViewModel,
    thesisViewModel,
    timingViewModel,
    alertViewModel,
    historyViewModel,
    raw: {
      semanticStats,
      gateStats,
      entityAlerts,
      thesisData,
      timingData,
      sessionData,
      sourceStats,
    },
  };
}
