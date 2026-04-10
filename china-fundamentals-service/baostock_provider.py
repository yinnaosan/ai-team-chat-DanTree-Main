"""
BaoStock Provider — Primary A-share fundamentals source.

Fields fetched:
  - query_profit_data: roeAvg, netProfitMargin, grossProfitMargin, revenue, netProfit
  - query_history_k_data_plus: peTTM, pbMRQ (last trading day snapshot)
  - query_stock_basic: EPS (via profit data)

BaoStock requires login/logout per session. Thread-safe via lock.
"""

import logging
import threading
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger("china-fundamentals.baostock")

_bs_lock = threading.Lock()

def _safe_float(val) -> Optional[float]:
    """Convert to float, return None if empty/invalid."""
    if val is None:
        return None
    s = str(val).strip()
    if s in ("", "None", "nan", "--", "N/A"):
        return None
    try:
        f = float(s)
        return f if f == f else None  # NaN check
    except (ValueError, TypeError):
        return None

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

    # Determine exchange prefix
    code_int = int(symbol)
    if 600000 <= code_int <= 699999 or 900000 <= code_int <= 999999:
        bs_code = f"sh.{symbol}"
    else:
        bs_code = f"sz.{symbol}"

    with _bs_lock:
        try:
            # Login
            lg = bs.login()
            if lg.error_code != "0":
                logger.error(f"[baostock] login failed: {lg.error_msg}")
                return None

            pe = None
            pb = None
            roe = None
            revenue = None
            net_income = None
            gross_margin = None
            net_margin = None
            eps = None

            # ── 1. Profit data (annual, latest year) ─────────────────────────
            try:
                year = datetime.now().year - 1  # last full fiscal year
                profit_rs = bs.query_profit_data(
                    code=bs_code,
                    year=year,
                    quarter=4,  # Q4 = full year
                )
                profit_list = []
                while profit_rs.error_code == "0" and profit_rs.next():
                    profit_list.append(profit_rs.get_row_data())

                if not profit_list:
                    # Try previous year
                    profit_rs2 = bs.query_profit_data(
                        code=bs_code,
                        year=year - 1,
                        quarter=4,
                    )
                    while profit_rs2.error_code == "0" and profit_rs2.next():
                        profit_list.append(profit_rs2.get_row_data())

                if profit_list:
                    # Fields: code, pubDate, statDate, roeAvg, npMargin, gpMargin,
                    #         netProfit, epsTTM, MBRevenue, totalShare, liqaShare
                    row = profit_list[0]
                    fields = profit_rs.fields if hasattr(profit_rs, 'fields') else []
                    # Try to map by field name
                    if fields:
                        d = dict(zip(fields, row))
                        roe = _safe_float(d.get("roeAvg"))
                        net_margin = _safe_float(d.get("npMargin"))
                        gross_margin = _safe_float(d.get("gpMargin"))
                        eps = _safe_float(d.get("epsTTM"))
                        # MBRevenue and netProfit are in CNY yuan (not 万元)
                        mb_rev = _safe_float(d.get("MBRevenue"))
                        if mb_rev is not None:
                            revenue = mb_rev  # already in CNY yuan
                        net_profit = _safe_float(d.get("netProfit"))
                        if net_profit is not None:
                            net_income = net_profit  # already in CNY yuan
                    else:
                        # Fallback positional (order from BaoStock docs)
                        # 0:code, 1:pubDate, 2:statDate, 3:roeAvg, 4:npMargin,
                        # 5:gpMargin, 6:netProfit, 7:epsTTM, 8:MBRevenue
                        if len(row) >= 9:
                            roe = _safe_float(row[3])
                            net_margin = _safe_float(row[4])
                            gross_margin = _safe_float(row[5])
                            net_profit_raw = _safe_float(row[6])
                            if net_profit_raw is not None:
                                net_income = net_profit_raw  # already in CNY yuan
                            eps = _safe_float(row[7])
                            mb_rev_raw = _safe_float(row[8])
                            if mb_rev_raw is not None:
                                revenue = mb_rev_raw  # already in CNY yuan

                    logger.info(f"[baostock] profit data: roe={roe}, netMargin={net_margin}, grossMargin={gross_margin}")
            except Exception as e:
                logger.warning(f"[baostock] query_profit_data error: {e}")

            # ── 2. K-data for PE/PB (last 5 trading days, take latest) ───────
            try:
                end_date = datetime.now().strftime("%Y-%m-%d")
                start_date = (datetime.now() - timedelta(days=10)).strftime("%Y-%m-%d")
                kdata_rs = bs.query_history_k_data_plus(
                    bs_code,
                    "date,peTTM,pbMRQ,psTTM",
                    start_date=start_date,
                    end_date=end_date,
                    frequency="d",
                    adjustflag="3",
                )
                kdata_list = []
                while kdata_rs.error_code == "0" and kdata_rs.next():
                    kdata_list.append(kdata_rs.get_row_data())

                if kdata_list:
                    # Take the most recent row
                    latest = kdata_list[-1]
                    # Fields: date, peTTM, pbMRQ, psTTM
                    if len(latest) >= 4:
                        pe = _safe_float(latest[1])
                        pb = _safe_float(latest[2])
                    logger.info(f"[baostock] kdata: pe={pe}, pb={pb}")
            except Exception as e:
                logger.warning(f"[baostock] query_history_k_data_plus error: {e}")

            bs.logout()

            return FundamentalsData(
                pe=pe,
                pb=pb,
                roe=roe,
                revenue=revenue,
                netIncome=net_income,
                grossMargin=gross_margin,
                netMargin=net_margin,
                eps=eps,
            )

        except Exception as e:
            logger.error(f"[baostock] unexpected error for {symbol}: {e}")
            try:
                bs.logout()
            except Exception:
                pass
            return None
