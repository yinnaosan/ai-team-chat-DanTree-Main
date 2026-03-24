/**
 * tickerWsCn.ts
 * A股实时 Tick SSE 路由
 * 通过 efinance（东方财富）轮询最新快照，以 SSE 推送给前端
 * 支持代码格式：600519 / sh.600519 / sz.000001 / 600519.SS
 *
 * 节流策略（北京时间 UTC+8）：
 *   交易时段  09:30–11:30 / 13:00–15:00（周一至周五）→ 3 秒
 *   午休      11:30–13:00                             → 30 秒
 *   盘前/盘后 09:00–09:30 / 15:00–15:30              → 10 秒
 *   其他非交易时段                                     → 30 秒
 */
import { Router, type Request, type Response } from "express";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const router = Router();

// ─── 轻量级快照脚本（仅获取实时价格，不拉取历史K线）─────────────────────────
const SNAPSHOT_SCRIPT = `
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

// ─── 交易时段判断 ─────────────────────────────────────────────────────────────

export type AShareTradingSession =
  | "trading"    // 交易时段：3秒
  | "pre_market" // 盘前：10秒
  | "post_market"// 盘后：10秒
  | "lunch"      // 午休：30秒
  | "closed";    // 非交易日/夜间：30秒

/**
 * 根据当前 UTC 时间判断 A 股交易时段
 * A 股交易时间（北京时间 UTC+8）：
 *   周一至周五 09:30–11:30（上午盘）/ 13:00–15:00（下午盘）
 *   盘前竞价：09:15–09:25（此处简化为 09:00–09:30 作为盘前）
 *   盘后：15:00–15:30
 */
export function getAShareTradingSession(now: Date = new Date()): AShareTradingSession {
  // 转换为北京时间（UTC+8）
  const bjOffset = 8 * 60; // 分钟
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const bjMinutes = (utcMinutes + bjOffset) % (24 * 60);
  const bjDow = Math.floor((now.getTime() / 1000 / 60 + bjOffset) / (24 * 60)) % 7;
  // 0=Thu, 1=Fri, 2=Sat, 3=Sun, 4=Mon, 5=Tue, 6=Wed（基于 epoch 1970-01-01 是周四）
  // 更可靠：直接用 UTC 星期几加偏移
  const utcDay = now.getUTCDay(); // 0=Sun,1=Mon,...,6=Sat
  // 北京时间日期可能比UTC晚一天（UTC+8），但对星期几影响微小，简化处理：
  // 若 UTC 时间 + 8h 跨过午夜，则北京时间星期几 = (utcDay + 1) % 7
  const bjDay = utcMinutes + bjOffset >= 24 * 60 ? (utcDay + 1) % 7 : utcDay;

  // 非交易日（周六=6，周日=0）
  if (bjDay === 0 || bjDay === 6) return "closed";

  // 以下均为工作日（周一至周五）
  const h = Math.floor(bjMinutes / 60);
  const m = bjMinutes % 60;
  const timeVal = h * 60 + m; // 分钟数，便于比较

  const T_PRE_START   =  9 * 60;       // 09:00
  const T_OPEN        =  9 * 60 + 30;  // 09:30
  const T_LUNCH_START = 11 * 60 + 30;  // 11:30
  const T_LUNCH_END   = 13 * 60;       // 13:00
  const T_CLOSE       = 15 * 60;       // 15:00
  const T_POST_END    = 15 * 60 + 30;  // 15:30

  if (timeVal >= T_OPEN && timeVal < T_LUNCH_START) return "trading";   // 上午盘
  if (timeVal >= T_LUNCH_END && timeVal < T_CLOSE)  return "trading";   // 下午盘
  if (timeVal >= T_LUNCH_START && timeVal < T_LUNCH_END) return "lunch"; // 午休
  if (timeVal >= T_PRE_START && timeVal < T_OPEN)   return "pre_market"; // 盘前
  if (timeVal >= T_CLOSE && timeVal < T_POST_END)   return "post_market";// 盘后
  return "closed"; // 夜间
}

/**
 * 根据交易时段返回轮询间隔（毫秒）
 */
export function getASharePollInterval(session: AShareTradingSession): number {
  switch (session) {
    case "trading":     return 3_000;  // 3秒：交易时段高频
    case "pre_market":  return 10_000; // 10秒：盘前竞价
    case "post_market": return 10_000; // 10秒：盘后
    case "lunch":       return 30_000; // 30秒：午休降频
    case "closed":      return 30_000; // 30秒：非交易时段
  }
}

// ─── 规范化A股代码 ─────────────────────────────────────────────────────────────

/** 规范化A股代码：统一转为 efinance 识别的6位纯数字格式 */
function normalizeAShareCode(raw: string): string {
  if (/^(sh|sz|bj)\./i.test(raw)) return raw.split(".")[1];
  if (/^\d{6}\.(SS|SZ|BJ)$/i.test(raw)) return raw.split(".")[0];
  if (/^\d{6}$/.test(raw)) return raw;
  return raw;
}

/** 判断是否为A股代码 */
export function isAShareSymbol(symbol: string): boolean {
  const s = symbol.toUpperCase();
  if (/^(SH|SZ|BJ)\./i.test(s)) return true;
  if (/^\d{6}\.(SS|SZ|BJ)$/i.test(s)) return true;
  if (/^\d{6}$/.test(s)) return true;
  return false;
}

// ─── SSE 路由 ─────────────────────────────────────────────────────────────────
router.get("/api/ticker-stream-cn/:symbol", (req: Request, res: Response) => {
  const rawSymbol = req.params.symbol;
  const code = normalizeAShareCode(rawSymbol);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // 初始连接确认（附带当前时段信息）
  const initSession = getAShareTradingSession();
  const initInterval = getASharePollInterval(initSession);
  res.write(`data: ${JSON.stringify({
    type: "connected",
    symbol: rawSymbol,
    code,
    session: initSession,
    interval_ms: initInterval,
  })}\n\n`);

  let closed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  /**
   * 自适应调度：每次执行后根据当前时段动态决定下次间隔
   * 使用 setTimeout 而非 setInterval，避免上一次未完成时重叠执行
   */
  const scheduleNext = () => {
    if (closed) return;
    const session = getAShareTradingSession();
    const intervalMs = getASharePollInterval(session);
    timer = setTimeout(fetchAndSend, intervalMs);
  };

  const fetchAndSend = async () => {
    if (closed) return;
    try {
      const { stdout } = await execFileAsync(
        "python3",
        ["-c", SNAPSHOT_SCRIPT, code],
        { timeout: 8000, maxBuffer: 512 * 1024 }
      );
      if (closed) return;
      const snap = JSON.parse(stdout.trim());
      if (snap.error) {
        res.write(`data: ${JSON.stringify({ type: "error", message: snap.error })}\n\n`);
      } else if (snap.price != null) {
        const session = getAShareTradingSession();
        const intervalMs = getASharePollInterval(session);
        res.write(`data: ${JSON.stringify({
          type: "tick",
          symbol: rawSymbol,
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
    // 无论成功与否，都调度下一次
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

export { router as tickerCnStreamRouter };
