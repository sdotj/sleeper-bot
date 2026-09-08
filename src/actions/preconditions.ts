import type {
  AddDropPayload,
  Roster,
  TradePayload,
  WaiverClaimPayload,
  WritePayload,
} from "../adapters/LeagueAdapter.js";
import type { ActionKind } from "../rules/index.js";

/**
 * Execution preconditions (dec.write-action-pipeline). The rules engine is a
 * PURE check of protect/warn policy; it does NOT look at live roster state. So
 * an action approved earlier can, by execution time, be invalid against the
 * CURRENT rosters — you already traded or dropped a player you're sending, or
 * the free agent you're adding got claimed. These checks re-fetch the rosters
 * and block those, closing the gap the "re-validate" comment used to overstate.
 *
 * This is deliberately platform-agnostic: it works off the normalized
 * {@link Roster} list, so it protects Sleeper and ESPN identically. It checks
 * roster OWNERSHIP and player AVAILABILITY; FAAB affordability is left to the
 * platform (Sleeper rejects an over-budget bid, which the pipeline now surfaces
 * as a clean failure).
 */

export interface PreconditionResult {
  ok: boolean;
  reasons: string[];
}

/** Build id -> owning rosterId, and the set of all rostered ids, once. */
function index(rosters: Roster[]): { ownerOf: Map<string, number>; names: Map<string, string> } {
  const ownerOf = new Map<string, number>();
  const names = new Map<string, string>();
  for (const r of rosters) {
    for (const p of [...r.starters, ...r.bench, ...r.reserve, ...r.taxi]) {
      ownerOf.set(p.playerId, r.rosterId);
      names.set(p.playerId, p.name);
    }
  }
  return { ownerOf, names };
}

/**
 * Validate an action against the current rosters. Returns the blocking reasons
 * (empty ⇒ ok). Player names are resolved from the rosters for readable errors.
 */
export function checkPreconditions(
  kind: ActionKind,
  payload: WritePayload,
  rosters: Roster[],
): PreconditionResult {
  const { ownerOf, names } = index(rosters);
  const reasons: string[] = [];
  const name = (id: string) => names.get(id) ?? id;

  const mustOwn = (rosterId: number, id: string, verb: string) => {
    const owner = ownerOf.get(id);
    if (owner !== rosterId) {
      reasons.push(
        owner === undefined
          ? `${name(id)} is no longer on any roster, so it can't be ${verb}`
          : `${name(id)} is now on roster ${owner}, not ${rosterId}, so it can't be ${verb}`,
      );
    }
  };

  const mustBeAvailable = (id: string) => {
    const owner = ownerOf.get(id);
    if (owner !== undefined) {
      reasons.push(`${name(id)} is already rostered (roster ${owner}); it isn't available to add`);
    }
  };

  if (kind === "trade") {
    const t = payload as TradePayload;
    for (const id of t.sendPlayerIds) mustOwn(t.fromRosterId, id, "traded away");
    for (const id of t.receivePlayerIds) mustOwn(t.toRosterId, id, "received (the other roster no longer has it)");
  } else if (kind === "waiver_claim") {
    const w = payload as WaiverClaimPayload;
    mustBeAvailable(w.addPlayerId);
    if (w.dropPlayerId) mustOwn(w.rosterId, w.dropPlayerId, "dropped");
  } else {
    const a = payload as AddDropPayload;
    if (a.addPlayerId) mustBeAvailable(a.addPlayerId);
    if (a.dropPlayerId) mustOwn(a.rosterId, a.dropPlayerId, "dropped");
  }

  return { ok: reasons.length === 0, reasons };
}
