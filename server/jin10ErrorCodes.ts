/**
 * jin10ErrorCodes.ts
 * Jin10 统一错误码体系
 *
 * 分类规则：
 *   HTTP 401                          -> AUTH_MISSING | AUTH_INVALID
 *   HTTP 404 (session-related)        -> SESSION_EXPIRED
 *   HTTP 5xx                          -> SERVER_ERROR
 *   fetch() throws + AbortError       -> TIMEOUT
 *   fetch() throws + other            -> NETWORK_ERROR
 *   RPC -32602 in body                -> BAD_PARAMS
 *   bizStatus 400 in body             -> BAD_PARAMS (or UNSUPPORTED_CODE for quote)
 *   bizStatus 404 in body             -> ARTICLE_NOT_FOUND
 *   bizStatus 200 + items.length===0  -> NO_DATA  (NOT unavailable)
 *   bizStatus 200 + data ok           -> SUCCESS
 *   JSON.parse() throws               -> PARSE_ERROR
 *   served from stale cache           -> STALE_CACHE
 */
 
export const Jin10ErrorCode = {
  SUCCESS:            "SUCCESS",
  NO_DATA:            "NO_DATA",
  UNSUPPORTED_CODE:   "UNSUPPORTED_CODE",
  ARTICLE_NOT_FOUND:  "ARTICLE_NOT_FOUND",
  BAD_PARAMS:         "BAD_PARAMS",
  SESSION_EXPIRED:    "SESSION_EXPIRED",
  AUTH_MISSING:       "AUTH_MISSING",
  AUTH_INVALID:       "AUTH_INVALID",
  TIMEOUT:            "TIMEOUT",
  NETWORK_ERROR:      "NETWORK_ERROR",
  SERVER_ERROR:       "SERVER_ERROR",
  PARSE_ERROR:        "PARSE_ERROR",
  STALE_CACHE:        "STALE_CACHE",
  UNKNOWN:            "UNKNOWN",
} as const;
 
export type Jin10ErrorCode = (typeof Jin10ErrorCode)[keyof typeof Jin10ErrorCode];
 
/** Classify raw error state into a structured error code */
export function classifyErrorCode(opts: {
  httpStatus: number | null;
  bizStatus: number | null;
  bizMessage: string;
  rpcErrorCode: number | null;
  isTimeout: boolean;
  isNetworkError: boolean;
  toolName: string;
}): Jin10ErrorCode {
  const { httpStatus, bizStatus, bizMessage, rpcErrorCode, isTimeout, isNetworkError, toolName } = opts;
 
  if (isTimeout) return Jin10ErrorCode.TIMEOUT;
  if (isNetworkError) return Jin10ErrorCode.NETWORK_ERROR;
 
  if (httpStatus === 401) {
    return bizMessage.includes("no bearer") ? Jin10ErrorCode.AUTH_MISSING : Jin10ErrorCode.AUTH_INVALID;
  }
  if (httpStatus === 404) return Jin10ErrorCode.SESSION_EXPIRED;
  if (httpStatus !== null && httpStatus >= 500) return Jin10ErrorCode.SERVER_ERROR;
 
  if (rpcErrorCode === -32602) return Jin10ErrorCode.BAD_PARAMS;
 
  if (bizStatus === 400) {
    // For get_quote, 400 with "不支持该品种" message means unsupported code
    if (toolName === "get_quote" && bizMessage.includes("不支持该品种")) {
      return Jin10ErrorCode.UNSUPPORTED_CODE;
    }
    return Jin10ErrorCode.BAD_PARAMS;
  }
 
  if (bizStatus === 404) return Jin10ErrorCode.ARTICLE_NOT_FOUND;
 
  return Jin10ErrorCode.UNKNOWN;
}
 
