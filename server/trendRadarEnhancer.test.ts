/**
 * TrendRadar 增强模块测试
 */
import { describe, it, expect } from "vitest";
import {
  shouldFilterNews,
  filterLowQualityNews,
  calculateNewsWeight,
  sortNewsByWeight,
  detectCrossSourceResonance,
  buildEnhancedNewsBlock,
  buildTrendRadarAnalysisPrompt,
  buildSourceAttribution,
  type NewsItem,
} from "./trendRadarEnhancer";

// ─────────────────────────────────────────────
// 测试数据
// ─────────────────────────────────────────────

const sampleItems: NewsItem[] = [
  {
    title: "美联储宣布维持利率不变，市场反应平稳",
    source: "NewsAPI",
    rank: 1,
    count: 3,
    publishedAt: new Date().toISOString(),
  },
  {
    title: "苹果公司发布新款 iPhone，销量预期超预期",
    source: "Marketaux",
    rank: 3,
    count: 2,
    publishedAt: new Date().toISOString(),
  },
  {
    title: "震惊！某股票暴涨300%，你绝对想不到原因",
    source: "NewsAPI",
    rank: 5,
    count: 1,
  },
  {
    title: "限时优惠！立即购买理财产品，年化收益8%",
    source: "金十数据",
    rank: 8,
    count: 1,
  },
  {
    title: "美联储利率决议出炉，鲍威尔发表讲话",
    source: "金十数据",
    rank: 2,
    count: 4,
    publishedAt: new Date().toISOString(),
  },
  {
    title: "苹果 iPhone 新品发布会，市场期待新功能",
    source: "华尔街见闻",
    rank: 4,
    count: 2,
    publishedAt: new Date().toISOString(),
  },
];

// ─────────────────────────────────────────────
// 全局过滤词测试
// ─────────────────────────────────────────────

describe("shouldFilterNews", () => {
  it("应过滤标题党内容", () => {
    expect(shouldFilterNews("震惊！某股票暴涨300%")).toBe(true);
    expect(shouldFilterNews("你绝对想不到的投资秘诀")).toBe(true);
    expect(shouldFilterNews("突发！美联储紧急降息")).toBe(true);
  });

  it("应过滤营销软文", () => {
    expect(shouldFilterNews("限时优惠！立即购买理财产品")).toBe(true);
    expect(shouldFilterNews("点击领取免费股票分析报告")).toBe(true);
    expect(shouldFilterNews("加微信获取内部消息")).toBe(true);
  });

  it("不应过滤正常财经新闻", () => {
    expect(shouldFilterNews("美联储宣布维持利率不变")).toBe(false);
    expect(shouldFilterNews("苹果公司Q3财报超预期")).toBe(false);
    expect(shouldFilterNews("沪深300指数今日收涨1.2%")).toBe(false);
    expect(shouldFilterNews("Fed holds rates steady amid inflation concerns")).toBe(false);
  });
});

describe("filterLowQualityNews", () => {
  it("应过滤低质量内容，保留正常新闻", () => {
    const filtered = filterLowQualityNews(sampleItems);
    expect(filtered.length).toBe(4); // 过滤掉 2 条低质量内容
    expect(filtered.every((item) => !shouldFilterNews(item.title))).toBe(true);
  });

  it("空数组应返回空数组", () => {
    expect(filterLowQualityNews([])).toEqual([]);
  });
});

// ─────────────────────────────────────────────
// 新闻权重评分测试
// ─────────────────────────────────────────────

describe("calculateNewsWeight", () => {
  it("排名靠前的新闻应有更高权重", () => {
    const highRank: NewsItem = { title: "test", source: "A", rank: 1, count: 1 };
    const lowRank: NewsItem = { title: "test", source: "A", rank: 10, count: 1 };
    expect(calculateNewsWeight(highRank)).toBeGreaterThan(calculateNewsWeight(lowRank));
  });

  it("出现频次高的新闻应有更高权重", () => {
    const highCount: NewsItem = { title: "test", source: "A", rank: 5, count: 8 };
    const lowCount: NewsItem = { title: "test", source: "A", rank: 5, count: 1 };
    expect(calculateNewsWeight(highCount)).toBeGreaterThan(calculateNewsWeight(lowCount));
  });

  it("高位排名（rank <= 5）应有热度加成", () => {
    const highHotness: NewsItem = { title: "test", source: "A", rank: 3, count: 1 };
    const lowHotness: NewsItem = { title: "test", source: "A", rank: 8, count: 1 };
    expect(calculateNewsWeight(highHotness)).toBeGreaterThan(calculateNewsWeight(lowHotness));
  });

  it("默认值（无 rank/count）应返回合理分数", () => {
    const item: NewsItem = { title: "test", source: "A" };
    const weight = calculateNewsWeight(item);
    expect(weight).toBeGreaterThan(0);
    expect(weight).toBeLessThan(100);
  });
});

describe("sortNewsByWeight", () => {
  it("应按权重降序排序", () => {
    const items: NewsItem[] = [
      { title: "低权重", source: "A", rank: 10, count: 1 },
      { title: "高权重", source: "A", rank: 1, count: 5 },
      { title: "中权重", source: "A", rank: 5, count: 2 },
    ];
    const sorted = sortNewsByWeight(items);
    expect(sorted[0].title).toBe("高权重");
    expect(sorted[sorted.length - 1].title).toBe("低权重");
  });

  it("应为每条新闻添加 weight 字段", () => {
    const items: NewsItem[] = [{ title: "test", source: "A", rank: 3 }];
    const sorted = sortNewsByWeight(items);
    expect(sorted[0].weight).toBeGreaterThan(0);
    expect(sorted[0].resonanceScore).toBe(0);
    expect(sorted[0].isHighResonance).toBe(false);
  });
});

// ─────────────────────────────────────────────
// 跨平台共振检测测试
// ─────────────────────────────────────────────

describe("detectCrossSourceResonance", () => {
  it("应检测到美联储相关新闻的跨平台共振", () => {
    // 使用相同语言的标题，确保关键词匹配
    const fedItems: NewsItem[] = [
      { title: "美联储宣布维持利率不变", source: "NewsAPI", rank: 1, count: 3, publishedAt: new Date().toISOString() },
      { title: "美联储利率决议出炉，鲍威尔发表讲话", source: "金十数据", rank: 2, count: 4, publishedAt: new Date().toISOString() },
    ];
    const { resonanceGroups } = detectCrossSourceResonance(fedItems);
    // 美联储相关：NewsAPI + 金十数据 = 2 个来源
    const fedGroup = resonanceGroups.find((g) =>
      g.items.some((i) => i.title.includes("美联储"))
    );
    expect(fedGroup).toBeDefined();
    expect(fedGroup!.sources.length).toBeGreaterThanOrEqual(2);
  });

  it("应检测到苹果相关新闻的跨平台共振", () => {
    // 使用相同语言的标题，确保关键词匹配
    const appleItems: NewsItem[] = [
      { title: "苹果公司发布新款 iPhone，销量预期超预期", source: "Marketaux", rank: 3, count: 2, publishedAt: new Date().toISOString() },
      { title: "苹果 iPhone 新品发布会，市场期待新功能", source: "华尔街见闻", rank: 4, count: 2, publishedAt: new Date().toISOString() },
    ];
    const { resonanceGroups } = detectCrossSourceResonance(appleItems);
    // 苹果相关：Marketaux + 华尔街见闻 = 2 个来源
    const appleGroup = resonanceGroups.find((g) =>
      g.items.some((i) => i.title.includes("苹果"))
    );
    expect(appleGroup).toBeDefined();
  });

  it("共振分组应按来源数量降序排列", () => {
    const { resonanceGroups } = detectCrossSourceResonance(sampleItems);
    for (let i = 0; i < resonanceGroups.length - 1; i++) {
      expect(resonanceGroups[i].sources.length).toBeGreaterThanOrEqual(
        resonanceGroups[i + 1].sources.length
      );
    }
  });

  it("高共振新闻应有 isHighResonance = true", () => {
    // 创建 3 个来源的同一话题（相同语言，确保关键词匹配）
    const items: NewsItem[] = [
      { title: "美联储宣布加息25个基点，利率决议公布", source: "NewsAPI", rank: 1, count: 3, publishedAt: new Date().toISOString() },
      { title: "美联储加息决议公布，利率上调至25基点", source: "金十数据", rank: 2, count: 3, publishedAt: new Date().toISOString() },
      { title: "美联储利率决议出炉，加息25基点符合预期", source: "Marketaux", rank: 1, count: 3, publishedAt: new Date().toISOString() },
    ];
    const { enhancedItems } = detectCrossSourceResonance(items);
    // 至少有一条新闻应被标记为高共振
    const hasHighResonance = enhancedItems.some((item) => item.isHighResonance);
    expect(hasHighResonance).toBe(true);
  });

  it("空数组应返回空结果", () => {
    const { resonanceGroups, enhancedItems } = detectCrossSourceResonance([]);
    expect(resonanceGroups).toEqual([]);
    expect(enhancedItems).toEqual([]);
  });
});

// ─────────────────────────────────────────────
// 增强新闻块构建测试
// ─────────────────────────────────────────────

describe("buildEnhancedNewsBlock", () => {
  it("应返回包含新闻列表的字符串", () => {
    const block = buildEnhancedNewsBlock(sampleItems);
    expect(block).toContain("新闻列表");
    expect(block.length).toBeGreaterThan(50);
  });

  it("应过滤低质量内容", () => {
    const block = buildEnhancedNewsBlock(sampleItems);
    expect(block).not.toContain("震惊");
    expect(block).not.toContain("限时优惠");
  });

  it("应包含跨平台共振标签（需要 3+ 来源才显示）", () => {
    // 创建 3 个来源的同一话题（相同语言，确保关键词匹配），触发"破圈扩散"
    const items3Sources: NewsItem[] = [
      { title: "美联储宣布维持利率不变，利率决议公布", source: "NewsAPI", rank: 1, count: 3, publishedAt: new Date().toISOString() },
      { title: "美联储利率决议出炉，鲍威尔发表讲话", source: "金十数据", rank: 2, count: 4, publishedAt: new Date().toISOString() },
      { title: "美联储利率维持不变，利率决议符合预期", source: "Marketaux", rank: 1, count: 3, publishedAt: new Date().toISOString() },
    ];
    const block = buildEnhancedNewsBlock(items3Sources);
    expect(block).toContain("跨平台共振话题");
  });

  it("空数组应返回空字符串", () => {
    expect(buildEnhancedNewsBlock([])).toBe("");
  });

  it("应限制最大条数", () => {
    const manyItems: NewsItem[] = Array.from({ length: 30 }, (_, i) => ({
      title: `新闻标题 ${i}`,
      source: "测试来源",
      rank: i + 1,
    }));
    const block = buildEnhancedNewsBlock(manyItems, 5);
    // 应最多包含 5 条
    const matches = block.match(/^\d+\./gm);
    expect(matches?.length ?? 0).toBeLessThanOrEqual(5);
  });
});

// ─────────────────────────────────────────────
// 六板块分析提示词测试
// ─────────────────────────────────────────────

describe("buildTrendRadarAnalysisPrompt", () => {
  it("应返回包含六个板块的提示词", () => {
    const prompt = buildTrendRadarAnalysisPrompt();
    expect(prompt).toContain("核心热点态势");
    expect(prompt).toContain("舆论风向争议");
    expect(prompt).toContain("异动与弱信号");
    expect(prompt).toContain("深度洞察");
    expect(prompt).toContain("研判策略建议");
    expect(prompt).toContain("市场影响评估");
  });

  it("应包含五大市场", () => {
    const prompt = buildTrendRadarAnalysisPrompt();
    expect(prompt).toContain("美股");
    expect(prompt).toContain("港股");
    expect(prompt).toContain("A股");
    expect(prompt).toContain("欧盟");
    expect(prompt).toContain("英国");
  });
});

// ─────────────────────────────────────────────
// 数据来源归因测试
// ─────────────────────────────────────────────

describe("buildSourceAttribution", () => {
  it("应生成数据来源标注字符串", () => {
    const attribution = buildSourceAttribution(["NewsAPI", "Marketaux", "金十数据"]);
    expect(attribution).toContain("数据来源");
    expect(attribution).toContain("NewsAPI");
    expect(attribution).toContain("Marketaux");
    expect(attribution).toContain("金十数据");
  });

  it("应去重重复来源", () => {
    const attribution = buildSourceAttribution(["NewsAPI", "NewsAPI", "Marketaux"]);
    const count = (attribution.match(/NewsAPI/g) || []).length;
    expect(count).toBe(1);
  });

  it("空数组应返回空字符串", () => {
    expect(buildSourceAttribution([])).toBe("");
  });
});
