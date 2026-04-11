/**
 * jin10Types.ts
 * Jin10 Robust Client v1 类型定义
 *
 * 原则：
 * - Raw 字段：来自 MCP 响应，原样保留，不过滤
 * - Derived 字段：安全计算，可逆，不替换 raw
 * - Normalized 字段：用于展示层，不用于存储
 */
 
import type { Jin10ErrorCode } from "./jin10ErrorCodes.ts";
 
// ─────────────────────────────────────────────────────────────────────────────
// Attempt Trace
// ─────────────────────────────────────────────────────────────────────────────
 
export type AttemptResultType =
  | "success"
  | "empty"
  | "biz_error"
  | "rpc_error"
  | "network_error"
  | "timeout"
  | "parse_error"
  | "cache_hit";
 
export interface AttemptRecord {
  /** 1-based attempt index */
  attemptIndex: number;
  /** MCP tool name called */
  endpoint: string;
  /** Exact params sent (token redacted) */
  params: Record<string, unknown>;
  /** Human label for this attempt strategy */
  strategy: string;
  /** Outcome category */
  resultType: AttemptResultType;
  /** Business status code from response body, null if not reached */
  bizStatus: number | null;
  /** Human-readable failure reason, null on success */
  failureReason: string | null;
  /** Number of items in response, null if not a list or on failure */
  itemCount: number | null;
  /** Wall time from request start to parse complete (ms) */
  latencyMs: number;
  /** First 8 chars of session ID used */
  sessionId: string;
}
 
// ─────────────────────────────────────────────────────────────────────────────
// Unified Response
// ─────────────────────────────────────────────────────────────────────────────
 
export interface Jin10Response<T> {
  /** True only when bizStatus 200 AND data is usable */
  success: boolean;
  /** Typed data, null on any failure */
  data: T | null;
  /**
   * True ONLY when all retry attempts exhausted AND service unreachable.
   * bizStatus 400 / 404 / UNSUPPORTED_CODE / empty array never set this true.
   */
  unavailable: boolean;
  errorCode: Jin10ErrorCode;
  errorMessage: string | null;
  providerUsed: "jin10_live" | "jin10_stale_cache";
  responseTimeMs: number;
  attemptTrace: AttemptRecord[];
  /** Discriminator for the T type */
  dataType: string;
  fetchedAt: number;
}
 
// ─────────────────────────────────────────────────────────────────────────────
// Flash / News raw types
// ─────────────────────────────────────────────────────────────────────────────
 
/** Raw flash item as returned by list_flash / search_flash */
export interface RobustFlashItem {
  // ── Raw fields (preserved as-is from MCP) ──
  /** Main news text. Always present. */
  content: string;
  /** Title field from MCP. OFTEN EMPTY (""). Never use without fallback. */
  rawTitle: string;
  /** RFC3339 with explicit +08:00 timezone. new Date(time) works directly. */
  time: string;
  url: string;
  // ── Derived fields (computed, reversible) ──
  /** Extracted from url.split('/').pop(). No id field in MCP response. */
  id: string;
  publishedAt: number;
  /** rawTitle || content.slice(0, 80). Use for display only, not storage. */
  normalizedTitle: string;
}
 
export interface Jin10FlashPage {
  items: RobustFlashItem[];
  /** Empty string means no more pages */
  nextCursor: string;
  hasMore: boolean;
}
 
/** Raw news article summary (list_news / search_news) */
export interface RobustNewsItem {
  id: string;          // Numeric string. Pass to getNews() for full text.
  title: string;       // Reliable for articles (unlike flash)
  introduction: string;
  time: string;        // RFC3339 +08:00
  url: string;
  publishedAt: number;
}
 
export interface Jin10NewsPage {
  items: RobustNewsItem[];
  nextCursor: string;
  hasMore: boolean;
}
 
/** Full article with content (get_news) */
export interface Jin10Article extends RobustNewsItem {
  content: string;  // Full article text, can be 5000-10000 chars
}
 
// ─────────────────────────────────────────────────────────────────────────────
// Calendar raw types
// ─────────────────────────────────────────────────────────────────────────────
 
/**
 * Raw calendar item as returned by list_calendar.
 *
 * IMPORTANT NOTES:
 * - star: values 1-5, NOT 1-3 (CPI can be 5, core PCE can be 4)
 * - pub_time: Beijing time "YYYY-MM-DD HH:mm", NO timezone marker
 * - actual: null = not yet published (distinct from "" which never appears)
 * - affect_txt: "" for Chinese indicators (not an error)
 * - consensus: null for ~56% of items (normal, not missing data)
 */
export interface RobustCalendarItem {
  // ── Raw fields (ALL preserved, no pre-filtering allowed) ──
  title: string;
  /** "YYYY-MM-DD HH:mm" Beijing time, no timezone suffix */
  pub_time: string;
  /** 1-5 inclusive. Use >= 3 to include high-impact. */
  star: number;
  /** null = not yet published. "0" = published value of zero. */
  actual: string | null;
  /** null is normal (~56% of items) */
  consensus: string | null;
  /** Always has value */
  previous: string;
  /** null for ~80% of items */
  revised: string | null;
  /** "利多" | "利空" | "影响较小" | "" (empty = Chinese indicators, not an error) */
  affect_txt: string;
  // ── Derived fields ──
  /** new Date(pub_time + ':00+08:00').getTime() */
  pubTimestamp: number;
  /** actual !== null */
  isPublished: boolean;
}
 
// ─────────────────────────────────────────────────────────────────────────────
// Quote raw + normalized types
// ─────────────────────────────────────────────────────────────────────────────
 
/**
 * Quote data with both raw strings and parsed numbers.
 * All price fields from MCP are strings; we preserve raw AND provide parsed.
 *
 * ups_percent: positive values have NO '+' prefix (e.g., "1.9673")
 *              negative values have '-' prefix (e.g., "-2.306")
 *              parseFloat() handles both correctly.
 */
export interface RobustQuoteData {
  code: string;
  name: string;
  // ── Raw strings (preserved) ──
  rawClose: string;
  rawOpen: string;
  rawHigh: string;
  rawLow: string;
  rawUpsPrice: string;
  rawUpsPercent: string;
  // ── Parsed numbers (derived) ──
  close: number;
  open: number;
  high: number;
  low: number;
  upsPrice: number;
  upsPercent: number;
  // ── Volume (integer in MCP response, not a string) ──
  volume: number;
  // ── Time ──
  /** RFC3339 with +08:00 */
  time: string;
  updatedAt: number;
}
 
