/**
 * SSE 任务流推送中心
 *
 * 架构：
 * - 内存 EventEmitter 作为广播总线（进程内，无需 Redis）
 * - 每个 taskId 对应一个频道，前端订阅 /api/task-stream/:taskId
 * - 服务端在 updateTaskStatus / updateMessageContent 时调用 emit 推送事件
 * - 前端用 EventSource 替代轮询，延迟从 500ms 降到近实时
 *
 * 事件类型：
 * - "status"  : { status, manusResult?, streamMsgId? }  任务阶段变化
 * - "chunk"   : { msgId, content }                      流式内容增量（每 300ms 批量）
 * - "done"    : { msgId, content }                      任务完成，最终内容
 * - "error"   : { message }                             任务失败
 *
 * 超时机制（P0 防卡）：
 * - 每个 SSE 连接有 300s 最大生命周期（防止任务卡死时前端永久 loading）
 * - 超时后发送 error 事件，前端显示可读错误信息
 */

import { EventEmitter } from "events";
import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";

// ── 广播总线 ──────────────────────────────────────────────────────────────────
const bus = new EventEmitter();
bus.setMaxListeners(200); // 支持最多 200 个并发 SSE 连接

// ── 超时配置 ──────────────────────────────────────────────────────────────────
const SSE_MAX_LIFETIME_MS = 300_000; // 300s 最大生命周期（防止任务卡死）

// ── 类型定义 ──────────────────────────────────────────────────────────────────
export type TaskStreamEvent =
  | { type: "status"; status: string; manusResult?: string; streamMsgId?: number }
  | { type: "chunk"; msgId: number; content: string }
  | { type: "done"; msgId: number; content: string }
  | { type: "error"; message: string };

// ── 服务端广播 API（在 routers.ts 中调用） ────────────────────────────────────

/** 广播任务状态变化 */
export function emitTaskStatus(
  taskId: number,
  status: string,
  extra?: { manusResult?: string; streamMsgId?: number }
) {
  const event: TaskStreamEvent = { type: "status", status, ...extra };
  bus.emit(`task:${taskId}`, event);
}

/** 广播流式内容 chunk（每次 updateMessageContent 时调用） */
export function emitTaskChunk(taskId: number, msgId: number, content: string) {
  const event: TaskStreamEvent = { type: "chunk", msgId, content };
  bus.emit(`task:${taskId}`, event);
}

/** 广播任务完成（最终内容） */
export function emitTaskDone(taskId: number, msgId: number, content: string) {
  const event: TaskStreamEvent = { type: "done", msgId, content };
  bus.emit(`task:${taskId}`, event);
}

/** 广播任务失败 */
export function emitTaskError(taskId: number, message: string) {
  const event: TaskStreamEvent = { type: "error", message };
  bus.emit(`task:${taskId}`, event);
}

// ── SSE Express 路由 ──────────────────────────────────────────────────────────

export const taskStreamRouter: Router = createRouter();

/**
 * GET /api/task-stream/:taskId
 *
 * 鉴权：通过 cookie session（与 tRPC 相同机制）
 * 前端：new EventSource('/api/task-stream/123', { withCredentials: true })
 */
taskStreamRouter.get("/api/task-stream/:taskId", (req: Request, res: Response) => {
  const taskId = parseInt(req.params.taskId, 10);
  if (isNaN(taskId)) {
    res.status(400).json({ error: "Invalid taskId" });
    return;
  }

  // SSE 响应头
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // 禁用 nginx 缓冲
  res.flushHeaders();

  // 发送心跳（每 15s），防止代理超时断开
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 15000);

  // 发送 SSE 格式数据
  const send = (event: TaskStreamEvent) => {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      // 连接已关闭，忽略写入错误
    }
  };

  // 订阅广播总线
  const channel = `task:${taskId}`;
  const listener = (event: TaskStreamEvent) => {
    send(event);
    // done / error 后关闭连接
    if (event.type === "done" || event.type === "error") {
      cleanup();
    }
  };

  bus.on(channel, listener);

  // 清理函数
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    clearInterval(heartbeat);
    clearTimeout(maxLifetimeTimer);
    bus.off(channel, listener);
    try { res.end(); } catch { /* ignore */ }
  };

  // ── P0 防卡：最大生命周期 300s ────────────────────────────────────────────
  const maxLifetimeTimer = setTimeout(() => {
    send({
      type: "error",
      message: "分析超时（已超过 5 分钟），请刷新页面后重试。如问题持续，请联系支持团队。",
    });
    cleanup();
  }, SSE_MAX_LIFETIME_MS);

  // 客户端断开时清理
  req.on("close", cleanup);
  req.on("aborted", cleanup);
});
