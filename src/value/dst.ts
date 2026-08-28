import { readFile } from "node:fs/promises";
import type { ValueProvider } from "./ValueProvider.js";

/**
 * DST (defense) values. Neither KTC nor Sleeper's search_rank covers defenses,
 * so we keep a season-long DST quality tier (best -> worst team codes) and map
 * it onto values with exponential decay, placing a top unit in mid-draft range
 * and the worst near replacement. Sleeper's DEF player_id IS the team code, so
 * the ranking keys onto DEF ids directly.
 *
 * This is the SKILL half of defense value. The weekly MATCHUP half (who has a
 * good matchup this week) is inherently current and is handled by the chat via
 * web search, not baked into this static tier (dec.rules-engine-and-value).
 */
const TOP_VALUE = 2600;
const DECAY = 11;

export interface DstRanks {
  season?: string;
  /** Team codes, best defense first. */
  order: string[];
}

export async function loadDstRanks(path: string): Promise<DstRanks | null> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as DstRanks;
    return Array.isArray(parsed.order) && parsed.order.length ? parsed : null;
  } catch {
    return null;
  }
}

/** team code -> value, by rank (rank 1 = TOP_VALUE, decaying). */
export function dstValueMap(ranks: DstRanks): Map<string, number> {
  const map = new Map<string, number>();
  ranks.order.forEach((team, i) => {
    map.set(team.toUpperCase(), Math.round(TOP_VALUE * Math.exp(-i / DECAY)));
  });
  return map;
}

/**
 * Wrap a base value provider so defenses (keyed by team code == DEF player id)
 * get real DST-tier values, while every other player defers to the base
 * (redraft or dynasty). Used in both value modes since neither ranks defenses.
 */
export class DstOverlayValueProvider implements ValueProvider {
  constructor(
    private readonly base: ValueProvider,
    private readonly dst: Map<string, number>,
  ) {}

  async getValue(playerId: string): Promise<number> {
    const d = this.dst.get(playerId);
    return d !== undefined ? d : this.base.getValue(playerId);
  }

  async getValues(playerIds: string[]): Promise<Map<string, number>> {
    const overlay = playerIds.filter((id) => this.dst.has(id));
    const rest = playerIds.filter((id) => !this.dst.has(id));
    const baseVals = rest.length ? await this.base.getValues(rest) : new Map<string, number>();
    const out = new Map<string, number>();
    for (const id of overlay) out.set(id, this.dst.get(id)!);
    for (const id of rest) out.set(id, baseVals.get(id) ?? 0);
    return out;
  }
}
