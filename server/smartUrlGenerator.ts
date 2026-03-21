/**
 * smartUrlGenerator.ts
 * 根据任务内容 + 用户数据库域名，用 LLM 生成精确的目标 URL 列表
 * 例如：分析苹果 + xueqiu.com → https://xueqiu.com/S/AAPL
 */

import { invokeLLM } from "./_core/llm";

/**
 * 从用户数据库链接中提取域名列表
 */
export function extractDomains(urls: string[]): string[] {
  const domains: string[] = [];
  for (const url of urls) {
    try {
      const u = new URL(url);
      domains.push(u.hostname.replace(/^www\./, ""));
    } catch {
      // ignore invalid URLs
    }
  }
  const seen = new Set<string>();
  return domains.filter((d) => {
    if (seen.has(d)) return false;
    seen.add(d);
    return true;
  });
}

/**
 * 根据任务内容和用户数据库域名，生成精确的目标 URL 列表
 * 使用 LLM 推断每个域名下最相关的具体页面 URL
 */
export async function generatePreciseUrls(
  taskDescription: string,
  userLibraryUrls: string[],
  maxUrls = 8
): Promise<string[]> {
  if (userLibraryUrls.length === 0) return [];

  const domains = extractDomains(userLibraryUrls);
  if (domains.length === 0) return [];

  // 只取前 12 个域名，避免 prompt 过长
  const domainList = domains.slice(0, 12).join("\n");

  const prompt = `你是一个金融数据 URL 生成专家。根据以下任务内容，为每个数据源域名生成最相关的具体页面 URL。

【任务内容】
${taskDescription.slice(0, 500)}

【可用数据源域名】
${domainList}

【规则】
1. 只输出 JSON 数组，格式：["url1", "url2", ...]
2. 每个域名最多生成 1-2 个最相关的具体 URL（不是首页）
3. 总数不超过 ${maxUrls} 个
4. URL 必须是真实存在的页面格式（参考该网站的已知 URL 结构）
5. 如果某个域名与任务完全无关，跳过它
6. 不要生成需要登录才能访问的页面
7. 只输出 JSON，不要任何其他文字

【常见 URL 模式参考】
- xueqiu.com/S/AAPL → 雪球苹果股票页
- xueqiu.com/S/600519 → 雪球茅台股票页
- finance.yahoo.com/quote/AAPL → Yahoo Finance 苹果
- stockanalysis.com/stocks/aapl/ → Stock Analysis 苹果
- finviz.com/quote.ashx?t=AAPL → Finviz 苹果
- polymarket.com/markets → Polymarket 市场列表
- fred.stlouisfed.org/graph/?id=FEDFUNDS → FRED 联邦基金利率
- data.eastmoney.com/center/ → 东方财富数据中心
- tradingeconomics.com/united-states/interest-rate → Trading Economics 利率

输出 JSON 数组：`;

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "你是金融数据 URL 生成专家，只输出 JSON 数组，不输出任何其他内容。",
        },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "url_list",
          strict: true,
          schema: {
            type: "object",
            properties: {
              urls: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["urls"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response.choices?.[0]?.message?.content;
    const content = typeof rawContent === "string" ? rawContent : "{}";
    const parsed = JSON.parse(content);
    const urls: string[] = parsed.urls || [];

    // 过滤掉无效 URL
    return urls
      .filter((u: string) => {
        try {
          new URL(u);
          return true;
        } catch {
          return false;
        }
      })
      .slice(0, maxUrls);
  } catch {
    // LLM 失败时，直接返回用户数据库里的原始 URL（最多 maxUrls 个）
    return userLibraryUrls.slice(0, maxUrls);
  }
}
