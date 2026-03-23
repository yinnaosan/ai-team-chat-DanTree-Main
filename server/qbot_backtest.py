#!/usr/bin/env python3
"""
Qbot-style quantitative backtesting engine.
Supports: momentum, mean-reversion, alpha-factor, moving-average strategies.
Input: JSON via stdin
Output: JSON via stdout
"""

import sys
import json
import math
import numpy as np
from datetime import datetime, timedelta

def calculate_returns(prices):
    """Calculate daily returns from price series."""
    if len(prices) < 2:
        return []
    returns = []
    for i in range(1, len(prices)):
        if prices[i-1] != 0:
            returns.append((prices[i] - prices[i-1]) / prices[i-1])
        else:
            returns.append(0.0)
    return returns

def calculate_sharpe(returns, risk_free_rate=0.05):
    """Annualized Sharpe ratio."""
    if not returns or len(returns) < 2:
        return 0.0
    arr = np.array(returns)
    daily_rf = risk_free_rate / 252
    excess = arr - daily_rf
    if np.std(excess) == 0:
        return 0.0
    return float(np.mean(excess) / np.std(excess) * math.sqrt(252))

def calculate_max_drawdown(equity_curve):
    """Maximum drawdown from equity curve."""
    if not equity_curve:
        return 0.0
    peak = equity_curve[0]
    max_dd = 0.0
    for v in equity_curve:
        if v > peak:
            peak = v
        dd = (peak - v) / peak if peak > 0 else 0
        if dd > max_dd:
            max_dd = dd
    return float(max_dd)

def calculate_sortino(returns, risk_free_rate=0.05):
    """Sortino ratio (downside deviation only)."""
    if not returns or len(returns) < 2:
        return 0.0
    arr = np.array(returns)
    daily_rf = risk_free_rate / 252
    excess = arr - daily_rf
    downside = excess[excess < 0]
    if len(downside) == 0 or np.std(downside) == 0:
        return 0.0
    return float(np.mean(excess) / np.std(downside) * math.sqrt(252))

def calculate_calmar(returns, max_dd):
    """Calmar ratio = annualized return / max drawdown."""
    if not returns or max_dd == 0:
        return 0.0
    ann_return = float(np.mean(returns) * 252)
    return ann_return / max_dd

def momentum_strategy(prices, lookback=20, holding=5):
    """
    Momentum strategy: buy if price > SMA(lookback), sell otherwise.
    Returns list of trade signals and equity curve.
    """
    n = len(prices)
    if n < lookback + 1:
        return [], [1.0] * n
    
    signals = []
    equity = 1.0
    equity_curve = [1.0] * lookback
    position = 0  # 0=flat, 1=long
    entry_price = 0.0
    days_held = 0
    
    for i in range(lookback, n):
        sma = np.mean(prices[i-lookback:i])
        price = prices[i]
        
        if position == 0 and price > sma * 1.01:
            # Enter long
            position = 1
            entry_price = price
            days_held = 0
            signals.append({"day": i, "action": "BUY", "price": price, "sma": sma})
        elif position == 1:
            days_held += 1
            ret = (price - entry_price) / entry_price
            if days_held >= holding or price < sma * 0.99:
                # Exit
                equity *= (1 + ret)
                position = 0
                signals.append({"day": i, "action": "SELL", "price": price, "return": ret})
        
        equity_curve.append(equity)
    
    return signals, equity_curve

def mean_reversion_strategy(prices, window=20, z_threshold=1.5):
    """
    Mean reversion: buy when z-score < -threshold, sell when z-score > threshold.
    """
    n = len(prices)
    if n < window + 1:
        return [], [1.0] * n
    
    signals = []
    equity = 1.0
    equity_curve = [1.0] * window
    position = 0
    entry_price = 0.0
    
    for i in range(window, n):
        window_prices = prices[i-window:i]
        mean = np.mean(window_prices)
        std = np.std(window_prices)
        if std == 0:
            equity_curve.append(equity)
            continue
        z = (prices[i] - mean) / std
        price = prices[i]
        
        if position == 0 and z < -z_threshold:
            position = 1
            entry_price = price
            signals.append({"day": i, "action": "BUY", "price": price, "z_score": z})
        elif position == 1 and z > 0:
            ret = (price - entry_price) / entry_price
            equity *= (1 + ret)
            position = 0
            signals.append({"day": i, "action": "SELL", "price": price, "return": ret})
        
        equity_curve.append(equity)
    
    return signals, equity_curve

def moving_average_crossover(prices, fast=10, slow=30):
    """
    MA crossover: buy when fast MA crosses above slow MA.
    """
    n = len(prices)
    if n < slow + 1:
        return [], [1.0] * n
    
    signals = []
    equity = 1.0
    equity_curve = [1.0] * slow
    position = 0
    entry_price = 0.0
    
    for i in range(slow, n):
        fast_ma = np.mean(prices[i-fast:i])
        slow_ma = np.mean(prices[i-slow:i])
        prev_fast = np.mean(prices[i-fast-1:i-1])
        prev_slow = np.mean(prices[i-slow-1:i-1])
        price = prices[i]
        
        # Golden cross
        if position == 0 and prev_fast <= prev_slow and fast_ma > slow_ma:
            position = 1
            entry_price = price
            signals.append({"day": i, "action": "BUY", "price": price, "fast_ma": fast_ma, "slow_ma": slow_ma})
        # Death cross
        elif position == 1 and prev_fast >= prev_slow and fast_ma < slow_ma:
            ret = (price - entry_price) / entry_price
            equity *= (1 + ret)
            position = 0
            signals.append({"day": i, "action": "SELL", "price": price, "return": ret})
        
        equity_curve.append(equity)
    
    return signals, equity_curve

def alpha_factor_strategy(prices, alpha_scores):
    """
    Alpha factor strategy: buy when alpha score > 60, sell when < 40.
    """
    n = min(len(prices), len(alpha_scores))
    if n < 2:
        return [], [1.0] * n
    
    signals = []
    equity = 1.0
    equity_curve = [1.0]
    position = 0
    entry_price = 0.0
    
    for i in range(1, n):
        price = prices[i]
        score = alpha_scores[i]
        
        if position == 0 and score > 60:
            position = 1
            entry_price = price
            signals.append({"day": i, "action": "BUY", "price": price, "alpha_score": score})
        elif position == 1 and score < 40:
            ret = (price - entry_price) / entry_price
            equity *= (1 + ret)
            position = 0
            signals.append({"day": i, "action": "SELL", "price": price, "return": ret})
        
        equity_curve.append(equity)
    
    return signals, equity_curve

def generate_synthetic_prices(spot, days=252, mu=0.08, sigma=0.2, seed=42):
    """Generate synthetic price series using GBM."""
    np.random.seed(seed)
    dt = 1/252
    prices = [spot]
    for _ in range(days - 1):
        drift = (mu - 0.5 * sigma**2) * dt
        diffusion = sigma * math.sqrt(dt) * np.random.normal()
        prices.append(prices[-1] * math.exp(drift + diffusion))
    return prices

def run_backtest(params):
    """Main backtest runner."""
    strategy = params.get("strategy", "momentum")
    spot = float(params.get("spot", 100))
    sigma = float(params.get("sigma", 0.2))
    days = int(params.get("days", 252))
    alpha_scores = params.get("alpha_scores", [])
    
    # Use provided prices or generate synthetic
    prices = params.get("prices", [])
    if not prices:
        prices = generate_synthetic_prices(spot, days, sigma=sigma)
    
    # Run strategy
    if strategy == "momentum":
        lookback = int(params.get("lookback", 20))
        signals, equity_curve = momentum_strategy(prices, lookback=lookback)
    elif strategy == "mean_reversion":
        window = int(params.get("window", 20))
        signals, equity_curve = mean_reversion_strategy(prices, window=window)
    elif strategy == "ma_crossover":
        fast = int(params.get("fast", 10))
        slow = int(params.get("slow", 30))
        signals, equity_curve = moving_average_crossover(prices, fast=fast, slow=slow)
    elif strategy == "alpha_factor" and alpha_scores:
        signals, equity_curve = alpha_factor_strategy(prices, alpha_scores)
    else:
        # Buy and hold benchmark
        signals = [{"day": 0, "action": "BUY", "price": prices[0]}]
        equity_curve = [prices[i] / prices[0] for i in range(len(prices))]
    
    # Buy and hold benchmark
    bh_equity = [prices[i] / prices[0] for i in range(len(prices))]
    
    # Calculate metrics
    returns = calculate_returns(equity_curve)
    bh_returns = calculate_returns(bh_equity)
    
    total_return = (equity_curve[-1] - 1.0) if equity_curve else 0.0
    bh_total_return = (bh_equity[-1] - 1.0) if bh_equity else 0.0
    ann_return = float((1 + total_return) ** (252 / max(len(prices), 1)) - 1)
    
    max_dd = calculate_max_drawdown(equity_curve)
    sharpe = calculate_sharpe(returns)
    sortino = calculate_sortino(returns)
    calmar = calculate_calmar(returns, max_dd)
    win_trades = [s for s in signals if s.get("action") == "SELL" and s.get("return", 0) > 0]
    total_trades = [s for s in signals if s.get("action") == "SELL"]
    win_rate = len(win_trades) / len(total_trades) if total_trades else 0.0
    
    # Sample equity curve (every 5th point for chart)
    sample_step = max(1, len(equity_curve) // 60)
    sampled_equity = [{"day": i, "value": round(equity_curve[i], 4), "bh": round(bh_equity[i], 4)}
                      for i in range(0, len(equity_curve), sample_step)]
    
    return {
        "strategy": strategy,
        "metrics": {
            "total_return": round(total_return * 100, 2),
            "ann_return": round(ann_return * 100, 2),
            "bh_return": round(bh_total_return * 100, 2),
            "sharpe": round(sharpe, 3),
            "sortino": round(sortino, 3),
            "calmar": round(calmar, 3),
            "max_drawdown": round(max_dd * 100, 2),
            "win_rate": round(win_rate * 100, 1),
            "total_trades": len(total_trades),
            "alpha": round((total_return - bh_total_return) * 100, 2)
        },
        "equity_curve": sampled_equity,
        "signals": signals[-10:],  # Last 10 signals
        "days": len(prices)
    }

if __name__ == "__main__":
    try:
        raw = sys.stdin.read().strip()
        params = json.loads(raw) if raw else {}
        result = run_backtest(params)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
