import { describe, it, expect } from "vitest";

describe("Serper API Key validation", () => {
  const keys = [
    { name: "SERPER_API_KEY", value: process.env.SERPER_API_KEY || "fd00fed2c50e13d7e63979ad916c9bb52250af1d" },
    { name: "SERPER_API_KEY_2", value: process.env.SERPER_API_KEY_2 || "7d5ec70b47c60ddd093515d7970fe68de1715ee2" },
    { name: "SERPER_API_KEY_3", value: process.env.SERPER_API_KEY_3 || "58dbca508a4db758bf2d0c69f05c7c6204c93635" },
  ];

  for (const { name, value } of keys) {
    it(`${name} should return valid search results`, async () => {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": value,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: "test", num: 1 }),
        signal: AbortSignal.timeout(10000),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.organic).toBeDefined();
      expect(Array.isArray(data.organic)).toBe(true);
    }, 15000);
  }
});
