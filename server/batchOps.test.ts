import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ── Mock ENV (owner-open-id bypasses requireAccess) ──────────────────────────
vi.mock("./_core/env", () => ({
  ENV: {
    ownerOpenId: "owner-open-id",
    ownerName: "Owner",
  },
}));

// ── Mock db helpers ──────────────────────────────────────────────────────────
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    batchDeleteConversations: vi.fn().mockResolvedValue(undefined),
    batchSetPinned: vi.fn().mockResolvedValue(undefined),
    batchSetFavorited: vi.fn().mockResolvedValue(undefined),
    checkUserActivated: vi.fn().mockResolvedValue(true),
    // Minimal mocks for other db functions that may be called during router init
    getUserAccess: vi.fn().mockResolvedValue({ id: 1 }),
    getRpaConfig: vi.fn().mockResolvedValue(null),
    getOwnerRpaConfig: vi.fn().mockResolvedValue(null),
  };
});

// ── Mock LLM ─────────────────────────────────────────────────────────────────
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: "mock" } }],
  }),
}));

// ── Mock storage ─────────────────────────────────────────────────────────────
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ key: "k", url: "https://cdn/k" }),
}));

import {
  batchDeleteConversations,
  batchSetPinned,
  batchSetFavorited,
} from "./db";

// ── Helpers ──────────────────────────────────────────────────────────────────
type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function makeOwnerCtx(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "owner-open-id",
    email: "owner@example.com",
    name: "Owner",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function makeGuestCtx(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "guest-open-id",
    email: "guest@example.com",
    name: "Guest",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("conversation.batchDelete", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes multiple conversations for owner", async () => {
    const caller = appRouter.createCaller(makeOwnerCtx());
    const result = await caller.conversation.batchDelete({
      conversationIds: [1, 2, 3],
    });
    expect(result).toEqual({ success: true, deleted: 3 });
    expect(batchDeleteConversations).toHaveBeenCalledWith(1, [1, 2, 3]);
  });

  it("deletes a single conversation", async () => {
    const caller = appRouter.createCaller(makeOwnerCtx());
    const result = await caller.conversation.batchDelete({
      conversationIds: [42],
    });
    expect(result).toEqual({ success: true, deleted: 1 });
    expect(batchDeleteConversations).toHaveBeenCalledWith(1, [42]);
  });

  it("rejects empty conversationIds array", async () => {
    const caller = appRouter.createCaller(makeOwnerCtx());
    await expect(
      caller.conversation.batchDelete({ conversationIds: [] })
    ).rejects.toThrow();
  });
});

describe("conversation.batchPin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pins multiple conversations", async () => {
    const caller = appRouter.createCaller(makeOwnerCtx());
    const result = await caller.conversation.batchPin({
      conversationIds: [1, 2],
      pinned: true,
    });
    expect(result).toEqual({ success: true });
    expect(batchSetPinned).toHaveBeenCalledWith(1, [1, 2], true);
  });

  it("unpins multiple conversations", async () => {
    const caller = appRouter.createCaller(makeOwnerCtx());
    const result = await caller.conversation.batchPin({
      conversationIds: [3, 4, 5],
      pinned: false,
    });
    expect(result).toEqual({ success: true });
    expect(batchSetPinned).toHaveBeenCalledWith(1, [3, 4, 5], false);
  });

  it("rejects empty conversationIds array", async () => {
    const caller = appRouter.createCaller(makeOwnerCtx());
    await expect(
      caller.conversation.batchPin({ conversationIds: [], pinned: true })
    ).rejects.toThrow();
  });
});

describe("conversation.batchFavorite", () => {
  beforeEach(() => vi.clearAllMocks());

  it("favorites multiple conversations", async () => {
    const caller = appRouter.createCaller(makeOwnerCtx());
    const result = await caller.conversation.batchFavorite({
      conversationIds: [10, 20],
      favorited: true,
    });
    expect(result).toEqual({ success: true });
    expect(batchSetFavorited).toHaveBeenCalledWith(1, [10, 20], true);
  });

  it("unfavorites multiple conversations", async () => {
    const caller = appRouter.createCaller(makeOwnerCtx());
    const result = await caller.conversation.batchFavorite({
      conversationIds: [10],
      favorited: false,
    });
    expect(result).toEqual({ success: true });
    expect(batchSetFavorited).toHaveBeenCalledWith(1, [10], false);
  });

  it("rejects empty conversationIds array", async () => {
    const caller = appRouter.createCaller(makeOwnerCtx());
    await expect(
      caller.conversation.batchFavorite({ conversationIds: [], favorited: true })
    ).rejects.toThrow();
  });
});

describe("batch operations access control", () => {
  beforeEach(() => vi.clearAllMocks());

  it("guest with activated access can batch delete", async () => {
    const caller = appRouter.createCaller(makeGuestCtx());
    const result = await caller.conversation.batchDelete({
      conversationIds: [1],
    });
    expect(result).toEqual({ success: true, deleted: 1 });
    expect(batchDeleteConversations).toHaveBeenCalledWith(2, [1]);
  });

  it("guest with activated access can batch pin", async () => {
    const caller = appRouter.createCaller(makeGuestCtx());
    const result = await caller.conversation.batchPin({
      conversationIds: [1],
      pinned: true,
    });
    expect(result).toEqual({ success: true });
    expect(batchSetPinned).toHaveBeenCalledWith(2, [1], true);
  });

  it("guest with activated access can batch favorite", async () => {
    const caller = appRouter.createCaller(makeGuestCtx());
    const result = await caller.conversation.batchFavorite({
      conversationIds: [1],
      favorited: true,
    });
    expect(result).toEqual({ success: true });
    expect(batchSetFavorited).toHaveBeenCalledWith(2, [1], true);
  });
});
