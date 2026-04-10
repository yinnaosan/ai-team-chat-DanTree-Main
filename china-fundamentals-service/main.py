"""
china-fundamentals-service
FastAPI microservice for A-share fundamentals data.
Architecture: BaoStock (Primary) → AKShare (Fallback 1) → efinance (Fallback 2)
Port: 8001
"""

import asyncio
import logging
import time
from typing import Optional
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

# ── Unified Schema ────────────────────────────────────────────────────────────
class FundamentalsData(BaseModel):
    pe: Optional[float] = None
    pb: Optional[float] = None
    roe: Optional[float] = None
    revenue: Optional[float] = None       # in CNY yuan
    netIncome: Optional[float] = None     # in CNY yuan
    grossMargin: Optional[float] = None   # 0-1 float
    netMargin: Optional[float] = None     # 0-1 float
    eps: Optional[float] = None           # in CNY yuan

class FundamentalsResponse(BaseModel):
    data: FundamentalsData
    source: str   # "baostock" | "akshare" | "efinance"
    confidence: str  # "high" | "medium" | "low"
    status: str   # "active" | "fallback_used" | "unavailable"
    symbol: str
    fetched_at: float  # unix timestamp

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

# ── Provider success check ────────────────────────────────────────────────────
def is_sufficient(data: FundamentalsData) -> bool:
    """
    Provider is considered successful if it returns at least:
    - pe OR pb
    - roe OR netMargin
    Individual missing fields are OK (return null), but if ALL core fields
    are missing, the provider is considered failed.
    """
    has_valuation = (data.pe is not None) or (data.pb is not None)
    has_profitability = (data.roe is not None) or (data.netMargin is not None)
    return has_valuation and has_profitability

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
    if BAOSTOCK_AVAILABLE:
        providers.append(("baostock", fetch_baostock, "high"))
    if AKSHARE_AVAILABLE:
        providers.append(("akshare", fetch_akshare, "medium"))
    if EFINANCE_AVAILABLE:
        providers.append(("efinance", fetch_efinance, "low"))

    used_fallback = False
    for i, (name, fetcher, confidence) in enumerate(providers):
        if i > 0:
            used_fallback = True
            await rate_limit(name)
        try:
            logger.info(f"[fetch] Trying {name} for {symbol}")
            loop = asyncio.get_event_loop()
            data = await loop.run_in_executor(None, fetcher, symbol)
            if data is None:
                logger.warning(f"[fetch] {name} returned None for {symbol}")
                continue
            if not is_sufficient(data):
                logger.warning(
                    f"[fetch] {name} insufficient for {symbol}: "
                    f"pe={data.pe}, pb={data.pb}, roe={data.roe}, netMargin={data.netMargin}"
                )
                continue
            logger.info(f"[fetch] {name} SUCCESS for {symbol}")
            return FundamentalsResponse(
                data=data,
                source=name,
                confidence=confidence,
                status="fallback_used" if used_fallback else "active",
                symbol=symbol,
                fetched_at=time.time(),
            )
        except Exception as e:
            logger.error(f"[fetch] {name} ERROR for {symbol}: {e}")
            continue

    # All providers failed
    logger.warning(f"[fetch] ALL providers failed for {symbol}")
    return FundamentalsResponse(
        data=FundamentalsData(),
        source="none",
        confidence="low",
        status="unavailable",
        symbol=symbol,
        fetched_at=time.time(),
    )

# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(title="China Fundamentals Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "providers": {
            "baostock": BAOSTOCK_AVAILABLE,
            "akshare": AKSHARE_AVAILABLE,
            "efinance": EFINANCE_AVAILABLE,
        },
        "cache_size": len(_cache),
    }

@app.get("/fundamentals", response_model=FundamentalsResponse)
async def get_fundamentals(symbol: str):
    """
    Get A-share fundamentals for a given symbol (e.g., 600519 for Moutai).
    Strips exchange suffix if provided (e.g., 600519.SS → 600519).
    """
    # Normalize symbol: strip exchange suffix
    clean = symbol.split(".")[0].strip()
    if not clean.isdigit() or len(clean) != 6:
        raise HTTPException(status_code=400, detail=f"Invalid A-share symbol: {symbol}. Expected 6-digit code.")

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001, log_level="info")
