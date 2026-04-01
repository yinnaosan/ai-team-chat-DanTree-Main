# L13.4A — Active Research Entity Binding Preflight

**Date:** 2026-04-01
**Type:** DISCOVERY-ONLY
**Production files modified:** NONE

---

## 1. Source of Truth for Active Research Entity

**Primary source:** `currentTicker` — a `useState<string>("")` in `ResearchWorkspacePage` (client/src/pages/ResearchWorkspace.tsx, line 1585).

**Persistence chain:**
1. On mount: loaded from `trpc.rpa.getConfig` → `rpaConfig.lastTicker` (server-side DB, per-user)
2. On change: auto-saved via `trpc.rpa.setConfig.useMutation({ lastTicker: currentTicker })` (line 1691)
3. Fallback: if no lastTicker, picks from watchlist or random pool

**Key facts:**
- `currentTicker` is **local React state** in ResearchWorkspace — not in a global context, not in URL params, not in localStorage
- `TerminalEntry.tsx` is a **separate route** (`/terminal-entry`) — it has no access to ResearchWorkspace's state
- The only cross-session persistence is `rpaConfig.lastTicker` in the DB via `trpc.rpa.getConfig`

---

## 2. Files/Functions Needed for Entity Binding

| File | Change Needed |
|------|---------------|
| `client/src/pages/TerminalEntry.tsx` | Add `trpc.rpa.getConfig.useQuery()` to read `lastTicker`; replace hardcoded `"AAPL"` in 3 query calls |
| No server changes needed | `trpc.rpa.getConfig` is already a `protectedProcedure` that returns `lastTicker` |

**Approximate lines:** ~10 lines total (1 new hook + 3 variable substitutions)

---

## 3. MANUS_DIRECT Feasibility

**FEASIBLE_WITHOUT_CLAUDE = YES**

The patch is purely mechanical:
```tsx
// Add hook (requires user to be logged in)
const { data: rpaConfig } = trpc.rpa.getConfig.useQuery(undefined, {
  staleTime: 30_000,
  enabled: !!user,
});
const activeEntity = rpaConfig?.lastTicker ?? "AAPL";

// Replace 3 hardcoded "AAPL" occurrences:
// 1. getSourceSelectionStats: { entity: activeEntity }
// 2. getSemanticStats: { entity: activeEntity, timeframe: "mid" }
// 3. getOutputGateStats: (no entity param — no change needed)
```

---

## 4. Minimal Patch Plan

**Slice 1 (safest, recommended):** TerminalEntry.tsx only
- Add `trpc.rpa.getConfig.useQuery` hook after existing hooks (line ~317)
- Derive `activeEntity = rpaConfig?.lastTicker ?? "AAPL"` (1 line)
- Replace `entity: "AAPL"` in `getSourceSelectionStats` call (line ~311)
- Replace `entity: "AAPL"` in `getSemanticStats` call (line ~323)
- `getOutputGateStats` takes no entity param — no change needed

**Total: ~5 lines changed, 1 line added**

---

## 5. Blockers, Hidden Coupling, Ambiguity

| Issue | Severity | Notes |
|-------|----------|-------|
| `trpc.rpa.getConfig` is `protectedProcedure` | LOW | TerminalEntry already has `useAuth()` — `enabled: !!user` guard handles unauthenticated state gracefully |
| TerminalEntry is shown pre-login | LOW | `activeEntity` falls back to `"AAPL"` when `rpaConfig` is null — no visual regression |
| `getOutputGateStats` has no entity param | INFO | It returns a system-level gate result, not entity-specific — no binding needed |
| `lastTicker` may be stale if user hasn't opened ResearchWorkspace | INFO | Acceptable — Terminal is a status display, not a live trading tool |

**No blockers. No hidden coupling.**

---

## 6. Confirmation

No production files were modified in this preflight task.
