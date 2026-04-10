"""
efinance Provider — Fallback 2 for A-share fundamentals.
sourceType: "third_party_free"
confidence: "low"

APIs used:
  - ef.stock.get_base_info: PE / PB / ROE / 毛利率 / 净利率 / 净利润 / 总市值

Coverage note:
  efinance only exposes get_base_info for individual stock fundamentals.
  Fields not available: revenue, EPS, BVPS, D/E, currentRatio, cashFlow, growth rates.
  These return null. This is a data source limitation, not a bug.

Provider success criteria:
  At least (pe or pb) AND (roe or netMargin) must be non-null.
"""

import logging
import time
from typing import Optional

logger = logging.getLogger("china-fundamentals.efinance")

SOURCE_TYPE = "third_party_free"
CONFIDENCE = "low"


def _safe_float(val) -> Optional[float]:
    if val is None:
        return None
    s = str(val).strip().replace(",", "")
    if s in ("", "None", "nan", "--", "N/A", "-", "—", "无", "NaN"):
        return None
    try:
        f = float(s)
        return f if f == f else None  # filter NaN
    except (ValueError, TypeError):
        return None


def _pct_to_float(val) -> Optional[float]:
    """Convert raw percentage value (e.g., 38.43 → 0.3843)."""
    f = _safe_float(val)
    if f is None:
        return None
    # efinance returns percentages as raw numbers (e.g., 91.29 for 91.29%)
    if abs(f) > 1:
        return f / 100.0
    return f


def fetch_efinance(symbol: str) -> Optional[object]:
    """
    Fetch A-share fundamentals from efinance.
    symbol: 6-digit code (e.g., "600519")
    Returns FundamentalsData or None if core fields missing.
    """
    try:
        import efinance as ef
        import warnings
        warnings.filterwarnings('ignore')
        from main import FundamentalsData
    except ImportError as e:
        logger.error(f"[efinance] import failed: {e}")
        return None

    pe = None
    pb = None
    ps = None
    roe = None
    gross_margin = None
    net_margin = None
    net_income = None
    total_market_cap = None

    # ── get_base_info ─────────────────────────────────────────────────────────
    try:
        time.sleep(0.2)
        info = ef.stock.get_base_info(symbol)
        if info is not None:
            pe = _safe_float(info.get('市盈率(动)'))
            pb = _safe_float(info.get('市净率'))
            roe_raw = _safe_float(info.get('ROE'))
            # ROE from efinance is in percentage form (e.g., 24.64 means 24.64%)
            roe = _pct_to_float(roe_raw)
            gross_margin = _pct_to_float(info.get('毛利率'))
            net_margin = _pct_to_float(info.get('净利率'))
            net_income = _safe_float(info.get('净利润'))
            total_market_cap = _safe_float(info.get('总市值'))

            # PS = totalMarketCap / revenue — revenue not available in get_base_info
            # Cannot compute PS; leave as None

            logger.info(
                f"[efinance] get_base_info: pe={pe}, pb={pb}, roe={roe}, "
                f"grossMargin={gross_margin}, netMargin={net_margin}, "
                f"netIncome={net_income}, mktCap={total_market_cap}"
            )
    except Exception as e:
        logger.warning(f"[efinance] get_base_info error: {e}")

    return FundamentalsData(
        # Core
        pe=pe,
        pb=pb,
        ps=ps,           # not available
        roe=roe,
        grossMargin=gross_margin,
        netMargin=net_margin,
        revenue=None,    # not available in efinance
        netIncome=net_income,
        eps=None,        # not available
        # Extended — all null for efinance
        operatingMargin=None,
        roa=None,
        debtToEquity=None,
        currentRatio=None,
        cashFromOperations=None,
        freeCashFlow=None,
        revenueGrowthYoy=None,
        netIncomeGrowthYoy=None,
        bookValuePerShare=None,
        dividendYield=None,
        sharesOutstanding=None,
        # Metadata
        fiscalYear=None,
        sourceType=SOURCE_TYPE,
        confidence=CONFIDENCE,
    )
