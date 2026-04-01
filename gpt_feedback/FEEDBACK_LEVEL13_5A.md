# FEEDBACK: LEVEL 13.5A — ENGINE STATS Active Entity Label

**Status:** COMPLETE
**Date:** 2026-04-01
**Files Modified:** client/src/pages/TerminalEntry.tsx (1 file, frontend-only, 6 lines)
**Files Created:** gpt_feedback/FEEDBACK_LEVEL13_5A.md

---

## Summary

Level 13.5A implemented the ENGINE STATS active entity label. The ENGINE STATS panel header now displays the active research entity (e.g., `· AAPL`) alongside the title, giving users immediate visual confirmation of which entity the live panels are reflecting.

### Change Applied

**client/src/pages/TerminalEntry.tsx** — ENGINE STATS panel header (line 418–424):

```tsx
<div className="te-panel-header">
  <span className="te-panel-label">ENGINE STATS</span>
  {/* [Level13.5A] Active entity label — OI-L13-005 */}
  {activeEntity && activeEntity !== "AAPL" ? (
    <span className="te-status-text" style={{ fontSize: "10px", opacity: 0.7, marginLeft: "6px" }}>· {activeEntity}</span>
  ) : (
    <span className="te-status-text" style={{ fontSize: "10px", opacity: 0.45, marginLeft: "6px" }}>· AAPL</span>
  )}
</div>
```

**Behavior:**
- When `activeEntity` is a non-default ticker (e.g., `NVDA`): label shows at 70% opacity — `ENGINE STATS · NVDA`
- When `activeEntity` is `AAPL` (default/fallback): label shows at 45% opacity — `ENGINE STATS · AAPL`
- No server changes, no new hooks, no new queries

---

## Test Results

| Layer | Result |
|-------|--------|
| TSC | ✅ 0 errors |
| Full Regression | ✅ 1679/1685 passed |
| Pre-existing failures | 6 (server/financeDatabaseApi.test.ts — environment dependency, unchanged) |

---

## OI Status

| OI | Status |
|----|--------|
| OI-L13-005 | ✅ RESOLVED — ENGINE STATS entity label complete |
| OI-L13-004 | ✅ RESOLVED (L13.4B) — Active entity binding |
| OI-L13-003 | ✅ RESOLVED (L13.3A) — Output Gate UI live wiring |
| OI-L13-002 | ✅ RESOLVED (L13.2B) — OutputGateResult layer |
| OI-L13-001 | ✅ RESOLVED (L13.1B) — Source Router live wiring |
| OI-L12-001 | DEFERRED — ExperienceLayerInsight enum migration |

---

## Terminal Live Panel — Final State (Level 13.x Series Complete)

| Feature | Status | Level |
|---------|--------|-------|
| Source Router → real `top_source` | ✅ Live | L13.1B |
| Protocol Layer → real Direction/Confidence/Conflicts | ✅ Live | L12.10 |
| Output Gate → real Evidence/Mode/Gate Status | ✅ Live | L13.3A |
| All panels bound to `activeEntity` | ✅ Live | L13.4B |
| ENGINE STATS header shows entity label | ✅ Live | L13.5A |

---

## Observation: Protocol Layer Direction = "unavailable"

Current behavior: `market.getSemanticStats` returns `direction: "unavailable"` for `AAPL` in the Terminal context.

**Root cause:** `buildSemanticActivationResult` requires a full `DeepResearchContextMap` (populated during a live research session). The Terminal entry page calls it with a stub context, which produces `unavailable` as the graceful fallback.

**This is correct behavior** — the Terminal is a pre-login entry page, not a research session. Direction data is only meaningful after the user runs a full analysis. No fix needed.

---

## Next Recommended Steps

1. **OI-L12-001 (ExperienceLayerInsight enum migration)**: Oldest unresolved OI, deferred since L12.1. Recommend next Claude task batch.

2. **financeDatabaseApi pre-existing failures**: `sudo pip3 install financedatabase` eliminates 6 failures, achieves 1685/1685.

3. **Level 14.x planning**: Terminal live panel series is now complete. Consider what the next major capability layer should be (e.g., multi-entity comparison, portfolio-level analysis, or alert/notification system).
