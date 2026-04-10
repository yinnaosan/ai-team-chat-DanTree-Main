"""
efinance Provider — Fallback 2 for A-share fundamentals.

Endpoints used:
  - ef.stock.get_profit_statement: revenue / net income
  - ef.stock.get_balance_sheet: total equity (for ROE calc)
  - ef.stock.get_cash_flow_statement: FCF (optional)
  - ef.stock.get_realtime_quotes: PE / PB (real-time)

Computed fields:
  - grossMargin = 毛利润 / 营收
  - netMargin = 净利润 / 营收
  - ROE = 净利润 / 净资产 (if balance sheet available)
"""

import logging
import time
from typing import Optional

logger = logging.getLogger("china-fundamentals.efinance")

def _safe_float(val) -> Optional[float]:
    if val is None:
        return None
    s = str(val).strip().replace(",", "")
    if s in ("", "None", "nan", "--", "N/A", "-", "—"):
        return None
    try:
        f = float(s)
        return f if f == f else None
    except (ValueError, TypeError):
        return None

def _pct_to_float(val) -> Optional[float]:
    f = _safe_float(val)
    if f is None:
        return None
    if abs(f) > 1:
        return f / 100.0
    return f

def fetch_efinance(symbol: str) -> Optional[object]:
    """
    Fetch A-share fundamentals from efinance.
    symbol: 6-digit code (e.g., "600519")
    Returns FundamentalsData or None if all core fields missing.
    """
    try:
        import efinance as ef
        from main import FundamentalsData
    except ImportError as e:
        logger.error(f"[efinance] import failed: {e}")
        return None

    pe = None
    pb = None
    roe = None
    revenue = None
    net_income = None
    gross_margin = None
    net_margin = None
    eps = None

    # ── 1. Real-time quotes → PE / PB ────────────────────────────────────────
    try:
        time.sleep(0.2)
        quotes = ef.stock.get_realtime_quotes(stock_codes=[symbol])
        if quotes is not None and not quotes.empty:
            row = quotes.iloc[0]
            # efinance quote columns vary by version; try common names
            pe_raw = (
                row.get("市盈率(动)")
                or row.get("市盈率-动态")
                or row.get("动态市盈率")
                or row.get("市盈率")
            )
            pb_raw = row.get("市净率") or row.get("市净率(MRQ)")
            pe = _safe_float(pe_raw)
            pb = _safe_float(pb_raw)
            
            # EPS if available
            eps_raw = row.get("每股收益") or row.get("基本每股收益")
            eps = _safe_float(eps_raw)
            
            logger.info(f"[efinance] realtime_quotes: pe={pe}, pb={pb}, eps={eps}")
    except Exception as e:
        logger.warning(f"[efinance] get_realtime_quotes error: {e}")

    # ── 2. Profit statement → revenue / net income / gross margin ────────────
    try:
        time.sleep(0.2)
        profit_df = ef.stock.get_profit_statement(stock=symbol)
        if profit_df is not None and not profit_df.empty:
            # Sort by date desc, take latest annual report
            if "报告期" in profit_df.columns:
                profit_df = profit_df.sort_values("报告期", ascending=False)
            elif "REPORT_DATE" in profit_df.columns:
                profit_df = profit_df.sort_values("REPORT_DATE", ascending=False)
            
            latest = profit_df.iloc[0]
            
            # Revenue
            rev_raw = (
                latest.get("营业总收入")
                or latest.get("营业收入")
                or latest.get("TOTAL_OPERATE_INCOME")
                or latest.get("OPERATE_INCOME")
            )
            revenue = _safe_float(rev_raw)
            
            # Net income
            ni_raw = (
                latest.get("净利润")
                or latest.get("归属于母公司所有者的净利润")
                or latest.get("PARENT_NETPROFIT")
                or latest.get("NET_PROFIT")
            )
            net_income = _safe_float(ni_raw)
            
            # Gross profit for margin calculation
            gp_raw = (
                latest.get("毛利润")
                or latest.get("销售毛利润")
                or latest.get("GROSS_PROFIT")
            )
            gross_profit = _safe_float(gp_raw)
            
            if revenue and revenue != 0:
                if gross_profit is not None:
                    gross_margin = gross_profit / revenue
                if net_income is not None:
                    net_margin = net_income / revenue
            
            logger.info(f"[efinance] profit_statement: revenue={revenue}, netIncome={net_income}, grossMargin={gross_margin}, netMargin={net_margin}")
    except Exception as e:
        logger.warning(f"[efinance] get_profit_statement error: {e}")

    # ── 3. Balance sheet → ROE (if not yet available) ────────────────────────
    if roe is None and net_income is not None:
        try:
            time.sleep(0.2)
            balance_df = ef.stock.get_balance_sheet(stock=symbol)
            if balance_df is not None and not balance_df.empty:
                if "报告期" in balance_df.columns:
                    balance_df = balance_df.sort_values("报告期", ascending=False)
                elif "REPORT_DATE" in balance_df.columns:
                    balance_df = balance_df.sort_values("REPORT_DATE", ascending=False)
                
                latest_bs = balance_df.iloc[0]
                equity_raw = (
                    latest_bs.get("归属于母公司所有者权益合计")
                    or latest_bs.get("股东权益合计")
                    or latest_bs.get("所有者权益合计")
                    or latest_bs.get("PARENT_EQUITY")
                    or latest_bs.get("TOTAL_EQUITY")
                )
                equity = _safe_float(equity_raw)
                if equity and equity != 0 and net_income is not None:
                    roe = net_income / equity
                    logger.info(f"[efinance] computed ROE={roe} from balance sheet")
        except Exception as e:
            logger.warning(f"[efinance] get_balance_sheet error: {e}")

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
