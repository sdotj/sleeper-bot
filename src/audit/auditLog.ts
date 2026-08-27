import { randomUUID } from "node:crypto";
import type { Store } from "./store.js";

/** Lifecycle stage of an action, as recorded in the audit log. */
export type AuditEventType = "proposed" | "executed" | "rejected" | "failed";

/** Who caused the event. */
export type AuditActor = "user" | "rule" | "auto";

/**
 * One append-only audit record. The Phase-3 UI reads these to show "what
 * SleepBot did while I was away", so the shape is treated as a consumed
 * contract (dec.action-audit-log).
 */
export interface AuditEvent {
  id: string;
  actionId: string;
  leagueId: string;
  type: AuditEventType;
  actor: AuditActor;
  /** Epoch milliseconds. */
  at: number;
  /** Human-readable summary of what happened. */
  summary: string;
  /** Optional structured detail (rule verdict, error, payload snapshot). */
  detail?: unknown;
}

/**
 * AuditLog — append-only history of every action's lifecycle. Backed by a
 * {@link Store} collection; events are never mutated once written.
 */
export class AuditLog {
  private static readonly COLLECTION = "audit";

  constructor(private readonly store: Store) {}

  /** Append an event. Returns the stored record (with id + timestamp filled). */
  async record(
    event: Omit<AuditEvent, "id" | "at"> & { at?: number },
  ): Promise<AuditEvent> {
    const full: AuditEvent = { id: randomUUID(), at: event.at ?? Date.now(), ...event };
    await this.store.put(AuditLog.COLLECTION, full.id, full);
    return full;
  }

  /** All events (optionally filtered by league), newest first. */
  async list(leagueId?: string): Promise<AuditEvent[]> {
    const all = await this.store.list<AuditEvent>(AuditLog.COLLECTION);
    return all
      .filter((e) => !leagueId || e.leagueId === leagueId)
      .sort((a, b) => b.at - a.at);
  }
}
