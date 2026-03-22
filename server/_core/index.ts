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
