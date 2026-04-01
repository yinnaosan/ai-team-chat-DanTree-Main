# FEEDBACK — Level 20.0A Preflight Complete

**Date:** 2026-04-01
**Phase:** L20.0A — Session History / Thesis Timeline Phase 1 Preflight
**Classifier:** MANUS_ONLY
**Status:** COMPLETE ✅

---

## Summary

Preflight complete. 28 files inspected. Zero production files modified.

The Session History / Thesis Timeline Phase 1 layer is a **pure function layer** with zero blockers. The three primary inputs (`EntityThesisState`, `ExecutionTimingResult`, `AlertSummary`) are already computed per-query and require no new DB tables or LLM calls for Phase 1.

---

## Decisions

| Question | Answer |
|----------|--------|
| New file location | `server/sessionHistoryEngine.ts` |
| Phase 1 scope | Entity history + basket history (both) |
| Phase 1 approach | Backend/query-only first (no UI in L20.0B) |
| L20.0B classifier | **CLAUDE_NARROW** |
| Schema migration needed | No (Phase 1 is stateless/computed) |
| Blockers | None |

---

## Phase 1 Objects

**ThesisTimelineSnapshot** (8 fields): `snapshot_time`, `entity`, `thesis_state_summary`, `alert_severity`, `timing_bias`, `change_marker`, `source_health`, `advisory_only`

**BasketTimelineSnapshot** (6 fields): `snapshot_time`, `entities`, `basket_change`, `basket_thesis_summary`, `basket_action_bias`, `advisory_only`

---

## Key Guards for Claude

1. `thesisState === null` → `change_marker = "INSUFFICIENT_DATA"`, `source_health = "unavailable"`
2. `timingResult === null` → `timing_bias = "NONE"`
3. `alertSummary === null` → `alert_severity = null`
4. Field naming: use `timing_bias` (not `action_bias`) to distinguish from raw engine output
5. `advisory_only: true` must be hardcoded, not derived

---

## Open Items

| ID | Description | Status |
|----|-------------|--------|
| OI-L15-003 | Protocol Layer Direction "unavailable" | Deferred |
| OI-L20-001 | `market.getEntityTimeline` + `market.getBasketTimeline` routes | Pending L20.0C |

---

## Next Steps

1. **L20.0B (CLAUDE_NARROW):** Send L20.0B Task Specification (bottom of preflight report) to Claude. Expected output: `sessionHistoryEngine.ts` + `sessionHistoryEngine.test.ts` (≥35 tests).

2. **L20.0C (MANUS_DIRECT):** After Claude output, copy files, add `market.getEntityTimeline` and `market.getBasketTimeline` routes, run tests, update TYPE_REGISTRY.

3. **L19.1A + L18.1A + L20.1A UI batch (MANUS_DIRECT):** After L20.0C backend is live, implement Panels J (Timing), K (Thesis State), and L (Timeline) in a single UI batch to avoid repeated TerminalEntry.tsx edits.
