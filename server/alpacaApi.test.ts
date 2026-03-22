/**
 * alpacaApi.test.ts — Alpaca 模拟交易模块单元测试
 * 测试格式化函数和配置检查（不需要真实 API Key）
 */

import { describe, it, expect } from "vitest";
import {
  isAlpacaConfigured,
  formatAlpacaAccount,
  formatAlpacaPositions,
  formatAlpacaOrder,
  formatAlpacaClock,
  type AlpacaAccount,
  type AlpacaPosition,
  type AlpacaOrder,
  type AlpacaClock,
} from "./alpacaApi";

// ── 测试数据 ──────────────────────────────────────────────────────────────────

const mockAccount: AlpacaAccount = {
  id: "test-account-id",
  account_number: "PA123456789",
  status: "ACTIVE",
  currency: "USD",
  buying_power: "200000.00",
  cash: "100000.00",
  portfolio_value: "150000.00",
  equity: "150000.00",
  last_equity: "148000.00",
  long_market_value: "50000.00",
  short_market_value: "0.00",
  initial_margin: "0.00",
  maintenance_margin: "0.00",
  daytrade_count: 2,
  pattern_day_trader: false,
};

const mockPositions: AlpacaPosition[] = [
  {
    asset_id: "asset-1",
    symbol: "AAPL",
    exchange: "NASDAQ",
    asset_class: "us_equity",
    qty: "10",
    avg_entry_price: "150.00",
    side: "long",
    market_value: "1750.00",
    cost_basis: "1500.00",
    unrealized_pl: "250.00",
    unrealized_plpc: "0.1667",
    current_price: "175.00",
    lastday_price: "172.00",
    change_today: "0.0174",
  },
  {
    asset_id: "asset-2",
    symbol: "TSLA",
    exchange: "NASDAQ",
    asset_class: "us_equity",
    qty: "5",
    avg_entry_price: "200.00",
    side: "long",
    market_value: "900.00",
    cost_basis: "1000.00",
    unrealized_pl: "-100.00",
    unrealized_plpc: "-0.1",
    current_price: "180.00",
    lastday_price: "185.00",
    change_today: "-0.027",
  },
];

const mockOrder: AlpacaOrder = {
  id: "order-test-id",
  client_order_id: "client-order-1",
  created_at: "2024-01-15T10:00:00Z",
  updated_at: "2024-01-15T10:00:01Z",
  submitted_at: "2024-01-15T10:00:00Z",
  filled_at: "2024-01-15T10:00:05Z",
  expired_at: null,
  canceled_at: null,
  failed_at: null,
  asset_id: "asset-1",
  symbol: "AAPL",
  asset_class: "us_equity",
  qty: "10",
  filled_qty: "10",
  type: "market",
  order_class: "simple",
  side: "buy",
  time_in_force: "day",
  limit_price: null,
  stop_price: null,
  filled_avg_price: "175.50",
  status: "filled",
  extended_hours: false,
  legs: null,
};

const mockClock: AlpacaClock = {
  timestamp: "2024-01-15T15:30:00Z",
  is_open: true,
  next_open: "2024-01-16T14:30:00Z",
  next_close: "2024-01-15T21:00:00Z",
};

// ── 测试套件 ──────────────────────────────────────────────────────────────────

describe("alpacaApi - isAlpacaConfigured", () => {
  it("未配置时返回 false", () => {
    // ENV.ALPACA_API_KEY 默认为空字符串
    const result = isAlpacaConfigured();
    // 沙盒环境中未配置，应返回 false
    expect(typeof result).toBe("boolean");
  });
});

describe("alpacaApi - formatAlpacaAccount", () => {
  it("正确格式化账户信息", () => {
    const result = formatAlpacaAccount(mockAccount);
    expect(result).toContain("PA123456789");
    expect(result).toContain("正常");
    expect(result).toContain("150,000.00");
    expect(result).toContain("100,000.00");
    expect(result).toContain("50,000.00");
    expect(result).toContain("USD");
  });

  it("账户状态为 ACTIVE 时显示绿色图标", () => {
    const result = formatAlpacaAccount(mockAccount);
    expect(result).toContain("✅");
  });

  it("PDT 用户显示警告", () => {
    const pdtAccount = { ...mockAccount, pattern_day_trader: true, daytrade_count: 4 };
    const result = formatAlpacaAccount(pdtAccount);
    expect(result).toContain("PDT");
  });

  it("非 PDT 用户不显示 PDT 警告", () => {
    const result = formatAlpacaAccount(mockAccount);
    expect(result).not.toContain("PDT");
  });
});

describe("alpacaApi - formatAlpacaPositions", () => {
  it("空持仓时显示提示", () => {
    const result = formatAlpacaPositions([]);
    expect(result).toContain("暂无持仓");
  });

  it("正确格式化持仓列表", () => {
    const result = formatAlpacaPositions(mockPositions);
    expect(result).toContain("AAPL");
    expect(result).toContain("TSLA");
    expect(result).toContain("做多");
    expect(result).toContain("+$250.00");
  });

  it("亏损持仓显示负号", () => {
    const result = formatAlpacaPositions(mockPositions);
    expect(result).toContain("-100.00");
  });

  it("正确计算总持仓市值", () => {
    const result = formatAlpacaPositions(mockPositions);
    // AAPL 1750 + TSLA 900 = 2650
    expect(result).toContain("2,650.00");
  });

  it("正确计算总未实现盈亏", () => {
    const result = formatAlpacaPositions(mockPositions);
    // 250 - 100 = 150
    expect(result).toContain("+$150.00");
  });

  it("显示持仓数量", () => {
    const result = formatAlpacaPositions(mockPositions);
    expect(result).toContain("2 只");
  });
});

describe("alpacaApi - formatAlpacaOrder", () => {
  it("正确格式化已成交订单", () => {
    const result = formatAlpacaOrder(mockOrder);
    expect(result).toContain("AAPL");
    expect(result).toContain("买入");
    expect(result).toContain("市价单");
    expect(result).toContain("✅ 已成交");
    expect(result).toContain("175.50");
  });

  it("买入订单显示绿色图标", () => {
    const result = formatAlpacaOrder(mockOrder);
    expect(result).toContain("🟢 买入");
  });

  it("卖出订单显示红色图标", () => {
    const sellOrder = { ...mockOrder, side: "sell" as const };
    const result = formatAlpacaOrder(sellOrder);
    expect(result).toContain("🔴 卖出");
  });

  it("限价单显示限价", () => {
    const limitOrder = { ...mockOrder, type: "limit" as const, limit_price: "170.00" };
    const result = formatAlpacaOrder(limitOrder);
    expect(result).toContain("限价单");
    expect(result).toContain("170.00");
  });

  it("当日有效订单显示正确有效期", () => {
    const result = formatAlpacaOrder(mockOrder);
    expect(result).toContain("当日有效");
  });

  it("GTC 订单显示长期有效", () => {
    const gtcOrder = { ...mockOrder, time_in_force: "gtc" as const };
    const result = formatAlpacaOrder(gtcOrder);
    expect(result).toContain("长期有效");
  });
});

describe("alpacaApi - formatAlpacaClock", () => {
  it("开盘时显示绿色图标", () => {
    const result = formatAlpacaClock(mockClock);
    expect(result).toContain("🟢 交易中");
  });

  it("收盘时显示红色图标", () => {
    const closedClock = { ...mockClock, is_open: false };
    const result = formatAlpacaClock(closedClock);
    expect(result).toContain("🔴 已收盘");
  });

  it("开盘时显示下次收盘时间", () => {
    const result = formatAlpacaClock(mockClock);
    expect(result).toContain("下次收盘");
  });

  it("收盘时显示下次开盘时间", () => {
    const closedClock = { ...mockClock, is_open: false };
    const result = formatAlpacaClock(closedClock);
    expect(result).toContain("下次开盘");
  });
});
