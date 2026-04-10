"""
AKShare Provider — Fallback 1 for A-share fundamentals.
sourceType: "third_party_free"
confidence: "medium"

APIs used:
  - stock_individual_info_em:           totalMarketCap / totalShares / latest price
  - stock_financial_analysis_indicator: ROE / ROA / margins / EPS / BVPS / ratios / growth
  - stock_financial_abstract:           revenue / netIncome / cashFromOperations (wide format)

Field rules:
  - debtToEquity: use '负债与所有者权益比率(%)' which is totalLiab/totalEquity (precise, %)
  - PE = totalMarketCap / annualNetIncome (computed)
  - PB = totalMarketCap / (BVPS × totalShares) (computed)
  - PS = totalMarketCap / annualRevenue (computed)
  - Individual field failures return null, not full provider failure.
"""

import logging
import time
from typing import Optional

logger = logging.getLogger("china-fundamentals.akshare")

SOURCE_TYPE = "community_aggregated"
CONFIDENCE = "medium"


def _date_to_period(date_str: str) -> tuple[str, str]:
    """
    Infer periodType from date string (YYYY-MM-DD or YYYYMMDD).
    Rules: MM=03→Q1, MM=06→Q2, MM=09→Q3, MM=12→FY
    Returns (periodType, periodEndDate in YYYY-MM-DD).
    """
    s = str(date_str).strip().replace("-", "")
    if len(s) == 8:
        year, month, day = s[:4], s[4:6], s[6:]
        period_date = f"{year}-{month}-{day}"
        month_map = {"03": "Q1", "06": "Q2", "09": "Q3", "12": "FY"}
        period_type = month_map.get(month, "Q3")  # default Q3 if unknown
        return period_type, period_date
    return "FY", date_str


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
    """Convert percentage value (e.g., 38.43 → 0.3843)."""
    f = _safe_float(val)
    if f is None:
        return None
    return f / 100.0


def _get_indicator_value(df, col_name: str) -> Optional[float]:
    """Get value from stock_financial_analysis_indicator (wide columns)."""
    if df is None or df.empty:
        return None
    if col_name not in df.columns:
        return None
    # Sort by date desc, take latest non-null
    date_col = '日期'
    if date_col in df.columns:
        df = df.sort_values(date_col, ascending=False)
    for _, row in df.iterrows():
        val = _safe_float(row.get(col_name))
        if val is not None:
            return val
    return None


def _get_abstract_value(df, indicator_name: str) -> Optional[float]:
    """
    Get value from stock_financial_abstract (pivoted: rows=indicators, cols=dates).
    Returns the latest non-null value.
    """
    if df is None or df.empty:
        return None
    if '指标' not in df.columns:
        return None
    row = df[df['指标'] == indicator_name]
    if row.empty:
        return None
    # Date columns are all columns except '选项' and '指标'
    date_cols = [c for c in df.columns if c not in ('选项', '指标')]
    # Sort date columns descending (they are strings like '20241231')
    date_cols_sorted = sorted(date_cols, reverse=True)
    for col in date_cols_sorted:
        val = _safe_float(row.iloc[0][col])
        if val is not None:
            return val
    return None


def fetch_akshare(symbol: str) -> Optional[object]:
    """
    Fetch A-share fundamentals from AKShare.
    symbol: 6-digit code (e.g., "600519")
    Returns FundamentalsData or None if all core fields missing.
    """
    try:
        import akshare as ak
        import warnings
        warnings.filterwarnings('ignore')
        from main import FundamentalsData
    except ImportError as e:
        logger.error(f"[akshare] import failed: {e}")
        return None

    # ── 1. Individual info → market cap / total shares / latest price ─────────
    total_market_cap = None
    total_shares = None
    latest_price = None

    try:
        time.sleep(0.3)
        info_df = ak.stock_individual_info_em(symbol=symbol)
        if info_df is not None and not info_df.empty:
            # Rows: item/value format
            info_dict = dict(zip(info_df['item'], info_df['value']))
            total_market_cap = _safe_float(info_dict.get('总市值'))
            total_shares = _safe_float(info_dict.get('总股本'))
            latest_price = _safe_float(info_dict.get('最新'))
            logger.info(
                f"[akshare] individual_info: mktCap={total_market_cap}, "
                f"shares={total_shares}, price={latest_price}"
            )
    except Exception as e:
        logger.warning(f"[akshare] individual_info error: {e}")

    # ── 2. Financial analysis indicator → ROE/ROA/margins/EPS/BVPS/ratios/growth
    indicator_df = None
    roe = None
    roa = None
    gross_margin = None
    net_margin = None
    operating_margin = None
    eps = None
    book_value_per_share = None
    current_ratio = None
    debt_to_equity = None
    revenue_growth_yoy = None
    net_income_growth_yoy = None
    cfo_per_share = None

    try:
        time.sleep(0.3)
        import datetime
        current_year = datetime.datetime.now().year
        indicator_df = ak.stock_financial_analysis_indicator(
            symbol=symbol,
            start_year=str(current_year - 2)
        )
        if indicator_df is not None and not indicator_df.empty:
            roe = _pct_to_float(_get_indicator_value(indicator_df, '净资产收益率(%)'))
            roa = _pct_to_float(_get_indicator_value(indicator_df, '总资产净利润率(%)'))
            if roa is None:
                roa = _pct_to_float(_get_indicator_value(indicator_df, '资产报酬率(%)'))
            gross_margin = _pct_to_float(_get_indicator_value(indicator_df, '销售毛利率(%)'))
            net_margin = _pct_to_float(_get_indicator_value(indicator_df, '销售净利率(%)'))
            operating_margin = _pct_to_float(_get_indicator_value(indicator_df, '营业利润率(%)'))
            eps = _safe_float(_get_indicator_value(indicator_df, '摊薄每股收益(元)'))
            if eps is None:
                eps = _safe_float(_get_indicator_value(indicator_df, '加权每股收益(元)'))
            book_value_per_share = _safe_float(_get_indicator_value(indicator_df, '每股净资产_调整前(元)'))
            current_ratio = _safe_float(_get_indicator_value(indicator_df, '流动比率'))
            # D/E: '负债与所有者权益比率(%)' = totalLiab/totalEquity × 100 (precise)
            de_pct = _safe_float(_get_indicator_value(indicator_df, '负债与所有者权益比率(%)'))
            if de_pct is not None:
                debt_to_equity = de_pct / 100.0
            revenue_growth_yoy = _pct_to_float(_get_indicator_value(indicator_df, '主营业务收入增长率(%)'))
            net_income_growth_yoy = _pct_to_float(_get_indicator_value(indicator_df, '净利润增长率(%)'))
            cfo_per_share = _safe_float(_get_indicator_value(indicator_df, '每股经营性现金流(元)'))

            logger.info(
                f"[akshare] financial_indicator: roe={roe}, roa={roa}, "
                f"grossMargin={gross_margin}, netMargin={net_margin}, "
                f"operatingMargin={operating_margin}, eps={eps}, bvps={book_value_per_share}, "
                f"currentRatio={current_ratio}, D/E={debt_to_equity}"
            )
    except Exception as e:
        logger.warning(f"[akshare] financial_analysis_indicator error: {e}")

    # ── 3. Financial abstract → revenue / netIncome / cashFromOperations / grossMargin ──
    revenue = None
    net_income = None
    cash_from_operations = None
    free_cash_flow = None

    try:
        time.sleep(0.3)
        abstract_df = ak.stock_financial_abstract(symbol=symbol)
        if abstract_df is not None and not abstract_df.empty:
            revenue = _get_abstract_value(abstract_df, '营业总收入')
            if revenue is None:
                revenue = _get_abstract_value(abstract_df, '营业收入')
            net_income = _get_abstract_value(abstract_df, '归母净利润')
            if net_income is None:
                net_income = _get_abstract_value(abstract_df, '净利润')
            cash_from_operations = _get_abstract_value(abstract_df, '经营现金流量净额')

            # grossMargin: try candidates in priority order (direct field only, no approximation)
            # Values are in percentage format (e.g., 91.29), convert to decimal (0.9129)
            if gross_margin is None:
                for gm_candidate in ['销售毛利率(%)', '毛利率(%)', '毛利率']:
                    gm_raw = _get_abstract_value(abstract_df, gm_candidate)
                    if gm_raw is not None:
                        gross_margin = gm_raw / 100.0
                        logger.info(f"[akshare] grossMargin from abstract '{gm_candidate}': {gross_margin}")
                        break

            logger.info(
                f"[akshare] financial_abstract: revenue={revenue}, "
                f"netIncome={net_income}, CFO={cash_from_operations}, grossMargin={gross_margin}"
            )
    except Exception as e:
        logger.warning(f"[akshare] financial_abstract error: {e}")

    # ── 4. Compute PE / PB / PS from market cap ───────────────────────────────
    pe = None
    pb = None
    ps = None

    if total_market_cap is not None and total_market_cap > 0:
        # PE = totalMarketCap / annualNetIncome
        if net_income is not None and net_income > 0:
            pe = total_market_cap / net_income
        # PB = totalMarketCap / (BVPS × totalShares)
        if book_value_per_share is not None and total_shares is not None and total_shares > 0:
            net_assets = book_value_per_share * total_shares
            if net_assets > 0:
                pb = total_market_cap / net_assets
        # PS = totalMarketCap / annualRevenue
        if revenue is not None and revenue > 0:
            ps = total_market_cap / revenue

    logger.info(f"[akshare] computed: pe={pe}, pb={pb}, ps={ps}")

    # ── 5. Cash flow from operations (absolute) ───────────────────────────────
    # If we have cfo_per_share and total_shares, compute absolute CFO
    if cash_from_operations is None and cfo_per_share is not None and total_shares is not None:
        cash_from_operations = cfo_per_share * total_shares
        logger.info(f"[akshare] computed CFO from per-share: {cash_from_operations}")

    # ── 6. Dividend yield ─────────────────────────────────────────────────────────────────────────────
    dividend_yield = None
    try:
        # stock_history_dividend_detail returns per-share cash dividend history
        # 派息 column: cash dividend per 10 shares (CNY)
        # Yield = (annual_dividend_per_share) / latest_price
        if latest_price and latest_price > 0:
            div_df = ak.stock_history_dividend_detail(symbol=symbol, indicator="分红")
            if div_df is not None and not div_df.empty:
                # Find most recent fiscal year
                # Columns may vary; look for '派息' or '每10股派息(元)'
                cash_col = None
                for col in div_df.columns:
                    if '派息' in str(col) or '现金' in str(col):
                        cash_col = col
                        break
                date_col_d = None
                for col in div_df.columns:
                    if '年度' in str(col) or '公告日' in str(col) or '除权日' in str(col):
                        date_col_d = col
                        break
                if cash_col:
                    # Get latest year's total dividend (sum if multiple distributions)
                    latest_year = None
                    if date_col_d and date_col_d in div_df.columns:
                        years = div_df[date_col_d].astype(str).str[:4]
                        latest_year = years.max()
                        year_rows = div_df[years == latest_year]
                    else:
                        year_rows = div_df.head(3)  # fallback: last 3 rows
                    annual_div_per_10 = 0.0
                    for val in year_rows[cash_col]:
                        v = _safe_float(val)
                        if v is not None:
                            annual_div_per_10 += v
                    annual_div_per_share = annual_div_per_10 / 10.0
                    if annual_div_per_share > 0:
                        dividend_yield = annual_div_per_share / latest_price
                        logger.info(f"[akshare] dividendYield={dividend_yield:.4f} (div={annual_div_per_share:.4f}/price={latest_price:.2f})")
    except Exception as e:
        logger.warning(f"[akshare] dividendYield fetch failed: {e}")

    # ── Determine period from indicator_df latest date ───────────────────────
    period_type = None
    period_end_date = None
    fiscal_year = None
    if indicator_df is not None and not indicator_df.empty:
        date_col = '日期'
        if date_col in indicator_df.columns:
            dates = sorted(indicator_df[date_col].dropna().astype(str).tolist(), reverse=True)
            if dates:
                latest_date = dates[0]
                period_type, period_end_date = _date_to_period(latest_date)
                try:
                    fiscal_year = int(period_end_date[:4])
                except Exception:
                    pass
                logger.info(f"[akshare] period: type={period_type}, endDate={period_end_date}, fiscalYear={fiscal_year}")

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
        sharesOutstanding=total_shares,
        # Metadata
        fiscalYear=fiscal_year,
        periodType=period_type,
        periodEndDate=period_end_date,
        sourceType=SOURCE_TYPE,
        confidence=CONFIDENCE,
    )
