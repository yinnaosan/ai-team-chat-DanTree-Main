/**
 * 验证所有金融 API Key 已正确注入到环境变量
 * 这些 Key 通过 webdev_request_secrets 注入，必须在 ENV 对象中可读
 */
import { describe, it, expect } from "vitest";
import { ENV } from "./_core/env";

describe("API Key 环境变量注入验证", () => {
  const requiredKeys: Array<keyof typeof ENV> = [
    "FINNHUB_API_KEY",
    "FMP_API_KEY",
    "ALPHA_VANTAGE_API_KEY",
    "COINGECKO_API_KEY",
    "FRED_API_KEY",
    "NEWS_API_KEY",
    "MARKETAUX_API_KEY",
    "SIMFIN_API_KEY",
    "TIINGO_API_KEY",
    "CONGRESS_API_KEY",
    "COURTLISTENER_API_KEY",
    "TAVILY_API_KEY",
    "TAVILY_API_KEY_2",
    "TAVILY_API_KEY_3",
    "TAVILY_API_KEY_4",
  ];

  for (const key of requiredKeys) {
    it(`${key} 应有非空值`, () => {
      const val = ENV[key] as string;
      expect(val, `${key} is empty — 请通过 webdev_request_secrets 注入此 Key`).toBeTruthy();
      expect(val.length).toBeGreaterThan(8);
    });
  }

  it("POLYGON_API_KEY 应有非空值（403 是权限问题，Key 本身有效）", () => {
    const val = ENV.POLYGON_API_KEY;
    expect(val).toBeTruthy();
    expect(val.length).toBeGreaterThan(8);
  });
});
