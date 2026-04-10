"""
HK AKShare Provider — Primary provider for Hong Kong stock fundamentals.
sourceType: "community_aggregated"
confidence: "medium"

APIs used:
  - stock_financial_hk_analysis_indicator_em:
      ROE / ROA / margins / EPS / BVPS / revenue / netIncome / growth / ratios
  - stock_hk_daily:
      Latest price → compute PE / PB from price/EPS and price/BVPS

Symbol format: 5-digit HK code with leading zero (e.g., "01810" for 1810.HK)
Input: raw ticker like "1810.HK" → converted to "01810" internally

Field rules:
  - revenue = OPERATE_INCOME (营业收入, HKD)
  - netIncome = HOLDER_PROFIT (归母净利润, HKD)
  - grossMargin = GROSS_PROFIT_RATIO / 100
  - netMargin = NET_PROFIT_RATIO / 100
  - roe = ROE_AVG / 100
  - roa = ROA / 100
  - eps = BASIC_EPS (HKD)
  - bvps = BPS (HKD)
  - debtToEquity = DEBT_ASSET_RATIO / (100 - DEBT_ASSET_RATIO) [from debt/asset ratio]
  - currentRatio = CURRENT_RATIO
  - revenueGrowthYoy = OPERATE_INCOME_YOY / 100
  - netIncomeGrowthYoy = HOLDER_PROFIT_YOY / 100
  - PE = latest_price / EPS
  - PB = latest_price / BVPS
  - dividendYield: from stock_hk_dividend_payout_em if available
"""

import logging
import time
from typing import Optional

logger = logging.getLogger("china-fundamentals.hk_akshare")

SOURCE_TYPE = "community_aggregated"
CONFIDENCE = "medium"


def _to_hk_code(ticker: str) -> str:
    """
    Convert HK ticker to 5-digit AKShare format.
    "1810.HK" → "01810"
    "0700.HK" → "00700"
    "1810"    → "01810"
    """
    code = ticker.split(".")[0].strip()
    return code.zfill(5)


def _safe_float(val) -> Optional[float]:
    if val is None:
        return None
    s = str(val).strip().replace(",", "")
    if s in ("", "None", "nan", "--", "N/A", "-", "—", "无", "NaN", "null"):
        return None
    try:
        f = float(s)
        return f if f == f else None  # filter NaN
    except (ValueError, TypeError):
        return None


def _pct_to_float(val) -> Optional[float]:
    """Convert percentage value (e.g., 18.31 → 0.1831)."""
    f = _safe_float(val)
    return f / 100.0 if f is not None else None


def _get_latest_row(df, date_col: str = "REPORT_DATE"):
    """Get the latest row by date column."""
    if df is None or df.empty:
        return None
    if date_col not in df.columns:
        return df.iloc[0]
    try:
        df_sorted = df.sort_values(date_col, ascending=False)
        return df_sorted.iloc[0]
    except Exception:
        return df.iloc[0]


def _parse_period(row) -> tuple:
    """
    Parse period info from analysis_indicator row.
    Returns (periodType, periodEndDate, fiscalYear).
    """
    try:
        date_val = row.get("REPORT_DATE") or row.get("START_DATE")
        if date_val is None:
            return None, None, None
        date_str = str(date_val)[:10]  # "YYYY-MM-DD"
        month = date_str[5:7]
        month_map = {"03": "Q1", "06": "Q2", "09": "Q3", "12": "FY"}
        period_type = month_map.get(month, "FY")
        fiscal_year = int(date_str[:4])
        return period_type, date_str, fiscal_year
    except Exception:
        return None, None, None


def fetch_hk_akshare(ticker: str) -> Optional[object]:
    """
    Fetch HK stock fundamentals from AKShare.
    ticker: e.g., "1810.HK" or "01810"
    Returns FundamentalsData or None if insufficient data.
    """
    try:
        import akshare as ak
        import warnings
        warnings.filterwarnings("ignore")
        from main import FundamentalsData
    except ImportError as e:
        logger.error(f"[hk_akshare] import failed: {e}")
        return None

    hk_code = _to_hk_code(ticker)
    logger.info(f"[hk_akshare] fetching for ticker={ticker} → hk_code={hk_code}")

    # ── 1. Analysis indicator (primary source for most fields) ────────────────
    analysis_row = None
    revenue = None
    net_income = None
    gross_margin = None
    net_margin = None
    roe = None
    roa = None
    eps = None
    book_value_per_share = None
    current_ratio = None
    debt_to_equity = None
    revenue_growth_yoy = None
    net_income_growth_yoy = None
    cfo_per_share = None
    period_type = None
    period_end_date = None
    fiscal_year = None

    try:
        time.sleep(0.3)
        df = ak.stock_financial_hk_analysis_indicator_em(symbol=hk_code, indicator="年度")
        if df is not None and not df.empty:
            analysis_row = _get_latest_row(df, "REPORT_DATE")
            if analysis_row is not None:
                r = analysis_row

                # Revenue (营业收入, HKD)
                revenue = _safe_float(r.get("OPERATE_INCOME"))

                # Net income (归母净利润, HKD)
                net_income = _safe_float(r.get("HOLDER_PROFIT"))

                # Gross margin (毛利率, %)
                gross_margin = _pct_to_float(r.get("GROSS_PROFIT_RATIO"))

                # Net margin (净利率, %)
                net_margin = _pct_to_float(r.get("NET_PROFIT_RATIO"))

                # ROE (净资产收益率, %)
                roe = _pct_to_float(r.get("ROE_AVG"))
                if roe is None:
                    roe = _pct_to_float(r.get("ROE_YEARLY"))

                # ROA (总资产净利率, %)
                roa = _pct_to_float(r.get("ROA"))

                # EPS (基本每股收益, HKD)
                eps = _safe_float(r.get("BASIC_EPS"))
                if eps is None:
                    eps = _safe_float(r.get("EPS_TTM"))

                # BVPS (每股净资产, HKD)
                book_value_per_share = _safe_float(r.get("BPS"))

                # Current ratio (流动比率)
                current_ratio = _safe_float(r.get("CURRENT_RATIO"))

                # Debt/asset ratio (资产负债率, %) → convert to D/E
                da = _safe_float(r.get("DEBT_ASSET_RATIO"))
                if da is not None and 0 < da < 100:
                    debt_asset_ratio = da / 100.0
                    equity_ratio = 1.0 - debt_asset_ratio
                    if equity_ratio > 0:
                        debt_to_equity = debt_asset_ratio / equity_ratio

                # Revenue growth YoY (营收增长率, %)
                revenue_growth_yoy = _pct_to_float(r.get("OPERATE_INCOME_YOY"))

                # Net income growth YoY (净利润增长率, %)
                net_income_growth_yoy = _pct_to_float(r.get("HOLDER_PROFIT_YOY"))

                # CFO per share
                cfo_per_share = _safe_float(r.get("PER_NETCASH_OPERATE"))

                # Period info
                period_type, period_end_date, fiscal_year = _parse_period(dict(r))

                logger.info(
                    f"[hk_akshare] analysis_indicator: revenue={revenue}, netIncome={net_income}, "
                    f"grossMargin={gross_margin}, netMargin={net_margin}, roe={roe}, roa={roa}, "
                    f"eps={eps}, bvps={book_value_per_share}, currentRatio={current_ratio}, "
                    f"D/E={debt_to_equity}, period={period_type}/{period_end_date}"
                )
    except Exception as e:
        logger.warning(f"[hk_akshare] analysis_indicator error: {e}")

    # ── 2. Latest price from stock_hk_daily ───────────────────────────────────
    pe = None
    pb = None
    ps = None
    latest_price = None

    try:
        time.sleep(0.3)
        daily_df = ak.stock_hk_daily(symbol=hk_code, adjust="qfq")
        if daily_df is not None and not daily_df.empty:
            daily_df = daily_df.sort_values("date", ascending=False)
            latest_price = _safe_float(daily_df.iloc[0].get("close"))
            logger.info(f"[hk_akshare] latest_price={latest_price}")
    except Exception as e:
        logger.warning(f"[hk_akshare] stock_hk_daily error: {e}")

    # ── 3. Compute PE / PB from price and per-share metrics ───────────────────
    # PE = price / EPS  (no shares_outstanding needed)
    # PB = price / BVPS (no shares_outstanding needed)
    if latest_price is not None and latest_price > 0:
        if eps is not None and eps > 0:
            pe = latest_price / eps
            logger.info(f"[hk_akshare] computed PE={pe:.2f} from price={latest_price}/eps={eps}")
        if book_value_per_share is not None and book_value_per_share > 0:
            pb = latest_price / book_value_per_share
            logger.info(f"[hk_akshare] computed PB={pb:.2f} from price={latest_price}/bvps={book_value_per_share}")

    logger.info(f"[hk_akshare] final valuation: pe={pe}, pb={pb}, ps={ps}")

    # ── 4. Dividend yield ─────────────────────────────────────────────────────
    dividend_yield = None
    try:
        time.sleep(0.3)
        div_df = ak.stock_hk_dividend_payout_em(symbol=hk_code)
        if div_df is not None and not div_df.empty:
            div_cols = [c for c in div_df.columns if any(k in str(c) for k in ["派息", "股息", "dividend", "每股"])]
            if div_cols and latest_price is not None and latest_price > 0:
                div_df_sorted = div_df.sort_values(div_df.columns[0], ascending=False)
                dps = _safe_float(div_df_sorted.iloc[0].get(div_cols[0]))
                if dps is not None and dps > 0:
                    dividend_yield = dps / latest_price
                    logger.info(f"[hk_akshare] dividendYield={dividend_yield} from dps={dps}/price={latest_price}")
    except Exception as e:
        logger.warning(f"[hk_akshare] dividend_payout error: {e}")

    # ── Return ────────────────────────────────────────────────────────────────
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
        operatingMargin=None,  # Not available from AKShare HK
        roa=roa,
        debtToEquity=debt_to_equity,
        currentRatio=current_ratio,
        cashFromOperations=None,  # cfo_per_share × shares not available
        freeCashFlow=None,        # Not available from free sources
        revenueGrowthYoy=revenue_growth_yoy,
        netIncomeGrowthYoy=net_income_growth_yoy,
        bookValuePerShare=book_value_per_share,
        dividendYield=dividend_yield,
        sharesOutstanding=None,
        # Metadata
        fiscalYear=fiscal_year,
        periodType=period_type,
        periodEndDate=period_end_date,
        sourceType=SOURCE_TYPE,
        confidence=CONFIDENCE,
    )
