import { describe, it, expect } from "vitest";
import {
  shouldFetchGleif,
  formatGleifAsMarkdown,
  checkGleifHealth,
  type GleifResult,
} from "./gleifApi";

describe("GLEIF API — shouldFetchGleif", () => {
  it("should trigger on 'LEI' keyword", () => {
    expect(shouldFetchGleif("查询苹果公司的LEI编码")).toBe(true);
  });

  it("should trigger on '法人结构' keyword", () => {
    expect(shouldFetchGleif("分析这家公司的法人结构")).toBe(true);
  });

  it("should trigger on '母公司' keyword", () => {
    expect(shouldFetchGleif("这家公司的母公司是谁")).toBe(true);
  });

  it("should trigger on 'legal entity identifier' (case-insensitive)", () => {
    expect(shouldFetchGleif("What is the Legal Entity Identifier for HSBC")).toBe(true);
  });

  it("should trigger on 'parent company' keyword", () => {
    expect(shouldFetchGleif("Who is the parent company of this subsidiary")).toBe(true);
  });

  it("should trigger on 'gleif' keyword", () => {
    expect(shouldFetchGleif("Search GLEIF database for this company")).toBe(true);
  });

  it("should NOT trigger for unrelated financial query", () => {
    expect(shouldFetchGleif("分析苹果公司的股价走势和财务报表")).toBe(false);
  });

  it("should NOT trigger for general macro query", () => {
    expect(shouldFetchGleif("美联储加息对通胀的影响")).toBe(false);
  });
});

describe("GLEIF API — formatGleifAsMarkdown", () => {
  it("should return empty string for null result", () => {
    expect(formatGleifAsMarkdown(null as any)).toBe("");
  });

  it("should return empty string for empty entities", () => {
    const emptyResult: GleifResult = {
      entities: [],
      relationships: [],
      totalCount: 0,
      query: "test",
    };
    expect(formatGleifAsMarkdown(emptyResult)).toBe("");
  });

  it("should format entity info as Markdown table", () => {
    const mockResult: GleifResult = {
      entities: [
        {
          lei: "HWUPKR0MPOU8FGXBT394",
          legalName: "Apple Inc.",
          jurisdiction: "US-CA",
          legalForm: "CORP",
          registeredAddress: {
            addressLines: ["One Apple Park Way"],
            city: "Cupertino",
            country: "US",
            postalCode: "95014",
          },
          status: "ACTIVE",
          registrationStatus: "ISSUED",
          nextRenewalDate: "2025-12-31T00:00:00Z",
          lastUpdateDate: "2024-12-01T00:00:00Z",
        },
      ],
      relationships: [],
      totalCount: 1,
      query: "Apple Inc",
    };

    const md = formatGleifAsMarkdown(mockResult);
    expect(md).toContain("GLEIF");
    expect(md).toContain("HWUPKR0MPOU8FGXBT394");
    expect(md).toContain("Apple Inc.");
    expect(md).toContain("US-CA");
    expect(md).toContain("ACTIVE");
    expect(md).toContain("LEI 编码");
  });

  it("should include parent relationship if present", () => {
    const mockResult: GleifResult = {
      entities: [
        {
          lei: "TEST123456789",
          legalName: "Test Subsidiary Corp",
          jurisdiction: "US-DE",
          legalForm: "CORP",
          registeredAddress: {
            addressLines: ["123 Main St"],
            city: "Wilmington",
            country: "US",
          },
          status: "ACTIVE",
          registrationStatus: "ISSUED",
        },
      ],
      relationships: [
        {
          parentLei: "PARENTLEI12345",
          parentName: "Parent Holding Corp",
          childLei: "TEST123456789",
          relationshipType: "IS_DIRECTLY_CONSOLIDATED_BY",
        },
      ],
      totalCount: 1,
      query: "Test Subsidiary",
    };

    const md = formatGleifAsMarkdown(mockResult);
    expect(md).toContain("法人结构关系");
    expect(md).toContain("直接母公司");
    expect(md).toContain("Parent Holding Corp");
  });
});

describe("GLEIF API — checkGleifHealth", () => {
  it("should return ok status for live API", async () => {
    const result = await checkGleifHealth();
    // GLEIF 是免费公开 API，正常情况下应返回 ok
    expect(["ok", "error"]).toContain(result.status);
    expect(typeof result.latencyMs).toBe("number");
  }, 10000);
});
