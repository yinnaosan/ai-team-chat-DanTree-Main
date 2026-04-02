/**
 * snapshotPersistenceEngine.ts — DanTree Level 21.0-B
 *
 * Snapshot Persistence / Memory Bridge Phase 1 — Record Construction Layer
 *
 * Scope (Phase 1 only):
 *   - Build EntitySnapshotRecord from ThesisTimelineSnapshot + change marker
 *   - Serialize / deserialize records (JSON round-trip)
 *   - Validate record integrity
 *   - Pure functions only, no DB calls, no side effects
 *
 * NOT in Phase 1:
 *   - Basket snapshot persistence (Phase 2)
 *   - Vector memory / semantic search
 *   - DB writes / schema / routes (Manus handles integration)
 *   - Scheduler / delivery logic
 *
 * Preflight Guards:
 *   G1: ThesisTimelineSnapshot is the canonical payload source
 *   G2: timing_bias field name stays timing_bias (not action_bias)
 *   G3: alert_severity === null is valid and must round-trip safely
 *   G4: advisory_only is always true
 *   G5: Empty or invalid entity_key must fail validation
 *   G6: Phase 1 entity-only; basket deferred to Phase 2
 */

import type {
  ThesisTimelineSnapshot,
  SnapshotChangeMarker,
} from "./sessionHistoryEngine";

// ─────────────────────────────────────────────────────────────────────────────
// 1. RECORD TYPE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * EntitySnapshotRecord — serializable entity snapshot for persistence bridge.
 *
 * Designed for Manus to write to DB. All fields are plain JSON-compatible types.
 * advisory_only is always true and must survive serialization round-trip.
 */
export interface EntitySnapshotRecord {
  /** Unique snapshot identifier (provided or deterministically derived) */
  snapshot_id: string;
  /** Entity key (ticker or asset name, trimmed uppercase) */
  entity_key: string;
  /** Snapshot timestamp in milliseconds since epoch */
  snapshot_time: number;
  /** Thesis stance at snapshot time, or null if unavailable */
  thesis_stance: string | null;
  /** Thesis change marker from thesisStateEngine */
  thesis_change_marker: string | null;
  /** Highest alert severity at snapshot time, or null */
  alert_severity: string | null;
  /** Action/timing bias at snapshot time, or null */
  timing_bias: string | null;
  /** Source health state at snapshot time, or null */
  source_health: string | null;
  /** Session history change marker comparing current vs previous */
  change_marker: string;
  /** Condensed state summary text (max 500 chars) */
  state_summary_text: string;
  /** Always true — advisory only, never a trading recommendation */
  advisory_only: true;
  /** Record creation timestamp in milliseconds since epoch */
  created_at: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. INPUT TYPE
// ─────────────────────────────────────────────────────────────────────────────

export interface SnapshotPersistenceInput {
  /** Canonical snapshot payload (G1: ThesisTimelineSnapshot is the source) */
  snapshot: ThesisTimelineSnapshot;
  /** Change marker from buildSessionHistoryResult */
  change_marker: SnapshotChangeMarker;
  /**
   * Optional explicit snapshot_id.
   * If provided, it is used as-is.
   * If not provided, a deterministic id is derived from entity_key + snapshot_time.
   */
  snapshot_id?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. VALIDATION ERROR
// ─────────────────────────────────────────────────────────────────────────────

export class SnapshotValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotValidationError";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * normalizeEntityKey — trim and uppercase entity key.
 * Returns null if blank after trim.
 */
function normalizeEntityKey(entity: string): string | null {
  const trimmed = entity.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * parseSnapshotTime — parse ISO string or ms timestamp to number.
 * Returns Date.now() as fallback.
 */
function parseSnapshotTime(snapshotTime: string): number {
  const parsed = new Date(snapshotTime).getTime();
  return isNaN(parsed) ? Date.now() : parsed;
}

/**
 * deriveSnapshotId — deterministic id from entity_key + snapshot_time.
 * Format: "snap_{entityKey}_{snapshotTimeMs}"
 * Not cryptographic — sufficient for Phase 1 deduplication.
 */
function deriveSnapshotId(entityKey: string, snapshotTimeMs: number): string {
  return `snap_${entityKey}_${snapshotTimeMs}`;
}

/**
 * truncateSummaryText — cap state_summary_text at 500 chars.
 */
function truncateSummaryText(text: string, maxLen = 500): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. CORE FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * buildEntitySnapshotRecord — construct EntitySnapshotRecord from input.
 *
 * Throws SnapshotValidationError if entity_key is empty or invalid.
 * Respects all preflight guards (G1–G5).
 *
 * @param input  SnapshotPersistenceInput
 * @returns      EntitySnapshotRecord ready for persistence
 */
export function buildEntitySnapshotRecord(
  input: SnapshotPersistenceInput
): EntitySnapshotRecord {
  const { snapshot, change_marker, snapshot_id } = input;

  // G5: validate entity key
  const entityKey = normalizeEntityKey(snapshot.entity);
  if (!entityKey) {
    throw new SnapshotValidationError(
      `Invalid entity_key: "${snapshot.entity}" — entity_key must be a non-empty string`
    );
  }

  const snapshotTimeMs = parseSnapshotTime(snapshot.snapshot_time);
  const createdAt = Date.now();

  // Explicit snapshot_id takes priority; otherwise deterministic derivation
  const resolvedSnapshotId =
    snapshot_id && snapshot_id.trim().length > 0
      ? snapshot_id.trim()
      : deriveSnapshotId(entityKey, snapshotTimeMs);

  // G2: timing_bias (not action_bias)
  // G3: alert_severity=null is valid
  // G4: advisory_only=true always

  return {
    snapshot_id: resolvedSnapshotId,
    entity_key: entityKey,
    snapshot_time: snapshotTimeMs,
    thesis_stance: snapshot.thesis_stance ?? null,
    thesis_change_marker: snapshot.thesis_change_marker ?? null,
    alert_severity: snapshot.alert_severity ?? null,    // G3: null is valid
    timing_bias: snapshot.timing_bias ?? null,           // G2: field name = timing_bias
    source_health: snapshot.source_health ?? null,
    change_marker: change_marker,
    state_summary_text: truncateSummaryText(snapshot.state_summary_text),
    advisory_only: true,                                 // G4: always true
    created_at: createdAt,
  };
}

/**
 * serializeEntitySnapshotRecord — serialize record to JSON string.
 *
 * Output is deterministic for the same input (advisory_only always true).
 * Throws on serialization failure.
 */
export function serializeEntitySnapshotRecord(
  record: EntitySnapshotRecord
): string {
  return JSON.stringify(record);
}

/**
 * deserializeEntitySnapshotRecord — parse JSON string back to EntitySnapshotRecord.
 *
 * Validates required fields and advisory_only after parsing.
 * Throws SnapshotValidationError if record is malformed or advisory_only !== true.
 */
export function deserializeEntitySnapshotRecord(
  raw: string
): EntitySnapshotRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SnapshotValidationError("Failed to parse snapshot record: invalid JSON");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new SnapshotValidationError("Parsed snapshot record is not an object");
  }

  const record = parsed as Record<string, unknown>;

  // Validate required fields
  if (typeof record.snapshot_id !== "string" || record.snapshot_id.length === 0) {
    throw new SnapshotValidationError("Missing or invalid snapshot_id");
  }
  if (typeof record.entity_key !== "string" || record.entity_key.length === 0) {
    throw new SnapshotValidationError("Missing or invalid entity_key");
  }
  if (typeof record.snapshot_time !== "number") {
    throw new SnapshotValidationError("Missing or invalid snapshot_time");
  }
  if (typeof record.change_marker !== "string") {
    throw new SnapshotValidationError("Missing or invalid change_marker");
  }
  if (typeof record.state_summary_text !== "string") {
    throw new SnapshotValidationError("Missing or invalid state_summary_text");
  }
  if (record.advisory_only !== true) {
    throw new SnapshotValidationError("advisory_only must be true");
  }
  if (typeof record.created_at !== "number") {
    throw new SnapshotValidationError("Missing or invalid created_at");
  }

  return {
    snapshot_id: record.snapshot_id as string,
    entity_key: record.entity_key as string,
    snapshot_time: record.snapshot_time as number,
    thesis_stance: (record.thesis_stance as string | null) ?? null,
    thesis_change_marker: (record.thesis_change_marker as string | null) ?? null,
    alert_severity: (record.alert_severity as string | null) ?? null,
    timing_bias: (record.timing_bias as string | null) ?? null,
    source_health: (record.source_health as string | null) ?? null,
    change_marker: record.change_marker as string,
    state_summary_text: record.state_summary_text as string,
    advisory_only: true,
    created_at: record.created_at as number,
  };
}

/**
 * validateEntitySnapshotRecord — validate structural integrity of a record.
 *
 * Returns true if valid, false otherwise.
 * Does NOT throw — designed for safe programmatic use.
 */
export function validateEntitySnapshotRecord(
  record: EntitySnapshotRecord
): boolean {
  if (!record) return false;
  if (typeof record.snapshot_id !== "string" || record.snapshot_id.length === 0) return false;
  if (typeof record.entity_key !== "string" || record.entity_key.length === 0) return false;
  if (typeof record.snapshot_time !== "number" || record.snapshot_time <= 0) return false;
  if (typeof record.change_marker !== "string" || record.change_marker.length === 0) return false;
  if (typeof record.state_summary_text !== "string") return false;
  if (record.advisory_only !== true) return false;
  if (typeof record.created_at !== "number" || record.created_at <= 0) return false;
  return true;
}
