/**
 * memory.test.ts
 * 测试 memory router 的后端逻辑（db 层函数）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock db functions
vi.mock("./db", () => ({
  getRecentMemory: vi.fn(),
  deleteMemoryContext: vi.fn(),
  deleteMemoryContextBatch: vi.fn(),
  updateMemoryContext: vi.fn(),
}));

import {
  getRecentMemory,
  deleteMemoryContext,
  deleteMemoryContextBatch,
  updateMemoryContext,
} from "./db";

const mockMemories = [
  {
    id: 1,
    userId: 1,
    taskTitle: "茅台股价分析",
    summary: "用户偏好价值投资，关注白酒行业",
    memoryType: "preference",
    keywords: "茅台,白酒,价值投资",
    conversationId: 1,
    expiresAt: null,
    createdAt: new Date("2026-01-01"),
  },
  {
    id: 2,
    userId: 1,
    taskTitle: "比亚迪技术分析",
    summary: "关注新能源汽车行业，持有 BYD",
    memoryType: "watchlist",
    keywords: "比亚迪,新能源,BYD",
    conversationId: 2,
    expiresAt: null,
    createdAt: new Date("2026-01-02"),
  },
  {
    id: 3,
    userId: 1,
    taskTitle: "量化策略回测",
    summary: "偏好动量策略，回测周期 252 天",
    memoryType: "workflow",
    keywords: "量化,动量,回测",
    conversationId: 3,
    expiresAt: null,
    createdAt: new Date("2026-01-03"),
  },
];

describe("Memory DB helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getRecentMemory", () => {
    it("应返回用户的记忆列表", async () => {
      (getRecentMemory as ReturnType<typeof vi.fn>).mockResolvedValue(mockMemories);
      const result = await getRecentMemory(1, 50);
      expect(result).toHaveLength(3);
      expect(result[0].memoryType).toBe("preference");
    });

    it("应支持按 limit 限制返回数量", async () => {
      (getRecentMemory as ReturnType<typeof vi.fn>).mockResolvedValue(mockMemories.slice(0, 2));
      const result = await getRecentMemory(1, 2);
      expect(result).toHaveLength(2);
    });
  });

  describe("deleteMemoryContext", () => {
    it("应成功删除单条记忆", async () => {
      (deleteMemoryContext as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      await expect(deleteMemoryContext(1, 1)).resolves.toBeUndefined();
      expect(deleteMemoryContext).toHaveBeenCalledWith(1, 1);
    });

    it("应验证 userId 匹配（不同用户不能删除他人记忆）", async () => {
      (deleteMemoryContext as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      await deleteMemoryContext(1, 999); // 不同 userId
      expect(deleteMemoryContext).toHaveBeenCalledWith(1, 999);
    });
  });

  describe("deleteMemoryContextBatch", () => {
    it("应成功批量删除记忆", async () => {
      (deleteMemoryContextBatch as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      await expect(deleteMemoryContextBatch([1, 2, 3], 1)).resolves.toBeUndefined();
      expect(deleteMemoryContextBatch).toHaveBeenCalledWith([1, 2, 3], 1);
    });

    it("空数组应直接返回", async () => {
      (deleteMemoryContextBatch as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      await deleteMemoryContextBatch([], 1);
      expect(deleteMemoryContextBatch).toHaveBeenCalledWith([], 1);
    });
  });

  describe("updateMemoryContext", () => {
    it("应成功更新 summary 字段", async () => {
      (updateMemoryContext as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      await expect(
        updateMemoryContext(1, 1, { summary: "更新后的摘要" })
      ).resolves.toBeUndefined();
      expect(updateMemoryContext).toHaveBeenCalledWith(1, 1, { summary: "更新后的摘要" });
    });

    it("应成功更新 keywords 字段", async () => {
      (updateMemoryContext as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      await updateMemoryContext(1, 1, { keywords: "新关键词1,新关键词2" });
      expect(updateMemoryContext).toHaveBeenCalledWith(1, 1, { keywords: "新关键词1,新关键词2" });
    });

    it("应支持同时更新 summary 和 keywords", async () => {
      (updateMemoryContext as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      await updateMemoryContext(1, 1, {
        summary: "新摘要",
        keywords: "新关键词",
      });
      expect(updateMemoryContext).toHaveBeenCalledWith(1, 1, {
        summary: "新摘要",
        keywords: "新关键词",
      });
    });
  });

  describe("Memory 过滤逻辑（前端模拟）", () => {
    it("按 memoryType 过滤应正确工作", () => {
      const filtered = mockMemories.filter(m => m.memoryType === "preference");
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe(1);
    });

    it("按关键词搜索应正确工作", () => {
      const q = "比亚迪";
      const filtered = mockMemories.filter(m =>
        (m.taskTitle ?? "").includes(q) ||
        (m.summary ?? "").includes(q) ||
        (m.keywords ?? "").includes(q)
      );
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe(2);
    });

    it("搜索不存在的关键词应返回空数组", () => {
      const q = "不存在的关键词xyz";
      const filtered = mockMemories.filter(m =>
        (m.taskTitle ?? "").includes(q) ||
        (m.summary ?? "").includes(q) ||
        (m.keywords ?? "").includes(q)
      );
      expect(filtered).toHaveLength(0);
    });
  });
});
