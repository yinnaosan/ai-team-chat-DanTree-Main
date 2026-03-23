/**
 * newsApi.test.ts
 * 测试 extractNewsQuery 函数的精细化关键词提取逻辑
 */

import { describe, it, expect } from "vitest";
import { extractNewsQuery } from "./newsApi";

describe("extractNewsQuery — A 股 ticker 识别", () => {
  it("应识别贵州茅台 600519", () => {
    const q = extractNewsQuery("分析 600519 贵州茅台的估值");
    expect(q).toContain("Kweichow Moutai");
  });

  it("应识别宁德时代 300750", () => {
    const q = extractNewsQuery("300750 宁德时代最新动态");
    expect(q).toContain("CATL");
  });

  it("应识别中芯国际 688981", () => {
    const q = extractNewsQuery("688981 中芯国际芯片产能");
    expect(q).toContain("SMIC");
  });

  it("应识别未知 A 股 ticker", () => {
    const q = extractNewsQuery("请分析 600001 的走势");
    expect(q).toContain("China A-share");
    expect(q).toContain("600001");
  });
});

describe("extractNewsQuery — 港股 ticker 识别", () => {
  it("应识别腾讯 00700", () => {
    const q = extractNewsQuery("00700 腾讯控股最新财报");
    expect(q).toContain("Tencent");
  });

  it("应识别小米 01810", () => {
    const q = extractNewsQuery("01810 小米集团股价分析");
    expect(q).toContain("Xiaomi");
  });

  it("应识别未知港股 ticker", () => {
    const q = extractNewsQuery("02888 的走势如何");
    expect(q).toContain("Hong Kong stock");
  });
});

describe("extractNewsQuery — 英文 ticker 识别", () => {
  it("应识别 AAPL", () => {
    const q = extractNewsQuery("Analyze AAPL stock performance");
    expect(q).toBe("AAPL stock news");
  });

  it("应识别 TSLA", () => {
    const q = extractNewsQuery("TSLA earnings report");
    expect(q).toBe("TSLA stock news");
  });

  it("应跳过黑名单 GDP", () => {
    const q = extractNewsQuery("中国 GDP 增速放缓");
    // 不应返回 GDP stock news，应匹配中文宏观关键词
    expect(q).not.toBe("GDP stock news");
    expect(q).not.toBeNull();
  });

  it("应跳过黑名单 CPI", () => {
    const q = extractNewsQuery("美国 CPI 数据超预期");
    expect(q).not.toBe("CPI stock news");
  });

  it("应跳过黑名单 ETF", () => {
    const q = extractNewsQuery("买入 ETF 基金");
    expect(q).not.toBe("ETF stock news");
  });
});

describe("extractNewsQuery — 中文公司名识别", () => {
  it("应识别茅台", () => {
    const q = extractNewsQuery("茅台今年业绩如何？");
    expect(q).toContain("Kweichow Moutai");
  });

  it("应识别比亚迪", () => {
    const q = extractNewsQuery("比亚迪新能源汽车销量");
    expect(q).toContain("BYD");
  });

  it("应识别腾讯（中文）", () => {
    const q = extractNewsQuery("腾讯游戏收入下滑");
    expect(q).toContain("Tencent");
  });

  it("应识别宁德时代（中文）", () => {
    const q = extractNewsQuery("宁德时代电池技术突破");
    expect(q).toContain("CATL");
  });

  it("应识别招商银行", () => {
    const q = extractNewsQuery("招商银行净利润增长");
    expect(q).toContain("China Merchants Bank");
  });

  it("应识别中国平安", () => {
    const q = extractNewsQuery("中国平安保险业务");
    expect(q).toContain("Ping An Insurance");
  });

  it("应识别隆基绿能", () => {
    const q = extractNewsQuery("隆基绿能光伏组件出货量");
    expect(q).toContain("LONGi");
  });

  it("应识别万科", () => {
    const q = extractNewsQuery("万科房地产债务问题");
    expect(q).toContain("Vanke");
  });

  it("应识别华为", () => {
    const q = extractNewsQuery("华为 5G 芯片突破");
    expect(q).toContain("Huawei");
  });

  it("应识别蔚来", () => {
    const q = extractNewsQuery("蔚来汽车交付量");
    expect(q).toContain("NIO");
  });
});

describe("extractNewsQuery — 行业关键词识别", () => {
  it("应识别新能源行业", () => {
    const q = extractNewsQuery("新能源板块今日大涨");
    expect(q).toContain("new energy");
  });

  it("应识别半导体行业", () => {
    const q = extractNewsQuery("半导体行业景气度分析");
    expect(q).toContain("semiconductor");
  });

  it("应识别医药行业", () => {
    const q = extractNewsQuery("创新药审批进展");
    expect(q).toContain("pharma");
  });

  it("应识别加密货币", () => {
    const q = extractNewsQuery("比特币价格突破 10 万美元");
    expect(q).toContain("Bitcoin");
  });
});

describe("extractNewsQuery — 宏观事件识别", () => {
  it("应识别降准", () => {
    const q = extractNewsQuery("央行宣布降准 0.5 个百分点");
    expect(q).toContain("PBOC");
  });

  it("应识别美联储", () => {
    const q = extractNewsQuery("美联储加息预期");
    expect(q).toContain("Federal Reserve");
  });

  it("应识别贸易战", () => {
    const q = extractNewsQuery("中美贸易战关税升级");
    expect(q).toContain("trade war");
  });

  it("应识别人民币汇率", () => {
    const q = extractNewsQuery("人民币兑美元汇率走势");
    expect(q).toContain("yuan");
  });

  it("应识别恒生指数", () => {
    const q = extractNewsQuery("恒生指数今日跌幅");
    expect(q).toContain("Hang Seng");
  });
});

describe("extractNewsQuery — 英文关键词识别", () => {
  it("应识别 inflation", () => {
    const q = extractNewsQuery("US inflation data released today");
    expect(q).toContain("inflation");
  });

  it("应识别 interest rate", () => {
    const q = extractNewsQuery("interest rate hike expected");
    expect(q).toContain("interest rate");
  });

  it("应识别 electric vehicle", () => {
    const q = extractNewsQuery("electric vehicle market share growing");
    expect(q).toContain("electric vehicle");
  });

  it("应识别 bitcoin", () => {
    const q = extractNewsQuery("bitcoin price analysis");
    expect(q).toContain("Bitcoin");
  });
});

describe("extractNewsQuery — 无匹配返回 null", () => {
  it("纯问候语应返回 null", () => {
    const q = extractNewsQuery("你好，请问今天天气怎么样？");
    expect(q).toBeNull();
  });

  it("无关文本应返回 null", () => {
    const q = extractNewsQuery("帮我写一首诗");
    expect(q).toBeNull();
  });
});
