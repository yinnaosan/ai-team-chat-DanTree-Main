/**
 * useWorkspaceViewModel — DanTree Workspace v2.1-B1a
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
 *   Layer 6: entitySnapshots (for lastSnapshotAt in Header)
 *
 * B1a changes:
 *   - HeaderViewModel: +sessionType, +stance, +readinessState, +actionBias,
 *                      +highestSeverity, +changeMarker, +lastSnapshotAt
 *   - ThesisViewModel: +evidenceState, +gateState, +sourceState, +stateSummaryText
 *   - TimingViewModel: +confirmationState, +timingSummary
 *   - AlertViewModel:  +keyAlerts (top 2 alerts for quick display)
 *   - HistoryViewModel: +previousSummary, +lastSnapshotAt
 */
import { useState, useEffect, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useActiveFocusKey, useWorkspace } from "@/contexts/WorkspaceContext";

// ─── View Model Types ─────────────────────────────────────────────────────────

/** Minimal alert entry for quick display in Header / Alert block */
export interface KeyAlert {
  type: string;
  severity: string;
  message: string;
}

export interface HeaderViewModel {
  // Identity
  entity: string;
  sessionType: string | null;
  // Decision signals (for Decision Header bar)
  stance: string | null;
  readinessState: string | null;
  actionBias: string | null;
  highestSeverity: string | null;
  changeMarker: string | null;
  lastSnapshotAt: number | null;
  // Protocol layer (legacy — kept for Engine Stats panel)
  sourceRouterStatus: string;
  evidenceScore: number | null;
  confidenceAvg: number | null;
  protocolDirection: string;
  advisoryOnly: boolean;
}

export interface ThesisViewModel {
  available: boolean;
  stance: string | null;
  fragility: string | null;
  fragilityScore: number | null;
  changeMarker: string | null;
  // B1a additions
  evidenceState: string | null;
  gateState: string | null;
  sourceState: string | null;
  stateSummaryText: string | null;
  advisoryOnly: boolean;
}

export interface TimingViewModel {
  available: boolean;
  readinessState: string | null;
  actionBias: string | null;
  timingRisk: string | null;
  // B1a additions
  confirmationState: string | null;
  timingSummary: string | null;
  advisoryOnly: boolean;
}

export interface AlertViewModel {
  available: boolean;
  alertCount: number;
  highestSeverity: string | null;
  summaryText: string | null;
  // B1a addition: top 2 alerts for quick display (avoids lifting full alerts[])
  keyAlerts: KeyAlert[];
  advisoryOnly: boolean;
}

/** Single snapshot entry for HistoryBlock timeline */
export interface SnapshotEntry {
  snapshotTime: number;
  changeMarker: string | null;
  thesisStance: string | null;
  timingBias: string | null;
  alertSeverity: string | null;
  stateSummaryText: string | null;
}

export interface HistoryViewModel {
  available: boolean;
  changeMarker: string | null;
  deltaSummary: string | null;
  stateSummaryText: string | null;
  // B1a additions
  previousSummary: string | null;
  lastSnapshotAt: number | null;
  // P1-2: multi-snapshot timeline (up to 5, newest first)
  snapshots: SnapshotEntry[];
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
    entitySnapshots: unknown;
  };
}

// ─── Auto-snapshot helpers ───────────────────────────────────────────────────

/** Derive a lightweight state hash for dedup (avoids writing identical snapshots) */
function deriveStateHash(
  stance: string | null,
  changeMarker: string | null,
  alertSeverity: string | null,
  timingBias: string | null
): string {
  return `${stance ?? ""}|${changeMarker ?? ""}|${alertSeverity ?? ""}|${timingBias ?? ""}`;
}

/** Build timingSummary string from timing data fields */
function buildTimingSummaryText(timingData: unknown): string | null {
  const d = timingData as any;
  if (!d?.available) return null;
  const parts: string[] = [];
  if (d.entity) parts.push(`[${d.entity}]`);
  if (d.readiness_state) parts.push(`Readiness: ${d.readiness_state}.`);
  if (d.action_bias) parts.push(`Action: ${d.action_bias}.`);
  if (d.timing_risk) parts.push(`Risk: ${d.timing_risk}.`);
  if (d.confirmation_state) parts.push(`Confirmation: ${d.confirmation_state}.`);
  if (d.no_action_reason) parts.push(`Note: ${d.no_action_reason}`);
  return parts.length > 0 ? parts.join(" ") : null;
}

/** Extract top 2 key alerts for quick display */
function extractKeyAlerts(entityAlerts: unknown): KeyAlert[] {
  const d = entityAlerts as any;
  if (!d?.alerts || !Array.isArray(d.alerts)) return [];
  const SEVERITY_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  return [...d.alerts]
    .sort((a: any, b: any) => (SEVERITY_ORDER[b.severity] ?? 0) - (SEVERITY_ORDER[a.severity] ?? 0))
    .slice(0, 2)
    .map((a: any) => ({
      type: a.type ?? "unknown",
      severity: a.severity ?? "low",
      message: a.message ?? "",
    }));
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWorkspaceViewModel(): WorkspaceViewModel {
  const entity = useActiveFocusKey();
  const { currentSession } = useWorkspace();

  // ── Layer 1: Independent queries ──────────────────────────────────────────
  const { data: sourceStats } = trpc.market.getSourceSelectionStats.useQuery(
    { entity },
    { refetchInterval: 60_000, staleTime: 30_000, enabled: !!entity }
  );

  const { data: gateStats } = trpc.market.getOutputGateStats.useQuery(
    entity ? { ticker: entity } : undefined,
    { refetchInterval: 60_000, staleTime: 30_000, enabled: !!entity }
  );

  const { data: semanticStats } = trpc.market.getSemanticStats.useQuery(
    { entity, timeframe: "mid" },
    { refetchInterval: 60_000, staleTime: 30_000, enabled: !!entity }
  );

  // ── Layer 1b: Entity snapshots (for lastSnapshotAt + P1-2 multi-snapshot) ──
  const { data: entitySnapshots } = trpc.market.getEntitySnapshots.useQuery(
    { entityKey: entity, limit: 5 },
    { staleTime: 60_000, enabled: !!entity }
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
    { staleTime: 60_000, enabled: !!entity }
  );

  // ── Layer 3: Thesis (depends on semantic + gate + alerts) ─────────────────
  // snapshot_stance: from TVM Writeback (entity_snapshots.thesis_stance) as fallback
  const snapshotStance = (entitySnapshots as any)?.[0]?.thesisStance ?? null;
  const { data: thesisData } = trpc.market.getEntityThesisState.useQuery(
    {
      input: {
        entity,
        semantic_stats: semanticStats ?? null,
        gate_result: alertGateInput,
        source_result: null,
        alert_summary: entityAlerts ?? null,
        snapshot_stance: snapshotStance,
      }
    },
    { staleTime: 60_000, enabled: !!entity }
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
    { staleTime: 60_000, enabled: !!entity }
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

  // ── Auto-snapshot trigger (L21.2A) ───────────────────────────────────────
  const saveSnapshotMutation = trpc.market.saveEntitySnapshot.useMutation();
  const lastSnapshotHashRef = useRef<string>("");
  const lastSnapshotEntityRef = useRef<string>("");

  useEffect(() => {
    if (!currentSession || currentSession.sessionType !== "entity" || !entity) return;
    const stance = (thesisData as any)?.stance ?? null;
    const changeMarker = (thesisData as any)?.change_marker ?? null;
    if (!stance && !changeMarker) return;

    const alertSeverity = (entityAlerts as any)?.highest_severity ?? null;
    const timingBias = (timingData as any)?.action_bias ?? null;
    const stateHash = deriveStateHash(stance, changeMarker, alertSeverity, timingBias);

    if (entity === lastSnapshotEntityRef.current && stateHash === lastSnapshotHashRef.current) return;

    lastSnapshotEntityRef.current = entity;
    lastSnapshotHashRef.current = stateHash;

    saveSnapshotMutation.mutate({
      entityKey: entity,
      thesisStance: stance,
      thesisChangeMarker: changeMarker,
      alertSeverity,
      timingBias,
      sourceHealth: (sourceStats as any)?.selection_available ? "available" : "unavailable",
      changeMarker: changeMarker ?? "no_change",
      stateSummaryText: [
        stance ? `Stance: ${stance}` : null,
        changeMarker ? `Change: ${changeMarker}` : null,
        alertSeverity ? `Alert: ${alertSeverity}` : null,
        timingBias ? `Timing: ${timingBias}` : null,
      ].filter(Boolean).join(" | ") || "No significant state",
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    entity,
    currentSession?.sessionType,
    (thesisData as any)?.stance,
    (thesisData as any)?.change_marker,
    (entityAlerts as any)?.highest_severity,
    (timingData as any)?.action_bias,
  ]);

  // ── View Model Assembly ───────────────────────────────────────────────────
  const isLoading = !gateStats && !semanticStats;

  // Derived values used across multiple view models
  const stance = (thesisData as any)?.stance ?? null;
  const changeMarker = (thesisData as any)?.change_marker ?? null;
  const readinessState = (timingData as any)?.readiness_state ?? null;
  const actionBias = (timingData as any)?.action_bias ?? null;
  const highestSeverity = (entityAlerts as any)?.highest_severity ?? null;
  const lastSnapshotAt = (entitySnapshots as any)?.snapshots?.[0]?.snapshotTime ?? null;

  const headerViewModel = useMemo<HeaderViewModel>(() => ({
    // Identity
    entity,
    sessionType: currentSession?.sessionType ?? null,
    // Decision signals
    stance,
    readinessState,
    actionBias,
    highestSeverity,
    changeMarker,
    lastSnapshotAt,
    // Protocol layer (legacy)
    sourceRouterStatus: (sourceStats as any)?.selection_available
      ? ((sourceStats as any)?.top_source ?? "ONLINE")
      : "ONLINE",
    evidenceScore: (gateStats as any)?.evidence_score ?? null,
    confidenceAvg: (semanticStats as any)?.confidence_score ?? null,
    protocolDirection: (semanticStats as any)?.dominant_direction ?? "unavailable",
    advisoryOnly: true,
  }), [entity, currentSession?.sessionType, stance, readinessState, actionBias, highestSeverity, changeMarker, lastSnapshotAt, sourceStats, gateStats, semanticStats]);

  const thesisViewModel = useMemo<ThesisViewModel>(() => ({
    available: !!(thesisData as any)?.available,
    stance: (thesisData as any)?.stance ?? null,
    fragility: (thesisData as any)?.fragility ?? null,
    fragilityScore: (thesisData as any)?.fragility_score ?? null,
    changeMarker: (thesisData as any)?.change_marker ?? null,
    // B1a additions
    evidenceState: (thesisData as any)?.evidence_state ?? null,
    gateState: (thesisData as any)?.gate_state ?? null,
    sourceState: (thesisData as any)?.source_state ?? null,
    stateSummaryText: (thesisData as any)?.state_summary_text ?? null,
    advisoryOnly: (thesisData as any)?.advisory_only ?? true,
  }), [thesisData]);

  const timingViewModel = useMemo<TimingViewModel>(() => ({
    available: !!(timingData as any)?.available,
    readinessState: (timingData as any)?.readiness_state ?? null,
    actionBias: (timingData as any)?.action_bias ?? null,
    timingRisk: (timingData as any)?.timing_risk ?? null,
    // B1a additions
    confirmationState: (timingData as any)?.confirmation_state ?? null,
    timingSummary: buildTimingSummaryText(timingData),
    advisoryOnly: (timingData as any)?.advisory_only ?? true,
  }), [timingData]);

  const alertViewModel = useMemo<AlertViewModel>(() => ({
    available: (entityAlerts as any)?.alert_count !== undefined,
    alertCount: (entityAlerts as any)?.alert_count ?? 0,
    highestSeverity: (entityAlerts as any)?.highest_severity ?? null,
    summaryText: (entityAlerts as any)?.summary_text ?? null,
    // B1a addition: top 2 key alerts for quick display
    keyAlerts: extractKeyAlerts(entityAlerts),
    advisoryOnly: (entityAlerts as any)?.advisory_only ?? true,
  }), [entityAlerts]);

  // P1-2: map raw entitySnapshots to typed SnapshotEntry array (newest first, max 5)
  const snapshotEntries = useMemo<SnapshotEntry[]>(() => {
    const raw = (entitySnapshots as any)?.snapshots;
    if (!Array.isArray(raw) || raw.length === 0) return [];
    return raw
      .slice(0, 5)
      .map((s: any) => ({
        snapshotTime: s.snapshotTime ?? s.snapshot_time ?? 0,
        changeMarker: s.changeMarker ?? s.change_marker ?? null,
        thesisStance: s.thesisStance ?? s.thesis_stance ?? null,
        timingBias: s.timingBias ?? s.timing_bias ?? null,
        alertSeverity: s.alertSeverity ?? s.alert_severity ?? null,
        stateSummaryText: s.stateSummaryText ?? s.state_summary_text ?? null,
      }));
  }, [entitySnapshots]);

  const historyViewModel = useMemo<HistoryViewModel>(() => ({
    available: !!(sessionData as any)?.available,
    changeMarker: (sessionData as any)?.change_marker ?? null,
    deltaSummary: (sessionData as any)?.delta_summary ?? null,
    stateSummaryText: (sessionData as any)?.current_snapshot?.state_summary_text ?? null,
    // B1a additions
    previousSummary: (sessionData as any)?.previous_snapshot?.state_summary_text ?? null,
    lastSnapshotAt,
    // P1-2: multi-snapshot timeline
    snapshots: snapshotEntries,
  }), [sessionData, lastSnapshotAt, snapshotEntries]);

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
      entitySnapshots,
    },
  };
}
