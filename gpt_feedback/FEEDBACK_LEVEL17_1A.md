# FEEDBACK — LEVEL 17.1A
## Alert Panel UI (MANUS_DIRECT)

**Status:** COMPLETE  
**OI Resolved:** OI-L17-002  
**Date:** 2026-04-01

---

## Files Modified

| File | Change |
|------|--------|
| `client/src/pages/TerminalEntry.tsx` | Added 2 tRPC queries + Alerts Panel JSX (Panel I) |
| `gpt_feedback/FEEDBACK_LEVEL17_1A.md` | This file |

**No server files modified. No schema files modified. No new routes added.**

---

## UI Patch Summary

Added a compact **ALERTS panel (Panel I)** in `TerminalEntry.tsx`, positioned between the Basket Analysis panel (Panel H) and the Command Strip (Panel F). The panel is conditionally rendered — it only appears when at least one alert is active (entity or basket). When no alerts are present, the panel is completely hidden (no "No active alerts" placeholder to avoid visual noise).

---

## Query Wiring

### Entity Alerts
```ts
const alertGateInput = gateStats ? {
  entity: activeEntity,
  gate_passed: gateStats.gate_passed ?? true,
  is_synthetic_fallback: false,
  evidence_score: gateStats.evidence_score ?? null,
  semantic_fragility: (semanticStats as any)?.fragility_score ?? null,
} : null;

const { data: entityAlerts } = trpc.market.evaluateEntityAlerts.useQuery(
  { entity: activeEntity, gateResult: alertGateInput, sourceResult: null },
  { staleTime: 60_000 }
);
```

- Derives `gateResult` from the live `gateStats` query (already present in TerminalEntry)
- `sourceResult` passed as `null` (Phase 1 scope — no source deterioration alerts)
- `alertGateInput` is `null` when `gateStats` is not yet loaded → query runs but returns empty

### Basket Alerts
```ts
const { data: basketAlerts } = trpc.market.evaluateBasketAlerts.useQuery(
  { portfolioResult: basketData?.available ? basketData : null },
  { enabled: !!basketData?.available, staleTime: 60_000 }
);
```

- Only enabled when `basketData.available === true` (basket analysis has run)
- Passes the live `basketData` object directly as `portfolioResult`

---

## Panel Rendering Logic

1. **Conditional mount:** Panel only renders if `entityAlerts.alert_count > 0` OR `basketAlerts.alert_count > 0`
2. **Header badge:** Shows total alert count + highest severity across both entity and basket (e.g., `3 ▲ HIGH`)
3. **Severity color scheme:**
   - `critical` → red (`#fca5a5` / `#ef4444`)
   - `high` → orange (`#fb923c` / `#ea580c`)
   - `medium` → amber (`#fbbf24` / `#d97706`)
   - `low` → muted gray (`#94a3b8` / `#334155`)
4. **Per-section:** Entity alerts shown first (labeled with `activeEntity`), basket alerts below (labeled `BASKET`)
5. **Per-alert type badges:** Each triggered `alert_type` shown as inline chip (e.g., `gate downgrade`, `evidence weakening`)
6. **Summary text:** `summary_text` from `AlertSummary` rendered below chips in monospace

---

## Phase 1 Alert Types Surfaced

| Alert Type | Scope | Trigger |
|------------|-------|---------|
| `gate_downgrade` | entity | `gate_passed === false` AND `evidence_score < 40` |
| `evidence_weakening` | entity | `evidence_score < 50` |
| `fragility_spike` | entity | `semantic_fragility > 0.7` |
| `basket_concentration_warning` | basket | `concentration_risk.level === "HIGH"` |
| `shared_fragility_alert` | basket | `shared_fragility.fragility_flag === true` |

**Not surfaced (Phase 1 exclusions):** `source_deterioration`, `direction_flip` (OI-L15-003 deferred)

---

## TSC Status

**0 errors** (after fixing `AlertSeverity | null` type guard in severity reduce)

---

## Regression Status

| Suite | Result |
|-------|--------|
| `alertEngine.test.ts` | 53/53 ✓ |
| `portfolioAnalysisEngine.test.ts` | 45/45 ✓ |
| All other suites | 1825/1831 ✓ |
| `financeDatabaseApi.test.ts` | 6 fail (pre-existing env dependency) |

**Total: 1825/1831 — no regressions introduced**

---

## Scope Compliance

- [x] Only `client/src/pages/TerminalEntry.tsx` modified (frontend)
- [x] No server files modified
- [x] No schema files modified
- [x] No new routes added
- [x] No notification center / persistence / scheduler / delivery
- [x] No comparison alerts or direction-flip alerts surfaced
- [x] Unavailable states handled safely (panel hidden when no alerts)
- [x] No new route/page architecture

---

## OI Updates

| OI | Status |
|----|--------|
| OI-L17-002 | RESOLVED — Alert Panel UI complete |
| OI-L15-003 | DEFERRED — direction-flip alerts excluded from Phase 1 |

---

## Next Steps

- **L17.2A (optional):** "No active alerts" quiet state with muted indicator (currently panel is fully hidden)
- **L18.0A Preflight:** Next batch — TBD by GPT
- **OI-L15-003:** Protocol Layer Direction "unavailable" — session-binding fix, non-blocking
