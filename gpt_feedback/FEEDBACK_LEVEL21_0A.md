# FEEDBACK — Level 21.0A Preflight Complete

**Date:** 2026-04-01
**Phase:** L21.0A — Manus-Only Preflight
**Status:** COMPLETE ✅
**Production files modified:** ZERO

---

## Preflight Summary

Scanned 17 files. Snapshot Persistence / Memory Bridge Phase 1 is ready to proceed.

**Recommended path:**
- New file: `server/snapshotPersistenceEngine.ts` (pure functions)
- New schema table: `entity_snapshots` (12 fields, 2 indexes)
- New db.ts helpers: `insertEntitySnapshot`, `getEntitySnapshotHistory`, `getLatestEntitySnapshot`
- New tRPC routes: `market.saveEntitySnapshot` (mutation), `market.getSnapshotHistory` (query)
- Phase 1 scope: **entity snapshots only, backend + query only, no UI**
- L21.0B classification: **CLAUDE_NARROW**

---

## Claude Collaboration Issues Log (L16–L20)

This section documents all bugs found in Claude outputs across recent levels, for GPT awareness and future prompt calibration.

### L19.0C — executionTimingEngine.ts (3 bugs fixed by Manus)

| Bug | Type | Description | Fix Applied |
|-----|------|-------------|-------------|
| B19-01 | Logic order | `deriveActionBias`: `stance="unavailable"` branch evaluated AFTER `readiness_state="not_ready"` branch, causing `NONE` → `WAIT` misclassification | Moved `unavailable` guard before `not_ready` branch |
| B19-02 | TSC error | `confirmation !== "conflicted"` comparison flagged as overlapping types (TS2367) | Widened type or used type assertion |
| B19-03 | TSC error | `entityResults` passed as optional in `buildBasketTimingResult` call but declared as required | Added required field to call site |

**Test impact:** 2/62 tests failed before fix, 62/62 after fix.

### L20.0C — sessionHistoryEngine.ts (3 bugs fixed by Manus)

| Bug | Type | Description | Fix Applied |
|-----|------|-------------|-------------|
| B20-01 | Test assertion | `expect(result.delta_summary).toContain("first_observation")` — engine returns human-readable `"First observation recorded..."` not the enum string | Changed to `.toLowerCase().toContain("first")` |
| B20-02 | Function signature | `buildThesisTimelineSnapshot` called with 4 positional args; actual signature takes 1 `EntitySnapshotInput` object | Rewrote router call to use input object |
| B20-03 | Function signature | `buildBasketTimelineSnapshot` called with 3 positional args; actual signature takes 1 `BasketSnapshotInput` object | Rewrote router call to use input object |

**Test impact:** 1/46 tests failed before fix, 46/46 after fix. Router TSC errors: 2 → 0.

### Pattern Analysis for GPT

**Root cause of signature bugs (B20-02, B20-03):** Claude generated router integration code based on the function names but did not verify the actual function signatures in the engine file. The engine used input objects (matching the CLAUDE_NARROW pattern from L18), but Claude assumed positional arguments.

**Recommendation for future Claude prompts:**
1. Always include the exact function signatures in the L21.0B Task Specification (already done in preflight report).
2. Specify that router integration code must match the exact `InputObject` pattern, not positional args.
3. For test assertions involving human-readable text output, specify the exact expected string format or use `.toContain` with a substring that matches the actual output.

---

## Recommended Next Steps

1. **L21.0B (CLAUDE_NARROW):** Send the L21.0B Task Specification from the preflight report to Claude. Deliverables: `snapshotPersistenceEngine.ts` + ≥30 tests. Claude should NOT write db.ts helpers or router code — Manus will handle those.

2. **L21.0C (MANUS_DIRECT):** After receiving Claude output, Manus will: apply schema migration, add db.ts helpers, add tRPC routes, run tests, verify routes.

3. **UI Three-Panel Batch (MANUS_DIRECT):** Panels J (Timing), K (Thesis State), L (Session History) can be implemented as a single TerminalEntry edit batch after L21.0C is stable. Recommend scheduling as L21.1A.
