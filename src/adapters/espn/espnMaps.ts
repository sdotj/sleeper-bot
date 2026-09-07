/**
 * ESPN uses numeric ids for positions and pro teams; these maps normalize them
 * to the same labels the rest of SleepBot uses (QB/RB/WR/TE/K/DEF and NFL team
 * abbreviations). Kept in one place so the adapter stays readable.
 */

/** ESPN `defaultPositionId` -> our position label. */
export const POSITION_BY_ID: Record<number, string> = {
  1: "QB",
  2: "RB",
  3: "WR",
  4: "TE",
  5: "K",
  16: "DEF",
};

export function positionLabel(defaultPositionId?: number): string {
  return (defaultPositionId != null && POSITION_BY_ID[defaultPositionId]) || "";
}

/** ESPN `proTeamId` -> NFL team abbreviation (0 = free agent). */
export const PRO_TEAM_BY_ID: Record<number, string> = {
  0: "FA",
  1: "ATL",
  2: "BUF",
  3: "CHI",
  4: "CIN",
  5: "CLE",
  6: "DAL",
  7: "DEN",
  8: "DET",
  9: "GB",
  10: "TEN",
  11: "IND",
  12: "KC",
  13: "LV",
  14: "LAR",
  15: "MIA",
  16: "MIN",
  17: "NE",
  18: "NO",
  19: "NYG",
  20: "NYJ",
  21: "PHI",
  22: "ARI",
  23: "PIT",
  24: "LAC",
  25: "SF",
  26: "SEA",
  27: "TB",
  28: "WSH",
  29: "CAR",
  30: "JAX",
  33: "BAL",
  34: "HOU",
};

export function proTeam(proTeamId?: number): string | null {
  if (proTeamId == null || proTeamId === 0) return null;
  return PRO_TEAM_BY_ID[proTeamId] ?? null;
}

/** ESPN lineup slots that are NOT starters (bench + IR). */
export const BENCH_SLOT = 20;
export const IR_SLOT = 21;

/** ESPN `lineupSlotId` -> slot label, for building the roster-positions list. */
export const LINEUP_SLOT_LABEL: Record<number, string> = {
  0: "QB",
  2: "RB",
  3: "RB/WR",
  4: "WR",
  5: "WR/TE",
  6: "TE",
  7: "OP", // superflex / offensive player
  16: "DEF",
  17: "K",
  18: "P",
  20: "BN",
  21: "IR",
  23: "FLEX",
};

/** ESPN injury status -> a short label (or null when active/unknown). */
export function injuryLabel(status?: string | null): string | null {
  if (!status || status === "ACTIVE" || status === "NORMAL") return null;
  return status; // e.g. QUESTIONABLE, OUT, INJURY_RESERVE, DOUBTFUL
}
