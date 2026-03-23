#!/usr/bin/env python3
"""
Heston Stochastic Volatility Model Pricing
Based on: yhilpisch/dawp (Derivatives Analytics with Python)
Implements: Carr-Madan FFT method for European option pricing under Heston model

Input (stdin JSON):
{
  "S": 100.0,        # spot price
  "K": 100.0,        # strike
  "T": 0.25,         # time to expiry (years)
  "r": 0.05,         # risk-free rate
  "sigma": 0.25,     # initial volatility (sqrt of v0)
  "kappa": 2.0,      # mean reversion speed
  "theta": 0.04,     # long-run variance
  "xi": 0.3,         # vol of vol
  "rho": -0.7,       # correlation
  "option_type": "call"  # "call" or "put"
}

Output (stdout JSON):
{
  "bs_price": float,
  "heston_price": float,
  "heston_delta": float,
  "heston_gamma": float,
  "heston_vega": float,
  "heston_theta": float,
  "model": "heston",
  "params": {...}
}
"""
import sys
import json
import math
import cmath
import numpy as np

def bs_price(S, K, T, r, sigma, option_type="call"):
    """Black-Scholes analytical price."""
    if T <= 0:
        intrinsic = max(S - K, 0) if option_type == "call" else max(K - S, 0)
        return intrinsic
    d1 = (math.log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * math.sqrt(T))
    d2 = d1 - sigma * math.sqrt(T)
    from scipy.stats import norm
    if option_type == "call":
        return S * norm.cdf(d1) - K * math.exp(-r * T) * norm.cdf(d2)
    else:
        return K * math.exp(-r * T) * norm.cdf(-d2) - S * norm.cdf(-d1)

def heston_char_func(u, S, K, T, r, v0, kappa, theta, xi, rho):
    """Heston characteristic function (Carr-Madan formulation)."""
    i = complex(0, 1)
    d = cmath.sqrt((rho * xi * i * u - kappa)**2 - xi**2 * (-i * u - u**2))
    g = (kappa - rho * xi * i * u - d) / (kappa - rho * xi * i * u + d)
    
    exp_dT = cmath.exp(-d * T)
    C = r * i * u * T + (kappa * theta / xi**2) * (
        (kappa - rho * xi * i * u - d) * T - 2 * cmath.log((1 - g * exp_dT) / (1 - g))
    )
    D = (kappa - rho * xi * i * u - d) / xi**2 * (1 - exp_dT) / (1 - g * exp_dT)
    
    return cmath.exp(C + D * v0 + i * u * cmath.log(S * math.exp(r * T)))

def heston_price_fft(S, K, T, r, v0, kappa, theta, xi, rho, option_type="call"):
    """Price European option using Heston model via Carr-Madan FFT."""
    if T <= 0:
        intrinsic = max(S - K, 0) if option_type == "call" else max(K - S, 0)
        return intrinsic
    
    N = 4096
    alpha = 1.5
    eta = 0.25
    lambda_ = 2 * math.pi / (N * eta)
    b = math.pi / eta
    
    k = -b + lambda_ * np.arange(N)
    
    # Integration grid
    v = eta * np.arange(N)
    v[0] = 1e-15  # avoid division by zero
    
    # Characteristic function values
    cf_vals = np.array([
        heston_char_func(v[j] - (alpha + 1) * 1j, S, K, T, r, v0, kappa, theta, xi, rho)
        for j in range(N)
    ])
    
    psi = cf_vals / (alpha**2 + alpha - v**2 + 1j * (2 * alpha + 1) * v)
    
    # Simpson weights
    simpson_w = np.ones(N)
    simpson_w[0] = 1/3
    simpson_w[-1] = 1/3
    simpson_w[1:-1:2] = 4/3
    simpson_w[2:-2:2] = 2/3
    
    x = np.exp(1j * b * v) * psi * eta * simpson_w
    
    # FFT
    fft_result = np.fft.fft(x)
    
    call_prices = np.real(np.exp(-alpha * k) / math.pi * fft_result)
    
    # Find the price at strike K
    k_target = math.log(K)
    idx = int((k_target + b) / lambda_)
    idx = max(0, min(idx, N - 2))
    
    # Linear interpolation
    k0 = k[idx]
    k1 = k[idx + 1]
    p0 = call_prices[idx]
    p1 = call_prices[idx + 1]
    
    if k1 != k0:
        call_price = p0 + (p1 - p0) * (k_target - k0) / (k1 - k0)
    else:
        call_price = p0
    
    call_price = max(0, call_price)
    
    if option_type == "put":
        # Put-call parity
        put_price = call_price - S + K * math.exp(-r * T)
        return max(0, put_price)
    
    return call_price

def compute_heston_greeks(S, K, T, r, v0, kappa, theta, xi, rho, option_type="call"):
    """Compute Heston model Greeks via finite differences."""
    dS = S * 0.01
    dT = 1/365
    dv = 0.01
    
    price = heston_price_fft(S, K, T, r, v0, kappa, theta, xi, rho, option_type)
    
    # Delta
    price_up = heston_price_fft(S + dS, K, T, r, v0, kappa, theta, xi, rho, option_type)
    price_dn = heston_price_fft(S - dS, K, T, r, v0, kappa, theta, xi, rho, option_type)
    delta = (price_up - price_dn) / (2 * dS)
    
    # Gamma
    gamma = (price_up - 2 * price + price_dn) / (dS ** 2)
    
    # Theta (1 day decay)
    if T > dT:
        price_t = heston_price_fft(S, K, T - dT, r, v0, kappa, theta, xi, rho, option_type)
        theta_greek = (price_t - price) / dT * (-1)  # per day
    else:
        theta_greek = 0.0
    
    # Vega (w.r.t. sqrt(v0))
    sigma = math.sqrt(v0)
    sigma_up = sigma + 0.01
    v0_up = sigma_up ** 2
    price_v = heston_price_fft(S, K, T, r, v0_up, kappa, theta, xi, rho, option_type)
    vega = (price_v - price) / 0.01 * 0.01  # per 1% vol change
    
    return {
        "price": round(price, 4),
        "delta": round(delta, 4),
        "gamma": round(gamma, 6),
        "theta": round(theta_greek, 4),
        "vega": round(vega, 4),
    }

def main():
    try:
        data = json.loads(sys.stdin.read())
        S = float(data.get("S", 100))
        K = float(data.get("K", 100))
        T = float(data.get("T", 0.25))
        r = float(data.get("r", 0.05))
        sigma = float(data.get("sigma", 0.25))
        kappa = float(data.get("kappa", 2.0))
        theta_param = float(data.get("theta", sigma**2))
        xi = float(data.get("xi", 0.3))
        rho = float(data.get("rho", -0.7))
        option_type = data.get("option_type", "call")
        
        v0 = sigma ** 2
        
        # BS price for comparison
        bs = bs_price(S, K, T, r, sigma, option_type)
        
        # Heston price + Greeks
        greeks = compute_heston_greeks(S, K, T, r, v0, kappa, theta_param, xi, rho, option_type)
        
        result = {
            "bs_price": round(bs, 4),
            "heston_price": greeks["price"],
            "heston_delta": greeks["delta"],
            "heston_gamma": greeks["gamma"],
            "heston_theta": greeks["theta"],
            "heston_vega": greeks["vega"],
            "model": "heston",
            "params": {
                "S": S, "K": K, "T": T, "r": r, "sigma": sigma,
                "kappa": kappa, "theta": theta_param, "xi": xi, "rho": rho,
                "v0": v0
            }
        }
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    main()
