# FEEDBACK: LEVEL 13.4A — Active Research Entity Binding Preflight

**Status:** COMPLETE (DISCOVERY-ONLY)
**Date:** 2026-04-01
**Production files modified:** NONE

---

## Summary

Preflight confirmed the active entity binding path is clean and MANUS_DIRECT.

**Source of truth:** `currentTicker` (React state in ResearchWorkspace) → persisted to DB via `trpc.rpa.setConfig({ lastTicker })` → readable from any page via `trpc.rpa.getConfig`.

**Patch size:** ~6 lines in `TerminalEntry.tsx` only. No server changes.

---

## Answers to Required Output

| # | Question | Answer |
|---|----------|--------|
| 1 | Source of truth for active entity | `rpaConfig.lastTicker` via `trpc.rpa.getConfig` (DB-persisted, per-user) |
| 2 | Files/functions needed | `TerminalEntry.tsx` only — add 1 hook, replace 2 hardcoded `"AAPL"` strings |
| 3 | L13.4-B MANUS_DIRECT? | **YES** |
| 4 | Minimal patch | 1 hook + 1 derived variable + 2 substitutions ≈ 6 lines |
| 5 | Blockers/coupling | None. `protectedProcedure` handled by `enabled: !!user` guard. Fallback to `"AAPL"` for unauthenticated state. |
| 6 | Production files modified | **NONE** |

---

## Recommended L13.4-B Patch

```tsx
// In TerminalEntry() — after existing hooks:
const { data: rpaConfig } = trpc.rpa.getConfig.useQuery(undefined, {
  staleTime: 30_000,
  enabled: !!user,
});
const activeEntity = rpaConfig?.lastTicker ?? "AAPL";

// Replace in getSourceSelectionStats call:
{ entity: activeEntity }

// Replace in getSemanticStats call:
{ entity: activeEntity, timeframe: "mid" }

// getOutputGateStats: no entity param — no change
```

---

## OI Status

| OI | Status |
|----|--------|
| OI-L13-004 | PREFLIGHT_COMPLETE → Ready for L13.4-B implementation |
| OI-L12-001 | DEFERRED — ExperienceLayerInsight enum migration |
