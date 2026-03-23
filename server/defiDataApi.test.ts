/**
 * defiDataApi.test.ts — goat-sdk/goat DeFi 数据集成测试
 */

import { describe, it, expect } from "vitest";
import {
  needsDeFiData,
  extractDeFiProtocols,
  formatDeFiOverview,
  formatProtocolDetail,
  type DeFiOverview,
  type ProtocolDetail,
} from "./defiDataApi";

// ── 单元测试（不依赖网络）──────────────────────────────────────────────────────

describe("DeFi Data API — Task Detection", () => {
  it("should detect DeFi-related tasks", () => {
    expect(needsDeFiData("分析 Aave 的 TVL 趋势")).toBe(true);
    expect(needsDeFiData("Uniswap 流动性池分析")).toBe(true);
    expect(needsDeFiData("DeFi 收益率对比")).toBe(true);
    expect(needsDeFiData("链上质押收益")).toBe(true);
    expect(needsDeFiData("ETH staking yield analysis")).toBe(true);
  });

  it("should not flag non-DeFi tasks", () => {
    expect(needsDeFiData("分析苹果公司的财报")).toBe(false);
    expect(needsDeFiData("AAPL 股票技术分析")).toBe(false);
    expect(needsDeFiData("美联储利率决议")).toBe(false);
  });

  it("should extract known DeFi protocol names", () => {
    const protocols = extractDeFiProtocols("分析 Aave 和 Uniswap 的竞争格局，以及 Lido 的质押收益");
    expect(protocols).toContain("aave");
    expect(protocols).toContain("uniswap");
    expect(protocols).toContain("lido");
  });

  it("should return empty array for non-DeFi text", () => {
    const protocols = extractDeFiProtocols("苹果公司年报分析");
    expect(protocols).toEqual([]);
  });
});

describe("DeFi Data API — Report Formatting", () => {
  const mockOverview: DeFiOverview = {
    totalTvl: 85_000_000_000,
    topChains: [
      { name: "Ethereum", tvl: 54_000_000_000 },
      { name: "Solana", tvl: 6_500_000_000 },
      { name: "BSC", tvl: 5_200_000_000 },
    ],
    topProtocols: [
      { name: "Lido", symbol: "LDO", category: "Liquid Staking", chain: "Ethereum", chains: ["Ethereum"], tvl: 28_000_000_000, change1d: 0.5 },
      { name: "Aave V3", symbol: "AAVE", category: "Lending", chain: "Multi-Chain", chains: ["Ethereum", "Polygon"], tvl: 12_000_000_000, change1d: -1.2 },
      { name: "Uniswap V3", symbol: "UNI", category: "Dexes", chain: "Multi-Chain", chains: ["Ethereum", "Arbitrum"], tvl: 4_500_000_000, change1d: 2.1 },
    ],
    topYieldPools: [
      { chain: "Ethereum", project: "Aave V3", symbol: "USDC", tvlUsd: 500_000_000, apy: 8.5, stablecoin: true },
      { chain: "Solana", project: "Marinade", symbol: "mSOL", tvlUsd: 800_000_000, apy: 6.8, stablecoin: false },
    ],
    defiCategories: {
      "Liquid Staking": 30_000_000_000,
      "Lending": 15_000_000_000,
      "Dexes": 12_000_000_000,
    },
    fetchedAt: Date.now(),
  };

  it("should format DeFi overview report", () => {
    const report = formatDeFiOverview(mockOverview);

    expect(report).toContain("DeFi");
    expect(report).toContain("$85.00B");
    expect(report).toContain("Ethereum");
    expect(report).toContain("Lido");
    expect(report).toContain("Aave V3");
    expect(report).toContain("DeFiLlama");
  });

  it("should include yield pool data in overview", () => {
    const report = formatDeFiOverview(mockOverview);
    expect(report).toContain("8.5%");
    expect(report).toContain("USDC");
  });

  it("should format protocol detail report", () => {
    const mockProtocol: ProtocolDetail = {
      name: "Aave V3",
      symbol: "AAVE",
      category: "Lending",
      chain: "Multi-Chain",
      chains: ["Ethereum", "Polygon", "Arbitrum", "Base"],
      tvl: 12_000_000_000,
      change1h: 0.1,
      change1d: -1.2,
      change7d: 3.5,
      mcap: 1_500_000_000,
      url: "https://aave.com",
      description: "Aave is a decentralised non-custodial liquidity market protocol.",
      currentTvlByChain: {
        "Ethereum": 8_000_000_000,
        "Polygon": 2_000_000_000,
        "Arbitrum": 1_500_000_000,
      },
    };

    const report = formatProtocolDetail(mockProtocol);
    expect(report).toContain("Aave V3");
    expect(report).toContain("$12.000B");
    expect(report).toContain("Ethereum");
    expect(report).toContain("DeFiLlama");
  });
});

// ── 集成测试（需要网络）──────────────────────────────────────────────────────

describe("DeFi Data API — Integration (requires network)", () => {
  it("should fetch DeFi overview from DeFiLlama", async () => {
    const { getDeFiOverview } = await import("./defiDataApi");
    const overview = await getDeFiOverview();

    expect(overview.totalTvl).toBeGreaterThan(1e9); // 至少 10 亿 TVL
    expect(overview.topChains.length).toBeGreaterThan(0);
    expect(overview.topProtocols.length).toBeGreaterThan(0);
    expect(overview.topProtocols[0].name).toBeDefined();
    expect(overview.topProtocols[0].tvl).toBeGreaterThan(0);
  }, 30000);

  it("should fetch Aave protocol detail", async () => {
    const { getProtocolDetail } = await import("./defiDataApi");
    const protocol = await getProtocolDetail("aave-v3");

    // Aave 可能返回 null（slug 可能变化），但不应抛出错误
    if (protocol) {
      expect(protocol.name).toBeDefined();
      // tvl 可能是 number 或 object（DeFiLlama API 返回格式不一）
      expect(protocol.tvl !== null && protocol.tvl !== undefined).toBe(true);
    }
  }, 30000);

  it("should search for Uniswap protocol", async () => {
    const { searchDeFiProtocols } = await import("./defiDataApi");
    const results = await searchDeFiProtocols("uniswap");

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name.toLowerCase()).toContain("uniswap");
  }, 30000);
});
