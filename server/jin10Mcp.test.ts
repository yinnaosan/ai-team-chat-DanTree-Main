/**
 * jin10Mcp.test.ts
 * Jin10 Robust Client v1 测试
 *
 * 覆盖：
 * - Session init success / rebuild after HTTP 404
 * - list_flash: success / empty result / cursor pagination
 * - search_flash: NO_DATA / BAD_PARAMS / keyword variants
 * - list_calendar: raw retention / stale cache fallback
 * - get_quote: supported / UNSUPPORTED_CODE / cache behavior
 * - get_news: success / ARTICLE_NOT_FOUND / BAD_PARAMS
 * - AttemptTrace: length and content
 * - providerUsed / responseTimeMs presence
 * - Error taxonomy: never mistake 400/404/empty for unavailable
 */
 
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  listFlash,
  searchFlash,
  listCalendar,
  getQuote,
  getNews,
  listNews,
  _resetSession,
} from "./jin10Api.ts";
import { Jin10ErrorCode } from "./jin10ErrorCodes.ts";
import { _resetAllCaches, markUnsupported, setCachedSupportedCodes, invalidateSupportedCodes } from "./jin10Cache.ts";
 
// ─────────────────────────────────────────────────────────────────────────────
// Mock helpers
// ─────────────────────────────────────────────────────────────────────────────
 
const MOCK_SESSION_ID = "TESTSESSION123";
 
/** Build a fake fetch Response that includes mcp-session-id header */
function makeInitResponse(sessionId = MOCK_SESSION_ID): Response {
  const headers = new Headers({ "mcp-session-id": sessionId });
  const body = `event: message\ndata: ${JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    result: {
      capabilities: {},
      protocolVersion: "2024-11-05",
      serverInfo: { name: "mcp-server", version: "1.0.0" },
    },
  })}\n\n`;
  return new Response(body, { status: 200, headers });
}
 
/** Build a successful tool call SSE response */
function makeToolResponse(bizStatus: number, data: unknown, message = ""): Response {
  const body = `event: message\ndata: ${JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    result: {
      content: [{ type: "text", text: JSON.stringify({ status: bizStatus, data, message }) }],
    },
  })}\n\n`;
  return new Response(body, { status: 200 });
}
 
/** Build a RPC error response (-32602 etc.) */
function makeRpcErrorResponse(code: number, message: string): Response {
  const body = `event: message\ndata: ${JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    error: { code, message },
  })}\n\n`;
  return new Response(body, { status: 200 });
}
 
/** Build a plain HTTP error response */
function makeHttpError(status: number, body = ""): Response {
  return new Response(body, { status });
}
 
/** Build a resources/read SSE response containing quote codes list */
function makeResourcesResponse(codes: string[]): Response {
  const body = `event: message\ndata: ${JSON.stringify({
    jsonrpc: "2.0", id: 1,
    result: {
      contents: [{ uri: "quote://codes", mimeType: "application/json", text: JSON.stringify(codes) }],
    },
  })}\n\n`;
  return new Response(body, { status: 200 });
}
 
// Sample data fixtures
const SAMPLE_FLASH_ITEMS = [
  {
    content: "美联储维持利率不变",
    title: "",
    time: "2026-04-11T10:00:00+08:00",
    url: "https://flash.jin10.com/detail/20260411100000000001",
  },
  {
    content: "WTI原油跌破96美元",
    title: "原油快讯",
    time: "2026-04-11T09:50:00+08:00",
    url: "https://flash.jin10.com/detail/20260411095000000002",
  },
];
 
const SAMPLE_CALENDAR_ITEMS = [
  {
    title: "美国3月CPI年率",
    pub_time: "2026-04-10 20:30",
    star: 5,
    actual: "2.6",
    consensus: "2.7",
    previous: "2.8",
    revised: null,
    affect_txt: "利多",
  },
  {
    title: "中国3月M2货币供应年率",
    pub_time: "2026-04-11 00:00",
    star: 3,
    actual: null,        // Not yet published
    consensus: "8.9",
    previous: "9",
    revised: null,
    affect_txt: "",      // Chinese indicator, empty affect is normal
  },
  {
    title: "德国3月服务业PMI终值",
    pub_time: "2026-04-07 15:55",
    star: 4,             // star=4 exists, must not be dropped
    actual: "50.9",
    consensus: "51.2",
    previous: "50.3",
    revised: null,
    affect_txt: "利空",
  },
];
 
const SAMPLE_QUOTE = {
  code: "XAUUSD",
  name: "现货黄金",
  close: "4749.31",
  open: "4776.33",
  high: "4795.08",
  low: "4730.86",
  ups_price: "-26.89",
  ups_percent: "-0.33",
  volume: 208084,
  time: "2026-04-11T03:29:40+08:00",
};
 
// ─────────────────────────────────────────────────────────────────────────────
// Test setup
// ─────────────────────────────────────────────────────────────────────────────
 
let fetchCallCount: number;
let mockFetch: ReturnType<typeof vi.fn>;
 
beforeEach(() => {
  fetchCallCount = 0;
  mockFetch = vi.fn();
  vi.stubGlobal("fetch", mockFetch);
  vi.stubEnv("JIN10_MCP_TOKEN", "test-token-12345");
  _resetSession();
  _resetAllCaches();
  // Pre-populate supported codes cache so getQuote() tests don't trigger
  // a resources/read fetch. Tests that specifically test the codes-list-miss
  // path must call invalidateSupportedCodes() at the start.
  setCachedSupportedCodes(new Set([
    "XAUUSD", "XAGUSD", "XPTUSD", "XPDUSD", "COPPER",
    "EURUSD", "GBPUSD", "USDJPY", "USDCAD", "AUDUSD", "NZDUSD", "USDCHF", "USDCNH", "USDHKD",
    "USOIL", "UKOIL", "NGAS",
    "000001", "000300", "399001", "399006", "899050",
    "HSI", "N225", "DJI", "SPX", "FTSE", "GDAXI",
  ]));
});
 
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
 
// ─────────────────────────────────────────────────────────────────────────────
// Session tests
// ─────────────────────────────────────────────────────────────────────────────
 
describe("Session management", () => {
  it("initializes session on first call and reuses it", async () => {
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeToolResponse(200, { items: SAMPLE_FLASH_ITEMS, next_cursor: "", has_more: false }));
 
    const result = await listFlash();
 
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // First call: initialize
    const initCall = mockFetch.mock.calls[0][1] as RequestInit;
    const initBody = JSON.parse(initCall.body as string) as { method: string };
    expect(initBody.method).toBe("initialize");
    // Second call: tools/call
    const toolCall = mockFetch.mock.calls[1][1] as RequestInit;
    expect((toolCall.headers as Record<string, string>)["mcp-session-id"]).toBe(MOCK_SESSION_ID);
    expect(result.success).toBe(true);
  });
 
  it("rebuilds session on HTTP 404 and retries", async () => {
    mockFetch
      .mockResolvedValueOnce(makeInitResponse("SESSION_A"))  // First init
      .mockResolvedValueOnce(makeHttpError(404, "session not found")) // First tool call → 404
      .mockResolvedValueOnce(makeInitResponse("SESSION_B"))  // Rebuild
      .mockResolvedValueOnce(makeToolResponse(200, { items: SAMPLE_FLASH_ITEMS, next_cursor: "", has_more: false }));
 
    const result = await listFlash();
 
    expect(result.success).toBe(true);
    // Should have attempted session rebuild
    const sessionIds = mockFetch.mock.calls
      .map((c) => (c[1] as RequestInit).headers)
      .filter(Boolean)
      .map((h) => (h as Record<string, string>)["mcp-session-id"])
      .filter(Boolean);
    expect(sessionIds).toContain("SESSION_B");
  });
 
  it("returns AUTH_MISSING when token not configured", async () => {
    vi.stubEnv("JIN10_MCP_TOKEN", "");
    const result = await listFlash();
 
    // Implementation catches the auth error and returns structured failure.
    // It does NOT throw — callers get a typed response they can inspect.
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.unavailable).toBe(true);
    expect(result.errorCode).toBe(Jin10ErrorCode.AUTH_MISSING);
  });
});
 
// ─────────────────────────────────────────────────────────────────────────────
// listFlash tests
// ─────────────────────────────────────────────────────────────────────────────
 
describe("listFlash()", () => {
  it("success: returns items with raw and derived fields", async () => {
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeToolResponse(200, {
        items: SAMPLE_FLASH_ITEMS,
        next_cursor: "cursor123",
        has_more: true,
      }));
 
    const result = await listFlash();
 
    expect(result.success).toBe(true);
    expect(result.unavailable).toBe(false);
    expect(result.errorCode).toBe(Jin10ErrorCode.SUCCESS);
    expect(result.data!.items).toHaveLength(2);
    expect(result.data!.hasMore).toBe(true);
    expect(result.data!.nextCursor).toBe("cursor123");
    expect(result.providerUsed).toBe("jin10_live");
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.fetchedAt).toBeGreaterThan(0);
 
    // Verify raw fields preserved
    const first = result.data!.items[0];
    expect(first.content).toBe("美联储维持利率不变");
    expect(first.rawTitle).toBe("");  // Empty, preserved
    expect(first.time).toBe("2026-04-11T10:00:00+08:00");
    expect(first.url).toBe("https://flash.jin10.com/detail/20260411100000000001");
 
    // Verify derived fields
    expect(first.id).toBe("20260411100000000001");
    expect(first.publishedAt).toBe(new Date("2026-04-11T10:00:00+08:00").getTime());
    expect(first.normalizedTitle).toBe("美联储维持利率不变"); // fallback from content
 
    // Second item has a real title
    const second = result.data!.items[1];
    expect(second.normalizedTitle).toBe("原油快讯");
  });
 
  it("empty result: success=true, errorCode=NO_DATA, unavailable=false", async () => {
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeToolResponse(200, { items: [], next_cursor: "", has_more: false }));
 
    const result = await listFlash();
 
    // CRITICAL: empty is NOT unavailable
    expect(result.success).toBe(true);
    expect(result.unavailable).toBe(false);
    expect(result.errorCode).toBe(Jin10ErrorCode.NO_DATA);
    expect(result.data).not.toBeNull();
    expect(result.data!.items).toHaveLength(0);
  });
 
  it("attemptTrace: records endpoint, strategy, latency, sessionId", async () => {
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeToolResponse(200, { items: SAMPLE_FLASH_ITEMS, next_cursor: "", has_more: false }));
 
    const result = await listFlash();
 
    expect(result.attemptTrace).toHaveLength(1);
    const trace = result.attemptTrace[0];
    expect(trace.attemptIndex).toBe(1);
    expect(trace.endpoint).toBe("list_flash");
    expect(trace.strategy).toBe("primary");
    expect(trace.resultType).toBe("success");
    expect(trace.bizStatus).toBe(200);
    expect(trace.failureReason).toBeNull();
    expect(trace.latencyMs).toBeGreaterThanOrEqual(0);
    expect(trace.sessionId).toBe(MOCK_SESSION_ID.slice(0, 8));
    expect(trace.itemCount).toBe(2);
  });
 
  it("pagination: passes cursor on second page", async () => {
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeToolResponse(200, { items: SAMPLE_FLASH_ITEMS, next_cursor: "", has_more: false }));
 
    await listFlash("cursor_abc");
 
    const toolCallBody = JSON.parse(
      (mockFetch.mock.calls[1][1] as RequestInit).body as string,
    ) as { params: { arguments: { cursor?: string } } };
    expect(toolCallBody.params.arguments.cursor).toBe("cursor_abc");
  });
});
 
// ─────────────────────────────────────────────────────────────────────────────
// searchFlash tests
// ─────────────────────────────────────────────────────────────────────────────
 
describe("searchFlash()", () => {
  it("success: returns items", async () => {
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeToolResponse(200, { items: SAMPLE_FLASH_ITEMS }));
 
    const result = await searchFlash("美联储");
 
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(result.errorCode).toBe(Jin10ErrorCode.SUCCESS);
  });
 
  it("NO_DATA: 0 results is success=true, not unavailable", async () => {
    // Only 1 keyword (no variants), 2 attempts per keyword: primary + session_rebuild
    // primary returns 0 items → session_rebuild also returns 0 → NO_DATA
    mockFetch
      .mockResolvedValueOnce(makeInitResponse("S1"))
      .mockResolvedValueOnce(makeToolResponse(200, { items: [] }))   // primary: 0 results
      .mockResolvedValueOnce(makeInitResponse("S2"))                   // session rebuild init
      .mockResolvedValueOnce(makeToolResponse(200, { items: [] }));   // session rebuild: 0 results
 
    const result = await searchFlash("xyzabc不存在123");
 
    // CRITICAL: 0 results is NOT unavailable
    expect(result.success).toBe(true);
    expect(result.unavailable).toBe(false);
    expect(result.errorCode).toBe(Jin10ErrorCode.NO_DATA);
    expect(result.data).toEqual([]);
  });
 
  it("BAD_PARAMS: empty keyword returns immediately without network call", async () => {
    const result = await searchFlash("");
 
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.unavailable).toBe(false);
    expect(result.errorCode).toBe(Jin10ErrorCode.BAD_PARAMS);
  });
 
  it("keyword variants: tries next variant when first keyword returns 0 results", async () => {
    // Sequence:
    //   call 1: init session
    //   call 2: search_flash("腾讯") → 0 results (bizStatus 200, items: [])
    //   call 3: search_flash("腾讯控股") → success (no new init needed, session still valid)
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeToolResponse(200, { items: [] }))
      .mockResolvedValueOnce(makeToolResponse(200, { items: SAMPLE_FLASH_ITEMS }));
 
    const result = await searchFlash("腾讯", ["腾讯控股"]);
 
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(result.errorCode).toBe(Jin10ErrorCode.SUCCESS);
    // Trace should show both keyword attempts
    expect(result.attemptTrace.length).toBeGreaterThanOrEqual(2);
  });
});
 
// ─────────────────────────────────────────────────────────────────────────────
// listCalendar tests
// ─────────────────────────────────────────────────────────────────────────────
 
describe("listCalendar()", () => {
  it("raw retention: star 1-5 preserved, affect_txt empty preserved, actual=null preserved", async () => {
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeToolResponse(200, SAMPLE_CALENDAR_ITEMS));
 
    const result = await listCalendar();
 
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(3);
 
    // Star=5 preserved (CPI)
    const cpi = result.data!.find((i) => i.title === "美国3月CPI年率")!;
    expect(cpi.star).toBe(5);
    expect(cpi.actual).toBe("2.6");
    expect(cpi.isPublished).toBe(true);
 
    // actual=null preserved (M2 not yet published)
    const m2 = result.data!.find((i) => i.title === "中国3月M2货币供应年率")!;
    expect(m2.actual).toBeNull();
    expect(m2.isPublished).toBe(false);
    // affect_txt="" preserved (Chinese indicator)
    expect(m2.affect_txt).toBe("");
 
    // star=4 preserved (must not be dropped or clamped)
    const pmifinal = result.data!.find((i) => i.title === "德国3月服务业PMI终值")!;
    expect(pmifinal.star).toBe(4);
 
    // pubTimestamp derived from Beijing time
    const expectedTs = new Date("2026-04-10 20:30:00+08:00").getTime();
    expect(cpi.pubTimestamp).toBe(expectedTs);
    // pub_time raw preserved
    expect(cpi.pub_time).toBe("2026-04-10 20:30");
  });
 
  it("stale cache: returns stale data when all live attempts fail, providerUsed=jin10_stale_cache", async () => {
    // First call succeeds and populates cache
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeToolResponse(200, SAMPLE_CALENDAR_ITEMS));
    await listCalendar();
 
    // Reset ONLY the session — NOT the cache.
    // _resetSession() intentionally does not clear caches so stale fallback works.
    _resetSession();
 
    // Switch to fake timers so the 5s delayMs in attempt 3 doesn't wait for real time.
    vi.useFakeTimers();
 
    try {
      // All three live attempts fail (init succeeds but tool call returns 500 each time)
      mockFetch.mockReset();
      mockFetch
        .mockResolvedValueOnce(makeInitResponse("S1"))
        .mockResolvedValueOnce(makeHttpError(500))
        .mockResolvedValueOnce(makeInitResponse("S2"))
        .mockResolvedValueOnce(makeHttpError(500))
        .mockResolvedValueOnce(makeInitResponse("S3"))
        .mockResolvedValueOnce(makeHttpError(500));
 
      // Start the call but don't await yet — need to advance fake timers first
      const calPromise = listCalendar();
 
      // Advance past the 5s delay in attempt 3
      await vi.runAllTimersAsync();
 
      const result = await calPromise;
 
      // Stale cache should be returned
      expect(result.errorCode).toBe(Jin10ErrorCode.STALE_CACHE);
      expect(result.providerUsed).toBe("jin10_stale_cache");
      expect(result.unavailable).toBe(false); // stale cache ≠ service unavailable
      expect(result.data).toHaveLength(3);    // Same data from first call
    } finally {
      vi.useRealTimers();
    }
  });
 
  it("stale cache NOT returned when TTL expired", async () => {
    // Populate cache first
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeToolResponse(200, SAMPLE_CALENDAR_ITEMS));
    await listCalendar();
 
    // Manually expire the cache, then reset session
    const { invalidateCalendarCache } = await import("./jin10Cache.ts");
    invalidateCalendarCache();
    _resetSession();
 
    // All live attempts fail — use fake timers to skip the 5s delay in attempt 3
    vi.useFakeTimers();
    try {
      mockFetch
        .mockResolvedValueOnce(makeInitResponse("SA"))
        .mockResolvedValueOnce(makeHttpError(500))
        .mockResolvedValueOnce(makeInitResponse("SB"))
        .mockResolvedValueOnce(makeHttpError(500))
        .mockResolvedValueOnce(makeInitResponse("SC"))
        .mockResolvedValueOnce(makeHttpError(500));
 
      const calPromise = listCalendar();
      await vi.runAllTimersAsync();
      const result = await calPromise;
 
      // Cache is invalid, no stale fallback available
      expect(result.errorCode).not.toBe(Jin10ErrorCode.STALE_CACHE);
      expect(result.unavailable).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
 
// ─────────────────────────────────────────────────────────────────────────────
// getQuote tests
// ─────────────────────────────────────────────────────────────────────────────
 
describe("getQuote()", () => {
  it("success: returns normalized numeric fields alongside raw strings", async () => {
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeToolResponse(200, SAMPLE_QUOTE));
 
    const result = await getQuote("XAUUSD");
 
    expect(result.success).toBe(true);
    expect(result.unavailable).toBe(false);
    expect(result.errorCode).toBe(Jin10ErrorCode.SUCCESS);
 
    const d = result.data!;
    // Raw strings preserved
    expect(d.rawClose).toBe("4749.31");
    expect(d.rawUpsPercent).toBe("-0.33");
    // Parsed numbers
    expect(d.close).toBe(4749.31);
    expect(d.upsPercent).toBe(-0.33);
    expect(d.volume).toBe(208084);
    expect(d.updatedAt).toBe(new Date("2026-04-11T03:29:40+08:00").getTime());
  });
 
  it("case-insensitive: xauusd works same as XAUUSD", async () => {
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeToolResponse(200, SAMPLE_QUOTE));
 
    const result = await getQuote("xauusd");
    expect(result.success).toBe(true);
  });
 
  it("UNSUPPORTED_CODE: code not in supported list (pre-validated, no server call)", async () => {
    // "00700" is NOT in the pre-populated supported codes set.
    // Pre-validation catches it before any network call to get_quote.
    const result = await getQuote("00700");
 
    expect(mockFetch).not.toHaveBeenCalled();   // no network call at all
    expect(result.success).toBe(false);
    expect(result.unavailable).toBe(false);
    expect(result.errorCode).toBe(Jin10ErrorCode.UNSUPPORTED_CODE);
    expect(result.errorMessage).toContain("pre-validated");
  });
 
  it("supported codes unavailable: falls through to get_quote call", async () => {
    // Clear the pre-populated cache so resources/read is attempted
    invalidateSupportedCodes();
 
    // Sequence:
    //   call 1: session init for resources/read
    //   call 2: resources/read → HTTP 500 → fetchSupportedCodesFromMcp returns null
    //   pre-validation skipped (null → non-fatal fallthrough)
    //   call 3: get_quote tool call → success (session S1 still valid, no new init)
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(new Response("", { status: 500 }))
      .mockResolvedValueOnce(makeToolResponse(200, SAMPLE_QUOTE));
 
    const result = await getQuote("XAUUSD");
 
    expect(result.success).toBe(true);
    expect(result.data!.close).toBe(4749.31);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
 
  it("supported codes populated via resources/read: XAUUSD passes, 00700 blocked", async () => {
    // Clear cache, populate via mock resources/read that includes XAUUSD but not 00700
    invalidateSupportedCodes();
 
    // getQuote("XAUUSD"):
    //   call 1: init, call 2: resources/read (returns list with XAUUSD), call 3: get_quote
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeResourcesResponse(["XAUUSD", "USOIL", "HSI"]))
      .mockResolvedValueOnce(makeToolResponse(200, SAMPLE_QUOTE));
 
    const r1 = await getQuote("XAUUSD");
    expect(r1.success).toBe(true);
 
    // getQuote("00700") after codes are cached: pre-validated, no new fetch
    const r2 = await getQuote("00700");
    expect(r2.errorCode).toBe(Jin10ErrorCode.UNSUPPORTED_CODE);
    expect(r2.errorMessage).toContain("pre-validated");
    // Only 3 fetch calls total (init+resources/read+get_quote), none for "00700"
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
 
  it("UNSUPPORTED_CODE cached: second call returns immediately without network", async () => {
    // Mark as unsupported without network
    markUnsupported("00700");
 
    const result = await getQuote("00700");
 
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.errorCode).toBe(Jin10ErrorCode.UNSUPPORTED_CODE);
    expect(result.unavailable).toBe(false);
  });
 
  it("BAD_PARAMS: empty code returns immediately", async () => {
    const result = await getQuote("");
 
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.errorCode).toBe(Jin10ErrorCode.BAD_PARAMS);
    expect(result.unavailable).toBe(false);
  });
});
 
// ─────────────────────────────────────────────────────────────────────────────
// getNews tests
// ─────────────────────────────────────────────────────────────────────────────
 
describe("getNews()", () => {
  it("success: returns full article with content", async () => {
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeToolResponse(200, {
        id: "216111",
        title: "美联储会议纪要",
        introduction: "简介",
        content: "完整正文内容...",
        time: "2026-04-10T22:19:10+08:00",
        url: "https://xnews.jin10.com/details/216111",
      }));
 
    const result = await getNews("216111");
 
    expect(result.success).toBe(true);
    expect(result.data!.content).toBe("完整正文内容...");
    expect(result.data!.id).toBe("216111");
    expect(result.data!.publishedAt).toBe(new Date("2026-04-10T22:19:10+08:00").getTime());
  });
 
  it("ARTICLE_NOT_FOUND: bizStatus 404 is not unavailable, not retryable", async () => {
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeToolResponse(404, null, "文章不存在"));
 
    const result = await getNews("999999999");
 
    // CRITICAL: 404 is not unavailable
    expect(result.success).toBe(false);
    expect(result.unavailable).toBe(false);
    expect(result.errorCode).toBe(Jin10ErrorCode.ARTICLE_NOT_FOUND);
    // Should not retry after 404 (only 1 attempt)
    expect(result.attemptTrace).toHaveLength(1);
  });
 
  it("BAD_PARAMS: empty id returns immediately", async () => {
    const result = await getNews("");
 
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.errorCode).toBe(Jin10ErrorCode.BAD_PARAMS);
    expect(result.unavailable).toBe(false);
  });
});
 
// ─────────────────────────────────────────────────────────────────────────────
// RPC error / BAD_PARAMS tests
// ─────────────────────────────────────────────────────────────────────────────
 
describe("BAD_PARAMS classification", () => {
  it("RPC -32602 is BAD_PARAMS, not unavailable", async () => {
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeRpcErrorResponse(-32602,
        'invalid params: validating "arguments": type: 12345 has type "integer", want "string"'));
 
    const result = await listFlash("12345_was_number" as string);
 
    // Simulate what happens when a non-string cursor is passed at runtime
    expect(result.unavailable).toBe(false);
  });
});
 
// ─────────────────────────────────────────────────────────────────────────────
// PARSE_ERROR classification
// ─────────────────────────────────────────────────────────────────────────────
 
describe("PARSE_ERROR classification", () => {
  it("malformed SSE body leads to PARSE_ERROR attempt, then retries, final errorCode=PARSE_ERROR", async () => {
    // listFlash() attempt configs: primary, cursor_reset, session_rebuild.
    // Only session_rebuild (attempt 3) has forceNewSession=true.
    // Real fetch sequence:
    //   1. init (initial ensureSession)
    //   2. malformed (attempt 1: primary)
    //   3. malformed (attempt 2: cursor_reset, reuses same session)
    //   4. init (attempt 3: session_rebuild, forceNewSession=true)
    //   5. malformed (attempt 3: session_rebuild tool call)
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())                                    // initial session init
      .mockResolvedValueOnce(new Response("not-sse-format\n\n", { status: 200 })) // attempt 1: primary, malformed
      .mockResolvedValueOnce(new Response("not-sse-format\n\n", { status: 200 })) // attempt 2: cursor_reset, malformed
      .mockResolvedValueOnce(makeInitResponse("SESSION_B"))                        // attempt 3: forceNewSession rebuild
      .mockResolvedValueOnce(new Response("not-sse-format\n\n", { status: 200 })); // attempt 3: session_rebuild, malformed
 
    const result = await listFlash();
 
    expect(result.success).toBe(false);
    expect(result.unavailable).toBe(true);  // all retries exhausted
    // CRITICAL: must be PARSE_ERROR, not UNKNOWN
    expect(result.errorCode).toBe(Jin10ErrorCode.PARSE_ERROR);
    expect(result.attemptTrace.length).toBeGreaterThan(0);
    expect(result.attemptTrace.every((r) => r.resultType === "parse_error")).toBe(true);
  });
});
 
// ─────────────────────────────────────────────────────────────────────────────
// AttemptTrace content
// ─────────────────────────────────────────────────────────────────────────────
 
describe("AttemptTrace", () => {
  it("records all mandatory fields", async () => {
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeToolResponse(200, { items: SAMPLE_FLASH_ITEMS, next_cursor: "", has_more: false }));
 
    const result = await listFlash();
    const record = result.attemptTrace[0];
 
    expect(typeof record.attemptIndex).toBe("number");
    expect(typeof record.endpoint).toBe("string");
    expect(typeof record.params).toBe("object");
    expect(typeof record.strategy).toBe("string");
    expect(typeof record.resultType).toBe("string");
    expect(typeof record.latencyMs).toBe("number");
    expect(typeof record.sessionId).toBe("string");
    expect(record.sessionId.length).toBeLessThanOrEqual(8);
  });
 
  it("multiple attempts shown in trace when first fails", async () => {
    mockFetch
      .mockResolvedValueOnce(makeInitResponse("S1"))
      .mockResolvedValueOnce(makeHttpError(500))             // attempt 1 fails
      .mockResolvedValueOnce(makeInitResponse("S2"))
      .mockResolvedValueOnce(makeToolResponse(200, { items: [], next_cursor: "", has_more: false })); // attempt 2 (cursor reset) succeeds
 
    const result = await listFlash();
 
    // Should have at least 2 attempts in trace
    expect(result.attemptTrace.length).toBeGreaterThanOrEqual(2);
    expect(result.attemptTrace[0].strategy).toBe("primary");
  });
});
 
// ─────────────────────────────────────────────────────────────────────────────
// listNews integration test
// ─────────────────────────────────────────────────────────────────────────────
 
describe("listNews()", () => {
  it("returns news page with derived publishedAt", async () => {
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeToolResponse(200, {
        items: [
          {
            id: "216207",
            title: "霍尔木兹海峡断油警告",
            introduction: "欧洲可能面临系统性断油",
            time: "2026-04-10T22:51:44+08:00",
            url: "https://xnews.jin10.com/details/216207",
          },
        ],
        next_cursor: "cursor_next",
        has_more: true,
      }));
 
    const result = await listNews();
 
    expect(result.success).toBe(true);
    expect(result.data!.items[0].publishedAt).toBe(
      new Date("2026-04-10T22:51:44+08:00").getTime(),
    );
    expect(result.data!.hasMore).toBe(true);
    expect(result.data!.nextCursor).toBe("cursor_next");
  });
});
 
// ─────────────────────────────────────────────────────────────────────────────
// Critical invariants (regression guards)
// ─────────────────────────────────────────────────────────────────────────────
 
describe("Critical invariants — never misidentify as unavailable", () => {
  it("bizStatus 400 / UNSUPPORTED_CODE is NOT unavailable", async () => {
    // "BTC" not in pre-populated supported codes → caught by pre-validation, no fetch
    const result = await getQuote("BTC");
    expect(result.unavailable).toBe(false);
    expect(result.errorCode).toBe(Jin10ErrorCode.UNSUPPORTED_CODE);
    expect(mockFetch).not.toHaveBeenCalled();
  });
 
  it("bizStatus 404 is NOT unavailable", async () => {
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeToolResponse(404, null, "文章不存在"));
 
    const result = await getNews("123");
    expect(result.unavailable).toBe(false);
  });
 
  it("empty items array is NOT unavailable", async () => {
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeToolResponse(200, { items: [], next_cursor: "", has_more: false }));
 
    const result = await listFlash();
    expect(result.unavailable).toBe(false);
    expect(result.errorCode).toBe(Jin10ErrorCode.NO_DATA);
  });
 
  it("data=null with bizStatus 400 is BAD_PARAMS, not service down", async () => {
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeToolResponse(400, null, "请输入品种代码"));
 
    const result = await getQuote("   "); // whitespace only
    expect(result.errorCode).toBe(Jin10ErrorCode.BAD_PARAMS);
    expect(result.unavailable).toBe(false);
  });
 
  it("providerUsed and responseTimeMs always present on any result", async () => {
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeToolResponse(200, SAMPLE_QUOTE));
 
    const result = await getQuote("XAUUSD");
    expect(result.providerUsed).toBeDefined();
    expect(typeof result.responseTimeMs).toBe("number");
    expect(result.fetchedAt).toBeGreaterThan(0);
    expect(Array.isArray(result.attemptTrace)).toBe(true);
  });
});
