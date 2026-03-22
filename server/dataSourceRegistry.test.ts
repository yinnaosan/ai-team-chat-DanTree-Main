/**
 * dataSourceRegistry.test.ts
 * 数据源注册表 & Citation Builder 单元测试
 *
 * 测试覆盖：
 * 1. 注册表完整性（所有必填字段存在，id 唯一）
 * 2. buildCitationSummary 正确区分命中/未命中/跳过
 * 3. Source Gating 文本在无数据时包含严禁规则
 * 4. Source Gating 文本在有数据时包含命中来源列表
 * 5. citationToApiSources 只返回命中条目
 * 6. 新增数据源后自动出现在 citationSummary 中
 */

import { describe, it, expect } from "vitest";
import {
  DATA_SOURCE_REGISTRY,
  buildCitationSummary,
  citationToApiSources,
  getDataSourceById,
  getWhitelistedSources,
  getSourcesByCategory,
} from "./dataSourceRegistry";

// ── 1. 注册表完整性 ────────────────────────────────────────────────────────────

describe("DATA_SOURCE_REGISTRY 完整性", () => {
  it("注册表不为空", () => {
    expect(DATA_SOURCE_REGISTRY.length).toBeGreaterThan(0);
  });

  it("所有条目都有必填字段", () => {
    for (const src of DATA_SOURCE_REGISTRY) {
      expect(src.id, `${src.id} 缺少 id`).toBeTruthy();
      expect(src.displayName, `${src.id} 缺少 displayName`).toBeTruthy();
      expect(src.category, `${src.id} 缺少 category`).toBeTruthy();
      expect(src.icon, `${src.id} 缺少 icon`).toBeTruthy();
      expect(src.description, `${src.id} 缺少 description`).toBeTruthy();
      expect(typeof src.isWhitelisted, `${src.id} isWhitelisted 类型错误`).toBe("boolean");
      expect(typeof src.requiresApiKey, `${src.id} requiresApiKey 类型错误`).toBe("boolean");
    }
  });

  it("所有 id 唯一", () => {
    const ids = DATA_SOURCE_REGISTRY.map(d => d.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("getDataSourceById 能找到已注册的来源", () => {
    const fred = getDataSourceById("fred");
    expect(fred).toBeDefined();
    expect(fred?.displayName).toBe("FRED");
  });

  it("getDataSourceById 对未注册 id 返回 undefined", () => {
    expect(getDataSourceById("nonexistent_source")).toBeUndefined();
  });

  it("getWhitelistedSources 只返回白名单来源", () => {
    const whitelist = getWhitelistedSources();
    expect(whitelist.every(d => d.isWhitelisted)).toBe(true);
    expect(whitelist.length).toBeGreaterThan(0);
  });

  it("getSourcesByCategory 按分类过滤正确", () => {
    const macroSources = getSourcesByCategory("宏观指标");
    expect(macroSources.every(d => d.category === "宏观指标")).toBe(true);
    expect(macroSources.length).toBeGreaterThan(0);
    // FRED 应在宏观指标中
    expect(macroSources.some(d => d.id === "fred")).toBe(true);
  });
});

// ── 2. buildCitationSummary 核心逻辑 ─────────────────────────────────────────

describe("buildCitationSummary", () => {
  it("命中：有数据的条目被标记为 hit=true", () => {
    const summary = buildCitationSummary([
      { sourceId: "fred", data: "## FRED 数据\n联邦基金利率: 3.64% (2026-02-01)", latencyMs: 320 },
      { sourceId: "yahoo_finance", data: "", latencyMs: 150 }, // 无数据
    ]);

    const fredEntry = summary.citations.find(c => c.sourceId === "fred");
    const yahooEntry = summary.citations.find(c => c.sourceId === "yahoo_finance");

    expect(fredEntry?.hit).toBe(true);
    expect(yahooEntry?.hit).toBe(false);
    expect(summary.hitCount).toBe(1);
    expect(summary.missCount).toBe(1);
  });

  it("跳过：latencyMs=-1 的条目被标记为 skipped", () => {
    const summary = buildCitationSummary([
      { sourceId: "fred", data: "有数据", latencyMs: 400 },
      { sourceId: "coingecko", data: "", latencyMs: -1 }, // 未调用
    ]);

    expect(summary.skippedCount).toBe(1);
    expect(summary.missCount).toBe(0);
  });

  it("未注册的 sourceId 被忽略", () => {
    const summary = buildCitationSummary([
      { sourceId: "unknown_api_xyz", data: "some data", latencyMs: 100 },
      { sourceId: "fred", data: "FRED 数据", latencyMs: 200 },
    ]);

    // unknown_api_xyz 不应出现在 citations 中
    expect(summary.citations.some(c => c.sourceId === "unknown_api_xyz")).toBe(false);
    expect(summary.citations.some(c => c.sourceId === "fred")).toBe(true);
  });

  it("hasEvidenceToBasis：至少一个白名单来源命中时为 true", () => {
    const summary = buildCitationSummary([
      { sourceId: "fred", data: "FRED 数据", latencyMs: 300 },
    ]);
    expect(summary.hasEvidenceToBasis).toBe(true);
  });

  it("hasEvidenceToBasis：无命中时为 false", () => {
    const summary = buildCitationSummary([
      { sourceId: "fred", data: "", latencyMs: 300 },
      { sourceId: "yahoo_finance", data: "", latencyMs: 200 },
    ]);
    expect(summary.hasEvidenceToBasis).toBe(false);
  });

  it("totalLatencyMs 正确累加（忽略 -1）", () => {
    const summary = buildCitationSummary([
      { sourceId: "fred", data: "数据", latencyMs: 300 },
      { sourceId: "yahoo_finance", data: "数据", latencyMs: 200 },
      { sourceId: "coingecko", data: "", latencyMs: -1 }, // 未调用，不计入
    ]);
    expect(summary.totalLatencyMs).toBe(500);
  });
});

// ── 3. Source Gating 文本 ─────────────────────────────────────────────────────

describe("sourcingBlock（Source Gating）", () => {
  it("无数据时包含严禁规则", () => {
    const summary = buildCitationSummary([
      { sourceId: "fred", data: "", latencyMs: 300 },
    ]);
    expect(summary.sourcingBlock).toContain("严禁");
    expect(summary.sourcingBlock).toContain("训练记忆");
  });

  it("有数据时包含命中来源列表", () => {
    const summary = buildCitationSummary([
      { sourceId: "fred", data: "联邦基金利率: 3.64%", latencyMs: 320 },
      { sourceId: "yahoo_finance", data: "AAPL: $220.50", latencyMs: 180 },
    ]);
    expect(summary.sourcingBlock).toContain("FRED");
    expect(summary.sourcingBlock).toContain("Yahoo Finance");
    expect(summary.sourcingBlock).toContain("SOURCE_GATING");
  });

  it("有数据时包含今日日期", () => {
    const summary = buildCitationSummary([
      { sourceId: "fred", data: "数据", latencyMs: 100 },
    ]);
    const today = new Date().getFullYear().toString();
    expect(summary.sourcingBlock).toContain(today);
  });

  it("无数据时 sourcingBlock 包含 CRITICAL 标签", () => {
    const summary = buildCitationSummary([]);
    expect(summary.sourcingBlock).toContain("CRITICAL");
  });
});

// ── 4. citationToApiSources ───────────────────────────────────────────────────

describe("citationToApiSources", () => {
  it("只返回命中条目", () => {
    const summary = buildCitationSummary([
      { sourceId: "fred", data: "FRED 数据", latencyMs: 300 },
      { sourceId: "yahoo_finance", data: "", latencyMs: 200 }, // 未命中
      { sourceId: "coingecko", data: "", latencyMs: -1 }, // 未调用
    ]);
    const apiSources = citationToApiSources(summary);
    expect(apiSources.length).toBe(1);
    expect(apiSources[0].name).toBe("FRED");
  });

  it("返回的条目包含必要字段", () => {
    const summary = buildCitationSummary([
      { sourceId: "fred", data: "FRED 数据 2026-02-01", latencyMs: 320 },
    ]);
    const apiSources = citationToApiSources(summary);
    expect(apiSources[0]).toHaveProperty("name");
    expect(apiSources[0]).toHaveProperty("category");
    expect(apiSources[0]).toHaveProperty("icon");
    expect(apiSources[0]).toHaveProperty("description");
    expect(apiSources[0]).toHaveProperty("latencyMs");
  });

  it("description 包含数据时间戳（如果有）", () => {
    const summary = buildCitationSummary([
      { sourceId: "fred", data: "联邦基金利率: 3.64% (2026-02-01)", latencyMs: 320 },
    ]);
    const apiSources = citationToApiSources(summary);
    // description 应包含时间戳
    expect(apiSources[0].description).toContain("2026-02-01");
  });

  it("无命中时返回空数组", () => {
    const summary = buildCitationSummary([
      { sourceId: "fred", data: "", latencyMs: 300 },
    ]);
    expect(citationToApiSources(summary)).toHaveLength(0);
  });
});

// ── 5. 扩展性：新增数据源后自动出现在 citation 中 ─────────────────────────────

describe("注册表扩展性", () => {
  it("注册表中的所有 id 都能被 getDataSourceById 找到", () => {
    for (const src of DATA_SOURCE_REGISTRY) {
      const found = getDataSourceById(src.id);
      expect(found).toBeDefined();
      expect(found?.id).toBe(src.id);
    }
  });

  it("buildCitationSummary 能处理注册表中的所有 id", () => {
    const inputs = DATA_SOURCE_REGISTRY.map(src => ({
      sourceId: src.id,
      data: `${src.displayName} 测试数据`,
      latencyMs: 100,
    }));
    const summary = buildCitationSummary(inputs);
    // 所有注册的来源都应该命中
    expect(summary.hitCount).toBe(DATA_SOURCE_REGISTRY.length);
    expect(summary.missCount).toBe(0);
  });
});
