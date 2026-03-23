/**
 * TrendRadar 算法增强模块
 * 移植 TrendRadar 的核心算法到 TypeScript：
 * 1. 新闻权重评分（排名×0.4 + 频次×0.3 + 热度×0.3）
 * 2. 跨平台共振检测（同一话题在多少源出现）
 * 3. 全局过滤词（标题党/营销软文正则过滤）
 * 4. 六板块结构化分析提示词生成
 */

// ─────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────

export interface NewsItem {
  title: string;
  source: string;       // 来源名称（如 "NewsAPI", "Marketaux", "金十数据"）
  url?: string;
  publishedAt?: string;
  description?: string;
  rank?: number;        // 在该来源中的排名（1 = 最靠前）
  count?: number;       // 在多个来源中出现的次数（跨平台共振）
}

export interface WeightedNewsItem extends NewsItem {
  weight: number;       // 综合权重分
  resonanceScore: number; // 跨平台共振分（0-1）
  isHighResonance: boolean; // 是否跨平台共振（3+ 源）
}

export interface ResonanceGroup {
  topic: string;         // 话题关键词
  sources: string[];     // 出现的来源列表
  items: NewsItem[];     // 相关新闻条目
  resonanceLevel: "全网霸屏" | "破圈扩散" | "圈层热点";
}

// ─────────────────────────────────────────────
// 全局过滤词（移植自 TrendRadar frequency_words.txt）
// ─────────────────────────────────────────────

const GLOBAL_FILTER_PATTERNS: RegExp[] = [
  // 标题党
  /震惊|竟然|太可怕了|刚刚！|突发！|重磅！|紧急！/i,
  /不敢相信|你绝对想不到|看完沉默了/i,
  // 营销软文
  /限时优惠|立即购买|点击领取|扫码关注|免费领取/i,
  /私信我|加微信|加V|加wx/i,
  // 低质量内容
  /广告|推广|赞助|合作|植入/i,
  // 娱乐八卦（投资无关）
  /明星出轨|离婚|劈腿|出轨|塌房/i,
];

/**
 * 检查新闻标题是否应被全局过滤
 */
export function shouldFilterNews(title: string): boolean {
  const titleLower = title.toLowerCase();
  return GLOBAL_FILTER_PATTERNS.some((pattern) => pattern.test(titleLower));
}

/**
 * 过滤新闻列表，移除低质量内容
 */
export function filterLowQualityNews(items: NewsItem[]): NewsItem[] {
  return items.filter((item) => !shouldFilterNews(item.title));
}

// ─────────────────────────────────────────────
// 新闻权重评分（移植自 TrendRadar calculate_news_weight）
// ─────────────────────────────────────────────

const WEIGHT_CONFIG = {
  RANK_WEIGHT: 0.4,
  FREQUENCY_WEIGHT: 0.3,
  HOTNESS_WEIGHT: 0.3,
  RANK_THRESHOLD: 5, // 高位排名阈值
};

/**
 * 计算单条新闻的综合权重
 * - rank_weight: 排名越靠前分越高（11 - min(rank, 10)）
 * - frequency_weight: 出现频次越高分越高（min(count, 10) × 10）
 * - hotness_weight: 高位排名占比 × 100
 */
export function calculateNewsWeight(item: NewsItem): number {
  const rank = item.rank ?? 10;
  const count = item.count ?? 1;

  // 排名权重：11 - min(rank, 10)，排名1=10分，排名10+=1分
  const rankScore = 11 - Math.min(rank, 10);

  // 频次权重：min(count, 10) × 10
  const frequencyWeight = Math.min(count, 10) * 10;

  // 热度加成：是否在高位排名（rank <= threshold）
  const isHighRank = rank <= WEIGHT_CONFIG.RANK_THRESHOLD;
  const hotnessWeight = isHighRank ? 100 : 0;

  const totalWeight =
    rankScore * WEIGHT_CONFIG.RANK_WEIGHT +
    frequencyWeight * WEIGHT_CONFIG.FREQUENCY_WEIGHT +
    hotnessWeight * WEIGHT_CONFIG.HOTNESS_WEIGHT;

  return Math.round(totalWeight * 100) / 100;
}

/**
 * 对新闻列表按权重排序
 */
export function sortNewsByWeight(items: NewsItem[]): WeightedNewsItem[] {
  return items
    .map((item) => ({
      ...item,
      weight: calculateNewsWeight(item),
      resonanceScore: 0,
      isHighResonance: false,
    }))
    .sort((a, b) => b.weight - a.weight);
}

// ─────────────────────────────────────────────
// 跨平台共振检测（移植自 TrendRadar 跨平台分析逻辑）
// ─────────────────────────────────────────────

/**
 * 提取新闻标题中的关键词（简化版，取前3个实词）
 */
function extractKeywords(title: string): string[] {
  // 移除常见停用词
  const stopWords = new Set([
    "的", "了", "在", "是", "和", "与", "或", "对", "为", "以", "等",
    "将", "已", "被", "由", "从", "到", "中", "上", "下", "不", "有",
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought",
    "used", "to", "of", "in", "on", "at", "by", "for", "with", "about",
    "against", "between", "into", "through", "during", "before", "after",
    "above", "below", "from", "up", "down", "out", "off", "over", "under",
    "again", "further", "then", "once",
  ]);

  // 英文按空格分词
  const englishWords = title
    .replace(/[\u4e00-\u9fff]/g, " ") // 移除中文部分
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w.toLowerCase()));

  // 中文按 bigram（2字组合）切分，提升关键词匹配率
  const chineseChars = title.match(/[\u4e00-\u9fff]/g) ?? [];
  const chineseBigrams: string[] = [];
  for (let i = 0; i < chineseChars.length - 1; i++) {
    const bigram = chineseChars[i] + chineseChars[i + 1];
    if (!stopWords.has(bigram)) {
      chineseBigrams.push(bigram);
    }
  }

  const allWords = [...englishWords, ...chineseBigrams];
  return allWords.slice(0, 10);
}

/**
 * 计算两个标题的相似度（基于关键词重叠）
 */
function titleSimilarity(title1: string, title2: string): number {
  const kw1 = new Set(extractKeywords(title1.toLowerCase()));
  const kw2 = new Set(extractKeywords(title2.toLowerCase()));

  if (kw1.size === 0 || kw2.size === 0) return 0;

  let overlap = 0;
  kw1.forEach((kw) => {
    if (kw2.has(kw)) overlap++;
  });

  return overlap / Math.max(kw1.size, kw2.size);
}

/**
 * 检测跨平台共振话题
 * 找出在多个来源中同时出现的话题
 */
export function detectCrossSourceResonance(items: NewsItem[]): {
  resonanceGroups: ResonanceGroup[];
  enhancedItems: WeightedNewsItem[];
} {
  const groups: Map<string, { items: NewsItem[]; sources: Set<string> }> =
    new Map();

  // 对每条新闻，检查是否与已有分组相似
  for (const item of items) {
    let matched = false;

    for (const [topic, group] of Array.from(groups.entries())) {
      // 检查与分组代表标题的相似度
      const representative = group.items[0];
      const similarity = titleSimilarity(item.title, representative.title);

      if (similarity >= 0.3) {
        // 30% 关键词重叠即视为同一话题
        group.items.push(item);
        group.sources.add(item.source);
        matched = true;
        break;
      }
    }

    if (!matched) {
      // 创建新分组，以标题前20字作为 topic key
      const topicKey = item.title.slice(0, 20);
      groups.set(topicKey, {
        items: [item],
        sources: new Set([item.source]),
      });
    }
  }

  // 构建共振分组结果
  const resonanceGroups: ResonanceGroup[] = [];
  const topicToSources: Map<string, string[]> = new Map();

  for (const [topic, group] of Array.from(groups.entries())) {
    const sourceCount = group.sources.size;
    if (sourceCount >= 2) {
      // 至少 2 个来源才算共振
      let resonanceLevel: ResonanceGroup["resonanceLevel"];
      if (sourceCount >= 5) {
        resonanceLevel = "全网霸屏";
      } else if (sourceCount >= 3) {
        resonanceLevel = "破圈扩散";
      } else {
        resonanceLevel = "圈层热点";
      }

      resonanceGroups.push({
        topic,
        sources: Array.from(group.sources),
        items: group.items,
        resonanceLevel,
      });

      topicToSources.set(topic, Array.from(group.sources));
    }
  }

  // 排序：共振来源数越多越靠前
  resonanceGroups.sort((a, b) => b.sources.length - a.sources.length);

  // 增强原始 items，添加共振分数
  const enhancedItems: WeightedNewsItem[] = items.map((item) => {
    const weight = calculateNewsWeight(item);

    // 查找该 item 所属的共振分组
    let resonanceScore = 0;
    let isHighResonance = false;

    for (const group of resonanceGroups) {
      if (group.items.some((g) => g.title === item.title)) {
        resonanceScore = group.sources.length / 10; // 归一化到 0-1
        isHighResonance = group.sources.length >= 3;
        break;
      }
    }

    return {
      ...item,
      weight: weight + resonanceScore * 20, // 共振加分
      resonanceScore,
      isHighResonance,
    };
  });

  // 按最终权重排序
  enhancedItems.sort((a, b) => b.weight - a.weight);

  return { resonanceGroups, enhancedItems };
}

// ─────────────────────────────────────────────
// 六板块结构化分析提示词（移植自 TrendRadar ai_analysis_prompt.txt）
// ─────────────────────────────────────────────

/**
 * 生成 TrendRadar 风格的六板块分析系统提示词
 * 用于增强 Step3 的 AI 新闻分析质量
 */
export function buildTrendRadarAnalysisPrompt(): string {
  return `你是一位专业的金融市场新闻分析师，擅长从多源新闻中提取投资信号。

## 分析框架（六板块，移植自 TrendRadar）

请按以下六个板块组织你的新闻分析，每个板块聚焦不同维度：

### 1. 核心热点态势（core_trends）
整合趋势概述、热度走势、跨平台关联。
- 提炼共性与定性，寻找不同新闻背后的底层逻辑或共性叙事
- 判断热度性质：全网霸屏（5+来源）/ 破圈扩散（3-4来源）/ 圈层热点（1-2来源）
- 用"宏观主线+微观佐证"的结构，将散点信息串联成逻辑链条

### 2. 舆论风向争议（sentiment_controversy）
绘制情绪光谱，识别"舆论断层"：
- 专业机构 vs 散户情绪的分歧
- 中文媒体 vs 英文媒体的视角差异
- 识别是"利益之争"（资金流向）还是"认知之争"（估值分歧）

### 3. 异动与弱信号（signals）
捕捉时间轴和空间轴上的异常波动：
- 跨平台共振：某话题在中文财经媒体和英文媒体同时爆发
- 平台温差：某话题在 A 股媒体火但在美股媒体冷（或反之）
- 弱信号：尚未引爆但极具价值的早期行业信号

### 4. 深度洞察（rss_insights）
寻找信息增量，去重补盲：
- 果断忽略与主流媒体高度雷同的内容
- 挖掘热点未覆盖的硬核细节（技术参数、深度行研、监管细节）
- 识别可能尚未引爆但极具价值的早期信号

### 5. 研判策略建议（outlook_strategy）
预测与推演，给出具体行动建议：
- 后续推演：事件的下一阶段（是否会反转？监管是否介入？）
- 行动指南：针对不同角色（投资者/交易者/风控）的具体建议
- 严禁使用"建议持续关注"等无意义的废话

### 6. 市场影响评估（market_impact）
量化评估对五大市场的潜在影响：
- 美股 / 港股 / A股 / 欧盟 / 英国
- 影响方向（正面/负面/中性）+ 影响程度（高/中/低）
- 受影响的具体板块或个股

## 输出要求
- 使用中文，语言简练专业
- 各板块内容不重叠不冗余
- 若某板块无明显内容，可简写"暂无显著异常"
- 在回复底部追加数据来源标注`;
}

/**
 * 构建新闻摘要块，供 AI 分析使用
 * 包含权重排序 + 跨平台共振信息
 */
export function buildEnhancedNewsBlock(
  items: NewsItem[],
  maxItems: number = 20
): string {
  if (items.length === 0) return "";

  // 1. 过滤低质量内容
  const filtered = filterLowQualityNews(items);

  // 2. 检测跨平台共振
  const { resonanceGroups, enhancedItems } = detectCrossSourceResonance(filtered);

  // 3. 取权重最高的 N 条
  const topItems = enhancedItems.slice(0, maxItems);

  let block = "";

  // 跨平台共振摘要
  if (resonanceGroups.length > 0) {
    const highResonance = resonanceGroups.filter(
      (g) => g.resonanceLevel !== "圈层热点"
    );
    if (highResonance.length > 0) {
      block += `\n【跨平台共振话题】\n`;
      highResonance.slice(0, 5).forEach((g) => {
        block += `- ${g.resonanceLevel}：${g.topic}（${g.sources.join("/")}）\n`;
      });
      block += "\n";
    }
  }

  // 权重排序新闻列表
  block += `【新闻列表（按权重排序，共 ${topItems.length} 条）】\n`;
  topItems.forEach((item, idx) => {
    const resonanceTag = item.isHighResonance ? " 🔥" : "";
    const source = item.source ? ` [${item.source}]` : "";
    const time = item.publishedAt
      ? ` (${new Date(item.publishedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit" })})`
      : "";
    block += `${idx + 1}. ${item.title}${resonanceTag}${source}${time}\n`;
    if (item.description) {
      block += `   摘要：${item.description.slice(0, 100)}...\n`;
    }
  });

  return block;
}

/**
 * 生成新闻来源归因标注（用于 AI 回复底部）
 */
export function buildSourceAttribution(sources: string[]): string {
  if (sources.length === 0) return "";
  const uniqueSources = Array.from(new Set(sources));
  return `\n---\n📊 数据来源：${uniqueSources.join(" / ")}`;
}
