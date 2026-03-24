/**
 * tickerWsHk.ts
 * 港股实时 Tick SSE 路由
 * 通过 efinance（东方财富）轮询港股最新快照，以 SSE 推送给前端
 * 支持代码格式：00700 / 00700.HK / 9988.HK / 5位数字
 *
 * 节流策略：使用 globalHolidays.ts 中的 getHKSession() 实时判断
 *   盘前竞价  09:00–09:30（Nager.Date API 确认非节假日）→ 5 秒
 *   上午盘    09:30–12:00                               → 3 秒
 *   午休      12:00–13:00                               → 30 秒
 *   下午盘    13:00–16:00                               → 3 秒
 *   盘后撮合  16:00–16:10                               → 5 秒
 *   其他非交易时段                                       → 30 秒
 */
import { Router, type Request, type Response } from "express";
import { execFile } from "child_process";
import { promisify } from "util";
import { getHKSession, getHKPollIntervalMs } from "./globalHolidays";

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

// ─── 竞价量历史记录（用于计算前5日均值）────────────────────────────────────────
// 结构：symbol → 按日期分组的竞价量记录
// 只保留最近7天数据，防止内存泄漏
const auctionVolumeHistory = new Map<string, Array<{ date: string; volume: number }>>();

function recordAuctionVolume(symbol: string, volume: number): void {
  const today = new Date().toISOString().slice(0, 10);
  const history = auctionVolumeHistory.get(symbol) ?? [];
  // 更新今天的记录（取最大值，因为竞价量是累计的）
  const todayIdx = history.findIndex(r => r.date === today);
  if (todayIdx >= 0) {
    history[todayIdx].volume = Math.max(history[todayIdx].volume, volume);
  } else {
    history.push({ date: today, volume });
  }
  // 只保留最近7天
  const sorted = history.sort((a, b) => a.date.localeCompare(b.date)).slice(-7);
  auctionVolumeHistory.set(symbol, sorted);
}

/**
 * 判断当前竞价量是否异常（超过前5日均值的150%）
 * 返回 { isAlert: boolean; ratio: number | null }
 */
function checkAuctionAlert(symbol: string, currentVolume: number): { isAlert: boolean; ratio: number | null } {
  const today = new Date().toISOString().slice(0, 10);
  const history = (auctionVolumeHistory.get(symbol) ?? [])
    .filter(r => r.date < today)  // 排除今天
    .slice(-5);                    // 取最近5天

  if (history.length < 2) return { isAlert: false, ratio: null }; // 数据不足

  const avg = history.reduce((s, r) => s + r.volume, 0) / history.length;
  if (avg <= 0) return { isAlert: false, ratio: null };

  const ratio = currentVolume / avg;
  return { isAlert: ratio >= 1.5, ratio: Math.round(ratio * 100) / 100 };
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

  let closed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  // 初始化：异步获取当前时段后发送连接确认
  const initialize = async () => {
    const initSession = await getHKSession();
    const initInterval = getHKPollIntervalMs(initSession);
    if (!closed) {
      res.write(`data: ${JSON.stringify({
        type: "connected",
        symbol: rawSymbol,
        code,
        market: "HK",
        session: initSession,
        interval_ms: initInterval,
      })}\n\n`);
      // 立即执行第一次轮询
      fetchAndSend();
    }
  };

  const scheduleNext = async () => {
    if (closed) return;
    const session = await getHKSession();
    const intervalMs = getHKPollIntervalMs(session);
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
        const session = await getHKSession();
        const intervalMs = getHKPollIntervalMs(session);
        const volume = snap.volume ?? 0;

        // 盘前竞价时段：记录竞价量并检测异常
        let auctionAlert = false;
        let auctionRatio: number | null = null;
        if (session === "pre_auction" && volume > 0) {
          recordAuctionVolume(rawSymbol, volume);
          const alertResult = checkAuctionAlert(rawSymbol, volume);
          auctionAlert = alertResult.isAlert;
          auctionRatio = alertResult.ratio;
        }

        res.write(`data: ${JSON.stringify({
          type: "tick",
          symbol: rawSymbol,
          market: "HK",
          price: snap.price,
          volume,
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
          auctionAlert,
          auctionRatio,
        })}\n\n`);
      }
    } catch {
      if (!closed) {
        res.write(`data: ${JSON.stringify({ type: "error", message: "fetch_failed" })}\n\n`);
      }
    }
    scheduleNext();
  };

  initialize();

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
