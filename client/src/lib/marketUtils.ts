/**
 * marketUtils.ts — 市场工具函数（纯函数，无 React 依赖）
 *
 * 从 MarketStatus.tsx 中分离，避免 Vite Fast Refresh 混合导出警告。
 */

export type MarketType = "us" | "cn" | "hk" | "crypto" | "uk" | "eu";

/** 根据标的物代码推断市场类型 */
export function detectMarketType(symbol: string): MarketType {
  if (!symbol) return "us";
  const s = symbol.toUpperCase().trim();
  // 加密货币
  if (/^(BTC|ETH|BNB|SOL|ADA|XRP|DOGE|MATIC|DOT|AVAX|LINK|UNI|ATOM|LTC|BCH|ALGO|VET|FIL|TRX|EOS)(-USD|-USDT|-BTC)?$/.test(s)) return "crypto";
  // A股（6位数字，或带sh./sz.前缀）
  if (/^(SH\.|SZ\.)?[0-9]{6}$/.test(s) || /^(600|601|603|605|000|001|002|003|300|688)[0-9]{3}$/.test(s)) return "cn";
  // 港股（4-5位数字，或带.HK后缀）
  if (/^\d{4,5}(\.HK)?$/.test(s) || s.endsWith(".HK")) return "hk";
  // 英股（带.L后缀）
  if (s.endsWith(".L") || s.endsWith(".LON")) return "uk";
  // 欧股（带.DE/.FR/.IT/.ES后缀）
  if (s.endsWith(".DE") || s.endsWith(".FR") || s.endsWith(".IT") || s.endsWith(".ES")) return "eu";
  // 默认美股
  return "us";
}
