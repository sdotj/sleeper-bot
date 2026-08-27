import { readFile } from "node:fs/promises";
import type { ValueProvider } from "./ValueProvider.js";

/**
 * KtcValueProvider — player value from KeepTradeCut (KTC) dynasty rankings.
 *
 * KTC data is keyed by player name (with a superflex `sf_value` and a 1-QB
 * `oqb_value`, ~0..10000). Our value interface is keyed by Sleeper player id, so
 * we bridge KTC -> Sleeper by NORMALIZED NAME + POSITION (team codes differ
 * between the two sources, e.g. KTC "KCC" vs Sleeper "KC", so team is not used).
 *
 * The Sleeper player list is loaded lazily via an injected loader and the
 * id->value index is built once and memoized, so constructing the provider is
 * cheap and the ~5MB players dump is fetched only on first use.
 *
 * Snapshot data is from KeepTradeCut, via the community repo
 * github.com/cameron-eth/sleeper-sdk; refresh `config/ktc-values.json` to update.
 */
export type KtcMode = "sf" | "oqb";

export interface KtcPlayer {
  name: string;
  position: string;
  sf_value?: number;
  oqb_value?: number;
}

/** The minimum a platform must expose about a player to bridge KTC values. */
export interface PlayerLite {
  playerId: string;
  name: string;
  position: string;
}

export class KtcValueProvider implements ValueProvider {
  private index: Map<string, number> | null = null;
  private building: Promise<Map<string, number>> | null = null;

  constructor(
    private readonly ktc: KtcPlayer[],
    private readonly loadPlayers: () => Promise<PlayerLite[]>,
    private readonly opts: { mode?: KtcMode; neutral?: number } = {},
  ) {}

  async getValue(playerId: string): Promise<number> {
    const idx = await this.ensureIndex();
    return idx.get(playerId) ?? this.neutral();
  }

  async getValues(playerIds: string[]): Promise<Map<string, number>> {
    const idx = await this.ensureIndex();
    return new Map(playerIds.map((id) => [id, idx.get(id) ?? this.neutral()]));
  }

  private neutral(): number {
    // Players outside KTC's ranked set are genuinely low-value; 0 by default.
    return this.opts.neutral ?? 0;
  }

  private async ensureIndex(): Promise<Map<string, number>> {
    if (this.index) return this.index;
    if (!this.building) this.building = this.build();
    this.index = await this.building;
    return this.index;
  }

  private async build(): Promise<Map<string, number>> {
    const field = (this.opts.mode ?? "sf") === "oqb" ? "oqb_value" : "sf_value";
    const ktcByKey = new Map<string, number>();
    for (const k of this.ktc) {
      if (k.position === "RDP") continue; // rookie draft picks, no Sleeper player
      const v = k[field];
      if (typeof v === "number") ktcByKey.set(nameKey(k.name, k.position), v);
    }

    const players = await this.loadPlayers();
    const idx = new Map<string, number>();
    for (const p of players) {
      const v = ktcByKey.get(nameKey(p.name, p.position));
      if (v !== undefined) idx.set(p.playerId, v);
    }
    return idx;
  }
}

/** Match key: normalized name + position (team codes are unreliable across sources). */
export function nameKey(name: string, position: string): string {
  return `${normalizeName(name)}|${position.toUpperCase()}`;
}

/** Lowercase, strip punctuation and a trailing generational suffix. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.'’,]/g, "")
    .replace(/\s+(jr|sr|ii|iii|iv)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Load a KTC snapshot file (the `{ players: [...] }` shape or a bare array). */
export async function loadKtcSnapshot(path: string): Promise<KtcPlayer[]> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as { players?: KtcPlayer[] } | KtcPlayer[];
  return Array.isArray(parsed) ? parsed : (parsed.players ?? []);
}
