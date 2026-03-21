import { describe, it, expect } from "vitest";
import { fetchECBData, formatECBDataAsMarkdown, checkECBHealth, isECBRelevantTask } from "./ecbApi";

describe("ECB API", () => {
  let ecbData: Awaited<ReturnType<typeof fetchECBData>>;

  it("should fetch ECB data without error", async () => {
    ecbData = await fetchECBData();
    expect(ecbData).toBeDefined();
    expect(typeof ecbData).toBe("object");
  }, 30000);

  it("should have interest rates data", () => {
    if (!ecbData) return;
    expect(ecbData.interestRates).toBeDefined();
    expect(typeof ecbData.interestRates).toBe("object");
  });

  it("should have exchange rates data", () => {
    if (!ecbData) return;
    expect(ecbData.exchangeRates).toBeDefined();
    expect(typeof ecbData.exchangeRates).toBe("object");
  });

  it("should format data as markdown", () => {
    if (!ecbData) return;
    const md = formatECBDataAsMarkdown(ecbData);
    expect(typeof md).toBe("string");
    expect(md.length).toBeGreaterThan(50);
    expect(md).toContain("ECB");
  });

  it("should detect ECB-relevant tasks", () => {
    expect(isECBRelevantTask("欧元区通胀分析")).toBe(true);
    expect(isECBRelevantTask("ECB利率决议")).toBe(true);
    expect(isECBRelevantTask("欧洲央行货币政策")).toBe(true);
    expect(isECBRelevantTask("苹果公司股票分析")).toBe(false);
    expect(isECBRelevantTask("比特币价格")).toBe(false);
  });

  it("should pass health check", async () => {
    const health = await checkECBHealth();
    expect(health).toBeDefined();
    expect(typeof health.ok).toBe("boolean");
    expect(typeof health.latencyMs).toBe("number");
    expect(typeof health.detail).toBe("string");
  }, 20000);
});
