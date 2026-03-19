/**
 * ChatGPT 反向代理路由
 * 将 /api/chatgpt-proxy/* 的请求转发到 chatgpt.com，
 * 并移除 X-Frame-Options / CSP frame-ancestors 头，使 iframe 可以嵌入。
 */
import { Router } from "express";
import { createProxyMiddleware, responseInterceptor } from "http-proxy-middleware";

export const chatgptProxyRouter = Router();

chatgptProxyRouter.use(
  "/api/chatgpt-proxy",
  createProxyMiddleware({
    target: "https://chatgpt.com",
    changeOrigin: true,
    selfHandleResponse: true,
    pathRewrite: { "^/api/chatgpt-proxy": "" },
    on: {
      proxyReq: (proxyReq, req) => {
        // Forward cookies so the user's session is preserved
        if (req.headers.cookie) {
          proxyReq.setHeader("cookie", req.headers.cookie);
        }
        // Spoof Referer / Origin to avoid bot detection
        proxyReq.setHeader("referer", "https://chatgpt.com/");
        proxyReq.setHeader("origin", "https://chatgpt.com");
      },
      proxyRes: responseInterceptor(async (responseBuffer, proxyRes) => {
        // Strip headers that block iframe embedding
        delete proxyRes.headers["x-frame-options"];
        delete proxyRes.headers["content-security-policy"];
        delete proxyRes.headers["content-security-policy-report-only"];

        // Rewrite absolute URLs in HTML so relative links still work through proxy
        const contentType = proxyRes.headers["content-type"] || "";
        if (contentType.includes("text/html")) {
          let html = responseBuffer.toString("utf8");
          // Rewrite absolute paths to go through proxy
          html = html.replace(/https:\/\/chatgpt\.com\//g, "/api/chatgpt-proxy/");
          return html;
        }
        return responseBuffer;
      }),
    },
  })
);
