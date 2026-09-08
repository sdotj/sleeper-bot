import type { ValueProvider } from "./ValueProvider.js";

/**
 * SleeperRankValueProvider — REDRAFT player value from Sleeper's own season-long
 * `search_rank` (lower = better). Unlike KTC dynasty values, this reflects
 * single-season value: rookies are not inflated, and it covers kickers (which
 * KTC omits entirely). Defenses carry no search_rank on Sleeper, so they get a
 * modest visible floor rather than 0, so they still surface (dec.rules-engine-and-value).
 *
 * Rank is mapped to a 0..~10000 value with exponential decay so the top of the
 * board is appropriately steep — good for value-over-replacement math.
 */
export interface RankedPlayer {
  playerId: string;
  position: string;
  /** Sleeper search_rank; undefined/huge means unranked. */
  searchRank?: number | null;
}

const UNRANKED = 9_000_000;
/** Decay constant: rank 1 ≈ 9999, ~50 ≈ 6065, ~100 ≈ 3675, ~200 ≈ 1352. */
const DECAY = 100;

export class SleeperRankValueProvider implements ValueProvider {
  private index: Map<string, number> | null = null;
  private building: Promise<Map<string, number>> | null = null;

  constructor(
    private readonly loadPlayers: () => Promise<RankedPlayer[]>,
    private readonly opts: { defenseFloor?: number } = {},
  ) {}

  async getValue(playerId: string): Promise<number> {
    return (await this.ensureIndex()).get(playerId) ?? 0;
  }

  async getValues(playerIds: string[]): Promise<Map<string, number>> {
    const idx = await this.ensureIndex();
    return new Map(playerIds.map((id) => [id, idx.get(id) ?? 0]));
  }

  private valueForRank(rank: number | null | undefined, position: string): number {
    if (typeof rank === "number" && rank > 0 && rank < UNRANKED) {
      return Math.round(9999 * Math.exp(-(rank - 1) / DECAY));
    }
    // Unranked: defenses get a small floor so they stay visible/orderable; other
    // unranked players are genuinely deep and score 0.
    return position === "DEF" ? (this.opts.defenseFloor ?? 300) : 0;
  }

  private ensureIndex(): Promise<Map<string, number>> {
    if (this.index) return Promise.resolve(this.index);
    if (!this.building) {
      this.building = this.loadPlayers()
        .then((players) => {
          const idx = new Map<string, number>();
          for (const p of players) idx.set(p.playerId, this.valueForRank(p.searchRank, p.position));
          this.index = idx;
          return idx;
        })
        .catch((err) => {
          // Don't cache a rejected build — a transient load failure would then
          // fail every future lookup until restart (audit #15). Clear it so the
          // next call retries.
          this.building = null;
          throw err;
        });
    }
    return this.building;
  }
}
