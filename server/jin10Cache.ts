/**
 * jin10Cache.ts
 * Jin10 缓存层
 *
 * 三个独立缓存：
 * 1. SupportedCodes    — 支持的行情品种列表（24h TTL，可手动失效）
 * 2. UnsupportedCodes  — 已确认不支持的品种（24h TTL，避免重复尝试）
 * 3. CalendarStale     — 上一次成功的日历结果（1h TTL，服务故障时降级使用）
 *
 * 设计约束：
 * - unsupported code 缓存有 TTL，不允许永久锁死
 * - calendar stale cache 返回时必须在 response 中显式标识 providerUsed = "jin10_stale_cache"
 */
 
import type { RobustCalendarItem } from "./jin10Types.ts";
 
// ─────────────────────────────────────────────────────────────────────────────
// TTL constants
// ─────────────────────────────────────────────────────────────────────────────
 
export const SUPPORTED_CODES_TTL_MS  = 24 * 60 * 60 * 1000;  // 24h
export const UNSUPPORTED_CODE_TTL_MS = 24 * 60 * 60 * 1000;  // 24h
export const CALENDAR_STALE_TTL_MS   = 60 * 60 * 1000;       // 1h
 
// ─────────────────────────────────────────────────────────────────────────────
// Internal state (module-level, process lifetime)
// ─────────────────────────────────────────────────────────────────────────────
 
interface SupportedCodesEntry {
  codes: Set<string>;
  fetchedAt: number;
}
 
interface CalendarEntry {
  items: RobustCalendarItem[];
  fetchedAt: number;
}
 
let _supportedCodes: SupportedCodesEntry | null = null;
/** code -> expiry timestamp (Date.now() + TTL) */
const _unsupportedCodes = new Map<string, number>();
let _calendarEntry: CalendarEntry | null = null;
 
// ─────────────────────────────────────────────────────────────────────────────
// Supported codes cache
// ─────────────────────────────────────────────────────────────────────────────
 
/**
 * Returns cached supported codes set, or null if cache is absent/expired.
 * Callers must normalize the code (trim) before calling isCodeSupported.
 */
export function getCachedSupportedCodes(): Set<string> | null {
  if (!_supportedCodes) return null;
  if (Date.now() - _supportedCodes.fetchedAt > SUPPORTED_CODES_TTL_MS) {
    _supportedCodes = null;
    return null;
  }
  return _supportedCodes.codes;
}
 
export function setCachedSupportedCodes(codes: Set<string>): void {
  _supportedCodes = { codes, fetchedAt: Date.now() };
}
 
export function invalidateSupportedCodes(): void {
  _supportedCodes = null;
}
 
// ─────────────────────────────────────────────────────────────────────────────
// Unsupported code cache
// ─────────────────────────────────────────────────────────────────────────────
 
/**
 * Mark a code as permanently unsupported (within TTL window).
 * Individual HK/A-share stocks: all 16+ format variants confirmed failing.
 * These should be cached to avoid retrying.
 */
export function markUnsupported(code: string): void {
  _unsupportedCodes.set(code.trim().toUpperCase(), Date.now() + UNSUPPORTED_CODE_TTL_MS);
}
 
/**
 * Returns true if the code is cached as unsupported AND cache has not expired.
 * Returns false if not cached or TTL expired (caller should try the code again).
 */
export function isDefinitelyUnsupported(code: string): boolean {
  const normalizedCode = code.trim().toUpperCase();
  const expiry = _unsupportedCodes.get(normalizedCode);
  if (expiry === undefined) return false;
  if (Date.now() > expiry) {
    _unsupportedCodes.delete(normalizedCode);
    return false;
  }
  return true;
}
 
/** Force-remove a code from the unsupported cache (for testing or manual refresh) */
export function clearUnsupportedCode(code: string): void {
  _unsupportedCodes.delete(code.trim().toUpperCase());
}
 
// ─────────────────────────────────────────────────────────────────────────────
// Stale calendar cache
// ─────────────────────────────────────────────────────────────────────────────
 
/**
 * Returns the last successful calendar result if within TTL, otherwise null.
 * Callers must check return value and set providerUsed = "jin10_stale_cache".
 */
export function getStaleCalendar(): { items: RobustCalendarItem[]; fetchedAt: number } | null {
  if (!_calendarEntry) return null;
  if (Date.now() - _calendarEntry.fetchedAt > CALENDAR_STALE_TTL_MS) return null;
  return _calendarEntry;
}
 
export function setCalendarCache(items: RobustCalendarItem[]): void {
  _calendarEntry = { items, fetchedAt: Date.now() };
}
 
export function invalidateCalendarCache(): void {
  _calendarEntry = null;
}
 
// ─────────────────────────────────────────────────────────────────────────────
// Test helpers (exported only for unit tests)
// ─────────────────────────────────────────────────────────────────────────────
 
/** @internal For testing only — resets all cache state */
export function _resetAllCaches(): void {
  _supportedCodes = null;
  _unsupportedCodes.clear();
  _calendarEntry = null;
}
 
