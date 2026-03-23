#!/usr/bin/env python3
"""
alphalens_ic.py
使用 alphalens-reloaded 计算 Alpha 因子的信息系数（IC）统计
输入：JSON（因子时间序列数据）
输出：JSON（IC 统计 + IC 时序）
"""
import sys
import json
import warnings
import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

def compute_ic_stats(factor_data_json: dict) -> dict:
    """
    factor_data_json 格式：
    {
      "factors": [
        {
          "name": "Momentum",
          "history": [
            {"date": "2026-01-01", "value": 75.2, "forward_return": 0.023},
            ...
          ]
        },
        ...
      ]
    }
    返回：
    {
      "factors": [
        {
          "name": "Momentum",
          "ic_mean": 0.045,
          "ic_std": 0.12,
          "ir": 0.375,
          "ic_positive_pct": 0.62,
          "ic_series": [{"date": "...", "ic": 0.05}, ...]
        }
      ]
    }
    """
    results = []

    for factor in factor_data_json.get("factors", []):
        name = factor.get("name", "Unknown")
        history = factor.get("history", [])

        if len(history) < 3:
            # 数据点不足，返回 NaN
            results.append({
                "name": name,
                "ic_mean": None,
                "ic_std": None,
                "ir": None,
                "ic_positive_pct": None,
                "ic_series": [],
                "note": "数据点不足（需要至少 3 个历史记录）"
            })
            continue

        # 构建 DataFrame
        df = pd.DataFrame(history)
        if "value" not in df.columns or "forward_return" not in df.columns:
            results.append({
                "name": name,
                "ic_mean": None,
                "ic_std": None,
                "ir": None,
                "ic_positive_pct": None,
                "ic_series": [],
                "note": "缺少 value 或 forward_return 字段"
            })
            continue

        df = df.dropna(subset=["value", "forward_return"])
        if len(df) < 3:
            results.append({
                "name": name,
                "ic_mean": None,
                "ic_std": None,
                "ir": None,
                "ic_positive_pct": None,
                "ic_series": [],
                "note": "有效数据点不足"
            })
            continue

        # 计算滚动 IC（Spearman 秩相关）
        # 对于每个时间点，用因子值与下期收益的 Spearman 相关
        # 由于数据点少，直接计算整体 IC
        from scipy.stats import spearmanr

        # 整体 IC
        ic_overall, _ = spearmanr(df["value"], df["forward_return"])

        # 滚动 IC（窗口=3，步长=1）
        ic_series = []
        window = min(3, len(df))
        for i in range(window - 1, len(df)):
            window_df = df.iloc[max(0, i - window + 1):i + 1]
            if len(window_df) >= 2:
                ic_val, _ = spearmanr(window_df["value"], window_df["forward_return"])
                date_str = str(window_df.iloc[-1].get("date", f"T{i}"))
                ic_series.append({
                    "date": date_str,
                    "ic": round(float(ic_val) if not np.isnan(ic_val) else 0.0, 4)
                })

        # 计算 IC 统计
        ic_values = [p["ic"] for p in ic_series if p["ic"] is not None]
        if ic_values:
            ic_mean = float(np.mean(ic_values))
            ic_std = float(np.std(ic_values)) if len(ic_values) > 1 else 0.0
            ir = ic_mean / ic_std if ic_std > 0 else 0.0
            ic_positive_pct = sum(1 for v in ic_values if v > 0) / len(ic_values)
        else:
            ic_mean = float(ic_overall) if not np.isnan(ic_overall) else 0.0
            ic_std = 0.0
            ir = 0.0
            ic_positive_pct = 0.5

        results.append({
            "name": name,
            "ic_mean": round(ic_mean, 4),
            "ic_std": round(ic_std, 4),
            "ir": round(ir, 4),
            "ic_positive_pct": round(ic_positive_pct, 4),
            "ic_series": ic_series,
            "note": f"基于 {len(df)} 个历史数据点计算"
        })

    return {"factors": results}


def main():
    try:
        input_data = json.loads(sys.stdin.read())
        result = compute_ic_stats(input_data)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e), "factors": []}))
        sys.exit(1)


if __name__ == "__main__":
    main()
