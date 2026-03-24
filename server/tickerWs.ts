/**
 * tickerWs.ts — Finnhub WebSocket 代理
 *
 * 架构：
 * 1. 维护一个到 Finnhub wss://ws.finnhub.io 的单一 WebSocket 连接
 * 2. 前端通过 GET /api/ticker-stream/:symbol 订阅 SSE 推送
 * 3. 每当 Finnhub 推送 trade 事件，转发给所有订阅该 symbol 的 SSE 客户端
 * 4. 自动管理订阅：有客户端时订阅，无客户端时取消订阅
 *
 * Finnhub trade 事件格式：
 * { type: "trade", data: [{ s: symbol, p: price, t: timestamp, v: volume }] }
 */

import { Router, type Request, type Response } from "express";
import WebSocket from "ws";
import { ENV } from "./_core/env";

// ─── 类型 ──────────────────────────────────────────────────────────────────────
interface FinnhubTrade {
  s: string;  // symbol
  p: number;  // price
  t: number;  // timestamp (ms)
  v: number;  // volume
}

interface FinnhubMessage {
  type: "trade" | "ping";
  data?: FinnhubTrade[];
}

export interface TickEvent {
  symbol: string;
  price: number;
  timestamp: number; // ms
  volume: number;
}

// ─── 状态 ──────────────────────────────────────────────────────────────────────
/** symbol → SSE 客户端响应列表 */
const subscribers = new Map<string, Set<Response>>();
/** 当前已向 Finnhub 订阅的 symbol 集合 */
const subscribedSymbols = new Set<string>();

let finnhubWs: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let isConnecting = false;

// ─── Finnhub WS 连接管理 ───────────────────────────────────────────────────────
function connectFinnhub() {
  if (isConnecting || (finnhubWs && finnhubWs.readyState === WebSocket.OPEN)) return;
  isConnecting = true;

  const apiKey = ENV.FINNHUB_API_KEY;
  if (!apiKey) {
    console.warn("[TickerWs] FINNHUB_API_KEY not set, real-time tick disabled");
    isConnecting = false;
    return;
  }

  console.log("[TickerWs] Connecting to Finnhub WebSocket...");
  const ws = new WebSocket(`wss://ws.finnhub.io?token=${apiKey}`);
  finnhubWs = ws;

  ws.on("open", () => {
    isConnecting = false;
    console.log("[TickerWs] Connected to Finnhub WebSocket");
    // 重新订阅所有已有的 symbol
    Array.from(subscribedSymbols).forEach(sym => {
      ws.send(JSON.stringify({ type: "subscribe", symbol: sym }));
    });
  });

  ws.on("message", (raw: Buffer) => {
    try {
      const msg: FinnhubMessage = JSON.parse(raw.toString());
      if (msg.type === "trade" && msg.data) {
        for (const trade of msg.data) {
          const event: TickEvent = {
            symbol: trade.s,
            price: trade.p,
            timestamp: trade.t,
            volume: trade.v,
          };
          broadcastTick(event);
        }
      }
    } catch {
      // ignore parse errors
    }
  });

  ws.on("close", () => {
    isConnecting = false;
    finnhubWs = null;
    console.log("[TickerWs] Finnhub WebSocket closed, reconnecting in 5s...");
    if (subscribedSymbols.size > 0) {
      reconnectTimer = setTimeout(connectFinnhub, 5000);
    }
  });

  ws.on("error", (err) => {
    isConnecting = false;
    console.error("[TickerWs] Finnhub WebSocket error:", err.message);
    ws.close();
  });
}

function subscribeSymbol(symbol: string) {
  if (subscribedSymbols.has(symbol)) return;
  subscribedSymbols.add(symbol);
  if (!finnhubWs || finnhubWs.readyState !== WebSocket.OPEN) {
    connectFinnhub();
    return;
  }
  finnhubWs.send(JSON.stringify({ type: "subscribe", symbol }));
  console.log(`[TickerWs] Subscribed: ${symbol}`);
}

function unsubscribeSymbol(symbol: string) {
  subscribedSymbols.delete(symbol);
  if (finnhubWs && finnhubWs.readyState === WebSocket.OPEN) {
    finnhubWs.send(JSON.stringify({ type: "unsubscribe", symbol }));
    console.log(`[TickerWs] Unsubscribed: ${symbol}`);
  }
  // 如果没有任何订阅了，关闭 WS 连接节省资源
  if (subscribedSymbols.size === 0 && finnhubWs) {
    finnhubWs.close();
    finnhubWs = null;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  }
}

function broadcastTick(event: TickEvent) {
  const clients = subscribers.get(event.symbol);
  if (!clients || clients.size === 0) return;
  const data = `data: ${JSON.stringify(event)}\n\n`;
  Array.from(clients).forEach(res => {
    try {
      res.write(data);
    } catch {
      clients.delete(res);
    }
  });
}

// ─── SSE 路由 ──────────────────────────────────────────────────────────────────
export const tickerStreamRouter = Router();

tickerStreamRouter.get("/api/ticker-stream/:symbol", (req: Request, res: Response) => {
  const symbol = (req.params.symbol ?? "").toUpperCase();
  if (!symbol) {
    res.status(400).json({ error: "symbol required" });
    return;
  }

  // SSE 头
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // 禁用 nginx 缓冲
  res.flushHeaders();

  // 注册客户端
  if (!subscribers.has(symbol)) {
    subscribers.set(symbol, new Set());
  }
  const clients = subscribers.get(symbol)!;
  clients.add(res);
  subscribeSymbol(symbol);

  // 发送连接确认
  res.write(`data: ${JSON.stringify({ type: "connected", symbol })}\n\n`);

  // 心跳（每 25 秒，防止代理超时）
  const heartbeat = setInterval(() => {
    try { res.write(": heartbeat\n\n"); } catch { clearInterval(heartbeat); }
  }, 25000);

  // 客户端断开时清理
  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(res);
    if (clients.size === 0) {
      subscribers.delete(symbol);
      unsubscribeSymbol(symbol);
    }
  });
});

/** 获取当前连接状态（供健康检测使用） */
export function getTickerWsStatus() {
  return {
    connected: finnhubWs?.readyState === WebSocket.OPEN,
    subscribedCount: subscribedSymbols.size,
    subscribedSymbols: Array.from(subscribedSymbols),
    clientCount: Array.from(subscribers.values()).reduce((a, s) => a + s.size, 0),
  };
}
