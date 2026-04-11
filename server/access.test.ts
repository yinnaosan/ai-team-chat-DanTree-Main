import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock db helpers
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    // Legacy access-code helpers (kept for completeness, not used by current router)
    getUserAccess: vi.fn(),
    grantUserAccess: vi.fn(),
    revokeUserAccess: vi.fn(),
    verifyAccessCode: vi.fn(),
    incrementCodeUsage: vi.fn(),
    createAccessCode: vi.fn(),
    listAccessCodes: vi.fn(),
    revokeAccessCode: vi.fn(),
    // Current access-key helpers used by appRouter
    checkUserActivated: vi.fn().mockResolvedValue(true),
    getUserBoundKeyExpiry: vi.fn().mockResolvedValue(null),
    activateAccessKey: vi.fn().mockResolvedValue({ success: true }),
    listAccessKeys: vi.fn().mockResolvedValue([]),
    revokeAccessKey: vi.fn().mockResolvedValue(undefined),
    createAccessKey: vi.fn().mockResolvedValue(undefined),
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
  checkUserActivated,
  listAccessKeys,
  revokeAccessKey,
  activateAccessKey,
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

// ─────────────────────────────────────────────────────────────────────────────
// access.check
// Real return shape: { hasAccess, isOwner, expiredAt }
// ─────────────────────────────────────────────────────────────────────────────

describe("access.check", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Owner always has access and isOwner=true", async () => {
    const caller = appRouter.createCaller(makeOwnerCtx());
    const result = await caller.access.check();
    // Real interface returns expiredAt field — align assertion with actual shape
    expect(result.hasAccess).toBe(true);
    expect(result.isOwner).toBe(true);
    expect(result.expiredAt).toBeNull();
  });

  it("Guest with checkUserActivated=true has access", async () => {
    vi.mocked(checkUserActivated).mockResolvedValue(true);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.access.check();
    expect(result.hasAccess).toBe(true);
    expect(result.isOwner).toBe(false);
    expect(result.expiredAt).toBeNull();
  });

  it("Guest with checkUserActivated=false has no access", async () => {
    vi.mocked(checkUserActivated).mockResolvedValue(false);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.access.check();
    expect(result.hasAccess).toBe(false);
    expect(result.isOwner).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// access.activateKey  (was: access.verify — renamed in current appRouter)
// ─────────────────────────────────────────────────────────────────────────────

describe("access.activateKey (was: access.verify)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Valid key activates successfully", async () => {
    vi.mocked(activateAccessKey).mockResolvedValue({ success: true });
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.access.activateKey({ key: "VALID-KEY-32CHARS-PADDED-XXXXXXXX" });
    expect(result).toEqual({ success: true });
  });

  it("Invalid key throws FORBIDDEN", async () => {
    vi.mocked(activateAccessKey).mockResolvedValue({ success: false, reason: "密钥无效" });
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.access.activateKey({ key: "INVALID-KEY-32CHARS-PADDED-XXXXX" })
    ).rejects.toThrow("密钥无效");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// access.listKeys  (was: access.listCodes — renamed in current appRouter)
// ─────────────────────────────────────────────────────────────────────────────

describe("access.listKeys (was: access.listCodes)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Owner can list keys", async () => {
    vi.mocked(listAccessKeys).mockResolvedValue([
      {
        id: 1,
        keyHash: "abc",
        label: "test",
        boundEmail: null,
        boundUserId: null,
        expiresAt: new Date("2027-01-01"),
        revoked: false,
        activatedAt: null,
        createdAt: new Date(),
      },
    ]);
    const caller = appRouter.createCaller(makeOwnerCtx());
    const result = await caller.access.listKeys();
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("test");
  });

  it("Non-owner cannot list keys", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.access.listKeys()).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// access.revokeKey  (was: access.revokeCode — renamed in current appRouter)
// ─────────────────────────────────────────────────────────────────────────────

describe("access.revokeKey (was: access.revokeCode)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Owner can revoke a key", async () => {
    vi.mocked(revokeAccessKey).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(makeOwnerCtx());
    const result = await caller.access.revokeKey({ keyId: 1 });
    expect(result).toEqual({ success: true });
    expect(revokeAccessKey).toHaveBeenCalledWith(1);
  });
});
