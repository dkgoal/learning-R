/**
 * Immutable audit log and point-in-time reconstruction (§14).
 *
 * "Ability to reconstruct the complete file **as it existed on the date of any
 * credentialing decision** — point-in-time reconstruction is a hard requirement
 * for surveys and litigation, and retrofitting it later is expensive."
 *
 * That sentence is why this is an event log rather than a mutable table with a
 * history sidecar. Every write is an append; current state is a fold over the
 * log; state on any past date is the same fold, stopped early. Reads of sensitive
 * fields are appended too, since §2 requires knowing who *looked*.
 *
 * The chain hash below is a lightweight tamper-evidence demonstration. A
 * production deployment signs entries with SHA-256 and writes to WORM storage;
 * the shape of the chain — each entry committing to its predecessor — is the part
 * that matters and is what this implements.
 */

import { isAfter, type IsoDate } from "./dates";

export type AuditAction = "CREATE" | "READ" | "UPDATE" | "DELETE";

export interface AuditEntry {
  id: string;
  /** ISO instant. Reads and writes are ordered by this within the log. */
  at: string;
  occurredOn: IsoDate;
  actorId: string;
  actorRole: string;
  action: AuditAction;
  entity: string;
  entityId: string;
  field?: string;
  before?: unknown;
  after?: unknown;
  sensitive: boolean;
  reason?: string;
  /** Chain hash over this entry and the previous entry's hash. */
  hash: string;
  previousHash: string;
}

export type AuditLog = readonly AuditEntry[];

const GENESIS = "0".repeat(16);

/** FNV-1a, 64-bit-ish. Deterministic and dependency-free; see the file header. */
export function chainHash(payload: string, previousHash: string): string {
  const input = `${previousHash}|${payload}`;
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

export type NewAuditEntry = Omit<AuditEntry, "hash" | "previousHash">;

/**
 * Append-only by construction: this returns a new array and never mutates the
 * one it is given, so a caller cannot rewrite history through a shared reference.
 */
export function append(log: AuditLog, entry: NewAuditEntry): AuditEntry[] {
  const previousHash = log.length > 0 ? (log[log.length - 1] as AuditEntry).hash : GENESIS;
  const payload = JSON.stringify({
    id: entry.id,
    at: entry.at,
    actorId: entry.actorId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    field: entry.field ?? null,
    after: entry.after ?? null,
  });
  return [...log, { ...entry, previousHash, hash: chainHash(payload, previousHash) }];
}

export interface IntegrityResult {
  intact: boolean;
  /** Index of the first entry whose hash does not match the chain. */
  brokenAt: number | null;
  entriesChecked: number;
}

export function verifyIntegrity(log: AuditLog): IntegrityResult {
  let previousHash = GENESIS;
  for (let i = 0; i < log.length; i += 1) {
    const entry = log[i] as AuditEntry;
    const payload = JSON.stringify({
      id: entry.id,
      at: entry.at,
      actorId: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      field: entry.field ?? null,
      after: entry.after ?? null,
    });
    if (entry.previousHash !== previousHash || entry.hash !== chainHash(payload, previousHash)) {
      return { intact: false, brokenAt: i, entriesChecked: log.length };
    }
    previousHash = entry.hash;
  }
  return { intact: true, brokenAt: null, entriesChecked: log.length };
}

/**
 * Fold the log into the state of one entity as of a date, inclusive. Reads are
 * skipped — they record access, not state.
 */
export function reconstructAsOf(
  log: AuditLog,
  entity: string,
  entityId: string,
  asOf: IsoDate,
): Record<string, unknown> {
  const state: Record<string, unknown> = {};
  for (const entry of log) {
    if (entry.entity !== entity || entry.entityId !== entityId) continue;
    if (isAfter(entry.occurredOn, asOf)) continue;
    if (entry.action === "READ") continue;
    if (entry.action === "DELETE") {
      if (entry.field) delete state[entry.field];
      else return {};
      continue;
    }
    if (entry.field) {
      state[entry.field] = entry.after;
    } else if (entry.after && typeof entry.after === "object") {
      Object.assign(state, entry.after as Record<string, unknown>);
    }
  }
  return state;
}

/** The whole file as it stood on a decision date — the survey artifact. */
export interface PointInTimeFile {
  asOf: IsoDate;
  entities: { entity: string; entityId: string; state: Record<string, unknown> }[];
  entryCount: number;
  integrity: IntegrityResult;
}

export function reconstructFile(
  log: AuditLog,
  practitionerId: string,
  asOf: IsoDate,
): PointInTimeFile {
  const relevant = log.filter(
    (e) =>
      !isAfter(e.occurredOn, asOf) &&
      (e.entityId === practitionerId || String(e.after ?? "").includes(practitionerId) || e.entity === "practitioner"),
  );
  const keys = new Set(relevant.map((e) => `${e.entity}::${e.entityId}`));
  return {
    asOf,
    entities: [...keys].map((key) => {
      const [entity, entityId] = key.split("::") as [string, string];
      return { entity, entityId, state: reconstructAsOf(log, entity, entityId, asOf) };
    }),
    entryCount: relevant.length,
    integrity: verifyIntegrity(log),
  };
}

/** §2: who viewed sensitive fields, for the separate read-audit review. */
export function sensitiveReads(log: AuditLog): AuditEntry[] {
  return log.filter((e) => e.action === "READ" && e.sensitive);
}

export function entriesFor(log: AuditLog, entity: string, entityId: string): AuditEntry[] {
  return log.filter((e) => e.entity === entity && e.entityId === entityId);
}
