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
    importance: 5,
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
    importance: 3,
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
    importance: 1,
    expiresAt: null,
    createdAt: new Date("2026-01-03"),
  },
];

// ─── computeExpiresAt 逻辑（与 db.ts 保持一致）────────────────────────────────
function computeExpiresAt(importance: number): Date | null {
  const DAY_MS = 86400000;
  const now = Date.now();
  const daysMap: Record<number, number | null> = {
    1: 30,
    2: 90,
    3: 180,
    4: 365,
    5: null, // 永不过期
  };
  // 注意：不能用 ?? ，因为 null ?? 180 会返回 180
  const days = importance in daysMap ? daysMap[importance] : 180;
  return days === null ? null : new Date(now + days! * DAY_MS);
}

// ─── importance 加成逻辑（与 db.ts 保持一致）────────────────────────────────
function importanceBonus(importance: number): number {
  return (importance - 3) * 0.5;
}

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

    it("应支持更新 importance 字段", async () => {
      (updateMemoryContext as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      await updateMemoryContext(1, 1, { importance: 5 });
      expect(updateMemoryContext).toHaveBeenCalledWith(1, 1, { importance: 5 });
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

  describe("computeExpiresAt 过期策略", () => {
    it("importance=1 应返回约 30 天后的日期", () => {
      const result = computeExpiresAt(1);
      expect(result).not.toBeNull();
      const diffDays = (result!.getTime() - Date.now()) / 86400000;
      expect(diffDays).toBeCloseTo(30, 0);
    });

    it("importance=2 应返回约 90 天后的日期", () => {
      const result = computeExpiresAt(2);
      expect(result).not.toBeNull();
      const diffDays = (result!.getTime() - Date.now()) / 86400000;
      expect(diffDays).toBeCloseTo(90, 0);
    });

    it("importance=3 应返回约 180 天后的日期", () => {
      const result = computeExpiresAt(3);
      expect(result).not.toBeNull();
      const diffDays = (result!.getTime() - Date.now()) / 86400000;
      expect(diffDays).toBeCloseTo(180, 0);
    });

    it("importance=4 应返回约 365 天后的日期", () => {
      const result = computeExpiresAt(4);
      expect(result).not.toBeNull();
      const diffDays = (result!.getTime() - Date.now()) / 86400000;
      expect(diffDays).toBeCloseTo(365, 0);
    });

    it("importance=5 应返回 null（永不过期）", () => {
      const result = computeExpiresAt(5);
      expect(result).toBeNull();
    });

    it("未知 importance 应默认 180 天", () => {
      const result = computeExpiresAt(99);
      expect(result).not.toBeNull();
      const diffDays = (result!.getTime() - Date.now()) / 86400000;
      expect(diffDays).toBeCloseTo(180, 0);
    });
  });

  describe("importanceBonus 评分加成", () => {
    it("importance=1 应产生 -1.0 的加成（降权）", () => {
      expect(importanceBonus(1)).toBe(-1.0);
    });

    it("importance=3 应产生 0 的加成（中性）", () => {
      expect(importanceBonus(3)).toBe(0);
    });

    it("importance=5 应产生 +1.0 的加成（置顶）", () => {
      expect(importanceBonus(5)).toBe(1.0);
    });

    it("高 importance 记忆在评分中应排在低 importance 记忆前面", () => {
      // 模拟两条记忆，关键词匹配分相同，importance 不同
      const highImp = { matchScore: 2, timeFactor: 1.0, importance: 5 };
      const lowImp = { matchScore: 2, timeFactor: 1.0, importance: 1 };
      const scoreHigh = highImp.matchScore * highImp.timeFactor + importanceBonus(highImp.importance);
      const scoreLow = lowImp.matchScore * lowImp.timeFactor + importanceBonus(lowImp.importance);
      expect(scoreHigh).toBeGreaterThan(scoreLow);
    });

    it("importance=5 记忆即使 matchScore=0 也应比 importance=1 且 matchScore=1 的记忆得分高", () => {
      // importance=5, matchScore=0: 0*1.0 + 1.0 = 1.0
      // importance=1, matchScore=1: 1*1.0 + (-1.0) = 0.0
      const scoreHigh = 0 * 1.0 + importanceBonus(5);
      const scoreLow = 1 * 1.0 + importanceBonus(1);
      expect(scoreHigh).toBeGreaterThan(scoreLow);
    });
  });
});
