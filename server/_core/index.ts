import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { uploadRouter } from "../upload";
import { chatgptProxyRouter } from "../chatgptProxy";
import { taskStreamRouter } from "../taskStream";
import { tickerStreamRouter } from "../tickerWs";
import { checkHealth as checkFinnhubHealth } from "../finnhubApi";
import { checkHealth as checkFmpHealth } from "../fmpApi";
import { checkHealth as checkPolygonHealth } from "../polygonApi";
import { checkHealth as checkAVHealth } from "../alphaVantageApi";
import { checkHealth as checkSecHealth } from "../secEdgarApi";
import { checkNewsApiHealth } from "../newsApi";
import { checkMarketauxHealth } from "../marketauxApi";
import { checkECBHealth } from "../ecbApi";
import { checkHKEXHealth } from "../hkexApi";
import { checkBoeHealth } from "../boeApi";
import { checkHkmaHealth } from "../hkmaApi";
import { checkGleifHealth } from "../gleifApi";
import { checkImfApiHealth } from "../imfApi";
import { ENV } from "./env";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // File upload API
  app.use(uploadRouter);
  // ChatGPT reverse proxy (strips X-Frame-Options for iframe embedding)
  app.use(chatgptProxyRouter);
  // SSE task stream (real-time push, replaces polling)
  app.use(taskStreamRouter);
  // Finnhub real-time ticker SSE stream
  app.use(tickerStreamRouter);
  // 健康检测诊断端点（直接调用 checkHealth 函数，无需认证）
  app.get("/api/health-diag", async (_req, res) => {
    const withTimeout = <T>(p: Promise<T>, fallback: T, ms = 10000): Promise<T> =>
      Promise.race([p, new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms))]);
    const t0 = Date.now();
    const [finnhub, fmp, polygon, av, sec, newsApi, marketaux, ecb, hkex, boe, hkma, gleif, imf] = await Promise.allSettled([
      withTimeout(checkFinnhubHealth().then((r: { ok: boolean; detail: string; latencyMs: number }) => ({ ok: r.ok, detail: r.detail, ms: r.latencyMs })), { ok: false, detail: 'TIMEOUT', ms: 10000 }),
      withTimeout(checkFmpHealth().then((r: { ok: boolean; detail: string; latencyMs: number }) => ({ ok: r.ok, detail: r.detail, ms: r.latencyMs })), { ok: false, detail: 'TIMEOUT', ms: 10000 }),
      withTimeout(checkPolygonHealth().then((r: { ok: boolean; detail: string; latencyMs: number }) => ({ ok: r.ok, detail: r.detail, ms: r.latencyMs })), { ok: false, detail: 'TIMEOUT', ms: 10000 }),
      withTimeout(checkAVHealth().then((r: { ok: boolean; detail: string; latencyMs: number }) => ({ ok: r.ok, detail: r.detail, ms: r.latencyMs })), { ok: false, detail: 'TIMEOUT', ms: 10000 }),
      withTimeout(checkSecHealth().then((r: { ok: boolean; detail: string; latencyMs: number }) => ({ ok: r.ok, detail: r.detail, ms: r.latencyMs })), { ok: false, detail: 'TIMEOUT', ms: 10000 }),
      withTimeout(checkNewsApiHealth().then((ok: boolean) => ({ ok, detail: ok ? 'ok' : 'fail', ms: 0 })), { ok: false, detail: 'TIMEOUT', ms: 10000 }),
      withTimeout(checkMarketauxHealth().then((ok: boolean) => ({ ok, detail: ok ? 'ok' : 'fail', ms: 0 })), { ok: false, detail: 'TIMEOUT', ms: 10000 }),
      withTimeout(checkECBHealth().then((r: { ok: boolean; detail: string; latencyMs: number }) => ({ ok: r.ok, detail: r.detail, ms: r.latencyMs })), { ok: false, detail: 'TIMEOUT', ms: 10000 }),
      withTimeout(checkHKEXHealth().then((r: { ok: boolean; detail: string; latencyMs: number }) => ({ ok: r.ok, detail: r.detail, ms: r.latencyMs })), { ok: false, detail: 'TIMEOUT', ms: 10000 }),
      withTimeout(checkBoeHealth().then((r: { status: string; latency?: number }) => ({ ok: r.status === 'ok', detail: r.status, ms: r.latency ?? 0 })), { ok: false, detail: 'error', ms: 10000 }),
      withTimeout(checkHkmaHealth().then((r: { status: string; latency?: number }) => ({ ok: r.status === 'ok', detail: r.status, ms: r.latency ?? 0 })), { ok: false, detail: 'error', ms: 10000 }),
      withTimeout(checkGleifHealth().then((r: { status: string; latencyMs?: number }) => ({ ok: r.status === 'ok', detail: r.status, ms: r.latencyMs ?? 0 })), { ok: false, detail: 'TIMEOUT', ms: 10000 }),
      withTimeout(checkImfApiHealth().then((r: { status: string; latencyMs?: number }) => ({ ok: r.status === 'active', detail: r.status, ms: r.latencyMs ?? 0 })), { ok: false, detail: 'TIMEOUT', ms: 10000 }),
    ]);
    const fmt = (r: PromiseSettledResult<{ok:boolean;detail:string;ms:number}>) =>
      r.status === 'fulfilled' ? r.value : { ok: false, detail: String((r as PromiseRejectedResult).reason), ms: -1 };
    res.json({
      env: process.env.NODE_ENV,
      totalMs: Date.now() - t0,
      envKeys: {
        FINNHUB: !!ENV.FINNHUB_API_KEY,
        FMP: !!ENV.FMP_API_KEY,
        POLYGON: !!ENV.POLYGON_API_KEY,
        AV: !!ENV.ALPHA_VANTAGE_API_KEY,
        NEWS_API: !!ENV.NEWS_API_KEY,
        MARKETAUX: !!ENV.MARKETAUX_API_KEY,
      },
      results: {
        finnhub: fmt(finnhub),
        fmp: fmt(fmp),
        polygon: fmt(polygon),
        alphaVantage: fmt(av),
        secEdgar: fmt(sec),
        newsApi: fmt(newsApi),
        marketaux: fmt(marketaux),
        ecb: fmt(ecb),
        hkex: fmt(hkex),
        boe: fmt(boe),
        hkma: fmt(hkma),
        gleif: fmt(gleif),
        imf: fmt(imf),
      },
    });
  });
  // 网络连通性测试端点（用于诊断生产环境是否能访问外部 API）
  app.get("/api/net-test", async (_req, res) => {
    const tests = [
      { name: "Finnhub", url: "https://finnhub.io/api/v1/quote?symbol=AAPL&token=d6v2ughr01qig546bblgd6v2ughr01qig546bbm0" },
      { name: "FMP", url: "https://financialmodelingprep.com/stable/quote?symbol=AAPL&apikey=i58yYDwWrdmyuftiynHvKBg3CZ1t6Zgd" },
      { name: "FRED", url: "https://api.stlouisfed.org/fred/series?series_id=FEDFUNDS&api_key=fc90d7149fbff8a90993d1a4d0829ba4&file_type=json" },
      { name: "Yahoo", url: "https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=1d" },
    ];
    const results: Record<string, unknown> = {};
    await Promise.all(tests.map(async ({ name, url }) => {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
        results[name] = { status: r.status, ok: r.ok };
      } catch (e: unknown) {
        results[name] = { error: e instanceof Error ? e.message : String(e) };
      }
    }));
    res.json({ env: process.env.NODE_ENV, results });
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
