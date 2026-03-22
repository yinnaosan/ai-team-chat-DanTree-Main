/**
 * alpacaApi.ts — Alpaca Paper Trading 模拟交易接入模块
 * 来源：alpacahq/alpaca-py (https://github.com/alpacahq/alpaca-py)
 * 使用 Alpaca REST API v2（无需 Python SDK，直接 HTTP 调用）
 * 
 * 支持：
 * - 账户信息查询
 * - 持仓查询
 * - 下单（市价单/限价单）
 * - 订单状态查询
 * - 取消订单
 * - 市场状态查询
 */

import { ENV } from "./_core/env";

const ALPACA_BASE_URL = "https://paper-api.alpaca.markets/v2";
const ALPACA_DATA_URL = "https://data.alpaca.markets/v2";

// ── 类型定义 ──────────────────────────────────────────────────────────────────

export interface AlpacaAccount {
  id: string;
  account_number: string;
  status: string;
  currency: string;
  buying_power: string;
  cash: string;
  portfolio_value: string;
  equity: string;
  last_equity: string;
  long_market_value: string;
  short_market_value: string;
  initial_margin: string;
  maintenance_margin: string;
  daytrade_count: number;
  pattern_day_trader: boolean;
}

export interface AlpacaPosition {
  asset_id: string;
  symbol: string;
  exchange: string;
  asset_class: string;
  qty: string;
  avg_entry_price: string;
  side: "long" | "short";
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  current_price: string;
  lastday_price: string;
  change_today: string;
}

export interface AlpacaOrder {
  id: string;
  client_order_id: string;
  created_at: string;
  updated_at: string;
  submitted_at: string;
  filled_at: string | null;
  expired_at: string | null;
  canceled_at: string | null;
  failed_at: string | null;
  asset_id: string;
  symbol: string;
  asset_class: string;
  qty: string;
  filled_qty: string;
  type: "market" | "limit" | "stop" | "stop_limit";
  order_class: string;
  side: "buy" | "sell";
  time_in_force: "day" | "gtc" | "opg" | "cls" | "ioc" | "fok";
  limit_price: string | null;
  stop_price: string | null;
  filled_avg_price: string | null;
  status: "new" | "partially_filled" | "filled" | "done_for_day" | "canceled" | "expired" | "replaced" | "pending_cancel" | "pending_replace" | "accepted" | "pending_new" | "accepted_for_bidding" | "stopped" | "rejected" | "suspended" | "calculated";
  extended_hours: boolean;
  legs: AlpacaOrder[] | null;
}

export interface AlpacaClock {
  timestamp: string;
  is_open: boolean;
  next_open: string;
  next_close: string;
}

export interface PlaceOrderParams {
  symbol: string;
  qty?: number;
  notional?: number; // 按金额下单（美元）
  side: "buy" | "sell";
  type: "market" | "limit" | "stop" | "stop_limit";
  time_in_force: "day" | "gtc" | "opg" | "cls" | "ioc" | "fok";
  limit_price?: number;
  stop_price?: number;
  extended_hours?: boolean;
  client_order_id?: string;
}

// ── 配置检查 ──────────────────────────────────────────────────────────────────

export function isAlpacaConfigured(): boolean {
  return !!(ENV.ALPACA_API_KEY && ENV.ALPACA_API_SECRET);
}

// ── HTTP 工具 ─────────────────────────────────────────────────────────────────

async function alpacaRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  baseUrl = ALPACA_BASE_URL,
): Promise<T> {
  if (!isAlpacaConfigured()) {
    throw new Error("Alpaca API 未配置（需要 ALPACA_API_KEY 和 ALPACA_API_SECRET）");
  }

  const url = `${baseUrl}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "APCA-API-KEY-ID": ENV.ALPACA_API_KEY!,
      "APCA-API-SECRET-KEY": ENV.ALPACA_API_SECRET!,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Alpaca API 错误 ${response.status}: ${errorText}`);
  }

  return response.json() as Promise<T>;
}

// ── 账户信息 ──────────────────────────────────────────────────────────────────

export async function getAlpacaAccount(): Promise<AlpacaAccount> {
  return alpacaRequest<AlpacaAccount>("/account");
}

export function formatAlpacaAccount(account: AlpacaAccount): string {
  const equity = parseFloat(account.equity);
  const cash = parseFloat(account.cash);
  const portfolioValue = parseFloat(account.portfolio_value);
  const longMV = parseFloat(account.long_market_value);
  const unrealizedPL = portfolioValue - parseFloat(account.initial_margin || "0");
  const daytradeCount = account.daytrade_count;

  return `## Alpaca 模拟账户状态
- **账户编号**: ${account.account_number}
- **账户状态**: ${account.status === "ACTIVE" ? "✅ 正常" : account.status}
- **总权益**: $${equity.toLocaleString("en-US", { minimumFractionDigits: 2 })}
- **可用现金**: $${cash.toLocaleString("en-US", { minimumFractionDigits: 2 })}
- **持仓市值**: $${longMV.toLocaleString("en-US", { minimumFractionDigits: 2 })}
- **当日交易次数**: ${daytradeCount}${account.pattern_day_trader ? " ⚠️ 已触发 PDT 规则" : ""}
- **货币**: ${account.currency}`;
}

// ── 持仓查询 ──────────────────────────────────────────────────────────────────

export async function getAlpacaPositions(): Promise<AlpacaPosition[]> {
  return alpacaRequest<AlpacaPosition[]>("/positions");
}

export function formatAlpacaPositions(positions: AlpacaPosition[]): string {
  if (positions.length === 0) {
    return "## 当前持仓\n暂无持仓";
  }

  const totalPL = positions.reduce((sum, p) => sum + parseFloat(p.unrealized_pl), 0);
  const totalMV = positions.reduce((sum, p) => sum + parseFloat(p.market_value), 0);

  const rows = positions.map(p => {
    const pl = parseFloat(p.unrealized_pl);
    const plPct = parseFloat(p.unrealized_plpc) * 100;
    const plSign = pl >= 0 ? "+" : "";
    return `| ${p.symbol} | ${p.side === "long" ? "做多" : "做空"} | ${parseFloat(p.qty).toFixed(2)} | $${parseFloat(p.avg_entry_price).toFixed(2)} | $${parseFloat(p.current_price).toFixed(2)} | ${plSign}$${pl.toFixed(2)} (${plSign}${plPct.toFixed(2)}%) |`;
  }).join("\n");

  return `## 当前持仓（${positions.length} 只）
| 股票 | 方向 | 数量 | 成本价 | 现价 | 未实现盈亏 |
|------|------|------|--------|------|-----------|
${rows}

**总持仓市值**: $${totalMV.toLocaleString("en-US", { minimumFractionDigits: 2 })}
**总未实现盈亏**: ${totalPL >= 0 ? "+" : ""}$${totalPL.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

// ── 下单 ──────────────────────────────────────────────────────────────────────

export async function placeAlpacaOrder(params: PlaceOrderParams): Promise<AlpacaOrder> {
  return alpacaRequest<AlpacaOrder>("/orders", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function formatAlpacaOrder(order: AlpacaOrder): string {
  const statusMap: Record<string, string> = {
    new: "🟡 已提交",
    partially_filled: "🟠 部分成交",
    filled: "✅ 已成交",
    canceled: "❌ 已取消",
    expired: "⏰ 已过期",
    rejected: "🚫 已拒绝",
    pending_new: "⏳ 待提交",
  };

  const typeMap: Record<string, string> = {
    market: "市价单",
    limit: "限价单",
    stop: "止损单",
    stop_limit: "止损限价单",
  };

  const tifMap: Record<string, string> = {
    day: "当日有效",
    gtc: "长期有效",
    ioc: "立即成交或取消",
    fok: "全部成交或取消",
  };

  return `## 订单详情
- **订单 ID**: ${order.id}
- **股票**: ${order.symbol}
- **方向**: ${order.side === "buy" ? "🟢 买入" : "🔴 卖出"}
- **类型**: ${typeMap[order.type] ?? order.type}
- **数量**: ${order.qty} 股
- **有效期**: ${tifMap[order.time_in_force] ?? order.time_in_force}
${order.limit_price ? `- **限价**: $${order.limit_price}` : ""}
${order.filled_avg_price ? `- **成交均价**: $${order.filled_avg_price}` : ""}
- **状态**: ${statusMap[order.status] ?? order.status}
- **提交时间**: ${new Date(order.submitted_at).toLocaleString("zh-CN")}
${order.filled_at ? `- **成交时间**: ${new Date(order.filled_at).toLocaleString("zh-CN")}` : ""}`;
}

// ── 订单列表 ──────────────────────────────────────────────────────────────────

export async function getAlpacaOrders(status: "open" | "closed" | "all" = "open", limit = 20): Promise<AlpacaOrder[]> {
  return alpacaRequest<AlpacaOrder[]>(`/orders?status=${status}&limit=${limit}`);
}

// ── 取消订单 ──────────────────────────────────────────────────────────────────

export async function cancelAlpacaOrder(orderId: string): Promise<void> {
  await alpacaRequest<void>(`/orders/${orderId}`, { method: "DELETE" });
}

// ── 市场状态 ──────────────────────────────────────────────────────────────────

export async function getAlpacaClock(): Promise<AlpacaClock> {
  return alpacaRequest<AlpacaClock>("/clock");
}

export function formatAlpacaClock(clock: AlpacaClock): string {
  const isOpen = clock.is_open;
  const nextEvent = isOpen
    ? `下次收盘: ${new Date(clock.next_close).toLocaleString("zh-CN")}`
    : `下次开盘: ${new Date(clock.next_open).toLocaleString("zh-CN")}`;

  return `**美股市场**: ${isOpen ? "🟢 交易中" : "🔴 已收盘"} | ${nextEvent}`;
}

// ── 健康检查 ──────────────────────────────────────────────────────────────────

export async function checkAlpacaHealth(): Promise<{ status: "active" | "error" | "not_configured"; message: string }> {
  if (!isAlpacaConfigured()) {
    return { status: "not_configured", message: "未配置 Alpaca API Key" };
  }

  try {
    const clock = await getAlpacaClock();
    return {
      status: "active",
      message: `Alpaca Paper Trading 正常 | 市场${clock.is_open ? "开盘中" : "已收盘"}`,
    };
  } catch (err) {
    return {
      status: "error",
      message: `Alpaca API 连接失败: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
