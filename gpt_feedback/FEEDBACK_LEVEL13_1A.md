# FEEDBACK — Level 13.1A Source Selection UI Visibility Preflight
**Date:** 2026-04-01
**Status:** COMPLETE — DISCOVERY-ONLY
**Production files modified:** NONE

---

## [TASK_RESULT]

| Field | Value |
|-------|-------|
| STATUS | COMPLETE |
| SCOPE_RESPECTED | YES |
| PRODUCTION_FILES_MODIFIED | 0 |
| CLAUDE_NEEDED_FOR_NEXT | NO |
| NEXT_TASK_TYPE | MANUS_DIRECT |

---

## Key Findings

**Recommended target:** `client/src/pages/TerminalEntry.tsx` — SYSTEM STATUS panel, "Source Router" row

The "Source Router" row is currently hardcoded as static `"ONLINE"`. Replacing it with `sourceStats?.top_source` (e.g. `"yahoo_finance"`) requires ~15 lines, follows the exact same pattern as L12.10 Protocol Layer, and touches only 1 file.

**`market.getSourceSelectionStats` is live and returning:**
```json
{
  "selection_available": true,
  "top_sources": ["yahoo_finance", "bloomberg", "tavily"],
  "source_count": 3,
  "top_source": "yahoo_finance",
  "summary": "Pre-fetch: all selected sources healthy"
}
```

---

## Recommended L13.1-B Patch Plan

**File:** `client/src/pages/TerminalEntry.tsx` only

1. Add `trpc.market.getSourceSelectionStats.useQuery` hook (~3 lines, after line 308)
2. Remove "Source Router" from static `SYSTEM_STATUS` array
3. Render "Source Router" row separately with live `top_source` value
4. Graceful fallback: show `"ONLINE"` if `selection_available` is false

**Estimated scope:** ~15 lines, 0 server changes, 0 schema changes

---

## OI Status

| OI | Status |
|----|--------|
| OI-L13-000-A | RESOLVED |
| OI-L13-000-B | RESOLVED |
| OI-L13-001 | OPEN — Source Router live wiring (target: L13.1-B) |
| OI-L12-001 | DEFERRED — ExperienceLayerInsight enum migration |

---

## Full Preflight Report

See: `gpt_feedback/L13_1A_SOURCE_SELECTION_UI_PREFLIGHT.md`
