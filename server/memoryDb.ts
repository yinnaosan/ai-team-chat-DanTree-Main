/**
 * LEVEL3 Memory Engine — DB Helpers
 * Low-level CRUD for memory_records table.
 * All business logic (dedup, TTL, gating) lives in memoryEngine.ts.
 */

import { getDb } from "./db";
import { memoryRecords, type MemoryRecordRow, type InsertMemoryRecord } from "../drizzle/schema";
import { eq, and, isNull, or, gt, desc, sql } from "drizzle-orm";

// ── Insert ────────────────────────────────────────────────────────────────────

export async function insertMemoryRecord(record: InsertMemoryRecord): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(memoryRecords).values(record);
}

// ── Fetch by ticker + user (active, non-expired) ──────────────────────────────

export async function fetchActiveMemoryByTicker(
  userId: string,
  ticker: string,
  limit = 10
): Promise<MemoryRecordRow[]> {
  const db = await getDb();
  if (!db) return [];
  const now = Date.now();
  return db
    .select()
    .from(memoryRecords)
    .where(
      and(
        eq(memoryRecords.userId, userId),
        eq(memoryRecords.ticker, ticker),
        eq(memoryRecords.isActive, true),
        or(isNull(memoryRecords.expiresAt), gt(memoryRecords.expiresAt, now))
      )
    )
    .orderBy(desc(memoryRecords.createdAt))
    .limit(limit);
}

// ── Fetch all active records for user (for similar_case retrieval) ────────────

export async function fetchAllActiveMemoryForUser(
  userId: string,
  limit = 200
): Promise<MemoryRecordRow[]> {
  const db = await getDb();
  if (!db) return [];
  const now = Date.now();
  return db
    .select()
    .from(memoryRecords)
    .where(
      and(
        eq(memoryRecords.userId, userId),
        eq(memoryRecords.isActive, true),
        or(isNull(memoryRecords.expiresAt), gt(memoryRecords.expiresAt, now))
      )
    )
    .orderBy(desc(memoryRecords.createdAt))
    .limit(limit);
}

// ── Dedup check: same (ticker, action, verdict, confidence) within 24h ────────

export async function checkDuplicateMemory(
  userId: string,
  ticker: string,
  action: string | undefined,
  verdict: string | undefined,
  confidence: string | undefined
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const rows = await db
    .select({ id: memoryRecords.id })
    .from(memoryRecords)
    .where(
      and(
        eq(memoryRecords.userId, userId),
        eq(memoryRecords.ticker, ticker),
        eq(memoryRecords.action, action ?? ""),
        eq(memoryRecords.verdict, verdict ?? ""),
        eq(memoryRecords.confidence, confidence ?? ""),
        gt(memoryRecords.createdAt, cutoff)
      )
    )
    .limit(1);
  return rows.length > 0;
}

// ── Count active records per (ticker, userId) — for cap enforcement ───────────

export async function countActiveMemoryForTicker(
  userId: string,
  ticker: string
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const now = Date.now();
  const rows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(memoryRecords)
    .where(
      and(
        eq(memoryRecords.userId, userId),
        eq(memoryRecords.ticker, ticker),
        eq(memoryRecords.isActive, true),
        or(isNull(memoryRecords.expiresAt), gt(memoryRecords.expiresAt, now))
      )
    );
  return Number(rows[0]?.count ?? 0);
}

// ── Evict oldest record for (ticker, userId) when cap exceeded ────────────────

export async function evictOldestMemoryRecord(
  userId: string,
  ticker: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const oldest = await db
    .select({ id: memoryRecords.id })
    .from(memoryRecords)
    .where(
      and(
        eq(memoryRecords.userId, userId),
        eq(memoryRecords.ticker, ticker),
        eq(memoryRecords.isActive, true)
      )
    )
    .orderBy(memoryRecords.createdAt)
    .limit(1);

  if (oldest.length > 0) {
    await db
      .update(memoryRecords)
      .set({ isActive: false })
      .where(eq(memoryRecords.id, oldest[0].id));
  }
}

// ── Update outcome label (called after outcome is known) ──────────────────────

export async function updateMemoryOutcome(
  id: string,
  outcomeLabel: "success" | "failure" | "invalidated"
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(memoryRecords)
    .set({ outcomeLabel })
    .where(eq(memoryRecords.id, id));
}
