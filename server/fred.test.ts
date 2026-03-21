import { describe, it, expect } from "vitest";

describe("FRED API Key validation", () => {
  it("should fetch CPI data from FRED API", async () => {
    const apiKey = process.env.FRED_API_KEY;
    expect(apiKey).toBeTruthy();

    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=CPIAUCSL&api_key=${apiKey}&limit=1&sort_order=desc&file_type=json`;
    const res = await fetch(url);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty("observations");
    expect(data.observations.length).toBeGreaterThan(0);
    console.log("FRED CPI latest:", data.observations[0]);
  }, 15000);
});
