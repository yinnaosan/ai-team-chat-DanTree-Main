/**
 * tickerWsHk.ts
 * 港股实时 Tick SSE 路由
 * 通过 efinance（东方财富）轮询港股最新快照，以 SSE 推送给前端
 * 支持代码格式：00700 / 00700.HK / 9988.HK / 5位数字
 *
 * 节流策略（香港时间 UTC+8，与北京时间相同）：
 *   上午盘  09:30–12:00（周一至周五）→ 3 秒
 *   午休    12:00–13:00              → 30 秒
 *   下午盘  13:00–16:00（周一至周五）→ 3 秒
 *   盘前    09:00–09:30              → 10 秒
 *   盘后    16:00–16:30              → 10 秒
 *   其他非交易时段                    → 30 秒
 */
import { Router, type Request, type Response } from "express";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const router = Router();

// ─── 港股快照脚本（通过 efinance 获取港股实时价格）──────────────────────────
// efinance 港股代码格式：5位数字（如 00700 表示腾讯）
const HK_SNAPSHOT_SCRIPT = `
import sys, json
import efinance as ef

code = sys.argv[1]
try:
    snap = ef.stock.get_quote_snapshot(code)
    if snap is not None:
        if hasattr(snap, 'to_dict'):
            s = snap.to_dict()
        else:
            s = dict(snap)
        def fv(k):
            v = s.get(k)
            if v is None or str(v) in ["nan","None",""]: return None
            try: return float(v)
            except: return None
        result = {
            "price": fv("最新价"),
            "volume": fv("成交量"),
            "pctChange": fv("涨跌幅"),
            "change": fv("涨跌额"),
            "high": fv("最高"),
            "low": fv("最低"),
            "open": fv("今开") or fv("开盘"),
            "prevClose": fv("昨收"),
            "updatedAt": str(s.get("时间", "")),
        }
        print(json.dumps(result, ensure_ascii=False))
    else:
        print(json.dumps({"error": "no_data"}))
except Exception as e:
    print(json.dumps({"error": str(e)}))
`;

// ─── 2026年港股法定节假日表 ─────────────────────────────────────────────────
// 香港公众假期（部分与A股重叠，但不完全相同）
const HK_HOLIDAYS_2026 = new Set([
  // 元旦
  "2026-01-01",
  // 农历新年（春节）
  "2026-01-28", "2026-01-29", "2026-01-30",
  // 耶稣受难节 & 复活节（2026年4月3日-6日）
  "2026-04-03", "2026-04-04", "2026-04-05", "2026-04-06",
  // 清明节
  "2026-04-05",
  // 劳动节
  "2026-05-01",
  // 佛诞（2026年5月27日）
  "2026-05-27",
  // 端午节
  "2026-06-19",
  // 香港回归纪念日
  "2026-07-01",
  // 中秋节翌日（2026年9月25日）
  "2026-09-25",
  // 国庆节
  "2026-10-01",
  // 重阳节（2026年10月17日）
  "2026-10-17",
  // 圣诞节
  "2026-12-25", "2026-12-26",
]);

// ─── 港股交易时段判断 ─────────────────────────────────────────────────────────

export type HKTradingSession =
  | "trading"     // 交易时段：3秒
  | "pre_market"  // 盘前：10秒
  | "post_market" // 盘后：10秒
  | "lunch"       // 午休：30秒
  | "closed";     // 非交易日/夜间：30秒

/**
 * 根据当前时间判断港股交易时段
 * 港股交易时间（香港时间 UTC+8，与北京时间相同）：
 *   周一至周五 09:30–12:00（上午盘）/ 13:00–16:00（下午盘）
 *   盘前：09:00–09:30
 *   盘后：16:00–16:30
 */
export function getHKTradingSession(now: Date = new Date()): HKTradingSession {
  const hkOffset = 8 * 60; // 分钟（HKT = UTC+8）
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const hkMinutes = (utcMinutes + hkOffset) % (24 * 60);
  const utcDay = now.getUTCDay();
  const hkDay = utcMinutes + hkOffset >= 24 * 60 ? (utcDay + 1) % 7 : utcDay;

  // 计算香港时间日期字符串，用于节假日检查
  const hkDate = new Date(now.getTime() + hkOffset * 60 * 1000);
  const hkDateStr = hkDate.toISOString().slice(0, 10);

  // 法定节假日
  if (HK_HOLIDAYS_2026.has(hkDateStr)) return "closed";
  // 周末
  if (hkDay === 0 || hkDay === 6) return "closed";

  const timeVal = hkMinutes;

  const T_PRE_START    =  9 * 60;       // 09:00
  const T_OPEN         =  9 * 60 + 30;  // 09:30
  const T_LUNCH_START  = 12 * 60;       // 12:00
  const T_LUNCH_END    = 13 * 60;       // 13:00
  const T_CLOSE        = 16 * 60;       // 16:00
  const T_POST_END     = 16 * 60 + 30;  // 16:30

  if (timeVal >= T_OPEN && timeVal < T_LUNCH_START)  return "trading";    // 上午盘
  if (timeVal >= T_LUNCH_END && timeVal < T_CLOSE)   return "trading";    // 下午盘
  if (timeVal >= T_LUNCH_START && timeVal < T_LUNCH_END) return "lunch";  // 午休
  if (timeVal >= T_PRE_START && timeVal < T_OPEN)    return "pre_market"; // 盘前
  if (timeVal >= T_CLOSE && timeVal < T_POST_END)    return "post_market";// 盘后
  return "closed"; // 夜间
}

/**
 * 根据港股交易时段返回轮询间隔（毫秒）
 */
export function getHKPollInterval(session: HKTradingSession): number {
  switch (session) {
    case "trading":     return 3_000;  // 3秒：交易时段高频
    case "pre_market":  return 10_000; // 10秒：盘前
    case "post_market": return 10_000; // 10秒：盘后
    case "lunch":       return 30_000; // 30秒：午休降频
    case "closed":      return 30_000; // 30秒：非交易时段
  }
}

// ─── 规范化港股代码 ──────────────────────────────────────────────────────────

/**
 * 规范化港股代码：统一转为 efinance 识别的5位数字格式
 * 00700.HK → 00700
 * 700.HK   → 00700（补零至5位）
 * 9988.HK  → 09988（补零至5位）
 * 700      → 00700
 */
function normalizeHKCode(raw: string): string {
  // 去除 .HK 后缀
  let code = raw.toUpperCase().replace(/\.HK$/, "");
  // 若为纯数字，补零至5位
  if (/^\d+$/.test(code)) {
    code = code.padStart(5, "0");
  }
  return code;
}

/** 判断是否为港股代码 */
export function isHKSymbol(symbol: string): boolean {
  const s = symbol.toUpperCase();
  // 明确带 .HK 后缀
  if (/^\d{1,5}\.HK$/.test(s)) return true;
  // 5位纯数字（港股惯例，但与A股6位区分）
  if (/^\d{5}$/.test(s)) return true;
  // 4位纯数字（如 0700 → 腾讯）
  if (/^\d{4}$/.test(s)) return true;
  return false;
}

// ─── SSE 路由 ─────────────────────────────────────────────────────────────────
router.get("/api/ticker-stream-hk/:symbol", (req: Request, res: Response) => {
  const rawSymbol = req.params.symbol;
  const code = normalizeHKCode(rawSymbol);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // 初始连接确认（附带当前时段信息）
  const initSession = getHKTradingSession();
  const initInterval = getHKPollInterval(initSession);
  res.write(`data: ${JSON.stringify({
    type: "connected",
    symbol: rawSymbol,
    code,
    market: "HK",
    session: initSession,
    interval_ms: initInterval,
  })}\n\n`);

  let closed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const scheduleNext = () => {
    if (closed) return;
    const session = getHKTradingSession();
    const intervalMs = getHKPollInterval(session);
    timer = setTimeout(fetchAndSend, intervalMs);
  };

  const fetchAndSend = async () => {
    if (closed) return;
    try {
      const { stdout } = await execFileAsync(
        "python3",
        ["-c", HK_SNAPSHOT_SCRIPT, code],
        { timeout: 8000, maxBuffer: 512 * 1024 }
      );
      if (closed) return;
      const snap = JSON.parse(stdout.trim());
      if (snap.error) {
        res.write(`data: ${JSON.stringify({ type: "error", message: snap.error })}\n\n`);
      } else if (snap.price != null) {
        const session = getHKTradingSession();
        const intervalMs = getHKPollInterval(session);
        res.write(`data: ${JSON.stringify({
          type: "tick",
          symbol: rawSymbol,
          market: "HK",
          price: snap.price,
          volume: snap.volume ?? 0,
          pctChange: snap.pctChange,
          change: snap.change,
          high: snap.high,
          low: snap.low,
          open: snap.open,
          prevClose: snap.prevClose,
          timestamp: Date.now(),
          updatedAt: snap.updatedAt,
          session,
          interval_ms: intervalMs,
        })}\n\n`);
      }
    } catch {
      if (!closed) {
        res.write(`data: ${JSON.stringify({ type: "error", message: "fetch_failed" })}\n\n`);
      }
    }
    scheduleNext();
  };

  // 立即执行第一次，然后自适应调度
  fetchAndSend();

  // 每25秒发送心跳注释，防止代理超时断开
  const heartbeat = setInterval(() => {
    if (!closed) res.write(": heartbeat\n\n");
  }, 25000);

  req.on("close", () => {
    closed = true;
    if (timer) clearTimeout(timer);
    clearInterval(heartbeat);
    res.end();
  });
});

export { router as tickerHkStreamRouter };
