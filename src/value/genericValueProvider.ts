import { readFile } from "node:fs/promises";
import type { ValueProvider } from "./ValueProvider.js";

/**
 * GenericValueProvider — the intentionally-rough starting implementation.
 *
 * It reads an optional static rankings map (playerId -> value on a 0..100
 * scale). Any player absent from the map gets NEUTRAL, which makes fairness
 * warn rules a no-op for unknown players rather than firing on bad data.
 *
 * This is a placeholder for a real value source (expert consensus rankings,
 * ADP, live stats). Swapping it is a constructor change at the wiring site —
 * the rules engine only sees the {@link ValueProvider} interface
 * (dec.rules-engine-and-value).
 */
export class GenericValueProvider implements ValueProvider {
  static readonly NEUTRAL = 50;

  constructor(private readonly rankings: Record<string, number> = {}) {}

  /** Load rankings from a JSON file of { playerId: value }. Missing file -> empty. */
  static async fromFile(path: string): Promise<GenericValueProvider> {
    try {
      const parsed = JSON.parse(await readFile(path, "utf8")) as Record<string, number>;
      return new GenericValueProvider(parsed);
    } catch {
      return new GenericValueProvider({});
    }
  }

  async getValue(playerId: string): Promise<number> {
    return this.rankings[playerId] ?? GenericValueProvider.NEUTRAL;
  }

  async getValues(playerIds: string[]): Promise<Map<string, number>> {
    return new Map(playerIds.map((id) => [id, this.rankings[id] ?? GenericValueProvider.NEUTRAL]));
  }
}
