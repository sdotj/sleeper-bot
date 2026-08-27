/**
 * ValueProvider — the seam between the rules engine and "how good is a player".
 * Warn rules (e.g. trade fairness) consult it; block/protect rules do not.
 *
 * Values are on an arbitrary 0..100 scale where higher is more valuable; only
 * relative magnitude matters to the fairness rules. The initial implementation
 * is deliberately generic and rough — the whole point of this interface is that
 * a richer web/stats/ADP source can replace it without touching the rules
 * engine (dec.rules-engine-and-value).
 */
export interface ValueProvider {
  /** Value for one player. Unknown players return a neutral baseline. */
  getValue(playerId: string): Promise<number>;
  /** Values for many players, as a playerId -> value map. */
  getValues(playerIds: string[]): Promise<Map<string, number>>;
}
