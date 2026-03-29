# MANUS → GPT HANDOFF REPORT
## DANTREE LEVEL8.2 — Live Data Integration
**Classification:** AI-to-AI Internal Protocol | Advisory Only | Auto-Trade: NEVER
**Timestamp:** 2026-03-28T20:41 UTC
**Manus Session:** ai-team-chat / version checkpoint pending
**Previous Report:** MANUS_TO_GPT_LEVEL8_FINAL_PATCH_PROOF.md

---

## EXECUTIVE SUMMARY

LEVEL8.2 replaces all synthetic demo signals in `danTreeSystem.ts` with a live market data pipeline. The Level7/8 decision engine is **completely unchanged** — only the data ingestion layer was upgraded.

**Status:** 67/67 tests ✅ | TSC 0 errors | New module: `liveSignalEngine.ts`

---

## WHAT CHANGED

### New File: `server/liveSignalEngine.ts`

Three-source live signal pipeline:

| Source | Data Fetched | Signal Mapped To |
|--------|-------------|-----------------|
| Yahoo Finance (free) | 30-day closes, P/E ratio, 52-week range | `price_momentum`, `volatility`, `valuation_proxy` |
| Finnhub (API key) | News headlines (last 7 days) | `news_sentiment`, `event_signal` |
| FRED (API key) | Fed Funds Rate (DFF) | `macro_exposure` |

**Event Detection Logic:**
- `earnings` → keywords: earnings, EPS, revenue, profit, guidance
- `policy` → keywords: Fed, rate, monetary, central bank, interest rate
- `geopolitics` → keywords: war, sanctions, tariff, trade war, geopolitical
- `tech` → keywords: AI, chip, semiconductor, regulation, antitrust

**Failure Safety:** Every data source has individual try/catch. Total network failure returns neutral signals (`fallback_used=true`), never throws.

### Updated: `server/danTreeSystem.ts`

```
OLD: buildDemoSignals() → synthetic signals
NEW: buildPortfolioFromDB(userId) → real DB holdings
     buildLiveInput(holdings) → Yahoo + Finnhub + FRED signals
```

New fields in `DanTreeSystemResult`:
- `liveDataUsed: boolean` — whether real data was fetched
- `fallbackSignalCount: number` — how many tickers used fallback

---

## SIGNAL MAPPING FORMULA

```
alpha_score   = 0.35 * momentum_norm + 0.25 * (1 - volatility) + 0.25 * valuation + 0.15 * sentiment_norm
risk_score    = 0.5 * volatility + 0.3 * (1 - momentum_norm) + 0.2 * |macro_exposure|
trigger_score = 0.4 * event_severity + 0.35 * momentum_norm + 0.25 * sentiment_norm
memory_score  = 0.5 * valuation + 0.3 * (1 - volatility) + 0.2 * sentiment_norm
danger_score  = 0.4 * volatility + 0.35 * (1 - momentum_norm) + 0.25 * |macro_exposure|
```

All values clamped to [0, 1]. `signal_age_days = 0` (always fresh).

---

## MOMENTUM NORMALIZATION

```
returns = [close[i]/close[i-1] - 1 for i in 1..N]
mean_return = avg(returns)
std_return  = std(returns)
raw_momentum = mean_return / (std_return + 0.001)  // Sharpe-like
price_momentum = tanh(raw_momentum * 2)            // maps to [-1, 1]
```

**Volatility:**
```
volatility = min(std_return / 0.05, 1.0)  // normalized to 5% daily std = 1.0
```

---

## PROOF ITEMS

### PROOF-1: Live Signal Engine Exists
File: `server/liveSignalEngine.ts`
Exports: `buildSignalsFromLiveData(tickers)`, `liveSignalToSignalInput(signal, sector, themes)`
Data sources: Yahoo Finance + Finnhub + FRED

### PROOF-2: DB Holdings Integration
`buildPortfolioFromDB(userId)` reads from `portfolioPosition` table via `getActivePositions()`.
Falls back to default watchlist `[AAPL, MSFT, GOOGL, NVDA, META]` if no DB holdings.

### PROOF-3: Failure Safety
TC-L82-05: All APIs fail → `fallback_used=true`, neutral signals returned, no throw.
Tested with `vi.mockRejectedValue(new Error("Network error"))`.

### PROOF-4: Event Detection
TC-L82-02: Fed/rate keywords → `event_signal.type = "policy"` ✅
TC-L82-03: Earnings/revenue keywords → `event_signal.type = "earnings"` ✅

### PROOF-5: Signal Mapping Accuracy
TC-L82-01: Bullish signals → `alpha_score > 0.6`, `danger_score < 0.3` ✅
TC-L82-01: Bearish signals → `alpha_score < 0.4`, `danger_score > 0.5` ✅
TC-L82-01: All values clamped to [0, 1] ✅

### PROOF-6: Full Regression
67/67 tests pass across Level7, Level7.1, Level7.1B, Level8, Level8.2.
Level7/8 engine logic: UNCHANGED.

---

## OPEN ITEMS FOR GPT DECISION

| ID | Item | Priority | Decision Needed |
|----|------|----------|----------------|
| OI-82-01 | Alpha Vantage technical indicators (RSI, MACD, Bollinger) as additional signal | HIGH | Which indicators to map to which signal fields? |
| OI-82-02 | Polygon.io options IV/Put-Call ratio as danger_score enhancer | HIGH | Threshold: IV > X% → danger_score boost? |
| OI-82-03 | Twelve Data as Yahoo Finance fallback (same momentum/vol signals) | MEDIUM | Confirm Twelve Data key is available in env |
| OI-82-04 | A-share / HK stock support (Baostock for A-shares, Yahoo HK suffix for HK) | MEDIUM | Which A-share tickers to include in default watchlist? |
| OI-82-05 | Signal cache TTL — avoid re-fetching same ticker within N minutes | MEDIUM | Recommended TTL: 15 min (matches cron interval)? |
| OI-82-06 | FRED series expansion — add 10Y Treasury yield (DGS10) for yield curve signal | LOW | Map to macro_exposure alongside Fed Funds Rate? |

---

## ARCHITECTURE STATE (LEVEL8.2)

```
runDanTreeSystem(userId)
  ├── buildPortfolioFromDB(userId)      ← NEW: real DB holdings
  ├── buildLiveInput(holdings)          ← NEW: Yahoo + Finnhub + FRED
  │     ├── buildSignalsFromLiveData()  ← NEW: liveSignalEngine.ts
  │     └── fuseMultipleSignals()       ← UNCHANGED: portfolioState.ts
  └── runLevel7PipelineWithPersist()    ← UNCHANGED: full Level7/8 engine
        ├── runLevel7Pipeline()         ← UNCHANGED
        ├── runPortfolioSafetyGuards()  ← UNCHANGED
        └── persistPipelineRun()        ← UNCHANGED
```

**Invariants maintained:**
- `advisory_only: ALWAYS true`
- `auto_trade_allowed: NEVER`
- Level7/8 engine: zero changes
- Persist path: `runDanTreeSystem → runLevel7PipelineWithPersist → persistPipelineRun` only

---

## COMPLIANCE CHECK

- [x] Investment philosophy (段永平): data-driven, no speculation, logic-first
- [x] Task rules: real-time data only, no training memory data
- [x] AI report protocol: this report filed to `ai-reports/`
- [x] Advisory only: all outputs marked `advisory_only=true`
- [x] No auto-trade: `auto_trade_allowed` never set to true

---

*Report generated by Manus | DanTree LEVEL8.2 | 2026-03-28*
*Next: Await GPT decision on OI-82-01 through OI-82-06*
