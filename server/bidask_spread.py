#!/usr/bin/env python3
"""
bidask_spread.py
使用 bidask 库从 OHLC 数据估算买卖价差（流动性因子）
输入：JSON（OHLC 数据）
输出：JSON（买卖价差估算结果）
"""
import sys
import json
import warnings
import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")


def estimate_spread(ohlc_json: dict) -> dict:
    """
    ohlc_json 格式：
    {
      "ticker": "AAPL",
      "ohlc": [
        {"date": "2026-01-01", "open": 150.0, "high": 155.0, "low": 148.0, "close": 153.0},
        ...
      ]
    }
    返回：
    {
      "ticker": "AAPL",
      "spread_pct": 0.0045,
      "spread_bps": 4.5,
      "liquidity_score": 85.2,
      "liquidity_label": "高流动性",
      "method": "EDGE",
      "data_points": 30
    }
    """
    ticker = ohlc_json.get("ticker", "UNKNOWN")
    ohlc_list = ohlc_json.get("ohlc", [])

    if len(ohlc_list) < 5:
        return {
            "ticker": ticker,
            "spread_pct": None,
            "spread_bps": None,
            "liquidity_score": None,
            "liquidity_label": "数据不足",
            "method": "N/A",
            "data_points": len(ohlc_list),
            "error": "需要至少 5 个 OHLC 数据点"
        }

    df = pd.DataFrame(ohlc_list)
    required_cols = ["open", "high", "low", "close"]
    for col in required_cols:
        if col not in df.columns:
            return {
                "ticker": ticker,
                "spread_pct": None,
                "spread_bps": None,
                "liquidity_score": None,
                "liquidity_label": "数据格式错误",
                "method": "N/A",
                "data_points": 0,
                "error": f"缺少列: {col}"
            }

    df = df[required_cols].apply(pd.to_numeric, errors="coerce").dropna()

    try:
        from bidask import edge
        # EDGE 方法：使用 Open, High, Low, Close 估算买卖价差
        spread = edge(df["open"], df["high"], df["low"], df["close"])
        spread_pct = float(abs(spread)) if not np.isnan(spread) else None
        method = "EDGE"
    except Exception:
        # 降级：使用简单的 (High - Low) / Close 估算
        spread_pct = float(((df["high"] - df["low"]) / df["close"]).mean() * 0.3)
        method = "HL_Proxy"

    if spread_pct is None:
        # 最终降级：使用 HL 代理
        spread_pct = float(((df["high"] - df["low"]) / df["close"]).mean() * 0.3)
        method = "HL_Proxy"

    spread_bps = round(spread_pct * 10000, 2)

    # 流动性评分：买卖价差越小，流动性越高
    # 大盘股通常 < 5 bps，小盘股可能 > 50 bps
    if spread_bps < 5:
        liquidity_score = 95.0
        liquidity_label = "极高流动性"
    elif spread_bps < 15:
        liquidity_score = round(95 - (spread_bps - 5) * 3, 1)
        liquidity_label = "高流动性"
    elif spread_bps < 50:
        liquidity_score = round(65 - (spread_bps - 15) * 1.0, 1)
        liquidity_label = "中等流动性"
    elif spread_bps < 100:
        liquidity_score = round(30 - (spread_bps - 50) * 0.4, 1)
        liquidity_label = "低流动性"
    else:
        liquidity_score = max(5.0, round(10 - (spread_bps - 100) * 0.05, 1))
        liquidity_label = "极低流动性"

    liquidity_score = max(5.0, min(100.0, liquidity_score))

    return {
        "ticker": ticker,
        "spread_pct": round(spread_pct, 6),
        "spread_bps": spread_bps,
        "liquidity_score": liquidity_score,
        "liquidity_label": liquidity_label,
        "method": method,
        "data_points": len(df)
    }


def main():
    try:
        input_data = json.loads(sys.stdin.read())
        result = estimate_spread(input_data)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
