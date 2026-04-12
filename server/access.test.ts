import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock db helpers
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getUserAccess: vi.fn(),
    grantUserAccess: vi.fn(),
    revokeUserAccess: vi.fn(),
    verifyAccessCode: vi.fn(),
    incrementCodeUsage: vi.fn(),
    createAccessCode: vi.fn(),
    listAccessCodes: vi.fn(),
    revokeAccessCode: vi.fn(),
  };
});

// Mock ENV
vi.mock("./_core/env", () => ({
  ENV: {
    ownerOpenId: "owner-open-id",
    ownerName: "Owner",
  },
}));

import {
  getUserAccess,
  verifyAccessCode,
  incrementCodeUsage,
  grantUserAccess,
  listAccessCodes,
  revokeAccessCode,
} from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function makeCtx(overrides: Partial<AuthenticatedUser> = {}): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "guest-open-id",
    email: "guest@example.com",
    name: "Guest User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function makeOwnerCtx(): TrpcContext {
  return makeCtx({ openId: "owner-open-id", role: "admin" });
}

describe("access.check", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Owner always has access and isOwner=true", async () => {
    const caller = appRouter.createCaller(makeOwnerCtx());
    const result = await caller.access.check();
    expect(result).toEqual({ hasAccess: true, isOwner: true });
  });

  it("Guest with valid user_access record has access", async () => {
    vi.mocked(getUserAccess).mockResolvedValue({ id: 1, userId: 1, accessCodeId: 1, grantedAt: new Date(), revokedAt: null } as any);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.access.check();
    expect(result).toEqual({ hasAccess: true, isOwner: false });
  });

  it("Guest without user_access record has no access", async () => {
    vi.mocked(getUserAccess).mockResolvedValue(null);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.access.check();
    expect(result).toEqual({ hasAccess: false, isOwner: false });
  });
});

describe("access.verify", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Valid code grants access and increments usage", async () => {
    const mockCode = { id: 42, code: "VALID-CODE", isActive: true, usedCount: 0, maxUses: 1, expiresAt: null } as any;
    vi.mocked(verifyAccessCode).mockResolvedValue(mockCode);
    vi.mocked(grantUserAccess).mockResolvedValue(undefined);
    vi.mocked(incrementCodeUsage).mockResolvedValue(undefined);

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.access.verify({ code: "VALID-CODE" });

    expect(result).toEqual({ success: true });
    expect(grantUserAccess).toHaveBeenCalledWith(1, 42);
    expect(incrementCodeUsage).toHaveBeenCalledWith(42);
  });

  it("Invalid code throws FORBIDDEN", async () => {
    vi.mocked(verifyAccessCode).mockResolvedValue(null);
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.access.verify({ code: "INVALID" })).rejects.toThrow("密码无效或已过期");
  });
});

describe("access.listCodes (ownerProcedure)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Owner can list codes", async () => {
    vi.mocked(listAccessCodes).mockResolvedValue([{ id: 1, code: "ABC123", label: "test", isActive: true, usedCount: 0, maxUses: 1, createdAt: new Date(), expiresAt: null } as any]);
    const caller = appRouter.createCaller(makeOwnerCtx());
    const result = await caller.access.listCodes();
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("ABC123");
  });

  it("Non-owner cannot list codes", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.access.listCodes()).rejects.toThrow();
  });
});

describe("access.revokeCode (ownerProcedure)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Owner can revoke a code", async () => {
    vi.mocked(revokeAccessCode).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(makeOwnerCtx());
    const result = await caller.access.revokeCode({ codeId: 1 });
    expect(result).toEqual({ success: true });
    expect(revokeAccessCode).toHaveBeenCalledWith(1);
  });
});
