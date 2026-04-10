"""
BaoStock Provider — Primary A-share fundamentals source.
sourceType: "official_free"
confidence: "high"

APIs used:
  - query_history_k_data_plus: peTTM, pbMRQ, psTTM, pcfNcfTTM, close
  - query_profit_data:         roeAvg, npMargin, gpMargin, netProfit, epsTTM,
                               MBRevenue, totalShare
  - query_balance_data:        currentRatio, quickRatio, liabilityToAsset,
                               assetToEquity (→ D/E = assetToEquity - 1)
  - query_growth_data:         YOYNI (net income YoY growth)
  - query_dividend_data:       dividCashPsBeforeTax (→ dividendYield = div/close)

Fiscal year logic:
  1. Try currentYear - 1 (full year Q4)
  2. If no data → try currentYear - 2
  3. If still no data → provider fail

Fields NOT available from BaoStock (return null):
  - operatingMargin (no operating income field)
  - roa (no totalAssets raw value)
  - cashFromOperations (only ratios, not absolute value)
  - freeCashFlow (not provided)
  - revenueGrowthYoy (only net income YoY available)
  - bookValuePerShare (no direct field; could compute but unstable)
"""

import logging
import threading
from datetime import datetime, timedelta
from typing import Optional, Tuple

logger = logging.getLogger("china-fundamentals.baostock")

_bs_lock = threading.Lock()

SOURCE_TYPE = "official_free"
CONFIDENCE = "high"


def _fiscal_year_to_period(year: int) -> tuple[str, str]:
    """BaoStock FY data is always Q4 (year-end). Returns (periodType, periodEndDate)."""
    return "FY", f"{year}-12-31"


def _safe_float(val) -> Optional[float]:
    """Convert to float, return None if empty/invalid."""
    if val is None:
        return None
    s = str(val).strip()
    if s in ("", "None", "nan", "--", "N/A", "-", "—"):
        return None
    try:
        f = float(s)
        return f if f == f else None  # NaN check
    except (ValueError, TypeError):
        return None


def _determine_bs_code(symbol: str) -> str:
    """Determine BaoStock exchange prefix from 6-digit code."""
    try:
        code_int = int(symbol)
    except ValueError:
        return f"sh.{symbol}"
    if 600000 <= code_int <= 699999 or 900000 <= code_int <= 999999:
        return f"sh.{symbol}"
    return f"sz.{symbol}"


def _fetch_profit_data(bs, bs_code: str, year: int) -> Tuple[Optional[dict], Optional[int]]:
    """Fetch profit data for a given year. Returns (data_dict, actual_year) or (None, None)."""
    try:
        rs = bs.query_profit_data(code=bs_code, year=year, quarter=4)
        rows = []
        while rs.error_code == "0" and rs.next():
            rows.append(rs.get_row_data())
        if rows and rs.fields:
            return dict(zip(rs.fields, rows[0])), year
    except Exception as e:
        logger.warning(f"[baostock] query_profit_data({year}) error: {e}")
    return None, None


def fetch_baostock(symbol: str) -> Optional[object]:
    """
    Fetch A-share fundamentals from BaoStock.
    symbol: 6-digit code (e.g., "600519")
    Returns FundamentalsData or None if failed.
    """
    try:
        import baostock as bs
        from main import FundamentalsData
    except ImportError as e:
        logger.error(f"[baostock] import failed: {e}")
        return None

    bs_code = _determine_bs_code(symbol)

    with _bs_lock:
        try:
            lg = bs.login()
            if lg.error_code != "0":
                logger.error(f"[baostock] login failed: {lg.error_msg}")
                return None

            # ── Initialize all fields ─────────────────────────────────────────
            pe = None
            pb = None
            ps = None
            roe = None
            revenue = None
            net_income = None
            gross_margin = None
            net_margin = None
            eps = None
            operating_margin = None   # not available from BaoStock
            roa = None                # not available (no totalAssets raw)
            debt_to_equity = None
            current_ratio = None
            cash_from_operations = None  # not available (only ratios)
            free_cash_flow = None        # not available
            revenue_growth_yoy = None    # not available (only NI growth)
            net_income_growth_yoy = None
            book_value_per_share = None  # not available directly
            dividend_yield = None
            shares_outstanding = None
            fiscal_year_used = None
            close_price = None

            # ── 1. K-data: PE / PB / PS / close (last 10 trading days) ───────
            try:
                end_date = datetime.now().strftime("%Y-%m-%d")
                start_date = (datetime.now() - timedelta(days=14)).strftime("%Y-%m-%d")
                kdata_rs = bs.query_history_k_data_plus(
                    bs_code,
                    "date,close,peTTM,pbMRQ,psTTM",
                    start_date=start_date,
                    end_date=end_date,
                    frequency="d",
                    adjustflag="3",
                )
                kdata_list = []
                while kdata_rs.error_code == "0" and kdata_rs.next():
                    kdata_list.append(kdata_rs.get_row_data())

                if kdata_list and kdata_rs.fields:
                    latest = dict(zip(kdata_rs.fields, kdata_list[-1]))
                    pe = _safe_float(latest.get("peTTM"))
                    pb = _safe_float(latest.get("pbMRQ"))
                    ps = _safe_float(latest.get("psTTM"))
                    close_price = _safe_float(latest.get("close"))
                    logger.info(f"[baostock] kdata: pe={pe}, pb={pb}, ps={ps}, close={close_price}")
            except Exception as e:
                logger.warning(f"[baostock] query_history_k_data_plus error: {e}")

            # ── 2. Profit data: ROE / margins / revenue / netIncome / EPS ─────
            # Try currentYear-1 first, then currentYear-2
            current_year = datetime.now().year
            profit_data, fiscal_year_used = _fetch_profit_data(bs, bs_code, current_year - 1)
            if profit_data is None:
                profit_data, fiscal_year_used = _fetch_profit_data(bs, bs_code, current_year - 2)

            if profit_data:
                roe = _safe_float(profit_data.get("roeAvg"))
                net_margin = _safe_float(profit_data.get("npMargin"))
                gross_margin = _safe_float(profit_data.get("gpMargin"))
                eps = _safe_float(profit_data.get("epsTTM"))
                mb_rev = _safe_float(profit_data.get("MBRevenue"))
                if mb_rev is not None:
                    revenue = mb_rev  # already in CNY yuan
                net_profit = _safe_float(profit_data.get("netProfit"))
                if net_profit is not None:
                    net_income = net_profit  # already in CNY yuan
                total_share = _safe_float(profit_data.get("totalShare"))
                if total_share is not None:
                    shares_outstanding = total_share
                logger.info(
                    f"[baostock] profit(FY{fiscal_year_used}): roe={roe}, "
                    f"netMargin={net_margin}, grossMargin={gross_margin}, "
                    f"revenue={revenue}, netIncome={net_income}"
                )
            else:
                logger.warning(f"[baostock] no profit data for {symbol} (tried FY{current_year-1} and FY{current_year-2})")

            # ── 3. Balance sheet: currentRatio / D/E ─────────────────────────
            try:
                if fiscal_year_used:
                    bs_rs = bs.query_balance_data(code=bs_code, year=fiscal_year_used, quarter=4)
                    bs_rows = []
                    while bs_rs.error_code == "0" and bs_rs.next():
                        bs_rows.append(bs_rs.get_row_data())
                    if bs_rows and bs_rs.fields:
                        bd = dict(zip(bs_rs.fields, bs_rows[0]))
                        current_ratio = _safe_float(bd.get("currentRatio"))
                        # D/E = assetToEquity - 1 (since Assets = Liabilities + Equity)
                        asset_to_equity = _safe_float(bd.get("assetToEquity"))
                        if asset_to_equity is not None and asset_to_equity > 0:
                            debt_to_equity = asset_to_equity - 1.0
                        logger.info(
                            f"[baostock] balance: currentRatio={current_ratio}, "
                            f"D/E={debt_to_equity} (from assetToEquity={asset_to_equity})"
                        )
            except Exception as e:
                logger.warning(f"[baostock] query_balance_data error: {e}")

            # ── 4. Growth data: net income YoY ───────────────────────────────
            try:
                if fiscal_year_used:
                    gr_rs = bs.query_growth_data(code=bs_code, year=fiscal_year_used, quarter=4)
                    gr_rows = []
                    while gr_rs.error_code == "0" and gr_rs.next():
                        gr_rows.append(gr_rs.get_row_data())
                    if gr_rows and gr_rs.fields:
                        gd = dict(zip(gr_rs.fields, gr_rows[0]))
                        yoy_ni = _safe_float(gd.get("YOYNI"))
                        if yoy_ni is not None:
                            net_income_growth_yoy = yoy_ni  # already 0-1 float
                        logger.info(f"[baostock] growth: netIncomeGrowthYoy={net_income_growth_yoy}")
            except Exception as e:
                logger.warning(f"[baostock] query_growth_data error: {e}")

            # ── 5. Dividend: dividendYield = dividCashPsBeforeTax / close ────
            try:
                div_rs = bs.query_dividend_data(
                    code=bs_code,
                    year=str(fiscal_year_used) if fiscal_year_used else str(current_year - 1),
                    yearType="report"
                )
                div_rows = []
                while div_rs.error_code == "0" and div_rs.next():
                    div_rows.append(div_rs.get_row_data())
                if div_rows and div_rs.fields:
                    dd = dict(zip(div_rs.fields, div_rows[0]))
                    div_cash_ps = _safe_float(dd.get("dividCashPsBeforeTax"))
                    if div_cash_ps is not None and close_price and close_price > 0:
                        dividend_yield = div_cash_ps / close_price
                    logger.info(
                        f"[baostock] dividend: dividCashPsBeforeTax={div_cash_ps}, "
                        f"dividendYield={dividend_yield}"
                    )
            except Exception as e:
                logger.warning(f"[baostock] query_dividend_data error: {e}")

            bs.logout()

            return FundamentalsData(
                # Core
                pe=pe,
                pb=pb,
                ps=ps,
                roe=roe,
                grossMargin=gross_margin,
                netMargin=net_margin,
                revenue=revenue,
                netIncome=net_income,
                eps=eps,
                # Extended
                operatingMargin=operating_margin,
                roa=roa,
                debtToEquity=debt_to_equity,
                currentRatio=current_ratio,
                cashFromOperations=cash_from_operations,
                freeCashFlow=free_cash_flow,
                revenueGrowthYoy=revenue_growth_yoy,
                netIncomeGrowthYoy=net_income_growth_yoy,
                bookValuePerShare=book_value_per_share,
                dividendYield=dividend_yield,
                sharesOutstanding=shares_outstanding,
                # Metadata
                fiscalYear=fiscal_year_used,
                periodType="FY" if fiscal_year_used else None,
                periodEndDate=f"{fiscal_year_used}-12-31" if fiscal_year_used else None,
                sourceType=SOURCE_TYPE,
                confidence=CONFIDENCE,
            )

        except Exception as e:
            logger.error(f"[baostock] unexpected error for {symbol}: {e}")
            try:
                bs.logout()
            except Exception:
                pass
            return None
