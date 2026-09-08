import { z } from "zod";
import type { WritePayload } from "../adapters/LeagueAdapter.js";
import type { ActionKind } from "../rules/index.js";

/**
 * Runtime validation for write payloads at the domain boundary (audit #10).
 *
 * Every transport — the HTTP routes, the chat tools, the agent, and the MCP
 * tools — funnels writes through {@link ActionPipeline}, but each only *casts*
 * its untyped input to the payload interface, so a negative/fractional roster
 * id, a numeric player id, a negative FAAB bid, or a self-trade would sail
 * through. Validating here, once, closes that for all of them: the pipeline
 * calls {@link validateWritePayload} before it evaluates rules or dispatches.
 */

const rosterId = z.number().int().positive();
// Platform player ids are opaque strings (Sleeper/ESPN both use numeric strings,
// but we don't assume a format) — just require a non-empty string, not a number.
const playerId = z.string().trim().min(1);

export const tradePayloadSchema = z
  .object({
    fromRosterId: rosterId,
    toRosterId: rosterId,
    sendPlayerIds: z.array(playerId),
    receivePlayerIds: z.array(playerId),
  })
  .strict()
  .refine((t) => t.fromRosterId !== t.toRosterId, { message: "a trade needs two different rosters" })
  .refine((t) => t.sendPlayerIds.length + t.receivePlayerIds.length > 0, {
    message: "a trade must move at least one player",
  })
  .refine(
    (t) => new Set([...t.sendPlayerIds, ...t.receivePlayerIds]).size === t.sendPlayerIds.length + t.receivePlayerIds.length,
    { message: "a player can't be on both sides of a trade" },
  );

export const waiverClaimPayloadSchema = z
  .object({
    rosterId,
    addPlayerId: playerId,
    dropPlayerId: playerId.optional(),
    faabBid: z.number().int().min(0).max(100_000).optional(),
  })
  .strict()
  .refine((w) => !w.dropPlayerId || w.addPlayerId !== w.dropPlayerId, {
    message: "add and drop can't be the same player",
  });

export const addDropPayloadSchema = z
  .object({
    rosterId,
    addPlayerId: playerId.optional(),
    dropPlayerId: playerId.optional(),
  })
  .strict()
  .refine((a) => a.addPlayerId || a.dropPlayerId, {
    message: "an add/drop needs at least one of addPlayerId or dropPlayerId",
  })
  .refine((a) => !a.addPlayerId || a.addPlayerId !== a.dropPlayerId, {
    message: "add and drop can't be the same player",
  });

const byKind = {
  trade: tradePayloadSchema,
  waiver_claim: waiverClaimPayloadSchema,
  add_drop: addDropPayloadSchema,
} as const;

/** Thrown when a write payload fails boundary validation. Maps to HTTP 400. */
export class InvalidWritePayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWritePayloadError";
  }
}

/**
 * Validate an untyped write payload for its action kind, returning the parsed
 * (and normalized) payload. Throws {@link InvalidWritePayloadError} with a
 * human-readable list of problems. Note: this checks the *shape and invariants*
 * of the request; it does NOT check roster ownership or FAAB affordability —
 * those need a live roster/budget fetch and belong to the rules layer.
 */
export function validateWritePayload(kind: ActionKind, payload: unknown): WritePayload {
  const schema = byKind[kind];
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(payload)"}: ${i.message}`)
      .join("; ");
    throw new InvalidWritePayloadError(`invalid ${kind} payload — ${issues}`);
  }
  return parsed.data as WritePayload;
}
