/**
 * dataSourceTypes.ts
 *
 * 服务端数据源调用层通用类型定义。
 *
 * 设计原则：
 *   - 只放通用结构类型，不放业务类型
 *   - 不依赖任何具体数据源（Jin10 / cnFinance / FMP 等）
 *   - 供后续 provider 接入时统一返回结构，降低上层解析成本
 *
 * 使用方式：
 *   import type { DataSourceResult } from "./dataSourceTypes";
 *
 *   async function fetchPrice(ticker: string): Promise<DataSourceResult<PriceData>> {
 *     const t0 = Date.now();
 *     try {
 *       const data = await someApi.getPrice(ticker);
 *       return {
 *         success: true,
 *         data,
 *         unavailable: false,
 *         providerUsed: "fmp",
 *         responseTimeMs: Date.now() - t0,
 *       };
 *     } catch (err) {
 *       return {
 *         success: false,
 *         data: null,
 *         unavailable: true,
 *         errorCode: err instanceof Error ? err.message : "UNKNOWN_ERROR",
 *         providerUsed: "fmp",
 *         responseTimeMs: Date.now() - t0,
 *       };
 *     }
 *   }
 */

// ─── 核心通用结构 ─────────────────────────────────────────────────────────────

/**
 * 数据源调用统一返回结构。
 *
 * @template T  业务数据类型（如 PriceData、NewsItem[] 等）
 *
 * 字段说明：
 *   success        — 调用是否成功（true = 有有效数据）
 *   data           — 业务数据，失败时为 null
 *   unavailable    — provider 不可用（网络超时、API 限流、未配置等）
 *   errorCode      — 错误标识符（可选，仅在 success=false 时有意义）
 *   providerUsed   — 实际使用的数据源名称（如 "fmp"、"finnhub"、"jin10"）
 *   responseTimeMs — 调用耗时（毫秒），用于 debug / latency 监控
 */
export type DataSourceResult<T> = {
  success: boolean;
  data: T | null;
  unavailable: boolean;
  errorCode?: string;
  providerUsed: string;
  responseTimeMs: number;
};

// ─── 辅助工厂函数 ─────────────────────────────────────────────────────────────

/**
 * 构造成功结果（减少重复代码）
 */
export function successResult<T>(
  data: T,
  providerUsed: string,
  responseTimeMs: number
): DataSourceResult<T> {
  return {
    success: true,
    data,
    unavailable: false,
    providerUsed,
    responseTimeMs,
  };
}

/**
 * 构造失败结果（减少重复代码）
 */
export function failResult<T>(
  providerUsed: string,
  responseTimeMs: number,
  errorCode?: string
): DataSourceResult<T> {
  return {
    success: false,
    data: null,
    unavailable: true,
    errorCode,
    providerUsed,
    responseTimeMs,
  };
}

// ─── 常用 errorCode 常量（可选使用） ─────────────────────────────────────────

export const DATA_SOURCE_ERROR = {
  /** API key 未配置 */
  NOT_CONFIGURED: "NOT_CONFIGURED",
  /** 网络超时或连接失败 */
  NETWORK_ERROR: "NETWORK_ERROR",
  /** API 限流（429） */
  RATE_LIMITED: "RATE_LIMITED",
  /** 返回数据为空（非错误，但无有效内容） */
  EMPTY_RESPONSE: "EMPTY_RESPONSE",
  /** 数据解析失败 */
  PARSE_ERROR: "PARSE_ERROR",
  /** 未知错误 */
  UNKNOWN: "UNKNOWN_ERROR",
} as const;

export type DataSourceErrorCode = typeof DATA_SOURCE_ERROR[keyof typeof DATA_SOURCE_ERROR];
