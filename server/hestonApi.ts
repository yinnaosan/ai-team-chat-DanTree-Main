/**
 * Heston Stochastic Volatility Model API
 * Based on: yhilpisch/dawp (Derivatives Analytics with Python)
 * Uses Carr-Madan FFT method for European option pricing
 */
import { execFile } from "child_process";
import path from "path";

export interface HestonInput {
  S: number;       // spot price
  K: number;       // strike price
  T: number;       // time to expiry (years)
  r: number;       // risk-free rate
  sigma: number;   // initial volatility
  kappa?: number;  // mean reversion speed (default: 2.0)
  theta?: number;  // long-run variance (default: sigma^2)
  xi?: number;     // vol of vol (default: 0.3)
  rho?: number;    // correlation (default: -0.7)
  option_type?: "call" | "put";
}

export interface HestonResult {
  bs_price: number;
  heston_price: number;
  heston_delta: number;
  heston_gamma: number;
  heston_theta: number;
  heston_vega: number;
  model: "heston";
  params: {
    S: number; K: number; T: number; r: number; sigma: number;
    kappa: number; theta: number; xi: number; rho: number; v0: number;
  };
  error?: string;
}

export function hestonPrice(input: HestonInput): Promise<HestonResult> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, "heston_pricing.py");
    const payload = JSON.stringify({
      S: input.S,
      K: input.K,
      T: input.T,
      r: input.r,
      sigma: input.sigma,
      kappa: input.kappa ?? 2.0,
      theta: input.theta ?? input.sigma ** 2,
      xi: input.xi ?? 0.3,
      rho: input.rho ?? -0.7,
      option_type: input.option_type ?? "call",
    });

    const child = execFile(
      "python3.11",
      [scriptPath],
      { timeout: 30000 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`Heston pricing failed: ${err.message}`));
          return;
        }
        try {
          const result = JSON.parse(stdout.trim()) as HestonResult;
          if (result.error) {
            reject(new Error(result.error));
          } else {
            resolve(result);
          }
        } catch (parseErr) {
          reject(new Error(`Failed to parse Heston output: ${stdout}`));
        }
      }
    );

    child.stdin?.write(payload);
    child.stdin?.end();
  });
}

/**
 * Compute Heston option chain across multiple strikes
 */
export async function hestonOptionChain(
  S: number,
  T: number,
  r: number,
  sigma: number,
  kappa: number,
  theta: number,
  xi: number,
  rho: number,
  strikes: number[]
): Promise<Array<{
  strike: number;
  call_bs: number;
  call_heston: number;
  put_bs: number;
  put_heston: number;
  delta_call: number;
  delta_put: number;
  gamma: number;
  vega: number;
  heston_premium_pct: number;
}>> {
  const results = await Promise.all(
    strikes.map(async (K) => {
      const [callResult, putResult] = await Promise.all([
        hestonPrice({ S, K, T, r, sigma, kappa, theta, xi, rho, option_type: "call" }),
        hestonPrice({ S, K, T, r, sigma, kappa, theta, xi, rho, option_type: "put" }),
      ]);
      const premiumPct = callResult.bs_price > 0
        ? ((callResult.heston_price - callResult.bs_price) / callResult.bs_price) * 100
        : 0;
      return {
        strike: K,
        call_bs: callResult.bs_price,
        call_heston: callResult.heston_price,
        put_bs: putResult.bs_price,
        put_heston: putResult.heston_price,
        delta_call: callResult.heston_delta,
        delta_put: putResult.heston_delta,
        gamma: callResult.heston_gamma,
        vega: callResult.heston_vega,
        heston_premium_pct: Math.round(premiumPct * 10) / 10,
      };
    })
  );
  return results;
}
