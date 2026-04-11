/**
 * jin10Api.ts
 * Jin10 Robust Client v1
 *
 * 提供两层 API：
 *
 * Layer A — 向后兼容层（供 cnFinanceNewsApi.ts 调用）
 *   fetchJin10FlashNews()   -> Jin10FlashResult   (CnNewsResult-compatible)
 *   fetchJin10Calendar()    -> Jin10CalendarResult
 *   fetchJin10Quote(codes?) -> Jin10QuoteResult
 *   DEFAULT_QUOTE_CODES
 *
 * Layer B — Robust 层（完整重试协议 + AttemptTrace + 统一响应）
 *   listFlash(cursor?)
 *   searchFlash(keyword, variants?)
 *   listCalendar()
 *   getQuote(code)
 *   listNews(cursor?)
 *   searchNews(keyword, cursor?)
 *   getNews(id)
 *
 * 协议：MCP 2024-11-05 over Streamable HTTP (SSE responses)
 * 认证：Bearer token in Authorization header
 * Session：mcp-session-id from response header, TTL 25s, rebuild on HTTP 404
 */
 
import { Jin10ErrorCode, classifyErrorCode } from "./jin10ErrorCodes.ts";
import type { AttemptRecord, AttemptResultType } from "./jin10Types.ts";
import {
  type RobustFlashItem,
  type Jin10FlashPage,
  type RobustNewsItem,
  type Jin10NewsPage,
  type Jin10Article,
  type RobustCalendarItem,
  type RobustQuoteData,
  type Jin10Response,
} from "./jin10Types.ts";
import {
  isDefinitelyUnsupported,
  markUnsupported,
  getStaleCalendar,
  setCalendarCache,
  getCachedSupportedCodes,
  setCachedSupportedCodes,
  invalidateSupportedCodes as _invalidateSupportedCodes,
} from "./jin10Cache.ts";
 
// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
 
const BASE_URL = "https://mcp.jin10.com/mcp";
/** Session TTL: conservative 25s, server has no published expiry */
const SESSION_TTL_MS = 25_000;
/**
 * Compat-layer timeout (original value, preserved for backward compat).
 * Do NOT raise this value without first confirming jin10Mcp.test.ts
 * has no timeout-specific assertions or fake-timer dependencies.
 */
const TOOL_TIMEOUT_MS = 3_000;
/**
 * Robust-layer timeouts — used by listFlash / searchFlash / getQuote /
 * listNews / searchNews / getNews.
 * Discovery: typical ~300-400ms, NGAS outlier ~1029ms.
 * AbortController works in Node.js (unlike browser SSE keep-alive override).
 */
const ROBUST_TOOL_TIMEOUT_MS = 8_000;
/** Calendar returns 241 items; allow extra headroom. */
const ROBUST_CALENDAR_TIMEOUT_MS = 10_000;
/** Session initialization timeout. */
const ROBUST_SESSION_TIMEOUT_MS = 5_000;
 
export const DEFAULT_QUOTE_CODES: string[] = [
  "000001", "000300", "HSI",
  "XAUUSD", "USOIL", "UKOIL",
  "EURUSD", "USDCNH", "XAGUSD",
];
 
// ─────────────────────────────────────────────────────────────────────────────
// Session management
// ─────────────────────────────────────────────────────────────────────────────
 
interface SessionState {
  id: string;
  createdAt: number;
}
 
let _session: SessionState | null = null;
/** Prevent concurrent session rebuilds */
let _sessionInitPromise: Promise<string> | null = null;
 
function getToken(): string {
  const token = process.env.JIN10_MCP_TOKEN ?? "";
  if (!token) throw new Error("jin10:auth_missing — JIN10_MCP_TOKEN not configured");
  return token;
}
 
async function ensureSession(forceNew = false): Promise<string> {
  if (!forceNew && _session && Date.now() - _session.createdAt < SESSION_TTL_MS) {
    return _session.id;
  }
 
  // Deduplicate concurrent session init calls
  if (_sessionInitPromise) return _sessionInitPromise;
 
  _sessionInitPromise = (async () => {
    try {
      const token = getToken();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ROBUST_SESSION_TIMEOUT_MS);
      let resp: Response;
      try {
        resp = await fetch(BASE_URL, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2024-11-05",
              capabilities: {},
              clientInfo: { name: "DanTree", version: "1.0" },
            },
          }),
        });
      } finally {
        clearTimeout(timer);
      }
 
      if (resp.status === 401) {
        const body = await resp.text().catch(() => "");
        throw new Error(
          body.includes("no bearer") ? "jin10:auth_missing" : "jin10:auth_invalid",
        );
      }
      if (resp.status >= 500) throw new Error(`jin10:server_error HTTP ${resp.status}`);
 
      const sid = resp.headers.get("mcp-session-id");
      await resp.text(); // consume SSE body
      if (!sid) throw new Error("jin10:no_session_id — server returned no mcp-session-id");
 
      _session = { id: sid, createdAt: Date.now() };
      return sid;
    } finally {
      _sessionInitPromise = null;
    }
  })();
 
  return _sessionInitPromise;
}
 
// ─────────────────────────────────────────────────────────────────────────────
// SSE response parser
// ─────────────────────────────────────────────────────────────────────────────
 
interface McpBizResponse<T> {
  bizStatus: number | null;
  data: T | null;
  message: string;
  rpcErrorCode: number | null;
  rpcErrorMessage: string | null;
}
 
function parseSSE<T>(rawText: string): McpBizResponse<T> {
  const lines = rawText.split("\n").filter((l) => l.startsWith("data:"));
 
  for (const line of lines) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
    } catch {
      continue;
    }
 
    // RPC-level error (e.g., -32602 invalid params)
    if (parsed.error && typeof parsed.error === "object") {
      const err = parsed.error as { code?: number; message?: string };
      return {
        bizStatus: null,
        data: null,
        message: err.message ?? "rpc error",
        rpcErrorCode: typeof err.code === "number" ? err.code : null,
        rpcErrorMessage: err.message ?? null,
      };
    }
 
    // Tool result — business data inside content[0].text
    const result = parsed.result as Record<string, unknown> | undefined;
    const content = result?.content as Array<{ type: string; text?: string }> | undefined;
    if (content?.[0]?.text !== undefined) {
      try {
        const biz = JSON.parse(content[0].text!) as {
          status?: number;
          data?: T;
          message?: string;
        };
        return {
          bizStatus: typeof biz.status === "number" ? biz.status : null,
          data: biz.data ?? null,
          message: biz.message ?? "",
          rpcErrorCode: null,
          rpcErrorMessage: null,
        };
      } catch (e) {
        return {
          bizStatus: null,
          data: null,
          message: `parse_error: ${String(e)}`,
          rpcErrorCode: null,
          rpcErrorMessage: null,
        };
      }
    }
  }
 
  return { bizStatus: null, data: null, message: "empty_response", rpcErrorCode: null, rpcErrorMessage: null };
}
 
// ─────────────────────────────────────────────────────────────────────────────
// Core tool caller (one attempt)
// ─────────────────────────────────────────────────────────────────────────────
 
interface AttemptResult<T> {
  record: AttemptRecord;
  biz: McpBizResponse<T>;
  httpStatus: number | null;
}
 
async function executeAttempt<T>(
  sid: string,
  toolName: string,
  args: Record<string, unknown>,
  attemptIndex: number,
  strategy: string,
  timeoutMs = TOOL_TIMEOUT_MS,
): Promise<AttemptResult<T>> {
  const start = Date.now();
  const sessionIdPrefix = sid.slice(0, 8);
  const token = getToken();
 
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
 
  let httpStatus: number | null = null;
  let biz: McpBizResponse<T>;
  let resultType: AttemptResultType;
  let failureReason: string | null = null;
 
  try {
    const resp = await fetch(BASE_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "mcp-session-id": sid,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: { name: toolName, arguments: args },
      }),
    });
    clearTimeout(timer);
    httpStatus = resp.status;
 
    // Session expired — return without parsing body
    if (resp.status === 404) {
      await resp.text().catch(() => undefined);
      biz = { bizStatus: null, data: null, message: "session not found", rpcErrorCode: null, rpcErrorMessage: null };
      resultType = "biz_error";
      failureReason = `HTTP 404: session expired`;
    } else if (resp.status >= 500) {
      await resp.text().catch(() => undefined);
      biz = { bizStatus: resp.status, data: null, message: `server error ${resp.status}`, rpcErrorCode: null, rpcErrorMessage: null };
      resultType = "biz_error";
      failureReason = `HTTP ${resp.status}: server error`;
    } else {
      const rawText = await resp.text();
      biz = parseSSE<T>(rawText);
 
      if (biz.rpcErrorCode !== null) {
        resultType = "rpc_error";
        failureReason = `RPC ${biz.rpcErrorCode}: ${biz.rpcErrorMessage ?? biz.message}`;
      } else if (biz.bizStatus === null) {
        resultType = "parse_error";
        failureReason = biz.message;
      } else if (biz.bizStatus !== 200) {
        resultType = "biz_error";
        failureReason = `bizStatus ${biz.bizStatus}: ${biz.message}`;
      } else if (biz.data === null) {
        resultType = "parse_error";
        failureReason = "bizStatus 200 but data is null";
      } else {
        resultType = "success";
      }
    }
  } catch (err) {
    clearTimeout(timer);
    const isTimeout = (err as Error).name === "AbortError";
    biz = {
      bizStatus: null,
      data: null,
      message: isTimeout ? "timeout" : String(err),
      rpcErrorCode: null,
      rpcErrorMessage: null,
    };
    resultType = isTimeout ? "timeout" : "network_error";
    failureReason = biz.message;
  }
 
  const latencyMs = Date.now() - start;
 
  // Determine itemCount from data if it's a list-like result
  let itemCount: number | null = null;
  if (resultType === "success" && biz.data !== null) {
    const d = biz.data as Record<string, unknown>;
    if (Array.isArray(d)) itemCount = d.length;
    else if (Array.isArray(d.items)) itemCount = (d.items as unknown[]).length;
    else if (Array.isArray(d.data)) itemCount = (d.data as unknown[]).length;
  }
 
  const record: AttemptRecord = {
    attemptIndex,
    endpoint: toolName,
    params: args,
    strategy,
    resultType,
    bizStatus: biz.bizStatus,
    failureReason,
    itemCount,
    latencyMs,
    sessionId: sessionIdPrefix,
  };
 
  return { record, biz, httpStatus };
}
 
// ─────────────────────────────────────────────────────────────────────────────
// Robust call orchestrator
// ─────────────────────────────────────────────────────────────────────────────
 
interface AttemptConfig {
  args: Record<string, unknown>;
  strategy: string;
  forceNewSession?: boolean;
  delayMs?: number;
}
 
async function robustCall<T>(
  toolName: string,
  attemptConfigs: AttemptConfig[],
  dataType: string,
  timeoutMs = TOOL_TIMEOUT_MS,
): Promise<Jin10Response<T>> {
  const overallStart = Date.now();
  const trace: AttemptRecord[] = [];
 
  for (let i = 0; i < attemptConfigs.length; i++) {
    const cfg = attemptConfigs[i];
 
    if (cfg.delayMs && cfg.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, cfg.delayMs));
    }
 
    let sid: string;
    try {
      sid = await ensureSession(cfg.forceNewSession ?? false);
    } catch (err) {
      // Session init itself failed — classify and record
      const msg = String(err);
      const errorCode: Jin10ErrorCode =
        msg.includes("auth_missing") ? Jin10ErrorCode.AUTH_MISSING :
        msg.includes("auth_invalid") ? Jin10ErrorCode.AUTH_INVALID :
        msg.includes("timeout")      ? Jin10ErrorCode.TIMEOUT :
                                        Jin10ErrorCode.NETWORK_ERROR;
 
      trace.push({
        attemptIndex: i + 1,
        endpoint: toolName,
        params: cfg.args,
        strategy: cfg.strategy,
        resultType: "network_error",
        bizStatus: null,
        failureReason: msg,
        itemCount: null,
        latencyMs: 0,
        sessionId: "init_fail",
      });
 
      // If auth failure, no point retrying
      if (errorCode === Jin10ErrorCode.AUTH_MISSING || errorCode === Jin10ErrorCode.AUTH_INVALID) {
        return buildFailResponse(errorCode, msg, trace, dataType, overallStart);
      }
      continue;
    }
 
    const result = await executeAttempt<T>(sid, toolName, cfg.args, i + 1, cfg.strategy, timeoutMs);
    trace.push(result.record);
 
    // Handle session expiry — invalidate and let next attempt rebuild
    if (result.httpStatus === 404) {
      _session = null;
      continue;
    }
 
    // Auth failure — no recovery
    if (result.httpStatus === 401) {
      const msg = result.biz.message ?? "auth error";
      const ec = msg.includes("no bearer") ? Jin10ErrorCode.AUTH_MISSING : Jin10ErrorCode.AUTH_INVALID;
      return buildFailResponse(ec, msg, trace, dataType, overallStart);
    }
 
    // RPC error — bad params, no recovery by retrying same call
    if (result.record.resultType === "rpc_error") {
      return buildFailResponse(
        Jin10ErrorCode.BAD_PARAMS,
        result.biz.message,
        trace,
        dataType,
        overallStart,
      );
    }
 
    // Business-level errors
    if (result.biz.bizStatus !== null && result.biz.bizStatus !== 200) {
      const ec = classifyErrorCode({
        httpStatus: result.httpStatus,
        bizStatus: result.biz.bizStatus,
        bizMessage: result.biz.message,
        rpcErrorCode: result.biz.rpcErrorCode,
        isTimeout: false,
        isNetworkError: false,
        toolName,
      });
 
      // These are permanent — no point retrying with different session
      if (
        ec === Jin10ErrorCode.UNSUPPORTED_CODE ||
        ec === Jin10ErrorCode.ARTICLE_NOT_FOUND ||
        ec === Jin10ErrorCode.BAD_PARAMS
      ) {
        return buildFailResponse(ec, result.biz.message, trace, dataType, overallStart);
      }
 
      // Otherwise continue to next attempt
      continue;
    }
 
    // Parse error — try next attempt
    if (result.record.resultType === "parse_error") continue;
 
    // Timeout or network — try next attempt
    if (result.record.resultType === "timeout" || result.record.resultType === "network_error") {
      continue;
    }
 
    // SUCCESS
    if (result.record.resultType === "success" && result.biz.data !== null) {
      return {
        success: true,
        data: result.biz.data,
        unavailable: false,
        errorCode: Jin10ErrorCode.SUCCESS,
        errorMessage: null,
        providerUsed: "jin10_live",
        responseTimeMs: Date.now() - overallStart,
        attemptTrace: trace,
        dataType,
        fetchedAt: Date.now(),
      };
    }
  }
 
  // All attempts exhausted
  const lastRecord = trace[trace.length - 1];
  // classifyErrorCode() cannot infer PARSE_ERROR from bizStatus/httpStatus alone,
  // so we check resultType first before delegating to the classifier.
  let ec: Jin10ErrorCode;
  if (!lastRecord) {
    ec = Jin10ErrorCode.UNKNOWN;
  } else if (lastRecord.resultType === "parse_error") {
    ec = Jin10ErrorCode.PARSE_ERROR;
  } else {
    ec = classifyErrorCode({
      httpStatus: null,
      bizStatus: lastRecord.bizStatus,
      bizMessage: lastRecord.failureReason ?? "",
      rpcErrorCode: null,
      isTimeout: lastRecord.resultType === "timeout",
      isNetworkError: lastRecord.resultType === "network_error",
      toolName,
    });
  }
 
  return {
    success: false,
    data: null,
    unavailable: true,
    errorCode: ec,
    errorMessage: `All ${attemptConfigs.length} attempts failed`,
    providerUsed: "jin10_live",
    responseTimeMs: Date.now() - overallStart,
    attemptTrace: trace,
    dataType,
    fetchedAt: Date.now(),
  };
}
 
function buildFailResponse<T>(
  errorCode: Jin10ErrorCode,
  errorMessage: string,
  trace: AttemptRecord[],
  dataType: string,
  startTime: number,
): Jin10Response<T> {
  // Permanent failures (bad params, unsupported code, article not found) are NOT unavailable
  const permanentFailures: Jin10ErrorCode[] = [
    Jin10ErrorCode.BAD_PARAMS,
    Jin10ErrorCode.UNSUPPORTED_CODE,
    Jin10ErrorCode.ARTICLE_NOT_FOUND,
  ];
  const unavailable = !permanentFailures.includes(errorCode);
 
  return {
    success: false,
    data: null,
    unavailable,
    errorCode,
    errorMessage,
    providerUsed: "jin10_live",
    responseTimeMs: Date.now() - startTime,
    attemptTrace: trace,
    dataType,
    fetchedAt: Date.now(),
  };
}
 
// ─────────────────────────────────────────────────────────────────────────────
// Raw data transformers
// ─────────────────────────────────────────────────────────────────────────────
 
function transformFlashItem(raw: {
  content: string;
  title?: string;
  time: string;
  url: string;
}): RobustFlashItem {
  const rawTitle = raw.title ?? "";
  return {
    content: raw.content,
    rawTitle,
    time: raw.time,
    url: raw.url,
    id: raw.url.split("/").pop() ?? String(Date.now()),
    publishedAt: new Date(raw.time).getTime(),
    normalizedTitle: rawTitle || raw.content.slice(0, 80),
  };
}
 
function transformCalendarItem(raw: {
  title: string;
  pub_time: string;
  star: number;
  actual: string | null;
  consensus: string | null;
  previous: string;
  revised: string | null;
  affect_txt: string;
}): RobustCalendarItem {
  return {
    title: raw.title,
    pub_time: raw.pub_time,
    star: raw.star,
    actual: raw.actual,
    consensus: raw.consensus,
    previous: raw.previous,
    revised: raw.revised,
    affect_txt: raw.affect_txt,
    // pub_time format: "2026-04-10 20:30" (Beijing time, no timezone)
    // Must append ':00+08:00' for correct UTC conversion
    pubTimestamp: new Date(raw.pub_time + ":00+08:00").getTime(),
    isPublished: raw.actual !== null,
  };
}
 
function transformQuoteItem(raw: {
  code: string;
  name: string;
  close: string;
  open: string;
  high: string;
  low: string;
  ups_price: string;
  ups_percent: string;
  volume: number;
  time: string;
}): RobustQuoteData {
  return {
    code: raw.code,
    name: raw.name,
    rawClose: raw.close,
    rawOpen: raw.open,
    rawHigh: raw.high,
    rawLow: raw.low,
    rawUpsPrice: raw.ups_price,
    rawUpsPercent: raw.ups_percent,
    close: parseFloat(raw.close),
    open: parseFloat(raw.open),
    high: parseFloat(raw.high),
    low: parseFloat(raw.low),
    upsPrice: parseFloat(raw.ups_price),
    upsPercent: parseFloat(raw.ups_percent),
    volume: raw.volume,
    time: raw.time,
    updatedAt: new Date(raw.time).getTime(),
  };
}
 
function transformNewsItem(raw: {
  id: string;
  title: string;
  introduction: string;
  time: string;
  url: string;
}): RobustNewsItem {
  return { ...raw, publishedAt: new Date(raw.time).getTime() };
}
 
// ─────────────────────────────────────────────────────────────────────────────
// Supported codes pre-validation (positive cache)
// ─────────────────────────────────────────────────────────────────────────────
 
/**
 * Fetch the Jin10 supported quote codes list via MCP resources/read.
 *
 * Key difference from tool calls:
 *   - Method: "resources/read"  (not "tools/call")
 *   - Response path: result.contents[0].text  (not result.content[0].text)
 *
 * Returns null on any error — failure is non-fatal.
 * Caller (ensureSupportedCodes) will skip pre-validation if null.
 */
async function fetchSupportedCodesFromMcp(): Promise<Set<string> | null> {
  try {
    const sid = await ensureSession();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ROBUST_TOOL_TIMEOUT_MS);
    let resp: Response;
    try {
      resp = await fetch(BASE_URL, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${getToken()}`,
          "mcp-session-id": sid,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "resources/read",
          params: { uri: "quote://codes" },
        }),
      });
    } finally {
      clearTimeout(timer);
    }
 
    if (!resp.ok) return null;
 
    const rawText = await resp.text();
    const lines = rawText.split("\n").filter((l) => l.startsWith("data:"));
    for (const line of lines) {
      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(line.slice(5).trim()) as Record<string, unknown>; }
      catch { continue; }
 
      // resources/read uses "contents" (plural), unlike tool calls which use "content"
      const result = parsed.result as Record<string, unknown> | undefined;
      const contents = result?.contents as Array<{ text?: string }> | undefined;
      if (contents?.[0]?.text) {
        const codeList = JSON.parse(contents[0].text) as string[];
        return new Set(codeList.map((c) => c.trim().toUpperCase()));
      }
    }
  } catch {
    // Non-fatal — if we can't get the list, getQuote proceeds without pre-validation
  }
  return null;
}
 
/**
 * Returns supported codes Set from cache (24h TTL) or fetches fresh.
 * Returns null if fetch fails → caller skips pre-validation and proceeds to get_quote.
 */
async function ensureSupportedCodes(): Promise<Set<string> | null> {
  const cached = getCachedSupportedCodes();
  if (cached) return cached;
 
  const fresh = await fetchSupportedCodesFromMcp();
  if (fresh) setCachedSupportedCodes(fresh);
  return fresh;
}
 
// ─────────────────────────────────────────────────────────────────────────────
// LAYER B: Robust API
// ─────────────────────────────────────────────────────────────────────────────
 
// ── Flash ──
 
/**
 * Fetch paginated flash news.
 *
 * Retry protocol (3 attempts):
 *   1. list_flash({})           — primary
 *   2. list_flash({cursor:""})  — cursor reset (equivalent to no cursor, tests state reset)
 *   3. list_flash({})           — session rebuild
 *
 * Empty array is NOT unavailable (errorCode = NO_DATA, success = true).
 */
export async function listFlash(cursor?: string): Promise<Jin10Response<Jin10FlashPage>> {
  const primaryArgs: Record<string, unknown> = cursor ? { cursor } : {};
 
  const raw = await robustCall<{
    items: Array<{ content: string; title?: string; time: string; url: string }>;
    next_cursor: string;
    has_more: boolean;
  }>(
    "list_flash",
    [
      { args: primaryArgs,          strategy: "primary" },
      { args: { cursor: "" },       strategy: "cursor_reset" },
      { args: {},                   strategy: "session_rebuild", forceNewSession: true },
    ],
    "flash_page",
    ROBUST_TOOL_TIMEOUT_MS,
  );
 
  if (!raw.success || !raw.data) return raw as unknown as Jin10Response<Jin10FlashPage>;
 
  const items = raw.data.items.map(transformFlashItem);
  const page: Jin10FlashPage = {
    items,
    nextCursor: raw.data.next_cursor ?? "",
    hasMore: raw.data.has_more ?? false,
  };
 
  // Empty result is success with NO_DATA, not unavailable
  if (items.length === 0) {
    return {
      ...raw,
      success: true,
      data: page,
      unavailable: false,
      errorCode: Jin10ErrorCode.NO_DATA,
      errorMessage: "list_flash returned 0 items",
    };
  }
 
  return { ...raw, data: page };
}
 
/**
 * Search flash news by keyword.
 *
 * Rules:
 * - Chinese keywords only. English returns 0 results (not an error).
 * - Single keyword only. Space-separated multi-word also returns 0 results.
 * - No pagination (server limitation, max 150 results).
 * - 0 results = NO_DATA, success=true, NOT unavailable.
 *
 * Retry protocol:
 *   - For each keyword (primary + up to 2 variants):
 *       attempt 1: primary call
 *       attempt 2: session rebuild if first fails
 *   - 0 results from one keyword → try next keyword variant
 *   - All keywords exhausted with 0 results → NO_DATA (success=true, unavailable=false)
 *   - Real transport/auth failure → unavailable=true after exhausting attempts
 */
export async function searchFlash(
  keyword: string,
  variants: string[] = [],
): Promise<Jin10Response<RobustFlashItem[]>> {
  if (!keyword.trim()) {
    return {
      success: false,
      data: null,
      unavailable: false,
      errorCode: Jin10ErrorCode.BAD_PARAMS,
      errorMessage: "keyword must be non-empty",
      providerUsed: "jin10_live",
      responseTimeMs: 0,
      attemptTrace: [],
      dataType: "flash_items",
      fetchedAt: Date.now(),
    };
  }
 
  const overallStart = Date.now();
  const allTraces: AttemptRecord[] = [];
  const keywords = [keyword.trim(), ...variants.map((v) => v.trim()).filter(Boolean)].slice(0, 3);
 
  for (let ki = 0; ki < keywords.length; ki++) {
    const kw = keywords[ki];
    const strategyBase = ki === 0 ? "primary" : `keyword_variant_${ki + 1}`;
 
    // Each keyword gets: primary attempt + session_rebuild attempt
    const raw = await robustCall<{ items: Array<{ content: string; title?: string; time: string; url: string }> }>(
      "search_flash",
      [
        { args: { keyword: kw }, strategy: strategyBase },
        { args: { keyword: kw }, strategy: `${strategyBase}_session_rebuild`, forceNewSession: true },
      ],
      "flash_items",
      ROBUST_TOOL_TIMEOUT_MS,
    );
 
    allTraces.push(...raw.attemptTrace);
 
    // Hard failure (network/auth) — bail out, no point trying more keywords
    // Explicit object with data: null — semantically correct (unavailable=true always means no data)
    // and satisfies Jin10Response<RobustFlashItem[]> return type without type assertions.
    if (raw.unavailable) {
      return {
        success: false,
        data: null,
        unavailable: true,
        errorCode: raw.errorCode,
        errorMessage: raw.errorMessage,
        providerUsed: raw.providerUsed,
        responseTimeMs: Date.now() - overallStart,
        attemptTrace: allTraces,
        dataType: raw.dataType,
        fetchedAt: raw.fetchedAt,
      };
    }
 
    // Got actual results — return them
    if (raw.success && raw.data && raw.data.items.length > 0) {
      return {
        ...raw,
        data: raw.data.items.map(transformFlashItem),
        responseTimeMs: Date.now() - overallStart,
        attemptTrace: allTraces,
      };
    }
 
    // 0 results or recoverable error → try next keyword variant
  }
 
  // All keywords returned 0 results or soft errors
  return {
    success: true,
    data: [],
    unavailable: false,
    errorCode: Jin10ErrorCode.NO_DATA,
    errorMessage: `All ${keywords.length} keyword variants returned 0 results for "${keyword}"`,
    providerUsed: "jin10_live",
    responseTimeMs: Date.now() - overallStart,
    attemptTrace: allTraces,
    dataType: "flash_items",
    fetchedAt: Date.now(),
  };
}
 
// ── Calendar ──
 
/**
 * Fetch this week's economic calendar (full 241 items, no pre-filtering).
 *
 * Retry protocol (3 attempts + stale cache):
 *   1. list_calendar({})         — primary
 *   2. list_calendar({})         — session rebuild
 *   3. list_calendar({})         — session rebuild + 5s delay
 *   Fallback: stale cache (1h TTL) if all 3 fail
 *
 * Raw data guarantee:
 *   - All 241 items returned
 *   - star 1-5 preserved (NOT clamped to 1-3)
 *   - affect_txt="" preserved (Chinese indicators)
 *   - actual=null preserved (upcoming events)
 *   - NO pre-filtering by star/affect_txt/actual
 */
export async function listCalendar(): Promise<Jin10Response<RobustCalendarItem[]>> {
  const raw = await robustCall<Array<{
    title: string;
    pub_time: string;
    star: number;
    actual: string | null;
    consensus: string | null;
    previous: string;
    revised: string | null;
    affect_txt: string;
  }>>(
    "list_calendar",
    [
      { args: {},                             strategy: "primary" },
      { args: {},                             strategy: "session_rebuild",       forceNewSession: true },
      { args: {},                             strategy: "session_rebuild_delay", forceNewSession: true, delayMs: 5_000 },
    ],
    "calendar_items",
    ROBUST_CALENDAR_TIMEOUT_MS,
  );
 
  if (raw.success && raw.data && Array.isArray(raw.data)) {
    const items = raw.data.map(transformCalendarItem);
    setCalendarCache(items); // Update stale cache on success
    return { ...raw, data: items };
  }
 
  // Live failed — try stale cache
  const stale = getStaleCalendar();
  if (stale) {
    return {
      success: false,    // Live call failed
      data: stale.items,
      unavailable: false, // Service may recover; we have data
      errorCode: Jin10ErrorCode.STALE_CACHE,
      errorMessage: "Served from stale cache (live call failed)",
      providerUsed: "jin10_stale_cache",
      responseTimeMs: Date.now() - (raw.fetchedAt - raw.responseTimeMs),
      attemptTrace: raw.attemptTrace,
      dataType: "calendar_items",
      fetchedAt: stale.fetchedAt,
    };
  }
 
  return raw as unknown as Jin10Response<RobustCalendarItem[]>;
}
 
// ── Quote ──
 
/**
 * Fetch single-code real-time quote.
 *
 * Retry protocol (2 attempts):
 *   1. get_quote({code})         — primary (with trim)
 *   2. get_quote({code})         — session rebuild
 *
 * Short-circuits:
 *   - isDefinitelyUnsupported(code) = true -> immediate UNSUPPORTED_CODE (no network call)
 *   - bizStatus 400 with "不支持该品种" -> UNSUPPORTED_CODE + markUnsupported(code)
 *
 * Individual HK/A-share stocks confirmed not supported (16 HK + 10 A-share formats tested).
 * Do NOT retry with format variants — there are none that work.
 */
export async function getQuote(code: string): Promise<Jin10Response<RobustQuoteData>> {
  const normalizedCode = code.trim();
 
  if (!normalizedCode) {
    return {
      success: false,
      data: null,
      unavailable: false,
      errorCode: Jin10ErrorCode.BAD_PARAMS,
      errorMessage: "code must be non-empty",
      providerUsed: "jin10_live",
      responseTimeMs: 0,
      attemptTrace: [],
      dataType: "quote",
      fetchedAt: Date.now(),
    };
  }
 
  // Short-circuit if already cached as unsupported (negative cache, checked first)
  if (isDefinitelyUnsupported(normalizedCode)) {
    return {
      success: false,
      data: null,
      unavailable: false,
      errorCode: Jin10ErrorCode.UNSUPPORTED_CODE,
      errorMessage: `Code "${normalizedCode}" is not in Jin10 supported list (cached)`,
      providerUsed: "jin10_live",
      responseTimeMs: 0,
      attemptTrace: [],
      dataType: "quote",
      fetchedAt: Date.now(),
    };
  }
 
  // Pre-validate against supported codes list (positive cache, 24h TTL).
  // Non-fatal: if the list is unavailable (null), skip pre-validation and try get_quote anyway.
  // Codes are stored uppercase in the cache; Jin10 server is case-insensitive.
  const supported = await ensureSupportedCodes();
  if (supported !== null && !supported.has(normalizedCode.toUpperCase())) {
    markUnsupported(normalizedCode);
    return {
      success: false,
      data: null,
      unavailable: false,
      errorCode: Jin10ErrorCode.UNSUPPORTED_CODE,
      errorMessage: `Code "${normalizedCode}" is not in Jin10 supported codes list (pre-validated)`,
      providerUsed: "jin10_live",
      responseTimeMs: 0,
      attemptTrace: [],
      dataType: "quote",
      fetchedAt: Date.now(),
    };
  }
 
  const raw = await robustCall<{
    code: string;
    name: string;
    close: string;
    open: string;
    high: string;
    low: string;
    ups_price: string;
    ups_percent: string;
    volume: number;
    time: string;
  }>(
    "get_quote",
    [
      { args: { code: normalizedCode }, strategy: "primary" },
      { args: { code: normalizedCode }, strategy: "session_rebuild", forceNewSession: true },
    ],
    "quote",
    ROBUST_TOOL_TIMEOUT_MS,
  );
 
  // Cache unsupported code to avoid future retries
  if (raw.errorCode === Jin10ErrorCode.UNSUPPORTED_CODE) {
    markUnsupported(normalizedCode);
  }
 
  if (!raw.success || !raw.data) return raw as unknown as Jin10Response<RobustQuoteData>;
 
  return { ...raw, data: transformQuoteItem(raw.data) };
}
 
// ── News ──
 
export async function listNews(cursor?: string): Promise<Jin10Response<Jin10NewsPage>> {
  const args: Record<string, unknown> = cursor ? { cursor } : {};
 
  const raw = await robustCall<{
    items: Array<{ id: string; title: string; introduction: string; time: string; url: string }>;
    next_cursor: string;
    has_more: boolean;
  }>(
    "list_news",
    [
      { args,                   strategy: "primary" },
      { args: {},               strategy: "session_rebuild", forceNewSession: true },
    ],
    "news_page",
    ROBUST_TOOL_TIMEOUT_MS,
  );
 
  if (!raw.success || !raw.data) return raw as unknown as Jin10Response<Jin10NewsPage>;
 
  return {
    ...raw,
    data: {
      items: raw.data.items.map(transformNewsItem),
      nextCursor: raw.data.next_cursor ?? "",
      hasMore: raw.data.has_more ?? false,
    },
  };
}
 
export async function searchNews(
  keyword: string,
  cursor?: string,
): Promise<Jin10Response<Jin10NewsPage>> {
  if (!keyword.trim()) {
    return {
      success: false,
      data: null,
      unavailable: false,
      errorCode: Jin10ErrorCode.BAD_PARAMS,
      errorMessage: "keyword must be non-empty",
      providerUsed: "jin10_live",
      responseTimeMs: 0,
      attemptTrace: [],
      dataType: "news_page",
      fetchedAt: Date.now(),
    };
  }
 
  const args: Record<string, unknown> = { keyword: keyword.trim() };
  if (cursor) args.cursor = cursor;
 
  const raw = await robustCall<{
    items: Array<{ id: string; title: string; introduction: string; time: string; url: string }>;
    next_cursor: string;
    has_more: boolean;
  }>(
    "search_news",
    [
      { args,   strategy: "primary" },
      { args,   strategy: "session_rebuild", forceNewSession: true },
    ],
    "news_page",
    ROBUST_TOOL_TIMEOUT_MS,
  );
 
  if (!raw.success || !raw.data) return raw as unknown as Jin10Response<Jin10NewsPage>;
 
  const items = raw.data.items.map(transformNewsItem);
  if (items.length === 0) {
    return {
      ...raw,
      success: true,
      data: { items: [], nextCursor: "", hasMore: false },
      errorCode: Jin10ErrorCode.NO_DATA,
      errorMessage: `search_news returned 0 results for "${keyword}"`,
    };
  }
 
  return {
    ...raw,
    data: {
      items,
      nextCursor: raw.data.next_cursor ?? "",
      hasMore: raw.data.has_more ?? false,
    },
  };
}
 
/**
 * Fetch full article by ID.
 *
 * bizStatus 404 -> ARTICLE_NOT_FOUND (not unavailable, not retryable)
 * No retry on 404 — article is genuinely missing.
 * Retry once on session error only.
 */
export async function getNews(id: string): Promise<Jin10Response<Jin10Article>> {
  if (!id.trim()) {
    return {
      success: false,
      data: null,
      unavailable: false,
      errorCode: Jin10ErrorCode.BAD_PARAMS,
      errorMessage: "id must be non-empty",
      providerUsed: "jin10_live",
      responseTimeMs: 0,
      attemptTrace: [],
      dataType: "article",
      fetchedAt: Date.now(),
    };
  }
 
  const raw = await robustCall<{
    id: string;
    title: string;
    introduction: string;
    content: string;
    time: string;
    url: string;
  }>(
    "get_news",
    [
      { args: { id: String(id) }, strategy: "primary" },
      { args: { id: String(id) }, strategy: "session_rebuild", forceNewSession: true },
    ],
    "article",
    ROBUST_TOOL_TIMEOUT_MS,
  );
 
  if (!raw.success || !raw.data) return raw as unknown as Jin10Response<Jin10Article>;
 
  return {
    ...raw,
    data: {
      ...transformNewsItem(raw.data),
      content: raw.data.content,
    },
  };
}
 
// ─────────────────────────────────────────────────────────────────────────────
// LAYER A: Backward-compatible API (for cnFinanceNewsApi.ts)
// ─────────────────────────────────────────────────────────────────────────────
 
/** Structurally compatible with CnNewsItem in cnFinanceNewsApi.ts */
export interface Jin10FlashItem {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: number;
  important?: boolean;
}
 
/** Structurally compatible with CnNewsResult in cnFinanceNewsApi.ts */
export interface Jin10FlashResult {
  source: string;
  items: Jin10FlashItem[];
  fetchedAt: number;
  error?: string;
}
 
export interface Jin10CalendarItem {
  title: string;
  pub_time: string;
  star: number;
  actual: string | null;
  consensus: string | null;
  previous: string;
  revised: string | null;
  affect_txt: string;
}
 
export interface Jin10CalendarResult {
  source: string;
  items: Jin10CalendarItem[];
  fetchedAt: number;
  error?: string;
}
 
export interface Jin10QuoteItem {
  code: string;
  name: string;
  close: number;
  open: number;
  high: number;
  low: number;
  upsPrice: number;
  upsPercent: number;
  volume: number;
  time: string;
}
 
export interface Jin10QuoteResult {
  source: string;
  items: Jin10QuoteItem[];
  fetchedAt: number;
  error?: string;
}
 
/**
 * Backward-compatible flash news fetch.
 * Internally uses robust listFlash() with retry protocol.
 * Returns CnNewsResult-compatible structure.
 */
export async function fetchJin10FlashNews(): Promise<Jin10FlashResult> {
  const source = "金十数据";
  try {
    const result = await listFlash();
    if (result.success && result.data && result.data.items.length > 0) {
      return {
        source,
        items: result.data.items.map((item) => ({
          id: item.id,
          title: item.normalizedTitle,
          url: item.url,
          source,
          publishedAt: item.publishedAt,
          important: false,
        })),
        fetchedAt: result.fetchedAt,
      };
    }
    return {
      source,
      items: [],
      fetchedAt: Date.now(),
      error: result.errorMessage ?? result.errorCode,
    };
  } catch (err) {
    return { source, items: [], fetchedAt: Date.now(), error: String(err) };
  }
}
 
/**
 * Backward-compatible calendar fetch.
 * Returns raw items; caller filters as needed.
 */
export async function fetchJin10Calendar(): Promise<Jin10CalendarResult> {
  const source = "金十数据";
  try {
    const result = await listCalendar();
    if ((result.success || result.errorCode === Jin10ErrorCode.STALE_CACHE) && result.data) {
      return {
        source,
        items: result.data.map((item) => ({
          title: item.title,
          pub_time: item.pub_time,
          star: item.star,
          actual: item.actual,
          consensus: item.consensus,
          previous: item.previous,
          revised: item.revised,
          affect_txt: item.affect_txt,
        })),
        fetchedAt: result.fetchedAt,
      };
    }
    return { source, items: [], fetchedAt: Date.now(), error: result.errorMessage ?? result.errorCode };
  } catch (err) {
    return { source, items: [], fetchedAt: Date.now(), error: String(err) };
  }
}
 
/**
 * Backward-compatible quote fetch for multiple codes.
 * Fetches each code individually using the robust getQuote().
 */
export async function fetchJin10Quote(codes: string[] = DEFAULT_QUOTE_CODES): Promise<Jin10QuoteResult> {
  const source = "金十数据";
  try {
    const results = await Promise.all(codes.map((code) => getQuote(code)));
    const items: Jin10QuoteItem[] = results
      .filter((r) => r.success && r.data !== null)
      .map((r) => {
        const d = r.data!;
        return {
          code: d.code,
          name: d.name,
          close: d.close,
          open: d.open,
          high: d.high,
          low: d.low,
          upsPrice: d.upsPrice,
          upsPercent: d.upsPercent,
          volume: d.volume,
          time: d.time,
        };
      });
    return { source, items, fetchedAt: Date.now() };
  } catch (err) {
    return { source, items: [], fetchedAt: Date.now(), error: String(err) };
  }
}
 
// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────
 
/**
 * @internal For unit tests only — resets session state ONLY.
 * Does NOT reset caches. Call _resetAllCaches() separately if needed.
 * Keeping these separate allows tests to populate a cache, reset the session,
 * and verify stale-cache fallback behavior.
 */
export function _resetSession(): void {
  _session = null;
  _sessionInitPromise = null;
}
 
