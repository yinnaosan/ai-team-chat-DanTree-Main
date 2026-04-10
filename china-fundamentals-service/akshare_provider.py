"""
AKShare Provider — Fallback 1 for A-share fundamentals.

Endpoints used:
  - stock_financial_abstract: ROE / 毛利率 / 净利率 / EPS
  - stock_individual_info_em: PE / PB / 市值
  - stock_financial_report_sina: revenue / net income (补充)

All fields mapped to unified schema. Individual field failures return null,
not full provider failure.
"""

import logging
import time
from typing import Optional

logger = logging.getLogger("china-fundamentals.akshare")

def _safe_float(val) -> Optional[float]:
    if val is None:
        return None
    s = str(val).strip().replace(",", "").replace("%", "")
    if s in ("", "None", "nan", "--", "N/A", "-", "—"):
        return None
    try:
        f = float(s)
        return f if f == f else None
    except (ValueError, TypeError):
        return None

def _pct_to_float(val) -> Optional[float]:
    """Convert percentage string like '45.23%' or '45.23' to 0.4523."""
    f = _safe_float(val)
    if f is None:
        return None
    # If value looks like a percentage (> 1 and <= 100), divide by 100
    if abs(f) > 1:
        return f / 100.0
    return f

def fetch_akshare(symbol: str) -> Optional[object]:
    """
    Fetch A-share fundamentals from AKShare.
    symbol: 6-digit code (e.g., "600519")
    Returns FundamentalsData or None if all core fields missing.
    """
    try:
        import akshare as ak
        from main import FundamentalsData
    except ImportError as e:
        logger.error(f"[akshare] import failed: {e}")
        return None

    pe = None
    pb = None
    roe = None
    revenue = None
    net_income = None
    gross_margin = None
    net_margin = None
    eps = None

    # ── 1. stock_individual_info_em → PE / PB / 市值 ─────────────────────────
    try:
        time.sleep(0.2)
        info_df = ak.stock_individual_info_em(symbol=symbol)
        # Returns DataFrame with columns: item, value
        if info_df is not None and not info_df.empty:
            info_dict = dict(zip(info_df.iloc[:, 0], info_df.iloc[:, 1]))
            # PE fields: '市盈率(动)', '市盈率(静)', '市盈率(TTM)'
            pe_raw = (
                info_dict.get("市盈率(TTM)")
                or info_dict.get("市盈率(动)")
                or info_dict.get("市盈率(静)")
            )
            pe = _safe_float(pe_raw)
            pb = _safe_float(info_dict.get("市净率"))
            logger.info(f"[akshare] individual_info: pe={pe}, pb={pb}")
    except Exception as e:
        logger.warning(f"[akshare] stock_individual_info_em error: {e}")

    # ── 2. stock_financial_abstract → ROE / 毛利率 / 净利率 / EPS ─────────────
    try:
        time.sleep(0.2)
        abstract_df = ak.stock_financial_abstract(symbol=symbol)
        if abstract_df is not None and not abstract_df.empty:
            # Sort by date descending, take latest
            if "报告期" in abstract_df.columns:
                abstract_df = abstract_df.sort_values("报告期", ascending=False)
            latest = abstract_df.iloc[0]
            
            # ROE
            roe_raw = latest.get("净资产收益率") or latest.get("ROE") or latest.get("加权净资产收益率")
            roe = _pct_to_float(roe_raw)
            
            # Gross margin
            gm_raw = latest.get("销售毛利率") or latest.get("毛利率")
            gross_margin = _pct_to_float(gm_raw)
            
            # Net margin
            nm_raw = latest.get("销售净利率") or latest.get("净利率")
            net_margin = _pct_to_float(nm_raw)
            
            # EPS
            eps_raw = latest.get("基本每股收益") or latest.get("每股收益")
            eps = _safe_float(eps_raw)
            
            logger.info(f"[akshare] financial_abstract: roe={roe}, grossMargin={gross_margin}, netMargin={net_margin}, eps={eps}")
    except Exception as e:
        logger.warning(f"[akshare] stock_financial_abstract error: {e}")

    # ── 3. stock_financial_report_sina → revenue / net income ────────────────
    try:
        time.sleep(0.2)
        # Try income statement from Sina
        sina_df = ak.stock_financial_report_sina(stock=symbol, symbol="利润表")
        if sina_df is not None and not sina_df.empty:
            # Columns are dates, rows are financial items
            # Get the latest column (most recent period)
            latest_col = sina_df.columns[1] if len(sina_df.columns) > 1 else None
            if latest_col:
                sina_dict = dict(zip(sina_df.iloc[:, 0], sina_df[latest_col]))
                
                # Revenue: 营业总收入 or 营业收入
                rev_raw = (
                    sina_dict.get("营业总收入")
                    or sina_dict.get("营业收入")
                    or sina_dict.get("一、营业收入")
                )
                revenue = _safe_float(rev_raw)
                
                # Net income: 净利润 or 归属于母公司所有者的净利润
                ni_raw = (
                    sina_dict.get("净利润")
                    or sina_dict.get("归属于母公司所有者的净利润")
                    or sina_dict.get("归属于母公司股东的净利润")
                )
                net_income = _safe_float(ni_raw)
                
                logger.info(f"[akshare] sina_report: revenue={revenue}, netIncome={net_income}")
    except Exception as e:
        logger.warning(f"[akshare] stock_financial_report_sina error: {e}")

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
