"""
china-fundamentals-service v1.1
FastAPI microservice for A-share fundamentals data.

Architecture: BaoStock (Primary) → AKShare (Fallback 1) → efinance (Fallback 2)
Port: 8001

Schema v1.1 changes:
  - Expanded FundamentalsData: 9 core + 11 extended fields
  - raw + fmt dual output in FundamentalsResponse
  - Weighted coverageScore: core * 0.7 + extended * 0.3
  - missingFields list in response
  - sourceType field per provider
  - Enhanced provider success judgment (3-group check)
  - Structured per-request logging with field coverage summary
"""

import asyncio
import logging
import time
from typing import Optional, List
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="[china-fundamentals] %(asctime)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("china-fundamentals")

# ── Field Definitions ─────────────────────────────────────────────────────────
CORE_FIELDS = ["pe", "pb", "roe", "netMargin", "grossMargin", "revenue", "netIncome", "eps", "ps"]
EXTENDED_FIELDS = [
    "operatingMargin", "roa", "debtToEquity", "currentRatio",
    "cashFromOperations", "freeCashFlow", "revenueGrowthYoy",
    "netIncomeGrowthYoy", "bookValuePerShare", "dividendYield", "sharesOutstanding"
]
ALL_FIELDS = CORE_FIELDS + EXTENDED_FIELDS


# ── Unified Schema ────────────────────────────────────────────────────────────
class FundamentalsData(BaseModel):
    # ── Core (9 fields) ──────────────────────────────────────────────────────
    pe: Optional[float] = None              # Price-to-Earnings (TTM)
    pb: Optional[float] = None              # Price-to-Book (MRQ)
    ps: Optional[float] = None              # Price-to-Sales (TTM)
    roe: Optional[float] = None             # Return on Equity (0-1 float)
    grossMargin: Optional[float] = None     # Gross Profit Margin (0-1 float)
    netMargin: Optional[float] = None       # Net Profit Margin (0-1 float)
    revenue: Optional[float] = None         # Annual Revenue (CNY yuan)
    netIncome: Optional[float] = None       # Annual Net Income (CNY yuan)
    eps: Optional[float] = None             # Earnings Per Share (CNY yuan)
    # ── Extended (11 fields) ─────────────────────────────────────────────────
    operatingMargin: Optional[float] = None     # Operating Profit Margin (0-1 float)
    roa: Optional[float] = None                 # Return on Assets (0-1 float)
    debtToEquity: Optional[float] = None        # Total Liab / Total Equity (precise)
    currentRatio: Optional[float] = None        # Current Assets / Current Liab
    cashFromOperations: Optional[float] = None  # Operating Cash Flow (CNY yuan)
    freeCashFlow: Optional[float] = None        # Free Cash Flow (CNY yuan)
    revenueGrowthYoy: Optional[float] = None    # Revenue YoY Growth (0-1 float)
    netIncomeGrowthYoy: Optional[float] = None  # Net Income YoY Growth (0-1 float)
    bookValuePerShare: Optional[float] = None   # Book Value Per Share (CNY yuan)
    dividendYield: Optional[float] = None       # Dividend Yield (0-1 float)
    sharesOutstanding: Optional[float] = None   # Shares Outstanding (count)
    # ── Metadata ─────────────────────────────────────────────────────────────
    fiscalYear: Optional[int] = None
    periodType: Optional[str] = None        # "Q1" | "Q2" | "Q3" | "FY"
    periodEndDate: Optional[str] = None     # "YYYY-MM-DD" (e.g., "2024-09-30")
    sourceType: Optional[str] = None        # "official_free" | "community_aggregated"
    confidence: Optional[str] = None        # "high" | "medium" | "low"


def _fmt_num(val: Optional[float], decimals: int = 2) -> str:
    if val is None or val != val:
        return "N/A"
    return f"{val:.{decimals}f}"


def _fmt_pct(val: Optional[float]) -> str:
    if val is None or val != val:
        return "N/A"
    return f"{val * 100:.2f}%"


def _fmt_billion(val: Optional[float]) -> str:
    """Format CNY yuan to 亿元."""
    if val is None or val != val:
        return "N/A"
    b = val / 1e8
    return f"{b:.2f}亿"


def _fmt_shares(val: Optional[float]) -> str:
    if val is None or val != val:
        return "N/A"
    b = val / 1e8
    return f"{b:.2f}亿股"


class FundamentalsRaw(BaseModel):
    """Raw numeric values (float or null)."""
    pe: Optional[float] = None
    pb: Optional[float] = None
    ps: Optional[float] = None
    roe: Optional[float] = None
    grossMargin: Optional[float] = None
    netMargin: Optional[float] = None
    revenue: Optional[float] = None
    netIncome: Optional[float] = None
    eps: Optional[float] = None
    operatingMargin: Optional[float] = None
    roa: Optional[float] = None
    debtToEquity: Optional[float] = None
    currentRatio: Optional[float] = None
    cashFromOperations: Optional[float] = None
    freeCashFlow: Optional[float] = None
    revenueGrowthYoy: Optional[float] = None
    netIncomeGrowthYoy: Optional[float] = None
    bookValuePerShare: Optional[float] = None
    dividendYield: Optional[float] = None
    sharesOutstanding: Optional[float] = None
    fiscalYear: Optional[int] = None
    periodType: Optional[str] = None
    periodEndDate: Optional[str] = None
    sourceType: Optional[str] = None
    confidence: Optional[str] = None


class FundamentalsFmt(BaseModel):
    """Human-readable formatted strings."""
    pe: str = "N/A"
    pb: str = "N/A"
    ps: str = "N/A"
    roe: str = "N/A"
    grossMargin: str = "N/A"
    netMargin: str = "N/A"
    revenue: str = "N/A"
    netIncome: str = "N/A"
    eps: str = "N/A"
    operatingMargin: str = "N/A"
    roa: str = "N/A"
    debtToEquity: str = "N/A"
    currentRatio: str = "N/A"
    cashFromOperations: str = "N/A"
    freeCashFlow: str = "N/A"
    revenueGrowthYoy: str = "N/A"
    netIncomeGrowthYoy: str = "N/A"
    bookValuePerShare: str = "N/A"
    dividendYield: str = "N/A"
    sharesOutstanding: str = "N/A"


# Fields permanently unavailable from all free providers
PERMANENTLY_UNAVAILABLE: List[str] = ["freeCashFlow"]


class FundamentalsResponse(BaseModel):
    raw: FundamentalsRaw
    fmt: FundamentalsFmt
    source: str                     # "baostock" | "akshare" | "efinance" | "none"
    sourceType: str                 # "official_free" | "community_aggregated" | "none"
    confidence: str                 # "high" | "medium" | "low"
    status: str                     # "active" | "fallback_used" | "unavailable"
    coverageScore: float            # 0-1, weighted: core*0.7 + extended*0.3
    missingFields: List[str]        # fields null for current provider/result
    permanentlyUnavailable: List[str]  # fields structurally unavailable from all free providers
    periodType: Optional[str] = None   # "Q1" | "Q2" | "Q3" | "FY" | None
    periodEndDate: Optional[str] = None  # "YYYY-MM-DD" | None
    symbol: str
    fetched_at: float               # unix timestamp


# ── In-memory Cache (24h TTL) ─────────────────────────────────────────────────
_cache: dict[str, tuple[FundamentalsResponse, float]] = {}
CACHE_TTL = 24 * 3600  # 24 hours


def cache_get(symbol: str) -> Optional[FundamentalsResponse]:
    if symbol in _cache:
        resp, ts = _cache[symbol]
        if time.time() - ts < CACHE_TTL:
            logger.info(f"[cache] HIT for {symbol}")
            return resp
        else:
            del _cache[symbol]
    return None


def cache_set(symbol: str, resp: FundamentalsResponse):
    _cache[symbol] = (resp, time.time())
    logger.info(f"[cache] SET for {symbol}")


# ── Provider imports (lazy, with error isolation) ─────────────────────────────
try:
    from baostock_provider import fetch_baostock
    BAOSTOCK_AVAILABLE = True
    logger.info("[init] baostock_provider loaded OK")
except Exception as e:
    BAOSTOCK_AVAILABLE = False
    logger.warning(f"[init] baostock_provider load failed: {e}")

try:
    from akshare_provider import fetch_akshare
    AKSHARE_AVAILABLE = True
    logger.info("[init] akshare_provider loaded OK")
except Exception as e:
    AKSHARE_AVAILABLE = False
    logger.warning(f"[init] akshare_provider load failed: {e}")

try:
    from efinance_provider import fetch_efinance
    EFINANCE_AVAILABLE = True
    logger.info("[init] efinance_provider loaded OK")
except Exception as e:
    EFINANCE_AVAILABLE = False
    logger.warning(f"[init] efinance_provider load failed: {e}")

# ── Override flags for fallback testing (set via /test/override endpoint) ─────
_provider_overrides: dict[str, bool] = {}  # e.g., {"baostock": False}


def _is_provider_enabled(name: str) -> bool:
    """Check if provider is enabled (respects test overrides)."""
    return _provider_overrides.get(name, True)


# ── Coverage Score ────────────────────────────────────────────────────────────
def compute_coverage(data: FundamentalsData) -> tuple[float, List[str]]:
    """
    Compute weighted coverage score and list of missing fields.
    core weight: 0.7, extended weight: 0.3
    """
    data_dict = data.model_dump()

    core_non_null = sum(1 for f in CORE_FIELDS if data_dict.get(f) is not None)
    extended_non_null = sum(1 for f in EXTENDED_FIELDS if data_dict.get(f) is not None)

    core_score = (core_non_null / len(CORE_FIELDS)) * 0.7
    extended_score = (extended_non_null / len(EXTENDED_FIELDS)) * 0.3
    coverage = round(core_score + extended_score, 4)

    missing = [f for f in ALL_FIELDS if data_dict.get(f) is None]

    logger.info(
        f"[coverage] core={core_non_null}/{len(CORE_FIELDS)}, "
        f"extended={extended_non_null}/{len(EXTENDED_FIELDS)}, "
        f"score={coverage:.4f}, missing={missing}"
    )
    return coverage, missing


# ── Provider success check ────────────────────────────────────────────────────
def is_sufficient(data: FundamentalsData) -> bool:
    """
    Provider is considered successful if it returns enough data from 3 groups:
    Group A (valuation): pe OR pb
    Group B (profitability): roe OR netMargin
    Group C (financials): revenue OR netIncome

    At least 2 out of 3 groups must have at least one non-null field.
    """
    group_a = (data.pe is not None) or (data.pb is not None)
    group_b = (data.roe is not None) or (data.netMargin is not None)
    group_c = (data.revenue is not None) or (data.netIncome is not None)
    groups_ok = sum([group_a, group_b, group_c])
    ok = groups_ok >= 2
    if not ok:
        logger.warning(
            f"[is_sufficient] FAIL: groupA(valuation)={group_a}, "
            f"groupB(profitability)={group_b}, groupC(financials)={group_c}"
        )
    return ok


# ── Build Response ────────────────────────────────────────────────────────────
def build_response(
    data: FundamentalsData,
    source: str,
    status: str,
    symbol: str,
) -> FundamentalsResponse:
    """Build full FundamentalsResponse with raw, fmt, coverageScore, missingFields."""
    coverage, missing = compute_coverage(data)

    raw = FundamentalsRaw(
        pe=data.pe, pb=data.pb, ps=data.ps,
        roe=data.roe, grossMargin=data.grossMargin, netMargin=data.netMargin,
        revenue=data.revenue, netIncome=data.netIncome, eps=data.eps,
        operatingMargin=data.operatingMargin, roa=data.roa,
        debtToEquity=data.debtToEquity, currentRatio=data.currentRatio,
        cashFromOperations=data.cashFromOperations, freeCashFlow=data.freeCashFlow,
        revenueGrowthYoy=data.revenueGrowthYoy, netIncomeGrowthYoy=data.netIncomeGrowthYoy,
        bookValuePerShare=data.bookValuePerShare, dividendYield=data.dividendYield,
        sharesOutstanding=data.sharesOutstanding,
        fiscalYear=data.fiscalYear,
        sourceType=data.sourceType,
        confidence=data.confidence,
    )

    fmt = FundamentalsFmt(
        pe=_fmt_num(data.pe),
        pb=_fmt_num(data.pb),
        ps=_fmt_num(data.ps),
        roe=_fmt_pct(data.roe),
        grossMargin=_fmt_pct(data.grossMargin),
        netMargin=_fmt_pct(data.netMargin),
        revenue=_fmt_billion(data.revenue),
        netIncome=_fmt_billion(data.netIncome),
        eps=_fmt_num(data.eps, 4) + " 元" if data.eps is not None else "N/A",
        operatingMargin=_fmt_pct(data.operatingMargin),
        roa=_fmt_pct(data.roa),
        debtToEquity=_fmt_num(data.debtToEquity),
        currentRatio=_fmt_num(data.currentRatio),
        cashFromOperations=_fmt_billion(data.cashFromOperations),
        freeCashFlow=_fmt_billion(data.freeCashFlow),
        revenueGrowthYoy=_fmt_pct(data.revenueGrowthYoy),
        netIncomeGrowthYoy=_fmt_pct(data.netIncomeGrowthYoy),
        bookValuePerShare=_fmt_num(data.bookValuePerShare, 4) + " 元" if data.bookValuePerShare is not None else "N/A",
        dividendYield=_fmt_pct(data.dividendYield),
        sharesOutstanding=_fmt_shares(data.sharesOutstanding),
    )

    return FundamentalsResponse(
        raw=raw,
        fmt=fmt,
        source=source,
        sourceType=data.sourceType or "none",
        confidence=data.confidence or "low",
        status=status,
        coverageScore=coverage,
        missingFields=missing,
        permanentlyUnavailable=PERMANENTLY_UNAVAILABLE,
        periodType=data.periodType,
        periodEndDate=data.periodEndDate,
        symbol=symbol,
        fetched_at=time.time(),
    )


# ── Rate limiting helper ──────────────────────────────────────────────────────
_last_call: dict[str, float] = {}
MIN_INTERVAL = 0.2  # 200ms between calls per provider


async def rate_limit(provider: str):
    now = time.time()
    last = _last_call.get(provider, 0)
    wait = MIN_INTERVAL - (now - last)
    if wait > 0:
        await asyncio.sleep(wait)
    _last_call[provider] = time.time()


# ── Fallback orchestration ────────────────────────────────────────────────────
async def fetch_with_fallback(symbol: str) -> FundamentalsResponse:
    providers = []
    if BAOSTOCK_AVAILABLE and _is_provider_enabled("baostock"):
        providers.append(("baostock", fetch_baostock))
    if AKSHARE_AVAILABLE and _is_provider_enabled("akshare"):
        providers.append(("akshare", fetch_akshare))
    if EFINANCE_AVAILABLE and _is_provider_enabled("efinance"):
        providers.append(("efinance", fetch_efinance))

    used_fallback = False
    for i, (name, fetcher) in enumerate(providers):
        if i > 0:
            used_fallback = True
            await rate_limit(name)
        try:
            logger.info(f"[fetch] Trying provider={name} for symbol={symbol}")
            loop = asyncio.get_event_loop()
            try:
                data = await asyncio.wait_for(
                    loop.run_in_executor(None, fetcher, symbol),
                    timeout=20.0,  # 20s hard timeout per provider
                )
            except asyncio.TimeoutError:
                logger.warning(f"[fetch] {name} TIMEOUT (20s) for {symbol} → try next")
                continue

            if data is None:
                logger.warning(f"[fetch] {name} returned None for {symbol} → try next")
                continue

            if not is_sufficient(data):
                logger.warning(f"[fetch] {name} insufficient for {symbol} → try next")
                continue

            coverage, missing = compute_coverage(data)
            status = "fallback_used" if used_fallback else "active"
            logger.info(
                f"[fetch] SUCCESS provider={name} symbol={symbol} "
                f"status={status} coverage={coverage:.4f} missing={missing}"
            )
            return build_response(data, name, status, symbol)

        except Exception as e:
            logger.error(f"[fetch] {name} ERROR for {symbol}: {e}")
            continue

    # All providers failed
    logger.warning(f"[fetch] ALL providers failed for {symbol}")
    empty = FundamentalsData()
    return build_response(empty, "none", "unavailable", symbol)


# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(title="China Fundamentals Service", version="1.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "version": "1.2.0",
        "providers": {
            "baostock": BAOSTOCK_AVAILABLE and _is_provider_enabled("baostock"),
            "akshare": AKSHARE_AVAILABLE and _is_provider_enabled("akshare"),
            "efinance": EFINANCE_AVAILABLE and _is_provider_enabled("efinance"),
        },
        "overrides": _provider_overrides,
        "cache_size": len(_cache),
    }


@app.get("/fundamentals", response_model=FundamentalsResponse)
async def get_fundamentals(symbol: str):
    """
    Get A-share fundamentals for a given symbol (e.g., 600519 for Moutai).
    Strips exchange suffix if provided (e.g., 600519.SS → 600519).
    """
    clean = symbol.split(".")[0].strip()
    if not clean.isdigit() or len(clean) != 6:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid A-share symbol: {symbol}. Expected 6-digit code."
        )

    # Check cache first
    cached = cache_get(clean)
    if cached:
        return cached

    # Fetch with fallback
    result = await fetch_with_fallback(clean)

    # Cache successful and partial results (not unavailable)
    if result.status != "unavailable":
        cache_set(clean, result)

    return result


@app.delete("/cache/{symbol}")
async def clear_cache(symbol: str):
    """Clear cache for a specific symbol (for testing)."""
    clean = symbol.split(".")[0].strip()
    if clean in _cache:
        del _cache[clean]
        return {"cleared": True, "symbol": clean}
    return {"cleared": False, "symbol": clean}


@app.delete("/cache")
async def clear_all_cache():
    """Clear entire cache."""
    count = len(_cache)
    _cache.clear()
    return {"cleared": count}


# ── Test override endpoints (for fallback validation only) ────────────────────
@app.post("/test/override")
async def set_provider_override(provider: str, enabled: bool):
    """
    Temporarily enable/disable a provider for fallback testing.
    Use DELETE /test/override to restore all providers.
    """
    _provider_overrides[provider] = enabled
    logger.warning(f"[TEST OVERRIDE] provider={provider} enabled={enabled}")
    return {"provider": provider, "enabled": enabled, "overrides": _provider_overrides}


@app.delete("/test/override")
async def clear_provider_overrides():
    """Restore all providers to default (clear all overrides)."""
    _provider_overrides.clear()
    logger.info("[TEST OVERRIDE] All overrides cleared — providers restored to default")
    return {"cleared": True, "overrides": _provider_overrides}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001, log_level="info")
